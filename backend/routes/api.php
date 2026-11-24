<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\CategoriaController;
use App\Http\Controllers\ComboController;
use App\Http\Controllers\EmpleadoController;
use App\Http\Controllers\InventarioController;
use App\Http\Controllers\PedidoController;
use App\Http\Controllers\ProductoController;
use App\Http\Controllers\ReporteController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Cafetería Univalle — 12 HU / 3 iteraciones
|--------------------------------------------------------------------------
| Roles: admin | empleado | estudiante (estudiantes y docentes)
*/

// ---- Públicas ---------------------------------------------------------------
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1');           // HU-01
Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:10,1');     // HU-01
Route::get('/menu', [ProductoController::class, 'menu']);                                        // HU-04
Route::get('/combos', [ComboController::class, 'index']);                                        // HU-12
Route::get('/categorias', [CategoriaController::class, 'index']);                                // categorías del menú
Route::get('/categorias/{id}/logo', [CategoriaController::class, 'logo'])
    ->whereNumber('id')->withoutMiddleware('throttle:api');
// Foto del producto (guardada en la base). Sin el límite de 60/min: un menú carga muchas fotos a la vez.
Route::get('/productos/{id}/imagen', [ProductoController::class, 'imagen'])
    ->whereNumber('id')->withoutMiddleware('throttle:api');

// ---- Autenticadas -----------------------------------------------------------
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::get('/pedidos/{id}', [PedidoController::class, 'show'])->whereNumber('id');           // HU-07 seguimiento

    // ---- Estudiantes / docentes ---------------------------------------------
    Route::middleware('role:estudiante')->group(function () {
        Route::post('/pedidos', [PedidoController::class, 'store']);                              // HU-05
        Route::post('/pedidos/{id}/repetir', [PedidoController::class, 'repetir'])->whereNumber('id'); // HU-11
        Route::get('/mis-pedidos', [PedidoController::class, 'misPedidos']);                      // HU-11
    });
    Route::post('/pedidos/{id}/cancelar', [PedidoController::class, 'cancelar'])
        ->whereNumber('id')->middleware('role:estudiante,empleado,admin');                        // HU-10
    Route::get('/estudiantes/{id}/historial', [PedidoController::class, 'historial'])->whereNumber('id'); // HU-11

    // ---- Cocina / caja (empleado y admin) -----------------------------------
    Route::middleware('role:empleado,admin')->group(function () {
        Route::get('/pedidos/activos', [PedidoController::class, 'activos']);                     // HU-06
        Route::put('/pedidos/{id}/estado', [PedidoController::class, 'actualizarEstado'])->whereNumber('id'); // HU-07
        Route::post('/pedidos/entregar', [PedidoController::class, 'entregar'])->middleware('throttle:30,1'); // HU-08

        Route::get('/inventario/alertas', [InventarioController::class, 'alertas']);              // HU-09
        Route::patch('/productos/{id}/stock', [InventarioController::class, 'actualizarStock'])->whereNumber('id');
        Route::patch('/productos/{id}/agotado', [InventarioController::class, 'agotar'])->whereNumber('id');
        Route::get('/productos/{id}/movimientos', [InventarioController::class, 'movimientos'])->whereNumber('id');
    });

    // ---- Solo administrador -------------------------------------------------
    Route::middleware('role:admin')->prefix('admin')->group(function () {
        // HU-02
        Route::get('/empleados', [EmpleadoController::class, 'index']);
        Route::post('/empleados', [EmpleadoController::class, 'store']);
        Route::put('/empleados/{id}', [EmpleadoController::class, 'update'])->whereNumber('id');
        Route::delete('/empleados/{id}', [EmpleadoController::class, 'destroy'])->whereNumber('id');
        Route::post('/empleados/{id}/restaurar', [EmpleadoController::class, 'restaurar'])->whereNumber('id');

        // HU-03
        Route::get('/productos', [ProductoController::class, 'adminIndex']);
        Route::post('/productos', [ProductoController::class, 'store']);
        Route::put('/productos/{id}', [ProductoController::class, 'update'])->whereNumber('id');
        Route::delete('/productos/{id}', [ProductoController::class, 'destroy'])->whereNumber('id');
        Route::patch('/productos/{id}/toggle', [ProductoController::class, 'toggle'])->whereNumber('id');
        Route::post('/productos/{id}/restaurar', [ProductoController::class, 'restaurar'])->whereNumber('id');

        // Categorías (un producto puede tener varias)
        Route::post('/categorias', [CategoriaController::class, 'store']);
        Route::put('/categorias/{id}', [CategoriaController::class, 'update'])->whereNumber('id');
        Route::delete('/categorias/{id}', [CategoriaController::class, 'destroy'])->whereNumber('id');
        Route::post('/categorias/{id}/logo', [CategoriaController::class, 'subirLogo'])->whereNumber('id');
        Route::delete('/categorias/{id}/logo', [CategoriaController::class, 'quitarLogo'])->whereNumber('id');
        Route::put('/categorias/{id}/icono', [CategoriaController::class, 'cambiarIcono'])->whereNumber('id');

        // HU-12
        Route::get('/combos', [ComboController::class, 'adminIndex']);
        Route::post('/combos', [ComboController::class, 'store']);
        Route::put('/combos/{id}', [ComboController::class, 'update'])->whereNumber('id');
        Route::delete('/combos/{id}', [ComboController::class, 'destroy'])->whereNumber('id');
        Route::patch('/combos/{id}/toggle', [ComboController::class, 'toggle'])->whereNumber('id');

        // Reportes de ventas
        Route::get('/reportes/ventas', [ReporteController::class, 'ventas']);
        Route::get('/reportes/detalle', [ReporteController::class, 'detalle']);   // lo vendido en un día
    });
});
