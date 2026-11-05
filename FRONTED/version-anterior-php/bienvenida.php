<?php
define('RUTA_BASE', '');
require_once __DIR__ . '/includes/auth_check.php';
$rol = $_SESSION['rol'] ?? 'usuario';
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bienvenido · Cafetería Universitaria</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/style.css">
</head>
<body class="fondo-oscuro">

<?php require_once __DIR__ . '/includes/arte.php'; ?>

<main class="login-hero">
  <div class="hero-arte" aria-hidden="true"><?= arte_hero('bv') ?></div>

  <div class="login-columna">
    <section class="login-card bienvenida-wrap">
      <p class="eyebrow eyebrow-oscuro">Sesión iniciada</p>
      <h1>Hola, <?= htmlspecialchars($_SESSION['nombres']) ?></h1>
      <span class="chip-rol"><?= htmlspecialchars(strtoupper($rol)) ?></span>

      <?php if (!empty($_SESSION['aviso_acceso'])): ?>
        <div class="mensaje mensaje-error"><?= htmlspecialchars($_SESSION['aviso_acceso']) ?></div>
        <?php unset($_SESSION['aviso_acceso']); ?>
      <?php endif; ?>

      <p>
        <?php if ($rol === 'caja'): ?>
          El panel de caja todavía no está incluido en esta iteración. Vuelve a
          revisar cuando se agregue el módulo de cobro y entrega.
        <?php else: ?>
          Tu cuenta quedó lista.
        <?php endif; ?>
      </p>
      <a class="btn-logout" href="logout.php">Cerrar sesión</a>
    </section>
  </div>
</main>

</body>
</html>
