# Cafetería Universitaria — Login y Registro (Fase 1)

Módulo de autenticación en **PHP + MySQL**, construido sobre tu esquema
`cafeteria_universitaria` (tablas `usuarios` y `roles`).

## Estructura

```
cafeteria/
├── config/
│   └── conexion.php        ← credenciales de la base de datos (PDO)
├── includes/
│   └── auth_check.php      ← protege páginas que requieren sesión iniciada
├── css/
│   └── style.css           ← paleta Univalle (negro + magenta) combinada con el acento dorado del ticket
├── js/
│   └── app.js               ← validaciones + transición animada entre Ingresar/Registrarse
├── sql/
│   └── seed_roles.sql      ← inserta los roles base (cliente, personal, administrador)
├── login.php
├── registro.php
├── bienvenida.php          ← placeholder protegido, aquí irá el menú en la siguiente fase
├── logout.php
└── README.md
```

## Pasos para correrlo

1. **Base de datos**: ejecuta primero tu script original (el que crea
   `cafeteria_universitaria` con todas las tablas). Luego ejecuta
   `sql/seed_roles.sql` — sin esto el registro fallará, porque
   `usuarios.id_rol` es obligatorio y necesita que exista el rol `cliente`.

2. **Credenciales**: abre `config/conexion.php` y ajusta usuario/contraseña
   de MySQL si no usas los valores por defecto de XAMPP (`root` sin
   contraseña).

3. **Servidor**: coloca la carpeta `cafeteria/` dentro de tu `htdocs`
   (XAMPP) o `www` (WAMP/Laragon), o levántala con el servidor embebido de
   PHP para pruebas rápidas:

   ```bash
   cd cafeteria
   php -S localhost:8000
   ```

4. Abre `http://localhost/cafeteria/registro.php` (o
   `http://localhost:8000/registro.php`), crea una cuenta y luego inicia
   sesión en `login.php`.

## Qué hace cada parte

- **`registro.php`**: valida los campos en servidor (nombres, apellidos,
  correo, contraseña ≥ 8 caracteres, confirmación), verifica que el correo
  y el código universitario no estén repetidos, asigna automáticamente el
  rol `cliente`, guarda la contraseña con `password_hash()` (nunca en texto
  plano) e inserta en `usuarios`.
- **`login.php`**: busca el usuario por correo, verifica la contraseña con
  `password_verify()`, revisa que `estado = 1` (cuenta activa) y abre la
  sesión.
- **`bienvenida.php`**: página de ejemplo protegida por `auth_check.php`.
  Aquí es donde en la Fase 2 va a ir el menú de productos, categorías y el
  carrito de pedido.
- **`logout.php`**: destruye la sesión.

## Sobre el cambio de pestañas

Antes había dos formas de pasar de Ingresar a Registrarse (las pestañas de
arriba y el enlace de abajo del formulario), lo cual era redundante. Ahora
solo quedan las pestañas de arriba, y el cambio entre ellas no recarga la
página entera: `js/app.js` trae la otra página con `fetch`, hace un
fundido de salida, reemplaza solo el contenido del formulario y hace un
fundido de entrada (`#panel-contenido` en el CSS). Si el navegador bloquea
el `fetch` (por ejemplo abriendo el archivo directo con `file://` en vez de
un servidor), cae de vuelta a una navegación normal, así que nunca se
rompe.

## Iteración 1 (nuevo)

Sobre la Fase 1 de arriba se agregaron los módulos que cubren estas 7
historias de usuario:

| HU | Qué hace | Archivos |
|----|----------|----------|
| HU-27 | Inicio de sesión, ahora redirige según el rol | `login.php` |
| HU-26 | Admin crea cuentas de estudiante/docente | `admin/estudiantes.php` |
| HU-24 | Admin crea/edita/revoca cuentas de Cocina, Caja y Admin | `admin/personal.php` |
| HU-20 | Admin crea/edita/elimina categorías y productos | `admin/productos.php` |
| HU-01 | Menú digital (nombre, precio, descripción, disponibilidad) | `menu.php` |
| HU-02 | Búsqueda de productos por nombre, en vivo | `menu.php`, `menu_buscar.php`, `js/menu.js` |
| HU-13 | Cocina ve los pedidos entrantes ordenados por hora, en vivo | `cocina/pedidos.php`, `cocina/pedidos_datos.php`, `cocina/pedido_atender.php` |

### Cambio de modelo importante

El registro público (`registro.php`) se eliminó: **las cuentas ya no se
autoregistran**. HU-26 y HU-24 dicen explícitamente que es el
administrador quien crea las cuentas de estudiantes/docentes y de
personal, así que ese es ahora el único camino para tener una cuenta.

Los roles de `sql/seed_roles.sql` (`cliente`, `personal`,
`administrador`) se renombran a los 5 que piden las historias:
`estudiante`, `docente`, `cocina`, `caja`, `administrador`.

### Pasos para levantar esta iteración

1. Corre tu script original + `sql/seed_roles.sql` (Fase 1), tal como
   ya lo hacías.
2. Corre `sql/schema_iteracion1.sql` — renombra los roles, agrega las
   columnas de auditoría en `usuarios` y crea `categorias`, `productos`,
   `pedidos` y `detalle_pedido`.
3. Abre `admin_bootstrap.php` en el navegador **una sola vez** para
   crear tu primera cuenta de administrador (no hay otra forma de
   crear la primera, porque de ahí en adelante solo el admin crea
   cuentas). Después bórralo del servidor.
4. Inicia sesión con esa cuenta de admin y ve a **Productos** para
   cargar el menú, o corre `sql/seed_datos_prueba.sql` para tener
   categorías, productos y dos pedidos de ejemplo ya cargados (útil
   para ver el panel de cocina funcionando sin tener que crear todo
   a mano).
5. Desde **Estudiantes y docentes** y **Personal y roles** crea las
   demás cuentas (una de tipo `cocina`, por ejemplo, para probar
   `cocina/pedidos.php`).

### Fuera del alcance de esta iteración (a propósito)

Crear un pedido desde la cuenta de estudiante/docente (carrito, turno,
notificaciones) todavía no está incluido — esas son otras historias
(HU-03 a HU-12 y HU-14 en adelante). Por eso `sql/seed_datos_prueba.sql`
inserta pedidos de ejemplo directamente en la base de datos: así se
puede probar HU-13 sin depender de esa historia todavía no
implementada. Lo mismo con el rol `caja`: la cuenta y el rol ya
funcionan (HU-24), pero su panel es de una iteración futura.

## Próximos pasos sugeridos (después de esta iteración)

- Flujo de pedido para estudiante/docente (carrito → confirmar →
  número de turno), que hoy solo está simulado con datos de prueba.
- Botón de cocina para pasar un pedido de "en preparación" a "listo"
  y notificar al cliente (HU-14, HU-06).
- Panel de caja.
- El resto de historias de personalización, favoritos, historial,
  reportes, etc. (HU-03 a HU-12, HU-15 a HU-19, HU-21 a HU-23, HU-25).


## Interfaz v2 (rediseño visual)

Solo cambió **cómo se ve** el sistema, siguiendo el diseño de referencia
(héroe oscuro con granos de café, franja beige de categorías, carruseles
de tarjetas, banner de granos y pie oscuro). La lógica de las 7 historias
de usuario (HU-01, 02, 13, 20, 24, 26, 27) no se tocó: mismos formularios,
mismos nombres de campos, mismas consultas y mismos permisos por rol.

**Base de datos:** se agrega una sola columna opcional, `productos.imagen`
(foto del producto). Se crea sola la primera vez que se abre el menú o
Admin → Productos, o puedes correr `sql/interfaz_v2.sql`. Los productos sin
foto se muestran con una taza ilustrada.

| Archivo | Qué cambió |
|---------|-----------|
| `css/style.css`, `css/panel.css` | Nueva paleta y tipografía (Playfair Display + Outfit) |
| `login.php`, `bienvenida.php` | Héroe oscuro con taza y granos; el formulario es el mismo |
| `menu.php`, `includes/menu_partial.php`, `js/menu.js` | Héroe con buscador, franja de categorías, carruseles con flechas |
| `includes/panel_topbar.php`, `includes/pie.php` | Nueva barra superior y pie (con enlaces reales según el rol) |
| `admin/productos.php` | Campo opcional "Foto del producto" (JPG/PNG/WEBP, máx. 2 MB) y miniatura en el catálogo |
| `admin/index.php` | Tarjetas de acceso rápido con el nuevo estilo |
| `includes/arte.php`, `includes/esquema_ui.php` | Ilustraciones SVG y soporte de la columna `imagen` |
| `includes/fondo_ondas.php` | Eliminado (ya no se usa) |

Las fotos subidas se guardan en `img/productos/`; esa carpeta debe poder
escribirse desde el servidor.
