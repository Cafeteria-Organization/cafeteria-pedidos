<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Combo;
use App\Models\Producto;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// HU-21: Combos del día (varios productos con un precio especial)
class ComboController extends Controller
{
    // Menú digital: combos activos (con precio normal, ahorro y si se pueden pedir hoy)
    // GET /combos
    public function publico()
    {
        $combos = Combo::with('productos')->where('activo', true)->orderBy('nombre')->get()
            ->map(fn ($c) => $c->resumen())->values();
        return response()->json(['success' => true, 'data' => $combos]);
    }

    // Panel del administrador: todos los combos, también los desactivados
    // GET /admin/combos
    public function index()
    {
        $combos = Combo::with('productos')->orderBy('activo', 'desc')->orderBy('nombre')->get()
            ->map(fn ($c) => $c->resumen())->values();
        return response()->json(['success' => true, 'data' => $combos]);
    }

    // POST /admin/combos   { nombre, descripcion, precio, productos: [{id_producto, cantidad}] }
    public function store(Request $request)
    {
        [$datos, $productos, $error] = $this->validar($request);
        if ($error) return response()->json(['success' => false, 'message' => $error], 422);

        $combo = DB::transaction(function () use ($datos, $productos) {
            $combo = Combo::create($datos + ['activo' => true]);
            $combo->productos()->sync($productos);
            return $combo;
        });

        return response()->json(['success' => true, 'message' => 'Combo creado y publicado en el menú.', 'data' => $combo->load('productos')->resumen()], 201);
    }

    // PUT /admin/combos/{id}
    public function update(Request $request, $id)
    {
        $combo = Combo::find($id);
        if (!$combo) return response()->json(['success' => false, 'message' => 'Combo no encontrado'], 404);

        [$datos, $productos, $error] = $this->validar($request);
        if ($error) return response()->json(['success' => false, 'message' => $error], 422);

        DB::transaction(function () use ($combo, $datos, $productos) {
            $combo->update($datos);
            $combo->productos()->sync($productos);
        });

        return response()->json(['success' => true, 'message' => 'Combo actualizado.', 'data' => $combo->fresh('productos')->resumen()]);
    }

    // PATCH /admin/combos/{id}/toggle → activar / desactivar
    public function toggle($id)
    {
        $combo = Combo::with('productos')->find($id);
        if (!$combo) return response()->json(['success' => false, 'message' => 'Combo no encontrado'], 404);

        $combo->activo = !$combo->activo;
        $combo->save();

        $info = $combo->resumen();
        $mensaje = $combo->activo ? 'Combo activado: ya se ve en el menú.' : 'Combo desactivado: ya no se muestra en el menú.';
        if ($combo->activo && !$info['disponible']) {
            $mensaje .= ' Ojo: no se podrá pedir hasta que haya ' . implode(', ', $info['no_disponibles']) . '.';
        }
        return response()->json(['success' => true, 'message' => $mensaje, 'data' => $info]);
    }

    // Reglas comunes de crear y editar. Devuelve [datos, productos para sync, error]
    private function validar(Request $request): array
    {
        $request->validate([
            'nombre' => 'required|string|max:100',
            'descripcion' => 'nullable|string|max:255',
            'precio' => 'required|numeric|min:0.1',
            'productos' => 'required|array|min:2',
            'productos.*.id_producto' => 'required|integer|distinct|exists:PRODUCTO,id_producto',
            'productos.*.cantidad' => 'nullable|integer|min:1|max:10',
        ], [
            'productos.min' => 'Un combo debe tener al menos 2 productos distintos.',
            'productos.*.id_producto.distinct' => 'No repitas un producto: usa la cantidad.',
        ]);

        $lista = collect($request->productos)->map(fn ($p) => [
            'id_producto' => (int) $p['id_producto'],
            'cantidad' => (int) ($p['cantidad'] ?? 1),
        ]);
        $bd = Producto::whereIn('id_producto', $lista->pluck('id_producto'))->get()->keyBy('id_producto');

        // Todos los productos deben estar disponibles al armar el combo
        $agotados = $lista->filter(fn ($p) => $bd->get($p['id_producto'])->estado !== 'Disponible')
            ->map(fn ($p) => $bd->get($p['id_producto'])->nombre);
        if ($agotados->isNotEmpty()) {
            return [null, null, 'No puedes armar el combo con productos agotados: ' . $agotados->implode(', ') . '.'];
        }

        $normal = $lista->sum(fn ($p) => (float) $bd->get($p['id_producto'])->precio * $p['cantidad']);
        if ((float) $request->precio >= $normal) {
            return [null, null, 'El precio del combo debe ser menor que la suma de sus productos por separado (Bs ' . number_format($normal, 2) . ').'];
        }

        $productos = $lista->mapWithKeys(fn ($p) => [$p['id_producto'] => ['cantidad' => $p['cantidad']]])->all();
        $datos = [
            'nombre' => trim($request->nombre),
            'descripcion' => $request->descripcion ? trim($request->descripcion) : null,
            'precio' => round((float) $request->precio, 2),
        ];
        return [$datos, $productos, null];
    }
}
