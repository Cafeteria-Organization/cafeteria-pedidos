<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Pedido extends Model
{
    use HasFactory;

    public const RECIBIDO = 'Recibido';
    public const EN_PREPARACION = 'En preparación';
    public const PARA_ENTREGAR = 'Para entregar';
    public const COMPLETADO = 'Completado';
    public const CANCELADO = 'Cancelado';

    public const ACTIVOS = [self::RECIBIDO, self::EN_PREPARACION, self::PARA_ENTREGAR];

    /** Transiciones permitidas por el personal (la entrega se hace con el código). */
    public const TRANSICIONES = [
        self::RECIBIDO => [self::EN_PREPARACION],
        self::EN_PREPARACION => [self::PARA_ENTREGAR],
    ];

    protected $fillable = ['user_id', 'codigo', 'estado', 'total', 'entregado_por', 'entregado_at'];

    protected $casts = ['total' => 'decimal:2', 'entregado_at' => 'datetime'];

    protected $appends = ['progreso'];

    public function detalles()
    {
        return $this->hasMany(DetallePedido::class);
    }

    public function usuario()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function estados()
    {
        return $this->hasMany(PedidoEstado::class)->orderBy('id');
    }

    /** HU-07: seguimiento visual en 3 pasos. */
    public function getProgresoAttribute(): array
    {
        $paso = match ($this->estado) {
            self::RECIBIDO => 1,
            self::EN_PREPARACION => 2,
            self::PARA_ENTREGAR, self::COMPLETADO => 3,
            default => 0,
        };
        return [
            'paso' => $paso,
            'total_pasos' => 3,
            'listo_para_recoger' => $this->estado === self::PARA_ENTREGAR,
        ];
    }
}
