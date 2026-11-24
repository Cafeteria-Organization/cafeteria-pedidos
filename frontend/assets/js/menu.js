// ============================================================
// Página principal: menú digital y búsqueda + combos del día.
//   GET /api/menu            productos disponibles (nombre, descripción, categoría,
//                            precio, stock, foto). Con ?buscar= el servidor filtra
//                            por nombre (coincidencia parcial, sin distinguir mayúsculas).
//   GET /api/combos          combos activos con su precio especial, el precio normal,
//                            el ahorro y si hoy se pueden pedir (stock de sus productos).
// Si la búsqueda en el servidor falla, se filtra la lista ya cargada para no
// dejar al usuario sin buscar.
// ============================================================
(function () {
  const { api, iconos, ui, carrito } = window.Cafeteria;
  const { esc, bs, ICONOS } = ui;
  const CFG = window.CAFETERIA_CONFIG;
  const COMBOS = '__combos';

  ui.pintarLayout({ pagina: 'inicio', transparente: true, conCarrito: true, conBuscar: true });
  document.getElementById('icono-flechas').innerHTML = ICONOS.flechas;

  const zonaMenu = document.getElementById('menu');
  const franja = document.getElementById('franja-categorias');
  const campo = document.getElementById('campo-busqueda');
  const limpiar = document.getElementById('limpiar-busqueda');

  let productos = [];          // lista normalizada
  let combos = [];             // combos del día
  let categorias = [];         // [{id, nombre, productos: []}]  (id = nombre de la categoría)
  let filtroCategoria = null;  // categoría elegida en la franja o COMBOS
  let idsBusqueda = null;      // Set de ids que devolvió /menu?buscar=, o 'local' si falló
  let busquedaVigente = 0;

  // ---------- datos ----------
  function normalizarProductos(lista) {
    return lista.map((p) => {
      const stock = Number(p.stock) || 0;
      return {
        clave: 'p' + p.id,
        tipo: 'producto',
        id: p.id,
        nombre: p.nombre,
        descripcion: p.descripcion || '',
        categoria: p.categoria || 'Otros',
        categorias: iconos.categoriasDe(p).length ? iconos.categoriasDe(p) : ['Otros'],
        precio: Number(p.precio),
        stock,
        stockMinimo: Number(p.stock_minimo) || 0,
        imagen: p.imagen_url || null,
        max: Math.min(stock, CFG.MAX_POR_LINEA),
        texto: iconos.normalizar(p.nombre + ' ' + (p.descripcion || '') + ' ' + iconos.categoriasDe(p).join(' ')),
      };
    });
  }

  function normalizarCombos(lista) {
    return lista.map((c) => {
      const items = (c.productos || []).map((p) => ({
        id: p.id, nombre: p.nombre, categoria: p.categoria || '', imagen: p.imagen_url || null,
        cantidad: Number(p.pivot ? p.pivot.cantidad : 1) || 1,
        disponible: Boolean(p.disponible) && !p.deleted_at, stock: Number(p.stock) || 0,
      }));
      // Cuántos combos alcanzan con el stock de sus productos (como máximo 20 por pedido).
      const alcanza = items.length ? Math.min(...items.map((p) => Math.floor(p.stock / p.cantidad))) : 0;
      return {
        clave: 'c' + c.id,
        tipo: 'combo',
        id: c.id,
        nombre: c.nombre,
        descripcion: c.descripcion || '',
        precio: Number(c.precio),
        precioNormal: Number(c.precio_normal),
        ahorro: Number(c.ahorro),
        disponible: Boolean(c.disponible),
        productos: items,
        faltan: items.filter((p) => !p.disponible || p.stock < p.cantidad).map((p) => p.nombre),
        max: c.disponible ? Math.min(alcanza, CFG.MAX_POR_LINEA) : 0,
        categoria: 'Combos',
        detalle: items.map((p) => (p.cantidad > 1 ? p.cantidad + ' × ' : '') + p.nombre).join(' + '),
        imagen: (items.find((p) => p.imagen) || {}).imagen || null,   // miniatura en "Tu pedido"
        texto: iconos.normalizar(c.nombre + ' ' + (c.descripcion || '') + ' combo ' + items.map((p) => p.nombre).join(' ')),
      };
    });
  }

  // Cada categoría junta todos sus productos (principal o adicional) para el filtro de la
  // franja; en el menú completo cada producto se muestra una sola vez: en su categoría
  // principal (la primera). Las categorías salen en el orden del servidor (GET /categorias).
  function agruparPorCategoria(lista) {
    const mapa = new Map();
    lista.forEach((p) => p.categorias.forEach((c) => {
      if (!mapa.has(c)) mapa.set(c, { id: c, nombre: c, productos: [] });
      mapa.get(c).productos.push(p);
    }));
    return iconos.ordenarCategorias([...mapa.keys()]).map((c) => mapa.get(c));
  }

  let firma = '';   // para repintar solo si algo cambió
  async function cargar(silencioso = false) {
    try {
      const [lista, listaCombos, listaCategorias] = await Promise.all([
        api.menu(), api.combos().catch(() => []), api.categorias().catch(() => [])]);
      const nueva = JSON.stringify([lista, listaCombos, listaCategorias]);
      if (silencioso && nueva === firma) return;
      firma = nueva;
      iconos.recordarOrden(listaCategorias);
      productos = normalizarProductos(lista || []);
      combos = normalizarCombos(listaCombos || []).filter((c) => c.disponible && c.max > 0);
      categorias = agruparPorCategoria(productos);
      sincronizarCarrito();
      pintarFranja();
      pintarMenu();
    } catch (e) {
      if (silencioso) return;   // se reintenta en la próxima consulta
      franja.innerHTML = '';
      zonaMenu.innerHTML = `<p class="estado-vacio"><strong>No pudimos cargar el menú</strong>${esc(e.message)}<br><br>
        <button type="button" class="btn btn-oscuro" id="reintentar">Reintentar</button></p>`;
      document.getElementById('reintentar').addEventListener('click', () => cargar());
    }
  }

  // Si cambió el precio, el stock o la foto desde que se armó el carrito, se ajusta.
  function sincronizarCarrito() {
    const porClave = new Map(productos.concat(combos).map((p) => [p.clave, p]));
    const items = carrito.items();
    let cambio = false;
    const nuevos = items.filter((i) => {
      const p = porClave.get(i.clave);
      if (!p || p.max < 1) { cambio = true; return false; }
      if (i.precio !== p.precio || i.max !== p.max || i.cantidad > p.max
        || i.nombre !== p.nombre || i.imagen !== p.imagen || (i.detalle || '') !== (p.detalle || '')) {
        Object.assign(i, {
          nombre: p.nombre, precio: p.precio, max: p.max, cantidad: Math.min(i.cantidad, p.max),
          imagen: p.imagen, categoria: p.categoria, detalle: p.detalle || '',
        });
        cambio = true;
      }
      return true;
    });
    if (cambio) {
      carrito.guardar(nuevos);
      if (nuevos.length < items.length) ui.aviso('Quitamos de tu pedido productos que ya no están disponibles.', 'info', 5000);
    }
  }

  // ---------- pintado ----------
  // Franja de categorías: todas en una sola fila que se desliza (flechas, barrita o arrastrando).
  franja.innerHTML = `
    <button type="button" class="franja-flecha izq" data-franja="-1" aria-label="Ver categorías anteriores">${ICONOS.izq}</button>
    <div class="franja-pista" id="franja-pista"></div>
    <button type="button" class="franja-flecha der" data-franja="1" aria-label="Ver más categorías">${ICONOS.der}</button>`;
  const pistaFranja = document.getElementById('franja-pista');

  function pintarFranja() {
    if (!categorias.length && !combos.length) { pistaFranja.innerHTML = ''; actualizarFranja(); return; }
    const item = (id, icono, nombre, n) => `
      <button type="button" class="franja-item ${filtroCategoria === id ? 'activo' : ''}" data-categoria="${esc(id)}" aria-pressed="${filtroCategoria === id}">
        <span class="franja-icono">${icono}</span>
        <span>${esc(nombre)}</span>
        <span class="franja-cantidad">${n} ${n === 1 ? 'opción' : 'opciones'}</span>
      </button>`;
    const x = pistaFranja.scrollLeft;
    pistaFranja.innerHTML = (combos.length ? item(COMBOS, iconos.iconoCategoria('combos'), 'Combos del día', combos.length) : '')
      + categorias.map((c) => item(c.id, iconos.iconoCategoria(c.nombre), c.nombre, c.productos.length)).join('');
    pistaFranja.scrollLeft = x;
    const activo = pistaFranja.querySelector('.franja-item.activo');
    if (activo) {
      const a = activo.offsetLeft - pistaFranja.offsetLeft;
      if (a < pistaFranja.scrollLeft || a + activo.offsetWidth > pistaFranja.scrollLeft + pistaFranja.clientWidth) {
        pistaFranja.scrollTo({ left: a - (pistaFranja.clientWidth - activo.offsetWidth) / 2, behavior: 'smooth' });
      }
    }
    actualizarFranja();
  }

  function actualizarFranja() {
    const max = pistaFranja.scrollWidth - pistaFranja.clientWidth;
    franja.classList.toggle('desliza', max > 4);
    franja.classList.toggle('al-inicio', pistaFranja.scrollLeft <= 4);
    franja.classList.toggle('al-final', pistaFranja.scrollLeft >= max - 4);
  }
  pistaFranja.addEventListener('scroll', actualizarFranja, { passive: true });
  window.addEventListener('resize', actualizarFranja);

  // Arrastrar con el mouse (en celular ya se desliza con el dedo).
  let arrastre = null;
  pistaFranja.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    arrastre = { x: e.clientX, inicio: pistaFranja.scrollLeft, movio: false };
  });
  window.addEventListener('pointermove', (e) => {
    if (!arrastre) return;
    const dx = e.clientX - arrastre.x;
    if (Math.abs(dx) > 5) { arrastre.movio = true; pistaFranja.classList.add('arrastrando'); }
    if (arrastre.movio) pistaFranja.scrollLeft = arrastre.inicio - dx;
  });
  window.addEventListener('pointerup', () => {
    if (!arrastre) return;
    const movio = arrastre.movio;
    arrastre = null;
    pistaFranja.classList.remove('arrastrando');
    if (movio) {   // que soltar después de arrastrar no cuente como clic
      const evitar = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
      pistaFranja.addEventListener('click', evitar, { capture: true, once: true });
      setTimeout(() => pistaFranja.removeEventListener('click', evitar, { capture: true }), 50);
    }
  });

  function tarjeta(p) {
    const enCarrito = (carrito.items().find((i) => i.clave === p.clave) || {}).cantidad || 0;
    // Solo se avisa cuando quedan pocas unidades.
    const etiqueta = p.stock <= p.stockMinimo ? `<span class="etiqueta-stock poco">¡Quedan ${p.stock}!</span>` : '';
    const lleno = enCarrito >= p.max;
    return `
      <article class="producto-card">
        <div class="producto-img">
          ${ui.fotoProducto(p)}
          ${etiqueta}
        </div>
        <h3 class="producto-nombre">${esc(p.nombre)}</h3>
        <p class="producto-descripcion">${p.descripcion ? esc(p.descripcion) : '&nbsp;'}</p>
        <div class="producto-pie">
          <span class="producto-precio">${bs(p.precio)}</span>
          ${ui.puedePedir() ? `<button type="button" class="btn btn-sm btn-oscuro" data-agregar="${p.clave}" ${lleno ? 'disabled' : ''}>${lleno ? 'Máximo' : 'Agregar'}</button>` : ''}
        </div>
      </article>`;
  }

  // Tarjeta destacada de combo
  function tarjetaCombo(c) {
    const enCarrito = (carrito.items().find((i) => i.clave === c.clave) || {}).cantidad || 0;
    const lleno = enCarrito >= c.max;
    let boton = '';
    if (!c.disponible) boton = '<button type="button" class="btn btn-sm btn-contorno" disabled>No disponible</button>';
    else if (ui.puedePedir()) boton = `<button type="button" class="btn btn-sm btn-claro" data-agregar="${c.clave}" ${lleno ? 'disabled' : ''}>${lleno ? 'Máximo' : 'Agregar combo'}</button>`;
    return `
      <article class="combo-card ${c.disponible ? '' : 'agotado'}">
        <div class="combo-arte">
          ${ui.fotoCombo(c.productos)}
        </div>
        <div class="combo-cuerpo">
          <span class="combo-etiqueta">Combo del día${c.ahorro > 0 ? ` · ahorras ${bs(c.ahorro)}` : ''}</span>
          <h3 class="combo-nombre">${esc(c.nombre)}</h3>
          <p class="combo-detalle">${esc(c.detalle)}</p>
          ${c.descripcion ? `<p class="combo-descripcion">${esc(c.descripcion)}</p>` : ''}
          ${!c.disponible ? `<p class="combo-falta">Hoy no se puede pedir${c.faltan.length ? ': falta ' + esc(c.faltan.join(', ')) : ''}.</p>` : ''}
          <div class="producto-pie">
            <span class="producto-precio combo-precio">${c.precioNormal > c.precio ? `<s class="precio-antes">${bs(c.precioNormal)}</s> ` : ''}${bs(c.precio)}</span>
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

  const idSeccion = (nombre) => iconos.normalizar(nombre).replace(/[^a-z0-9]+/g, '-');

  // Cuántos lugares rotó cada carrusel (las flechas pasan la primera tarjeta al final).
  const giros = {};
  const girar = (lista, id) => {
    const n = lista.length;
    const k = n ? (((giros[id] || 0) % n) + n) % n : 0;
    return k ? lista.slice(k).concat(lista.slice(0, k)) : lista;
  };

  function pintarMenu() {
    const texto = campo.value.trim();
    const termino = iconos.normalizar(texto);
    limpiar.hidden = !campo.value;
    const coincide = (p) => !texto
      || (idsBusqueda instanceof Set ? idsBusqueda.has(p.id) : p.texto.includes(termino));
    const coincideCombo = (c) => !texto || c.texto.includes(termino);

    if (!productos.length && !combos.length) {
      zonaMenu.innerHTML = '<p class="estado-vacio"><strong>Todavía no hay productos disponibles</strong>Vuelve más tarde; el menú se actualiza cuando la cafetería carga lo del día.</p>';
      return;
    }

    const grupos = filtroCategoria === COMBOS ? [] : categorias
      .filter((c) => filtroCategoria === null || c.id === filtroCategoria)
      .map((c) => ({ ...c, productos: c.productos.filter((p) => coincide(p) && (filtroCategoria !== null || p.categorias[0] === c.id)) }))
      .filter((c) => c.productos.length);
    const combosVisibles = (filtroCategoria === null || filtroCategoria === COMBOS) ? combos.filter(coincideCombo) : [];

    const total = grupos.reduce((s, g) => s + g.productos.length, 0) + combosVisibles.length;
    if (!total) {
      zonaMenu.innerHTML = `<p class="estado-vacio"><strong>Sin resultados</strong>
        No encontramos productos que coincidan con “${esc(texto)}”${filtroCategoria !== null ? ' en esta categoría' : ''}.</p>`;
      return;
    }

    const aviso = termino
      ? `<p class="subtitulo-seccion" style="margin-top:0">${total} resultado(s) para “${esc(texto)}”</p>`
      : '';

    // Conservar la posición de cada carrusel al repintar (p. ej. al agregar al carrito).
    const posiciones = {};
    zonaMenu.querySelectorAll('.menu-categoria[id]').forEach((s) => {
      const pista = s.querySelector('.carrusel-pista');
      if (pista) posiciones[s.id] = pista.scrollLeft;
    });

    let html = aviso;
    if (combosVisibles.length) {
      html += carruselSeccion('combos', 'Combos del día', girar(combosVisibles, 'cat-combos').map(tarjetaCombo).join(''), 'seccion-combos');
    }
    html += grupos.map((c) => carruselSeccion(idSeccion(c.nombre), esc(c.nombre),
      girar(c.productos, 'cat-' + idSeccion(c.nombre)).map(tarjeta).join(''))).join('');
    zonaMenu.innerHTML = html;

    Object.entries(posiciones).forEach(([id, x]) => {
      const pista = document.querySelector('#' + CSS.escape(id) + ' .carrusel-pista');
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

  // Flechas en bucle: con "siguiente" la primera tarjeta se va por detrás de las demás hasta
  // el final de la fila y el resto avanza un lugar; con "anterior" la última vuelve al inicio.
  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)');
  function rotarCarrusel(seccion, dir) {
    const pista = seccion.querySelector('.carrusel-pista');
    const tarjetas = [...pista.children];
    if (tarjetas.length < 2) return;
    // Si se toca la flecha mientras gira, el siguiente giro queda en espera.
    if (pista.dataset.girando) { pista.dataset.pendiente = dir; return; }
    giros[seccion.id] = (giros[seccion.id] || 0) + dir;

    const antes = new Map(tarjetas.map((t) => [t, t.getBoundingClientRect().left]));
    const mueve = dir > 0 ? tarjetas[0] : tarjetas[tarjetas.length - 1];
    // Sin el "imán" del carrusel mientras se reordena: si no, el navegador seguiría a la
    // tarjeta que se mueve y saltaría al final de la fila.
    const x = pista.scrollLeft;
    pista.style.scrollSnapType = 'none';
    if (dir > 0) pista.appendChild(mueve); else pista.prepend(mueve);
    pista.scrollLeft = x;
    const devolverIman = () => { pista.style.scrollSnapType = ''; pista.scrollLeft = x; };
    if (sinMovimiento.matches || !mueve.animate) { requestAnimationFrame(devolverIman); return; }

    pista.dataset.girando = '1';
    // La tarjeta que sale gira un poco, se hunde hacia el fondo (más pequeña, oscura y
    // borrosa), viaja por detrás de las demás y vuelve a primer plano en su nuevo lugar.
    // Las otras avanzan una tras otra, por encima de ella.
    const duracion = 1050;
    const suave = 'cubic-bezier(.33,0,.2,1)';
    const giro = dir > 0 ? 1 : -1;
    // perspective() va después de translateX para que el giro sea sobre la propia tarjeta.
    const pose = (x, grados, escala) => `translateX(${x}px) perspective(900px) rotateY(${grados}deg) scale(${escala})`;
    let orden = 0;
    (dir > 0 ? tarjetas : tarjetas.slice().reverse()).forEach((t) => {
      const dx = antes.get(t) - t.getBoundingClientRect().left;
      if (t === mueve) {
        t.style.zIndex = '0';
        t.animate([
          { transform: pose(dx, 0, 1), opacity: 1, filter: 'brightness(1) blur(0px)', easing: 'cubic-bezier(.5,0,.3,1)' },
          { transform: pose(dx, giro * 30, 0.9), opacity: 0.95, filter: 'brightness(.9) blur(0px)', offset: 0.16, easing: 'cubic-bezier(.4,0,.6,1)' },
          { transform: pose(dx * 0.9, giro * 18, 0.7), opacity: 0.5, filter: 'brightness(.6) blur(1.5px)', offset: 0.34, easing: 'cubic-bezier(.45,0,.55,1)' },
          { transform: pose(dx * 0.06, giro * -10, 0.7), opacity: 0.5, filter: 'brightness(.6) blur(1.5px)', offset: 0.74, easing: 'cubic-bezier(.2,.7,.25,1.15)' },
          { transform: pose(0, 0, 1), opacity: 1, filter: 'brightness(1) blur(0px)' },
        ], { duration: duracion, easing: 'linear' });
      } else if (dx) {
        // Esperan a que la tarjeta se vaya al fondo y luego avanzan en cascada.
        t.style.zIndex = '2';
        t.animate([
          { transform: `translateX(${dx}px) scale(1)` },
          { transform: `translateX(${dx}px) scale(1)`, offset: 0.2, easing: suave },
          { transform: `translateX(${dx * 0.1}px) scale(1.025)`, offset: 0.78, easing: 'ease-out' },
          { transform: 'translateX(0) scale(1)' },
        ], { duration: duracion - 160, delay: Math.min(orden++, 6) * 45, easing: 'linear', fill: 'backwards' });
      }
    });
    setTimeout(() => {
      tarjetas.forEach((t) => { t.style.zIndex = ''; });
      devolverIman();
      delete pista.dataset.girando;
      const pendiente = Number(pista.dataset.pendiente);
      delete pista.dataset.pendiente;
      if (pendiente) rotarCarrusel(seccion, pendiente);
    }, duracion + 20);
  }

  // ---------- eventos ----------
  zonaMenu.addEventListener('click', (e) => {
    const flecha = e.target.closest('.flecha');
    if (flecha) {
      rotarCarrusel(flecha.closest('.menu-categoria'), Number(flecha.dataset.dir));
      return;
    }
    const agregar = e.target.closest('[data-agregar]');
    if (agregar) {
      const p = productos.concat(combos).find((x) => x.clave === agregar.dataset.agregar);
      if (!p) return;
      if (carrito.agregar(p)) {
        // En escritorio el pedido está a la vista al costado; en celular se avisa.
        if (!ui.esEscritorio()) ui.aviso(`Agregaste ${p.nombre} a tu pedido.`, 'exito', 2200);
      } else {
        ui.aviso(p.max < CFG.MAX_POR_LINEA ? `Solo hay ${p.max} unidad(es) de ${p.nombre}.` : `Puedes pedir hasta ${CFG.MAX_POR_LINEA} unidades de ${p.nombre}.`, 'error');
      }
    }
  });

  function elegirCategoria(id) {
    filtroCategoria = filtroCategoria === id ? null : id;
    pintarFranja();
    pintarMenu();
    zonaMenu.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  franja.addEventListener('click', (e) => {
    const flecha = e.target.closest('[data-franja]');
    if (flecha) {
      pistaFranja.scrollBy({ left: Math.max(pistaFranja.clientWidth * 0.7, 200) * Number(flecha.dataset.franja), behavior: 'smooth' });
      return;
    }
    const b = e.target.closest('[data-categoria]');
    if (b) elegirCategoria(b.dataset.categoria);
  });

  // Búsqueda en el servidor mientras se escribe (con una pequeña pausa).
  async function buscar() {
    const q = campo.value.trim();
    limpiar.hidden = !campo.value;
    if (!q) { idsBusqueda = null; pintarMenu(); return; }
    const vigente = ++busquedaVigente;
    try {
      const resultado = await api.menu({ buscar: q });
      if (vigente !== busquedaVigente) return;   // llegó una búsqueda más nueva
      idsBusqueda = new Set((resultado || []).map((p) => p.id));
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
  document.addEventListener('menu-recargar', () => cargar());
  // Productos, combos o categorías que el personal cambió: se ven sin recargar la página.
  api.alCambiar(() => cargar(true), { cada: 20000 });

  if (location.hash === '#buscar') setTimeout(() => campo.focus(), 300);

  cargar();
})();
