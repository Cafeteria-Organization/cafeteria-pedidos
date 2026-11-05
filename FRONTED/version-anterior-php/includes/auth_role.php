<?php
/**
 * Exige que haya una sesión iniciada (auth_check.php) y que el rol del
 * usuario esté dentro de $rolesPermitidos. Si no, lo manda de vuelta a
 * la página que le corresponde según su propio rol.
 *
 * Uso (desde la raíz, ej. menu.php):
 *   define('RUTA_BASE', '');
 *   require_once __DIR__ . '/includes/auth_role.php';
 *   exigir_rol(['estudiante', 'docente']);
 *
 * Uso (desde una subcarpeta, ej. admin/productos.php o cocina/pedidos.php):
 *   define('RUTA_BASE', '../');
 *   require_once __DIR__ . '/../includes/auth_role.php';
 *   exigir_rol(['administrador']);
 */
require_once __DIR__ . '/auth_check.php';

if (!defined('RUTA_BASE')) {
    define('RUTA_BASE', ''); // por si algún archivo olvida definirla.
}

function ruta_inicio_para_rol(?string $rol): string
{
    $destino = match ($rol) {
        'administrador' => 'admin/index.php',
        'cocina'         => 'cocina/pedidos.php',
        'estudiante', 'docente' => 'menu.php',
        default          => 'bienvenida.php',
    };

    return RUTA_BASE . $destino;
}

function exigir_rol(array $rolesPermitidos): void
{
    $rolActual = $_SESSION['rol'] ?? null;

    if (!in_array($rolActual, $rolesPermitidos, true)) {
        // Lo mandamos a donde sí tiene acceso, no a un error genérico.
        $_SESSION['aviso_acceso'] = 'No tienes permiso para acceder a esa sección.';
        header('Location: ' . ruta_inicio_para_rol($rolActual));
        exit;
    }
}
