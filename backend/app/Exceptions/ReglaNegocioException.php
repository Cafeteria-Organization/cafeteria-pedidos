<?php

namespace App\Exceptions;

use Exception;

/**
 * Error de regla de negocio (stock insuficiente, transición inválida, etc.).
 * Se responde con un mensaje claro al cliente; ya no se filtran errores internos.
 */
class ReglaNegocioException extends Exception
{
    public function __construct(string $mensaje, protected int $status = 400)
    {
        parent::__construct($mensaje);
    }

    public function render($request)
    {
        return response()->json(['mensaje' => $this->getMessage()], $this->status);
    }
}
