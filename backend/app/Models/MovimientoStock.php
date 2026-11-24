<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MovimientoStock extends Model
{
    protected $table = 'movimientos_stock';

    // tipo: inicial | pedido | cancelacion | reposicion | ajuste (cambian el stock)
    //       estado | edicion | eliminado | restaurado (cantidad 0: quedan para saber quién hizo qué)
    protected $fillable = ['producto_id', 'pedido_id', 'user_id', 'tipo', 'cantidad', 'stock_resultante', 'motivo'];

    /** Quién hizo el movimiento (también si después lo dieron de baja). */
    public function usuario()
    {
        return $this->belongsTo(User::class, 'user_id')->withTrashed();
    }
}
