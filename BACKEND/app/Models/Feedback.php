<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Feedback extends Model {
    protected $table = 'FEEDBACK';
    protected $primaryKey = 'id_feedback';
    public $timestamps = false;
    protected $fillable = ['id_usuario', 'id_pedido', 'calificacion', 'comentario', 'fecha'];
}
