<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Combo extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = ['nombre', 'descripcion', 'precio', 'activo'];

    protected $casts = ['precio' => 'decimal:2', 'activo' => 'boolean'];

    protected $appends = ['disponible', 'precio_normal', 'ahorro'];

    public function productos()
    {
        return $this->belongsToMany(Producto::class, 'combo_producto')
            ->withPivot('cantidad')
            ->withTrashed();
    }

    /** El combo se puede pedir si está activo y todos sus productos tienen stock suficiente. */
    public function getDisponibleAttribute(): bool
    {
        if (!$this->activo || $this->productos->isEmpty()) {
            return false;
        }
        foreach ($this->productos as $p) {
            if ($p->trashed() || !$p->disponible || $p->stock < $p->pivot->cantidad) {
                return false;
            }
        }
        return true;
    }

    public function getPrecioNormalAttribute(): string
    {
        $suma = $this->productos->sum(fn ($p) => (float) $p->precio * $p->pivot->cantidad);
        return number_format($suma, 2, '.', '');
    }

    public function getAhorroAttribute(): string
    {
        return number_format(max(0, (float) $this->precio_normal - (float) $this->precio), 2, '.', '');
    }
}
