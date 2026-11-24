<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Foto de un producto guardada en la base de datos (una por producto). */
class ProductoImagen extends Model
{
    protected $table = 'producto_imagenes';

    protected $fillable = ['producto_id', 'tipo', 'datos'];

    protected $hidden = ['datos'];
}
