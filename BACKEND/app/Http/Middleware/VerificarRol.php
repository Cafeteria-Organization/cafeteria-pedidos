<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

// INC-01: control de roles. Uso en rutas: ->middleware('rol:1') o 'rol:1,2'
// 1 = Admin, 2 = Empleado (cocina), 3 = Cliente
class VerificarRol
{
    public function handle(Request $request, Closure $next, ...$roles)
    {
        $usuario = $request->user();
        $permitidos = array_map('intval', $roles);

        if (!$usuario || !in_array((int) $usuario->id_rol, $permitidos, true)) {
            return response()->json([
                'success' => false,
                'message' => 'No tienes permiso para realizar esta acción.'
            ], 403);
        }

        return $next($request);
    }
}
