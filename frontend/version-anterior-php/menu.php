<?php
define('RUTA_BASE', '');
require_once __DIR__ . '/includes/auth_role.php';
require_once __DIR__ . '/config/conexion.php';
require_once __DIR__ . '/includes/arte.php';
exigir_rol(['estudiante', 'docente']);

$q = trim($_GET['q'] ?? '');
$activo = 'menu';
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Menú · Cafetería Universitaria</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/style.css">
<link rel="stylesheet" href="css/panel.css">
</head>
<body class="panel-body">

<?php require __DIR__ . '/includes/panel_topbar.php'; ?>

<section class="hero">
  <div class="hero-arte" aria-hidden="true"><?= arte_hero('mn') ?></div>
  <div class="hero-contenido">
    <p class="eyebrow">Menú digital</p>
    <h1 class="hero-titulo">Servimos el café más rico del campus</h1>
    <p class="hero-texto">Consulta qué hay disponible hoy antes de acercarte a la cafetería.</p>

    <form class="buscador" id="form-buscador" action="menu.php" method="GET" role="search">
      <input type="text" id="campo-busqueda" name="q" placeholder="Busca por nombre, ej. salteña, café..."
             value="<?= htmlspecialchars($q) ?>" autocomplete="off">
      <button type="submit" class="btn-enviar">Buscar</button>
    </form>
  </div>
</section>

<div id="menu-resultados">
  <?php require __DIR__ . '/includes/menu_partial.php'; ?>
</div>

<section class="banner-granos">
  <svg class="banner-granos-izq" viewBox="0 0 300 170" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><?= arte_granos(48, 21, 300, 170, 'bl') ?></svg>
  <div class="banner-texto">
    <h2>Pide antes de llegar<br>y salta la fila</h2>
    <a class="btn-oscuro" href="#form-buscador">Buscar en el menú</a>
  </div>
  <svg class="banner-granos-der" viewBox="0 0 300 170" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><?= arte_granos(48, 33, 300, 170, 'br') ?></svg>
</section>

<?php require __DIR__ . '/includes/pie.php'; ?>

<script src="js/menu.js"></script>
</body>
</html>
