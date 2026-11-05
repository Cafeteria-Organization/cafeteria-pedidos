<?php
define('RUTA_BASE', '../');
require_once __DIR__ . '/../includes/auth_role.php';
require_once __DIR__ . '/../config/conexion.php';
exigir_rol(['cocina']);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Método no permitido.']);
    exit;
}

$idPedido = (int) ($_POST['id_pedido'] ?? 0);
if ($idPedido <= 0) {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'Pedido inválido.']);
    exit;
}

// Solo puede pasar de "pendiente" a "en_preparacion" (atendido por cocina).
// El paso a "listo" / notificación al cliente pertenece a otra historia.
$stmt = $pdo->prepare(
    "UPDATE pedidos
     SET estado = 'en_preparacion', atendido_en = NOW()
     WHERE id_pedido = :id AND estado = 'pendiente'"
);
$stmt->execute(['id' => $idPedido]);

if ($stmt->rowCount() === 0) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'El pedido ya no está pendiente o no existe.']);
    exit;
}

echo json_encode(['ok' => true]);
