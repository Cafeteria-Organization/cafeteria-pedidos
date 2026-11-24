// ============================================================
// Gestión del menú (solo Admin).
//   Listar:     GET    /api/admin/productos   (todos, también los agotados)
//   Eliminados: GET    /api/admin/productos?eliminados=1 · POST /api/admin/productos/{id}/restaurar
//   Crear:      POST   /api/admin/productos   nombre, descripcion, categorias[], precio,
//                                            stock (inicial), stock_minimo, imagen
//   Editar:     PUT    /api/admin/productos/{id}   (con foto nueva: POST + _method=PUT)
//   Eliminar:   DELETE /api/admin/productos/{id}   (baja lógica: los pedidos guardan su detalle)
//   En el menú / Agotado: PATCH /api/productos/{id}/agotado y /api/admin/productos/{id}/toggle
//   Categorías: GET /api/categorias · POST|PUT|DELETE /api/admin/categorias
// Un producto puede estar en varias categorías (la primera es la principal).
// El stock no se edita en el formulario: se cambia con "Actualizar" para dejar historial.
// ============================================================
(function () {
  const { api, iconos, ui, inventario, urlImagen } = window.Cafeteria;
  const { esc, bs } = ui;
  const MAX_ORIGINAL = 20 * 1024 * 1024;   // la foto que se elige (antes de reducirla)
  const MAX_SUBIDA = 850 * 1024;           // lo que se sube: la base de datos acepta hasta 900 KB por foto
  const LADO_MAXIMO = 1200;                // px del lado más largo
  const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
  const ATENCION = '__atencion';
  const MAXIMO_FILTROS = 6;

  if (!ui.exigirSesion(['admin'], 'productos')) return;
  ui.pintarLayout({ pagina: 'productos' });
  document.querySelectorAll('[data-icono]').forEach((el) => { el.innerHTML = ui.icono(el.dataset.icono); });

  const zona = document.getElementById('lista-productos');
  const zonaFiltros = document.getElementById('filtro-categorias');
  const filtro = document.getElementById('filtro');
  const zonaEliminados = document.getElementById('lista-eliminados');
  const botonEliminados = document.getElementById('ver-eliminados');

  let productos = [];
  let eliminados = [];
  let categorias = [];      // [{ id, nombre, orden, productos_count }] del servidor
  let filtroElegido = '';   // '' = todos, ATENCION, o el nombre de una categoría
  let restoFiltros = [];

  const necesitaAtencion = (p) => !p.disponible || p.stock <= p.stockMinimo;
  const unidades = inventario.unidades;
  const cuantos = (c) => productos.filter((p) => p.categorias.includes(c)).length;

  // ---------- datos ----------
  async function cargarCategorias() {
    categorias = await api.categorias().catch(() => categorias);
    iconos.recordarOrden(categorias);
  }

  let firma = '';
  async function cargar(silencioso = false) {
    try {
      const [lista, borrados] = await Promise.all([api.productosAdmin(), api.productosEliminados().catch(() => []), cargarCategorias()]);
      const nueva = JSON.stringify([lista, borrados, categorias]);
      if (silencioso && nueva === firma) return;
      firma = nueva;
      productos = lista.map(inventario.normalizar).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      eliminados = borrados.map(inventario.normalizar);
      pintar();
      pintarEliminados();
    } catch (e) {
      if (silencioso) return;
      zona.innerHTML = `<p class="estado-vacio"><strong>No se pudo cargar el catálogo</strong>${esc(e.message)}</p>`;
    }
  }

  // ---------- filtros (no se saturan aunque haya muchas categorías) ----------
  function pintarFiltros() {
    const conProductos = iconos.ordenarCategorias([...new Set(productos.flatMap((p) => p.categorias))]);
    const nAtencion = productos.filter(necesitaAtencion).length;
    if (filtroElegido === ATENCION && !nAtencion) filtroElegido = '';

    let visibles = conProductos;
    restoFiltros = [];
    if (conProductos.length > MAXIMO_FILTROS) {
      visibles = conProductos.slice(0, MAXIMO_FILTROS);
      restoFiltros = conProductos.slice(MAXIMO_FILTROS);
      if (restoFiltros.includes(filtroElegido)) {
        visibles = visibles.concat(filtroElegido);
        restoFiltros = restoFiltros.filter((c) => c !== filtroElegido);
      }
    }
    const boton = (id, contenido, n, extra = '') => `
      <button type="button" class="adm-filtro ${extra} ${filtroElegido === id ? 'activo' : ''}" data-filtro="${esc(id)}" aria-pressed="${filtroElegido === id}">
        ${contenido}<span class="adm-filtro-num">${n}</span></button>`;
    zonaFiltros.innerHTML = boton('', 'Todos', productos.length)
      + (nAtencion ? boton(ATENCION, `${ui.icono('alerta')}Revisar stock`, nAtencion, 'atencion') : '')
      + visibles.map((c) => boton(c, `${iconos.iconoCategoria(c)}${esc(c)}`, cuantos(c))).join('')
      + (restoFiltros.length ? `<button type="button" class="adm-filtro adm-filtro-mas" data-mas aria-expanded="false">
          ${ui.icono('mas')}Ver ${restoFiltros.length} categoría${restoFiltros.length === 1 ? '' : 's'} más${ui.icono('abajo')}</button>` : '');
  }

  zonaFiltros.addEventListener('click', (e) => {
    const mas = e.target.closest('[data-mas]');
    if (mas) {
      ui.desplegable(mas, restoFiltros.map((c) => ({
        id: c, nombre: c, icono: iconos.iconoCategoria(c), detalle: `${cuantos(c)} producto${cuantos(c) === 1 ? '' : 's'}`,
      })), { titulo: 'Más categorías', elegida: filtroElegido, alElegir: (c) => { filtroElegido = c; pintar(); } });
      return;
    }
    const b = e.target.closest('[data-filtro]');
    if (!b) return;
    filtroElegido = b.dataset.filtro === filtroElegido ? '' : b.dataset.filtro;
    pintar();
  });
  filtro.addEventListener('input', pintar);

  // ---------- tarjetas ----------
  function chipsCategorias(p) {
    return `<div class="adm-categorias">${p.categorias.map((c, i) =>
      `<span class="adm-categoria ${i ? 'secundaria' : ''}">${iconos.iconoCategoria(c)}${esc(c)}</span>`).join('')}</div>`;
  }

  function tarjeta(p) {
    const bloqueado = p.stock === 0 && !p.disponible;
    const textoInterruptor = p.disponible ? 'Se vende en el menú' : bloqueado ? 'Sin unidades: actualiza el stock' : 'Fuera del menú';
    return `
      <article class="adm-card ${p.disponible ? '' : 'pausado'}" data-producto="${p.id}">
        <div class="adm-foto">
          ${ui.fotoProducto(p)}
          <span class="adm-estado">${inventario.estado(p)}</span>
        </div>
        <div class="adm-cuerpo">
          <div class="adm-titulo"><h3>${esc(p.nombre)}</h3><span class="adm-precio">${bs(p.precio)}</span></div>
          ${chipsCategorias(p)}
          <p class="adm-desc">${p.descripcion ? esc(p.descripcion) : '<em>Sin descripción</em>'}</p>
          <div class="adm-stock">
            <div class="adm-stock-texto"><strong>${unidades(p.stock)}</strong><small>Alerta con ${p.stockMinimo} o menos</small></div>
            <button type="button" class="btn btn-sm btn-oscuro" data-stock>${ui.icono('caja')}Actualizar</button>
          </div>
          <label class="interruptor ${bloqueado ? 'bloqueado' : ''}">
            <input type="checkbox" data-alternar ${p.disponible ? 'checked' : ''} ${bloqueado ? 'disabled' : ''}>
            <span class="interruptor-pista" aria-hidden="true"></span>
            <span class="interruptor-texto">${textoInterruptor}</span>
          </label>
        </div>
        <div class="adm-acciones">
          <button type="button" class="accion" data-editar>${ui.icono('editar')}Editar</button>
          <button type="button" class="accion" data-movimientos>${ui.icono('reloj')}Historial</button>
          <button type="button" class="accion solo-icono peligro" data-eliminar title="Eliminar producto" aria-label="Eliminar ${esc(p.nombre)}">${ui.icono('papelera')}</button>
        </div>
      </article>`;
  }

  function pintar() {
    pintarFiltros();
    const t = iconos.normalizar(filtro.value.trim());
    const visibles = productos.filter((p) =>
      (!filtroElegido || (filtroElegido === ATENCION ? necesitaAtencion(p) : p.categorias.includes(filtroElegido)))
      && (!t || iconos.normalizar(p.nombre + ' ' + p.categorias.join(' ') + ' ' + p.descripcion).includes(t)));

    if (!visibles.length) {
      zona.innerHTML = `<p class="estado-vacio">${productos.length
        ? '<strong>No hay productos que coincidan</strong>Prueba con otra palabra o elige “Todos”.'
        : '<strong>Todavía no hay productos</strong>Crea el primero con “Nuevo producto”.'}</p>`;
      return;
    }
    zona.innerHTML = `<div class="adm-grid">${visibles.map(tarjeta).join('')}</div>`;
  }

  // ---------- productos eliminados ----------
  function pintarEliminados() {
    botonEliminados.querySelector('[data-cuenta]').textContent = eliminados.length;
    if (!eliminados.length) {
      zonaEliminados.innerHTML = '<p class="estado-vacio">No hay productos eliminados.</p>';
      return;
    }
    zonaEliminados.innerHTML = `<div class="eliminados-lista">${eliminados.map((p) => `
      <article class="eliminado" data-eliminado="${p.id}">
        <div class="carrito-mini">${ui.fotoProducto(p)}</div>
        <div class="eliminado-texto">
          <strong>${esc(p.nombre)}</strong>
          <small>${esc(p.categorias.join(', '))} · ${bs(p.precio)} · ${unidades(p.stock)}</small>
          <small>Eliminado ${p.eliminado ? ui.fechaHora(p.eliminado) : ''}</small>
        </div>
        <button type="button" class="accion exito" data-restaurar>${ui.icono('deshacer')}Restaurar</button>
      </article>`).join('')}</div>`;
  }

  botonEliminados.addEventListener('click', () => {
    document.getElementById('seccion-eliminados').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  zonaEliminados.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-restaurar]');
    if (!b) return;
    const p = eliminados.find((x) => x.id === Number(b.closest('[data-eliminado]').dataset.eliminado));
    if (!p) return;
    b.disabled = true;
    try {
      await api.restaurarProducto(p.id);
      ui.aviso(`“${p.nombre}” volvió al catálogo${p.disponible ? ' y al menú' : ''}.`, 'exito', 4500);
      await cargar();
    } catch (err) {
      b.disabled = false;
      ui.aviso(err.message, 'error', 6000);
    }
  });

  // ---------- selector de categorías (varias por producto) ----------
  // Las elegidas se ven arriba (la primera es la principal); abajo, las demás con buscador.
  function selectorCategorias(contenedor, iniciales) {
    let elegidas = iniciales.slice();
    const elegidasEl = contenedor.querySelector('[data-elegidas]');
    const opcionesEl = contenedor.querySelector('[data-opciones]');
    const buscar = contenedor.querySelector('[data-buscar-cat]');
    const MAX_OPCIONES = 14;

    function pintarSelector() {
      elegidasEl.innerHTML = elegidas.length ? elegidas.map((c, i) => `
        <span class="cat-elegida ${i === 0 ? 'es-principal' : ''}">${iconos.iconoCategoria(c)}${esc(c)}${i === 0
    ? '<em title="En esta categoría aparece el producto en el menú">principal</em>'
    : `<button type="button" class="cat-hacer-principal" data-principal-cat="${esc(c)}" title="Mostrar el producto en esta categoría del menú">hacer principal</button>`}
          <button type="button" data-quitar-cat="${esc(c)}" aria-label="Quitar ${esc(c)}">${ui.ICONOS.cerrar}</button></span>`).join('')
        : '<span class="cat-ninguna">Elige al menos una categoría.</span>';

      const t = iconos.normalizar(buscar.value.trim());
      const libres = iconos.ordenarCategorias(categorias.map((c) => c.nombre)).filter((c) => !elegidas.includes(c));
      const coincide = libres.filter((c) => !t || iconos.normalizar(c).includes(t));
      const existe = categorias.some((c) => iconos.normalizar(c.nombre) === t);
      opcionesEl.innerHTML = coincide.slice(0, MAX_OPCIONES).map((c) =>
        `<button type="button" class="cat-opcion" data-agregar-cat="${esc(c)}">${iconos.iconoCategoria(c)}${esc(c)}</button>`).join('')
        + (coincide.length > MAX_OPCIONES ? `<span class="cat-mas">y ${coincide.length - MAX_OPCIONES} más: escribe para buscar</span>` : '')
        + (t && !existe ? `<button type="button" class="cat-opcion cat-crear" data-crear-cat>${ui.icono('mas')}Crear “${esc(buscar.value.trim())}”</button>` : '')
        + (!coincide.length && !t ? '<span class="cat-mas">Ya elegiste todas.</span>' : '');
    }

    contenedor.addEventListener('click', async (e) => {
      const principal = e.target.closest('[data-principal-cat]');
      if (principal) {
        elegidas = [principal.dataset.principalCat].concat(elegidas.filter((c) => c !== principal.dataset.principalCat));
        pintarSelector();
        return;
      }
      const quitar = e.target.closest('[data-quitar-cat]');
      if (quitar) { elegidas = elegidas.filter((c) => c !== quitar.dataset.quitarCat); pintarSelector(); return; }
      const agregar = e.target.closest('[data-agregar-cat]');
      if (agregar) { elegidas.push(agregar.dataset.agregarCat); buscar.value = ''; pintarSelector(); return; }
      const crear = e.target.closest('[data-crear-cat]');
      if (crear) {
        crear.disabled = true;
        try {
          const nombreNuevo = buscar.value.trim();
          const r = await api.crearCategoria(nombreNuevo, null, iconos.sugerir(nombreNuevo, 1)[0]);
          await cargarCategorias();
          elegidas.push(r.data.nombre);
          buscar.value = '';
          ui.aviso(`Categoría “${r.data.nombre}” creada.`, 'exito');
        } catch (err) {
          ui.aviso(err.message, 'error', 6000);
        }
        pintarSelector();
      }
    });
    buscar.addEventListener('input', pintarSelector);
    buscar.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const primero = opcionesEl.querySelector('[data-agregar-cat], [data-crear-cat]');
      if (primero) primero.click();
    });
    pintarSelector();
    return { elegidas: () => elegidas.slice() };
  }

  // ---------- reducir la foto antes de subirla ----------
  function cargarImagen(archivo) {
    return new Promise((resolver, rechazar) => {
      const url = URL.createObjectURL(archivo);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolver(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rechazar(new Error('imagen')); };
      img.src = url;
    });
  }

  async function reducirFoto(archivo) {
    const img = await cargarImagen(archivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(img.naturalWidth, img.naturalHeight));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(img.naturalWidth * escala);
    lienzo.height = Math.round(img.naturalHeight * escala);
    const ctx = lienzo.getContext('2d');
    ctx.fillStyle = '#ffffff';                       // PNG con transparencia: fondo blanco
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    // Se baja la calidad de a poco hasta que pese menos que el máximo.
    for (const calidad of [0.85, 0.75, 0.65, 0.55, 0.45]) {
      const blob = await new Promise((r) => lienzo.toBlob(r, 'image/jpeg', calidad));
      if (blob && blob.size <= MAX_SUBIDA) return new File([blob], 'foto.jpg', { type: 'image/jpeg' });
    }
    return null;
  }

  // Logo de categoría: se reduce a 256 px y se guarda como PNG (conserva la transparencia).
  async function reducirLogo(archivo) {
    const img = await cargarImagen(archivo);
    const escala = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.max(1, Math.round(img.naturalWidth * escala));
    lienzo.height = Math.max(1, Math.round(img.naturalHeight * escala));
    lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
    const png = await new Promise((r) => lienzo.toBlob(r, 'image/png'));
    if (png && png.size <= MAX_SUBIDA) return new File([png], 'logo.png', { type: 'image/png' });
    const webp = await new Promise((r) => lienzo.toBlob(r, 'image/webp', 0.9));
    if (webp && webp.size <= MAX_SUBIDA && webp.type === 'image/webp') return new File([webp], 'logo.webp', { type: 'image/webp' });
    return null;
  }

  // Abre el selector de archivos y devuelve el logo ya reducido (o null si se canceló).
  function elegirLogo() {
    return new Promise((resolver, rechazar) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = TIPOS_FOTO.join(',');
      input.addEventListener('change', async () => {
        const f = input.files && input.files[0];
        if (!f) { resolver(null); return; }
        if (!TIPOS_FOTO.includes(f.type) || f.size > MAX_ORIGINAL) { rechazar(new Error('El logo debe ser una imagen JPG, PNG o WEBP.')); return; }
        try {
          const logo = await reducirLogo(f);
          if (!logo) throw new Error('x');
          resolver(logo);
        } catch (e) {
          rechazar(new Error('No pudimos preparar esa imagen. Prueba con otra (JPG, PNG o WEBP).'));
        }
      });
      input.click();
    });
  }

  // ---------- formulario (crear / editar) ----------
  function abrirFormulario(p, categoriaInicial) {
    const editando = Boolean(p);
    const tieneFoto = Boolean(p && urlImagen(p));
    const iniciales = p ? p.categorias.filter((c) => c !== 'Otros') : (categoriaInicial ? [categoriaInicial] : []);
    const m = ui.modal(`
      <h2 class="modal-titulo">${editando ? `Editar ${esc(p.nombre)}` : 'Nuevo producto'}</h2>
      <p class="modal-texto" style="margin-bottom:18px">${editando ? 'Cambia lo que necesites. El menú se actualiza apenas guardes.' : 'Completa los datos y el producto aparecerá en el menú al guardarlo.'}</p>
      <form class="formulario" id="form-producto" novalidate>
        <div class="mensaje" id="msg-producto" hidden></div>
        <div class="form-producto">
          <div class="foto-subida">
            <label class="foto-marco" for="p-imagen">
              <span class="foto-vista" id="foto-vista">${ui.fotoProducto(p || {})}</span>
              <span class="foto-cambiar">${ui.icono('mas')}<span data-texto-foto>${tieneFoto ? 'Cambiar foto' : 'Subir foto'}</span></span>
            </label>
            <input id="p-imagen" name="imagen" type="file" accept="image/jpeg,image/png,image/webp" class="solo-lectores">
            <span class="campo-ayuda">JPG, PNG o WEBP</span>
          </div>
          <div class="form-grid">
            <div class="campo ancho">
              <label for="p-nombre">Nombre *</label>
              <input id="p-nombre" name="nombre" maxlength="100" required placeholder="Ej.: Capuchino" value="${esc(p ? p.nombre : '')}">
            </div>
            <div class="campo ancho">
              <label for="p-descripcion">Descripción</label>
              <textarea id="p-descripcion" name="descripcion" maxlength="500" placeholder="¿Qué lleva? Ej.: Espresso con leche vaporizada y espuma">${esc(p ? p.descripcion : '')}</textarea>
            </div>
            <div class="campo ancho">
              <label for="p-buscar-cat">Categorías * <span class="opcional">(puede estar en varias)</span>
              <small class="ayuda-campo">La <strong>principal</strong> es donde aparece en el menú. Las demás sirven para encontrarlo al filtrar (en el menú y en la cocina).</small></label>
              <div class="selector-cats" data-selector-cats>
                <div class="selector-cats-elegidas" data-elegidas></div>
                <input id="p-buscar-cat" type="search" placeholder="Buscar o crear categoría…" autocomplete="off" data-buscar-cat>
                <div class="selector-cats-opciones" data-opciones></div>
              </div>
            </div>
            <div class="campo">
              <label for="p-precio">Precio *</label>
              <div class="campo-prefijo"><span>Bs</span>
                <input id="p-precio" name="precio" type="number" min="0.01" max="9999.99" step="0.01" inputmode="decimal" required placeholder="0,00" value="${p ? p.precio.toFixed(2) : ''}">
              </div>
            </div>
            ${editando ? '' : `<div class="campo">
              <label for="p-stock">¿Cuántas unidades hay? *</label>
              <input id="p-stock" name="stock" type="number" min="0" max="100000" step="1" inputmode="numeric" required placeholder="Ej.: 20">
              <span class="campo-ayuda">Con 0 se crea agotado.</span>
            </div>`}
            <div class="campo">
              <label for="p-minimo">Avisarme cuando queden *</label>
              <input id="p-minimo" name="stock_minimo" type="number" min="0" max="100000" step="1" inputmode="numeric" required value="${p ? p.stockMinimo : 5}">
              <span class="campo-ayuda">La cocina verá el aviso “por agotarse”.</span>
            </div>
          </div>
        </div>
        <div class="modal-botones" style="margin-top:10px">
          <button type="button" class="btn btn-contorno" data-cerrar>Cancelar</button>
          <button type="submit" class="btn btn-oscuro">${editando ? 'Guardar cambios' : 'Crear producto'}</button>
        </div>
      </form>`, { clase: 'modal-ancho', icono: editando ? 'editar' : 'mas' });

    const form = m.elemento.querySelector('#form-producto');
    const msg = m.elemento.querySelector('#msg-producto');
    const vista = m.elemento.querySelector('#foto-vista');
    const textoFoto = m.elemento.querySelector('[data-texto-foto]');
    const selector = selectorCategorias(m.elemento.querySelector('[data-selector-cats]'), iniciales);
    let urlVista = null;

    function error(texto) {
      msg.className = 'mensaje mensaje-error';
      msg.textContent = texto;
      msg.hidden = false;
      msg.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    // La foto elegida se reduce aquí (máx. 1200 px, JPEG) antes de subirla:
    // así pesa poco, carga rápido en el menú y entra en la base de datos.
    let fotoLista = null;
    form.imagen.addEventListener('change', async () => {
      const f = form.imagen.files[0];
      if (urlVista) URL.revokeObjectURL(urlVista);
      urlVista = null;
      fotoLista = null;
      if (!f) return;
      if (!TIPOS_FOTO.includes(f.type)) { error('La foto debe ser JPG, PNG o WEBP.'); form.imagen.value = ''; return; }
      if (f.size > MAX_ORIGINAL) { error('Esa foto es demasiado grande. Elige otra.'); form.imagen.value = ''; return; }
      msg.hidden = true;
      textoFoto.textContent = 'Preparando foto…';
      try {
        fotoLista = await reducirFoto(f);
      } catch (err) {
        fotoLista = null;
      }
      if (!fotoLista || fotoLista.size > MAX_SUBIDA) {
        fotoLista = null;
        form.imagen.value = '';
        textoFoto.textContent = 'Subir foto';
        error('No pudimos preparar esa foto. Prueba con otra (JPG, PNG o WEBP).');
        return;
      }
      urlVista = URL.createObjectURL(fotoLista);
      vista.innerHTML = `<img src="${urlVista}" alt="Vista previa de la foto">`;
      textoFoto.textContent = 'Cambiar foto';
    });
    m.elemento.addEventListener('cerrado', () => { if (urlVista) URL.revokeObjectURL(urlVista); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nombre = form.nombre.value.trim();
      const descripcion = form.descripcion.value.trim();
      const elegidas = selector.elegidas();
      const precio = Number(form.precio.value);
      const minimo = Number(form.stock_minimo.value);
      const stock = editando ? null : Number(form.stock.value);

      const errores = [];
      const marcar = (el, mal) => el.classList.toggle('con-error', mal);
      marcar(form.nombre, !nombre);
      if (!nombre) errores.push('Escribe el nombre.');
      if (!elegidas.length) errores.push('Elige al menos una categoría.');
      const precioMal = form.precio.value === '' || !Number.isFinite(precio) || precio < 0.01 || precio > 9999.99;
      marcar(form.precio, precioMal);
      if (precioMal) errores.push('El precio debe estar entre Bs 0,01 y Bs 9.999,99.');
      if (!editando) {
        const stockMal = form.stock.value === '' || !Number.isInteger(stock) || stock < 0;
        marcar(form.stock, stockMal);
        if (stockMal) errores.push('Escribe cuántas unidades hay (un número entero desde 0).');
      }
      const minimoMal = form.stock_minimo.value === '' || !Number.isInteger(minimo) || minimo < 0;
      marcar(form.stock_minimo, minimoMal);
      if (minimoMal) errores.push('El aviso de stock debe ser un número entero desde 0.');
      if (errores.length) { error(errores.join(' ')); return; }

      const boton = form.querySelector('button[type="submit"]');
      boton.disabled = true;
      const datos = { nombre, descripcion: descripcion || null, categorias: elegidas, precio: Math.round(precio * 100) / 100, stock_minimo: minimo };
      if (!editando) datos.stock = stock;
      const archivo = fotoLista;
      try {
        if (editando) await api.editarProducto(p.id, datos, archivo);
        else await api.crearProducto(datos, archivo);
        m.cerrar();
        ui.aviso(editando ? `“${nombre}” actualizado.` : `“${nombre}” creado${stock > 0 ? ' y publicado en el menú' : ' (agotado hasta que actualices su stock)'}.`, 'exito', 4500);
        cargar();
      } catch (err) {
        boton.disabled = false;
        error(err.message);
      }
    });
  }

  // ---------- selector de ícono: sugeridos por el nombre, galería y imagen propia ----------
  // La galería completa se arma recién cuando se abre (y se filtra al buscar).
  const POPULARES = ['plato', 'cubiertos', 'olla', 'estrella', 'etiqueta', 'bolsa'];
  const porId = (id) => iconos.GALERIA.find((g) => g.id === id);

  function botonIcono(g, elegido) {
    return `<button type="button" class="sel-icono ${g.id === elegido ? 'elegido' : ''}" data-icono-id="${g.id}"
      title="${esc(g.nombre)}" aria-label="Ícono ${esc(g.nombre)}" aria-pressed="${g.id === elegido}">${g.svg}</button>`;
  }

  function sugeridosHtml(nombre, elegido) {
    const ids = iconos.sugerir(nombre, 6);
    const titulo = ids.length ? `Sugeridos para “${esc(nombre.trim())}”` : 'Populares';
    // Los que van con el nombre primero; el resto se completa con los más usados.
    const lista = ids.concat(POPULARES.filter((id) => !ids.includes(id))).slice(0, Math.max(6, ids.length));
    return `<p class="sel-titulo">${titulo}</p>
      <div class="sel-sugeridos">${lista.map((id) => botonIcono(porId(id), elegido)).join('')}</div>`;
  }

  function selectorHtml(nombre, elegido, extra = '', conSubir = true) {
    return `<div class="selector-icono" data-selector>
      <div data-sugeridos>${sugeridosHtml(nombre, elegido)}</div>
      <div class="sel-acciones">
        <button type="button" class="enlace-boton" data-ver-todos aria-expanded="false">${ui.icono('buscar')}Ver todos (${iconos.GALERIA.length})</button>
        ${conSubir ? `<button type="button" class="enlace-boton" data-subir-logo>${ui.icono('mas')}Subir imagen propia</button>` : ''}
        ${extra}
      </div>
      <div class="sel-galeria" data-galeria hidden></div>
    </div>`;
  }

  function marcarElegido(selector, id) {
    selector.querySelectorAll('.sel-icono').forEach((b) => {
      const si = b.dataset.iconoId === id;
      b.classList.toggle('elegido', si);
      b.setAttribute('aria-pressed', si);
    });
  }

  function alternarGaleria(selector, elegido) {
    const zona = selector.querySelector('[data-galeria]');
    const abrir = zona.hidden;
    zona.hidden = !abrir;
    selector.querySelector('[data-ver-todos]').setAttribute('aria-expanded', abrir);
    if (!abrir) return;
    if (!zona.dataset.listo) {
      zona.dataset.listo = '1';
      zona.innerHTML = `<input type="search" class="filtro-tabla sel-buscar" data-buscar-icono autocomplete="off"
          placeholder="Buscar: pizza, jugo, oferta, fotocopias…" aria-label="Buscar ícono">
        <div class="sel-grilla" data-grilla></div>`;
      const campoBuscar = zona.querySelector('[data-buscar-icono]');
      const pintarGrilla = () => {
        const t = campoBuscar.value.trim();
        const lista = iconos.buscarIconos(t);
        const actual = selector.querySelector('.sel-icono.elegido');
        const marcado = actual ? actual.dataset.iconoId : elegido;
        const grilla = zona.querySelector('[data-grilla]');
        if (!lista.length) {
          grilla.innerHTML = '<p class="desplegable-vacio">Ningún ícono con esa palabra. Prueba otra o sube una imagen propia.</p>';
        } else if (t) {
          grilla.innerHTML = `<div class="sel-grupo-iconos">${lista.map((g) => botonIcono(g, marcado)).join('')}</div>`;
        } else {
          grilla.innerHTML = [...new Set(lista.map((g) => g.grupo))].map((gr) => `<p class="sel-grupo">${esc(gr)}</p>
            <div class="sel-grupo-iconos">${lista.filter((g) => g.grupo === gr).map((g) => botonIcono(g, marcado)).join('')}</div>`).join('');
        }
      };
      campoBuscar.addEventListener('input', pintarGrilla);
      campoBuscar.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
      pintarGrilla();
    }
    zona.querySelector('[data-buscar-icono]').focus();
  }

  // ---------- categorías: crear, renombrar y quitar ----------
  function abrirCategorias() {
    const m = ui.modal(`
      <h2 class="modal-titulo">Categorías del menú</h2>
      <p class="modal-texto" style="margin-bottom:18px">Ordenan el menú y el filtro de la cocina. Un producto puede estar en varias.</p>
      <form class="formulario" data-form-cat novalidate>
        <div class="mensaje" data-msg hidden></div>
        <div class="campo">
          <label for="cat-nombre">Nueva categoría</label>
          <div class="fila-en-linea">
            <input id="cat-nombre" name="nombre" maxlength="50" placeholder="Ej.: Snacks, Empanadas, Bebidas calientes" autocomplete="off" autofocus>
            <button type="submit" class="btn btn-oscuro">Crear</button>
          </div>
        </div>
        <div class="cat-vista">
          <span class="cat-vista-icono" data-vista-icono>${iconos.iconoCategoria('')}</span>
          <div class="cat-vista-texto"><small>Así se verá en el menú</small><strong data-vista-nombre>Nombre de la categoría</strong>
            <small class="cat-logo-ayuda" data-vista-modo>Escribe el nombre y te sugerimos un ícono.</small>
          </div>
        </div>
        <div data-selector-nuevo></div>
      </form>
      <div class="cat-lista">
        <div class="cat-lista-cabecera">
          <p class="paso-titulo" style="margin:0">Categorías que ya tienes <span class="carrito-cuenta" data-total></span></p>
          <input type="search" class="filtro-tabla cat-filtro" placeholder="Buscar categoría…" aria-label="Buscar categoría" data-filtro-cat>
        </div>
        <div class="cat-filas" data-lista></div>
      </div>
      <div class="modal-botones" style="margin-top:18px"><button type="button" class="btn btn-contorno" data-cerrar>Listo</button></div>`,
    { icono: 'etiqueta', clase: 'modal-categorias' });

    const form = m.elemento.querySelector('[data-form-cat]');
    const msg = form.querySelector('[data-msg]');
    const lista = m.elemento.querySelector('[data-lista]');
    const filtroCat = m.elemento.querySelector('[data-filtro-cat]');
    const vistaIcono = form.querySelector('[data-vista-icono]');
    const vistaNombre = form.querySelector('[data-vista-nombre]');
    let editando = null;   // id de la categoría que se está renombrando
    let logoNuevo = null;   // imagen propia elegida para la categoría que se va a crear
    let urlLogoNuevo = null;
    let iconoNuevo = null;   // ícono elegido a mano (si es null se usa el sugerido por el nombre)
    let abiertoSel = null;   // categoría existente con el selector de ícono abierto
    const vistaModo = form.querySelector('[data-vista-modo]');
    const zonaSelectorNuevo = form.querySelector('[data-selector-nuevo]');
    zonaSelectorNuevo.innerHTML = selectorHtml('', null,
      '<button type="button" class="enlace-boton" data-auto hidden>Usar el sugerido</button><button type="button" class="enlace-boton peligro" data-sin-logo hidden>Quitar imagen</button>', false);
    const selectorNuevo = zonaSelectorNuevo.querySelector('[data-selector]');
    const sugeridoNuevo = () => iconos.sugerir(form.nombre.value, 1)[0] || null;

    function pintarVista() {
      const v = form.nombre.value.trim();
      const icono = iconoNuevo || sugeridoNuevo();
      vistaIcono.innerHTML = urlLogoNuevo
        ? `<img class="logo-categoria" src="${urlLogoNuevo}" alt="">`
        : iconos.svgDe(icono || 'plato');
      vistaNombre.textContent = v || 'Nombre de la categoría';
      vistaModo.textContent = urlLogoNuevo ? 'Con tu imagen propia.'
        : iconoNuevo ? 'Ícono elegido por ti.'
          : v ? (icono ? 'Ícono sugerido por el nombre. Puedes elegir otro abajo.' : 'No encontramos uno parecido: elige uno abajo.')
            : 'Escribe el nombre y te sugerimos un ícono.';
      selectorNuevo.querySelector('[data-sugeridos]').innerHTML = sugeridosHtml(v, urlLogoNuevo ? null : icono);
      marcarElegido(selectorNuevo, urlLogoNuevo ? null : icono);
      selectorNuevo.querySelector('[data-auto]').hidden = !iconoNuevo || urlLogoNuevo !== null;
      selectorNuevo.querySelector('[data-sin-logo]').hidden = !logoNuevo;
    }
    function soltarLogo() {
      if (urlLogoNuevo) URL.revokeObjectURL(urlLogoNuevo);
      logoNuevo = null; urlLogoNuevo = null;
    }
    m.elemento.addEventListener('cerrado', soltarLogo);

    function mensaje(texto, tipo = 'error') {
      msg.className = 'mensaje mensaje-' + tipo;
      msg.innerHTML = texto;
      msg.hidden = false;
    }

    function pintarLista() {
      m.elemento.querySelector('[data-total]').textContent = `(${categorias.length})`;
      const t = iconos.normalizar(filtroCat.value.trim());
      const vistas = categorias.filter((c) => !t || iconos.normalizar(c.nombre).includes(t));
      lista.innerHTML = vistas.length ? vistas.map((c) => {
        const n = c.productos_count || 0;
        const selector = abiertoSel === c.id
          ? `<div class="cat-fila-selector" data-cat-sel="${c.id}">${selectorHtml(c.nombre, c.logo_url ? null : (c.icono || iconos.sugerir(c.nombre, 1)[0]))}</div>`
          : '';
        if (editando === c.id) {
          return `<div class="cat-fila editando" data-cat="${c.id}">
            <span class="cat-fila-icono">${iconos.iconoCategoria(c.nombre)}</span>
            <input type="text" maxlength="50" value="${esc(c.nombre)}" aria-label="Nuevo nombre" data-nuevo-nombre>
            <button type="button" class="accion principal" data-guardar-nombre>${ui.icono('check')}Guardar</button>
            <button type="button" class="accion" data-cancelar-nombre>Cancelar</button></div>`;
        }
        return `<div class="cat-fila" data-cat="${c.id}">
          <button type="button" class="cat-fila-icono cat-logo-boton ${abiertoSel === c.id ? 'abierto' : ''}" data-cambiar-logo
            aria-expanded="${abiertoSel === c.id}" title="Cambiar ícono" aria-label="Cambiar ícono de ${esc(c.nombre)}">
            ${iconos.iconoCategoria(c.nombre)}<span class="cat-logo-mas">${ui.icono('editar')}</span></button>
          <span class="cat-fila-texto"><strong>${esc(c.nombre)}</strong>
            <small>${n ? `${n} producto${n === 1 ? '' : 's'}` : 'Sin productos: aún no se ve en el menú'}</small></span>
          ${c.logo_url ? `<button type="button" class="accion solo-icono" data-quitar-logo title="Quitar logo (vuelve al ícono)" aria-label="Quitar logo de ${esc(c.nombre)}">${ui.icono('deshacer')}</button>` : ''}
          <button type="button" class="accion solo-icono" data-renombrar title="Cambiar nombre" aria-label="Cambiar nombre de ${esc(c.nombre)}">${ui.icono('editar')}</button>
          <button type="button" class="accion solo-icono peligro" data-quitar ${n ? 'disabled' : ''}
            title="${n ? 'Tiene productos: quítala de esos productos primero' : 'Eliminar categoría'}" aria-label="Eliminar ${esc(c.nombre)}">${ui.icono('papelera')}</button>
        </div>${selector}`;
      }).join('') : '<p class="desplegable-vacio">No hay coincidencias.</p>';
      const input = lista.querySelector('[data-nuevo-nombre]');
      if (input) { input.focus(); input.select(); }
    }

    form.nombre.addEventListener('input', pintarVista);
    filtroCat.addEventListener('input', pintarLista);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nombre = form.nombre.value.trim();
      if (nombre.length < 2) { mensaje('Escribe un nombre de al menos 2 letras.'); return; }
      try {
        const r = await api.crearCategoria(nombre, logoNuevo, iconoNuevo || sugeridoNuevo());
        soltarLogo();
        iconoNuevo = null;
        await cargarCategorias();
        mensaje(`Listo: “${esc(r.data.nombre)}” ya se puede elegir en los productos.
          <button type="button" class="enlace-boton" data-producto-en="${esc(r.data.nombre)}">Agregar un producto ahora</button>`, 'exito');
        form.nombre.value = '';
        form.nombre.dispatchEvent(new Event('input'));
        pintarLista();
        pintarFiltros();
      } catch (err) {
        mensaje(esc(err.message));
      }
    });

    async function guardarNombre(fila) {
      const id = Number(fila.dataset.cat);
      const nombre = fila.querySelector('[data-nuevo-nombre]').value.trim();
      try {
        await api.renombrarCategoria(id, nombre);
        editando = null;
        await Promise.all([cargarCategorias(), cargar()]);
        pintarLista();
        ui.aviso('Nombre actualizado.', 'exito');
      } catch (err) {
        mensaje(esc(err.message));
      }
    }

    async function cambiarLogo(idCat) {
      let logo;
      try { logo = await elegirLogo(); } catch (err) { mensaje(esc(err.message)); return; }
      if (!logo) return;
      try {
        await api.subirLogoCategoria(idCat, logo);
        abiertoSel = null;
        await cargarCategorias();
        pintarLista();
        pintar();
        ui.aviso('Imagen guardada. Ya se ve en el menú.', 'exito');
      } catch (err) {
        mensaje(esc(err.message));
      }
    }

    async function guardarIcono(idCat, icono) {
      try {
        await api.cambiarIconoCategoria(idCat, icono);
        abiertoSel = null;
        await cargarCategorias();
        pintarLista();
        pintar();
        ui.aviso('Ícono actualizado. Ya se ve en el menú.', 'exito');
      } catch (err) { mensaje(esc(err.message)); }
    }

    m.elemento.addEventListener('click', async (e) => {
      const selector = e.target.closest('[data-selector]');
      const enNuevo = selector === selectorNuevo;
      const idSel = selector && !enNuevo ? Number(selector.closest('[data-cat-sel]').dataset.catSel) : null;
      if (selector && e.target.closest('[data-ver-todos]')) {
        const marcado = selector.querySelector('.sel-icono.elegido');
        alternarGaleria(selector, marcado ? marcado.dataset.iconoId : null);
        return;
      }
      const elegido = selector && e.target.closest('[data-icono-id]');
      if (elegido) {
        if (enNuevo) {
          soltarLogo();
          iconoNuevo = elegido.dataset.iconoId === sugeridoNuevo() ? null : elegido.dataset.iconoId;
          pintarVista();
          marcarElegido(selectorNuevo, elegido.dataset.iconoId);
        } else {
          marcarElegido(selector, elegido.dataset.iconoId);
          guardarIcono(idSel, elegido.dataset.iconoId);
        }
        return;
      }
      if (selector && e.target.closest('[data-subir-logo]')) {
        if (!enNuevo) { cambiarLogo(idSel); return; }
        try {
          const logo = await elegirLogo();
          if (logo) { soltarLogo(); logoNuevo = logo; urlLogoNuevo = URL.createObjectURL(logo); }
        } catch (err) { mensaje(esc(err.message)); }
        pintarVista();
        return;
      }
      if (e.target.closest('[data-auto]')) { iconoNuevo = null; pintarVista(); return; }
      if (e.target.closest('[data-sin-logo]')) { soltarLogo(); pintarVista(); return; }
      const fila = e.target.closest('[data-cat]');
      if (e.target.closest('[data-cambiar-logo]')) {
        const idCat = Number(fila.dataset.cat);
        abiertoSel = abiertoSel === idCat ? null : idCat;
        pintarLista();
        return;
      }
      if (e.target.closest('[data-quitar-logo]')) {
        try {
          await api.quitarLogoCategoria(Number(fila.dataset.cat));
          await cargarCategorias();
          pintarLista();
          pintar();
          ui.aviso('Logo quitado: vuelve a verse el ícono.', 'exito');
        } catch (err) { mensaje(esc(err.message)); }
        return;
      }
      if (e.target.closest('[data-renombrar]')) { editando = Number(fila.dataset.cat); pintarLista(); return; }
      if (e.target.closest('[data-cancelar-nombre]')) { editando = null; pintarLista(); return; }
      if (e.target.closest('[data-guardar-nombre]')) { guardarNombre(fila); return; }
      if (e.target.closest('[data-quitar]')) {
        try {
          await api.eliminarCategoria(Number(fila.dataset.cat));
          await cargarCategorias();
          pintarLista();
          ui.aviso('Categoría eliminada.', 'exito');
        } catch (err) {
          mensaje(esc(err.message));
        }
        return;
      }
      const nuevo = e.target.closest('[data-producto-en]');
      if (nuevo) {
        const categoria = nuevo.dataset.productoEn;
        m.cerrar();
        setTimeout(() => abrirFormulario(null, categoria), 240);
      }
    });
    lista.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('[data-nuevo-nombre]')) { e.preventDefault(); guardarNombre(e.target.closest('[data-cat]')); }
    });
    pintarVista();
    pintarLista();
  }

  document.getElementById('nuevo-producto').addEventListener('click', () => abrirFormulario(null));
  document.getElementById('nueva-categoria').addEventListener('click', abrirCategorias);

  // ---------- acciones de cada tarjeta ----------
  zona.addEventListener('click', async (e) => {
    const tarjetaEl = e.target.closest('[data-producto]');
    if (!tarjetaEl) return;
    const p = productos.find((x) => x.id === Number(tarjetaEl.dataset.producto));
    if (!p) return;

    if (e.target.closest('[data-editar]')) { abrirFormulario(p); return; }
    if (e.target.closest('[data-movimientos]')) { inventario.abrirMovimientos(p); return; }
    if (e.target.closest('[data-stock]')) { if (await inventario.reponer(p)) cargar(); return; }

    const d = e.target.closest('[data-eliminar]');
    if (d) {
      const ok = await ui.confirmarEliminar(`¿Eliminar “${p.nombre}”?`, 'Podrás restaurarlo desde Eliminados.');
      if (!ok) return;
      d.disabled = true;
      try {
        await api.eliminarProducto(p.id);
        ui.aviso(`“${p.nombre}” se movió a Productos eliminados.`, 'exito');
      } catch (err) {
        ui.aviso(err.message, 'error', 6000);
      }
      cargar();
    }
  });

  // Interruptor "En el menú": se pide confirmación y luego se recarga.
  zona.addEventListener('change', async (e) => {
    const t = e.target.closest('[data-alternar]');
    if (!t) return;
    const p = productos.find((x) => x.id === Number(t.closest('[data-producto]').dataset.producto));
    if (!p) return;
    t.checked = p.disponible;   // no cambia hasta confirmar
    const hecho = p.disponible ? await inventario.agotar(p) : await inventario.reactivar(p);
    if (hecho) cargar();
  });

  cargar();
  // Lo que se cambie en otra pestaña o computadora se ve sin recargar la página.
  api.alCambiar(() => cargar(true), { cada: 30000 });
})();
