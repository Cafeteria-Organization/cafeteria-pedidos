<?php
define('RUTA_BASE', '../');
require_once __DIR__ . '/../includes/auth_role.php';
require_once __DIR__ . '/../config/conexion.php';
require_once __DIR__ . '/../includes/esquema_ui.php';
exigir_rol(['administrador']);

// Foto opcional por producto (nueva interfaz). Si la columna no se pudo
// crear, el módulo sigue funcionando igual que antes, sin fotos.
$colImg = columna_imagen_disponible($pdo);

$activo   = 'productos';
$errores  = [];
$mensaje  = $_SESSION['flash_ok'] ?? null;
unset($_SESSION['flash_ok']);

// ------------------------------------------------------------
// Acciones (POST) — patrón post/redirect/get para evitar reenvíos.
// ------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $accion = $_POST['accion'] ?? '';

    if ($accion === 'crear_categoria') {
        $nombre = trim($_POST['nombre_categoria'] ?? '');
        if ($nombre === '') {
            $errores[] = 'El nombre de la categoría es obligatorio.';
        } else {
            $stmt = $pdo->prepare('INSERT IGNORE INTO categorias (nombre) VALUES (:n)');
            $stmt->execute(['n' => $nombre]);
            $_SESSION['flash_ok'] = 'Categoría creada.';
            header('Location: productos.php');
            exit;
        }
    }

    if ($accion === 'guardar_producto') {
        $id          = (int) ($_POST['id_producto'] ?? 0);
        $nombre      = trim($_POST['nombre'] ?? '');
        $descripcion = trim($_POST['descripcion'] ?? '');
        $precio      = $_POST['precio'] ?? '';
        $idCategoria = (int) ($_POST['id_categoria'] ?? 0);
        $disponible  = isset($_POST['disponible']) ? 1 : 0;

        // El sistema debe validar que los campos obligatorios estén
        // completos antes de guardar.
        if ($nombre === '' || mb_strlen($nombre) > 100) {
            $errores[] = 'El nombre del producto es obligatorio (máx. 100 caracteres).';
        }
        if ($idCategoria <= 0) {
            $errores[] = 'Selecciona una categoría.';
        }
        if ($precio === '' || !is_numeric($precio) || (float) $precio < 0) {
            $errores[] = 'Ingresa un precio válido.';
        }

        // Foto del producto (opcional): JPG, PNG o WEBP de hasta 2 MB.
        $extImagen = null;
        $subida    = $_FILES['imagen'] ?? null;
        $quitarImg = isset($_POST['quitar_imagen']);
        if ($colImg && $subida && $subida['error'] !== UPLOAD_ERR_NO_FILE) {
            if ($subida['error'] !== UPLOAD_ERR_OK) {
                $errores[] = 'No se pudo subir la imagen. Intenta con otro archivo.';
            } elseif ($subida['size'] > 2 * 1024 * 1024) {
                $errores[] = 'La imagen no debe pesar más de 2 MB.';
            } else {
                $mime = (new finfo(FILEINFO_MIME_TYPE))->file($subida['tmp_name']);
                $permitidos = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
                if (!isset($permitidos[$mime])) {
                    $errores[] = 'La imagen debe ser JPG, PNG o WEBP.';
                } else {
                    $extImagen = $permitidos[$mime];
                }
            }
        }

        if (empty($errores)) {
            // Imagen anterior (si se está editando) para poder reemplazarla o quitarla.
            $imagenAnterior = null;
            if ($colImg && $id > 0) {
                $stmtImg = $pdo->prepare('SELECT imagen FROM productos WHERE id_producto = :id');
                $stmtImg->execute(['id' => $id]);
                $imagenAnterior = $stmtImg->fetchColumn() ?: null;
            }

            $imagenNueva   = $imagenAnterior;
            $cambiaImagen  = false;
            if ($colImg && $extImagen !== null) {
                $carpeta = carpeta_imagenes_productos();
                if (!is_dir($carpeta)) {
                    mkdir($carpeta, 0755, true);
                }
                $archivo = 'p_' . bin2hex(random_bytes(8)) . '.' . $extImagen;
                if (move_uploaded_file($subida['tmp_name'], $carpeta . $archivo)) {
                    $imagenNueva  = 'img/productos/' . $archivo;
                    $cambiaImagen = true;
                }
            } elseif ($colImg && $quitarImg && $imagenAnterior) {
                $imagenNueva  = null;
                $cambiaImagen = true;
            }

            if ($id > 0) {
                $sql = 'UPDATE productos
                        SET nombre = :nombre, descripcion = :descripcion, precio = :precio,
                            id_categoria = :id_categoria, disponible = :disponible'
                     . ($cambiaImagen ? ', imagen = :imagen' : '')
                     . ' WHERE id_producto = :id';
                $params = [
                    'nombre' => $nombre, 'descripcion' => $descripcion !== '' ? $descripcion : null,
                    'precio' => $precio, 'id_categoria' => $idCategoria,
                    'disponible' => $disponible, 'id' => $id,
                ];
                if ($cambiaImagen) {
                    $params['imagen'] = $imagenNueva;
                }
                $pdo->prepare($sql)->execute($params);
                $_SESSION['flash_ok'] = 'Producto actualizado.';
            } else {
                $sql = 'INSERT INTO productos (nombre, descripcion, precio, id_categoria, disponible'
                     . ($cambiaImagen ? ', imagen' : '') . ')
                     VALUES (:nombre, :descripcion, :precio, :id_categoria, :disponible'
                     . ($cambiaImagen ? ', :imagen' : '') . ')';
                $params = [
                    'nombre' => $nombre, 'descripcion' => $descripcion !== '' ? $descripcion : null,
                    'precio' => $precio, 'id_categoria' => $idCategoria, 'disponible' => $disponible,
                ];
                if ($cambiaImagen) {
                    $params['imagen'] = $imagenNueva;
                }
                $pdo->prepare($sql)->execute($params);
                $_SESSION['flash_ok'] = 'Producto creado. Ya aparece en el menú digital.';
            }

            // Si se reemplazó o quitó la foto, borramos el archivo viejo del servidor.
            if ($cambiaImagen && $imagenAnterior && strpos($imagenAnterior, 'img/productos/') === 0) {
                @unlink(dirname(__DIR__) . '/' . $imagenAnterior);
            }

            header('Location: productos.php');
            exit;
        }
    }

    if ($accion === 'eliminar_producto') {
        $id = (int) ($_POST['id_producto'] ?? 0);
        $imagenBorrar = null;
        if ($colImg) {
            $stmtImg = $pdo->prepare('SELECT imagen FROM productos WHERE id_producto = :id');
            $stmtImg->execute(['id' => $id]);
            $imagenBorrar = $stmtImg->fetchColumn() ?: null;
        }
        try {
            $stmt = $pdo->prepare('DELETE FROM productos WHERE id_producto = :id');
            $stmt->execute(['id' => $id]);
            if ($imagenBorrar && strpos($imagenBorrar, 'img/productos/') === 0) {
                @unlink(dirname(__DIR__) . '/' . $imagenBorrar);
            }
            $_SESSION['flash_ok'] = 'Producto eliminado.';
        } catch (PDOException $e) {
            // Tiene pedidos asociados: lo apagamos en vez de romper el historial.
            $stmt = $pdo->prepare('UPDATE productos SET disponible = 0 WHERE id_producto = :id');
            $stmt->execute(['id' => $id]);
            $_SESSION['flash_ok'] = 'Ese producto ya tiene pedidos registrados, así que se marcó como agotado en vez de eliminarse.';
        }
        header('Location: productos.php');
        exit;
    }
}

// ------------------------------------------------------------
// Datos para la vista
// ------------------------------------------------------------
$categorias = $pdo->query('SELECT id_categoria, nombre, estado FROM categorias ORDER BY nombre')->fetchAll();

$productos = $pdo->query(
    'SELECT p.id_producto, p.nombre, p.descripcion, p.precio, p.disponible, p.id_categoria, '
    . ($colImg ? 'p.imagen' : 'NULL AS imagen') . ', c.nombre AS categoria
     FROM productos p
     JOIN categorias c ON c.id_categoria = p.id_categoria
     ORDER BY c.nombre, p.nombre'
)->fetchAll();

$productoEditar = null;
if (isset($_GET['editar'])) {
    $stmt = $pdo->prepare(
        'SELECT id_producto, nombre, descripcion, precio, id_categoria, disponible, '
        . ($colImg ? 'imagen' : 'NULL AS imagen') . '
         FROM productos WHERE id_producto = :id LIMIT 1'
    );
    $stmt->execute(['id' => (int) $_GET['editar']]);
    $productoEditar = $stmt->fetch() ?: null;
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Productos · Administración</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/style.css">
<link rel="stylesheet" href="../css/panel.css">
</head>
<body class="panel-body">

<?php require __DIR__ . '/../includes/panel_topbar.php'; ?>

<div class="panel-contenedor">

  <?php if ($mensaje): ?>
    <div class="mensaje mensaje-exito" style="margin-bottom:16px;"><?= htmlspecialchars($mensaje) ?></div>
  <?php endif; ?>
  <?php if (!empty($errores)): ?>
    <div class="mensaje mensaje-error" style="margin-bottom:16px;">
      <ul><?php foreach ($errores as $error): ?><li><?= htmlspecialchars($error) ?></li><?php endforeach; ?></ul>
    </div>
  <?php endif; ?>

  <div class="panel-tarjeta">
    <h2 class="panel-titulo">Categorías</h2>
    <p class="panel-subtitulo">Agrupan los productos en el menú digital.</p>

    <div class="tabla-wrap" style="margin-bottom:18px;">
      <table class="panel-tabla">
        <thead><tr><th>Nombre</th><th>Estado</th></tr></thead>
        <tbody>
          <?php foreach ($categorias as $c): ?>
            <tr>
              <td><?= htmlspecialchars($c['nombre']) ?></td>
              <td><span class="badge <?= $c['estado'] ? 'badge-verde' : 'badge-gris' ?>"><?= $c['estado'] ? 'Activa' : 'Inactiva' ?></span></td>
            </tr>
          <?php endforeach; ?>
          <?php if (empty($categorias)): ?>
            <tr><td colspan="2">Aún no hay categorías.</td></tr>
          <?php endif; ?>
        </tbody>
      </table>
    </div>

    <form method="POST" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
      <input type="hidden" name="accion" value="crear_categoria">
      <div class="campo" style="flex:1; min-width:200px;">
        <label for="nombre_categoria">Nueva categoría</label>
        <input type="text" id="nombre_categoria" name="nombre_categoria" placeholder="Ej. Bebidas calientes" required maxlength="60">
      </div>
      <button type="submit" class="btn-secundario">Agregar categoría</button>
    </form>
  </div>

  <div class="panel-tarjeta">
    <h2 class="panel-titulo"><?= $productoEditar ? 'Editar producto' : 'Nuevo producto' ?></h2>
    <p class="panel-subtitulo">Los cambios se reflejan de inmediato en el menú digital de estudiantes y docentes.</p>

    <form method="POST" class="panel-form" enctype="multipart/form-data">
      <input type="hidden" name="accion" value="guardar_producto">
      <input type="hidden" name="id_producto" value="<?= (int) ($productoEditar['id_producto'] ?? 0) ?>">

      <div class="campo">
        <label for="nombre">Nombre</label>
        <input type="text" id="nombre" name="nombre" required maxlength="100"
               value="<?= htmlspecialchars($productoEditar['nombre'] ?? '') ?>">
      </div>

      <div class="campo">
        <label for="id_categoria">Categoría</label>
        <select id="id_categoria" name="id_categoria" required>
          <option value="">Selecciona...</option>
          <?php foreach ($categorias as $c): ?>
            <option value="<?= (int) $c['id_categoria'] ?>"
              <?= (isset($productoEditar['id_categoria']) && (int) $productoEditar['id_categoria'] === (int) $c['id_categoria']) ? 'selected' : '' ?>>
              <?= htmlspecialchars($c['nombre']) ?>
            </option>
          <?php endforeach; ?>
        </select>
      </div>

      <div class="campo">
        <label for="precio">Precio (Bs)</label>
        <input type="number" id="precio" name="precio" step="0.01" min="0" required
               value="<?= htmlspecialchars((string) ($productoEditar['precio'] ?? '')) ?>">
      </div>

      <div class="campo">
        <label for="disponible">Disponibilidad</label>
        <div class="campo-check">
          <input type="checkbox" id="disponible" name="disponible" value="1"
            <?= (!isset($productoEditar) || !empty($productoEditar['disponible'])) ? 'checked' : '' ?>>
          <label for="disponible" style="margin:0;">Disponible en el menú</label>
        </div>
      </div>

      <div class="campo campo-ancho">
        <label for="descripcion">Descripción</label>
        <textarea id="descripcion" name="descripcion" maxlength="255"><?= htmlspecialchars($productoEditar['descripcion'] ?? '') ?></textarea>
      </div>

      <?php if ($colImg): ?>
        <div class="campo campo-ancho">
          <label for="imagen">Foto del producto <span style="font-weight:400;">(opcional · JPG, PNG o WEBP, máx. 2 MB)</span></label>
          <?php $urlActual = url_imagen_producto($productoEditar['imagen'] ?? null); ?>
          <?php if ($urlActual): ?>
            <div class="foto-actual">
              <img src="<?= htmlspecialchars($urlActual) ?>" alt="Foto actual">
              <label class="campo-check" style="margin:0;">
                <input type="checkbox" name="quitar_imagen" value="1"> Quitar foto actual
              </label>
            </div>
          <?php endif; ?>
          <input type="file" id="imagen" name="imagen" accept="image/jpeg,image/png,image/webp">
        </div>
      <?php endif; ?>

      <div class="campo-ancho" style="display:flex; gap:10px;">
        <button type="submit" class="btn-enviar"><?= $productoEditar ? 'Guardar cambios' : 'Crear producto' ?></button>
        <?php if ($productoEditar): ?>
          <a href="productos.php" class="btn-secundario" style="text-decoration:none; display:inline-flex; align-items:center;">Cancelar edición</a>
        <?php endif; ?>
      </div>
    </form>
  </div>

  <div class="panel-tarjeta">
    <h2 class="panel-titulo">Catálogo actual</h2>
    <div class="tabla-wrap">
      <table class="panel-tabla">
        <thead>
          <tr><?php if ($colImg): ?><th>Foto</th><?php endif; ?><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Estado</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          <?php foreach ($productos as $p): ?>
            <tr>
              <?php if ($colImg): ?>
                <td>
                  <?php $urlMini = url_imagen_producto($p['imagen'] ?? null); ?>
                  <?php if ($urlMini): ?><img class="miniatura" src="<?= htmlspecialchars($urlMini) ?>" alt=""><?php else: ?><span class="miniatura miniatura-vacia"></span><?php endif; ?>
                </td>
              <?php endif; ?>
              <td><?= htmlspecialchars($p['nombre']) ?></td>
              <td><?= htmlspecialchars($p['categoria']) ?></td>
              <td>Bs <?= number_format((float) $p['precio'], 2) ?></td>
              <td><span class="badge <?= $p['disponible'] ? 'badge-verde' : 'badge-rojo' ?>"><?= $p['disponible'] ? 'Disponible' : 'Agotado' ?></span></td>
              <td class="panel-tabla-acciones">
                <a class="btn-secundario btn-sm" style="text-decoration:none;" href="productos.php?editar=<?= (int) $p['id_producto'] ?>">Editar</a>
                <form method="POST" onsubmit="return confirm('¿Eliminar este producto del catálogo?');">
                  <input type="hidden" name="accion" value="eliminar_producto">
                  <input type="hidden" name="id_producto" value="<?= (int) $p['id_producto'] ?>">
                  <button type="submit" class="btn-peligro btn-sm">Eliminar</button>
                </form>
              </td>
            </tr>
          <?php endforeach; ?>
          <?php if (empty($productos)): ?>
            <tr><td colspan="6">Aún no hay productos cargados.</td></tr>
          <?php endif; ?>
        </tbody>
      </table>
    </div>
  </div>

</div>

<?php require __DIR__ . '/../includes/pie.php'; ?>
</body>
</html>
