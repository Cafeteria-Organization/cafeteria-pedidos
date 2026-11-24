<?php

namespace Tests\Unit;

use App\Models\Pedido;
use PHPUnit\Framework\TestCase;

/** HU-07: el seguimiento visual y el flujo de estados no dependen de la base de datos. */
class PedidoProgresoTest extends TestCase
{
    public function test_progreso_en_tres_pasos(): void
    {
        $casos = [
            Pedido::RECIBIDO => [1, false],
            Pedido::EN_PREPARACION => [2, false],
            Pedido::PARA_ENTREGAR => [3, true],
            Pedido::COMPLETADO => [3, false],
            Pedido::CANCELADO => [0, false],
        ];

        foreach ($casos as $estado => [$paso, $listo]) {
            $p = new Pedido(['estado' => $estado]);
            $this->assertSame($paso, $p->progreso['paso'], $estado);
            $this->assertSame($listo, $p->progreso['listo_para_recoger'], $estado);
            $this->assertSame(3, $p->progreso['total_pasos']);
        }
    }

    public function test_las_transiciones_permitidas_son_lineales(): void
    {
        $this->assertSame([Pedido::EN_PREPARACION], Pedido::TRANSICIONES[Pedido::RECIBIDO]);
        $this->assertSame([Pedido::PARA_ENTREGAR], Pedido::TRANSICIONES[Pedido::EN_PREPARACION]);
        $this->assertArrayNotHasKey(Pedido::PARA_ENTREGAR, Pedido::TRANSICIONES); // solo sale con el código
        $this->assertArrayNotHasKey(Pedido::COMPLETADO, Pedido::TRANSICIONES);
        $this->assertArrayNotHasKey(Pedido::CANCELADO, Pedido::TRANSICIONES);
    }
}
