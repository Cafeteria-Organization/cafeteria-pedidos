<?php
/**
 * Conexión a la base de datos cafeteria_universitaria.
 * Ajusta $usuario_db y $password_db según tu instalación local (XAMPP/WAMP/Laragon).
 */

$host        = 'localhost';
$dbname      = 'cafeteria_universitaria';
$usuario_db  = 'root';
$password_db = '';

try {
    $pdo = new PDO(
        "mysql:host={$host};dbname={$dbname};charset=utf8mb4",
        $usuario_db,
        $password_db,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
} catch (PDOException $e) {
    // En producción no mostrar el mensaje real del error, solo loguearlo.
    die('No se pudo conectar a la base de datos. Verifica que MySQL esté corriendo y que la base de datos exista.');
}
