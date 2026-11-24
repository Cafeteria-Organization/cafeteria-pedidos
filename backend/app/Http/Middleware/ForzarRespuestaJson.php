<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/** Toda la API responde JSON, aunque el cliente olvide el header Accept. */
class ForzarRespuestaJson
{
    public function handle(Request $request, Closure $next)
    {
        $request->headers->set('Accept', 'application/json');
        return $next($request);
    }
}
