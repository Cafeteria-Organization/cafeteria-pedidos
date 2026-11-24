# Frontend — Sistema web de pedidos para la cafetería universitaria

Frontend en **HTML + CSS + JavaScript** (sin frameworks) que consume la API de
Laravel **cafeteria-backend**. Usa solo las rutas que existen en `routes/api.php`.

## Cómo levantarlo

1. En el backend (ver su README):
   ```bash
   composer install
   php artisan key:generate
   php artisan migrate:fresh --seed
   php artisan serve
   ```
   La API queda en `http://127.0.0.1:8000/api`.
2. Con Apache (XAMPP) encendido, entra a **`http://localhost/CAFETERIA_6/`**.
3. Si Laravel corre en otra dirección, cambia `API_URL` en `assets/js/config.js`.

Cuentas del seeder (contraseña `password123`): `admin@cafeteria.com`,
`empleado@cafeteria.com`, `estudiante@univalle.edu`.

El seeder también crea ~450 **pedidos de ejemplo** de las últimas 6 semanas (con 8 estudiantes de prueba)
para que los reportes y la cocina tengan datos. En una base que ya existe:
`php artisan db:seed --class=PedidoSeeder` (no los duplica y no toca el stock).

### Productos y fotos

- El seeder carga 38 productos del menú de la cafetería ("El Cafecito del Break") en 7 categorías:
  Cafetería, Desayunos, Sándwiches, Comida caliente, Ensaladas y fit, Bebidas y Postres.
- **Las fotos de los productos se guardan dentro de la base de datos** (tabla `producto_imagenes`).
  Así viajan con la base: al exportarla (phpMyAdmin o `mysqldump`) y llevarla a otra computadora,
  las fotos se ven sin pasos extra. Ya no hace falta `php artisan storage:link`.
  Las entrega `GET /api/productos/{id}/imagen` (pública y guardada en caché por el navegador).
- El seeder carga las fotos de `database/seeders/fotos/` a la base.
- Al subir una foto, el panel la reduce antes de enviarla (máx. 1200 px, JPEG) para que pese poco:
  MySQL/MariaDB de XAMPP acepta hasta 1 MB por consulta (`max_allowed_packet`), y el servidor
  acepta fotos de hasta 900 KB.
- En una base que ya tiene datos se pueden agregar sin borrar nada con
  `php artisan db:seed --class=ProductoSeeder` (no cambia stock ni precios de lo que ya existe).
- Si un producto no tiene foto (o no carga), se muestra una foto de referencia
  (`assets/img/sin-foto.jpg`) con la etiqueta "Imagen referencial".
- Las fotos de la página (portada, banner, ingresar, diálogos) están en `assets/img/`.
  Todas son de [Unsplash](https://unsplash.com) (licencia libre de Unsplash).
- El orden de las categorías en el menú y en la cocina se define en `ORDEN_CATEGORIAS` (`config.js`).
- Categorías: el administrador las crea, renombra y elimina desde **Categorías**. Cada una muestra un
  **ícono**: al escribir el nombre se sugiere uno parecido (p. ej. "Empanadas" → horno) y se puede elegir
  otro de la galería (`assets/js/iconos-galeria.js`, ~80 íconos con buscador; se guarda en `categorias.icono`).
  También se puede subir una **imagen propia** (JPG, PNG o WEBP; el panel la reduce a 256 px), que se guarda en
  la base (tabla `categoria_logos`) y tiene prioridad sobre el ícono.

## Páginas

| Página | Quién | Qué hace |
|---|---|---|
| `/` (inicio) | Todos | Menú por categorías con foto, búsqueda por nombre, combos del día y "Tu pedido" al costado |
| `/ingresar/` | Todos | Un solo ingreso con correo y contraseña. Las cuentas las da la universidad (estudiantes y docentes) o el administrador (personal); según la cuenta se abre su sección |
| `/mis-pedidos/` | Estudiante | Código de recojo y QR, seguimiento en 3 pasos con la hora de cada cambio, cancelar (solo en "Recibido"), historial y "Volver a pedir" |
| `/cocina/` | Empleado y Admin | Pedidos en vivo por hora de llegada, filtro por categoría con cantidad de pedidos, cambio de estado, entrega con código o QR, inventario con alertas |
| `/admin/productos/` | Admin | Tarjetas con foto, filtro por categoría, crear y editar (con foto y categoría a elegir), nueva categoría, actualizar stock, historial, sacar o volver a poner en el menú y eliminar |
| `/admin/combos/` | Admin | Crear, editar, activar/desactivar y eliminar combos |
| `/admin/empleados/` | Admin | Crear, editar, dar de baja y reactivar empleados |
| `/politicas/` | Todos | Cómo pedir, recojo y cancelaciones, términos de uso y privacidad (enlazado en el pie) |

## Detalles de funcionamiento

- **Sesión:** "Salir" anula el token en el servidor. La sesión se cierra sola tras un tiempo sin uso
  (`INACTIVIDAD_MIN` en `config.js`).
- **Stock:** el diálogo pregunta "¿Qué pasó?": *llegaron más unidades* (se suman) o *corregir la
  cantidad* (se fija el número contado). Muestra cuánto quedará antes de guardar y deja elegir un motivo.
  El historial muestra lo vendido, lo que ingresó y cada movimiento por día.
- **Cocina:** el filtro por categoría muestra cuántos pedidos activos tiene cada una; el resumen de
  arriba siempre cuenta todos.
- **Menú:** la franja de categorías se desliza (flechas, barra o arrastrando con el mouse). Las flechas de
  cada fila de productos giran en bucle: la primera tarjeta pasa por detrás de las demás hasta el final.
- **Notas:** en "Tu pedido" cada producto tiene un campo de nota ("sin tomate"). La cocina la ve en el ticket
  y queda en el detalle del pedido (`detalle_pedidos.notas`).
- **Combos:** cada producto lleva su cantidad (p. ej. 2 cafés + 1 sándwich). En el menú solo salen los combos
  que hoy se pueden pedir (activos y con todos sus productos disponibles y con stock).
- **Reportes:** "Detalle del día" muestra lo vendido ese día con la hora del pedido y de la entrega, el n.º de
  pedido, el cliente, las notas y qué llevaba cada combo; se puede filtrar por producto y bajar en CSV.
- **Código de recojo:** solo existe mientras el pedido está activo; al entregarlo o cancelarlo se borra.
- **Categoría principal:** en el menú cada producto aparece una sola vez, en su categoría principal. Las
  demás categorías sirven para encontrarlo al filtrar (franja del menú y cocina).
- **Datos al día:** lo que se guarda en una pestaña se ve en las demás al instante, y cada página vuelve a
  consultar cada cierto tiempo (menú 20 s, paneles 30 s, reportes 60 s) sin recargar.
- **Diálogos:** todos llevan a un costado una foto de granos con el ícono de la acción
  (en celular, una franja arriba).

## Límites que vienen del backend

- Las cuentas de estudiantes deben terminar en `@univalle.edu` (`UNIVALLE_EMAIL_DOMAIN`): un correo `@est.univalle.edu` no pasa.
- Hay un solo rol de personal ("empleado"); no se pueden elegir Cocina, Caja o Admin al crear la cuenta.
- Si un empleado dado de baja intenta entrar, el servidor responde "Credenciales incorrectas" (no distingue cuenta inactiva).
- Los tokens no vencen en el servidor: el cierre por inactividad lo hace el navegador.
- No hay notificaciones guardadas: los avisos (pedido listo, pedido cancelado, stock bajo) se detectan consultando la API cada pocos segundos.
- El empleado no tiene ruta para ver todos los productos: el inventario junta el menú y las alertas; un producto agotado a mano lo vuelve a poner en el menú el admin.
- `pedido_estados.created_at` se guarda con la hora local de MySQL y el resto en UTC; el seguimiento corrige esa diferencia comparando con la hora del pedido.
