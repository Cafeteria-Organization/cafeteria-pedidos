<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pedido;
use App\Models\DetallePedido;
use App\Models\Producto;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use App\Models\Notificacion;

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

        return response()->json([
            'success' => true,
            'message' => 'Código validado. Pedido entregado exitosamente.'
        ]);
    }

    // HU-16: Notificación de retrasos en la preparación
    public function notificarRetraso($id)
    {
        $pedido = Pedido::find($id);

        if (!$pedido) {
            return response()->json(['success' => false, 'message' => 'Pedido no encontrado'], 404);
        }

        // Creamos la notificación para el usuario
        \App\Models\Notificacion::create([
            'id_usuario' => $pedido->id_usuario,
            'titulo' => 'Retraso en tu pedido',
            'mensaje' => "Tu pedido con código {$pedido->codigo_verificacion} tomará unos minutos más de lo esperado debido a la alta demanda. ¡Gracias por tu paciencia!"
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Alerta de retraso enviada al cliente exitosamente.'
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

    // HU-06: Marcar una notificación como leída
    public function marcarLeida($id_notificacion)
    {
        $notificacion = Notificacion::find($id_notificacion);
        if ($notificacion) {
            $notificacion->leida = true;
            $notificacion->save();
        }
        return response()->json(['success' => true]);
    }

    // HU-08: Historial de compras del estudiante/docente
    public function miHistorial(Request $request)
    {
        $historial = Pedido::with('detalles.producto')
            ->where('id_usuario', $request->user()->id_usuario)
            ->orderBy('fecha_pedido', 'desc')
            ->get();

        return response()->json(['success' => true, 'data' => $historial]);
    }
}