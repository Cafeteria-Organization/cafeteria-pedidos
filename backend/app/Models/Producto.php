<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Producto extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'nombre', 'descripcion', 'categoria', 'precio',
        'stock', 'stock_minimo', 'imagen', 'disponible',
    ];

    protected $casts = [
        'precio' => 'decimal:2',
        'stock' => 'integer',
        'stock_minimo' => 'integer',
        'disponible' => 'boolean',
    ];

    protected $appends = ['imagen_url', 'stock_bajo'];

    /**
     * Dirección de la foto (guardada en la base de datos). Usa el mismo servidor que atiende
     * la petición, así que no depende de APP_URL. ?v= cambia cuando se sube otra foto.
     */
    public function getImagenUrlAttribute(): ?string
    {
        return $this->imagen ? url("/api/productos/{$this->id}/imagen") . '?v=' . $this->imagen : null;
    }

    public function foto()
    {
        return $this->hasOne(ProductoImagen::class);
    }

    /** Guarda (o reemplaza) la foto en la base de datos. */
    public function guardarFoto(string $datos, string $tipo): void
    {
        ProductoImagen::updateOrCreate(['producto_id' => $this->id], ['tipo' => $tipo, 'datos' => $datos]);
        $this->forceFill(['imagen' => substr(sha1($datos), 0, 16)])->save();
    }

    public function getStockBajoAttribute(): bool
    {
        return $this->stock <= $this->stock_minimo;
    }

    public function movimientos()
    {
        return $this->hasMany(MovimientoStock::class);
    }

    /** Un producto puede estar en varias categorías; `categoria` guarda la principal. */
    public function categorias()
    {
        return $this->belongsToMany(Categoria::class, 'categoria_producto')->orderBy('orden')->orderBy('nombre');
    }

    /** Filtra por categoría: la principal o cualquiera de las que tiene. */
    public function scopeEnCategoria($query, string $categoria)
    {
        return $query->where(fn ($q) => $q->where('categoria', $categoria)
            ->orWhereHas('categorias', fn ($c) => $c->where('nombre', $categoria)));
    }
}
