<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    public const ROL_ADMIN = 'admin';
    public const ROL_EMPLEADO = 'empleado';
    public const ROL_ESTUDIANTE = 'estudiante'; // estudiantes y docentes

    protected $fillable = ['name', 'email', 'password', 'rol'];

    protected $hidden = ['password', 'remember_token'];

    protected $casts = ['email_verified_at' => 'datetime'];

    public function esAdmin(): bool
    {
        return $this->rol === self::ROL_ADMIN;
    }

    public function esPersonal(): bool
    {
        return in_array($this->rol, [self::ROL_ADMIN, self::ROL_EMPLEADO], true);
    }

    public function pedidos()
    {
        return $this->hasMany(Pedido::class);
    }
}
