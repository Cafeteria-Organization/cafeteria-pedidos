<?php
/**
 * Soporte para la nueva interfaz: imagen opcional por producto.
 *
 * - Si la columna productos.imagen no existe, intenta crearla (equivale a
 *   ejecutar sql/interfaz_v2.sql). Si el usuario de MySQL no tiene permiso
 *   para ALTER TABLE, devuelve false y el resto del sistema sigue
 *   funcionando igual que antes, solo que sin fotos.
 */
function columna_imagen_disponible(PDO $pdo): bool
{
    static $resultado = null;
    if ($resultado !== null) {
        return $resultado;
    }
    if (!empty($_SESSION['col_imagen_ok'])) {
        return $resultado = true;
    }

    try {
        $existe = $pdo->query("SHOW COLUMNS FROM productos LIKE 'imagen'")->fetch();
        if (!$existe) {
            $pdo->exec('ALTER TABLE productos ADD COLUMN imagen VARCHAR(255) NULL AFTER descripcion');
        }
        $_SESSION['col_imagen_ok'] = true;
        return $resultado = true;
    } catch (Throwable $e) {
        return $resultado = false;
    }
}

/** Carpeta física donde se guardan las fotos subidas por el administrador. */
function carpeta_imagenes_productos(): string
{
    return dirname(__DIR__) . '/img/productos/';
}

/** URL relativa lista para un <img src>, o null si el producto no tiene foto. */
function url_imagen_producto(?string $ruta): ?string
{
    $ruta = trim((string) $ruta);
    if ($ruta === '') {
        return null;
    }
    if (preg_match('#^https?://#i', $ruta)) {
        return $ruta;
    }
    return (defined('RUTA_BASE') ? RUTA_BASE : '') . ltrim($ruta, '/');
}
