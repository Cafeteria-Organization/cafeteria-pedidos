<?php

namespace App\Services;

use App\Exceptions\ReglaNegocioException;
use App\Models\Combo;
use App\Models\MovimientoStock;
use App\Models\Pedido;
use App\Models\PedidoEstado;
use App\Models\Producto;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class PedidoService
{
    private const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I para evitar confusiones

    public function __construct(private StockService $stock)
    {
    }

    /**
     * HU-05: crea el pedido validando disponibilidad y stock, y genera el código de recojo.
     * Todo ocurre en una transacción: si algo falla, no queda nada a medias.
     *
     * @param array $productos [['id'=>1,'cantidad'=>2,'notas'=>'sin tomate'], ...]
     * @param array $combos    [['id'=>1,'cantidad'=>1], ...]
     */
    public function crear(User $user, array $productos, array $combos = []): Pedido
    {
        $notasProductos = $this->notas($productos);
        $notasCombos = $this->notas($combos);
        $productos = $this->agrupar($productos);
        $combos = $this->agrupar($combos);

        if (!$productos && !$combos) {
            throw new ReglaNegocioException('El pedido debe tener al menos un producto o combo', 422);
        }

        return DB::transaction(function () use ($user, $productos, $combos, $notasProductos, $notasCombos) {
            // 1) Cargar combos (con sus productos) y calcular consumo de stock por producto base
            $combosDb = [];
            $consumo = [];
            foreach ($productos as $id => $cant) {
                $consumo[$id] = ($consumo[$id] ?? 0) + $cant;
            }
            foreach ($combos as $id => $cant) {
                $combo = Combo::with('productos')->find($id);
                if (!$combo || !$combo->activo) {
                    throw new ReglaNegocioException("El combo #{$id} no está disponible");
                }
                $combosDb[$id] = $combo;
                foreach ($combo->productos as $p) {
                    $consumo[$p->id] = ($consumo[$p->id] ?? 0) + $cant * $p->pivot->cantidad;
                }
            }

            // 2) Bloquear los productos en orden (evita condiciones de carrera y deadlocks)
            ksort($consumo);
            $bloqueados = Producto::whereIn('id', array_keys($consumo))->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            foreach ($consumo as $id => $c) {
                if (!$bloqueados->has($id)) {
                    throw new ReglaNegocioException("El producto #{$id} ya no existe en el menú");
                }
            }

            // 3) Calcular líneas y total con precios actuales
            $lineas = [];
            $total = 0;
            foreach ($productos as $id => $cant) {
                $p = $bloqueados[$id];
                $sub = round($p->precio * $cant, 2);
                $total += $sub;
                $lineas[] = ['producto_id' => $id, 'combo_id' => null, 'nombre' => $p->nombre, 'notas' => $notasProductos[$id] ?? null,
                    'cantidad' => $cant, 'precio_unitario' => $p->precio, 'subtotal' => $sub];
            }
            foreach ($combosDb as $id => $combo) {
                $cant = $combos[$id];
                $sub = round($combo->precio * $cant, 2);
                $total += $sub;
                // Qué lleva el combo hoy (queda guardado aunque después se edite el combo).
                $contenido = $combo->productos->map(fn ($p) => ['nombre' => $p->nombre, 'cantidad' => (int) $p->pivot->cantidad])->values()->all();
                $lineas[] = ['producto_id' => null, 'combo_id' => $id, 'nombre' => $combo->nombre, 'notas' => $notasCombos[$id] ?? null,
                    'contenido' => $contenido, 'cantidad' => $cant, 'precio_unitario' => $combo->precio, 'subtotal' => $sub];
            }

            // 4) Crear pedido y descontar stock
            $pedido = Pedido::create([
                'user_id' => $user->id,
                'codigo' => $this->generarCodigo(),
                'estado' => Pedido::RECIBIDO,
                'total' => $total,
            ]);

            foreach ($consumo as $id => $c) {
                $this->stock->descontar($bloqueados[$id], $c, $pedido->id, $user->id);
            }

            $pedido->detalles()->createMany($lineas);
            $this->registrarEstado($pedido, Pedido::RECIBIDO, $user->id);

            return $pedido->load('detalles');
        });
    }

    /** HU-07: cambio de estado en orden Recibido → En preparación → Para entregar. */
    public function cambiarEstado(int $pedidoId, string $nuevo, User $actor): Pedido
    {
        return DB::transaction(function () use ($pedidoId, $nuevo, $actor) {
            $pedido = Pedido::lockForUpdate()->findOrFail($pedidoId);
            $permitidos = Pedido::TRANSICIONES[$pedido->estado] ?? [];

            if (!in_array($nuevo, $permitidos, true)) {
                throw new ReglaNegocioException(
                    "No se puede pasar de '{$pedido->estado}' a '{$nuevo}'", 409
                );
            }

            $pedido->update(['estado' => $nuevo]);
            $this->registrarEstado($pedido, $nuevo, $actor->id);

            return $pedido->fresh();
        });
    }

    /** HU-08: entrega verificando el código. Solo pedidos 'Para entregar'. */
    public function entregar(string $codigo, User $actor): Pedido
    {
        $codigo = strtoupper(trim($codigo));

        return DB::transaction(function () use ($codigo, $actor) {
            $pedido = Pedido::where('codigo', $codigo)->lockForUpdate()->first();

            // Los códigos de pedidos entregados o cancelados ya se borraron.
            if (!$pedido) {
                throw new ReglaNegocioException('Código inválido o ya usado', 404);
            }
            if ($pedido->estado !== Pedido::PARA_ENTREGAR) {
                throw new ReglaNegocioException("El pedido aún no está listo (estado: {$pedido->estado})", 409);
            }

            // El código ya cumplió su función: se borra (no se guarda en el historial).
            $pedido->update([
                'estado' => Pedido::COMPLETADO,
                'codigo' => null,
                'entregado_por' => $actor->id,
                'entregado_at' => now(),
            ]);
            $this->registrarEstado($pedido, Pedido::COMPLETADO, $actor->id);

            return $pedido->fresh();
        });
    }

    /**
     * HU-10: cancela solo en estado inicial y devuelve el stock EXACTO descontado
     * (se revierten los movimientos del pedido, también para combos).
     */
    public function cancelar(int $pedidoId, User $actor): Pedido
    {
        return DB::transaction(function () use ($pedidoId, $actor) {
            $pedido = Pedido::lockForUpdate()->findOrFail($pedidoId);

            if ($actor->rol === User::ROL_ESTUDIANTE && (int) $pedido->user_id !== (int) $actor->id) {
                throw new ReglaNegocioException('Pedido no encontrado', 404);
            }
            if ($pedido->estado !== Pedido::RECIBIDO) {
                throw new ReglaNegocioException(
                    "Solo se pueden cancelar pedidos en estado 'Recibido' (estado actual: {$pedido->estado})", 400
                );
            }

            $descontado = MovimientoStock::where('pedido_id', $pedido->id)->where('tipo', 'pedido')
                ->select('producto_id', DB::raw('SUM(-cantidad) as total'))
                ->groupBy('producto_id')->orderBy('producto_id')->get();

            foreach ($descontado as $fila) {
                $producto = Producto::withTrashed()->lockForUpdate()->find($fila->producto_id);
                $this->stock->devolver($producto, (int) $fila->total, $pedido->id, $actor->id);
            }

            $pedido->update(['estado' => Pedido::CANCELADO, 'codigo' => null]);
            $this->registrarEstado($pedido, Pedido::CANCELADO, $actor->id);

            return $pedido->fresh();
        });
    }

    /** HU-11: "volver a pedir" con los mismos ítems (se revalida stock y disponibilidad). */
    public function repetir(Pedido $original, User $user): Pedido
    {
        $productos = [];
        $combos = [];
        foreach ($original->detalles as $d) {
            if ($d->producto_id) {
                $productos[] = ['id' => $d->producto_id, 'cantidad' => $d->cantidad, 'notas' => $d->notas];
            } elseif ($d->combo_id) {
                $combos[] = ['id' => $d->combo_id, 'cantidad' => $d->cantidad, 'notas' => $d->notas];
            }
        }
        return $this->crear($user, $productos, $combos);
    }

    private function registrarEstado(Pedido $pedido, string $estado, ?int $userId): void
    {
        PedidoEstado::create(['pedido_id' => $pedido->id, 'estado' => $estado, 'user_id' => $userId]);
    }

    /** Código de recojo único entre los pedidos activos (5 caracteres). */
    private function generarCodigo(): string
    {
        do {
            $codigo = '';
            for ($i = 0; $i < 5; $i++) {
                $codigo .= self::ALFABETO[random_int(0, strlen(self::ALFABETO) - 1)];
            }
        } while (Pedido::where('codigo', $codigo)->exists());

        return $codigo;
    }

    /** Une líneas repetidas: [['id'=>1,'cantidad'=>2],['id'=>1,'cantidad'=>1]] => [1 => 3] */
    private function agrupar(array $lineas): array
    {
        $out = [];
        foreach ($lineas as $l) {
            $id = (int) $l['id'];
            $out[$id] = ($out[$id] ?? 0) + (int) $l['cantidad'];
        }
        return $out;
    }

    /** Notas por producto o combo ("sin tomate"); si una misma línea viene repetida se juntan. */
    private function notas(array $lineas): array
    {
        $out = [];
        foreach ($lineas as $l) {
            $nota = trim(preg_replace('/\s+/', ' ', (string) ($l['notas'] ?? '')));
            if ($nota === '') {
                continue;
            }
            $id = (int) $l['id'];
            $out[$id] = mb_substr(isset($out[$id]) ? $out[$id] . ' · ' . $nota : $nota, 0, 200);
        }
        return $out;
    }
}
