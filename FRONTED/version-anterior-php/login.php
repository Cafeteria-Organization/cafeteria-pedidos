<?php
session_start();
require_once __DIR__ . '/config/conexion.php';

// Si ya inició sesión, no tiene sentido ver el login de nuevo.
if (!empty($_SESSION['id_usuario'])) {
    define('RUTA_BASE', '');
    require_once __DIR__ . '/includes/auth_role.php';
    header('Location: ' . ruta_inicio_para_rol($_SESSION['rol'] ?? null));
    exit;
}

$errores = [];
$correo_enviado = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $correo   = trim($_POST['correo'] ?? '');
    $password = $_POST['password'] ?? '';
    $correo_enviado = $correo;

    if ($correo === '' || !filter_var($correo, FILTER_VALIDATE_EMAIL)) {
        $errores[] = 'Ingresa un correo válido.';
    }
    if ($password === '') {
        $errores[] = 'Ingresa tu contraseña.';
    }

    if (empty($errores)) {
        $stmt = $pdo->prepare(
            'SELECT u.id_usuario, u.id_rol, u.nombres, u.apellidos, u.password_hash, u.estado,
                    r.nombre AS rol
             FROM usuarios u
             JOIN roles r ON r.id_rol = u.id_rol
             WHERE u.correo = :correo
             LIMIT 1'
        );
        $stmt->execute(['correo' => $correo]);
        $usuario = $stmt->fetch();

        if (!$usuario || !password_verify($password, $usuario['password_hash'])) {
            $errores[] = 'Correo o contraseña incorrectos.';
        } elseif ((int) $usuario['estado'] !== 1) {
            $errores[] = 'Esta cuenta está deshabilitada. Contacta al administrador.';
        } else {
            // Login correcto
            session_regenerate_id(true);
            $_SESSION['id_usuario'] = $usuario['id_usuario'];
            $_SESSION['id_rol']     = $usuario['id_rol'];
            $_SESSION['rol']        = $usuario['rol'];
            $_SESSION['nombres']    = $usuario['nombres'];
            $_SESSION['apellidos']  = $usuario['apellidos'];

            define('RUTA_BASE', '');
            require_once __DIR__ . '/includes/auth_role.php';
            header('Location: ' . ruta_inicio_para_rol($usuario['rol']));
            exit;
        }
    }
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ingresar · Cafetería Universitaria</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/style.css">
</head>
<body class="fondo-oscuro">

<?php require_once __DIR__ . '/includes/arte.php'; ?>

<main class="login-hero">
  <div class="hero-arte" aria-hidden="true"><?= arte_hero('lg') ?></div>

  <div class="login-columna">
    <p class="eyebrow">Bienvenido</p>
    <h1 class="hero-titulo">Servimos el café más rico del campus</h1>

    <section class="login-card">
      <div id="panel-contenido">
        <h2 class="form-titulo">Bienvenido de vuelta</h2>
        <p class="form-subtitulo">Ingresa con tu correo y contraseña para hacer tu pedido.</p>

        <?php if (!empty($errores)): ?>
          <div class="mensaje mensaje-error">
            <ul>
              <?php foreach ($errores as $error): ?>
                <li><?= htmlspecialchars($error) ?></li>
              <?php endforeach; ?>
            </ul>
          </div>
        <?php endif; ?>

        <?php if (isset($_GET['registrado'])): ?>
          <div class="mensaje mensaje-exito">Cuenta creada. Ahora inicia sesión.</div>
        <?php endif; ?>

        <?php if (!empty($_SESSION['aviso_acceso'])): ?>
          <div class="mensaje mensaje-error"><?= htmlspecialchars($_SESSION['aviso_acceso']) ?></div>
          <?php unset($_SESSION['aviso_acceso']); ?>
        <?php endif; ?>

        <form action="login.php" method="POST" novalidate>
          <div class="campo">
            <label for="correo">Correo</label>
            <input type="email" id="correo" name="correo" placeholder="tucorreo@universidad.edu"
                   value="<?= htmlspecialchars($correo_enviado) ?>" required autofocus>
          </div>

          <div class="campo">
            <label for="password">Contraseña</label>
            <div class="password-wrap">
              <input type="password" id="password" name="password" placeholder="••••••••" required>
              <button type="button" class="toggle-pass" data-target="password">Mostrar</button>
            </div>
          </div>

          <button type="submit" class="btn-enviar">Ingresar</button>
        </form>

        <p class="enlace-alternar">
          ¿Aún no tienes cuenta? Pídele a administración que la cree por ti.
        </p>
      </div>
    </section>
  </div>
</main>

<script src="js/app.js"></script>
</body>
</html>
