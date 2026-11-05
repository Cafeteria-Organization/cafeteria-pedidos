-- ============================================================
-- Datos de prueba — Iteración 1
-- Ejecuta esto DESPUÉS de sql/schema_iteracion1.sql y después de
-- crear al menos una cuenta (admin_bootstrap.php) para que exista
-- un id_usuario válido al que asociar los pedidos de ejemplo.
-- No es obligatorio para que el sistema funcione: solo sirve para
-- ver el menú (HU-01/HU-02) y el panel de cocina (HU-13) con datos.
-- ============================================================

USE cafeteria_universitaria;

INSERT INTO categorias (nombre) VALUES
('Comida caliente'), ('Bebidas'), ('Postres'), ('Snacks');

INSERT INTO productos (id_categoria, nombre, descripcion, precio, disponible) VALUES
((SELECT id_categoria FROM categorias WHERE nombre = 'Comida caliente'), 'Salteña de pollo', 'Jugosa, con un toque picante opcional', 8.50, 1),
((SELECT id_categoria FROM categorias WHERE nombre = 'Comida caliente'), 'Sandwich de chola', 'Chola clásica con ensalada y salsa', 12.00, 1),
((SELECT id_categoria FROM categorias WHERE nombre = 'Comida caliente'), 'Silpancho', 'Milanesa, arroz, papa y huevo frito', 18.00, 0),
((SELECT id_categoria FROM categorias WHERE nombre = 'Bebidas'), 'Api con leche', 'Api morado clásico, se sirve caliente', 6.00, 1),
((SELECT id_categoria FROM categorias WHERE nombre = 'Bebidas'), 'Jugo de naranja', 'Natural, recién exprimido', 5.00, 1),
((SELECT id_categoria FROM categorias WHERE nombre = 'Bebidas'), 'Café con leche', 'Espresso con leche vaporizada', 5.50, 1),
((SELECT id_categoria FROM categorias WHERE nombre = 'Postres'), 'Gelatina de fruta', 'Porción individual', 3.00, 1),
((SELECT id_categoria FROM categorias WHERE nombre = 'Snacks'), 'Galletas integrales', 'Paquete de 3 unidades', 4.00, 1);

-- Un par de pedidos de ejemplo para el panel de cocina (HU-13),
-- usando el primer usuario que exista en tu base de datos.
INSERT INTO pedidos (id_usuario, numero_turno, estado, creado_en)
SELECT id_usuario, 101, 'pendiente', NOW() - INTERVAL 6 MINUTE FROM usuarios ORDER BY id_usuario LIMIT 1;

INSERT INTO pedidos (id_usuario, numero_turno, estado, creado_en)
SELECT id_usuario, 102, 'pendiente', NOW() - INTERVAL 2 MINUTE FROM usuarios ORDER BY id_usuario LIMIT 1;

INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, nota, precio_unitario)
SELECT p.id_pedido, pr.id_producto, 2, 'Sin picante', pr.precio
FROM pedidos p, productos pr
WHERE p.numero_turno = 101 AND pr.nombre = 'Salteña de pollo';

INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, nota, precio_unitario)
SELECT p.id_pedido, pr.id_producto, 1, NULL, pr.precio
FROM pedidos p, productos pr
WHERE p.numero_turno = 102 AND pr.nombre = 'Api con leche';
