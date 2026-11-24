// ============================================================
// Cliente de la API de Laravel + sesión del usuario.
//
// Rutas de routes/api.php que usa este frontend, por iteración:
//   Iteración 1
//     POST   /login                      público      (devuelve token Sanctum y rol)
//     POST   /logout, GET /me            con sesión
//     GET    /admin/empleados(?inactivos=1), POST, PUT {id}, DELETE {id},
//            POST /admin/empleados/{id}/restaurar      admin
//     GET    /admin/productos, POST, PUT {id}, DELETE {id},
//            PATCH /admin/productos/{id}/toggle        admin
//     GET    /menu?buscar=&categoria=    público
//   Iteración 2
//     POST   /pedidos                    estudiante (devuelve el código de recojo)
//     GET    /pedidos/activos?categoria= empleado/admin
//     PUT    /pedidos/{id}/estado        empleado/admin
//     GET    /pedidos/{id}               dueño o personal (historial de estados)
//     POST   /pedidos/entregar {codigo}  empleado/admin
//   Iteración 3
//     GET    /inventario/alertas, PATCH /productos/{id}/stock,
//            PATCH /productos/{id}/agotado, GET /productos/{id}/movimientos
//     POST   /pedidos/{id}/cancelar      dueño o personal
//     GET    /mis-pedidos, POST /pedidos/{id}/repetir  estudiante
//     GET    /combos, GET /categorias     público
//     GET|POST /admin/combos, PUT|DELETE /admin/combos/{id},
//            PATCH /admin/combos/{id}/toggle           admin
//   Mejoras del panel
//     POST|PUT|DELETE /admin/categorias           admin  (un producto puede tener varias)
//     GET /admin/productos?eliminados=1, POST /admin/productos/{id}/restaurar   admin
//     GET /admin/reportes/ventas?desde=&hasta=&agrupar=dia|semana               admin
//
// El token va en la cabecera Authorization: Bearer <token>.
// ============================================================
(function () {
  const CFG = window.CAFETERIA_CONFIG;
  const CLAVE_SESION = 'cafeteria6.sesion';

  // ---------- almacenamiento seguro (el modo privado puede bloquearlo) ----------
  const almacen = {
    leer(clave, porDefecto) {
      try {
        const v = localStorage.getItem(clave);
        return v === null ? porDefecto : JSON.parse(v);
      } catch (e) {
        return porDefecto;
      }
    },
    guardar(clave, valor) {
      try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) { /* sin almacenamiento */ }
    },
    borrar(clave) {
      try { localStorage.removeItem(clave); } catch (e) { /* sin almacenamiento */ }
    },
  };

  // ---------- sesión ----------
  // usuario = { id, nombre, correo, rol }   rol: 'admin' | 'empleado' | 'estudiante'
  const sesion = {
    obtener() { return almacen.leer(CLAVE_SESION, null); },
    guardar(token, usuario) { almacen.guardar(CLAVE_SESION, { token, usuario }); },
    cerrar() { almacen.borrar(CLAVE_SESION); },
    usuario() { const s = this.obtener(); return s ? s.usuario : null; },
    token() { const s = this.obtener(); return s ? s.token : null; },
    rol() { const u = this.usuario(); return u ? u.rol : null; },
    esEstudiante() { return this.rol() === 'estudiante'; },
    esAdmin() { return this.rol() === 'admin'; },
    esEmpleado() { return this.rol() === 'empleado'; },
    esPersonal() { return this.rol() === 'admin' || this.rol() === 'empleado'; },
    nombreRol() { return CFG.ROLES[this.rol()] || ''; },
  };

  // ---------- mensajes de validación de Laravel (vienen en inglés) ----------
  const CAMPOS = {
    name: 'nombre', nombre: 'nombre', email: 'correo', password: 'contraseña',
    precio: 'precio', stock: 'stock', 'stock minimo': 'stock mínimo', categoria: 'categoría',
    descripcion: 'descripción', imagen: 'imagen', productos: 'productos', combos: 'combos',
    codigo: 'código', agregar: 'cantidad a agregar', motivo: 'motivo', estado: 'estado', cantidad: 'cantidad',
    rol: 'rol', categorias: 'categorías', desde: 'fecha desde', hasta: 'fecha hasta', agrupar: 'agrupar',
    logo: 'logo', notas: 'nota', fecha: 'fecha', icono: 'ícono',
  };
  const campo = (c) => {
    const limpio = String(c).replace(/^(productos|combos)\.\d+\./, '').replace(/^categorias\.\d+$/, 'categorias');
    return CAMPOS[limpio] || CAMPOS[c] || limpio;
  };

  function traducir(mensaje) {
    if (!mensaje) return '';
    const m = String(mensaje);
    const reglas = [
      [/^The (.+?) has already been taken\.$/, (_, c) => `Ese ${campo(c)} ya está registrado.`],
      [/^The (.+?) field is required when .+$/, () => 'Indica cuántas unidades agregar o el stock final.'],
      [/^The (.+?) field is required\.$/, (_, c) => `El campo ${campo(c)} es obligatorio.`],
      [/^The (.+?) must be a valid email address\.$/, () => 'Ingresa un correo válido.'],
      [/^The (.+?) must be at least (\d+) characters\.$/, (_, c, n) => `La ${campo(c)} debe tener al menos ${n} caracteres.`],
      [/^The (.+?) must not be greater than (\d+) characters\.$/, (_, c, n) => `El ${campo(c)} puede tener como máximo ${n} caracteres.`],
      [/^The (.+?) must be at least ([\d.]+)\.$/, (_, c, n) => `El ${campo(c)} debe ser como mínimo ${n}.`],
      [/^The (.+?) must not be greater than (\d+) kilobytes\.$/, (_, c, kb) => `La foto puede pesar como máximo ${kb} KB.`],
      [/^The (.+?) must not be greater than ([\d.]+)\.$/, (_, c, n) => `El ${campo(c)} puede ser como máximo ${n}.`],
      [/^The (.+?) must be an image\.$/, () => 'El archivo debe ser una imagen.'],
      [/^The (.+?) must be a file of type: (.+)\.$/, (_, c, t) => `La imagen debe ser ${t}.`],
      [/^The (.+?) must be (a number|an integer)\.$/, (_, c) => `El ${campo(c)} debe ser un número válido.`],
      [/^The selected (.+?) is invalid\.$/, (_, c) => (/^productos/.test(c) ? 'Uno de los productos ya no existe en el menú.'
        : /^combos/.test(c) ? 'Uno de los combos ya no existe.' : `El ${campo(c)} elegido no es válido.`)],
      [/^The (.+?) field has a duplicate value\.$/, () => 'Elegiste el mismo producto dos veces.'],
      [/^The (.+?) must have at least (\d+) items?\.$/, (_, c, n) => `Elige al menos ${n} ${campo(c)}.`],
      [/^No query results for model/, () => 'No se encontró el registro (puede que ya no exista).'],
      [/^Unauthenticated\.$/, () => 'Tu sesión expiró. Vuelve a ingresar.'],
      [/^Too Many Attempts\.$/, () => 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.'],
    ];
    for (const [patron, fn] of reglas) {
      const r = m.match(patron);
      if (r) return fn(...r);
    }
    return m;
  }

  class ErrorApi extends Error {
    constructor(mensaje, estado, datos) {
      super(mensaje);
      this.estado = estado;
      this.datos = datos;
    }
  }

  let sesionExpiradaAvisada = false;

  // ---------- petición genérica ----------
  // cuerpo: objeto (se manda como JSON) o FormData (para subir la imagen del producto).
  async function pedir(metodo, ruta, cuerpo) {
    const cabeceras = { Accept: 'application/json' };
    const esForm = typeof FormData !== 'undefined' && cuerpo instanceof FormData;
    if (cuerpo !== undefined && !esForm) cabeceras['Content-Type'] = 'application/json';
    const token = sesion.token();
    if (token) cabeceras.Authorization = 'Bearer ' + token;

    let respuesta;
    try {
      respuesta = await fetch(CFG.API_URL + ruta, {
        method: metodo,
        headers: cabeceras,
        body: cuerpo === undefined ? undefined : (esForm ? cuerpo : JSON.stringify(cuerpo)),
        // El cierre de sesión debe llegar al servidor aunque la página cambie enseguida.
        keepalive: ruta === '/logout',
      });
    } catch (e) {
      throw new ErrorApi('No se pudo conectar con el servidor. Verifica que Laravel esté corriendo (php artisan serve).', 0, null);
    }

    let datos = null;
    try { datos = await respuesta.json(); } catch (e) { datos = null; }

    // 401 en una ruta protegida = el token venció o fue revocado: se cierra la sesión local.
    // En /login el 401 solo significa "credenciales incorrectas".
    if (respuesta.status === 401 && ruta !== '/login') {
      sesion.cerrar();
      if (!sesionExpiradaAvisada) {
        sesionExpiradaAvisada = true;
        document.dispatchEvent(new CustomEvent('sesion-expirada'));
      }
    }

    if (!respuesta.ok) {
      let mensaje;
      if (datos && datos.errors) {
        const primeros = Object.values(datos.errors).map((lista) => traducir(lista[0]));
        mensaje = [...new Set(primeros)].join(' ');
      } else if (respuesta.status >= 500) {
        // No se muestra el detalle técnico al usuario; queda en la consola para el equipo.
        console.error('Error ' + respuesta.status + ' en ' + metodo + ' ' + ruta, datos && (datos.message || datos.mensaje));
        mensaje = 'Error interno del servidor (' + respuesta.status + '). Revisa storage/logs/laravel.log.';
      } else {
        mensaje = traducir((datos && (datos.mensaje || datos.message)) || 'Ocurrió un error inesperado (' + respuesta.status + ').');
      }
      throw new ErrorApi(mensaje, respuesta.status, datos);
    }
    if (metodo !== 'GET' && ruta !== '/login' && ruta !== '/logout') avisarCambio(ruta);
    return datos;
  }

  // ---------- datos al día sin recargar la página ----------
  // Cuando algo se guarda (producto, combo, categoría, pedido…) se avisa a las otras pestañas
  // abiertas para que vuelvan a pedir sus datos. Además cada página consulta cada cierto tiempo,
  // así también ve lo que cambió otra persona desde otra computadora.
  const canal = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('cafeteria6-datos') : null;
  const CLAVE_CAMBIO = 'cafeteria6.cambio';
  function avisarCambio(ruta) {
    const aviso = { ruta, t: Date.now() };
    try {
      if (canal) canal.postMessage(aviso);
      else localStorage.setItem(CLAVE_CAMBIO, JSON.stringify(aviso));
    } catch (e) { /* sin soporte: queda la consulta periódica */ }
  }

  // alCambiar(fn, { cada }): fn() se llama si otra pestaña guardó algo, al volver a la pestaña
  // y cada `cada` ms mientras la página está a la vista (0 = sin consulta periódica).
  function alCambiar(fn, opciones = {}) {
    const cada = opciones.cada === undefined ? 30000 : opciones.cada;
    let espera = null;
    let ultimo = Date.now();
    const correr = () => {
      clearTimeout(espera);
      espera = setTimeout(() => { ultimo = Date.now(); fn(); }, 200);
    };
    if (canal) canal.addEventListener('message', correr);
    else window.addEventListener('storage', (e) => { if (e.key === CLAVE_CAMBIO) correr(); });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - ultimo > 4000) correr();
    });
    if (cada) setInterval(() => { if (!document.hidden) correr(); }, cada);
  }

  const id = (v) => encodeURIComponent(v);
  const consulta = (params) => {
    const q = new URLSearchParams(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null)).toString();
    return q ? '?' + q : '';
  };

  // Producto con imagen: multipart. Para editar se usa POST + _method=PUT
  // (PHP no lee archivos que llegan con PUT).
  function formularioProducto(datos, archivo, metodoReal) {
    const f = new FormData();
    Object.entries(datos).forEach(([k, v]) => {
      if (v === undefined) return;
      if (Array.isArray(v)) v.forEach((x) => f.append(k + '[]', x));   // categorias[]
      else f.append(k, v === null ? '' : v);
    });
    f.append('imagen', archivo);
    if (metodoReal) f.append('_method', metodoReal);
    return f;
  }

  // ---------- endpoints ----------
  const api = {
    // Sesión
    ingresar: (correo, password) => pedir('POST', '/login', { email: correo, password }),
    salir: () => pedir('POST', '/logout', {}),
    yo: () => pedir('GET', '/me'),

    // Menú y combos (público)
    menu: (filtros) => pedir('GET', '/menu' + consulta(filtros)),
    combos: () => pedir('GET', '/combos'),
    categorias: () => pedir('GET', '/categorias'),

    // Pedidos del estudiante
    crearPedido: (productos, combos) => pedir('POST', '/pedidos', Object.assign(
      productos && productos.length ? { productos } : {}, combos && combos.length ? { combos } : {})),
    pedido: (idPedido) => pedir('GET', '/pedidos/' + id(idPedido)),
    misPedidos: () => pedir('GET', '/mis-pedidos'),
    cancelarPedido: (idPedido) => pedir('POST', '/pedidos/' + id(idPedido) + '/cancelar', {}),
    repetirPedido: (idPedido) => pedir('POST', '/pedidos/' + id(idPedido) + '/repetir', {}),

    // Cocina y caja
    pedidosActivos: (categoria) => pedir('GET', '/pedidos/activos' + consulta({ categoria })),
    cambiarEstado: (idPedido, estado) => pedir('PUT', '/pedidos/' + id(idPedido) + '/estado', { estado }),
    entregar: (codigo) => pedir('POST', '/pedidos/entregar', { codigo }),

    // Inventario
    alertas: () => pedir('GET', '/inventario/alertas'),
    reponerStock: (idProducto, cantidad, motivo) => pedir('PATCH', '/productos/' + id(idProducto) + '/stock', { agregar: Number(cantidad), motivo: motivo || null }),
    fijarStock: (idProducto, stock, motivo) => pedir('PATCH', '/productos/' + id(idProducto) + '/stock', { stock: Number(stock), motivo: motivo || null }),
    agotar: (idProducto) => pedir('PATCH', '/productos/' + id(idProducto) + '/agotado', {}),
    movimientos: (idProducto) => pedir('GET', '/productos/' + id(idProducto) + '/movimientos'),

    // Personal: empleados y administradores (admin)
    empleados: (inactivos) => pedir('GET', '/admin/empleados' + consulta({ incluir_admins: 1, inactivos: inactivos ? 1 : '' })),
    crearEmpleado: (datos) => pedir('POST', '/admin/empleados', datos),
    editarEmpleado: (idEmp, datos) => pedir('PUT', '/admin/empleados/' + id(idEmp), datos),
    bajaEmpleado: (idEmp) => pedir('DELETE', '/admin/empleados/' + id(idEmp)),
    restaurarEmpleado: (idEmp) => pedir('POST', '/admin/empleados/' + id(idEmp) + '/restaurar', {}),

    // Productos (admin)
    productosAdmin: () => pedir('GET', '/admin/productos'),
    productosEliminados: () => pedir('GET', '/admin/productos?eliminados=1'),
    restaurarProducto: (idProd) => pedir('POST', '/admin/productos/' + id(idProd) + '/restaurar', {}),
    crearProducto: (datos, archivo) => pedir('POST', '/admin/productos', archivo ? formularioProducto(datos, archivo) : datos),
    editarProducto: (idProd, datos, archivo) => (archivo
      ? pedir('POST', '/admin/productos/' + id(idProd), formularioProducto(datos, archivo, 'PUT'))
      : pedir('PUT', '/admin/productos/' + id(idProd), datos)),
    eliminarProducto: (idProd) => pedir('DELETE', '/admin/productos/' + id(idProd)),
    alternarProducto: (idProd) => pedir('PATCH', '/admin/productos/' + id(idProd) + '/toggle', {}),

    // Categorías (admin)
    crearCategoria: (nombre, logo, icono) => {
      if (!logo) return pedir('POST', '/admin/categorias', icono ? { nombre, icono } : { nombre });
      const f = new FormData(); f.append('nombre', nombre); f.append('logo', logo);
      if (icono) f.append('icono', icono);
      return pedir('POST', '/admin/categorias', f);
    },
    subirLogoCategoria: (idCat, logo) => {
      const f = new FormData(); f.append('logo', logo);
      return pedir('POST', '/admin/categorias/' + id(idCat) + '/logo', f);
    },
    quitarLogoCategoria: (idCat) => pedir('DELETE', '/admin/categorias/' + id(idCat) + '/logo'),
    cambiarIconoCategoria: (idCat, icono) => pedir('PUT', '/admin/categorias/' + id(idCat) + '/icono', { icono }),
    renombrarCategoria: (idCat, nombre) => pedir('PUT', '/admin/categorias/' + id(idCat), { nombre }),
    eliminarCategoria: (idCat) => pedir('DELETE', '/admin/categorias/' + id(idCat)),

    // Combos (admin)
    combosAdmin: () => pedir('GET', '/admin/combos'),
    crearCombo: (datos) => pedir('POST', '/admin/combos', datos),
    editarCombo: (idCombo, datos) => pedir('PUT', '/admin/combos/' + id(idCombo), datos),
    eliminarCombo: (idCombo) => pedir('DELETE', '/admin/combos/' + id(idCombo)),
    alternarCombo: (idCombo) => pedir('PATCH', '/admin/combos/' + id(idCombo) + '/toggle', {}),

    // Reportes (admin)
    reporteVentas: (filtros) => pedir('GET', '/admin/reportes/ventas' + consulta(filtros)),
    reporteDetalle: (fecha) => pedir('GET', '/admin/reportes/detalle' + consulta({ fecha })),
  };

  // URL de la foto de un producto. Las fotos se guardan en la base de datos y las
  // entrega GET /api/productos/{id}/imagen?v=huella (el servidor ya manda imagen_url).
  // En el carrito se guarda directamente esa dirección.
  function urlImagen(p) {
    if (!p) return null;
    if (p.imagen_url) return p.imagen_url;
    if (!p.imagen) return null;
    if (/^https?:\/\//.test(p.imagen)) return p.imagen;
    return CFG.API_URL + '/productos/' + encodeURIComponent(p.id) + '/imagen?v=' + encodeURIComponent(p.imagen);
  }

  api.alCambiar = alCambiar;
  window.Cafeteria = Object.assign(window.Cafeteria || {}, { api, sesion, almacen, ErrorApi, urlImagen });
})();
