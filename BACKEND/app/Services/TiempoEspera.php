<?php

namespace App\Services;

use App\Models\Configuracion;
use App\Models\Producto;
use Illuminate\Support\Facades\DB;

// HU-11: cálculo del tiempo de espera estimado.
//
//   tiempo de un pedido = lo que tarda su producto más lento
//                         + 1 minuto por cada unidad adicional
//   espera por la cola  = suma del tiempo de los pedidos Pendientes
//                         (los "En preparación" cuentan la mitad, ya van avanzados)
//                         dividida entre la capacidad de cocina
//                         (cuántos pedidos se preparan a la vez)
//   tiempo estimado     = espera por la cola + tiempo de tu pedido (mínimo 5 min)
class TiempoEspera
{
    const MINUTOS_POR_UNIDAD_EXTRA = 1;
    const MINIMO = 5;

    public static function minutosPedido(int $productoMasLento, int $unidades): int
    {
        if ($unidades <= 0) return 0;
        return $productoMasLento + max(0, $unidades - 1) * self::MINUTOS_POR_UNIDAD_EXTRA;
    }

    // $unidades: [id_producto => cantidad] del pedido que se quiere hacer (puede estar vacío)
    public static function calcular(array $unidades = []): array
    {
        $capacidad = max(1, (int) Configuracion::valor('capacidad_cocina', 2));

        $cola = DB::select("SELECT p.estado, MAX(pr.tiempo_preparacion) AS mayor, SUM(d.cantidad) AS unidades
                              FROM PEDIDO p
                              JOIN DETALLE_PEDIDO d ON d.id_pedido = p.id_pedido
                              JOIN PRODUCTO pr ON pr.id_producto = d.id_producto
                             WHERE p.estado IN ('Pendiente', 'Preparando')
                             GROUP BY p.id_pedido, p.estado");

        $minutosCola = 0;
        foreach ($cola as $c) {
            $m = self::minutosPedido((int) $c->mayor, (int) $c->unidades);
            $minutosCola += $c->estado === 'Preparando' ? $m / 2 : $m;
        }
        $espera = (int) ceil($minutosCola / $capacidad);

        $tuPedido = 0;
        $unidades = array_filter($unidades, fn ($c) => $c > 0);
        if ($unidades) {
            $masLento = (int) Producto::whereIn('id_producto', array_keys($unidades))->max('tiempo_preparacion');
            $tuPedido = self::minutosPedido($masLento, (int) array_sum($unidades));
        }

        $total = max(self::MINIMO, $espera + $tuPedido);
        $hora = DB::selectOne("SELECT DATE_FORMAT(DATE_ADD(NOW(), INTERVAL ? MINUTE), '%H:%i') AS h", [$total])->h;

        return [
            'tiempo_estimado_minutos' => $total,
            'hora_estimada' => $hora,
            'pedidos_en_cola' => count($cola),
            'minutos_cola' => $espera,
            'minutos_preparacion' => $tuPedido,
            'capacidad_cocina' => $capacidad,
        ];
    }
}
