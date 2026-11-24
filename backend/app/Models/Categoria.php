<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Categoria extends Model
{
    protected $fillable = ['nombre', 'orden', 'icono'];

    protected $casts = ['orden' => 'integer'];

    protected $hidden = ['pivot', 'created_at', 'updated_at', 'logo'];

    protected $appends = ['logo_url'];

    public function productos()
    {
        return $this->belongsToMany(Producto::class, 'categoria_producto');
    }

    /** Dirección del logo (guardado en la base). ?v= cambia cuando se sube otro. */
    public function getLogoUrlAttribute(): ?string
    {
        return !empty($this->attributes['logo'])
            ? url("/api/categorias/{$this->id}/logo") . '?v=' . $this->attributes['logo']
            : null;
    }

    /** Guarda (o reemplaza) el logo en la base de datos. */
    public function guardarLogo(string $datos, string $tipo): void
    {
        CategoriaLogo::updateOrCreate(['categoria_id' => $this->id], ['tipo' => $tipo, 'datos' => $datos]);
        $this->forceFill(['logo' => substr(sha1($datos), 0, 16)])->save();
    }

    public function quitarLogo(): void
    {
        CategoriaLogo::where('categoria_id', $this->id)->delete();
        $this->forceFill(['logo' => null])->save();
    }

    /** Devuelve la categoría con ese nombre; si no existe la crea al final del menú. */
    public static function obtener(string $nombre): self
    {
        $nombre = trim(preg_replace('/\s+/', ' ', $nombre));

        return static::where('nombre', $nombre)->first()
            ?? static::create(['nombre' => $nombre, 'orden' => (int) static::max('orden') + 1]);
    }
}
