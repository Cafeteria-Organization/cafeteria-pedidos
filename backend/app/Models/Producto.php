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
        'estado'
    ];

    // Relación muchos a muchos: Un producto puede tener varias categorías
    public function categorias()
    {
        return $this->belongsToMany(Categoria::class, 'PRODUCTO_CATEGORIA', 'id_producto', 'id_categoria');
    }
}