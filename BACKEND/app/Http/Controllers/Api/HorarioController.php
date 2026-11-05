<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Configuracion;
use App\Models\HorarioAtencion;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// HU-23: Horarios de atención (y la capacidad de cocina que usa HU-11)
class HorarioController extends Controller
{
    // Público: ¿está abierta ahora? + horario de toda la semana
    // GET /horarios
    public function publico()
    {
        return response()->json([
            'success' => true,
            'data' => [
                'estado' => HorarioAtencion::estadoActual(),
                'semana' => HorarioAtencion::semana(),
                'capacidad_cocina' => (int) Configuracion::valor('capacidad_cocina', 2),
            ]
        ]);
    }

    // Admin: guardar el horario de la semana (se aplica de inmediato)
    // PUT /admin/horarios  { horarios: [{dia_semana, abierto, hora_apertura, hora_cierre}], capacidad_cocina }
    public function actualizar(Request $request)
    {
        $request->validate([
            'horarios' => 'required|array|min:1|max:7',
            'horarios.*.dia_semana' => 'required|distinct|in:' . implode(',', HorarioAtencion::ORDEN_SEMANA),
            'horarios.*.abierto' => 'required|boolean',
            'horarios.*.hora_apertura' => 'required|date_format:H:i',
            'horarios.*.hora_cierre' => 'required|date_format:H:i',
            'capacidad_cocina' => 'nullable|integer|min:1|max:20',
        ], [
            'horarios.*.hora_apertura.date_format' => 'Escribe la hora de apertura como HH:MM.',
            'horarios.*.hora_cierre.date_format' => 'Escribe la hora de cierre como HH:MM.',
        ]);

        foreach ($request->horarios as $h) {
            if ($h['abierto'] && $h['hora_cierre'] <= $h['hora_apertura']) {
                return response()->json([
                    'success' => false,
                    'message' => "El {$h['dia_semana']} la hora de cierre debe ser después de la de apertura."
                ], 422);
            }
        }

        DB::transaction(function () use ($request) {
            foreach ($request->horarios as $h) {
                HorarioAtencion::updateOrCreate(
                    ['dia_semana' => $h['dia_semana']],
                    ['abierto' => (bool) $h['abierto'], 'hora_apertura' => $h['hora_apertura'], 'hora_cierre' => $h['hora_cierre']]
                );
            }
            if ($request->filled('capacidad_cocina')) {
                Configuracion::guardar('capacidad_cocina', (int) $request->capacidad_cocina);
            }
        });

        return response()->json([
            'success' => true,
            'message' => 'Horario guardado. Ya se aplica en el menú.',
            'data' => [
                'estado' => HorarioAtencion::estadoActual(),
                'semana' => HorarioAtencion::semana(),
                'capacidad_cocina' => (int) Configuracion::valor('capacidad_cocina', 2),
            ]
        ]);
    }
}
