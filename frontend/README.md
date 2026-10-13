# Frontend — Sistema web de pedidos para la cafetería universitaria

Frontend en **HTML + CSS + JavaScript** (sin frameworks) que consume la
**API de Laravel** (`proy-cafeteria`). No modifica el backend: usa solo las
rutas que ya existen en `routes/api.php`.

## Cómo levantarlo

1. En el proyecto Laravel:
   ```bash
   php artisan migrate --seed
   php artisan serve
   ```
   La API queda en `http://127.0.0.1:8000/api`.
2. Con Apache (XAMPP) encendido, entra a **`http://localhost/CAFETERIA_5/`**
   y se abre directo la página de inicio (landing con el menú).
3. Si Laravel corre en otra dirección, cambia `API_URL` en `assets/js/config.js`.

Cuentas:
- **Admin** (del seeder): `admin@univalle.edu` / `123456` → entra al panel de cocina.
- **Cliente**: se crea desde "Crear cuenta" con un correo `@univalle.edu`
  o `@est.univalle.edu` (regla de `AuthController@register`).
- **Empleado**: lo crea el Admin en *Personal → Nuevo empleado* (nombre,
  correo, contraseña y rol). `AuthController@register` solo respeta `id_rol`
  si la petición trae el token de un Admin; sin eso siempre crea Clientes.

## Cómo se usa según el rol

| Rol | Qué ve |
|---|---|
| Visitante (sin sesión) | Landing con el menú. Puede armar su pedido; **recién al confirmar** se le pide ingresar o crear cuenta, y al volver el pedido sigue ahí listo para confirmar. |
| Cliente (3) | Menú con **"Tu pedido" siempre visible al costado** (en celular, una barra flotante), confirmar pedido, *Mis pedidos*. |
| Empleado (2) | *Cocina*: ver pedidos activos y cambiar su estado. |
| Admin (1) | *Cocina* + *Productos* (crear/editar) + *Personal* (roles y permisos). |

## Páginas

| Página | Quién | Qué hace | Endpoint |
|---|---|---|---|
| `/` (inicio) | Todos | Landing con el menú por categorías, búsqueda, "Tu pedido" al costado con notas y confirmación | `GET /menu`, `GET /menu/buscar`, `POST /pedidos` |
| `/ingresar/` | Todos | Ingresar y crear cuenta | `POST /login`, `POST /register` |
| `/mis-pedidos/` | Cliente (rol 3) | Número de pedido, código de entrega, estado en vivo, cancelar | `GET /pedidos/activos`, `PATCH /pedidos/{id}/estado` |
| `/cocina/` | Admin y Empleado (roles 1 y 2) | Tablero Pendientes → En preparación → Listos, verificación del código al entregar | `GET /pedidos/activos`, `PATCH /pedidos/{id}/estado` |
| `/admin/productos/` | Admin | Catálogo, crear y editar productos (nombre, descripción, precio, stock, categorías) | `GET /menu`, `POST /admin/productos`, `PUT /admin/productos/{id}` |
| `/admin/personal/` | Admin | **Crear cuentas de personal** (Empleado o Admin), lista del personal y cambio de roles | `POST /register` (con token de Admin), `GET /admin/personal`, `PATCH /admin/usuarios/{id}/rol` |

## Historias de usuario cubiertas (hasta donde llega la API)

| HU | Cómo se ve en el frontend |
|---|---|
| HU-01 Menú digital | Tarjetas con nombre, descripción, precio y disponibilidad ("¡Quedan 3!", "Agotado"). Responsive. |
| HU-02 Búsqueda | Buscador del héroe con `GET /menu/buscar` (por nombre, coincidencia parcial, sin mayúsculas), en vivo, con mensaje "Sin resultados". |
| HU-20 Productos | Pantalla *Productos* del Admin: crear y editar (sin eliminar, la API no lo tiene). |
| HU-24 Roles y permisos | Menús y páginas según el rol; pantalla *Personal* para asignar roles. |
| HU-03 Personalización | Nota por producto en el carrito (máx. 255 caracteres), visible en cocina. |
| HU-04 Número de turno | Al confirmar se muestra el número de pedido y queda en "Mis pedidos". |
| HU-05 Disponibilidad | La API valida stock al crear el pedido; cocina puede aceptar o rechazar. |
| HU-06 Aviso de "Listo" | "Mis pedidos" se actualiza solo y avisa en pantalla (y con notificación del navegador si se activa). |
| HU-07 Cancelación | Botón "Cancelar pedido" solo mientras está Pendiente (lo valida `pr_cancelar_pedido`). |
| HU-13 Recepción en cocina | Lista en vivo ordenada por hora, con detalle y notas; resalta los pedidos nuevos. |
| HU-14 Cambio de estado | Botones "Aceptar y preparar" y "Marcar como listo". |
| HU-17 Validación de entrega | Para entregar hay que escribir el código del cliente; si no coincide, no se entrega. |
| HU-27 Inicio de sesión | Token Sanctum guardado en el navegador; redirige según el rol. |

Se quitó del diseño de referencia la sección de testimonios/comentarios y el
newsletter de descuento, porque no están en el alcance del documento.

## Limitaciones actuales de la API (para la siguiente iteración)

- **No hay "mis pedidos"** (`GET /pedidos/mios`): la lista del cliente se
  guarda en el navegador al confirmar y el estado se cruza con
  `/pedidos/activos`. Cuando un pedido deja de estar activo se muestra como
  "Finalizado" (no se puede distinguir entregado de cancelado por cocina).
- **No hay control de rol en la API**: cualquier token puede usar
  `/pedidos/activos`, cambiar estados y también `/admin/productos` y
  `/admin/usuarios/{id}/rol` (probado: un cliente pudo crear un producto).
  El frontend oculta esas pantallas según el rol, pero la protección real
  debe ir en Laravel (un middleware que revise `id_rol`).
- **`GET /admin/personal` devuelve error 500**: al modelo `Rol` le falta
  `protected $table = 'ROL'; protected $primaryKey = 'id_rol'; public $timestamps = false;`
  (Laravel busca una tabla `rols`). Con esas 3 líneas la lista funciona
  (probado en una copia).
- **Productos**: no hay ruta para eliminar ni para listar/crear categorías;
  `updateProducto` no valida (acepta precio negativo, el frontend lo evita);
  si `storeProducto` recibe una categoría inexistente, el producto queda
  creado sin categoría (falta una transacción).
- **Roles**: no hay ruta para listar todos los usuarios, así que el ID del
  usuario al que se le asigna rol se escribe a mano.
- **No hay historial de pedidos ni combos (HU-21)**: por eso el Empleado
  todavía no tiene "historial de órdenes" y el Admin no tiene combos.
- **La verificación del código (HU-17) se hace en el navegador**; lo ideal
  es que `PATCH /estado` con `Entregado` reciba y valide el código.
- **No hay logout en la API**: "Salir" borra el token del navegador, pero
  el token sigue válido en `personal_access_tokens`.
- `MenuController` solo devuelve productos con `estado = 'Disponible'`; los
  que tienen stock 0 se muestran como "Agotado".
- Los productos no tienen foto: cada tarjeta usa una ilustración según el
  tipo (café, jugo, salteña o postre).

## Estructura

```
CAFETERIA_5/
├── index.html               ← INICIO: landing + menú + carrito   (localhost/CAFETERIA_5/)
├── ingresar/index.html      ← ingresar y crear cuenta             (…/ingresar/)
├── mis-pedidos/index.html   ← seguimiento del cliente             (…/mis-pedidos/)
├── cocina/index.html        ← panel de cocina (Admin/Empleado)    (…/cocina/)
├── admin/
│   ├── productos/index.html ← crear/editar productos (Admin)      (…/admin/productos/)
│   └── personal/index.html  ← personal y roles (Admin)            (…/admin/personal/)
├── assets/
│   ├── css/app.css          estilos (paleta y tipografía del diseño)
│   └── js/
│       ├── config.js        URL de la API, rutas del sitio y constantes
│       ├── api.js           cliente de la API + sesión (token)
│       ├── arte.js          ilustraciones SVG
│       ├── ui.js            barra, pie, avisos, diálogos, carrito
│       ├── menu.js          HU-01 / HU-02
│       ├── carrito.js       "Tu pedido" al costado, HU-03 + confirmar pedido
│       ├── ingresar.js      login / registro
│       ├── pedidos.js       HU-04 / HU-06 / HU-07
│       ├── cocina.js        HU-13 / HU-14 / HU-17
│       ├── admin-productos.js  HU-20
│       └── admin-personal.js   HU-24
├── README.md
└── version-anterior-php/    ← versión anterior (PHP + MySQL directo, sin la API),
                               guardada tal cual: …/version-anterior-php/login.php
```

Los enlaces entre páginas están centralizados en `RUTAS` dentro de
`assets/js/config.js`; si se mueve el sitio a otra carpeta no hay que tocar nada.
