<?php

namespace App\Http\Controllers;

use App\Models\Combo;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** HU-12: combos / ofertas del día (productos agrupados con precio especial). */
class ComboController extends Controller
{
    /**
     * Público: solo los combos que hoy se pueden pedir. No salen los desactivados ni los que
     * tienen un producto agotado, sacado del menú, eliminado o sin stock suficiente.
     */
    public function index()
    {
        return response()->json(
            Combo::with('productos')->where('activo', true)->orderBy('nombre')->get()
                ->filter->disponible->values()
        );
    }

    public function adminIndex()
    {
        return response()->json(Combo::with('productos')->orderBy('nombre')->get());
    }

    public function store(Request $request)
    {
        $datos = $request->validate($this->reglas());

        $combo = DB::transaction(function () use ($datos) {
            $combo = Combo::create([
                'nombre' => $datos['nombre'], 'descripcion' => $datos['descripcion'] ?? null,
                'precio' => $datos['precio'], 'activo' => $datos['activo'] ?? true,
            ]);
            $combo->productos()->sync($this->pivot($datos['productos']));
            return $combo;
        });

        return response()->json(['mensaje' => 'Combo creado', 'data' => $combo->load('productos')], 201);
    }

    public function update(Request $request, int $id)
    {
        $combo = Combo::findOrFail($id);
        $datos = $request->validate($this->reglas(true));

        DB::transaction(function () use ($combo, $datos) {
            $combo->update(collect($datos)->only(['nombre', 'descripcion', 'precio', 'activo'])->all());
            if (isset($datos['productos'])) {
                $combo->productos()->sync($this->pivot($datos['productos']));
            }
        });

        return response()->json(['mensaje' => 'Combo actualizado', 'data' => $combo->fresh()->load('productos')]);
    }

    public function destroy(int $id)
    {
        Combo::findOrFail($id)->delete();

        return response()->json(['mensaje' => 'Combo eliminado']);
    }

    public function toggle(int $id)
    {
        $combo = Combo::findOrFail($id);
        $combo->update(['activo' => !$combo->activo]);

        return response()->json([
            'mensaje' => 'El combo ahora está ' . ($combo->activo ? 'Activo' : 'Inactivo'),
            'data' => $combo->load('productos'),
        ]);
    }

    private function reglas(bool $parcial = false): array
    {
        $r = $parcial ? 'sometimes|' : '';

        return [
            'nombre' => $r . 'required|string|max:100',
            'descripcion' => 'nullable|string|max:500',
            'precio' => $r . 'required|numeric|min:0.01|max:9999.99',
            'activo' => 'sometimes|boolean',
            'productos' => $r . 'required|array|min:1|max:15',
            'productos.*.id' => ['required', 'integer', 'distinct', Rule::exists('productos', 'id')->whereNull('deleted_at')],
            'productos.*.cantidad' => 'required|integer|min:1|max:20',
        ];
    }

    private function pivot(array $productos): array
    {
        $out = [];
        foreach ($productos as $p) {
            $out[$p['id']] = ['cantidad' => $p['cantidad']];
        }
        return $out;
    }
}
