<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Logo de una categoría guardado en la base de datos (uno por categoría). */
class CategoriaLogo extends Model
{
    protected $table = 'categoria_logos';

    protected $fillable = ['categoria_id', 'tipo', 'datos'];

    protected $hidden = ['datos'];
}
