// ============================================================
// Cliente de la API de Laravel + sesión del usuario.
//
// Endpoints que existen hoy en routes/api.php (no se inventa ninguno):
//   GET   /menu                    público        (HU-01)
//   POST  /register                público        (auto-registro institucional; con token de
//                                                  Admin crea cuentas de personal con su rol)
//   POST  /login                   público        (HU-27, devuelve token Sanctum)
//   POST  /pedidos                 con token      (carrito → pedido, notas HU-03)
//   GET   /pedidos/activos         con token      (HU-13, cocina)
//   PATCH /pedidos/{id}/estado     con token      (HU-14 y HU-07)
//   GET   /menu/buscar?q=          público        (HU-02, busca por nombre)
//   POST  /admin/productos         con token      (HU-20, crear producto)
//   PUT   /admin/productos/{id}    con token      (HU-20, editar producto)
//   GET   /admin/personal          con token      (HU-24, lista Admin y Empleados)
//   PATCH /admin/usuarios/{id}/rol con token      (HU-24, asignar rol)
//   POST  /pedidos/{id}/entregar   con token      (HU-17, entrega validando el código)
//   POST  /pedidos/{id}/retraso    con token      (HU-16, aviso de retraso + minutos → tiempo estimado)
//   PATCH /admin/productos/{id}/toggle con token  (HU-19, Disponible ↔ Agotado, guarda quién y cuándo)
//   GET   /admin/stock/historial?producto= con token (HU-15, historial de movimientos de stock)
//   GET   /mis-pedidos             con token      (HU-08, historial del cliente)
//   GET   /mis-notificaciones      con token      (HU-06, avisos del cliente)
//   PATCH /mis-notificaciones/{id}/leer           (HU-06, marcar leída)
//   --- Iteraciones 4 y 5 ---
//   GET   /pedidos/tiempo-espera?productos=1x2&combos=3x1  público (HU-11)
//   POST  /pedidos/{id}/cancelar   con token      (HU-07, el cliente cancela si no está Listo)
//   POST  /pedidos/{id}/repetir    con token      (HU-12, productos de un pedido anterior para el carrito)
//   POST  /favoritos/{id}          con token      (HU-10, marcar / desmarcar)
//   GET   /mis-favoritos           con token      (HU-10)
//   POST  /pedidos/{id}/feedback   con token      (HU-09, calificar un pedido recogido)
//   GET   /combos                  público        (HU-21, combos del día)
//   GET   /horarios                público        (HU-23, ¿está abierta? + horario)
//   GET   /admin/productos         Admin/Empleado (todos los productos, también agotados)
//   PATCH /admin/productos/{id}/oferta  Admin     (HU-21, oferta de un producto)
//   GET|POST /admin/combos, PUT /admin/combos/{id}, PATCH /admin/combos/{id}/toggle  Admin (HU-21)
//   GET   /admin/reportes/ventas?desde&hasta&agrupar  Admin (HU-22)
//   GET   /admin/feedback?desde&hasta&producto        Admin (HU-25)
//   PUT   /admin/horarios          Admin          (HU-23 y capacidad de cocina de HU-11)
//
// El token va en la cabecera Authorization: Bearer <token>.
// Siempre se manda Accept: application/json; sin eso Laravel responde
// a los errores de validación con una redirección en vez de JSON.
// ============================================================
(function () {
  const CFG = window.CAFETERIA_CONFIG;
  const CLAVE_SESION = 'cafeteria.sesion';

  // ---------- almacenamiento seguro (modo privado puede bloquearlo) ----------
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
  const sesion = {
    obtener() { return almacen.leer(CLAVE_SESION, null); },
    guardar(token, usuario) { almacen.guardar(CLAVE_SESION, { token, usuario }); },
    cerrar() { almacen.borrar(CLAVE_SESION); },
    usuario() { const s = this.obtener(); return s ? s.usuario : null; },
    token() { const s = this.obtener(); return s ? s.token : null; },
    rol() { const u = this.usuario(); return u ? Number(u.id_rol) : null; },
    esCliente() { return this.rol() === 3; },
    esAdmin() { return this.rol() === 1; },
    esEmpleado() { return this.rol() === 2; },
    esPersonal() { return this.rol() === 1 || this.rol() === 2; },
    nombreRol() { return CFG.ROLES[this.rol()] || ''; },
  };

  // ---------- traducción de mensajes de validación de Laravel ----------
  const CAMPOS = {
    nombre: 'nombre', correo: 'correo', password: 'contraseña',
    productos: 'productos', estado: 'estado', precio: 'precio',
    stock_actual: 'stock', categorias: 'categorías', descripcion: 'descripción', id_rol: 'rol',
  };

  function traducir(mensaje) {
    if (!mensaje) return '';
    const m = String(mensaje);
    const reglas = [
      [/The (\w+) has already been taken\./, (_, c) => `Ese ${CAMPOS[c] || c} ya está registrado.`],
      [/The (\w+) (field )?is required\./, (_, c) => `El campo ${CAMPOS[c] || c} es obligatorio.`],
      [/The (\w+) must be a valid email address\./, () => 'Ingresa un correo válido.'],
      [/The (\w+) (field )?must be at least (\d+) characters\./, (_, c, __, n) => `La ${CAMPOS[c] || c} debe tener al menos ${n} caracteres.`],
      [/The selected productos\.\d+\.id_producto is invalid\./, () => 'Uno de los productos ya no existe en el menú.'],
      [/productos\.\d+\.notas.*255/, () => 'Cada nota puede tener como máximo 255 caracteres.'],
      [/The categorias field is required\./, () => 'Elige al menos una categoría.'],
      [/The selected id rol is invalid\./, () => 'Ese rol no existe.'],
      [/The (\w+) must be (a number|an integer)\./, (_, c) => `El ${CAMPOS[c] || c} debe ser un número válido.`],
      [/The (\w+) must be at least 0\./, (_, c) => `El ${CAMPOS[c] || c} no puede ser negativo.`],
      [/Unauthenticated\./, () => 'Tu sesión expiró. Vuelve a ingresar.'],
      [/Too Many Attempts\./, () => 'Demasiadas solicitudes seguidas. Espera un momento.'],
      [/Cancelaci[oó]n denegada/, () => 'Solo se puede cancelar un pedido mientras no esté Listo.'],
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
  async function pedir(metodo, ruta, cuerpo) {
    const cabeceras = { Accept: 'application/json' };
    if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
    const token = sesion.token();
    if (token) cabeceras.Authorization = 'Bearer ' + token;

    let respuesta;
    try {
      respuesta = await fetch(CFG.API_URL + ruta, {
        method: metodo,
        headers: cabeceras,
        body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      });
    } catch (e) {
      throw new ErrorApi(
        'No se pudo conectar con el servidor. Verifica que Laravel esté corriendo (php artisan serve).',
        0, null
      );
    }

    let datos = null;
    try { datos = await respuesta.json(); } catch (e) { datos = null; }

    // 401 en una ruta protegida = no hay sesión válida (token vencido, revocado
    // o borrado): se cierra la sesión local y la página manda a ingresar.
    // En /login el 401 solo significa "contraseña incorrecta".
    if (respuesta.status === 401 && ruta !== '/login') {
      sesion.cerrar();
      if (!sesionExpiradaAvisada) {
        sesionExpiradaAvisada = true;
        document.dispatchEvent(new CustomEvent('sesion-expirada'));
      }
    }

    if (!respuesta.ok || (datos && datos.success === false)) {
      let mensaje = (datos && datos.message) || 'Ocurrió un error inesperado (' + respuesta.status + ').';
      if (datos && datos.errors) {
        const primeros = Object.values(datos.errors).map((lista) => traducir(lista[0]));
        mensaje = [...new Set(primeros)].join(' ');
      } else if (datos && datos.error && /Cancelaci[oó]n denegada/.test(datos.error)) {
        mensaje = traducir(datos.error);
      } else if (respuesta.status >= 500) {
        // No se muestra el SQL al usuario; queda en la consola para el equipo.
        console.error('Error ' + respuesta.status + ' en ' + metodo + ' ' + ruta, datos && datos.message);
        mensaje = /rols' doesn't exist/.test((datos && datos.message) || '')
          ? 'El servidor no encuentra la tabla de roles: al modelo Rol de Laravel le falta indicar la tabla ROL.'
          : 'Error interno del servidor (' + respuesta.status + '). Revisa storage/logs/laravel.log.';
      } else {
        mensaje = traducir(mensaje);
      }
      throw new ErrorApi(mensaje, respuesta.status, datos);
    }
    return datos;
  }

  // ---------- endpoints ----------
  const api = {
    menu: () => pedir('GET', '/menu').then((r) => r.data || []),
    registrar: (nombre, correo, password) => pedir('POST', '/register', { nombre, correo, password }),
    ingresar: (correo, password) => pedir('POST', '/login', { correo, password }).then((r) => r.data),
    // HU-21: el carrito puede llevar productos sueltos y combos.
    crearPedido: (productos, combos) => pedir('POST', '/pedidos', Object.assign(
      productos && productos.length ? { productos } : {}, combos && combos.length ? { combos } : {})).then((r) => r.data),
    // HU-18: con ?categoria= la API devuelve solo los pedidos que tienen productos de esa categoría.
    pedidosActivos: (categoria) => pedir('GET', '/pedidos/activos' + (categoria ? '?categoria=' + encodeURIComponent(categoria) : '')).then((r) => r.data || []),
    // HU-17: la API valida el código y solo entonces marca Entregado.
    entregarPedido: (id, codigo) => pedir('POST', '/pedidos/' + encodeURIComponent(id) + '/entregar', { codigo_verificacion: codigo }),
    // HU-16: avisa el retraso al cliente y suma los minutos al tiempo estimado del pedido.
    notificarRetraso: (id, minutos) => pedir('POST', '/pedidos/' + encodeURIComponent(id) + '/retraso', { minutos: Number(minutos) || 10 }),
    // HU-15: movimientos de stock (todos, o de un producto).
    historialStock: (idProducto) => pedir('GET', '/admin/stock/historial' + (idProducto ? '?producto=' + encodeURIComponent(idProducto) : '')).then((r) => r.data || []),
    // HU-19: alterna el producto entre Disponible y Agotado.
    alternarProducto: (id) => pedir('PATCH', '/admin/productos/' + encodeURIComponent(id) + '/toggle', {}),
    // HU-08: todos los pedidos del usuario con sesión (historial real).
    misPedidos: () => pedir('GET', '/mis-pedidos').then((r) => r.data || []),
    // HU-06 / HU-16: notificaciones del usuario (pedido listo, retrasos).
    misNotificaciones: () => pedir('GET', '/mis-notificaciones').then((r) => r.data || []),
    marcarLeida: (id) => pedir('PATCH', '/mis-notificaciones/' + encodeURIComponent(id) + '/leer', {}),
    cambiarEstado: (id, estado) => pedir('PATCH', '/pedidos/' + encodeURIComponent(id) + '/estado', { estado }),
    buscar: (q) => pedir('GET', '/menu/buscar?q=' + encodeURIComponent(q)).then((r) => r.data || []),
    crearProducto: (datos) => pedir('POST', '/admin/productos', datos),
    editarProducto: (id, datos) => pedir('PUT', '/admin/productos/' + encodeURIComponent(id), datos),
    personal: () => pedir('GET', '/admin/personal').then((r) => r.data || []),
    // El Admin crea cuentas de personal con la misma ruta /register: como va su
    // token, AuthController@register respeta el id_rol y devuelve el id_usuario.
    crearCuentaPersonal: (nombre, correo, password, idRol) =>
      pedir('POST', '/register', { nombre, correo, password, id_rol: Number(idRol) }).then((r) => r.data),
    asignarRol: (id, idRol) => pedir('PATCH', '/admin/usuarios/' + encodeURIComponent(id) + '/rol', { id_rol: Number(idRol) }),

    // ---------- Iteración 4 ----------
    // HU-11: items = [{ id_producto, cantidad, es_combo, id_combo }]
    tiempoEspera: (items) => {
      const lista = (filtro, clave) => (items || []).filter(filtro).map((i) => i[clave] + 'x' + i.cantidad).join(',');
      const p = lista((i) => !i.es_combo, 'id_producto');
      const c = lista((i) => i.es_combo, 'id_combo');
      return pedir('GET', '/pedidos/tiempo-espera?productos=' + encodeURIComponent(p) + '&combos=' + encodeURIComponent(c));
    },
    cancelarPedido: (id) => pedir('POST', '/pedidos/' + encodeURIComponent(id) + '/cancelar', {}),
    repetirPedido: (id) => pedir('POST', '/pedidos/' + encodeURIComponent(id) + '/repetir', {}).then((r) => r.data),
    favoritos: () => pedir('GET', '/mis-favoritos').then((r) => r.data || []),
    alternarFavorito: (idProducto) => pedir('POST', '/favoritos/' + encodeURIComponent(idProducto), {}),

    // ---------- Iteración 5 ----------
    calificar: (idPedido, calificacion, comentario) =>
      pedir('POST', '/pedidos/' + encodeURIComponent(idPedido) + '/feedback', { calificacion: Number(calificacion), comentario: comentario || null }),
    combos: () => pedir('GET', '/combos').then((r) => r.data || []),
    horarios: () => pedir('GET', '/horarios').then((r) => r.data),
    productosAdmin: () => pedir('GET', '/admin/productos'),
    configurarOferta: (id, precio) => pedir('PATCH', '/admin/productos/' + encodeURIComponent(id) + '/oferta', { precio_oferta: precio }),
    combosAdmin: () => pedir('GET', '/admin/combos').then((r) => r.data || []),
    crearCombo: (datos) => pedir('POST', '/admin/combos', datos),
    editarCombo: (id, datos) => pedir('PUT', '/admin/combos/' + encodeURIComponent(id), datos),
    alternarCombo: (id) => pedir('PATCH', '/admin/combos/' + encodeURIComponent(id) + '/toggle', {}),
    reporteVentas: (filtros) => pedir('GET', '/admin/reportes/ventas?' + new URLSearchParams(filtros || {}).toString()).then((r) => r.data),
    feedbackAdmin: (filtros) => {
      const f = Object.fromEntries(Object.entries(filtros || {}).filter(([, v]) => v !== '' && v != null));
      return pedir('GET', '/admin/feedback?' + new URLSearchParams(f).toString()).then((r) => r.data);
    },
    guardarHorarios: (horarios, capacidad) => pedir('PUT', '/admin/horarios', { horarios, capacidad_cocina: Number(capacidad) || null }),
  };

  window.Cafeteria = Object.assign(window.Cafeteria || {}, { api, sesion, almacen, ErrorApi });
})();
