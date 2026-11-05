<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Favorito extends Model {
    protected $table = 'FAVORITOS';
    protected $primaryKey = 'id_favorito';
    public $timestamps = false;
    protected $fillable = ['id_usuario', 'id_producto', 'fecha_agregado'];

    public function producto() {
        return $this->belongsTo(Producto::class, 'id_producto', 'id_producto');
    }
}
