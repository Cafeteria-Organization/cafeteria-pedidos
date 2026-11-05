<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

// HU-23: horario de atención por día de la semana
class HorarioAtencion extends Model {
    protected $table = 'HORARIO_ATENCION';
    protected $primaryKey = 'id_horario';
    public $timestamps = false;
    protected $fillable = ['dia_semana', 'hora_apertura', 'hora_cierre', 'abierto'];
    protected $casts = ['abierto' => 'boolean'];

    // Orden de DAYOFWEEK() de MySQL: 1 = Domingo ... 7 = Sábado
    const DIAS = [1 => 'Domingo', 2 => 'Lunes', 3 => 'Martes', 4 => 'Miércoles', 5 => 'Jueves', 6 => 'Viernes', 7 => 'Sábado'];
    const ORDEN_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

    public static function hhmm($hora): string
    {
        return substr((string) $hora, 0, 5);
    }

    // ¿Está abierta la cafetería ahora? Se usa la hora de MySQL (la misma de fecha_pedido).
    public static function estadoActual(): array
    {
        $ahora = DB::selectOne("SELECT DAYOFWEEK(NOW()) AS dia, DATE_FORMAT(NOW(), '%H:%i:%s') AS hora");
        $horarios = static::all()->keyBy('dia_semana');

        if ($horarios->isEmpty()) {
            return ['abierto' => true, 'configurado' => false, 'hoy' => null, 'mensaje' => null, 'hora_actual' => self::hhmm($ahora->hora)];
        }

        $nombreHoy = self::DIAS[$ahora->dia];
        $hoy = $horarios->get($nombreHoy);
        $hora = $ahora->hora;
        $abierto = $hoy && $hoy->abierto && $hora >= $hoy->hora_apertura && $hora < $hoy->hora_cierre;

        if ($abierto) {
            $mensaje = 'Abierto hoy hasta las ' . self::hhmm($hoy->hora_cierre) . '.';
        } elseif ($hoy && $hoy->abierto && $hora < $hoy->hora_apertura) {
            $mensaje = 'La cafetería está cerrada. Hoy abrimos a las ' . self::hhmm($hoy->hora_apertura) . '.';
        } else {
            $mensaje = 'La cafetería está cerrada.';
            for ($i = 1; $i <= 7; $i++) {
                $nombre = self::DIAS[(($ahora->dia - 1 + $i) % 7) + 1];
                $h = $horarios->get($nombre);
                if ($h && $h->abierto) {
                    $cuando = $i === 1 ? 'mañana' : 'el ' . mb_strtolower($nombre);
                    $mensaje .= ' Abrimos ' . $cuando . ' a las ' . self::hhmm($h->hora_apertura) . '.';
                    break;
                }
            }
        }

        return [
            'abierto' => $abierto,
            'configurado' => true,
            'dia' => $nombreHoy,
            'hora_actual' => self::hhmm($hora),
            'hoy' => $hoy ? [
                'abierto' => (bool) $hoy->abierto,
                'hora_apertura' => self::hhmm($hoy->hora_apertura),
                'hora_cierre' => self::hhmm($hoy->hora_cierre),
            ] : null,
            'mensaje' => $mensaje,
        ];
    }

    public static function semana(): array
    {
        $horarios = static::all()->keyBy('dia_semana');
        return collect(self::ORDEN_SEMANA)->map(function ($dia) use ($horarios) {
            $h = $horarios->get($dia);
            return [
                'dia_semana' => $dia,
                'abierto' => $h ? (bool) $h->abierto : false,
                'hora_apertura' => $h ? self::hhmm($h->hora_apertura) : '07:00',
                'hora_cierre' => $h ? self::hhmm($h->hora_cierre) : '21:00',
            ];
        })->all();
    }
}
