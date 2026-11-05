<?php
define('RUTA_BASE', '');
require_once __DIR__ . '/includes/auth_role.php';
require_once __DIR__ . '/config/conexion.php';
exigir_rol(['estudiante', 'docente']);

$q = trim($_GET['q'] ?? '');
require __DIR__ . '/includes/menu_partial.php';
