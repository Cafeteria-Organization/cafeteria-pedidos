<?php
/**
 * Pie de página oscuro. Solo muestra enlaces reales del sistema según el rol.
 * Requiere RUTA_BASE y la sesión iniciada.
 */
$rolPie = $_SESSION['rol'] ?? '';
?>
<footer class="pie">
  <div class="pie-grid">
    <div class="pie-col pie-marca">
      <span class="pie-logo">Cafetería</span>
      <p>Pide antes de llegar y salta la fila. Tu turno te espera listo.</p>
    </div>

    <div class="pie-col">
      <h4>Secciones</h4>
      <?php if (in_array($rolPie, ['estudiante', 'docente'], true)): ?>
        <a href="<?= RUTA_BASE ?>menu.php">Menú digital</a>
      <?php elseif ($rolPie === 'cocina'): ?>
        <a href="<?= RUTA_BASE ?>cocina/pedidos.php">Pedidos entrantes</a>
      <?php elseif ($rolPie === 'administrador'): ?>
        <a href="<?= RUTA_BASE ?>admin/productos.php">Productos</a>
        <a href="<?= RUTA_BASE ?>admin/estudiantes.php">Estudiantes y docentes</a>
        <a href="<?= RUTA_BASE ?>admin/personal.php">Personal y roles</a>
      <?php endif; ?>
    </div>

    <div class="pie-col">
      <h4>Tu cuenta</h4>
      <span><?= htmlspecialchars(trim(($_SESSION['nombres'] ?? '') . ' ' . ($_SESSION['apellidos'] ?? ''))) ?></span>
      <span><?= htmlspecialchars(ucfirst($rolPie)) ?></span>
      <a href="<?= RUTA_BASE ?>logout.php">Cerrar sesión</a>
    </div>
  </div>
  <p class="pie-copy">© <?= date('Y') ?> Cafetería Universitaria</p>
</footer>
