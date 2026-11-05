<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// Valores de configuración simples (por ahora: capacidad_cocina para HU-11)
class Configuracion extends Model
{
    protected $table = 'CONFIGURACION';
    protected $primaryKey = 'clave';
    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = false;

    protected $fillable = ['clave', 'valor'];

    public static function valor(string $clave, $porDefecto = null)
    {
        $fila = static::find($clave);
        return $fila ? $fila->valor : $porDefecto;
    }

    public static function guardar(string $clave, $valor): void
    {
        static::updateOrCreate(['clave' => $clave], ['valor' => (string) $valor]);
    }
}
