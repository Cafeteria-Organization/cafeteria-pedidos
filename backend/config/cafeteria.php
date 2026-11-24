<?php

return [
    // Dominio institucional aceptado para el registro de estudiantes y docentes
    'dominio_univalle' => env('UNIVALLE_EMAIL_DOMAIN', 'univalle.edu'),

    // Stock mínimo por defecto para generar la alerta de "stock bajo"
    'stock_minimo_default' => 5,

    // Máximo de unidades por línea de pedido
    'max_cantidad_por_linea' => 20,

    // Zona horaria de la cafetería: los reportes agrupan las ventas por días de La Paz
    'zona_horaria' => env('CAFETERIA_ZONA_HORARIA', 'America/La_Paz'),
];
