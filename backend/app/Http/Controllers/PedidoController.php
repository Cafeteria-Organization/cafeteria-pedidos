<?php

namespace App\Http\Controllers;

use App\Models\Pedido;
use App\Services\PedidoService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PedidoController extends Controller
{
    public function __construct(private PedidoService $servicio)
    {
    }

    // ---------------------------------------------------------------- Estudiantes / docentes

    /** HU-05: el pedido siempre pertenece al usuario autenticado (no se acepta user_id). */
    public function store(Request $request)
    {
        $max = config('cafeteria.max_cantidad_por_linea');

        $datos = $request->validate([
            'productos' => 'required_without:combos|array|max:30',
            'productos.*.id' => ['required', 'integer', Rule::exists('productos', 'id')->whereNull('deleted_at')],
            'productos.*.cantidad' => "required|integer|min:1|max:$max",
            'productos.*.notas' => 'nullable|string|max:200',
            'combos' => 'required_without:productos|array|max:10',
            'combos.*.id' => ['required', 'integer', Rule::exists('combos', 'id')->whereNull('deleted_at')],
            'combos.*.cantidad' => "required|integer|min:1|max:$max",
            'combos.*.notas' => 'nullable|string|max:200',
        ]);

        $pedido = $this->servicio->crear($request->user(), $datos['productos'] ?? [], $datos['combos'] ?? []);

        return response()->json([
            'mensaje' => 'Pedido creado. Presenta tu código al recoger.',
            'codigo' => $pedido->codigo,
            'total' => $pedido->total,
            'pedido' => $pedido,
        ], 201);
    }

    /** HU-10: cancelar (solo en estado 'Recibido'; el estudiante solo los suyos). */
    public function cancelar(Request $request, int $id)
    {
        $pedido = $this->servicio->cancelar($id, $request->user());

        return response()->json(['mensaje' => 'Pedido cancelado y stock devuelto', 'pedido' => $pedido]);
    }

    /** HU-11: historial propio (más recientes primero). Filtro opcional ?estado=Completado */
    public function misPedidos(Request $request)
    {
        $q = Pedido::with('detalles')->where('user_id', $request->user()->id);

        if ($request->filled('estado')) {
            $q->where('estado', $request->query('estado'));
        }

        return response()->json($q->orderByDesc('created_at')->orderByDesc('id')->get());
    }

    /** Ruta histórica de la guía: /estudiantes/{id}/historial (solo completados, solo el dueño o el personal). */
    public function historial(Request $request, int $id)
    {
        $user = $request->user();
        if ($user->id !== $id && !$user->esPersonal()) {
            return response()->json(['mensaje' => 'No tienes permiso para ver este historial'], 403);
        }

        return response()->json(
            Pedido::with('detalles')->where('user_id', $id)->where('estado', Pedido::COMPLETADO)
                ->orderByDesc('created_at')->orderByDesc('id')->get()
        );
    }

    /** HU-11: volver a pedir lo mismo. */
    public function repetir(Request $request, int $id)
    {
        $original = Pedido::with('detalles')->where('user_id', $request->user()->id)->findOrFail($id);
        $pedido = $this->servicio->repetir($original, $request->user());

        return response()->json([
            'mensaje' => 'Pedido creado. Presenta tu código al recoger.',
            'codigo' => $pedido->codigo, 'total' => $pedido->total, 'pedido' => $pedido,
        ], 201);
    }

    /** HU-07: seguimiento visual (el dueño o el personal). */
    public function show(Request $request, int $id)
    {
        $pedido = Pedido::with(['detalles', 'estados'])->findOrFail($id);
        $user = $request->user();

        if ((int) $pedido->user_id !== $user->id && !$user->esPersonal()) {
            return response()->json(['mensaje' => 'Pedido no encontrado'], 404);
        }

        return response()->json($pedido);
    }

    // ---------------------------------------------------------------- Cocina / caja

    /** HU-06: panel de pedidos activos, FIFO por hora de recepción. Filtro ?categoria= */
    public function activos(Request $request)
    {
        $q = Pedido::with(['detalles.producto:id,nombre,categoria', 'detalles.producto.categorias:id,nombre', 'usuario:id,name'])
            ->whereIn('estado', Pedido::ACTIVOS);

        // Un pedido entra en la categoría si alguno de sus productos la tiene (principal o adicional).
        if ($request->filled('categoria')) {
            $cat = $request->query('categoria');
            $q->whereHas('detalles.producto', fn ($p) => $p->enCategoria($cat));
        }

        return response()->json($q->orderBy('created_at')->orderBy('id')->get());
    }

    /** HU-07: Recibido → En preparación → Para entregar. */
    public function actualizarEstado(Request $request, int $id)
    {
        $datos = $request->validate([
            'estado' => ['required', Rule::in([Pedido::EN_PREPARACION, Pedido::PARA_ENTREGAR])],
        ]);

        $pedido = $this->servicio->cambiarEstado($id, $datos['estado'], $request->user());

        return response()->json(['mensaje' => "Pedido actualizado a '{$pedido->estado}'", 'pedido' => $pedido]);
    }

    /** HU-08: entrega verificando el código del cliente. */
    public function entregar(Request $request)
    {
        $datos = $request->validate(['codigo' => 'required|string|max:10']);

        $pedido = $this->servicio->entregar($datos['codigo'], $request->user());

        return response()->json(['mensaje' => 'Pedido entregado correctamente', 'pedido' => $pedido->load('detalles')]);
    }
}
