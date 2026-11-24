<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PedidoEstado extends Model
{
    public $timestamps = false;

    protected $fillable = ['pedido_id', 'estado', 'user_id'];

    protected $casts = ['created_at' => 'datetime'];
}
