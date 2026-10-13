// ============================================================
// Administración de productos (HU-20) — solo Admin (rol 1).
//   Listar:  GET  /api/menu            (la API solo devuelve los "Disponible")
//   Crear:   POST /api/admin/productos (nombre, descripcion, precio, stock_actual, categorias[])
//   Editar:  PUT  /api/admin/productos/{id}
// Las categorías se toman de las que ya tienen productos en el menú,
// porque la API todavía no tiene una ruta para listarlas ni crearlas.
// ============================================================
(function () {
  const { api, arte, ui } = window.Cafeteria;
  const { esc, bs } = ui;

  if (!ui.exigirSesion([1], 'productos')) return;
  ui.pintarLayout({ pagina: 'productos' });
  arte.asegurarDefs();

  const zona = document.getElementById('tabla-productos');
  const filtro = document.getElementById('filtro');
  const total = document.getElementById('total-productos');

  let productos = [];
  let categorias = [];   // [{ id, nombre }]

  // ---------- datos ----------
  async function cargar() {
    try {
      const lista = await api.menu();
      productos = lista.map((p) => ({
        id: p.id_producto,
        nombre: p.nombre,
        descripcion: p.descripcion || '',
        precio: Number(p.precio),
        stock: Number(p.stock_actual) || 0,
        categorias: (p.categorias || []).map((c) => ({ id: c.id_categoria, nombre: c.nombre })),
      })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

      const mapa = new Map();
      productos.forEach((p) => p.categorias.forEach((c) => mapa.set(c.id, c)));
      categorias = [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      pintar();
    } catch (e) {
      zona.innerHTML = `<p class="estado-vacio"><strong>No se pudo cargar el catálogo</strong>${esc(e.message)}</p>`;
    }
  }

  // ---------- tabla ----------
  function pintar() {
    const t = arte.normalizar(filtro.value.trim());
    const visibles = productos.filter((p) => !t
      || arte.normalizar(p.nombre + ' ' + p.categorias.map((c) => c.nombre).join(' ')).includes(t));
    total.textContent = `(${productos.length})`;

    if (!visibles.length) {
      zona.innerHTML = `<p class="estado-vacio">${productos.length ? 'Ningún producto coincide con el filtro.' : 'Todavía no hay productos. Crea el primero con “Nuevo producto”.'}</p>`;
      return;
    }

    zona.innerHTML = `<table class="tabla">
      <thead><tr><th>Producto</th><th>Categorías</th><th class="num">Precio</th><th class="num">Stock</th><th></th></tr></thead>
      <tbody>${visibles.map((p, i) => `
        <tr>
          <td><div class="tabla-producto">
            <div class="carrito-mini tono-${(p.id + i) % 4}">${arte.producto(p.nombre, p.categorias[0] && p.categorias[0].nombre)}</div>
            <div><strong>${esc(p.nombre)}</strong><small>${esc(p.descripcion) || '—'}</small></div>
          </div></td>
          <td>${p.categorias.map((c) => `<span class="chip">${esc(c.nombre)}</span>`).join('') || '<span class="chip">Sin categoría</span>'}</td>
          <td class="num">${bs(p.precio)}</td>
          <td class="num ${p.stock === 0 ? 'stock-cero' : p.stock <= 5 ? 'stock-bajo' : ''}">${p.stock === 0 ? 'Agotado' : p.stock}</td>
          <td class="tabla-acciones"><button type="button" class="btn btn-sm btn-contorno" data-editar="${p.id}">Editar</button></td>
        </tr>`).join('')}
      </tbody></table>`;
  }

  filtro.addEventListener('input', pintar);

  // ---------- formulario (crear / editar) ----------
  function abrirFormulario(p) {
    if (!categorias.length) {
      ui.aviso('No hay categorías disponibles: la API aún no permite crearlas. Agrégalas en la base de datos.', 'error', 6000);
      return;
    }
    const editando = Boolean(p);
    const m = ui.modal(`
      <h2 class="modal-titulo">${editando ? 'Editar producto' : 'Nuevo producto'}</h2>
      <p class="modal-texto" style="margin-bottom:16px">${editando ? 'Los cambios se ven de inmediato en el menú.' : 'Aparecerá en el menú apenas lo guardes.'}</p>
      <form class="formulario" id="form-producto" novalidate>
        <div class="mensaje" id="msg-producto" hidden></div>
        <div class="form-grid">
          <div class="campo ancho">
            <label for="p-nombre">Nombre *</label>
            <input id="p-nombre" name="nombre" maxlength="100" required value="${esc(p ? p.nombre : '')}">
          </div>
          <div class="campo ancho">
            <label for="p-descripcion">Descripción</label>
            <textarea id="p-descripcion" name="descripcion" maxlength="255" placeholder="Ej.: Espresso con leche vaporizada">${esc(p ? p.descripcion : '')}</textarea>
          </div>
          <div class="campo">
            <label for="p-precio">Precio (Bs) *</label>
            <input id="p-precio" name="precio" type="number" min="0" step="0.01" inputmode="decimal" required value="${p ? p.precio.toFixed(2) : ''}">
          </div>
          <div class="campo">
            <label for="p-stock">Stock *</label>
            <input id="p-stock" name="stock" type="number" min="0" step="1" inputmode="numeric" required value="${p ? p.stock : ''}">
          </div>
          <div class="campo ancho">
            <label>Categorías * <span class="campo-ayuda">(una o más)</span></label>
            <div class="opciones-chips">
              ${categorias.map((c) => `<label class="opcion-chip"><input type="checkbox" name="categorias" value="${c.id}"
                ${p && p.categorias.some((x) => x.id === c.id) ? 'checked' : ''}><span>${esc(c.nombre)}</span></label>`).join('')}
            </div>
          </div>
        </div>
        <div class="modal-botones" style="margin-top:6px">
          <button type="button" class="btn btn-contorno" data-cerrar>Cancelar</button>
          <button type="submit" class="btn btn-oscuro">${editando ? 'Guardar cambios' : 'Crear producto'}</button>
        </div>
      </form>`, { clase: 'modal-ancho' });

    const form = m.elemento.querySelector('#form-producto');
    const msg = m.elemento.querySelector('#msg-producto');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nombre = form.nombre.value.trim();
      const descripcion = form.descripcion.value.trim();
      const precio = Number(form.precio.value);
      const stock = Number(form.stock.value);
      const cats = [...form.querySelectorAll('input[name="categorias"]:checked')].map((c) => Number(c.value));

      // La API no valida precio ni stock al editar: se valida aquí.
      const errores = [];
      const marcar = (el, mal) => el.classList.toggle('con-error', mal);
      marcar(form.nombre, !nombre);
      if (!nombre) errores.push('Escribe el nombre.');
      const precioMal = form.precio.value === '' || !Number.isFinite(precio) || precio < 0;
      marcar(form.precio, precioMal);
      if (precioMal) errores.push('El precio debe ser un número igual o mayor a 0.');
      const stockMal = form.stock.value === '' || !Number.isInteger(stock) || stock < 0;
      marcar(form.stock, stockMal);
      if (stockMal) errores.push('El stock debe ser un número entero igual o mayor a 0.');
      if (!cats.length) errores.push('Elige al menos una categoría.');
      if (errores.length) {
        msg.className = 'mensaje mensaje-error';
        msg.textContent = errores.join(' ');
        msg.hidden = false;
        return;
      }

      const boton = form.querySelector('button[type="submit"]');
      boton.disabled = true;
      const datos = { nombre, descripcion: descripcion || null, precio: Math.round(precio * 100) / 100, stock_actual: stock, categorias: cats };
      try {
        if (editando) await api.editarProducto(p.id, datos);
        else await api.crearProducto(datos);
        m.cerrar();
        ui.aviso(editando ? `“${nombre}” actualizado.` : `“${nombre}” creado y publicado en el menú.`, 'exito');
        cargar();
      } catch (err) {
        boton.disabled = false;
        msg.className = 'mensaje mensaje-error';
        msg.textContent = err.message;
        msg.hidden = false;
      }
    });
  }

  document.getElementById('nuevo-producto').addEventListener('click', () => abrirFormulario(null));
  zona.addEventListener('click', (e) => {
    const b = e.target.closest('[data-editar]');
    if (b) abrirFormulario(productos.find((p) => p.id === Number(b.dataset.editar)));
  });

  cargar();
})();
