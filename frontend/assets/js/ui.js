// ============================================================
// Piezas compartidas por todas las páginas:
// barra superior y pie (según el rol), avisos, diálogos, estados
// del pedido, fotos de productos, carrito (en el navegador) y el
// cierre de sesión por inactividad.
// ============================================================
(function () {
  const { sesion, almacen, api, urlImagen } = window.Cafeteria;
  const CFG = window.CAFETERIA_CONFIG;
  const RUTAS = CFG.RUTAS;

  // ---------- utilidades ----------
  function esc(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  const formatoBs = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const bs = (n) => 'Bs ' + formatoBs.format(Number(n) || 0);

  // Laravel devuelve las fechas en ISO 8601 con zona (2026-11-12T22:41:22.000000Z).
  function fecha(valor) {
    if (!valor) return null;
    const d = new Date(String(valor).replace(' ', 'T'));
    return isNaN(d) ? null : d;
  }

  function hora(valor) {
    const d = fecha(valor);
    return d ? d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : '—';
  }

  function fechaHora(valor) {
    const d = fecha(valor);
    return d ? d.toLocaleDateString('es-BO') + ' · ' + d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : '—';
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

  // ---------- estados del pedido ----------
  // El backend usa Recibido → En preparación → Para entregar → Completado.
  // En pantalla se muestran como en la historia de usuario: Recibido, En preparación, Listo, Entregado.
  const ESTADOS = {
    Recibido: { texto: 'Recibido', clase: 'pendiente' },
    'En preparación': { texto: 'En preparación', clase: 'preparando' },
    'Para entregar': { texto: 'Listo', clase: 'listo' },
    Completado: { texto: 'Entregado', clase: 'entregado' },
    Cancelado: { texto: 'Cancelado', clase: 'cancelado' },
  };
  const textoEstado = (e) => (ESTADOS[e] || { texto: e }).texto;
  const badgeEstado = (e) => `<span class="badge badge-${(ESTADOS[e] || { clase: 'entregado' }).clase}">${esc(textoEstado(e))}</span>`;

  // ---------- foto del producto ----------
  // Si el producto no tiene foto (o la foto no carga) se muestra una foto de referencia.
  const FOTO_POR_DEFECTO = RUTAS.inicio + 'assets/img/sin-foto.jpg';
  const MARCA_REFERENCIAL = '<span class="foto-referencial">Imagen referencial</span>';

  function fotoProducto(p) {
    const url = urlImagen(p);
    if (!url) return `<img class="producto-foto" src="${FOTO_POR_DEFECTO}" alt="" loading="lazy">${MARCA_REFERENCIAL}`;
    return `<img class="producto-foto" src="${esc(url)}" alt="${esc(p.nombre || '')}" loading="lazy" data-respaldo>`;
  }

  // El combo no tiene foto propia: se arma con las fotos de sus productos.
  function fotoCombo(productos) {
    const conFoto = (productos || []).filter((p) => urlImagen(p)).slice(0, 3);
    if (!conFoto.length) return fotoProducto({});
    return `<div class="combo-fotos n${conFoto.length}">${conFoto.map(fotoProducto).join('')}</div>`;
  }

  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img && img.tagName === 'IMG' && img.hasAttribute('data-respaldo')) {
      img.removeAttribute('data-respaldo');
      img.src = FOTO_POR_DEFECTO;
      img.insertAdjacentHTML('afterend', MARCA_REFERENCIAL);
    }
  }, true);

  // ---------- iconos ----------
  const ICONOS = {
    buscar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    bolsa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    cerrar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    izq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    der: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    flechas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 7 5 5-5 5M13 7l5 5-5 5"/></svg>',
    qr: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h7v-4"/></svg>',
  };

  // Íconos de línea para diálogos y botones de acción: icono('editar'), icono('caja')…
  const TRAZOS = {
    taza: '<path d="M4 8h13v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6V8Z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 2.5V5M12 2.5V5"/>',
    editar: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
    caja: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z"/><path d="m3 7.5 9 4.5 9-4.5M12 12v9"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    etiqueta: '<path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
    alerta: '<path d="M12 3.5 2.5 20h19L12 3.5Z"/><path d="M12 10v4.5M12 17.5v.01"/>',
    papelera: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    pregunta: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5v.7M12 17.5v.01"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    regalo: '<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13M12 8C10 4 6 4 6 6.5S9 8 12 8Zm0 0c2-4 6-4 6-1.5S15 8 12 8Z"/>',
    pausa: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5 3.5-5 3.5v-7Z"/>',
    recibo: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    correo: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    candado: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    ojo: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    ojoNo: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.7 8.5 2 12 2 12s3.5 7 10 7c1.9 0 3.5-.6 4.9-1.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h7v-4"/>',
    entrar: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l4-4-4-4M14 12H4"/>',
    filtro: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8L4 5Z"/>',
    menos: '<path d="M5 12h14"/>',
    abajo: '<path d="m6 9 6 6 6-6"/>',
    deshacer: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    estrella: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
  };
  const icono = (nombre) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TRAZOS[nombre] || TRAZOS.taza}</svg>`;

  // ---------- barra superior y pie ----------
  // Qué ve cada rol:
  //   visitante / estudiante: menú y, con sesión, "Mis pedidos"
  //   empleado: cocina (pedidos, entrega por código e inventario)
  //   admin: cocina + productos + combos + empleados
  function seccionesPorRol() {
    const s = [['inicio', RUTAS.inicio, 'Inicio']];
    if (!sesion.esPersonal()) s.push(['menu', RUTAS.menu, 'Menú']);
    if (sesion.esEstudiante()) s.push(['pedidos', RUTAS.pedidos, 'Mis pedidos']);
    if (sesion.esPersonal()) s.push(['cocina', RUTAS.cocina, 'Cocina']);
    if (sesion.esAdmin()) {
      s.push(['productos', RUTAS.productos, 'Productos']);
      s.push(['combos', RUTAS.combos, 'Combos']);
      s.push(['empleados', RUTAS.empleados, 'Personal']);
      s.push(['reportes', RUTAS.reportes, 'Reportes']);
    }
    return s;
  }

  function enlacesNav(pagina) {
    return seccionesPorRol().map(([clave, href, texto]) =>
      `<a href="${href}" class="${clave === pagina ? 'activo' : ''}">${texto}</a>`).join('');
  }

  // Solo estudiantes y docentes hacen pedidos (la ruta POST /pedidos es role:estudiante).
  function puedePedir() {
    return !sesion.esPersonal();
  }

  // En pantallas anchas el pedido se ve fijo al costado del menú.
  const esEscritorio = () => window.matchMedia('(min-width: 1100px)').matches;

  function pintarLayout(opciones) {
    const pagina = opciones.pagina || '';
    const usuario = sesion.usuario();

    const cuenta = usuario
      ? `<span class="topbar-usuario"><span class="topbar-nombre">${esc(String(usuario.nombre).split(' ')[0])}</span>
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
      const secciones = seccionesPorRol().map(([, h, t]) => [h, t]);
      const externo = 'target="_blank" rel="noopener"';
      pie.className = 'pie';
      pie.innerHTML = `
        <div class="pie-grid">
          <div class="pie-col pie-marca">
            <span class="pie-logo">Cafetería</span>
            <p>Pide antes de llegar, recibe tu código y recoge sin hacer fila en el receso.</p>
            <a class="pie-siu" href="${CFG.UNIVALLE_URL}" ${externo}>${icono('entrar')} Ir al portal Univalle (SIU)</a>
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
              : `<a href="${RUTAS.ingresar}">Ingresar</a>
                 <span class="pie-nota">Usa la cuenta que te dio la universidad.</span>`}
          </div>
          <div class="pie-col">
            <h4>Ayuda</h4>
            <a href="${RUTAS.politicas}#como-funciona">Cómo hacer un pedido</a>
            <a href="${RUTAS.politicas}#pedidos">Recojo y cancelaciones</a>
            <a href="${RUTAS.politicas}#terminos">Términos de uso</a>
            <a href="${RUTAS.politicas}#privacidad">Política de privacidad</a>
          </div>
          <div class="pie-col">
            <h4>Universidad</h4>
            <a href="${CFG.UNIVALLE_URL}" ${externo}>Universidad Privada del Valle</a>
            <span>La Paz, Bolivia</span>
          </div>
        </div>
        <p class="pie-copy">© ${new Date().getFullYear()} Cafetería Universitaria · Univalle La Paz</p>`;
    }

    actualizarContadorCarrito();
    vigilarInactividad();
  }

  // ---------- cerrar sesión ----------
  // Se revoca el token en el servidor (POST /logout) y se borra en el navegador.
  async function cerrarSesion(motivo) {
    // La petición toma el token al salir; la sesión local se borra en el acto,
    // así nadie queda dentro aunque se cambie de página antes de la respuesta.
    const revocar = sesion.token() ? api.salir() : Promise.resolve();
    sesion.cerrar();
    almacen.borrar(CLAVE_ACTIVIDAD);
    try { await revocar; } catch (e) { /* si el token ya no vale, igual se cierra aquí */ }
    window.location.href = RUTAS.ingresar + (motivo === 'inactividad' ? '?inactivo=1' : '?salio=1');
  }

  // Acciones comunes de la barra (delegadas).
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const accion = b.dataset.accion;
    if (accion === 'salir') {
      e.preventDefault();
      b.disabled = true;
      cerrarSesion('salir');
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

  // ---------- cierre por inactividad ----------
  // El backend no vence los tokens, así que el navegador cierra la sesión si
  // nadie usa la página durante INACTIVIDAD_MIN (la última actividad se
  // comparte entre pestañas). Que la página se actualice sola no cuenta.
  const CLAVE_ACTIVIDAD = 'cafeteria6.actividad';
  let vigilando = false;

  function limiteInactividad() {
    const min = (CFG.INACTIVIDAD_MIN || {})[sesion.rol()];
    return min ? min * 60000 : 0;
  }

  function vigilarInactividad() {
    if (vigilando || !sesion.token() || !limiteInactividad()) return;
    vigilando = true;
    const ultima = almacen.leer(CLAVE_ACTIVIDAD, null);
    if (ultima && Date.now() - ultima > limiteInactividad()) { cerrarSesion('inactividad'); return; }
    almacen.guardar(CLAVE_ACTIVIDAD, Date.now());

    let anotada = Date.now();
    const anotar = () => {
      if (Date.now() - anotada < 15000) return;
      anotada = Date.now();
      almacen.guardar(CLAVE_ACTIVIDAD, anotada);
    };
    ['click', 'keydown', 'scroll', 'touchstart', 'mousemove'].forEach((ev) =>
      window.addEventListener(ev, anotar, { passive: true }));
    setInterval(() => {
      const u = almacen.leer(CLAVE_ACTIVIDAD, Date.now());
      if (sesion.token() && Date.now() - u > limiteInactividad()) cerrarSesion('inactividad');
    }, 30000);
  }

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
  // A un costado lleva una foto de granos con el ícono de la acción
  // (en celular se vuelve una franja arriba). tono: 'peligro' | 'exito'.
  function modal(html, { clase = '', icono: nombreIcono = 'taza', tono = '', decor = true } = {}) {
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML = decor
      ? `<div class="modal con-decor ${clase}" role="dialog" aria-modal="true">
      <div class="modal-decor ${tono}" aria-hidden="true">
        <span class="modal-decor-icono">${icono(nombreIcono)}</span>
        <span class="modal-decor-marca">cafetería</span>
      </div>
      <div class="modal-cuerpo">
        <button type="button" class="modal-cerrar" aria-label="Cerrar">${ICONOS.cerrar}</button>${html}
      </div></div>`
      : `<div class="modal ${clase}" role="alertdialog" aria-modal="true">${html}</div>`;
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
    const enfocable = fondo.querySelector('[autofocus], .modal input, .modal button:not(.modal-cerrar)');
    if (enfocable) setTimeout(() => enfocable.focus(), 50);
    return { elemento: fondo, cerrar };
  }

  function confirmar(titulo, texto, { aceptar = 'Aceptar', cancelar = 'Volver', peligro = false, icono: nombreIcono } = {}) {
    return new Promise((resolver) => {
      let respuesta = false;
      const m = modal(`
        <h2 class="modal-titulo">${esc(titulo)}</h2>
        <p class="modal-texto">${esc(texto)}</p>
        <div class="modal-botones">
          <button type="button" class="btn btn-contorno" data-cerrar>${esc(cancelar)}</button>
          <button type="button" class="btn ${peligro ? 'btn-peligro' : 'btn-oscuro'}" data-si>${esc(aceptar)}</button>
        </div>`, { clase: 'modal-chico', icono: nombreIcono || (peligro ? 'alerta' : 'pregunta'), tono: peligro ? 'peligro' : '' });
      m.elemento.querySelector('[data-si]').addEventListener('click', () => { respuesta = true; m.cerrar(); });
      m.elemento.addEventListener('cerrado', () => resolver(respuesta));
    });
  }

  // Aviso corto antes de eliminar algo: una línea y dos botones.
  function confirmarEliminar(titulo, texto = '', { aceptar = 'Eliminar' } = {}) {
    return new Promise((resolver) => {
      let respuesta = false;
      const m = modal(`
        <div class="alerta-eliminar">
          <span class="alerta-eliminar-icono">${icono('alerta')}</span>
          <div>
            <h2 class="alerta-eliminar-titulo">${esc(titulo)}</h2>
            ${texto ? `<p>${esc(texto)}</p>` : ''}
          </div>
        </div>
        <div class="alerta-eliminar-botones">
          <button type="button" class="btn btn-sm btn-contorno" data-cerrar>Cancelar</button>
          <button type="button" class="btn btn-sm btn-peligro" data-si>${esc(aceptar)}</button>
        </div>`, { clase: 'modal-alerta', decor: false });
      m.elemento.querySelector('[data-si]').addEventListener('click', () => { respuesta = true; m.cerrar(); });
      m.elemento.addEventListener('cerrado', () => resolver(respuesta));
    });
  }

  // ---------- desplegable con buscador ----------
  // Para listas largas (por ejemplo, muchas categorías): se abre bajo el botón,
  // con un buscador arriba. opciones: [{ id, nombre, icono (html), detalle }].
  let desplegableAbierto = null;

  function cerrarDesplegable() {
    if (!desplegableAbierto) return;
    desplegableAbierto.caja.remove();
    document.removeEventListener('mousedown', desplegableAbierto.fuera, true);
    document.removeEventListener('keydown', desplegableAbierto.teclas);
    window.removeEventListener('resize', cerrarDesplegable);
    desplegableAbierto.boton.setAttribute('aria-expanded', 'false');
    desplegableAbierto = null;
  }

  function desplegable(boton, opciones, { titulo = 'Más categorías', elegida = null, alElegir } = {}) {
    const mismo = desplegableAbierto && desplegableAbierto.boton === boton;
    cerrarDesplegable();
    if (mismo) return;   // segundo clic en el mismo botón: se cierra

    const normalizar = window.Cafeteria.iconos.normalizar;
    const caja = document.createElement('div');
    caja.className = 'desplegable';
    caja.innerHTML = `<p class="desplegable-titulo">${esc(titulo)}</p>
      <input type="search" class="desplegable-buscar" placeholder="Buscar…" aria-label="Buscar en ${esc(titulo)}">
      <div class="desplegable-lista"></div>`;
    document.body.appendChild(caja);
    const lista = caja.querySelector('.desplegable-lista');
    const buscar = caja.querySelector('input');

    function pintar() {
      const t = normalizar(buscar.value.trim());
      const vistas = opciones.filter((o) => !t || normalizar(o.nombre).includes(t));
      lista.innerHTML = vistas.length ? vistas.map((o) => `
        <button type="button" class="desplegable-op ${o.id === elegida ? 'activo' : ''}" data-op="${esc(o.id)}">
          <span class="desplegable-icono">${o.icono || ''}</span>
          <span class="desplegable-texto"><strong>${esc(o.nombre)}</strong>${o.detalle ? `<small>${esc(o.detalle)}</small>` : ''}</span>
        </button>`).join('') : '<p class="desplegable-vacio">No hay coincidencias.</p>';
    }
    pintar();
    buscar.addEventListener('input', pintar);
    lista.addEventListener('click', (e) => {
      const op = e.target.closest('[data-op]');
      if (!op) return;
      cerrarDesplegable();
      alElegir(op.dataset.op);
    });

    // Bajo el botón, sin salirse de la pantalla.
    const r = boton.getBoundingClientRect();
    const ancho = Math.min(340, window.innerWidth - 24);
    caja.style.width = ancho + 'px';
    caja.style.left = Math.max(12, Math.min(r.left, window.innerWidth - ancho - 12)) + window.scrollX + 'px';
    caja.style.top = r.bottom + window.scrollY + 8 + 'px';

    const fuera = (e) => { if (!caja.contains(e.target) && !boton.contains(e.target)) cerrarDesplegable(); };
    const teclas = (e) => { if (e.key === 'Escape') { cerrarDesplegable(); boton.focus(); } };
    document.addEventListener('mousedown', fuera, true);
    document.addEventListener('keydown', teclas);
    window.addEventListener('resize', cerrarDesplegable);
    boton.setAttribute('aria-expanded', 'true');
    desplegableAbierto = { caja, boton, fuera, teclas };
    setTimeout(() => buscar.focus({ preventScroll: true }), 30);
  }

  // ---------- protección de páginas ----------
  // roles: lista de roles permitidos ('admin', 'empleado', 'estudiante').
  // volver: clave de RUTAS a la que regresar después de ingresar.
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
  // item = { clave: 'p7' | 'c2', tipo: 'producto' | 'combo', id, nombre, precio,
  //          max, cantidad, categoria, detalle, imagen, notas }
  const CLAVE_CARRITO = 'cafeteria6.carrito';
  const carrito = {
    items() { return almacen.leer(CLAVE_CARRITO, []); },
    guardar(items) {
      almacen.guardar(CLAVE_CARRITO, items);
      actualizarContadorCarrito();
      document.dispatchEvent(new CustomEvent('carrito-cambio'));
    },
    agregar(p) {
      const items = this.items();
      const ex = items.find((i) => i.clave === p.clave);
      if (ex) {
        if (ex.cantidad >= p.max) return false;
        ex.cantidad += 1;
        Object.assign(ex, { max: p.max, precio: p.precio });
      } else {
        if (p.max < 1) return false;
        items.push({
          clave: p.clave, tipo: p.tipo, id: p.id, nombre: p.nombre, precio: p.precio, max: p.max,
          cantidad: 1, categoria: p.categoria || '', detalle: p.detalle || '', imagen: p.imagen || null,
          notas: p.notas || '',
        });
      }
      this.guardar(items);
      return true;
    },
    cambiar(clave, cantidad) {
      const items = this.items().map((i) => (i.clave === clave ? Object.assign(i, { cantidad }) : i))
        .filter((i) => i.cantidad > 0);
      this.guardar(items);
    },
    quitar(clave) { this.guardar(this.items().filter((i) => i.clave !== clave)); },
    // La nota se guarda sin repintar (para no perder lo que se está escribiendo).
    notar(clave, notas) {
      almacen.guardar(CLAVE_CARRITO, this.items().map((i) => (i.clave === clave ? Object.assign(i, { notas }) : i)));
    },
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

  // ---------- comprobante del pedido ----------
  // Se usa al confirmar desde el carrito y al "volver a pedir".
  function comprobante(r) {
    const p = r.pedido || {};
    const m = modal(`
      <div class="comprobante">
        <h2 class="modal-titulo" style="padding:0">¡Pedido confirmado!</h2>
        <p class="modal-texto" style="margin:0">Guarda tu código: lo necesitas para recoger tu pedido.</p>
        <div class="comprobante-datos">
          <div class="dato"><span>Pedido</span><strong>#${esc(p.id)}</strong></div>
          <div class="dato"><span>Total</span><strong>${bs(r.total)}</strong></div>
          <div class="dato codigo-entrega"><span>Código de recojo</span><strong>${esc(r.codigo)}</strong></div>
        </div>
        <div class="comprobante-qr" data-qr hidden></div>
        <div class="comprobante-estado" data-estado-vivo>${estadoEnVivo(p.estado || 'Recibido')}</div>
        <div class="modal-botones" style="justify-content:center">
          <button type="button" class="btn btn-contorno" data-cerrar>Seguir viendo el menú</button>
          <a class="btn btn-oscuro" href="${RUTAS.pedidos}">Ver mis pedidos</a>
        </div>
      </div>`, { icono: 'check', tono: 'exito' });
    // QR del código para mostrarlo en caja (si no carga, queda el código en texto).
    if (window.Cafeteria.qr) window.Cafeteria.qr.dibujar(m.elemento.querySelector('[data-qr]'), p.id, r.codigo);

    // Mientras el comprobante siga abierto, el estado se actualiza solo (sin recargar).
    const zona = m.elemento.querySelector('[data-estado-vivo]');
    let ultimo = p.estado || 'Recibido';
    const revisar = async () => {
      try {
        const actual = await api.pedido(p.id);
        if (actual.estado !== ultimo) {
          ultimo = actual.estado;
          zona.innerHTML = estadoEnVivo(ultimo);
          zona.classList.remove('cambio');
          void zona.offsetWidth;
          zona.classList.add('cambio');
          if (ultimo === 'Para entregar') aviso('¡Tu pedido está listo! Acércate a caja con tu código.', 'exito', 7000);
        }
      } catch (e) { /* se reintenta en la próxima vuelta */ }
    };
    const vigilar = setInterval(revisar, CFG.REFRESCO_CLIENTE_MS || 5000);
    m.elemento.addEventListener('cerrado', () => clearInterval(vigilar));
    return m;
  }

  // Estado del pedido en el comprobante: los 3 pasos y qué hacer ahora.
  function estadoEnVivo(estado) {
    const pasos = ['Recibido', 'En preparación', 'Para entregar'];
    const actual = estado === 'Completado' ? 3 : pasos.indexOf(estado);
    const textos = {
      Recibido: 'La cocina recibió tu pedido.',
      'En preparación': 'Están preparando tu pedido.',
      'Para entregar': '¡Listo! Acércate a caja y muestra tu código.',
      Completado: 'Pedido entregado. ¡Buen provecho!',
      Cancelado: 'Este pedido fue cancelado.',
    };
    const linea = estado === 'Cancelado' ? '' : `<ol class="mini-progreso">${pasos.map((e, i) =>
      `<li class="${i < actual ? 'hecho' : i === actual ? 'actual' : ''}">${esc(textoEstado(e))}</li>`).join('')}</ol>`;
    return `<p class="comprobante-estado-texto">Estado: ${badgeEstado(estado)} <span>${esc(textos[estado] || '')}</span></p>${linea}`;
  }

  // Qué llevaba un combo en el pedido: [{nombre, cantidad}] → "2 × Café americano + 1 × Brownie"
  function contenidoCombo(lista) {
    return (lista || []).map((x) => `${Number(x.cantidad) || 1} × ${esc(x.nombre)}`).join(' + ');
  }

  window.Cafeteria = Object.assign(window.Cafeteria, {
    ui: {
      esc, bs, hora, fechaHora, hace, fecha, ICONOS, icono, ESTADOS, textoEstado, badgeEstado, fotoProducto, fotoCombo,
      pintarLayout, aviso, modal, confirmar, confirmarEliminar, exigirSesion, puedePedir, esEscritorio, comprobante, cerrarSesion,
      desplegable, cerrarDesplegable, contenidoCombo,
    },
    carrito,
  });
})();
