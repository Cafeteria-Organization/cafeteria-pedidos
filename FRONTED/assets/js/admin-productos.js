// ============================================================
// Administración de productos (HU-20) — solo Admin (rol 1).
//   Listar:  GET  /api/admin/productos (todos, también los agotados, + categorías)
//   Crear:   POST /api/admin/productos (nombre, descripcion, precio, stock_actual, categorias[],
//                                       tiempo_preparacion (HU-11), precio_oferta (HU-21))
//   Editar:  PUT  /api/admin/productos/{id}
// ============================================================
(function () {
  const { api, arte, ui, catalogo } = window.Cafeteria;
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
      // GET /admin/productos: todos los productos (también los agotados) y todas las categorías.
      const r = await api.productosAdmin();
      productos = (r.data || []).map((p) => ({
        id: p.id_producto,
        nombre: p.nombre,
        descripcion: p.descripcion || '',
        precio: Number(p.precio),
        oferta: p.precio_oferta != null ? Number(p.precio_oferta) : null,      // HU-21
        tiempo: Number(p.tiempo_preparacion) || 5,                            // HU-11
        stock: Number(p.stock_actual) || 0,
        categorias: (p.categorias || []).map((c) => ({ id: c.id_categoria, nombre: c.nombre })),
        estado: p.estado,
      })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      categorias = (r.categorias || []).map((c) => ({ id: c.id_categoria, nombre: c.nombre }));
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
      <thead><tr><th>Producto</th><th>Categorías</th><th class="num">Precio</th><th class="num">Prep.</th><th class="num">Stock</th><th>Estado</th><th></th></tr></thead>
      <tbody>${visibles.map((p, i) => {
        const agotado = p.estado === 'Agotado';
        return `
        <tr data-producto="${p.id}" data-nombre="${esc(p.nombre)}" data-estado-prod="${p.estado}">
          <td><div class="tabla-producto">
            <div class="carrito-mini tono-${(p.id + i) % 4}" ${agotado ? 'style="filter:grayscale(.8)"' : ''}>${arte.producto(p.nombre, p.categorias[0] && p.categorias[0].nombre)}</div>
            <div><strong>${esc(p.nombre)}</strong><small>${esc(p.descripcion) || '—'}</small></div>
          </div></td>
          <td>${p.categorias.map((c) => `<span class="chip">${esc(c.nombre)}</span>`).join('') || '<span class="chip">Sin categoría</span>'}</td>
          <td class="num">${p.oferta ? `<s class="precio-antes">${bs(p.precio)}</s><br><strong>${bs(p.oferta)}</strong> <span class="chip chip-oferta">Oferta</span>` : bs(p.precio)}</td>
          <td class="num">${p.tiempo} min</td>
          <td class="num ${p.stock === 0 ? 'stock-cero' : p.stock <= 5 ? 'stock-bajo' : ''}">${p.stock}</td>
          <td><span class="badge ${agotado ? 'badge-cancelado' : 'badge-listo'}">${agotado ? 'Agotado' : 'Disponible'}</span></td>
          <td class="tabla-acciones">
            <button type="button" class="btn btn-sm btn-contorno" data-editar="${p.id}">Editar</button>
            <button type="button" class="btn btn-sm ${agotado ? 'btn-verde' : 'btn-peligro-contorno'}" data-alternar>${agotado ? 'Reactivar' : 'Agotar'}</button>
          </td>
        </tr>`;
      }).join('')}
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
          <div class="campo">
            <label for="p-tiempo">Tiempo de preparación (min) *</label>
            <input id="p-tiempo" name="tiempo" type="number" min="1" max="120" step="1" inputmode="numeric" required value="${p ? p.tiempo : 5}">
            <span class="campo-ayuda">Se usa para calcular el tiempo de espera.</span>
          </div>
          <div class="campo">
            <label for="p-oferta">Precio de oferta (Bs)</label>
            <input id="p-oferta" name="oferta" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Sin oferta" value="${p && p.oferta ? p.oferta.toFixed(2) : ''}">
            <span class="campo-ayuda">Déjalo vacío para cobrar el precio normal.</span>
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
      const tiempo = Number(form.tiempo.value);
      const tiempoMal = !Number.isInteger(tiempo) || tiempo < 1 || tiempo > 120;
      marcar(form.tiempo, tiempoMal);
      if (tiempoMal) errores.push('El tiempo de preparación debe ser de 1 a 120 minutos.');
      const oferta = form.oferta.value === '' ? null : Number(form.oferta.value);
      const ofertaMal = oferta !== null && (!Number.isFinite(oferta) || oferta <= 0 || oferta >= precio);
      marcar(form.oferta, ofertaMal);
      if (ofertaMal) errores.push('El precio de oferta debe ser mayor a 0 y menor que el precio normal.');
      if (errores.length) {
        msg.className = 'mensaje mensaje-error';
        msg.textContent = errores.join(' ');
        msg.hidden = false;
        return;
      }

      const boton = form.querySelector('button[type="submit"]');
      boton.disabled = true;
      const datos = {
        nombre, descripcion: descripcion || null, precio: Math.round(precio * 100) / 100, stock_actual: stock, categorias: cats,
        tiempo_preparacion: tiempo, precio_oferta: oferta === null ? null : Math.round(oferta * 100) / 100,
      };
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
  // HU-15: historial de movimientos de stock (ventas, devoluciones, ajustes, agotado/reactivado).
  document.getElementById('ver-historial').addEventListener('click', () => window.Cafeteria.historialStock.abrir());
  zona.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-editar]');
    if (b) { abrirFormulario(productos.find((p) => p.id === Number(b.dataset.editar))); return; }

    // HU-19: Agotar / Reactivar con PATCH /api/admin/productos/{id}/toggle
    const t = e.target.closest('[data-alternar]');
    if (!t) return;
    const fila = t.closest('tr');
    const reactivar = fila.dataset.estadoProd === 'Agotado';
    const ok = await ui.confirmar(reactivar ? `¿Reactivar “${fila.dataset.nombre}”?` : `¿Marcar “${fila.dataset.nombre}” como agotado?`,
      reactivar ? 'Volverá a aparecer en el menú y se podrá pedir de nuevo.' : 'Dejará de aparecer en el menú hasta que lo reactives.',
      { aceptar: reactivar ? 'Reactivar' : 'Marcar agotado', peligro: !reactivar });
    if (!ok) return;
    t.disabled = true;
    try {
      const r = await api.alternarProducto(Number(fila.dataset.producto));
      ui.aviso(r.message || 'Producto actualizado.', 'exito');
    } catch (err) {
      ui.aviso(err.message, 'error', 6000);
    }
    cargar();
  });

  cargar();
})();
