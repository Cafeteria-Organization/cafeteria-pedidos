<?php

namespace Database\Seeders;

use App\Models\Combo;
use App\Models\Pedido;
use App\Models\Producto;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Pedidos de ejemplo de las últimas semanas para que los reportes, la cocina y
 * "Mis pedidos" tengan datos: la mayoría entregados, algunos cancelados y unos pocos
 * activos hoy. No toca el stock (son pedidos de muestra).
 * Se puede correr varias veces: si ya existen, no vuelve a crearlos.
 */
class PedidoSeeder extends Seeder
{
    private const DIAS = 42;

    private const CLIENTES = [
        ['María Quispe', 'maria.quispe@univalle.edu'],
        ['Juan Mamani', 'juan.mamani@univalle.edu'],
        ['Lucía Choque', 'lucia.choque@univalle.edu'],
        ['Diego Flores', 'diego.flores@univalle.edu'],
        ['Valeria Gutiérrez', 'valeria.gutierrez@univalle.edu'],
        ['Carlos Condori', 'carlos.condori@univalle.edu'],
        ['Camila Rojas', 'camila.rojas@univalle.edu'],
        ['Andrés Vargas', 'andres.vargas@univalle.edu'],
    ];

    // Lo que más se pide (nombre => peso). Solo se usan los que existan en el menú.
    private const POPULARES = [
        'Café americano' => 9, 'Capuchino' => 8, 'Café con leche' => 7, 'Mocachino' => 4, 'Té o mate' => 5, 'Frapuchino' => 3,
        'Desayuno paceño' => 5, 'Revuelto de huevos' => 3, 'Panqueques' => 2, 'Waffles' => 2, 'Desayuno americano' => 2,
        'Sándwich de pollo' => 6, 'Jamón y queso caliente' => 8, 'Lomito con queso' => 4, 'Pollo crispy BBQ' => 3,
        'Triple de palta y huevo' => 3, 'Choripán' => 4, 'Hamburguesa clásica' => 7, 'Salchipapa' => 7, 'Hamburguesa BBQ' => 3,
        'Mini pique' => 3, 'Milanesa al plato' => 3, 'Ensalada César' => 3, 'Ensalada mexicana' => 2, 'Ensalada de atún' => 2,
        'Hamburguesa de quinoa' => 2, 'Almuerzo fit' => 3, 'Refresco 500ml' => 8, 'Jugo natural' => 6, 'Batido de frutilla' => 3,
        'Limonada con hierba buena' => 4, 'Batido de plátano con Oreo' => 2, 'Jugo verde quema grasa' => 2,
        'Brownie' => 4, 'Gelatina' => 5, 'Helado con brownie' => 2, 'Waffles con helado' => 1, 'Copa de helado' => 2,
    ];

    private const NOTAS = [
        'Cafetería' => ['poco azúcar', 'sin azúcar', 'leche deslactosada', 'bien caliente', 'para llevar'],
        'Desayunos' => ['huevo bien cocido', 'sin mantequilla', 'para llevar'],
        'Sándwiches' => ['sin tomate', 'sin cebolla', 'sin mayonesa', 'extra llajua', 'pan tostado'],
        'Comida caliente' => ['sin cebolla', 'extra llajua', 'sin mostaza', 'papas bien fritas'],
        'Ensaladas y fit' => ['aderezo aparte', 'sin cebolla', 'sin crutones'],
        'Bebidas' => ['sin hielo', 'poco hielo', 'sin azúcar'],
        'Postres' => ['para llevar', 'extra chocolate'],
        'Combo' => ['refresco sin hielo', 'sin tomate', 'para llevar'],
    ];

    // Horas del día (La Paz) y cuántos pedidos caen en cada franja: los recesos llenan más.
    private const FRANJAS = [[7.5, 9.0, 3], [9.75, 10.5, 5], [11.5, 13.5, 6], [15.0, 16.5, 2], [17.5, 18.5, 1]];

    public function run(): void
    {
        $zona = config('cafeteria.zona_horaria', 'America/La_Paz');
        mt_srand(20261120);   // siempre los mismos datos

        $clientes = collect(self::CLIENTES)->map(fn ($c) => User::firstOrCreate(
            ['email' => $c[1]], ['name' => $c[0], 'password' => Hash::make('password123'), 'rol' => User::ROL_ESTUDIANTE]
        ));
        if (Pedido::whereIn('user_id', $clientes->pluck('id'))->exists()) {
            $this->command?->info('Los pedidos de ejemplo ya existen: no se crearon otra vez.');
            return;
        }
        if ($demo = User::where('email', 'estudiante@univalle.edu')->first()) {
            $clientes->push($demo);
        }
        $personal = User::where('rol', User::ROL_EMPLEADO)->value('id') ?? User::where('rol', User::ROL_ADMIN)->value('id');

        $productos = Producto::whereIn('nombre', array_keys(self::POPULARES))->get()->keyBy('nombre');
        if ($productos->isEmpty() || !$personal) {
            $this->command?->warn('Faltan productos o personal: corre primero UserSeeder y ProductoSeeder.');
            return;
        }
        $pesos = $productos->map(fn ($p) => self::POPULARES[$p->nombre])->all();
        $combos = Combo::with('productos')->where('activo', true)->whereIn('nombre', ['Combo Estudiante'])->get();

        $ahora = now($zona);
        $hechos = 0;
        DB::transaction(function () use ($zona, $clientes, $personal, $productos, $pesos, $combos, $ahora, &$hechos) {
            for ($d = self::DIAS; $d >= 0; $d--) {
                $dia = $ahora->copy()->subDays($d)->startOfDay();
                if ($dia->isSunday()) {
                    continue;
                }
                $cuantos = $dia->isSaturday() ? mt_rand(3, 7) : mt_rand(9, 17);
                $horas = [];
                for ($i = 0; $i < $cuantos; $i++) {
                    $horas[] = $this->hora($dia);
                }
                sort($horas);
                foreach ($horas as $hora) {
                    if ($hora->gt($ahora)) {
                        continue;
                    }
                    $this->crearPedido($hora, $clientes->random(), $personal, $productos, $pesos, $combos, $ahora, $zona);
                    $hechos++;
                }
            }
            // Unos pedidos activos ahora mismo, para ver la cocina con trabajo.
            foreach ([38, 25, 14, 6, 2] as $i => $minutos) {
                $estado = [Pedido::PARA_ENTREGAR, Pedido::EN_PREPARACION, Pedido::EN_PREPARACION, Pedido::RECIBIDO, Pedido::RECIBIDO][$i];
                $this->crearPedido($ahora->copy()->subMinutes($minutos), $clientes->random(), $personal, $productos, $pesos, $combos, $ahora, $zona, $estado);
                $hechos++;
            }
        });

        $this->command?->info("Pedidos de ejemplo creados: {$hechos}.");
    }

    private function crearPedido(Carbon $hora, User $cliente, int $personal, $productos, array $pesos, $combos, Carbon $ahora, string $zona, ?string $estado = null): void
    {
        $estado ??= mt_rand(1, 100) <= 7 ? Pedido::CANCELADO : Pedido::COMPLETADO;

        // Líneas: 1 a 3 productos distintos y, a veces, un combo.
        $lineas = [];
        $elegidos = [];
        $n = [1, 1, 2, 2, 2, 3][mt_rand(0, 5)];
        while (count($elegidos) < $n) {
            $nombre = $this->alAzar($pesos);
            if (!in_array($nombre, $elegidos, true)) {
                $elegidos[] = $nombre;
            }
        }
        foreach ($elegidos as $nombre) {
            $p = $productos[$nombre];
            $cant = mt_rand(1, 100) <= 18 ? 2 : 1;
            $lineas[] = [
                'producto_id' => $p->id, 'combo_id' => null, 'nombre' => $p->nombre,
                'notas' => $this->nota($p->categoria), 'contenido' => null,
                'cantidad' => $cant, 'precio_unitario' => $p->precio, 'subtotal' => round($p->precio * $cant, 2),
            ];
        }
        if ($combos->isNotEmpty() && mt_rand(1, 100) <= 22) {
            $c = $combos->random();
            $contenido = $c->productos->map(fn ($p) => ['nombre' => $p->nombre, 'cantidad' => (int) $p->pivot->cantidad])->values()->all();
            $lineas[] = [
                'producto_id' => null, 'combo_id' => $c->id, 'nombre' => $c->nombre,
                'notas' => $this->nota('Combo'), 'contenido' => json_encode($contenido, JSON_UNESCAPED_UNICODE),
                'cantidad' => 1, 'precio_unitario' => $c->precio, 'subtotal' => round((float) $c->precio, 2),
            ];
        }

        // Historial de estados con tiempos parecidos a los reales.
        $pasos = [[Pedido::RECIBIDO, $hora->copy(), $cliente->id]];
        $t = $hora->copy();
        if ($estado === Pedido::CANCELADO) {
            $pasos[] = [Pedido::CANCELADO, $t->addMinutes(mt_rand(1, 4))->copy(), mt_rand(0, 1) ? $cliente->id : $personal];
        } else {
            foreach ([Pedido::EN_PREPARACION, Pedido::PARA_ENTREGAR, Pedido::COMPLETADO] as $siguiente) {
                $t->addMinutes(mt_rand(2, 7))->addSeconds(mt_rand(0, 59));
                if ($t->gt($ahora)) {   // pedido de hace poco: todavía está en curso
                    break;
                }
                $pasos[] = [$siguiente, $t->copy(), $personal];
                if ($siguiente === $estado) {
                    break;
                }
            }
            $estado = end($pasos)[0];
        }
        $entregado = $estado === Pedido::COMPLETADO ? end($pasos)[1] : null;

        $utc = fn (Carbon $f) => $f->copy()->utc()->format('Y-m-d H:i:s');
        // pedido_estados.created_at la pone MySQL con su hora local; se guarda igual.
        $horaEstado = fn (Carbon $f) => DB::getDriverName() === 'mysql' ? $f->copy()->setTimezone($zona)->format('Y-m-d H:i:s') : $utc($f);

        $id = DB::table('pedidos')->insertGetId([
            'user_id' => $cliente->id,
            'codigo' => in_array($estado, Pedido::ACTIVOS, true) ? $this->codigo() : null,   // el código se borra al terminar
            'estado' => $estado,
            'total' => round(array_sum(array_column($lineas, 'subtotal')), 2),
            'entregado_por' => $entregado ? $personal : null,
            'entregado_at' => $entregado ? $utc($entregado) : null,
            'created_at' => $utc($hora),
            'updated_at' => $utc(end($pasos)[1]),
        ]);
        DB::table('detalle_pedidos')->insert(array_map(fn ($l) => $l + [
            'pedido_id' => $id, 'created_at' => $utc($hora), 'updated_at' => $utc($hora),
        ], $lineas));
        DB::table('pedido_estados')->insert(array_map(fn ($p) => [
            'pedido_id' => $id, 'estado' => $p[0], 'user_id' => $p[2], 'created_at' => $horaEstado($p[1]),
        ], $pasos));
    }

    private function hora(Carbon $dia): Carbon
    {
        $total = array_sum(array_column(self::FRANJAS, 2));
        $r = mt_rand(1, $total);
        foreach (self::FRANJAS as [$desde, $hasta, $peso]) {
            if (($r -= $peso) <= 0) {
                $minuto = (int) round(($desde + ($hasta - $desde) * mt_rand(0, 1000) / 1000) * 60);
                return $dia->copy()->addMinutes($minuto)->addSeconds(mt_rand(0, 59));
            }
        }
        return $dia->copy()->setTime(12, 0);
    }

    private function alAzar(array $pesos): string
    {
        $r = mt_rand(1, array_sum($pesos));
        foreach ($pesos as $nombre => $peso) {
            if (($r -= $peso) <= 0) {
                return $nombre;
            }
        }
        return array_key_first($pesos);
    }

    private function nota(?string $categoria): ?string
    {
        $opciones = self::NOTAS[$categoria] ?? [];
        return $opciones && mt_rand(1, 100) <= 16 ? $opciones[mt_rand(0, count($opciones) - 1)] : null;
    }

    private function codigo(): string
    {
        $alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        do {
            $codigo = '';
            for ($i = 0; $i < 5; $i++) {
                $codigo .= $alfabeto[mt_rand(0, strlen($alfabeto) - 1)];
            }
        } while (Pedido::where('codigo', $codigo)->exists());
        return $codigo;
    }
}
