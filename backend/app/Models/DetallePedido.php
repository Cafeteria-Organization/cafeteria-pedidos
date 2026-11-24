<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DetallePedido extends Model
{
    use HasFactory;

    protected $fillable = ['pedido_id', 'producto_id', 'combo_id', 'nombre', 'notas', 'contenido', 'cantidad', 'precio_unitario', 'subtotal'];

    protected $casts = ['precio_unitario' => 'decimal:2', 'subtotal' => 'decimal:2', 'contenido' => 'array'];

    public function producto()
    {
        return $this->belongsTo(Producto::class)->withTrashed();
    }

    public function combo()
    {
        return $this->belongsTo(Combo::class)->withTrashed();
    }
}
