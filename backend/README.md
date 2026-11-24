# Backend — Sistema Web de Pedidos para la Cafetería Universitaria

API REST en **Laravel 9 + Sanctum**, refactorizada para el plan de **3 iteraciones y 12 historias de usuario**.
Equipo 404 Equipo Not Found — Proyecto de Sistemas I, Univalle.

## Puesta en marcha

```bash
composer install
cp .env.example .env
php artisan key:generate
# configurar DB_* en .env (MySQL) y crear la base "cafeteria"
php artisan migrate:fresh --seed     # ⚠️ las migraciones fueron consolidadas: usa migrate:fresh
php artisan storage:link             # para servir las imágenes de productos
php artisan serve
```

Usuarios de prueba (contraseña `password123`): `admin@cafeteria.com`, `empleado@cafeteria.com`, `estudiante@univalle.edu`.

## Pruebas automáticas

```bash
php artisan test        # 81 pruebas, usan SQLite en memoria (requiere la extensión pdo_sqlite)
```

## Roles

| Rol | Quién es | Acceso |
|---|---|---|
| `estudiante` | Estudiantes y docentes (correo `@univalle.edu`) | Menú, hacer/cancelar/repetir pedidos, su historial |
| `empleado` | Cocina / caja (cuenta creada por el Admin) | Panel de pedidos, estados, entrega por código, inventario |
| `admin` | Administrador | Todo lo anterior + empleados, productos y combos |

El control de acceso lo hace el middleware `role:` (`app/Http/Middleware/CheckRole.php`). Sin token → 401; rol incorrecto → 403.

## Endpoints (33)

Todas las rutas llevan el prefijo `/api`. La API responde siempre JSON. Autenticación: `Authorization: Bearer <token>`.

### Iteración 1
| HU | Método y ruta | Rol | Descripción |
|---|---|---|---|
| HU-01 | `POST /register` | público | Registro de estudiante/docente (solo correo `@univalle.edu`) |
| HU-01 | `POST /login` | público | Login de cualquier rol; devuelve token Sanctum y rol |
| HU-01 | `POST /logout`, `GET /me` | autenticado | Cerrar sesión / datos del usuario |
| HU-02 | `GET /admin/empleados` (`?inactivos=1`) | admin | Listar empleados |
| HU-02 | `POST /admin/empleados` | admin | Crear empleado |
| HU-02 | `PUT /admin/empleados/{id}` | admin | Editar nombre, correo o contraseña |
| HU-02 | `DELETE /admin/empleados/{id}` | admin | **Baja lógica** (revoca sesiones) |
| HU-02 | `POST /admin/empleados/{id}/restaurar` | admin | Reactivar |
| HU-03 | `GET /admin/productos` | admin | Todos los productos (incluye agotados) |
| HU-03 | `POST /admin/productos` | admin | Crear (multipart si lleva `imagen`: jpg/png/webp ≤ 2 MB) |
| HU-03 | `PUT /admin/productos/{id}` | admin | Editar datos (el stock va por HU-09) |
| HU-03 | `DELETE /admin/productos/{id}` | admin | Baja lógica |
| HU-03 | `PATCH /admin/productos/{id}/toggle` | admin | Disponible ⇄ Agotado |
| HU-04 | `GET /menu` (`?buscar=`, `?categoria=`) | público | Menú digital con búsqueda por nombre |

### Iteración 2
| HU | Método y ruta | Rol | Descripción |
|---|---|---|---|
| HU-05 | `POST /pedidos` | estudiante | Body: `{"productos":[{"id":1,"cantidad":2}],"combos":[{"id":1,"cantidad":1}]}`. Valida stock, descuenta, devuelve el **código de recojo** |
| HU-06 | `GET /pedidos/activos` (`?categoria=`) | empleado, admin | Panel FIFO (por hora de recepción) |
| HU-07 | `PUT /pedidos/{id}/estado` | empleado, admin | `En preparación` → `Para entregar` (en orden) |
| HU-07 | `GET /pedidos/{id}` | dueño o personal | Seguimiento visual: `estado`, `progreso.paso` (1-3), historial de estados |
| HU-08 | `POST /pedidos/entregar` | empleado, admin | Body `{"codigo":"A9F2X"}`; marca `Completado` y registra quién entregó |

### Iteración 3
| HU | Método y ruta | Rol | Descripción |
|---|---|---|---|
| HU-09 | `GET /inventario/alertas` | empleado, admin | Productos agotados o con stock ≤ `stock_minimo` |
| HU-09 | `PATCH /productos/{id}/stock` | empleado, admin | `{"agregar":20}` repone, `{"stock":5}` fija el valor |
| HU-09 | `PATCH /productos/{id}/agotado` | empleado, admin | Marca agotado manualmente |
| HU-09 | `GET /productos/{id}/movimientos` | empleado, admin | Historial de movimientos de stock |
| HU-10 | `POST /pedidos/{id}/cancelar` | dueño o personal | Solo en estado `Recibido`; devuelve el stock exacto |
| HU-11 | `GET /mis-pedidos` (`?estado=`) | estudiante | Historial propio, más recientes primero |
| HU-11 | `GET /estudiantes/{id}/historial` | dueño o personal | Solo `Completado` (ruta de la guía anterior) |
| HU-11 | `POST /pedidos/{id}/repetir` | estudiante | Vuelve a pedir lo mismo (revalida stock) |
| HU-12 | `GET /combos` | público | Combos activos con `disponible`, `precio_normal` y `ahorro` |
| HU-12 | `GET/POST/PUT/DELETE /admin/combos`, `PATCH /admin/combos/{id}/toggle` | admin | CRUD de combos |

### Flujo de estados de un pedido
`Recibido → En preparación → Para entregar → Completado` (la entrega solo se hace con el código).
`Recibido → Cancelado` (única cancelación permitida). Los saltos o retrocesos responden `409`.

### Códigos de respuesta
`201` creado · `401` sin sesión · `403` sin permiso · `404` no existe · `409` transición de estado no permitida o pedido ya entregado · `422` datos inválidos · `400` regla de negocio (sin stock, producto no disponible, cancelación no permitida).

## Decisiones de diseño

- **Reglas de negocio en servicios** (`app/Services`): `PedidoService` y `StockService`. Los controladores solo validan y responden.
- **Stock seguro:** transacción + `lockForUpdate`; los productos se bloquean en orden para evitar bloqueos cruzados. Un combo descuenta el stock de sus **productos base**, y cancelar revierte exactamente los movimientos del pedido.
- **Historial de inventario** (`movimientos_stock`) e **historial de estados** (`pedido_estados`) reemplazan a los triggers de la versión anterior y funcionan igual en cualquier motor de base de datos.
- **Agotado automático:** al llegar el stock a 0 el producto pasa a *Agotado*; al reponer desde 0 vuelve al menú.
- **Códigos de recojo** de 5 caracteres, únicos (índice en BD + verificación), sin caracteres ambiguos (0/O, 1/I).
- **Sin filtrado de errores internos:** las reglas de negocio responden con un mensaje claro (`ReglaNegocioException`).

## Alcance y límites conocidos

- **Autenticación Univalle:** no existe un SSO público de la universidad; el sistema valida el **dominio del correo institucional** y exige contraseña propia. No verifica que el correo sea de la persona (no hay correo de confirmación).
- **Notificación "pedido listo":** el backend expone `progreso.listo_para_recoger`; el aviso al celular (push/polling) debe resolverlo el cliente.
- **Reportes** no tienen historia de usuario en el plan de 12 HU y no se implementaron.
- Este repositorio es solo el **backend**; el frontend debe adaptarse a las rutas de esta API.
