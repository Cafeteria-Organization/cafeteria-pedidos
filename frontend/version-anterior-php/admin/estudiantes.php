<?php
define('RUTA_BASE', '../');
require_once __DIR__ . '/../includes/auth_role.php';
require_once __DIR__ . '/../config/conexion.php';
exigir_rol(['administrador']);

$activo  = 'estudiantes';
$errores = [];
$mensaje = $_SESSION['flash_ok'] ?? null;
unset($_SESSION['flash_ok']);

$valores = ['tipo' => 'estudiante', 'nombres' => '', 'apellidos' => '', 'correo' => '', 'codigo_universitario' => ''];

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['accion'] ?? '') === 'crear_cuenta') {
    foreach (['nombres', 'apellidos', 'correo', 'codigo_universitario'] as $campo) {
        $valores[$campo] = trim($_POST[$campo] ?? '');
    }
    $valores['tipo'] = ($_POST['tipo'] ?? '') === 'docente' ? 'docente' : 'estudiante';
    $password           = $_POST['password'] ?? '';
    $confirmarPassword  = $_POST['confirmar_password'] ?? '';

    // El sistema debe solicitar los datos necesarios según el tipo de usuario.
    if ($valores['nombres'] === '' || mb_strlen($valores['nombres']) > 100) {
        $errores[] = 'Ingresa los nombres (máx. 100 caracteres).';
    }
    if ($valores['apellidos'] === '' || mb_strlen($valores['apellidos']) > 100) {
        $errores[] = 'Ingresa los apellidos (máx. 100 caracteres).';
    }
    if ($valores['correo'] === '' || !filter_var($valores['correo'], FILTER_VALIDATE_EMAIL)) {
        $errores[] = 'Ingresa un correo institucional válido.';
    }
    if ($valores['tipo'] === 'estudiante' && $valores['codigo_universitario'] !== '' && mb_strlen($valores['codigo_universitario']) > 30) {
        $errores[] = 'El código universitario es demasiado largo (máx. 30 caracteres).';
    }
    if (mb_strlen($password) < 8) {
        $errores[] = 'La contraseña inicial debe tener al menos 8 caracteres.';
    }
    if ($password !== $confirmarPassword) {
        $errores[] = 'Las contraseñas no coinciden.';
    }

    // El sistema debe validar que el correo institucional no esté registrado previamente.
    if (empty($errores)) {
        $stmt = $pdo->prepare('SELECT id_usuario FROM usuarios WHERE correo = :correo LIMIT 1');
        $stmt->execute(['correo' => $valores['correo']]);
        if ($stmt->fetch()) {
            $errores[] = 'Ese correo ya tiene una cuenta registrada.';
        }
    }

    // El sistema debe asignar automáticamente el rol de estudiante o docente.
    $idRol = null;
    if (empty($errores)) {
        $stmt = $pdo->prepare('SELECT id_rol FROM roles WHERE nombre = :rol LIMIT 1');
        $stmt->execute(['rol' => $valores['tipo']]);
        $fila = $stmt->fetch();
        if (!$fila) {
            $errores[] = 'El rol "' . $valores['tipo'] . '" no existe todavía. Ejecuta sql/schema_iteracion1.sql.';
        } else {
            $idRol = $fila['id_rol'];
        }
    }

    // El sistema debe almacenar la información y confirmar la creación exitosa.
    if (empty($errores)) {
        $stmt = $pdo->prepare(
            'INSERT INTO usuarios
                (id_rol, nombres, apellidos, correo, codigo_universitario, password_hash, estado, creado_por)
             VALUES
                (:id_rol, :nombres, :apellidos, :correo, :codigo_universitario, :password_hash, 1, :creado_por)'
        );
        $stmt->execute([
            'id_rol'               => $idRol,
            'nombres'               => $valores['nombres'],
            'apellidos'             => $valores['apellidos'],
            'correo'                => $valores['correo'],
            'codigo_universitario'  => $valores['codigo_universitario'] !== '' ? $valores['codigo_universitario'] : null,
            'password_hash'         => password_hash($password, PASSWORD_DEFAULT),
            'creado_por'            => $_SESSION['id_usuario'],
        ]);

        $_SESSION['flash_ok'] = 'Cuenta de ' . $valores['tipo'] . ' creada correctamente para ' . $valores['nombres'] . '.';
        header('Location: estudiantes.php');
        exit;
    }
}

$cuentas = $pdo->query(
    "SELECT u.id_usuario, u.nombres, u.apellidos, u.correo, u.codigo_universitario, u.estado, r.nombre AS rol
     FROM usuarios u
     JOIN roles r ON r.id_rol = u.id_rol
     WHERE r.nombre IN ('estudiante', 'docente')
     ORDER BY u.id_usuario DESC"
)->fetchAll();
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Estudiantes y docentes · Administración</title>
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
    <h2 class="panel-titulo">Registrar cuenta de estudiante o docente</h2>
    <p class="panel-subtitulo">El acceso a la plataforma se crea desde aquí; el usuario no se autoregistra.</p>

    <form method="POST" class="panel-form">
      <input type="hidden" name="accion" value="crear_cuenta">

      <div class="campo">
        <label for="tipo">Tipo de cuenta</label>
        <select id="tipo" name="tipo" required>
          <option value="estudiante" <?= $valores['tipo'] === 'estudiante' ? 'selected' : '' ?>>Estudiante</option>
          <option value="docente" <?= $valores['tipo'] === 'docente' ? 'selected' : '' ?>>Docente</option>
        </select>
      </div>

      <div class="campo">
        <label for="codigo_universitario">Código universitario <span style="font-weight:400;">(si aplica)</span></label>
        <input type="text" id="codigo_universitario" name="codigo_universitario" maxlength="30"
               value="<?= htmlspecialchars($valores['codigo_universitario']) ?>">
      </div>

      <div class="campo">
        <label for="nombres">Nombres</label>
        <input type="text" id="nombres" name="nombres" required maxlength="100" value="<?= htmlspecialchars($valores['nombres']) ?>">
      </div>

      <div class="campo">
        <label for="apellidos">Apellidos</label>
        <input type="text" id="apellidos" name="apellidos" required maxlength="100" value="<?= htmlspecialchars($valores['apellidos']) ?>">
      </div>

      <div class="campo campo-ancho">
        <label for="correo">Correo institucional</label>
        <input type="email" id="correo" name="correo" required value="<?= htmlspecialchars($valores['correo']) ?>">
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
        <button type="submit" class="btn-enviar">Crear cuenta</button>
      </div>
    </form>
  </div>

  <div class="panel-tarjeta">
    <h2 class="panel-titulo">Cuentas registradas</h2>
    <div class="tabla-wrap">
      <table class="panel-tabla">
        <thead><tr><th>Nombre</th><th>Correo</th><th>Tipo</th><th>Código</th><th>Estado</th></tr></thead>
        <tbody>
          <?php foreach ($cuentas as $c): ?>
            <tr>
              <td><?= htmlspecialchars($c['nombres'] . ' ' . $c['apellidos']) ?></td>
              <td><?= htmlspecialchars($c['correo']) ?></td>
              <td><span class="badge badge-ambar"><?= htmlspecialchars(ucfirst($c['rol'])) ?></span></td>
              <td><?= htmlspecialchars($c['codigo_universitario'] ?? '—') ?></td>
              <td><span class="badge <?= $c['estado'] ? 'badge-verde' : 'badge-gris' ?>"><?= $c['estado'] ? 'Activa' : 'Deshabilitada' ?></span></td>
            </tr>
          <?php endforeach; ?>
          <?php if (empty($cuentas)): ?>
            <tr><td colspan="5">Todavía no hay cuentas de estudiantes ni docentes.</td></tr>
          <?php endif; ?>
        </tbody>
      </table>
    </div>
  </div>

</div>

<?php require __DIR__ . '/../includes/pie.php'; ?>
</body>
</html>
