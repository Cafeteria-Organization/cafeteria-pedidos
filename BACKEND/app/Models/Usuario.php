<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class Usuario extends Authenticatable
{
    use HasApiTokens; // Permite generar tokens para la API

    protected $table = 'USUARIO';
    protected $primaryKey = 'id_usuario';
    public $timestamps = false;

    protected $fillable = [
        'id_rol', 
        'nombre', 
        'correo', 
        'password_hash', 
        'fecha_registro'
    ];

    // Le decimos a Laravel que la contraseña está en la columna password_hash
    public function getAuthPassword()
    {
        return $this->password_hash;
    }

    public function rol()
    {
        return $this->belongsTo(Rol::class, 'id_rol', 'id_rol');
    }
}