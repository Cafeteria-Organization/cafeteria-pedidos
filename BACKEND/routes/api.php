<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\MenuController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\PedidoController;
use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\ComboController;
use App\Http\Controllers\Api\HorarioController;

// Roles (tabla ROL): 1 = Admin, 2 = Empleado (cocina), 3 = Cliente
// INC-01: las rutas de cocina y de administración revisan el rol con el middleware "rol".

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);


Route::get('/menu', [MenuController::class, 'index']);
Route::get('/menu/buscar', [MenuController::class, 'buscar']);
Route::get('/combos', [ComboController::class, 'publico']);                      // HU-21
Route::get('/horarios', [HorarioController::class, 'publico']);                  // HU-23
Route::get('/pedidos/tiempo-espera', [PedidoController::class, 'tiempoEspera']); // HU-11 (se ve antes de confirmar)


Route::middleware('auth:sanctum')->group(function () {

    // ---------- Cualquier usuario con sesión (cliente) ----------
    Route::post('/pedidos', [PedidoController::class, 'store']);

    // HU-08: Historial de compras
    Route::get('/mis-pedidos', [PedidoController::class, 'miHistorial']);

    // HU-06: Notificaciones
    Route::get('/mis-notificaciones', [PedidoController::class, 'misNotificaciones']);
    Route::patch('/mis-notificaciones/{id}/leer', [PedidoController::class, 'marcarLeida']);

    // --- Iteración 4 ---
    Route::post('/pedidos/{id}/cancelar', [PedidoController::class, 'cancelarMiPedido']); // HU-07
    Route::post('/pedidos/{id}/repetir', [PedidoController::class, 'repetirPedido']);    // HU-12
    Route::post('/favoritos/{id_producto}', [PedidoController::class, 'toggleFavorito']); // HU-10
    Route::get('/mis-favoritos', [PedidoController::class, 'misFavoritos']);              // HU-10

    // --- Iteración 5: Cliente ---
    Route::post('/pedidos/{id_pedido}/feedback', [PedidoController::class, 'enviarFeedback']); // HU-09 / HU-25

    // ---------- Cocina: Admin y Empleado ----------
    Route::middleware('rol:1,2')->group(function () {
        Route::get('/pedidos/activos', [PedidoController::class, 'indexCocina']);
        Route::patch('/pedidos/{id}/estado', [PedidoController::class, 'updateEstado']);

        // Entregar pedido con código
        Route::post('/pedidos/{id}/entregar', [PedidoController::class, 'entregarPedido']);

        // HU-16: Enviar alerta de retraso (Cocina)
        Route::post('/pedidos/{id}/retraso', [PedidoController::class, 'notificarRetraso']);

        // HU-19: Cambiar disponibilidad de producto rápido (Cocina/Admin)
        Route::patch('/admin/productos/{id}/toggle', [AdminController::class, 'toggleEstadoProducto']);
        Route::get('/admin/stock/historial', [AdminController::class, 'historialStock']);
        Route::get('/admin/productos', [AdminController::class, 'listarProductos']);
    });

    // ---------- Solo Admin ----------
    Route::middleware('rol:1')->group(function () {
        Route::post('/admin/productos', [AdminController::class, 'storeProducto']);
        Route::put('/admin/productos/{id}', [AdminController::class, 'updateProducto']);

        Route::get('/admin/personal', [AdminController::class, 'listarPersonal']);
        Route::patch('/admin/usuarios/{id}/rol', [AdminController::class, 'asignarRol']);

        // --- Iteración 5: Administración Avanzada ---
        Route::get('/admin/reportes/ventas', [AdminController::class, 'reporteVentas']);                  // HU-22
        Route::get('/admin/feedback', [AdminController::class, 'listarFeedback']);                        // HU-25
        Route::patch('/admin/productos/{id_producto}/oferta', [AdminController::class, 'configurarOferta']); // HU-21
        Route::get('/admin/combos', [ComboController::class, 'index']);                                   // HU-21
        Route::post('/admin/combos', [ComboController::class, 'store']);
        Route::put('/admin/combos/{id}', [ComboController::class, 'update']);
        Route::patch('/admin/combos/{id}/toggle', [ComboController::class, 'toggle']);
        Route::put('/admin/horarios', [HorarioController::class, 'actualizar']);                          // HU-23
    });
});
