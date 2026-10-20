<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DetallePedido extends Model
{
    protected $table = 'DETALLE_PEDIDO';
    protected $primaryKey = 'id_detalle';
    public $timestamps = false;

    protected $fillable = [
        'id_pedido', 
        'id_producto', 
        'cantidad', 
        'precio_unitario', 
        'notas_personalizacion'
    ];

    // Relación para traer los datos del producto
    public function producto()
    {
        return $this->belongsTo(Producto::class, 'id_producto', 'id_producto');
    }
}