-- ============================================================
-- Cafetería Universitaria — Esquema adicional para la Iteración 1
-- ============================================================
-- Ejecuta este script DESPUÉS de tu script original (el que crea
-- cafeteria_universitaria con las tablas usuarios y roles) y DESPUÉS
-- de sql/seed_roles.sql.
--
-- Cubre lo que necesitan estas historias de usuario:
--   HU-26 Creación de cuentas de estudiantes y docentes
--   HU-27 Inicio de sesión
--   HU-01  Consulta del menú digital
--   HU-02  Búsqueda de productos por nombre
--   HU-13 Recepción organizada de pedidos
--   HU-20 Creación y edición de productos
--   HU-24 Gestión de roles y permisos
-- ============================================================

USE cafeteria_universitaria;

-- ------------------------------------------------------------
-- 1) Roles de la iteración 1.
--    Antes solo existían: cliente, personal, administrador.
--    Los renombramos en vez de borrarlos (usuarios.id_rol ya los
--    referencia) y agregamos los que faltan.
-- ------------------------------------------------------------
UPDATE roles SET nombre = 'estudiante',
                  descripcion = 'Estudiante que consulta el menú y realiza pedidos'
 WHERE nombre = 'cliente';

UPDATE roles SET nombre = 'cocina',
                  descripcion = 'Personal de cocina: recibe y prepara los pedidos'
 WHERE nombre = 'personal';

UPDATE roles SET descripcion = 'Administrador del sistema: gestiona productos, cuentas y roles'
 WHERE nombre = 'administrador';

INSERT INTO roles (nombre, descripcion)
SELECT 'docente', 'Docente que consulta el menú y realiza pedidos'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE nombre = 'docente');

INSERT INTO roles (nombre, descripcion)
SELECT 'caja', 'Personal de caja (fuera del alcance de la iteración 1)'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE nombre = 'caja');

-- ------------------------------------------------------------
-- 2) Auditoría de cuentas (HU-24: "el sistema debe registrar
--    quién creó o modificó cada cuenta").
--    Si tu tabla `usuarios` ya tiene alguna de estas columnas,
--    borra la línea correspondiente antes de ejecutar.
-- ------------------------------------------------------------
ALTER TABLE usuarios
  ADD COLUMN creado_por INT NULL AFTER estado,
  ADD COLUMN actualizado_por INT NULL AFTER creado_por,
  ADD COLUMN actualizado_en DATETIME NULL AFTER actualizado_por,
  ADD CONSTRAINT fk_usuarios_creado_por
      FOREIGN KEY (creado_por) REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
  ADD CONSTRAINT fk_usuarios_actualizado_por
      FOREIGN KEY (actualizado_por) REFERENCES usuarios(id_usuario) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 3) Catálogo (HU-01, HU-02, HU-20)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias (
  id_categoria INT AUTO_INCREMENT PRIMARY KEY,
  nombre       VARCHAR(60) NOT NULL UNIQUE,
  estado       TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS productos (
  id_producto    INT AUTO_INCREMENT PRIMARY KEY,
  id_categoria   INT NOT NULL,
  nombre         VARCHAR(100) NOT NULL,
  descripcion    VARCHAR(255) NULL,
  precio         DECIMAL(6,2) NOT NULL,
  disponible     TINYINT(1) NOT NULL DEFAULT 1,
  creado_en      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_productos_categoria FOREIGN KEY (id_categoria)
      REFERENCES categorias(id_categoria),
  INDEX idx_productos_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- 4) Pedidos (HU-13). El flujo completo de "hacer un pedido" es
--    de una iteración posterior; estas tablas ya quedan listas
--    para que cocina pueda recibirlos y marcarlos como atendidos.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos (
  id_pedido     INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario    INT NOT NULL,
  numero_turno  INT NOT NULL,
  estado        ENUM('pendiente','en_preparacion','listo','entregado','cancelado')
                NOT NULL DEFAULT 'pendiente',
  creado_en     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atendido_en   DATETIME NULL,
  CONSTRAINT fk_pedidos_usuario FOREIGN KEY (id_usuario)
      REFERENCES usuarios(id_usuario),
  INDEX idx_pedidos_estado_creado (estado, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS detalle_pedido (
  id_detalle      INT AUTO_INCREMENT PRIMARY KEY,
  id_pedido       INT NOT NULL,
  id_producto     INT NOT NULL,
  cantidad        INT NOT NULL DEFAULT 1,
  nota            VARCHAR(150) NULL,
  precio_unitario DECIMAL(6,2) NOT NULL,
  CONSTRAINT fk_detalle_pedido FOREIGN KEY (id_pedido)
      REFERENCES pedidos(id_pedido),
  CONSTRAINT fk_detalle_producto FOREIGN KEY (id_producto)
      REFERENCES productos(id_producto)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
