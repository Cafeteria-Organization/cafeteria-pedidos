<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if (empty($_SESSION['id_usuario'])) {
    $base = defined('RUTA_BASE') ? RUTA_BASE : '';
    header('Location: ' . $base . 'login.php');
    exit;
}
