<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// HU-21: combo del día (varios productos con un precio especial)
class Combo extends Model
{
    protected $table = 'COMBO';
    protected $primaryKey = 'id_combo';
    public $timestamps = false;

    protected $fillable = ['nombre', 'descripcion', 'precio', 'activo'];

    protected $casts = ['activo' => 'boolean'];

    public function productos()
    {
        return $this->belongsToMany(Producto::class, 'COMBO_PRODUCTO', 'id_combo', 'id_producto')
            ->withPivot('cantidad');
    }

    // Datos listos para el menú y el panel: precio normal, ahorro y si se puede pedir hoy.
    public function resumen(): array
    {
        $productos = $this->productos;
        $normal = 0;
        $maximo = null;
        $faltantes = [];
        foreach ($productos as $p) {
            $cantidad = (int) $p->pivot->cantidad;
            $normal += (float) $p->precio * $cantidad;
            $alcanza = intdiv((int) $p->stock_actual, max(1, $cantidad));
            $maximo = $maximo === null ? $alcanza : min($maximo, $alcanza);
            if ($p->estado !== 'Disponible') {
                $faltantes[] = $p->nombre . ' (agotado)';
            } elseif ((int) $p->stock_actual < $cantidad) {
                $faltantes[] = $p->nombre . ' (sin stock)';
            }
        }

        return [
            'id_combo' => $this->id_combo,
            'nombre' => $this->nombre,
            'descripcion' => $this->descripcion,
            'precio' => round((float) $this->precio, 2),
            'precio_normal' => round($normal, 2),
            'ahorro' => round(max(0, $normal - (float) $this->precio), 2),
            'activo' => (bool) $this->activo,
            'disponible' => (bool) $this->activo && empty($faltantes) && $productos->count() > 0,
            'max_unidades' => (int) ($maximo ?? 0),
            'no_disponibles' => $faltantes,
            'productos' => $productos->map(fn ($p) => [
                'id_producto' => $p->id_producto,
                'nombre' => $p->nombre,
                'cantidad' => (int) $p->pivot->cantidad,
                'precio' => round((float) $p->precio, 2),
                'estado' => $p->estado,
                'stock_actual' => (int) $p->stock_actual,
            ])->values(),
        ];
    }
}
