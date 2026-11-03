<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Notificacion extends Model
{
    protected $table = 'NOTIFICACION';
    protected $primaryKey = 'id_notificacion';
    public $timestamps = false;

    protected $fillable = [
        'id_usuario', 
        'titulo', 
        'mensaje', 
        'leida', 
        'fecha_envio'
    ];
}