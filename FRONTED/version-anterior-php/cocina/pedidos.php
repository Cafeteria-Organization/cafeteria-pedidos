<?php
define('RUTA_BASE', '../');
require_once __DIR__ . '/../includes/auth_role.php';
require_once __DIR__ . '/../config/conexion.php';
exigir_rol(['cocina']);

$activo = 'cocina';
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pedidos entrantes · Cocina</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/style.css">
<link rel="stylesheet" href="../css/panel.css">
</head>
<body class="panel-body">

<?php require __DIR__ . '/../includes/panel_topbar.php'; ?>

<div class="panel-contenedor">
  <div class="panel-tarjeta">
    <div class="panel-fila-cabecera">
      <div>
        <h2 class="panel-titulo">Pedidos entrantes</h2>
        <p class="panel-subtitulo">Ordenados por hora de recepción. Se actualiza solo cada pocos segundos.</p>
      </div>
    </div>
    <div id="lista-pedidos">
      <?php require __DIR__ . '/../includes/cocina_pedidos_partial.php'; ?>
    </div>
  </div>
</div>

<?php require __DIR__ . '/../includes/pie.php'; ?>

<script src="../js/cocina.js"></script>
</body>
</html>
