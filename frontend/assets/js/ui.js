// ============================================================
// Piezas compartidas por todas las páginas:
// barra superior y pie (según el rol), avisos, diálogos,
// carrito (en el navegador) y "mis pedidos" guardados localmente.
// ============================================================
(function () {
  const { sesion, almacen } = window.Cafeteria;
  const RUTAS = window.CAFETERIA_CONFIG.RUTAS;

  // ---------- utilidades ----------
  function esc(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  const formatoBs = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const bs = (n) => 'Bs ' + formatoBs.format(Number(n) || 0);

  // Laravel devuelve fecha_pedido como "2026-09-27 21:30:00" (hora del servidor).
  function fecha(valor) {
    if (!valor) return null;
    const d = new Date(String(valor).replace(' ', 'T'));
    return isNaN(d) ? null : d;
  }

  function hora(valor) {
    const d = fecha(valor);
    return d ? d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : '—';
  }

  function hace(valor) {
    const d = fecha(valor);
    if (!d) return '';
    const min = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
    if (min < 1) return 'recién';
    if (min < 60) return 'hace ' + min + ' min';
    const h = Math.floor(min / 60);
    return 'hace ' + h + ' h ' + (min % 60) + ' min';
  }

  // ---------- iconos ----------
  const ICONOS = {
    buscar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    bolsa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    cerrar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    izq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    der: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    flechas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 7 5 5-5 5M13 7l5 5-5 5"/></svg>',
  };

  // ---------- barra superior y pie ----------
  // Qué ve cada rol (según lo que permite la API hoy):
  //   visitante / Cliente (3): menú y, con sesión, "Mis pedidos"
  //   Empleado (2): cocina (ver pedidos y cambiar su estado)
  //   Admin (1): cocina + productos + personal y roles
  function seccionesPorRol() {
    const s = [['inicio', RUTAS.inicio, 'Inicio']];
    if (!sesion.esPersonal()) s.push(['menu', RUTAS.menu, 'Menú']);
    if (sesion.esCliente()) s.push(['pedidos', RUTAS.pedidos, 'Mis pedidos']);
    if (sesion.esPersonal()) s.push(['cocina', RUTAS.cocina, 'Cocina']);
    if (sesion.esAdmin()) {
      s.push(['productos', RUTAS.productos, 'Productos']);
      s.push(['personal', RUTAS.personal, 'Personal']);
    }
    return s;
  }

  function enlacesNav(pagina) {
    return seccionesPorRol().map(([clave, href, texto]) =>
      `<a href="${href}" class="${clave === pagina ? 'activo' : ''}">${texto}</a>`).join('');
  }

  function puedePedir() {
    return !sesion.esPersonal();
  }

  // En pantallas anchas el pedido se ve fijo al costado del menú.
  const esEscritorio = () => window.matchMedia('(min-width: 1100px)').matches;

  function pintarLayout(opciones) {
    const pagina = opciones.pagina || '';
    const usuario = sesion.usuario();

    const cuenta = usuario
      ? `<span class="topbar-usuario"><span class="topbar-nombre">${esc(usuario.nombre.split(' ')[0])}</span>
           <span class="chip-rol">${esc(sesion.nombreRol())}</span></span>
         <button type="button" class="btn-pildora-clara" data-accion="salir">Salir</button>`
      : `<a class="topbar-ingresar ${pagina === 'ingresar' ? 'activo' : ''}" href="${RUTAS.ingresar}">Ingresar</a>`;

    const carrito = puedePedir() && opciones.conCarrito
      ? `<button type="button" class="icono-redondo" data-accion="abrir-carrito" aria-label="Ver mi pedido">
           ${ICONOS.bolsa}<span class="contador-carrito" hidden>0</span></button>`
      : '';

    const buscar = opciones.conBuscar
      ? `<button type="button" class="icono-redondo icono-claro" data-accion="buscar" aria-label="Buscar en el menú">${ICONOS.buscar}</button>`
      : '';

    const cabecera = document.getElementById('cabecera');
    if (cabecera) {
      cabecera.className = 'topbar' + (opciones.transparente ? ' topbar-transparente' : '');
      cabecera.innerHTML = `
        <div class="topbar-interior">
          <a class="marca" href="${RUTAS.inicio}">cafetería<span>univalle</span></a>
          <nav class="nav" id="nav-principal" aria-label="Navegación principal">${enlacesNav(pagina)}</nav>
          <div class="topbar-acciones">
            ${buscar}${carrito}${cuenta}
            <button type="button" class="icono-redondo boton-menu-movil" data-accion="menu-movil" aria-label="Abrir navegación" aria-expanded="false">${ICONOS.menu}</button>
          </div>
        </div>`;
    }

    const pie = document.getElementById('pie');
    if (pie) {
      const secciones = seccionesPorRol().filter(([clave]) => clave !== 'inicio').map(([, h, t]) => [h, t]);
      pie.className = 'pie';
      pie.innerHTML = `
        <div class="pie-grid">
          <div class="pie-col pie-marca">
            <span class="pie-logo">Cafetería</span>
            <p>Pide antes de llegar, recibe tu código y recoge sin hacer fila.</p>
          </div>
          <div class="pie-col">
            <h4>Secciones</h4>
            ${secciones.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}
          </div>
          <div class="pie-col">
            <h4>Tu cuenta</h4>
            ${usuario
              ? `<span>${esc(usuario.nombre)}</span><span>${esc(usuario.correo)}</span>
                 <a href="#" data-accion="salir">Cerrar sesión</a>`
              : `<a href="${RUTAS.ingresar}">Ingresar</a><a href="${RUTAS.registro}">Crear cuenta</a>`}
          </div>
          <div class="pie-col">
            <h4>Universidad</h4>
            <span>Universidad Privada del Valle</span>
            <span>La Paz, Bolivia</span>
          </div>
        </div>
        <p class="pie-copy">© ${new Date().getFullYear()} Cafetería Universitaria · Sistema web de pedidos anticipados</p>`;
    }

    actualizarContadorCarrito();
  }

  // Acciones comunes de la barra (delegadas).
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const accion = b.dataset.accion;
    if (accion === 'salir') {
      e.preventDefault();
      // La API no tiene ruta de logout: se descarta el token en el navegador.
      sesion.cerrar();
      window.location.href = RUTAS.ingresar + '?salio=1';
    } else if (accion === 'menu-movil') {
      const nav = document.getElementById('nav-principal');
      const abierto = nav.classList.toggle('abierto');
      b.setAttribute('aria-expanded', String(abierto));
    } else if (accion === 'buscar') {
      const campo = document.getElementById('campo-busqueda');
      if (campo) {
        campo.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => campo.focus({ preventScroll: true }), 350);
      } else {
        window.location.href = RUTAS.inicio + '#buscar';
      }
    }
  });

  document.addEventListener('sesion-expirada', () => {
    aviso('Tu sesión expiró. Vuelve a ingresar.', 'error');
    setTimeout(() => { window.location.href = RUTAS.ingresar; }, 1400);
  });

  // ---------- avisos (toasts) ----------
  function aviso(texto, tipo = 'info', ms = 3800) {
    let zona = document.getElementById('zona-avisos');
    if (!zona) {
      zona = document.createElement('div');
      zona.id = 'zona-avisos';
      zona.setAttribute('role', 'status');
      zona.setAttribute('aria-live', 'polite');
      document.body.appendChild(zona);
    }
    // Como máximo 3 avisos a la vez: se retira el más antiguo.
    while (zona.children.length >= 3) zona.firstElementChild.remove();
    const t = document.createElement('div');
    t.className = 'aviso aviso-' + tipo;
    t.textContent = texto;
    zona.appendChild(t);
    requestAnimationFrame(() => t.classList.add('visible'));
    setTimeout(() => {
      t.classList.remove('visible');
      setTimeout(() => t.remove(), 300);
    }, ms);
  }

  // ---------- diálogo modal ----------
  function modal(html, { clase = '' } = {}) {
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML = `<div class="modal ${clase}" role="dialog" aria-modal="true">
      <button type="button" class="modal-cerrar" aria-label="Cerrar">${ICONOS.cerrar}</button>${html}</div>`;
    document.body.appendChild(fondo);
    document.body.classList.add('sin-scroll');
    requestAnimationFrame(() => fondo.classList.add('visible'));

    const anterior = document.activeElement;
    const cerrar = () => {
      fondo.classList.remove('visible');
      document.body.classList.remove('sin-scroll');
      document.removeEventListener('keydown', teclas);
      setTimeout(() => fondo.remove(), 220);
      if (anterior && anterior.focus) anterior.focus();
      fondo.dispatchEvent(new CustomEvent('cerrado'));
    };
    const teclas = (e) => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', teclas);
    fondo.addEventListener('click', (e) => {
      if (e.target === fondo || e.target.closest('.modal-cerrar') || e.target.closest('[data-cerrar]')) cerrar();
    });
    const enfocable = fondo.querySelector('[autofocus], .modal button:not(.modal-cerrar), .modal input');
    if (enfocable) setTimeout(() => enfocable.focus(), 50);
    return { elemento: fondo, cerrar };
  }

  function confirmar(titulo, texto, { aceptar = 'Aceptar', peligro = false } = {}) {
    return new Promise((resolver) => {
      let respuesta = false;
      const m = modal(`
        <h2 class="modal-titulo">${esc(titulo)}</h2>
        <p class="modal-texto">${esc(texto)}</p>
        <div class="modal-botones">
          <button type="button" class="btn btn-contorno" data-cerrar>Volver</button>
          <button type="button" class="btn ${peligro ? 'btn-peligro' : 'btn-oscuro'}" data-si>${esc(aceptar)}</button>
        </div>`, { clase: 'modal-chico' });
      m.elemento.querySelector('[data-si]').addEventListener('click', () => { respuesta = true; m.cerrar(); });
      m.elemento.addEventListener('cerrado', () => resolver(respuesta));
    });
  }

  // ---------- protección de páginas ----------
  // roles: lista de id_rol permitidos. volver: clave de RUTAS a la que regresar
  // después de ingresar. Si no hay sesión, manda a la página de ingreso.
  function exigirSesion(roles, volver) {
    if (!sesion.token()) {
      window.location.replace(RUTAS.ingresar + (volver ? '?volver=' + encodeURIComponent(volver) : ''));
      return false;
    }
    if (roles && !roles.includes(sesion.rol())) {
      window.location.replace(sesion.esPersonal() ? RUTAS.cocina : RUTAS.inicio);
      return false;
    }
    return true;
  }

  // ---------- carrito (se guarda en el navegador hasta confirmar) ----------
  const CLAVE_CARRITO = 'cafeteria.carrito';
  const carrito = {
    items() { return almacen.leer(CLAVE_CARRITO, []); },
    guardar(items) {
      almacen.guardar(CLAVE_CARRITO, items);
      actualizarContadorCarrito();
      document.dispatchEvent(new CustomEvent('carrito-cambio'));
    },
    agregar(p) {
      const items = this.items();
      const ex = items.find((i) => i.id_producto === p.id_producto);
      if (ex) {
        if (ex.cantidad >= p.stock) return false;
        ex.cantidad += 1;
        ex.stock = p.stock;
        ex.precio = p.precio;
      } else {
        if (p.stock < 1) return false;
        items.push({ id_producto: p.id_producto, nombre: p.nombre, precio: p.precio, stock: p.stock, categoria: p.categoria, cantidad: 1, notas: '' });
      }
      this.guardar(items);
      return true;
    },
    cambiar(id, cambios) {
      const items = this.items().map((i) => (i.id_producto === id ? Object.assign(i, cambios) : i))
        .filter((i) => i.cantidad > 0);
      this.guardar(items);
    },
    // La nota se guarda sin avisar el cambio para no repintar mientras se escribe.
    nota(id, texto) {
      almacen.guardar(CLAVE_CARRITO, this.items().map((i) => (i.id_producto === id ? Object.assign(i, { notas: texto }) : i)));
    },
    quitar(id) { this.guardar(this.items().filter((i) => i.id_producto !== id)); },
    vaciar() { this.guardar([]); },
    total() { return this.items().reduce((s, i) => s + i.precio * i.cantidad, 0); },
    unidades() { return this.items().reduce((s, i) => s + i.cantidad, 0); },
  };

  function actualizarContadorCarrito() {
    document.querySelectorAll('.contador-carrito').forEach((el) => {
      const n = carrito.unidades();
      el.textContent = n;
      el.hidden = n === 0;
    });
  }

  // ---------- pedidos hechos desde este navegador ----------
  // La API todavía no tiene una ruta "mis pedidos", así que al confirmar
  // se guarda aquí el número, el código y el detalle; el estado se
  // consulta en vivo con GET /pedidos/activos.
  const pedidosLocales = {
    clave() {
      const u = sesion.usuario();
      return 'cafeteria.pedidos.' + (u ? u.correo : 'anonimo');
    },
    todos() { return almacen.leer(this.clave(), []); },
    guardarTodos(lista) { almacen.guardar(this.clave(), lista); },
    agregar(p) { const l = this.todos(); l.unshift(p); this.guardarTodos(l); },
    actualizar(id, cambios) {
      this.guardarTodos(this.todos().map((p) => (p.id_pedido === id ? Object.assign(p, cambios) : p)));
    },
  };

  window.Cafeteria = Object.assign(window.Cafeteria, {
    ui: { esc, bs, hora, hace, fecha, ICONOS, pintarLayout, aviso, modal, confirmar, exigirSesion, puedePedir, esEscritorio },
    carrito,
    pedidosLocales,
  });
})();
