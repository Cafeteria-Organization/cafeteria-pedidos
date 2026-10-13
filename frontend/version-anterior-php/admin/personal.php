<?php
define('RUTA_BASE', '../');
require_once __DIR__ . '/../includes/auth_role.php';
require_once __DIR__ . '/../config/conexion.php';
exigir_rol(['administrador']);

$activo  = 'personal';
$errores = [];
$mensaje = $_SESSION['flash_ok'] ?? null;
unset($_SESSION['flash_ok']);

$rolesPersonal = ['cocina', 'caja', 'administrador'];
$valores = ['nombres' => '', 'apellidos' => '', 'correo' => '', 'rol' => 'cocina'];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $accion = $_POST['accion'] ?? '';

    // --- Crear cuenta de personal, con rol específico ---
    if ($accion === 'crear_personal') {
        foreach (['nombres', 'apellidos', 'correo'] as $campo) {
            $valores[$campo] = trim($_POST[$campo] ?? '');
        }
        $valores['rol']      = in_array($_POST['rol'] ?? '', $rolesPersonal, true) ? $_POST['rol'] : '';
        $password             = $_POST['password'] ?? '';
        $confirmarPassword    = $_POST['confirmar_password'] ?? '';

        if ($valores['nombres'] === '') $errores[] = 'Ingresa los nombres.';
        if ($valores['apellidos'] === '') $errores[] = 'Ingresa los apellidos.';
        if ($valores['correo'] === '' || !filter_var($valores['correo'], FILTER_VALIDATE_EMAIL)) {
            $errores[] = 'Ingresa un correo válido.';
        }
        if ($valores['rol'] === '') {
            $errores[] = 'Selecciona un rol (Cocina, Caja o Admin).';
        }
        if (mb_strlen($password) < 8) $errores[] = 'La contraseña inicial debe tener al menos 8 caracteres.';
        if ($password !== $confirmarPassword) $errores[] = 'Las contraseñas no coinciden.';

        if (empty($errores)) {
            $stmt = $pdo->prepare('SELECT id_usuario FROM usuarios WHERE correo = :correo LIMIT 1');
            $stmt->execute(['correo' => $valores['correo']]);
            if ($stmt->fetch()) $errores[] = 'Ese correo ya tiene una cuenta registrada.';
        }

        if (empty($errores)) {
            $stmt = $pdo->prepare('SELECT id_rol FROM roles WHERE nombre = :rol LIMIT 1');
            $stmt->execute(['rol' => $valores['rol']]);
            $idRol = $stmt->fetch()['id_rol'] ?? null;

            $stmt = $pdo->prepare(
                'INSERT INTO usuarios (id_rol, nombres, apellidos, correo, password_hash, estado, creado_por)
                 VALUES (:id_rol, :nombres, :apellidos, :correo, :password_hash, 1, :creado_por)'
            );
            $stmt->execute([
                'id_rol' => $idRol, 'nombres' => $valores['nombres'], 'apellidos' => $valores['apellidos'],
                'correo' => $valores['correo'], 'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                'creado_por' => $_SESSION['id_usuario'],
            ]);
            $_SESSION['flash_ok'] = 'Cuenta de personal creada con rol "' . $valores['rol'] . '".';
            header('Location: personal.php');
            exit;
        }
    }

    // --- Editar el rol de una cuenta existente ---
    if ($accion === 'cambiar_rol') {
        $id       = (int) ($_POST['id_usuario'] ?? 0);
        $nuevoRol = in_array($_POST['nuevo_rol'] ?? '', $rolesPersonal, true) ? $_POST['nuevo_rol'] : '';

        if ($id === (int) $_SESSION['id_usuario']) {
            $errores[] = 'No puedes cambiar tu propio rol desde aquí.';
        } elseif ($nuevoRol === '') {
            $errores[] = 'Selecciona un rol válido.';
        } else {
            $stmt = $pdo->prepare('SELECT id_rol FROM roles WHERE nombre = :rol LIMIT 1');
            $stmt->execute(['rol' => $nuevoRol]);
            $idRol = $stmt->fetch()['id_rol'] ?? null;

            $stmt = $pdo->prepare(
                'UPDATE usuarios SET id_rol = :id_rol, actualizado_por = :quien, actualizado_en = NOW()
                 WHERE id_usuario = :id'
            );
            $stmt->execute(['id_rol' => $idRol, 'quien' => $_SESSION['id_usuario'], 'id' => $id]);
            $_SESSION['flash_ok'] = 'Rol actualizado.';
            header('Location: personal.php');
            exit;
        }
    }

    // --- Revocar / restaurar acceso (activar o desactivar la cuenta) ---
    if ($accion === 'cambiar_estado') {
        $id           = (int) ($_POST['id_usuario'] ?? 0);
        $nuevoEstado  = ((int) ($_POST['nuevo_estado'] ?? 0)) === 1 ? 1 : 0;

        if ($id === (int) $_SESSION['id_usuario']) {
            $errores[] = 'No puedes revocarte el acceso a ti mismo.';
        } else {
            $stmt = $pdo->prepare(
                'UPDATE usuarios SET estado = :estado, actualizado_por = :quien, actualizado_en = NOW()
                 WHERE id_usuario = :id'
            );
            $stmt->execute(['estado' => $nuevoEstado, 'quien' => $_SESSION['id_usuario'], 'id' => $id]);
            $_SESSION['flash_ok'] = $nuevoEstado ? 'Acceso restaurado.' : 'Acceso revocado.';
            header('Location: personal.php');
            exit;
        }
    }
}

$personal = $pdo->query(
    "SELECT u.id_usuario, u.nombres, u.apellidos, u.correo, u.estado, r.nombre AS rol,
            creador.nombres AS creado_por_nombre, editor.nombres AS actualizado_por_nombre,
            u.actualizado_en
     FROM usuarios u
     JOIN roles r ON r.id_rol = u.id_rol
     LEFT JOIN usuarios creador ON creador.id_usuario = u.creado_por
     LEFT JOIN usuarios editor  ON editor.id_usuario  = u.actualizado_por
     WHERE r.nombre IN ('cocina', 'caja', 'administrador')
     ORDER BY u.id_usuario DESC"
)->fetchAll();
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Personal y roles · Administración</title>
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
    <h2 class="panel-titulo">Crear cuenta de personal</h2>
    <p class="panel-subtitulo">Asigna un rol específico: Cocina, Caja o Admin. Cada rol solo ve sus propias funciones.</p>

    <form method="POST" class="panel-form">
      <input type="hidden" name="accion" value="crear_personal">

      <div class="campo">
        <label for="nombres">Nombres</label>
        <input type="text" id="nombres" name="nombres" required value="<?= htmlspecialchars($valores['nombres']) ?>">
      </div>
      <div class="campo">
        <label for="apellidos">Apellidos</label>
        <input type="text" id="apellidos" name="apellidos" required value="<?= htmlspecialchars($valores['apellidos']) ?>">
      </div>
      <div class="campo campo-ancho">
        <label for="correo">Correo</label>
        <input type="email" id="correo" name="correo" required value="<?= htmlspecialchars($valores['correo']) ?>">
      </div>
      <div class="campo">
        <label for="rol">Rol</label>
        <select id="rol" name="rol" required>
          <option value="cocina" <?= $valores['rol'] === 'cocina' ? 'selected' : '' ?>>Cocina</option>
          <option value="caja" <?= $valores['rol'] === 'caja' ? 'selected' : '' ?>>Caja</option>
          <option value="administrador" <?= $valores['rol'] === 'administrador' ? 'selected' : '' ?>>Admin</option>
        </select>
      </div>
      <div class="campo">
        <label for="password">Contraseña inicial</label>
        <input type="password" id="password" name="password" minlength="8" required>
      </div>
      <div class="campo">
        <label for="confirmar_password">Confirmar contraseña</label>
        <input type="password" id="confirmar_password" name="confirmar_password" minlength="8" required>
      </div>

      <div class="campo-ancho">
        <button type="submit" class="btn-enviar">Crear cuenta de personal</button>
      </div>
    </form>
  </div>

  <div class="panel-tarjeta">
    <h2 class="panel-titulo">Personal registrado</h2>
    <div class="tabla-wrap">
      <table class="panel-tabla">
        <thead>
          <tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Creado por</th><th>Última edición</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          <?php foreach ($personal as $p): ?>
            <tr>
              <td><?= htmlspecialchars($p['nombres'] . ' ' . $p['apellidos']) ?></td>
              <td><?= htmlspecialchars($p['correo']) ?></td>
              <td><span class="badge badge-ambar"><?= htmlspecialchars(ucfirst($p['rol'])) ?></span></td>
              <td><span class="badge <?= $p['estado'] ? 'badge-verde' : 'badge-gris' ?>"><?= $p['estado'] ? 'Activa' : 'Revocada' ?></span></td>
              <td><?= htmlspecialchars($p['creado_por_nombre'] ?? '—') ?></td>
              <td>
                <?php if ($p['actualizado_por_nombre']): ?>
                  <?= htmlspecialchars($p['actualizado_por_nombre']) ?><br>
                  <span class="pedido-hora"><?= htmlspecialchars($p['actualizado_en']) ?></span>
                <?php else: ?>—<?php endif; ?>
              </td>
              <td class="panel-tabla-acciones">
                <?php if ((int) $p['id_usuario'] !== (int) $_SESSION['id_usuario']): ?>
                  <form method="POST" style="display:flex; gap:4px;">
                    <input type="hidden" name="accion" value="cambiar_rol">
                    <input type="hidden" name="id_usuario" value="<?= (int) $p['id_usuario'] ?>">
                    <select name="nuevo_rol" class="btn-sm">
                      <option value="cocina" <?= $p['rol'] === 'cocina' ? 'selected' : '' ?>>Cocina</option>
                      <option value="caja" <?= $p['rol'] === 'caja' ? 'selected' : '' ?>>Caja</option>
                      <option value="administrador" <?= $p['rol'] === 'administrador' ? 'selected' : '' ?>>Admin</option>
                    </select>
                    <button type="submit" class="btn-secundario btn-sm">Cambiar</button>
                  </form>
                  <form method="POST" onsubmit="return confirm('<?= $p['estado'] ? '¿Revocar el acceso de esta cuenta?' : '¿Restaurar el acceso de esta cuenta?' ?>');">
                    <input type="hidden" name="accion" value="cambiar_estado">
                    <input type="hidden" name="id_usuario" value="<?= (int) $p['id_usuario'] ?>">
                    <input type="hidden" name="nuevo_estado" value="<?= $p['estado'] ? 0 : 1 ?>">
                    <button type="submit" class="<?= $p['estado'] ? 'btn-peligro' : 'btn-secundario' ?> btn-sm">
                      <?= $p['estado'] ? 'Revocar' : 'Restaurar' ?>
                    </button>
                  </form>
                <?php else: ?>
                  <span class="pedido-hora">Esta es tu cuenta</span>
                <?php endif; ?>
              </td>
            </tr>
          <?php endforeach; ?>
          <?php if (empty($personal)): ?>
            <tr><td colspan="7">Todavía no hay cuentas de personal.</td></tr>
          <?php endif; ?>
        </tbody>
      </table>
    </div>
  </div>

</div>

<?php require __DIR__ . '/../includes/pie.php'; ?>
</body>
</html>
