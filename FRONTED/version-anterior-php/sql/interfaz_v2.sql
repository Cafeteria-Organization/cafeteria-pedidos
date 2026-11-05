-- ============================================================
-- Cafetería Universitaria — Nueva interfaz (v2)
-- ============================================================
-- Agrega la foto opcional de cada producto. No modifica ni borra
-- ningún dato existente ni cambia ninguna regla de las historias
-- de usuario: los productos sin foto se muestran con una taza
-- ilustrada, igual que antes se mostraban sin imagen.
--
-- Este script es OPCIONAL: si no lo ejecutas, el sistema intenta
-- crear la columna solo la primera vez que se abre el menú o el
-- panel de productos (necesita permiso ALTER TABLE, que el usuario
-- root de XAMPP ya tiene). Ejecutarlo a mano solo evita esa
-- comprobación automática.
--
-- Si tu MySQL/MariaDB dice que la columna "imagen" ya existe,
-- significa que ya está aplicado: ignora el error.
-- ============================================================

USE cafeteria_universitaria;

ALTER TABLE productos
  ADD COLUMN imagen VARCHAR(255) NULL AFTER descripcion;
