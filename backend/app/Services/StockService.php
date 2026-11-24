<?php

namespace App\Services;

use App\Exceptions\ReglaNegocioException;
use App\Models\MovimientoStock;
use App\Models\Producto;

/**
 * HU-09: toda variación de stock pasa por aquí.
 * - Registra el movimiento (historial de inventario).
 * - Marca el producto como Agotado automáticamente cuando llega a 0.
 * - Lo vuelve a habilitar cuando se repone desde 0.
 * Debe llamarse dentro de una transacción con el producto bloqueado (lockForUpdate).
 */
class StockService
{
    public function descontar(Producto $p, int $cantidad, ?int $pedidoId, ?int $userId): void
    {
        if (!$p->disponible) {
            throw new ReglaNegocioException("El producto '{$p->nombre}' no está disponible");
        }
        if ($p->stock < $cantidad) {
            throw new ReglaNegocioException("El producto '{$p->nombre}' no tiene stock suficiente (quedan {$p->stock})");
        }
        $this->aplicar($p, -$cantidad, 'pedido', $userId, $pedidoId);
    }

    public function devolver(Producto $p, int $cantidad, ?int $pedidoId, ?int $userId): void
    {
        $this->aplicar($p, $cantidad, 'cancelacion', $userId, $pedidoId);
    }

    public function reponer(Producto $p, int $cantidad, ?int $userId, ?string $motivo = null): void
    {
        $this->aplicar($p, $cantidad, 'reposicion', $userId, null, $motivo);
    }

    public function establecer(Producto $p, int $nuevoStock, ?int $userId, ?string $motivo = null): void
    {
        $this->aplicar($p, $nuevoStock - $p->stock, 'ajuste', $userId, null, $motivo);
    }

    public function registrarInicial(Producto $p, ?int $userId): void
    {
        if ($p->stock > 0) {
            MovimientoStock::create([
                'producto_id' => $p->id, 'user_id' => $userId, 'tipo' => 'inicial',
                'cantidad' => $p->stock, 'stock_resultante' => $p->stock,
            ]);
        }
    }

    /**
     * Deja en el historial una acción que no cambia el stock (marcar agotado, editar,
     * eliminar o restaurar), para saber quién la hizo y cuándo.
     */
    public function registrarEvento(Producto $p, string $tipo, ?int $userId, ?string $motivo = null): void
    {
        MovimientoStock::create([
            'producto_id' => $p->id, 'user_id' => $userId, 'tipo' => $tipo,
            'cantidad' => 0, 'stock_resultante' => $p->stock, 'motivo' => $motivo ? mb_substr($motivo, 0, 255) : null,
        ]);
    }

    private function aplicar(Producto $p, int $delta, string $tipo, ?int $userId, ?int $pedidoId, ?string $motivo = null): void
    {
        $antes = $p->stock;
        $p->stock = max(0, $antes + $delta);

        if ($p->stock === 0) {
            $p->disponible = false;                 // Agotado automático
        } elseif ($antes === 0) {
            $p->disponible = true;                  // vuelve al menú al reponer
        }
        $p->save();

        MovimientoStock::create([
            'producto_id' => $p->id, 'pedido_id' => $pedidoId, 'user_id' => $userId,
            'tipo' => $tipo, 'cantidad' => $delta, 'stock_resultante' => $p->stock, 'motivo' => $motivo,
        ]);
    }
}
