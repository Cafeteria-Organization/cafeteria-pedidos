<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * Control de acceso por rol. Uso en rutas: ->middleware('role:admin') o 'role:admin,empleado'
 */
class CheckRole
{
    public function handle(Request $request, Closure $next, string ...$roles)
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['mensaje' => 'No autenticado'], 401);
        }

        if (!in_array($user->rol, $roles, true)) {
            return response()->json(['mensaje' => 'No tienes permiso para realizar esta acción'], 403);
        }

        return $next($request);
    }
}
