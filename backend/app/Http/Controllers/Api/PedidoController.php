<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pedido;
use App\Models\DetallePedido;
use App\Models\Producto;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PedidoController extends Controller
{
    public function store(Request $request)
    {
        // 1. Validar que envíen un arreglo de productos
        $request->validate([
            'productos' => 'required|array|min:1',
            'productos.*.id_producto' => 'required|integer|exists:PRODUCTO,id_producto',
            'productos.*.cantidad' => 'required|integer|min:1',
            'productos.*.notas' => 'nullable|string|max:255'
        ]);

        try {
            DB::beginTransaction();

            // 2. Crear la cabecera del pedido
            // $request->user() obtiene automáticamente al usuario autenticado por el Token
            $pedido = Pedido::create([
                'id_usuario' => $request->user()->id_usuario, 
                'estado' => 'Pendiente',
                'codigo_verificacion' => strtoupper(Str::random(6)) // Código de 6 letras/números
            ]);

            // 3. Procesar cada producto del carrito
            foreach ($request->productos as $item) {
                $producto = Producto::find($item['id_producto']);

                // Validar stock en tiempo real
                if ($producto->stock_actual < $item['cantidad']) {
                    DB::rollBack();
                    return response()->json([
                        'success' => false,
                        'message' => "Stock insuficiente para: {$producto->nombre}. Quedan {$producto->stock_actual} unidades."
                    ], 400);
                }

                // Guardar el detalle
                DetallePedido::create([
                    'id_pedido' => $pedido->id_pedido,
                    'id_producto' => $producto->id_producto,
                    'cantidad' => $item['cantidad'],
                    'precio_unitario' => $producto->precio, // Guardamos el precio actual histórico
                    'notas_personalizacion' => $item['notas'] ?? null
                ]);

                // Descontar del stock
                $producto->decrement('stock_actual', $item['cantidad']);
            }

            // 4. Llamar al Procedimiento Almacenado de MySQL para calcular el total
            DB::statement("CALL pr_calcular_total(?)", [$pedido->id_pedido]);

            // 5. Recargar el pedido para obtener el total actualizado por el Procedimiento
            $pedido->refresh();

            DB::commit(); // Confirmar que todo salió bien y guardar en BD

            return response()->json([
                'success' => true,
                'message' => 'Pedido realizado con éxito',
                'data' => [
                    'id_pedido' => $pedido->id_pedido,
                    'total_pagar' => $pedido->total,
                    'codigo_entrega' => $pedido->codigo_verificacion,
                    'estado' => $pedido->estado
                ]
            ], 201);

        } catch (\Exception $e) {
            DB::rollBack(); // Si hay cualquier error en el código, deshacemos todo
            return response()->json([
                'success' => false,
                'message' => 'Ocurrió un error al procesar el pedido.',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    // HU-13: Recepción organizada de pedidos (Para el panel de cocina)
    public function indexCocina()
    {
        // Traemos pedidos que no estén terminados ni cancelados, ordenados por hora (el más antiguo primero)
        $pedidos = Pedido::with('detalles.producto')
            ->whereIn('estado', ['Pendiente', 'Preparando', 'Listo'])
            ->orderBy('fecha_pedido', 'asc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $pedidos
        ]);
    }

    // HU-14 y HU-07: Actualizar estado y Cancelar (con regla anti-fraude)
    public function updateEstado(Request $request, $id)
    {
        $request->validate([
            'estado' => 'required|in:Preparando,Listo,Entregado,Cancelado'
        ]);

        $pedido = Pedido::with('detalles')->find($id);

        if (!$pedido) {
            return response()->json(['success' => false, 'message' => 'Pedido no encontrado'], 404);
        }

        try {
            if ($request->estado === 'Cancelado') {
                // HU-07: Llamamos a tu procedimiento de MySQL. 
                // Si el pedido ya está "Preparando", MySQL abortará y lanzará un error.
                DB::statement("CALL pr_cancelar_pedido(?)", [$id]);
                
                // Si MySQL no lanzó error, devolvemos el stock a la cafetería
                foreach ($pedido->detalles as $detalle) {
                    Producto::where('id_producto', $detalle->id_producto)
                            ->increment('stock_actual', $detalle->cantidad);
                }
            } else {
                // HU-14: Actualización normal de estado (Preparando, Listo, Entregado)
                $pedido->estado = $request->estado;
                $pedido->save();
            }

            // Nota: ¡El Trigger trg_auditoria_pedido guardará esto en el historial automáticamente!

            return response()->json([
                'success' => true,
                'message' => 'El estado del pedido se actualizó a: ' . $request->estado
            ]);

        } catch (\Exception $e) {
            // Si MySQL bloquea la cancelación, capturamos el error aquí
            return response()->json([
                'success' => false,
                'message' => 'No se pudo actualizar el estado.',
                'error' => $e->getMessage()
            ], 400);
        }
    }
}