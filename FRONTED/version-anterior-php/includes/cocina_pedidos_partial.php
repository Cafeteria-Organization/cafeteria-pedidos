<?php
/** Espera $pdo (PDO) ya definida. */
$stmt = $pdo->query(
    "SELECT id_pedido, numero_turno, creado_en
     FROM pedidos
     WHERE estado = 'pendiente'
     ORDER BY creado_en ASC"
);
$pedidos = $stmt->fetchAll();

if (empty($pedidos)) {
    echo '<p class="sin-resultados">No hay pedidos entrantes por ahora. La lista se actualiza sola.</p>';
    return;
}

$idsPedidos = array_column($pedidos, 'id_pedido');
$marcadores = implode(',', array_fill(0, count($idsPedidos), '?'));

$stmtDetalle = $pdo->prepare(
    "SELECT d.id_pedido, d.cantidad, d.nota, p.nombre
     FROM detalle_pedido d
     JOIN productos p ON p.id_producto = d.id_producto
     WHERE d.id_pedido IN ($marcadores)
     ORDER BY d.id_detalle ASC"
);
$stmtDetalle->execute($idsPedidos);

$itemsPorPedido = [];
foreach ($stmtDetalle->fetchAll() as $item) {
    $itemsPorPedido[$item['id_pedido']][] = $item;
}
?>
<div class="pedidos-grid">
  <?php foreach ($pedidos as $pedido): ?>
    <div class="pedido-card" data-id-pedido="<?= (int) $pedido['id_pedido'] ?>">
      <div class="pedido-card-cabecera">
        <span class="pedido-turno">Turno <?= (int) $pedido['numero_turno'] ?></span>
        <span class="pedido-hora"><?= htmlspecialchars(date('H:i', strtotime($pedido['creado_en']))) ?></span>
      </div>
      <ul class="pedido-items">
        <?php foreach ($itemsPorPedido[$pedido['id_pedido']] ?? [] as $item): ?>
          <li>
            <?= (int) $item['cantidad'] ?>× <?= htmlspecialchars($item['nombre']) ?>
            <?php if (!empty($item['nota'])): ?>
              <br><span class="pedido-nota">Nota: <?= htmlspecialchars($item['nota']) ?></span>
            <?php endif; ?>
          </li>
        <?php endforeach; ?>
      </ul>
      <button type="button" class="btn-enviar btn-sm btn-marcar-atendido"
              data-id-pedido="<?= (int) $pedido['id_pedido'] ?>">
        Marcar como atendido
      </button>
    </div>
  <?php endforeach; ?>
</div>
