<?php
/**
 * Espera $pdo (PDO) y $q (string, puede ser '') ya definidas.
 * HU-01: nombre, precio, descripción y disponibilidad de cada producto.
 * HU-02: búsqueda por nombre (o palabra relacionada en la descripción),
 *        coincidencia parcial, sin distinguir mayúsculas/minúsculas.
 *
 * La lógica de consulta es la misma de siempre; solo cambió cómo se dibuja
 * (franja de categorías + carruseles de tarjetas con foto).
 */
require_once __DIR__ . '/arte.php';
require_once __DIR__ . '/esquema_ui.php';

$q = trim($q ?? '');
$colImagen = columna_imagen_disponible($pdo) ? 'p.imagen' : 'NULL AS imagen';

if ($q !== '') {
    $stmt = $pdo->prepare(
        "SELECT p.id_producto, p.nombre, p.descripcion, p.precio, p.disponible, $colImagen,
                c.id_categoria, c.nombre AS categoria
         FROM productos p
         JOIN categorias c ON c.id_categoria = p.id_categoria
         WHERE c.estado = 1
           AND (LOWER(p.nombre) LIKE LOWER(:q_nombre) OR LOWER(p.descripcion) LIKE LOWER(:q_descripcion))
         ORDER BY c.nombre, p.nombre"
    );
    $patron = '%' . $q . '%';
    // Dos nombres distintos: con prepares nativos no se puede repetir el mismo :parámetro.
    $stmt->execute(['q_nombre' => $patron, 'q_descripcion' => $patron]);
} else {
    $stmt = $pdo->prepare(
        "SELECT p.id_producto, p.nombre, p.descripcion, p.precio, p.disponible, $colImagen,
                c.id_categoria, c.nombre AS categoria
         FROM productos p
         JOIN categorias c ON c.id_categoria = p.id_categoria
         WHERE c.estado = 1
         ORDER BY c.nombre, p.nombre"
    );
    $stmt->execute();
}
$productos = $stmt->fetchAll();

if (empty($productos)) {
    echo '<div class="menu-secciones">';
    if ($q !== '') {
        echo '<p class="sin-resultados">No encontramos productos que coincidan con "' . htmlspecialchars($q) . '".</p>';
    } else {
        echo '<p class="sin-resultados">Todavía no hay productos cargados en el menú.</p>';
    }
    echo '</div>';
    return;
}

$porCategoria = [];
foreach ($productos as $p) {
    $porCategoria[$p['id_categoria']]['nombre']  = $p['categoria'];
    $porCategoria[$p['id_categoria']]['items'][] = $p;
}
?>
<nav class="franja-categorias" aria-label="Categorías del menú">
  <?php foreach ($porCategoria as $idCat => $cat): ?>
    <a class="franja-item" href="#cat-<?= (int) $idCat ?>">
      <?= icono_categoria($cat['nombre']) ?>
      <span><?= htmlspecialchars($cat['nombre']) ?></span>
    </a>
  <?php endforeach; ?>
</nav>

<div class="menu-secciones">
  <svg width="0" height="0" style="position:absolute" aria-hidden="true"><?= arte_defs_taza('ph') ?></svg>

  <?php foreach ($porCategoria as $idCat => $cat): ?>
    <section class="menu-categoria" id="cat-<?= (int) $idCat ?>">
      <h2 class="menu-categoria-titulo"><?= htmlspecialchars($cat['nombre']) ?></h2>

      <div class="carrusel">
        <button type="button" class="flecha flecha-izq" data-dir="-1" aria-label="Ver anteriores">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>
        </button>

        <div class="carrusel-pista">
          <?php foreach ($cat['items'] as $p): ?>
            <?php $urlImg = url_imagen_producto($p['imagen'] ?? null); ?>
            <article class="producto-card <?= $p['disponible'] ? '' : 'no-disponible' ?>">
              <div class="producto-img tono-<?= (int) $p['id_producto'] % 4 ?>">
                <?php if ($urlImg): ?>
                  <img src="<?= htmlspecialchars($urlImg) ?>" alt="<?= htmlspecialchars($p['nombre']) ?>" loading="lazy">
                <?php else: ?>
                  <svg viewBox="-200 -200 400 400" role="presentation"><?= arte_taza('ph') ?></svg>
                <?php endif; ?>
              </div>
              <h3 class="producto-nombre"><?= htmlspecialchars($p['nombre']) ?></h3>
              <p class="producto-descripcion"><?= !empty($p['descripcion']) ? htmlspecialchars($p['descripcion']) : '&nbsp;' ?></p>
              <div class="producto-pie">
                <span class="producto-precio">Bs <?= number_format((float) $p['precio'], 2) ?></span>
                <span class="badge <?= $p['disponible'] ? 'badge-verde' : 'badge-rojo' ?>">
                  <?= $p['disponible'] ? 'Disponible' : 'Agotado' ?>
                </span>
              </div>
            </article>
          <?php endforeach; ?>
        </div>

        <button type="button" class="flecha flecha-der" data-dir="1" aria-label="Ver siguientes">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </button>
      </div>
    </section>
  <?php endforeach; ?>
</div>