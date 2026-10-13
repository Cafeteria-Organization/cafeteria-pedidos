// ============================================================
// Página principal: menú digital (HU-01) y búsqueda (HU-02).
// Los productos vienen de GET /api/menu (MenuController@index), que
// ya filtra estado = 'Disponible' e incluye sus categorías.
// La búsqueda usa GET /api/menu/buscar?q= (MenuController@buscar): por
// nombre, coincidencia parcial y sin distinguir mayúsculas. Si esa ruta
// falla, se filtra aquí mismo la lista ya cargada para no dejar al usuario sin buscar.
// ============================================================
(function () {
  const { api, arte, ui, carrito } = window.Cafeteria;
  const { esc, bs, ICONOS } = ui;

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

  let productos = [];          // lista normalizada
  let categorias = [];         // [{id, nombre, productos: []}]
  let filtroCategoria = null;  // id de categoría elegida en la franja
  let idsBusqueda = null;      // Set de ids que devolvió /menu/buscar, o 'local' si falló
  let busquedaVigente = 0;

  // ---------- datos ----------
  function normalizarProductos(lista) {
    return lista.map((p) => {
      const cats = (p.categorias && p.categorias.length) ? p.categorias : [{ id_categoria: 0, nombre: 'Otros' }];
      return {
        id_producto: p.id_producto,
        nombre: p.nombre,
        descripcion: p.descripcion || '',
        precio: Number(p.precio),
        stock: Number(p.stock_actual) || 0,
        estado: p.estado,
        categorias: cats.map((c) => ({ id: c.id_categoria, nombre: c.nombre })),
        texto: arte.normalizar(p.nombre + ' ' + (p.descripcion || '') + ' ' + cats.map((c) => c.nombre).join(' ')),
      };
    });
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
      productos = normalizarProductos(await api.menu());
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
    const porId = new Map(productos.map((p) => [p.id_producto, p]));
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

  // ---------- pintado ----------
  function pintarFranja() {
    if (!categorias.length) { franja.innerHTML = ''; return; }
    franja.innerHTML = categorias.map((c) => `
      <button type="button" class="franja-item ${filtroCategoria === c.id ? 'activo' : ''}" data-categoria="${c.id}" aria-pressed="${filtroCategoria === c.id}">
        ${arte.iconoCategoria(c.nombre)}
        <span>${esc(c.nombre)}</span>
        <span class="franja-cantidad">${c.productos.length} ${c.productos.length === 1 ? 'producto' : 'productos'}</span>
      </button>`).join('');
  }

  function tarjeta(p, categoria, indice) {
    const enCarrito = (carrito.items().find((i) => i.id_producto === p.id_producto) || {}).cantidad || 0;
    const agotado = p.stock < 1;
    let etiqueta = '';
    if (agotado) etiqueta = '<span class="etiqueta-stock agotado">Agotado</span>';
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
        </div>
        <h3 class="producto-nombre">${esc(p.nombre)}</h3>
        <p class="producto-descripcion">${p.descripcion ? esc(p.descripcion) : '&nbsp;'}</p>
        <div class="producto-pie">
          <span class="producto-precio">${bs(p.precio)}</span>
          ${boton}
        </div>
      </article>`;
  }

  function pintarMenu() {
    const texto = campo.value.trim();
    const termino = arte.normalizar(texto);
    limpiar.hidden = !campo.value;
    const coincide = (p) => !texto
      || (idsBusqueda instanceof Set ? idsBusqueda.has(p.id_producto) : p.texto.includes(termino));

    if (!productos.length) {
      zonaMenu.innerHTML = '<p class="estado-vacio"><strong>Todavía no hay productos disponibles</strong>Vuelve más tarde; el menú se actualiza cuando la cafetería carga lo del día.</p>';
      return;
    }

    let grupos = categorias
      .filter((c) => filtroCategoria === null || c.id === filtroCategoria)
      .map((c) => ({ ...c, productos: c.productos.filter(coincide) }))
      .filter((c) => c.productos.length);

    if (!grupos.length) {
      zonaMenu.innerHTML = `<p class="estado-vacio"><strong>Sin resultados</strong>
        No encontramos productos que coincidan con “${esc(campo.value.trim())}”${filtroCategoria !== null ? ' en esta categoría' : ''}.</p>`;
      return;
    }

    const aviso = termino
      ? `<p class="subtitulo-seccion" style="margin-top:0">${grupos.reduce((s, g) => s + g.productos.length, 0)} resultado(s) para “${esc(campo.value.trim())}”</p>`
      : '';

    // Conservar la posición de cada carrusel al repintar (p. ej. al agregar al carrito).
    const posiciones = {};
    zonaMenu.querySelectorAll('.menu-categoria[id]').forEach((s) => {
      const pista = s.querySelector('.carrusel-pista');
      if (pista) posiciones[s.id] = pista.scrollLeft;
    });

    zonaMenu.innerHTML = aviso + grupos.map((c, gi) => `
      <section class="menu-categoria" id="cat-${c.id}" aria-labelledby="titulo-cat-${c.id}">
        <h2 class="titulo-seccion" id="titulo-cat-${c.id}">${esc(c.nombre)}</h2>
        <div class="carrusel">
          <button type="button" class="flecha flecha-izq" data-dir="-1" aria-label="Ver anteriores">${ICONOS.izq}</button>
          <div class="carrusel-pista">${c.productos.map((p) => tarjeta(p, c.nombre, gi)).join('')}</div>
          <button type="button" class="flecha flecha-der" data-dir="1" aria-label="Ver siguientes">${ICONOS.der}</button>
        </div>
      </section>`).join('');

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

  // ---------- eventos ----------
  zonaMenu.addEventListener('click', (e) => {
    const flecha = e.target.closest('.flecha');
    if (flecha) {
      const pista = flecha.closest('.carrusel').querySelector('.carrusel-pista');
      pista.scrollBy({ left: Math.max(pista.clientWidth * 0.8, 240) * Number(flecha.dataset.dir), behavior: 'smooth' });
      return;
    }
    const agregar = e.target.closest('[data-agregar]');
    if (agregar) {
      const p = productos.find((x) => x.id_producto === Number(agregar.dataset.agregar));
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
    const id = Number(b.dataset.categoria);
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
  document.addEventListener('carrito-cambio', () => { if (productos.length) pintarMenu(); });
  // Tras confirmar un pedido (o si el servidor avisó falta de stock) se recarga el menú.
  document.addEventListener('menu-recargar', cargar);

  if (location.hash === '#buscar') setTimeout(() => campo.focus(), 300);

  cargar();
})();
