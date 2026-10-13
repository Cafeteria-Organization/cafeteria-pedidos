<?php
define('RUTA_BASE', '../');
require_once __DIR__ . '/../includes/auth_role.php';
require_once __DIR__ . '/../config/conexion.php';
exigir_rol(['cocina']);

require __DIR__ . '/../includes/cocina_pedidos_partial.php';
