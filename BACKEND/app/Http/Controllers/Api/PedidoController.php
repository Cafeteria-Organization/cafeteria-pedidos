<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Combo;
use App\Models\Pedido;
use App\Models\DetallePedido;
use App\Models\Favorito;
use App\Models\Feedback;
use App\Models\HorarioAtencion;
use App\Models\Producto;
use App\Models\Usuario;
use App\Services\TiempoEspera;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use App\Models\Notificacion;

class PedidoController extends Controller
{
    public function store(Request $request)
    {
        // 1. Validar lo que manda el carrito: productos sueltos y/o combos (HU-21)
        $request->validate([
            'productos' => 'required_without:combos|array',
            'productos.*.id_producto' => 'required|integer|exists:PRODUCTO,id_producto',
            'productos.*.cantidad' => 'required|integer|min:1',
            'productos.*.notas' => 'nullable|string|max:255',
            'combos' => 'required_without:productos|array',
            'combos.*.id_combo' => 'required|integer|exists:COMBO,id_combo',
            'combos.*.cantidad' => 'required|integer|min:1',
            'combos.*.notas' => 'nullable|string|max:200'
        ]);

        $productos = $request->input('productos') ?: [];
        $combos = $request->input('combos') ?: [];
        if (!count($productos) && !count($combos)) {
            return response()->json(['success' => false, 'message' => 'Tu pedido está vacío.'], 422);
        }

        // HU-23: fuera del horario configurado no se reciben pedidos
        $horario = HorarioAtencion::estadoActual();
        if (!$horario['abierto']) {
            return response()->json(['success' => false, 'cerrado' => true, 'message' => $horario['mensaje']], 403);
        }

        try {
            DB::beginTransaction();

            // 2. Validar disponibilidad y stock de todo (bloqueando las filas mientras dura la compra)
            [$lineas, $error] = $this->armarLineas($productos, $combos, true);
            if ($error) {
                DB::rollBack();
                return response()->json(['success' => false, 'message' => $error], 400);
            }

            // HU-11: tiempo estimado según la cola y lo que tarda cada producto
            $unidades = [];
            foreach ($lineas as $l) {
                $id = $l['producto']->id_producto;
                $unidades[$id] = ($unidades[$id] ?? 0) + $l['cantidad'];
            }
            $estimado = TiempoEspera::calcular($unidades);

            // 3. Crear la cabecera del pedido
            // $request->user() obtiene automáticamente al usuario autenticado por el Token
            $pedido = Pedido::create([
                'id_usuario' => $request->user()->id_usuario,
                'estado' => 'Pendiente',
                'tiempo_estimado' => $estimado['tiempo_estimado_minutos'],
                'codigo_verificacion' => strtoupper(Str::random(6)) // Código de 6 letras/números
            ]);

            // HU-15: el trigger trg_auditoria_stock guarda este motivo y quién hizo la compra
            DB::statement("SET @motivo_stock = ?, @usuario_stock = ?", ['Venta (pedido #' . $pedido->id_pedido . ')', $request->user()->id_usuario]);

            // 4. Guardar cada línea y descontar el stock
            foreach ($lineas as $l) {
                DetallePedido::create([
                    'id_pedido' => $pedido->id_pedido,
                    'id_producto' => $l['producto']->id_producto,
                    'cantidad' => $l['cantidad'],
                    'precio_unitario' => $l['precio_unitario'], // precio vigente (oferta o combo) guardado como histórico
                    'notas_personalizacion' => $l['notas'],
                    'id_combo' => $l['id_combo']
                ]);
                $l['producto']->decrement('stock_actual', $l['cantidad']);
            }

            // 5. Llamar al Procedimiento Almacenado de MySQL para calcular el total
            DB::statement("CALL pr_calcular_total(?)", [$pedido->id_pedido]);

            // 6. Recargar el pedido para obtener el total actualizado por el Procedimiento
            $pedido->refresh();

            DB::commit(); // Confirmar que todo salió bien y guardar en BD
            DB::statement("SET @motivo_stock = NULL, @usuario_stock = NULL");

            return response()->json([
                'success' => true,
                'message' => 'Pedido realizado con éxito',
                'data' => [
                    'id_pedido' => $pedido->id_pedido,
                    'total_pagar' => $pedido->total,
                    'codigo_entrega' => $pedido->codigo_verificacion,
                    'estado' => $pedido->estado,
                    'tiempo_estimado' => $pedido->tiempo_estimado,
                    'hora_estimada' => $estimado['hora_estimada']
                ]
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack(); // Si hay cualquier error en el código, deshacemos todo
            DB::statement("SET @motivo_stock = NULL, @usuario_stock = NULL");
            return response()->json([
                'success' => false,
                'message' => 'Ocurrió un error al procesar el pedido.',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    // Convierte el carrito en líneas de DETALLE_PEDIDO validando disponibilidad y stock.
    // Devuelve [lineas, null] o [null, "mensaje de error"].
    private function armarLineas(array $productos, array $combos, bool $bloquear = false): array
    {
        // Unidades que hacen falta de cada producto (sueltos + los que vienen en combos)
        $necesario = [];
        foreach ($productos as $item) {
            $necesario[$item['id_producto']] = ($necesario[$item['id_producto']] ?? 0) + (int) $item['cantidad'];
        }

        $combosBD = $combos
            ? Combo::with('productos')->whereIn('id_combo', array_column($combos, 'id_combo'))->get()->keyBy('id_combo')
            : collect();
        foreach ($combos as $item) {
            $combo = $combosBD->get($item['id_combo']);
            if (!$combo || !$combo->activo || $combo->productos->isEmpty()) {
                return [null, 'El combo "' . ($combo->nombre ?? '#' . $item['id_combo']) . '" ya no está disponible.'];
            }
            foreach ($combo->productos as $p) {
                $necesario[$p->id_producto] = ($necesario[$p->id_producto] ?? 0) + (int) $p->pivot->cantidad * (int) $item['cantidad'];
            }
        }

        $consulta = Producto::whereIn('id_producto', array_keys($necesario));
        if ($bloquear) $consulta->lockForUpdate();
        $prods = $consulta->get()->keyBy('id_producto');

        foreach ($necesario as $id => $cantidad) {
            $p = $prods->get($id);
            if (!$p) return [null, 'Uno de los productos ya no existe en el menú.'];
            if ($p->estado !== 'Disponible') {
                return [null, "{$p->nombre} está agotado y ya no se puede pedir."];
            }
            if ($p->stock_actual < $cantidad) {
                return [null, "Stock insuficiente para: {$p->nombre}. Quedan {$p->stock_actual} unidades."];
            }
        }

        $lineas = [];
        foreach ($productos as $item) {
            $p = $prods->get($item['id_producto']);
            $lineas[] = [
                'producto' => $p,
                'cantidad' => (int) $item['cantidad'],
                'precio_unitario' => $p->precioVigente(),
                'notas' => $item['notas'] ?? null,
                'id_combo' => null,
            ];
        }
        foreach ($combos as $item) {
            $combo = $combosBD->get($item['id_combo']);
            $nota = 'Combo: ' . $combo->nombre . (!empty($item['notas']) ? ' · ' . $item['notas'] : '');
            foreach ($this->repartirPrecioCombo($combo) as [$idProducto, $cantidad, $precio]) {
                $lineas[] = [
                    'producto' => $prods->get($idProducto),
                    'cantidad' => $cantidad * (int) $item['cantidad'],
                    'precio_unitario' => $precio,
                    'notas' => mb_substr($nota, 0, 255),
                    'id_combo' => $combo->id_combo,
                ];
            }
        }

        return [$lineas, null];
    }

    // HU-21: reparte el precio especial del combo entre sus productos (proporcional a su precio
    // normal) para que la suma del detalle dé exactamente el precio del combo.
    // Devuelve [[id_producto, cantidad, precio_unitario], ...]
    private function repartirPrecioCombo(Combo $combo): array
    {
        $precioCombo = round((float) $combo->precio, 2);
        $normal = 0;
        foreach ($combo->productos as $p) $normal += (float) $p->precio * (int) $p->pivot->cantidad;

        $partes = [];
        $suma = 0;
        $n = max(1, $combo->productos->count());
        foreach ($combo->productos as $p) {
            $q = max(1, (int) $p->pivot->cantidad);
            $u = $normal > 0 ? round((float) $p->precio * $precioCombo / $normal, 2) : round($precioCombo / $n / $q, 2);
            $partes[] = [$p->id_producto, $q, $u];
            $suma += $u * $q;
        }

        // Los centavos que sobran o faltan por redondeo van a una unidad suelta
        $diferencia = round($precioCombo - $suma, 2);
        if (abs($diferencia) >= 0.01) {
            $i = null;
            foreach ($partes as $k => $parte) { if ($parte[1] === 1) { $i = $k; break; } }
            if ($i !== null) {
                $partes[$i][2] = round($partes[$i][2] + $diferencia, 2);
            } else {
                [$id, $q, $u] = $partes[0];
                $partes[0] = [$id, $q - 1, $u];
                $partes[] = [$id, 1, round($u + $diferencia, 2)];
            }
        }
        return $partes;
    }


    // HU-13 y HU-18: Recepción organizada de pedidos con filtrado opcional
    public function indexCocina(Request $request)
    {
        // 1. Iniciamos la consulta base
        $query = Pedido::with('detalles.producto.categorias')
            ->whereIn('estado', ['Pendiente', 'Preparando', 'Listo'])
            ->orderBy('fecha_pedido', 'asc');

        // 2. HU-18: Si el frontend envía un ID de categoría para filtrar (?categoria=1)
        if ($request->has('categoria')) {
            $categoria_id = $request->categoria;
            // Filtramos solo los pedidos que contengan productos de esa categoría
            $query->whereHas('detalles.producto.categorias', function($q) use ($categoria_id) {
                $q->where('CATEGORIA.id_categoria', $categoria_id);
            });
        }

        return response()->json([
            'success' => true,
            'data' => $query->get()
        ]);
    }

    // HU-14 y HU-05: Actualizar estado (cocina) y Rechazar
    public function updateEstado(Request $request, $id)
    {
        $request->validate([
            'estado' => 'required|in:Preparando,Listo,Entregado,Cancelado'
        ]);

        // HU-17: "Entregado" solo se marca validando el código (POST /pedidos/{id}/entregar)
        if ($request->estado === 'Entregado') {
            return response()->json([
                'success' => false,
                'message' => 'Para entregar un pedido debes validar su código de verificación.'
            ], 422);
        }

        $pedido = Pedido::with('detalles')->find($id);

        if (!$pedido) {
            return response()->json(['success' => false, 'message' => 'Pedido no encontrado'], 404);
        }

        try {
            if ($request->estado === 'Cancelado') {
                // El procedimiento de MySQL solo deja cancelar mientras no esté "Listo".
                DB::beginTransaction();
                DB::statement("CALL pr_cancelar_pedido(?)", [$id]);

                // Si MySQL no lanzó error, devolvemos el stock a la cafetería
                // HU-15: motivo y usuario para el historial de stock
                DB::statement("SET @motivo_stock = ?, @usuario_stock = ?", ['Devolución por cancelación (pedido #' . $pedido->id_pedido . ')', $request->user()->id_usuario]);
                foreach ($pedido->detalles as $detalle) {
                    Producto::where('id_producto', $detalle->id_producto)
                            ->increment('stock_actual', $detalle->cantidad);
                }
                DB::statement("SET @motivo_stock = NULL, @usuario_stock = NULL");

                // Avisar al cliente que la cocina rechazó su pedido
                Notificacion::create([
                    'id_usuario' => $pedido->id_usuario,
                    'titulo' => 'Pedido rechazado',
                    'mensaje' => "La cocina no pudo aceptar tu pedido #{$pedido->id_pedido} (código {$pedido->codigo_verificacion}). No se te cobrará nada; puedes hacer otro pedido."
                ]);
                DB::commit();
            } else {
                // HU-14: Actualización normal de estado (Preparando, Listo)
                $pedido->estado = $request->estado;
                $pedido->save();
                // HU-06: Disparar notificación si el estado cambia a Listo
                if ($request->estado === 'Listo') {
                    Notificacion::create([
                        'id_usuario' => $pedido->id_usuario,
                        'titulo' => '¡Tu pedido está listo!',
                        'mensaje' => "Tu pedido con código {$pedido->codigo_verificacion} ya puede ser recogido en cafetería."
                    ]);
                }
            }

            // Nota: ¡El Trigger trg_auditoria_pedido guardará esto en el historial automáticamente!

            return response()->json([
                'success' => true,
                'message' => 'El estado del pedido se actualizó a: ' . $request->estado
            ]);

        } catch (\Exception $e) {
            // Si MySQL bloquea la cancelación, capturamos el error aquí
            if (DB::transactionLevel() > 0) DB::rollBack();
            DB::statement("SET @motivo_stock = NULL, @usuario_stock = NULL");
            return response()->json([
                'success' => false,
                'message' => 'No se pudo actualizar el estado.',
                'error' => $e->getMessage()
            ], 400);
        }
    }

    // HU-17: Validación segura de entrega con código único
    public function entregarPedido(Request $request, $id)
    {
        $request->validate([
            'codigo_verificacion' => 'required|string'
        ]);

        $pedido = Pedido::find($id);

        if (!$pedido) {
            return response()->json(['success' => false, 'message' => 'Pedido no encontrado'], 404);
        }

        if ($pedido->estado !== 'Listo') {
            return response()->json(['success' => false, 'message' => 'El pedido aún no está listo para entrega'], 400);
        }

        // Verificamos que el código coincida (ignorando mayúsculas/minúsculas)
        if (strtoupper($pedido->codigo_verificacion) !== strtoupper($request->codigo_verificacion)) {
            return response()->json(['success' => false, 'message' => 'Código de verificación incorrecto'], 403);
        }

        // Si es correcto, lo entregamos
        $pedido->estado = 'Entregado';
        $pedido->save();

        // HU-09: se le pide al cliente que califique su pedido
        Notificacion::create([
            'id_usuario' => $pedido->id_usuario,
            'titulo' => '¿Qué tal estuvo tu pedido?',
            'mensaje' => "Califica tu pedido #{$pedido->id_pedido} de 1 a 5 estrellas en Mis pedidos. ¡Tu opinión nos ayuda a mejorar!"
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Código validado. Pedido entregado exitosamente.'
        ]);
    }

    // HU-16: Notificación de retrasos en la preparación (actualiza el tiempo estimado)
    public function notificarRetraso(Request $request, $id)
    {
        $request->validate([
            'minutos' => 'nullable|integer|min:1|max:120'
        ]);
        $minutos = (int) ($request->minutos ?? 10);

        $pedido = Pedido::find($id);

        if (!$pedido) {
            return response()->json(['success' => false, 'message' => 'Pedido no encontrado'], 404);
        }

        if (!in_array($pedido->estado, ['Pendiente', 'Preparando'])) {
            return response()->json(['success' => false, 'message' => 'Solo se puede avisar retraso de pedidos pendientes o en preparación'], 400);
        }

        // tiempo_estimado = minutos desde que se hizo el pedido hasta que estará listo.
        // Nueva hora = (la hora estimada anterior, o ahora si ya pasó) + los minutos de retraso.
        // El cálculo se hace en MySQL para usar la misma hora que fecha_pedido.
        DB::update("UPDATE PEDIDO
                       SET tiempo_estimado = GREATEST(COALESCE(tiempo_estimado, 0), TIMESTAMPDIFF(MINUTE, fecha_pedido, NOW())) + ?
                     WHERE id_pedido = ?", [$minutos, $pedido->id_pedido]);

        $pedido = Pedido::selectRaw("PEDIDO.*, DATE_FORMAT(DATE_ADD(fecha_pedido, INTERVAL tiempo_estimado MINUTE), '%H:%i') AS hora_estimada")
            ->find($pedido->id_pedido);

        // Creamos la notificación para el usuario
        Notificacion::create([
            'id_usuario' => $pedido->id_usuario,
            'titulo' => 'Retraso en tu pedido',
            'mensaje' => "Tu pedido con código {$pedido->codigo_verificacion} tomará unos {$minutos} minutos más de lo esperado debido a la alta demanda. Nueva hora estimada: {$pedido->hora_estimada}. ¡Gracias por tu paciencia!"
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Alerta de retraso enviada al cliente exitosamente.',
            'data' => [
                'id_pedido' => $pedido->id_pedido,
                'minutos_retraso' => $minutos,
                'tiempo_estimado' => $pedido->tiempo_estimado,
                'hora_estimada' => $pedido->hora_estimada
            ]
        ]);
    }

    // HU-06: Ver notificaciones del usuario
    public function misNotificaciones(Request $request)
    {
        $notificaciones = Notificacion::where('id_usuario', $request->user()->id_usuario)
            ->orderBy('leida', 'asc')
            ->orderBy('fecha_envio', 'desc')
            ->get();

        return response()->json(['success' => true, 'data' => $notificaciones]);
    }

    // HU-06: Marcar una notificación como leída (solo las propias)
    public function marcarLeida(Request $request, $id_notificacion)
    {
        $notificacion = Notificacion::where('id_notificacion', $id_notificacion)
            ->where('id_usuario', $request->user()->id_usuario)
            ->first();
        if ($notificacion) {
            $notificacion->leida = true;
            $notificacion->save();
        }
        return response()->json(['success' => true]);
    }

    // HU-08: Historial de compras del estudiante/docente (con su calificación, HU-09)
    public function miHistorial(Request $request)
    {
        $historial = Pedido::with('detalles.producto', 'feedback')
            ->where('id_usuario', $request->user()->id_usuario)
            ->orderBy('fecha_pedido', 'desc')
            ->get();

        return response()->json(['success' => true, 'data' => $historial]);
    }

    // ------------------------------------------------------------------
    // Iteración 4
    // ------------------------------------------------------------------

    // HU-07: el cliente cancela su propio pedido mientras no esté "Listo"
    public function cancelarMiPedido(Request $request, $id)
    {
        $pedido = Pedido::with('detalles')->where('id_pedido', $id)->where('id_usuario', $request->user()->id_usuario)->first();
        if (!$pedido) return response()->json(['success' => false, 'message' => 'Pedido no encontrado'], 404);

        if (!in_array($pedido->estado, ['Pendiente', 'Preparando'])) {
            $motivo = $pedido->estado === 'Listo' ? 'ya está listo para recoger' : 'ya está ' . mb_strtolower($pedido->estado);
            return response()->json(['success' => false, 'message' => "Ya no se puede cancelar: el pedido {$motivo}."], 400);
        }
        $estadoAnterior = $pedido->estado;

        try {
            DB::beginTransaction();
            // El procedimiento cambia el estado; el trigger trg_auditoria_pedido lo deja en HISTORIAL_PEDIDO
            DB::statement("CALL pr_cancelar_pedido(?)", [$id]);

            // Devolver stock a los productos (HU-15: con motivo y usuario)
            DB::statement("SET @motivo_stock = ?, @usuario_stock = ?", ['Cancelado por el cliente (pedido #' . $pedido->id_pedido . ')', $request->user()->id_usuario]);
            foreach ($pedido->detalles as $detalle) {
                Producto::where('id_producto', $detalle->id_producto)->increment('stock_actual', $detalle->cantidad);
            }
            DB::statement("SET @motivo_stock = NULL, @usuario_stock = NULL");

            // Avisar a cocina (Admin y Empleados)
            $quien = $request->user()->nombre;
            $etapa = $estadoAnterior === 'Preparando' ? 'ya estaba en preparación' : 'estaba pendiente';
            $this->avisarAlPersonal('Pedido cancelado',
                "{$quien} canceló el pedido #{$pedido->id_pedido} ({$etapa}). Ya no hace falta prepararlo; el stock volvió al menú.");

            DB::commit();
            return response()->json(['success' => true, 'message' => 'Pedido cancelado correctamente.']);
        } catch (\Exception $e) {
            DB::rollBack();
            DB::statement("SET @motivo_stock = NULL, @usuario_stock = NULL");
            return response()->json(['success' => false, 'message' => 'No se pudo cancelar el pedido.', 'error' => $e->getMessage()], 400);
        }
    }

    private function avisarAlPersonal(string $titulo, string $mensaje): void
    {
        $personal = Usuario::whereIn('id_rol', [1, 2])->pluck('id_usuario');
        foreach ($personal as $idUsuario) {
            Notificacion::create(['id_usuario' => $idUsuario, 'titulo' => $titulo, 'mensaje' => mb_substr($mensaje, 0, 255)]);
        }
    }

    // HU-11: tiempo de espera estimado ANTES de confirmar (ruta pública).
    // GET /pedidos/tiempo-espera?productos=1x2,4x1&combos=3x1   (id x cantidad)
    public function tiempoEspera(Request $request)
    {
        $unidades = [];
        foreach ($this->leerLista($request->query('productos')) as [$id, $cantidad]) {
            $unidades[$id] = ($unidades[$id] ?? 0) + $cantidad;
        }

        $combos = $this->leerLista($request->query('combos'));
        if ($combos) {
            $bd = Combo::with('productos')->whereIn('id_combo', array_column($combos, 0))->get()->keyBy('id_combo');
            foreach ($combos as [$id, $cantidad]) {
                $combo = $bd->get($id);
                if (!$combo) continue;
                foreach ($combo->productos as $p) {
                    $unidades[$p->id_producto] = ($unidades[$p->id_producto] ?? 0) + (int) $p->pivot->cantidad * $cantidad;
                }
            }
        }

        $existentes = Producto::whereIn('id_producto', array_keys($unidades))->pluck('id_producto')->all();
        $unidades = array_intersect_key($unidades, array_flip($existentes));

        return response()->json(['success' => true] + TiempoEspera::calcular($unidades));
    }

    // "1x2,4x1" → [[1, 2], [4, 1]]
    private function leerLista($texto): array
    {
        if (!is_string($texto) || $texto === '') return [];
        preg_match_all('/(\d+)x(\d+)/', $texto, $m, PREG_SET_ORDER);
        $lista = [];
        foreach (array_slice($m, 0, 50) as $par) {
            $lista[] = [(int) $par[1], min(50, max(1, (int) $par[2]))];
        }
        return $lista;
    }

    // HU-12: repetir un pedido anterior → devuelve sus productos con precio y
    // disponibilidad de HOY para que el cliente los cargue a su carrito y los
    // revise antes de confirmar (no crea el pedido directamente).
    public function repetirPedido(Request $request, $id)
    {
        $pedidoViejo = Pedido::with('detalles.producto.categorias')
            ->where('id_pedido', $id)
            ->where('id_usuario', $request->user()->id_usuario)
            ->first();
        if (!$pedidoViejo) return response()->json(['success' => false, 'message' => 'Pedido no encontrado'], 404);

        $items = [];
        $noDisponibles = [];

        // Productos sueltos
        foreach ($pedidoViejo->detalles->whereNull('id_combo') as $det) {
            $p = $det->producto;
            if (!$p) { $noDisponibles[] = ['nombre' => 'Producto #' . $det->id_producto, 'motivo' => 'Ya no existe en el menú']; continue; }
            if ($p->estado !== 'Disponible' || $p->stock_actual < 1) { $noDisponibles[] = ['nombre' => $p->nombre, 'motivo' => 'Agotado']; continue; }
            $cantidad = min((int) $det->cantidad, (int) $p->stock_actual);
            $items[] = [
                'tipo' => 'producto',
                'id_producto' => $p->id_producto,
                'nombre' => $p->nombre,
                'categoria' => optional($p->categorias->first())->nombre,
                'cantidad' => $cantidad,
                'cantidad_anterior' => (int) $det->cantidad,
                'precio' => $p->precioVigente(),
                'precio_anterior' => (float) $det->precio_unitario,
                'stock' => (int) $p->stock_actual,
                'notas' => $det->notas_personalizacion,
            ];
        }

        // Combos (las líneas de un mismo combo se vuelven a juntar)
        foreach ($pedidoViejo->detalles->whereNotNull('id_combo')->groupBy('id_combo') as $idCombo => $dets) {
            $combo = Combo::with('productos')->find($idCombo);
            if (!$combo) { $noDisponibles[] = ['nombre' => 'Combo #' . $idCombo, 'motivo' => 'Ya no existe']; continue; }
            $info = $combo->resumen();
            $porCombo = max(1, array_sum(array_column($info['productos']->all(), 'cantidad')));
            $veces = max(1, (int) round($dets->sum('cantidad') / $porCombo));
            if (!$info['disponible'] || $info['max_unidades'] < 1) {
                $noDisponibles[] = ['nombre' => $combo->nombre, 'motivo' => $combo->activo ? 'Algún producto del combo está agotado' : 'El combo ya no se ofrece'];
                continue;
            }
            $nota = (string) $dets->first()->notas_personalizacion;
            $prefijo = 'Combo: ' . $combo->nombre;
            $nota = str_starts_with($nota, $prefijo) ? ltrim(mb_substr($nota, mb_strlen($prefijo)), ' ·') : '';
            $items[] = [
                'tipo' => 'combo',
                'id_combo' => $combo->id_combo,
                'nombre' => $combo->nombre,
                'cantidad' => min($veces, $info['max_unidades']),
                'cantidad_anterior' => $veces,
                'precio' => $info['precio'],
                'precio_anterior' => round($dets->sum(fn ($d) => $d->cantidad * $d->precio_unitario) / $veces, 2),
                'stock' => $info['max_unidades'],
                'notas' => $nota !== '' ? $nota : null,
                'productos' => $info['productos'],
            ];
        }

        return response()->json([
            'success' => true,
            'message' => count($items) ? 'Productos listos para agregar a tu pedido.' : 'Ninguno de los productos de ese pedido está disponible hoy.',
            'data' => ['items' => $items, 'no_disponibles' => $noDisponibles]
        ]);
    }

    // HU-10: Agregar o quitar de Favoritos
    public function toggleFavorito(Request $request, $id_producto)
    {
        $producto = Producto::find($id_producto);
        if (!$producto) return response()->json(['success' => false, 'message' => 'Producto no encontrado'], 404);

        $existe = Favorito::where('id_usuario', $request->user()->id_usuario)
                          ->where('id_producto', $id_producto)->first();
        if ($existe) {
            $existe->delete();
            return response()->json(['success' => true, 'favorito' => false, 'message' => 'Eliminado de favoritos']);
        } else {
            Favorito::create(['id_usuario' => $request->user()->id_usuario, 'id_producto' => $id_producto]);
            return response()->json(['success' => true, 'favorito' => true, 'message' => 'Agregado a favoritos']);
        }
    }

    // HU-10: Listar mis Favoritos
    public function misFavoritos(Request $request)
    {
        $favoritos = Favorito::with('producto.categorias')
            ->where('id_usuario', $request->user()->id_usuario)
            ->orderBy('fecha_agregado', 'desc')
            ->get();
        return response()->json(['success' => true, 'data' => $favoritos]);
    }

    // ------------------------------------------------------------------
    // Iteración 5
    // ------------------------------------------------------------------

    // HU-09: el cliente califica su pedido (1 a 5 estrellas + comentario), una sola vez y ya recogido
    public function enviarFeedback(Request $request, $id_pedido)
    {
        $request->validate([
            'calificacion' => 'required|integer|min:1|max:5',
            'comentario' => 'nullable|string|max:500'
        ], [
            'calificacion.required' => 'Elige de 1 a 5 estrellas.',
            'calificacion.integer' => 'La calificación debe ser de 1 a 5 estrellas.',
            'calificacion.min' => 'La calificación debe ser de 1 a 5 estrellas.',
            'calificacion.max' => 'La calificación debe ser de 1 a 5 estrellas.',
            'comentario.max' => 'El comentario puede tener como máximo 500 caracteres.',
        ]);

        $pedido = Pedido::where('id_pedido', $id_pedido)->where('id_usuario', $request->user()->id_usuario)->first();
        if (!$pedido) return response()->json(['success' => false, 'message' => 'Pedido no encontrado'], 404);

        if ($pedido->estado !== 'Entregado') {
            return response()->json(['success' => false, 'message' => 'Solo puedes calificar un pedido después de recogerlo.'], 400);
        }
        if (Feedback::where('id_pedido', $pedido->id_pedido)->exists()) {
            return response()->json(['success' => false, 'message' => 'Ya calificaste este pedido.'], 409);
        }

        $feedback = Feedback::create([
            'id_usuario' => $request->user()->id_usuario,
            'id_pedido' => $pedido->id_pedido,
            'calificacion' => (int) $request->calificacion,
            'comentario' => trim((string) $request->comentario) !== '' ? trim($request->comentario) : null,
        ]);

        return response()->json(['success' => true, 'message' => '¡Gracias por tu calificación!', 'data' => $feedback->fresh()], 201);
    }
}
