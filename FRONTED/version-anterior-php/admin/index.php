<?php
define('RUTA_BASE', '../');
require_once __DIR__ . '/../includes/auth_role.php';
require_once __DIR__ . '/../config/conexion.php';
exigir_rol(['administrador']);

$activo = '';
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Administración · Cafetería Universitaria</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/style.css">
<link rel="stylesheet" href="../css/panel.css">
</head>
<body class="panel-body">

<?php require __DIR__ . '/../includes/panel_topbar.php'; ?>

<div class="panel-contenedor">
  <div class="panel-tarjeta">
    <h2 class="panel-titulo">Hola, <?= htmlspecialchars($_SESSION['nombres']) ?></h2>
    <p class="panel-subtitulo">Esto es lo que está listo en la primera iteración.</p>

    <div class="tiles-admin">
      <a href="productos.php" class="tile-admin">
        <span class="tile-admin-titulo">Productos y categorías</span>
        <span class="tile-admin-texto">Crear, editar y eliminar productos del menú digital (HU-20).</span>
      </a>
      <a href="estudiantes.php" class="tile-admin">
        <span class="tile-admin-titulo">Estudiantes y docentes</span>
        <span class="tile-admin-texto">Registrar las cuentas con las que inician sesión (HU-26).</span>
      </a>
      <a href="personal.php" class="tile-admin">
        <span class="tile-admin-titulo">Personal y roles</span>
        <span class="tile-admin-texto">Cuentas de Cocina, Caja y Admin, y sus permisos (HU-24).</span>
      </a>
    </div>
  </div>
</div>

<?php require __DIR__ . '/../includes/pie.php'; ?>
</body>
</html>
