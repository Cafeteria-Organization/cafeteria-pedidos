<?php
 
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\MenuController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\PedidoController;
use App\Http\Controllers\Api\AdminController;
 
 
 
Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);
 
 
Route::get('/menu', [MenuController::class, 'index']);
Route::get('/menu/buscar', [MenuController::class, 'buscar']);
 
 
 
Route::middleware('auth:sanctum')->group(function () {
   
 
    Route::post('/pedidos', [PedidoController::class, 'store']);
   
 
    Route::get('/pedidos/activos', [PedidoController::class, 'indexCocina']);
   
 
    Route::patch('/pedidos/{id}/estado', [PedidoController::class, 'updateEstado']);
   
 
    Route::post('/admin/productos', [AdminController::class, 'storeProducto']);
    Route::put('/admin/productos/{id}', [AdminController::class, 'updateProducto']);
 
    Route::get('/admin/personal', [AdminController::class, 'listarPersonal']);
    Route::patch('/admin/usuarios/{id}/rol', [AdminController::class, 'asignarRol']);

    // Entregar pedido con código
    Route::post('/pedidos/{id}/entregar', [PedidoController::class, 'entregarPedido']);
   

    // HU-16: Enviar alerta de retraso (Cocina)
    Route::post('/pedidos/{id}/retraso', [PedidoController::class, 'notificarRetraso']);
    
    // HU-19: Cambiar disponibilidad de producto rápido (Cocina/Admin)
    Route::patch('/admin/productos/{id}/toggle', [AdminController::class, 'toggleEstadoProducto']);


    // HU-08: Historial de compras
    Route::get('/mis-pedidos', [PedidoController::class, 'miHistorial']);
    
    // HU-06: Notificaciones
    Route::get('/mis-notificaciones', [PedidoController::class, 'misNotificaciones']);
    Route::patch('/mis-notificaciones/{id}/leer', [PedidoController::class, 'marcarLeida']);
});