<?php

namespace App\Http\Controllers;

use App\Exceptions\ReglaNegocioException;
use App\Models\Pedido;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Reporte de ventas (solo Admin).
 * GET /admin/reportes/ventas?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&agrupar=dia|semana
 * GET /admin/reportes/detalle?fecha=AAAA-MM-DD   (qué se vendió ese día, a qué hora y con qué notas)
 *
 * Cuenta como venta cada pedido entregado (Completado). Las fechas se agrupan con la
 * hora de La Paz, aunque en la base se guarden en UTC. Los cálculos se hacen aquí para
 * que funcionen igual en MySQL y en SQLite (pruebas).
 */
class ReporteController extends Controller
{
    public function ventas(Request $request)
    {
        $request->validate([
            'desde' => 'nullable|date_format:Y-m-d',
            'hasta' => 'nullable|date_format:Y-m-d',
            'agrupar' => 'nullable|in:dia,semana',
        ]);

        $zona = config('cafeteria.zona_horaria', 'America/La_Paz');
        $hasta = $request->input('hasta', now($zona)->toDateString());
        $desde = $request->input('desde', Carbon::parse($hasta, $zona)->subDays(6)->toDateString());
        $agrupar = $request->input('agrupar', 'dia');

        if ($desde > $hasta) {
            throw new ReglaNegocioException('La fecha "desde" no puede ser posterior a la fecha "hasta".', 422);
        }
        if (Carbon::parse($desde)->diffInDays(Carbon::parse($hasta)) > 366) {
            throw new ReglaNegocioException('El rango no puede ser mayor a un año.', 422);
        }

        $inicio = Carbon::parse($desde, $zona)->startOfDay()->utc();
        $fin = Carbon::parse($hasta, $zona)->endOfDay()->utc();

        $pedidos = Pedido::with('detalles.producto:id,categoria')
            ->whereIn('estado', [Pedido::COMPLETADO, Pedido::CANCELADO])
            ->whereBetween('created_at', [$inicio, $fin])
            ->get();
        $entregados = $pedidos->where('estado', Pedido::COMPLETADO);

        // Ventas por día o por semana (lunes a domingo), incluidas las fechas sin ventas.
        $clave = function (Carbon $fecha) use ($zona, $agrupar) {
            $local = $fecha->copy()->setTimezone($zona);
            return ($agrupar === 'semana' ? $local->startOfWeek(Carbon::MONDAY) : $local)->toDateString();
        };
        $porPeriodo = $entregados->groupBy(fn ($p) => $clave($p->created_at));

        $ventas = [];
        $paso = Carbon::parse($desde, $zona);
        if ($agrupar === 'semana') {
            $paso->startOfWeek(Carbon::MONDAY);
        }
        $ultimo = Carbon::parse($hasta, $zona);
        while ($paso->lte($ultimo)) {
            $periodo = $paso->toDateString();
            $grupo = $porPeriodo->get($periodo, collect());
            $ventas[] = [
                'periodo' => $periodo,
                'fin' => $agrupar === 'semana' ? $paso->copy()->addDays(6)->toDateString() : $periodo,
                'ingresos_totales' => round((float) $grupo->sum('total'), 2),
                'pedidos_completados' => $grupo->count(),
            ];
            $agrupar === 'semana' ? $paso->addWeek() : $paso->addDay();
        }

        $lineas = $entregados->flatMap->detalles;
        $totalUnidades = (int) $lineas->sum('cantidad');
        $ingresos = round((float) $entregados->sum('total'), 2);
        $cantidad = $entregados->count();
        $porcentaje = fn ($parte, $total) => $total > 0 ? round($parte * 100 / $total, 1) : 0;

        // Productos (y combos) más vendidos por unidades, con su porcentaje del total.
        $top = $lineas
            ->groupBy(fn ($d) => $d->combo_id ? 'c' . $d->combo_id : 'p' . $d->producto_id)
            ->map(fn ($lineas) => [
                'id_producto' => $lineas->first()->producto_id,
                'id_combo' => $lineas->first()->combo_id,
                'nombre' => $lineas->first()->nombre,
                'unidades' => (int) $lineas->sum('cantidad'),
                'ingresos' => round((float) $lineas->sum('subtotal'), 2),
                'pedidos' => $lineas->pluck('pedido_id')->unique()->count(),
            ])
            ->sortBy([['unidades', 'desc'], ['ingresos', 'desc']])
            ->take(10)->values()
            ->map(fn ($t) => $t + ['porcentaje' => $porcentaje($t['unidades'], $totalUnidades)]);

        // Días de la semana con más ventas (lunes a domingo, hora de La Paz).
        $nombresDia = [1 => 'Lunes', 2 => 'Martes', 3 => 'Miércoles', 4 => 'Jueves', 5 => 'Viernes', 6 => 'Sábado', 7 => 'Domingo'];
        $porDia = $entregados->groupBy(fn ($p) => $p->created_at->copy()->setTimezone($zona)->dayOfWeekIso);
        $diasSemana = collect($nombresDia)->map(function ($nombre, $numero) use ($porDia, $ingresos, $porcentaje) {
            $grupo = $porDia->get($numero, collect());
            $total = round((float) $grupo->sum('total'), 2);
            return [
                'dia' => $numero, 'nombre' => $nombre, 'ingresos' => $total,
                'pedidos' => $grupo->count(), 'porcentaje' => $porcentaje($total, $ingresos),
            ];
        })->values();

        // Ventas por categoría: cada línea cuenta en la categoría principal del producto
        // (así no se cuenta dos veces un producto que está en varias); los combos van aparte.
        $porCategoria = $lineas
            ->groupBy(fn ($d) => $d->combo_id ? 'Combos' : (optional($d->producto)->categoria ?: 'Sin categoría'))
            ->map(fn ($grupo, $categoria) => [
                'categoria' => $categoria,
                'ingresos' => round((float) $grupo->sum('subtotal'), 2),
                'unidades' => (int) $grupo->sum('cantidad'),
            ])
            ->sortByDesc('ingresos')->values()
            ->map(fn ($c) => $c + ['porcentaje' => $porcentaje($c['ingresos'], $ingresos)]);

        return response()->json([
            'desde' => $desde,
            'hasta' => $hasta,
            'agrupar' => $agrupar,
            'resumen' => [
                'ingresos_totales' => $ingresos,
                'pedidos_completados' => $cantidad,
                'unidades_vendidas' => $totalUnidades,
                'pedidos_cancelados' => $pedidos->where('estado', Pedido::CANCELADO)->count(),
            ],
            'ventas' => $ventas,
            'top_productos' => $top,
            'dias_semana' => $diasSemana,
            'por_categoria' => $porCategoria,
        ]);
    }

    /**
     * Detalle de un día: cada producto o combo vendido (pedidos entregados) con la hora del
     * pedido y de la entrega, el número de pedido, quién lo pidió, sus notas y qué llevaba cada
     * combo. Además el total por producto.
     */
    public function detalle(Request $request)
    {
        $request->validate(['fecha' => 'nullable|date_format:Y-m-d']);

        $zona = config('cafeteria.zona_horaria', 'America/La_Paz');
        $fecha = $request->input('fecha', now($zona)->toDateString());
        $inicio = Carbon::parse($fecha, $zona)->startOfDay()->utc();
        $fin = Carbon::parse($fecha, $zona)->endOfDay()->utc();

        $pedidos = Pedido::with(['detalles.combo.productos', 'usuario:id,name'])
            ->where('estado', Pedido::COMPLETADO)
            ->whereBetween('created_at', [$inicio, $fin])
            ->orderBy('created_at')->orderBy('id')
            ->get();

        $hora = fn ($f) => $f ? $f->copy()->setTimezone($zona)->format('H:i') : null;

        $lineas = $pedidos->flatMap(fn ($p) => $p->detalles->map(fn ($d) => [
            'pedido_id' => $p->id,
            'cliente' => optional($p->usuario)->name,
            'hora_pedido' => $hora($p->created_at),
            'hora_entrega' => $hora($p->entregado_at),
            'tipo' => $d->combo_id ? 'combo' : 'producto',
            'nombre' => $d->nombre,
            'cantidad' => (int) $d->cantidad,
            'precio_unitario' => round((float) $d->precio_unitario, 2),
            'subtotal' => round((float) $d->subtotal, 2),
            'notas' => $d->notas,
            'contenido' => $d->combo_id ? $this->contenidoCombo($d) : null,
        ]))->values();

        $porProducto = $lineas
            ->groupBy(fn ($l) => $l['tipo'] . '|' . $l['nombre'])
            ->map(fn ($grupo) => [
                'nombre' => $grupo->first()['nombre'],
                'tipo' => $grupo->first()['tipo'],
                'unidades' => $grupo->sum('cantidad'),
                'ingresos' => round($grupo->sum('subtotal'), 2),
                'con_notas' => $grupo->filter(fn ($l) => filled($l['notas']))->count(),
            ])
            ->sortBy([['unidades', 'desc'], ['ingresos', 'desc']])->values();

        return response()->json([
            'fecha' => $fecha,
            'resumen' => [
                'ingresos_totales' => round((float) $pedidos->sum('total'), 2),
                'pedidos_completados' => $pedidos->count(),
                'unidades_vendidas' => (int) $lineas->sum('cantidad'),
            ],
            'por_producto' => $porProducto,
            'lineas' => $lineas,
        ]);
    }

    /** Productos de un combo vendido: lo guardado en el pedido o, si no hay, lo que lleva hoy. */
    private function contenidoCombo($detalle): array
    {
        if (!empty($detalle->contenido)) {
            return $detalle->contenido;
        }
        return optional($detalle->combo)->productos
            ?->map(fn ($p) => ['nombre' => $p->nombre, 'cantidad' => (int) $p->pivot->cantidad])->values()->all() ?? [];
    }
}
