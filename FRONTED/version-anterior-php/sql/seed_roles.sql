-- Ejecutar DESPUÉS de correr tu script principal (el que crea la base de datos
-- cafeteria_universitaria y todas las tablas). El registro de usuarios necesita
-- que exista al menos el rol 'cliente', porque usuarios.id_rol es NOT NULL.

USE cafeteria_universitaria;

INSERT INTO roles (nombre, descripcion) VALUES
('cliente',       'Estudiante o miembro de la universidad que realiza pedidos'),
('personal',      'Personal de la cafetería que prepara y entrega los pedidos'),
('administrador', 'Administrador del sistema');
