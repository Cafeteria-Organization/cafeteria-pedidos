// ============================================================
// HU-21 — Combos del día (solo Admin).
//   Listar:   GET   /api/admin/combos
//   Crear:    POST  /api/admin/combos  { nombre, descripcion, precio, productos: [{id_producto, cantidad}] }
//   Editar:   PUT   /api/admin/combos/{id}
//   Activar / desactivar: PATCH /api/admin/combos/{id}/toggle
// El servidor valida: al menos 2 productos, todos disponibles, y precio
// menor que la suma de los productos por separado.
// ============================================================
(function () {
  const { api, arte, ui } = window.Cafeteria;
  const { esc, bs } = ui;

  if (!ui.exigirSesion([1], 'combos')) return;
  ui.pintarLayout({ pagina: 'combos' });
  arte.asegurarDefs();

  const zona = document.getElementById('lista-combos');
  const total = document.getElementById('total-combos');
  let combos = [];
  let productos = [];

  async function cargar() {
    try {
      const [lista, prods] = await Promise.all([api.combosAdmin(), api.productosAdmin()]);
      combos = lista;
      productos = (prods.data || []).map((p) => ({
        id: p.id_producto, nombre: p.nombre, precio: Number(p.precio), estado: p.estado, stock: Number(p.stock_actual) || 0,
        categoria: p.categorias && p.categorias[0] ? p.categorias[0].nombre : '',
      })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      pintar();
    } catch (e) {
      zona.innerHTML = `<p class="estado-vacio"><strong>No se pudieron cargar los combos</strong>${esc(e.message)}</p>`;
    }
  }

  function pintar() {
    total.textContent = `(${combos.length})`;
    if (!combos.length) {
      zona.innerHTML = '<p class="estado-vacio"><strong>Todavía no hay combos</strong>Arma el primero con “Nuevo combo”: elige varios productos y ponle un precio especial.</p>';
      return;
    }
    zona.innerHTML = `<table class="tabla">
      <thead><tr><th>Combo</th><th>Incluye</th><th class="num">Precio</th><th>Estado</th><th></th></tr></thead>
      <tbody>${combos.map((c) => {
        const estado = !c.activo
          ? '<span class="badge badge-cancelado">Desactivado</span>'
          : c.disponible ? '<span class="badge badge-listo">En el menú</span>'
            : `<span class="badge badge-pendiente">Sin stock</span><span class="cambio-estado">Falta: ${esc(c.no_disponibles.join(', '))}</span>`;
        return `<tr data-combo="${c.id_combo}">
          <td><strong>${esc(c.nombre)}</strong><small class="tabla-sub">${esc(c.descripcion || '—')}</small></td>
          <td>${c.productos.map((p) => `<span class="chip">${p.cantidad} × ${esc(p.nombre)}</span>`).join(' ')}</td>
          <td class="num"><s class="precio-antes">${bs(c.precio_normal)}</s><br><strong>${bs(c.precio)}</strong>
            <small class="tabla-sub">ahorro ${bs(c.ahorro)}</small></td>
          <td>${estado}</td>
          <td class="tabla-acciones">
            <button type="button" class="btn btn-sm btn-contorno" data-editar>Editar</button>
            <button type="button" class="btn btn-sm ${c.activo ? 'btn-peligro-contorno' : 'btn-verde'}" data-alternar>${c.activo ? 'Desactivar' : 'Activar'}</button>
          </td>
        </tr>`;
      }).join('')}</tbody></table>`;
  }

  // ---------- formulario ----------
  function abrirFormulario(combo) {
    const editando = Boolean(combo);
    const elegidos = new Map((combo ? combo.productos : []).map((p) => [p.id_producto, p.cantidad]));
    const m = ui.modal(`
      <h2 class="modal-titulo">${editando ? 'Editar combo' : 'Nuevo combo del día'}</h2>
      <p class="modal-texto" style="margin-bottom:16px">Elige al menos 2 productos. El precio del combo debe ser menor que comprarlos por separado.</p>
      <form class="formulario" id="form-combo" novalidate>
        <div class="mensaje" id="msg-combo" hidden></div>
        <div class="form-grid">
          <div class="campo ancho">
            <label for="c-nombre">Nombre *</label>
            <input id="c-nombre" name="nombre" maxlength="100" required placeholder="Ej.: Desayuno completo" value="${esc(combo ? combo.nombre : '')}">
          </div>
          <div class="campo ancho">
            <label for="c-descripcion">Descripción</label>
            <input id="c-descripcion" name="descripcion" maxlength="255" placeholder="Ej.: Salteña + jugo natural" value="${esc(combo && combo.descripcion ? combo.descripcion : '')}">
          </div>
          <div class="campo ancho">
            <label>Productos del combo *</label>
            <div class="selector-productos">
              ${productos.map((p) => {
                const cant = elegidos.get(p.id) || 0;
                const agotado = p.estado !== 'Disponible';
                return `<div class="selector-fila ${cant ? 'elegido' : ''} ${agotado ? 'agotado' : ''}" data-producto="${p.id}">
                  <label class="selector-check"><input type="checkbox" ${cant ? 'checked' : ''} ${agotado && !cant ? 'disabled' : ''}>
                    <span>${esc(p.nombre)}${agotado ? ' <em>(agotado)</em>' : ''}</span></label>
                  <span class="selector-precio">${bs(p.precio)}</span>
                  <input type="number" class="selector-cantidad" min="1" max="10" value="${cant || 1}" aria-label="Cantidad de ${esc(p.nombre)}" ${cant ? '' : 'disabled'}>
                </div>`;
              }).join('')}
            </div>
          </div>
          <div class="campo">
            <label for="c-precio">Precio del combo (Bs) *</label>
            <input id="c-precio" name="precio" type="number" min="0" step="0.01" inputmode="decimal" required value="${combo ? Number(combo.precio).toFixed(2) : ''}">
          </div>
          <div class="campo">
            <label>Por separado costaría</label>
            <div class="resumen-precio" id="c-normal">Bs 0,00</div>
          </div>
        </div>
        <div class="modal-botones" style="margin-top:6px">
          <button type="button" class="btn btn-contorno" data-cerrar>Cancelar</button>
          <button type="submit" class="btn btn-oscuro">${editando ? 'Guardar cambios' : 'Crear combo'}</button>
        </div>
      </form>`, { clase: 'modal-ancho' });

    const form = m.elemento.querySelector('#form-combo');
    const msg = m.elemento.querySelector('#msg-combo');
    const normalEl = m.elemento.querySelector('#c-normal');

    function seleccion() {
      return [...form.querySelectorAll('.selector-fila')].filter((f) => f.querySelector('input[type="checkbox"]').checked)
        .map((f) => ({ id_producto: Number(f.dataset.producto), cantidad: Math.max(1, Math.min(10, Number(f.querySelector('.selector-cantidad').value) || 1)) }));
    }
    function actualizarNormal() {
      const normal = seleccion().reduce((s, x) => s + (productos.find((p) => p.id === x.id_producto) || { precio: 0 }).precio * x.cantidad, 0);
      const precio = Number(form.precio.value);
      const ahorro = normal - precio;
      normalEl.innerHTML = `${bs(normal)}${form.precio.value && ahorro > 0 ? ` <span class="ahorro">ahorran ${bs(ahorro)}</span>` : ''}`;
      return normal;
    }
    form.addEventListener('change', (e) => {
      const fila = e.target.closest('.selector-fila');
      if (fila && e.target.type === 'checkbox') {
        fila.classList.toggle('elegido', e.target.checked);
        fila.querySelector('.selector-cantidad').disabled = !e.target.checked;
      }
      actualizarNormal();
    });
    form.addEventListener('input', actualizarNormal);
    actualizarNormal();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nombre = form.nombre.value.trim();
      const lista = seleccion();
      const precio = Number(form.precio.value);
      const normal = actualizarNormal();
      const errores = [];
      if (!nombre) errores.push('Escribe el nombre del combo.');
      if (lista.length < 2) errores.push('Elige al menos 2 productos.');
      if (!form.precio.value || !(precio > 0)) errores.push('Escribe el precio del combo.');
      else if (lista.length >= 2 && precio >= normal) errores.push(`El precio debe ser menor que ${bs(normal)} (lo que cuesta por separado).`);
      if (errores.length) {
        msg.className = 'mensaje mensaje-error';
        msg.textContent = errores.join(' ');
        msg.hidden = false;
        return;
      }
      const boton = form.querySelector('button[type="submit"]');
      boton.disabled = true;
      const datos = { nombre, descripcion: form.descripcion.value.trim() || null, precio: Math.round(precio * 100) / 100, productos: lista };
      try {
        const r = editando ? await api.editarCombo(combo.id_combo, datos) : await api.crearCombo(datos);
        m.cerrar();
        ui.aviso(r.message || 'Combo guardado.', 'exito');
        cargar();
      } catch (err) {
        boton.disabled = false;
        msg.className = 'mensaje mensaje-error';
        msg.textContent = err.message;
        msg.hidden = false;
      }
    });
  }

  document.getElementById('nuevo-combo').addEventListener('click', () => {
    if (productos.filter((p) => p.estado === 'Disponible').length < 2) {
      ui.aviso('Necesitas al menos 2 productos disponibles para armar un combo.', 'error');
      return;
    }
    abrirFormulario(null);
  });

  zona.addEventListener('click', async (e) => {
    const fila = e.target.closest('[data-combo]');
    if (!fila) return;
    const combo = combos.find((c) => c.id_combo === Number(fila.dataset.combo));
    if (e.target.closest('[data-editar]')) { abrirFormulario(combo); return; }
    const t = e.target.closest('[data-alternar]');
    if (!t) return;
    const ok = await ui.confirmar(combo.activo ? `¿Desactivar “${combo.nombre}”?` : `¿Activar “${combo.nombre}”?`,
      combo.activo ? 'Dejará de mostrarse en el menú. Puedes volver a activarlo cuando quieras.' : 'Volverá a mostrarse destacado en el menú.',
      { aceptar: combo.activo ? 'Desactivar' : 'Activar', peligro: combo.activo });
    if (!ok) return;
    t.disabled = true;
    try {
      const r = await api.alternarCombo(combo.id_combo);
      ui.aviso(r.message, 'exito', 5000);
    } catch (err) {
      ui.aviso(err.message, 'error', 6000);
    }
    cargar();
  });

  cargar();
})();
