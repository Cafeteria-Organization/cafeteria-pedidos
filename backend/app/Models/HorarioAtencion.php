<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class HorarioAtencion extends Model {
    protected $table = 'HORARIO_ATENCION';
    protected $primaryKey = 'id_horario';
    public $timestamps = false;
    protected $fillable = ['dia_semana', 'hora_apertura', 'hora_cierre', 'abierto'];
}
