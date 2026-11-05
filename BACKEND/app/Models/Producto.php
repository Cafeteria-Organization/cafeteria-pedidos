<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Producto extends Model
{
    protected $table = 'PRODUCTO';
    protected $primaryKey = 'id_producto';
    public $timestamps = false;

    protected $fillable = [
        'nombre', 
        'descripcion', 
        'precio', 
        'stock_actual', 
        'estado',
        'precio_oferta',      // HU-21: oferta de un producto suelto
        'tiempo_preparacion'  // HU-11: minutos que tarda en prepararse
    ];

    // HU-21: precio que se cobra hoy (el de oferta si hay una vigente y es menor)
    public function precioVigente(): float
    {
        $oferta = $this->precio_oferta;
        return ($oferta !== null && (float) $oferta > 0 && (float) $oferta < (float) $this->precio)
            ? (float) $oferta : (float) $this->precio;
    }

    // Relación muchos a muchos: Un producto puede tener varias categorías
    public function categorias()
    {
        return $this->belongsToMany(Categoria::class, 'PRODUCTO_CATEGORIA', 'id_producto', 'id_categoria');
    }

    public function scopeDisponibles($query){
        
        return $query->where('estado', 'Disponible');
    }
}