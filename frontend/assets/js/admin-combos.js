// ============================================================
// Combos u ofertas del día (solo Admin).
//   Listar:     GET    /api/admin/combos   (activos e inactivos)
//   Crear:      POST   /api/admin/combos   { nombre, descripcion, precio, activo, productos: [{id, cantidad}] }
//   Editar:     PUT    /api/admin/combos/{id}
//   Activar / desactivar: PATCH /api/admin/combos/{id}/toggle
//   Eliminar:   DELETE /api/admin/combos/{id}   (baja lógica)
// Se valida aquí que el combo tenga al menos 2 unidades y que todo esté disponible.
// Cada producto lleva su cantidad (p. ej. 2 cafés + 1 sándwich); el precio del combo
// es libre y se muestra cuánto costarían los productos por separado.
// ============================================================
(function () {
  const { api, ui, iconos } = window.Cafeteria;
  const { esc, bs } = ui;

  if (!ui.exigirSesion(['admin'], 'combos')) return;
  ui.pintarLayout({ pagina: 'combos' });

  const MAX_UNIDADES = 20;   // por producto dentro del combo (lo mismo que acepta el servidor)
  const zona = document.getElementById('lista-combos');
  const total = document.getElementById('total-combos');
  let combos = [];
  let productos = [];

  const cantidadDe = (p) => Number(p.pivot ? p.pivot.cantidad : 1) || 1;
  const sinStock = (c) => (c.productos || []).filter((p) => p.deleted_at || !p.disponible || Number(p.stock) < cantidadDe(p)).map((p) => p.nombre);

  let firma = '';
  async function cargar(silencioso = false) {
    try {
      const [lista, prods] = await Promise.all([api.combosAdmin(), api.productosAdmin()]);
      const nueva = JSON.stringify([lista, prods]);
      if (silencioso && nueva === firma) return;
      firma = nueva;
      combos = lista;
      productos = prods.map((p) => ({
        id: p.id, nombre: p.nombre, precio: Number(p.precio), disponible: Boolean(p.disponible), stock: Number(p.stock) || 0,
      })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      pintar();
    } catch (e) {
      if (silencioso) return;
      zona.innerHTML = `<p class="estado-vacio"><strong>No se pudieron cargar los combos</strong>${esc(e.message)}</p>`;
    }
  }

  function pintar() {
    total.textContent = `(${combos.length})`;
    if (!combos.length) {
      zona.innerHTML = '<p class="estado-vacio"><strong>Todavía no hay combos</strong>Arma el primero con “Nuevo combo”: elige varios productos y ponle un precio especial.</p>';
      return;
    }
    zona.innerHTML = `<div class="adm-grid">${combos.map(tarjeta).join('')}</div>`;
  }

  // Tarjeta de cada combo: fotos de sus productos, precio, qué lleva y sus botones.
  function tarjeta(c) {
    const faltan = sinStock(c);
    const estado = !c.activo
      ? '<span class="badge badge-cancelado">Desactivado</span>'
      : c.disponible ? '<span class="badge badge-listo">En el menú</span>' : '<span class="badge badge-pendiente">No disponible</span>';
    const normal = Number(c.precio_normal);
    return `
      <article class="adm-card adm-combo ${c.activo ? '' : 'pausado'}" data-combo="${c.id}">
        <div class="adm-foto">
          ${ui.fotoCombo(c.productos)}
          <span class="adm-estado">${estado}</span>
        </div>
        <div class="adm-cuerpo">
          <div class="adm-titulo"><h3>${esc(c.nombre)}</h3>
            <span class="adm-precio">${normal > Number(c.precio) ? `<s class="precio-antes">${bs(normal)}</s> ` : ''}${bs(c.precio)}</span></div>
          ${Number(c.ahorro) > 0 ? `<span class="combo-adm-ahorro">Ahorran ${bs(c.ahorro)}</span>` : ''}
          <ul class="combo-adm-lista">${(c.productos || []).map((p) =>
            `<li><b>${cantidadDe(p)} ×</b> ${esc(p.nombre)}</li>`).join('')}</ul>
          ${c.descripcion ? `<p class="adm-desc">${esc(c.descripcion)}</p>` : ''}
          ${c.activo && !c.disponible ? `<p class="combo-adm-falta">Falta: ${esc(faltan.join(', ') || 'productos')}</p>` : ''}
          <label class="interruptor">
            <input type="checkbox" data-alternar ${c.activo ? 'checked' : ''}>
            <span class="interruptor-pista" aria-hidden="true"></span>
            <span class="interruptor-texto">${c.activo ? 'Combo activo' : 'Combo desactivado'}</span>
          </label>
        </div>
        <div class="adm-acciones">
          <button type="button" class="accion" data-editar>${ui.icono('editar')}Editar</button>
          <button type="button" class="accion solo-icono peligro" data-eliminar title="Eliminar combo" aria-label="Eliminar ${esc(c.nombre)}">${ui.icono('papelera')}</button>
        </div>
      </article>`;
  }

  // ---------- formulario ----------
  function abrirFormulario(combo) {
    const editando = Boolean(combo);
    const elegidos = new Map((combo ? combo.productos : []).map((p) => [p.id, cantidadDe(p)]));
    const m = ui.modal(`
      <h2 class="modal-titulo">${editando ? 'Editar combo' : 'Nuevo combo del día'}</h2>
      <p class="modal-texto" style="margin-bottom:16px">Marca los productos, elige cuántos lleva cada uno (por ejemplo, 2 cafés y 1 sándwich) y ponle el precio que quieras. Abajo ves cuánto costarían por separado.</p>
      <form class="formulario" id="form-combo" novalidate>
        <div class="mensaje" id="msg-combo" hidden></div>
        <div class="form-grid">
          <div class="campo ancho">
            <label for="c-nombre">Nombre *</label>
            <input id="c-nombre" name="nombre" maxlength="100" required placeholder="Ej.: Combo Estudiante" value="${esc(combo ? combo.nombre : '')}">
          </div>
          <div class="campo ancho">
            <label for="c-descripcion">Descripción</label>
            <input id="c-descripcion" name="descripcion" maxlength="500" placeholder="Ej.: Hamburguesa + refresco a precio especial" value="${esc(combo && combo.descripcion ? combo.descripcion : '')}">
          </div>
          <div class="campo ancho">
            <label for="c-buscar">Productos del combo * <span class="opcional">(marca cada producto y elige cuántos lleva)</span></label>
            <input id="c-buscar" type="search" placeholder="Buscar producto…" autocomplete="off" data-buscar-producto>
            <div class="selector-productos">
              ${productos.map((p) => {
                const cant = elegidos.get(p.id) || 0;
                const agotado = !p.disponible;
                return `<div class="selector-fila ${cant ? 'elegido' : ''} ${agotado ? 'agotado' : ''}" data-producto="${p.id}" data-cant="${cant || 1}">
                  <label class="selector-check"><input type="checkbox" ${cant ? 'checked' : ''} ${agotado && !cant ? 'disabled' : ''}>
                    <span>${esc(p.nombre)}${agotado ? ' <em>(agotado)</em>' : ''}</span></label>
                  <div class="cantidad cantidad-mini" role="group" aria-label="Cuántos ${esc(p.nombre)} lleva el combo">
                    <button type="button" data-menos aria-label="Uno menos">−</button>
                    <span data-num>${cant || 1}</span>
                    <button type="button" data-mas aria-label="Uno más">+</button>
                  </div>
                  <span class="selector-precio" data-precio-fila>${bs(p.precio * (cant || 1))}</span>
                </div>`;
              }).join('')}
            </div>
          </div>
          <div class="campo">
            <label for="c-precio">Precio del combo (Bs) *</label>
            <input id="c-precio" name="precio" type="number" min="0.01" max="9999.99" step="0.01" inputmode="decimal" required value="${combo ? Number(combo.precio).toFixed(2) : ''}">
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
      </form>`, { clase: 'modal-ancho', icono: 'regalo' });

    const form = m.elemento.querySelector('#form-combo');
    const msg = m.elemento.querySelector('#msg-combo');
    const normalEl = m.elemento.querySelector('#c-normal');

    function seleccion() {
      return [...form.querySelectorAll('.selector-fila')].filter((f) => f.querySelector('input[type="checkbox"]').checked)
        .map((f) => ({ id: Number(f.dataset.producto), cantidad: Number(f.dataset.cant) || 1 }));
    }
    // Suma del precio de los productos elegidos, cada uno por su cantidad.
    function actualizarNormal() {
      const normal = seleccion().reduce((s, x) => s + (productos.find((p) => p.id === x.id) || { precio: 0 }).precio * x.cantidad, 0);
      const diferencia = normal - Number(form.precio.value);
      let nota = '';
      if (form.precio.value && diferencia > 0.004) nota = ` <span class="ahorro">ahorran ${bs(diferencia)}</span>`;
      else if (form.precio.value && diferencia < -0.004) nota = ` <span class="ahorro mas-caro">${bs(-diferencia)} más que por separado</span>`;
      normalEl.innerHTML = bs(normal) + nota;
      return normal;
    }
    // Botones − / + de cada producto
    form.addEventListener('click', (e) => {
      const boton = e.target.closest('[data-menos], [data-mas]');
      if (!boton) return;
      const fila = boton.closest('.selector-fila');
      const p = productos.find((x) => x.id === Number(fila.dataset.producto));
      const cant = Math.min(MAX_UNIDADES, Math.max(1, (Number(fila.dataset.cant) || 1) + (boton.matches('[data-mas]') ? 1 : -1)));
      fila.dataset.cant = cant;
      fila.querySelector('[data-num]').textContent = cant;
      fila.querySelector('[data-precio-fila]').textContent = bs((p ? p.precio : 0) * cant);
      actualizarBotones(fila);
      actualizarNormal();
    });
    function actualizarBotones(fila) {
      const cant = Number(fila.dataset.cant) || 1;
      fila.querySelector('[data-menos]').disabled = cant <= 1;
      fila.querySelector('[data-mas]').disabled = cant >= MAX_UNIDADES;
    }
    form.querySelectorAll('.selector-fila').forEach(actualizarBotones);

    form.addEventListener('change', (e) => {
      const fila = e.target.closest('.selector-fila');
      if (fila && e.target.type === 'checkbox') fila.classList.toggle('elegido', e.target.checked);
      actualizarNormal();
    });
    form.addEventListener('input', (e) => {
      if (e.target.matches('[data-buscar-producto]')) {
        const t = iconos.normalizar(e.target.value.trim());
        form.querySelectorAll('.selector-fila').forEach((f) => {
          f.hidden = Boolean(t) && !iconos.normalizar(f.textContent).includes(t);
        });
        return;
      }
      actualizarNormal();
    });
    actualizarNormal();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nombre = form.nombre.value.trim();
      const lista = seleccion();
      const precio = Number(form.precio.value);
      actualizarNormal();
      // No se puede agregar un producto agotado (los que ya estaban en el combo se pueden dejar).
      const agotados = lista.filter((x) => !elegidos.has(x.id)).map((x) => productos.find((p) => p.id === x.id))
        .filter((p) => p && !p.disponible).map((p) => p.nombre);
      const errores = [];
      if (!nombre) errores.push('Escribe el nombre del combo.');
      if (lista.reduce((s, x) => s + x.cantidad, 0) < 2) errores.push('El combo debe tener al menos 2 unidades (por ejemplo, 2 productos distintos o 2 del mismo).');
      if (agotados.length) errores.push(`Quita los productos agotados: ${agotados.join(', ')}.`);
      if (!form.precio.value || !(precio >= 0.01)) errores.push('Escribe el precio del combo.');
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
        const r = editando ? await api.editarCombo(combo.id, datos) : await api.crearCombo(datos);
        m.cerrar();
        ui.aviso(`${r.mensaje || 'Combo guardado'}: ${nombre}.`, 'exito');
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
    if (!productos.some((p) => p.disponible)) {
      ui.aviso('Necesitas productos disponibles para armar un combo.', 'error');
      return;
    }
    abrirFormulario(null);
  });

  zona.addEventListener('click', async (e) => {
    const fila = e.target.closest('[data-combo]');
    if (!fila) return;
    const combo = combos.find((c) => c.id === Number(fila.dataset.combo));
    if (!combo) return;
    if (e.target.closest('[data-editar]')) { abrirFormulario(combo); return; }

    const d = e.target.closest('[data-eliminar]');
    if (d) {
      const ok = await ui.confirmarEliminar(`¿Eliminar “${combo.nombre}”?`, 'Ya no aparecerá en el menú.');
      if (!ok) return;
      d.disabled = true;
      try {
        const r = await api.eliminarCombo(combo.id);
        ui.aviso(`${r.mensaje || 'Combo eliminado'}: ${combo.nombre}.`, 'exito');
      } catch (err) {
        ui.aviso(err.message, 'error', 6000);
      }
      cargar();
    }
  });

  // Interruptor de cada tarjeta: activar o desactivar el combo (se pide confirmación).
  zona.addEventListener('change', async (e) => {
    const t = e.target.closest('[data-alternar]');
    if (!t) return;
    const combo = combos.find((c) => c.id === Number(t.closest('[data-combo]').dataset.combo));
    if (!combo) return;
    t.checked = Boolean(combo.activo);   // no cambia hasta confirmar
    const ok = await ui.confirmar(combo.activo ? `¿Desactivar “${combo.nombre}”?` : `¿Activar “${combo.nombre}”?`,
      combo.activo ? 'Dejará de mostrarse en el menú. Puedes volver a activarlo cuando quieras.' : 'Volverá a mostrarse destacado en el menú.',
      { aceptar: combo.activo ? 'Sí, desactivar' : 'Sí, activar', peligro: combo.activo, icono: combo.activo ? 'pausa' : 'play' });
    if (!ok) return;
    t.disabled = true;
    try {
      const r = await api.alternarCombo(combo.id);
      ui.aviso(r.mensaje, 'exito', 5000);
    } catch (err) {
      ui.aviso(err.message, 'error', 6000);
    }
    cargar();
  });

  cargar();
  // Lo que se cambie en otra pestaña o computadora se ve sin recargar la página.
  api.alCambiar(() => cargar(true), { cada: 30000 });
})();
