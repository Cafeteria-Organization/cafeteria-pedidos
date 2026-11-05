<?php
/**
 * Requiere que ya exista sesión ($_SESSION['rol'], $_SESSION['nombres'])
 * y la constante RUTA_BASE definida por el archivo que la incluye.
 * Variable opcional $activo (string) para resaltar el enlace actual.
 */
$rolSesion = $_SESSION['rol'] ?? '';
$activo    = $activo ?? '';
?>
<header class="panel-topbar">
  <a class="panel-marca" href="<?= RUTA_BASE ?>login.php">cafetería<span>universitaria</span></a>
  <nav class="panel-topbar-nav">
    <?php if (in_array($rolSesion, ['estudiante', 'docente'], true)): ?>
      <a href="<?= RUTA_BASE ?>menu.php" class="<?= $activo === 'menu' ? 'activo' : '' ?>">Menú</a>
    <?php endif; ?>

    <?php if ($rolSesion === 'cocina'): ?>
      <a href="<?= RUTA_BASE ?>cocina/pedidos.php" class="<?= $activo === 'cocina' ? 'activo' : '' ?>">Pedidos entrantes</a>
    <?php endif; ?>

    <?php if ($rolSesion === 'administrador'): ?>
      <a href="<?= RUTA_BASE ?>admin/productos.php" class="<?= $activo === 'productos' ? 'activo' : '' ?>">Productos</a>
      <a href="<?= RUTA_BASE ?>admin/estudiantes.php" class="<?= $activo === 'estudiantes' ? 'activo' : '' ?>">Estudiantes y docentes</a>
      <a href="<?= RUTA_BASE ?>admin/personal.php" class="<?= $activo === 'personal' ? 'activo' : '' ?>">Personal y roles</a>
    <?php endif; ?>
  </nav>
  <div class="panel-topbar-usuario">
    <span><?= htmlspecialchars($_SESSION['nombres'] ?? '') ?> · <?= htmlspecialchars(strtoupper($rolSesion)) ?></span>
    <a class="btn-pildora" href="<?= RUTA_BASE ?>logout.php">Cerrar sesión</a>
  </div>
</header>
