<?php

namespace App\Http\Controllers;

use App\Models\MovimientoStock;
use App\Models\Producto;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** HU-09: control de stock en tiempo real (empleados y admin). */
class InventarioController extends Controller
{
    public function __construct(private StockService $stock)
    {
    }

    /** Productos agotados o por agotarse (stock <= stock_minimo). */
    public function alertas()
    {
        $items = Producto::with('categorias:id,nombre,orden,logo,icono')->whereColumn('stock', '<=', 'stock_minimo')
            ->orderBy('stock')->orderBy('nombre')->get()
            ->map(fn ($p) => $p->toArray() + ['alerta' => $p->stock === 0 ? 'agotado' : 'stock_bajo']);

        return response()->json($items);
    }

    /** Reponer ("agregar") o fijar ("stock") el stock de un producto. */
    public function actualizarStock(Request $request, int $id)
    {
        $datos = $request->validate([
            'agregar' => 'required_without:stock|integer|min:1|max:100000',
            'stock' => 'required_without:agregar|integer|min:0|max:100000',
            'motivo' => 'nullable|string|max:150',
        ]);

        $producto = DB::transaction(function () use ($id, $datos, $request) {
            $p = Producto::lockForUpdate()->findOrFail($id);

            if (isset($datos['agregar'])) {
                $this->stock->reponer($p, (int) $datos['agregar'], $request->user()->id, $datos['motivo'] ?? null);
            } else {
                $this->stock->establecer($p, (int) $datos['stock'], $request->user()->id, $datos['motivo'] ?? null);
            }
            return $p->fresh();
        });

        return response()->json(['mensaje' => 'Stock actualizado', 'data' => $producto]);
    }

    /** Marca manualmente un producto como agotado (sin tocar su stock) y deja quién lo hizo. */
    public function agotar(Request $request, int $id)
    {
        $producto = Producto::findOrFail($id);
        DB::transaction(function () use ($producto, $request) {
            $producto->update(['disponible' => false]);
            $this->stock->registrarEvento($producto, 'estado', $request->user()->id, 'Se marcó como agotado');
        });

        return response()->json(['mensaje' => 'El producto ahora está Agotado', 'data' => $producto]);
    }

    /** Historial del producto con quién hizo cada movimiento (nombre y rol). */
    public function movimientos(int $id)
    {
        Producto::withTrashed()->findOrFail($id);

        return response()->json(
            MovimientoStock::with('usuario:id,name,rol')
                ->where('producto_id', $id)->orderByDesc('id')->limit(100)->get()
        );
    }
}
