// ============================================================
// Página principal: menú digital (HU-01) y búsqueda (HU-02).
// Los productos vienen de GET /api/menu (MenuController@index), que
// ya filtra estado = 'Disponible' e incluye sus categorías.
// La búsqueda usa GET /api/menu/buscar?q= (MenuController@buscar): por
// nombre, coincidencia parcial y sin distinguir mayúsculas. Si esa ruta
// falla, se filtra aquí mismo la lista ya cargada para no dejar al usuario sin buscar.
//
// Iteraciones 4 y 5:
//   HU-10  Estrella para marcar favoritos (POST /favoritos/{id}) y menú rápido
//          "Tus favoritos" (GET /mis-favoritos), solo para clientes con sesión.
//   HU-21  "Combos del día" destacados arriba (GET /combos) y precio de oferta.
//   HU-23  Aviso de cafetería cerrada según GET /horarios (se revisa cada minuto).
// ============================================================
(function () {
  const { api, arte, ui, carrito, sesion, horario } = window.Cafeteria;
  const { esc, bs, ICONOS } = ui;
  const RUTAS = window.CAFETERIA_CONFIG.RUTAS;

  ui.pintarLayout({ pagina: 'inicio', transparente: true, conCarrito: true, conBuscar: true });
  arte.asegurarDefs();

  // Arte fijo de la página.
  document.getElementById('hero-arte').innerHTML = arte.hero();
  document.getElementById('granos-izq').outerHTML = arte.banda(21).replace('<svg', '<svg class="banner-granos-izq"');
  document.getElementById('granos-der').outerHTML = arte.banda(33).replace('<svg', '<svg class="banner-granos-der"');
  document.getElementById('icono-flechas').innerHTML = ICONOS.flechas;

  const zonaMenu = document.getElementById('menu');
  const franja = document.getElementById('franja-categorias');
  const campo = document.getElementById('campo-busqueda');
  const limpiar = document.getElementById('limpiar-busqueda');
  const avisoHorario = document.getElementById('aviso-horario');

  const ESTRELLA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/></svg>';
  const usaFavoritos = sesion.esCliente();

  let productos = [];          // lista normalizada
  let combos = [];             // HU-21
  let favoritos = new Set();   // HU-10: ids de producto
  let categorias = [];         // [{id, nombre, productos: []}]
  let filtroCategoria = null;  // id de categoría elegida en la franja, 'fav' o 'combos'
  let idsBusqueda = null;      // Set de ids que devolvió /menu/buscar, o 'local' si falló
  let busquedaVigente = 0;

  // ---------- datos ----------
  function normalizarProductos(lista) {
    return lista.map((p) => {
      const cats = (p.categorias && p.categorias.length) ? p.categorias : [{ id_categoria: 0, nombre: 'Otros' }];
      const normal = Number(p.precio);
      const oferta = p.precio_oferta != null ? Number(p.precio_oferta) : null;
      const enOferta = oferta !== null && oferta > 0 && oferta < normal;
      return {
        id_producto: p.id_producto,
        nombre: p.nombre,
        descripcion: p.descripcion || '',
        precio: enOferta ? oferta : normal,       // lo que se cobra hoy
        precio_normal: normal,
        oferta: enOferta,
        stock: Number(p.stock_actual) || 0,
        estado: p.estado,
        categorias: cats.map((c) => ({ id: c.id_categoria, nombre: c.nombre })),
        texto: arte.normalizar(p.nombre + ' ' + (p.descripcion || '') + ' ' + cats.map((c) => c.nombre).join(' ')),
      };
    });
  }

  function normalizarCombos(lista) {
    return lista.map((c) => ({
      id_producto: -c.id_combo,      // así vive en el carrito (ver ui.js)
      id_combo: c.id_combo,
      es_combo: true,
      nombre: c.nombre,
      descripcion: c.descripcion || '',
      precio: Number(c.precio),
      precio_normal: Number(c.precio_normal),
      ahorro: Number(c.ahorro),
      disponible: Boolean(c.disponible),
      stock: c.disponible ? Number(c.max_unidades) || 0 : 0,
      no_disponibles: c.no_disponibles || [],
      productos: c.productos || [],
      detalle: (c.productos || []).map((p) => p.cantidad + ' × ' + p.nombre).join(' + '),
      texto: arte.normalizar(c.nombre + ' ' + (c.descripcion || '') + ' combo ' + (c.productos || []).map((p) => p.nombre).join(' ')),
    }));
  }

  function agruparPorCategoria(lista) {
    const mapa = new Map();
    lista.forEach((p) => {
      p.categorias.forEach((c) => {
        if (!mapa.has(c.id)) mapa.set(c.id, { id: c.id, nombre: c.nombre, productos: [] });
        mapa.get(c.id).productos.push(p);
      });
    });
    return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  async function cargar() {
    try {
      const [lista, listaCombos, favs] = await Promise.all([
        api.menu(),
        api.combos().catch(() => []),
        usaFavoritos ? api.favoritos().catch(() => []) : Promise.resolve([]),
      ]);
      productos = normalizarProductos(lista);
      combos = normalizarCombos(listaCombos);
      favoritos = new Set(favs.map((f) => Number(f.id_producto)));
      categorias = agruparPorCategoria(productos);
      sincronizarCarrito();
      pintarFranja();
      pintarMenu();
    } catch (e) {
      franja.innerHTML = '';
      zonaMenu.innerHTML = `<p class="estado-vacio"><strong>No pudimos cargar el menú</strong>${esc(e.message)}<br><br>
        <button type="button" class="btn btn-oscuro" id="reintentar">Reintentar</button></p>`;
      document.getElementById('reintentar').addEventListener('click', cargar);
    }
  }

  // Si cambió el precio o el stock desde que se armó el carrito, se ajusta.
  function sincronizarCarrito() {
    const porId = new Map(productos.concat(combos).map((p) => [p.id_producto, p]));
    const items = carrito.items();
    let cambio = false;
    const nuevos = items.filter((i) => {
      const p = porId.get(i.id_producto);
      if (!p || p.stock < 1) { cambio = true; return false; }
      if (i.precio !== p.precio || i.stock !== p.stock || i.cantidad > p.stock) {
        i.precio = p.precio;
        i.stock = p.stock;
        i.cantidad = Math.min(i.cantidad, p.stock);
        cambio = true;
      }
      return true;
    });
    if (cambio) {
      carrito.guardar(nuevos);
      if (nuevos.length < items.length) ui.aviso('Quitamos de tu pedido productos que ya no están disponibles.', 'info');
    }
  }

  // ---------- HU-23: aviso de cafetería cerrada ----------
  function pintarHorario() {
    const e = horario.estado;
    if (!avisoHorario) return;
    if (!e || e.abierto) {
      avisoHorario.hidden = true;
      return;
    }
    avisoHorario.hidden = false;
    avisoHorario.innerHTML = `<strong>🕒 ${esc(e.mensaje || 'La cafetería está cerrada.')}</strong>
      <span>Puedes mirar el menú y armar tu pedido; lo confirmas cuando abramos.</span>`;
  }
  document.addEventListener('horario-cambio', pintarHorario);

  // ---------- pintado ----------
  function pintarFranja() {
    const especiales = [];
    if (combos.length) especiales.push({ id: 'combos', nombre: 'Combos del día', icono: '🎁', n: combos.length });
    if (usaFavoritos && favoritosVisibles().length) especiales.push({ id: 'fav', nombre: 'Tus favoritos', icono: '★', n: favoritosVisibles().length });
    if (!categorias.length && !especiales.length) { franja.innerHTML = ''; return; }
    const item = (id, icono, nombre, n) => `
      <button type="button" class="franja-item ${filtroCategoria === id ? 'activo' : ''}" data-categoria="${id}" aria-pressed="${filtroCategoria === id}">
        ${icono}
        <span>${esc(nombre)}</span>
        <span class="franja-cantidad">${n} ${n === 1 ? 'opción' : 'opciones'}</span>
      </button>`;
    franja.innerHTML = especiales.map((e) => item(e.id, `<span class="franja-especial" aria-hidden="true">${e.icono}</span>`, e.nombre, e.n)).join('')
      + categorias.map((c) => item(c.id, arte.iconoCategoria(c.nombre), c.nombre, c.productos.length)).join('');
  }

  function favoritosVisibles() {
    return productos.filter((p) => favoritos.has(p.id_producto));
  }

  function botonFavorito(p) {
    if (!usaFavoritos && sesion.token()) return '';   // el personal no usa favoritos
    const marcado = favoritos.has(p.id_producto);
    return `<button type="button" class="btn-favorito ${marcado ? 'marcado' : ''}" data-favorito="${p.id_producto}"
      aria-pressed="${marcado}" aria-label="${marcado ? 'Quitar de favoritos' : 'Marcar como favorito'}: ${esc(p.nombre)}"
      title="${marcado ? 'Quitar de favoritos' : 'Marcar como favorito'}">${ESTRELLA}</button>`;
  }

  function precio(p) {
    return p.precio_normal > p.precio
      ? `<span class="producto-precio"><s class="precio-antes">${bs(p.precio_normal)}</s> ${bs(p.precio)}</span>`
      : `<span class="producto-precio">${bs(p.precio)}</span>`;
  }

  function tarjeta(p, categoria, indice) {
    const enCarrito = (carrito.items().find((i) => i.id_producto === p.id_producto) || {}).cantidad || 0;
    const agotado = p.stock < 1;
    let etiqueta = '';
    if (agotado) etiqueta = '<span class="etiqueta-stock agotado">Agotado</span>';
    else if (p.oferta) etiqueta = '<span class="etiqueta-stock oferta">Oferta</span>';
    else if (p.stock <= 5) etiqueta = `<span class="etiqueta-stock poco">¡Quedan ${p.stock}!</span>`;
    else etiqueta = '<span class="etiqueta-stock">Disponible</span>';

    const lleno = enCarrito >= p.stock;
    const boton = agotado
      ? '<button type="button" class="btn btn-sm btn-contorno" disabled>Agotado</button>'
      : `<button type="button" class="btn btn-sm btn-oscuro" data-agregar="${p.id_producto}" data-categoria="${esc(categoria)}" ${lleno ? 'disabled' : ''}>
           ${lleno ? 'Máximo' : 'Agregar'}</button>`;

    return `
      <article class="producto-card ${agotado ? 'agotado' : ''}">
        <div class="producto-img tono-${(p.id_producto + indice) % 4}">
          ${arte.producto(p.nombre, categoria)}
          ${etiqueta}
          ${enCarrito ? `<span class="en-carrito" title="En tu pedido">${enCarrito}</span>` : ''}
          ${botonFavorito(p)}
        </div>
        <h3 class="producto-nombre">${esc(p.nombre)}</h3>
        <p class="producto-descripcion">${p.descripcion ? esc(p.descripcion) : '&nbsp;'}</p>
        <div class="producto-pie">
          ${precio(p)}
          ${boton}
        </div>
      </article>`;
  }

  // HU-21: tarjeta destacada de combo
  function tarjetaCombo(c, indice) {
    const enCarrito = (carrito.items().find((i) => i.id_producto === c.id_producto) || {}).cantidad || 0;
    const lleno = enCarrito >= c.stock;
    const boton = !c.disponible
      ? '<button type="button" class="btn btn-sm btn-contorno" disabled>No disponible</button>'
      : `<button type="button" class="btn btn-sm btn-claro" data-agregar="${c.id_producto}" data-categoria="Combos" ${lleno ? 'disabled' : ''}>${lleno ? 'Máximo' : 'Agregar combo'}</button>`;
    return `
      <article class="combo-card ${c.disponible ? '' : 'agotado'}">
        <div class="combo-arte tono-${indice % 4}">
          ${c.productos.slice(0, 3).map((p) => `<span class="combo-arte-item">${arte.producto(p.nombre, '')}</span>`).join('')}
          ${enCarrito ? `<span class="en-carrito" title="En tu pedido">${enCarrito}</span>` : ''}
        </div>
        <div class="combo-cuerpo">
          <span class="combo-etiqueta">Combo del día${c.ahorro > 0 ? ` · ahorras ${bs(c.ahorro)}` : ''}</span>
          <h3 class="combo-nombre">${esc(c.nombre)}</h3>
          <p class="combo-detalle">${esc(c.detalle)}</p>
          ${c.descripcion ? `<p class="combo-descripcion">${esc(c.descripcion)}</p>` : ''}
          ${!c.disponible ? `<p class="combo-falta">Hoy no se puede pedir: ${esc(c.no_disponibles.join(', '))}</p>` : ''}
          <div class="producto-pie">
            <span class="producto-precio combo-precio"><s class="precio-antes">${bs(c.precio_normal)}</s> ${bs(c.precio)}</span>
            ${boton}
          </div>
        </div>
      </article>`;
  }

  function carruselSeccion(id, titulo, contenido, clase = '') {
    return `
      <section class="menu-categoria ${clase}" id="cat-${id}" aria-labelledby="titulo-cat-${id}">
        <h2 class="titulo-seccion" id="titulo-cat-${id}">${titulo}</h2>
        <div class="carrusel">
          <button type="button" class="flecha flecha-izq" data-dir="-1" aria-label="Ver anteriores">${ICONOS.izq}</button>
          <div class="carrusel-pista">${contenido}</div>
          <button type="button" class="flecha flecha-der" data-dir="1" aria-label="Ver siguientes">${ICONOS.der}</button>
        </div>
      </section>`;
  }

  function pintarMenu() {
    const texto = campo.value.trim();
    const termino = arte.normalizar(texto);
    limpiar.hidden = !campo.value;
    const coincide = (p) => !texto
      || (idsBusqueda instanceof Set ? idsBusqueda.has(p.id_producto) : p.texto.includes(termino));
    const coincideCombo = (c) => !texto || c.texto.includes(termino);

    if (!productos.length && !combos.length) {
      zonaMenu.innerHTML = '<p class="estado-vacio"><strong>Todavía no hay productos disponibles</strong>Vuelve más tarde; el menú se actualiza cuando la cafetería carga lo del día.</p>';
      return;
    }

    const soloEspecial = filtroCategoria === 'fav' || filtroCategoria === 'combos';
    let grupos = soloEspecial ? [] : categorias
      .filter((c) => filtroCategoria === null || c.id === filtroCategoria)
      .map((c) => ({ ...c, productos: c.productos.filter(coincide) }))
      .filter((c) => c.productos.length);

    const combosVisibles = (filtroCategoria === null || filtroCategoria === 'combos') ? combos.filter(coincideCombo) : [];
    const favs = (filtroCategoria === null || filtroCategoria === 'fav') && usaFavoritos ? favoritosVisibles().filter(coincide) : [];

    const total = grupos.reduce((s, g) => s + g.productos.length, 0) + combosVisibles.length;
    if (!total && !favs.length) {
      zonaMenu.innerHTML = filtroCategoria === 'fav'
        ? '<p class="estado-vacio"><strong>Aún no tienes favoritos</strong>Toca la estrella ☆ de un producto para guardarlo aquí.</p>'
        : `<p class="estado-vacio"><strong>Sin resultados</strong>
        No encontramos productos que coincidan con “${esc(campo.value.trim())}”${filtroCategoria !== null ? ' en esta categoría' : ''}.</p>`;
      return;
    }

    const aviso = termino
      ? `<p class="subtitulo-seccion" style="margin-top:0">${total} resultado(s) para “${esc(campo.value.trim())}”</p>`
      : '';

    // Conservar la posición de cada carrusel al repintar (p. ej. al agregar al carrito).
    const posiciones = {};
    zonaMenu.querySelectorAll('.menu-categoria[id]').forEach((s) => {
      const pista = s.querySelector('.carrusel-pista');
      if (pista) posiciones[s.id] = pista.scrollLeft;
    });

    let html = aviso;
    if (combosVisibles.length) {
      html += carruselSeccion('combos', 'Combos del día', combosVisibles.map(tarjetaCombo).join(''), 'seccion-combos');
    }
    if (favs.length) {
      html += carruselSeccion('fav', '★ Tus favoritos', favs.map((p, i) => tarjeta(p, p.categorias[0].nombre, i)).join(''), 'seccion-favoritos');
    }
    html += grupos.map((c, gi) => carruselSeccion(c.id, esc(c.nombre), c.productos.map((p) => tarjeta(p, c.nombre, gi)).join(''))).join('');
    zonaMenu.innerHTML = html;

    Object.entries(posiciones).forEach(([id, x]) => {
      const pista = document.querySelector('#' + id + ' .carrusel-pista');
      if (pista) pista.scrollLeft = x;
    });
    actualizarFlechas();
  }

  // ---------- carruseles ----------
  function actualizarFlechas() {
    zonaMenu.querySelectorAll('.carrusel').forEach((c) => {
      const pista = c.querySelector('.carrusel-pista');
      c.classList.toggle('sin-desborde', pista.scrollWidth <= pista.clientWidth + 2);
    });
  }
  window.addEventListener('resize', actualizarFlechas);

  // ---------- HU-10: favoritos ----------
  async function alternarFavorito(boton) {
    const id = Number(boton.dataset.favorito);
    if (!sesion.token()) {
      ui.aviso('Ingresa con tu cuenta para guardar favoritos.', 'info', 4500);
      setTimeout(() => { window.location.href = RUTAS.ingresar + '?volver=menu'; }, 1200);
      return;
    }
    boton.disabled = true;
    try {
      const r = await api.alternarFavorito(id);
      if (r.favorito) favoritos.add(id); else favoritos.delete(id);
      const p = productos.find((x) => x.id_producto === id);
      ui.aviso(r.favorito ? `★ ${p ? p.nombre : 'Producto'} está en tus favoritos.` : `${p ? p.nombre : 'Producto'} ya no está en tus favoritos.`, 'exito', 2500);
      if (filtroCategoria === 'fav' && !favoritosVisibles().length) filtroCategoria = null;
      pintarFranja();
      pintarMenu();
    } catch (e) {
      boton.disabled = false;
      ui.aviso(e.message, 'error');
    }
  }

  // ---------- eventos ----------
  zonaMenu.addEventListener('click', (e) => {
    const flecha = e.target.closest('.flecha');
    if (flecha) {
      const pista = flecha.closest('.carrusel').querySelector('.carrusel-pista');
      pista.scrollBy({ left: Math.max(pista.clientWidth * 0.8, 240) * Number(flecha.dataset.dir), behavior: 'smooth' });
      return;
    }
    const fav = e.target.closest('[data-favorito]');
    if (fav) { alternarFavorito(fav); return; }
    const agregar = e.target.closest('[data-agregar]');
    if (agregar) {
      const id = Number(agregar.dataset.agregar);
      const p = productos.concat(combos).find((x) => x.id_producto === id);
      if (!p) return;
      if (carrito.agregar({ ...p, categoria: agregar.dataset.categoria })) {
        // En escritorio el pedido está a la vista al costado; en celular se avisa.
        if (!ui.esEscritorio()) ui.aviso(`Agregaste ${p.nombre} a tu pedido.`, 'exito', 2200);
      } else {
        ui.aviso(`Solo hay ${p.stock} unidad(es) de ${p.nombre}.`, 'error');
      }
    }
  });

  franja.addEventListener('click', (e) => {
    const b = e.target.closest('[data-categoria]');
    if (!b) return;
    const valor = b.dataset.categoria;
    const id = (valor === 'fav' || valor === 'combos') ? valor : Number(valor);
    filtroCategoria = filtroCategoria === id ? null : id;
    pintarFranja();
    pintarMenu();
    zonaMenu.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // HU-02: búsqueda en el servidor mientras se escribe (con una pequeña pausa).
  async function buscar() {
    const q = campo.value.trim();
    limpiar.hidden = !campo.value;
    if (!q) { idsBusqueda = null; pintarMenu(); return; }
    const vigente = ++busquedaVigente;
    try {
      const resultado = await api.buscar(q);
      if (vigente !== busquedaVigente) return;   // llegó una búsqueda más nueva
      idsBusqueda = new Set(resultado.map((p) => p.id_producto));
    } catch (e) {
      if (vigente !== busquedaVigente) return;
      idsBusqueda = 'local';
    }
    pintarMenu();
  }

  let temporizador = null;
  campo.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(buscar, 300);
  });
  document.getElementById('form-buscador').addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(temporizador);
    buscar();
    zonaMenu.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  limpiar.addEventListener('click', () => { campo.value = ''; buscar(); campo.focus(); });

  // Al cambiar el carrito se repintan contadores y botones de las tarjetas.
  document.addEventListener('carrito-cambio', () => { if (productos.length || combos.length) pintarMenu(); });
  // Tras confirmar un pedido (o si el servidor avisó falta de stock) se recarga el menú.
  document.addEventListener('menu-recargar', cargar);

  if (location.hash === '#buscar') setTimeout(() => campo.focus(), 300);

  horario.vigilar();
  cargar();
})();
