<?php
/**
 * Crea la PRIMERA cuenta de administrador del sistema.
 *
 * HU-24 dice que es el administrador quien crea las demás cuentas de
 * personal, y HU-26 dice que es el administrador quien crea las cuentas
 * de estudiantes/docentes. Pero la primera cuenta administradora no la
 * puede crear nadie más: por eso existe este script aparte.
 *
 * Se autobloquea en cuanto exista un administrador activo, así que no
 * hay riesgo de que alguien más lo use después. Aun así, bórralo del
 * servidor una vez que hayas creado tu cuenta.
 */
session_start();
require_once __DIR__ . '/config/conexion.php';

$stmt = $pdo->prepare(
    "SELECT COUNT(*) AS total
     FROM usuarios u
     JOIN roles r ON r.id_rol = u.id_rol
     WHERE r.nombre = 'administrador'"
);
$stmt->execute();
$yaExisteAdmin = ((int) $stmt->fetch()['total']) > 0;

$errores = [];
$valores = ['nombres' => '', 'apellidos' => '', 'correo' => ''];

if (!$yaExisteAdmin && $_SERVER['REQUEST_METHOD'] === 'POST') {
    foreach ($valores as $campo => $valor) {
        $valores[$campo] = trim($_POST[$campo] ?? '');
    }
    $password           = $_POST['password'] ?? '';
    $confirmar_password = $_POST['confirmar_password'] ?? '';

    if ($valores['nombres'] === '') {
        $errores[] = 'Ingresa tus nombres.';
    }
    if ($valores['apellidos'] === '') {
        $errores[] = 'Ingresa tus apellidos.';
    }
    if ($valores['correo'] === '' || !filter_var($valores['correo'], FILTER_VALIDATE_EMAIL)) {
        $errores[] = 'Ingresa un correo válido.';
    }
    if (mb_strlen($password) < 8) {
        $errores[] = 'La contraseña debe tener al menos 8 caracteres.';
    }
    if ($password !== $confirmar_password) {
        $errores[] = 'Las contraseñas no coinciden.';
    }

    if (empty($errores)) {
        $stmt = $pdo->prepare("SELECT id_usuario FROM usuarios WHERE correo = :correo LIMIT 1");
        $stmt->execute(['correo' => $valores['correo']]);
        if ($stmt->fetch()) {
            $errores[] = 'Ya existe una cuenta con ese correo.';
        }
    }

    if (empty($errores)) {
        $stmt = $pdo->prepare("SELECT id_rol FROM roles WHERE nombre = 'administrador' LIMIT 1");
        $stmt->execute();
        $idRolAdmin = $stmt->fetch()['id_rol'] ?? null;

        if (!$idRolAdmin) {
            $errores[] = 'El rol "administrador" no existe. Ejecuta primero sql/seed_roles.sql.';
        } else {
            $stmt = $pdo->prepare(
                'INSERT INTO usuarios (id_rol, nombres, apellidos, correo, password_hash, estado)
                 VALUES (:id_rol, :nombres, :apellidos, :correo, :password_hash, 1)'
            );
            $stmt->execute([
                'id_rol'        => $idRolAdmin,
                'nombres'       => $valores['nombres'],
                'apellidos'     => $valores['apellidos'],
                'correo'        => $valores['correo'],
                'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            ]);

            $creado = true;
        }
    }
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Crear administrador · Cafetería Universitaria</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/style.css">
<link rel="stylesheet" href="css/panel.css">
</head>
<body class="fondo-oscuro">
<div class="pagina-centro">
  <div class="panel-tarjeta" style="max-width:480px;">
    <h1 class="panel-titulo">Crear administrador inicial</h1>

    <?php if ($yaExisteAdmin): ?>
      <div class="mensaje mensaje-error">
        Ya existe una cuenta de administrador. Este script ya no puede
        crear otra por aquí — bórralo del servidor y usa el panel de
        <em>Gestión de personal</em> para crear más cuentas de administrador.
      </div>
      <p><a class="btn-enviar" href="login.php" style="display:inline-block;text-decoration:none;text-align:center;">Ir a iniciar sesión</a></p>

    <?php elseif (!empty($creado)): ?>
      <div class="mensaje mensaje-exito">
        Cuenta de administrador creada. Ya puedes iniciar sesión, y por
        seguridad, borra este archivo (<code>admin_bootstrap.php</code>)
        del servidor.
      </div>
      <p><a class="btn-enviar" href="login.php" style="display:inline-block;text-decoration:none;text-align:center;">Ir a iniciar sesión</a></p>

    <?php else: ?>
      <?php if (!empty($errores)): ?>
        <div class="mensaje mensaje-error">
          <ul><?php foreach ($errores as $error): ?><li><?= htmlspecialchars($error) ?></li><?php endforeach; ?></ul>
        </div>
      <?php endif; ?>

      <form method="POST" novalidate>
        <div class="campo">
          <label for="nombres">Nombres</label>
          <input type="text" id="nombres" name="nombres" value="<?= htmlspecialchars($valores['nombres']) ?>" required>
        </div>
        <div class="campo">
          <label for="apellidos">Apellidos</label>
          <input type="text" id="apellidos" name="apellidos" value="<?= htmlspecialchars($valores['apellidos']) ?>" required>
        </div>
        <div class="campo">
          <label for="correo">Correo</label>
          <input type="email" id="correo" name="correo" value="<?= htmlspecialchars($valores['correo']) ?>" required>
        </div>
        <div class="campo">
          <label for="password">Contraseña</label>
          <input type="password" id="password" name="password" minlength="8" required>
        </div>
        <div class="campo">
          <label for="confirmar_password">Confirmar contraseña</label>
          <input type="password" id="confirmar_password" name="confirmar_password" minlength="8" required>
        </div>
        <button type="submit" class="btn-enviar">Crear administrador</button>
      </form>
    <?php endif; ?>
  </div>
</div>
</body>
</html>
