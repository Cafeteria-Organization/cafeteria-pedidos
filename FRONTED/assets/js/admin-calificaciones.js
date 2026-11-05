// ============================================================
// HU-25 — Panel de calificaciones y comentarios (solo Admin).
//   GET /api/admin/feedback?desde=&hasta=&producto=
//   → resumen (promedio general, total, distribución de estrellas),
//     promedio por producto y los comentarios de cada calificación.
// Los datos salen de lo que califican los clientes en "Mis pedidos" (HU-09).
// ============================================================
(function () {
  const { api, ui } = window.Cafeteria;
  const { esc, bs } = ui;

  if (!ui.exigirSesion([1], 'calificaciones')) return;
  ui.pintarLayout({ pagina: 'calificaciones' });

  const form = document.getElementById('filtros-opiniones');
  const zonaResumen = document.getElementById('resumen-opiniones');
  const zonaProductos = document.getElementById('opiniones-productos');
  const zonaComentarios = document.getElementById('opiniones-comentarios');
  const cuenta = document.getElementById('total-comentarios');
  const soloComentarios = document.getElementById('solo-comentarios');
  let datos = null;

  async function cargarProductos() {
    try {
      const r = await api.productosAdmin();
      const opciones = (r.data || []).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        .map((p) => `<option value="${p.id_producto}">${esc(p.nombre)}</option>`).join('');
      form.producto.insertAdjacentHTML('beforeend', opciones);
    } catch (e) { /* el filtro por producto queda solo con "Todos" */ }
  }

  async function cargar() {
    zonaComentarios.innerHTML = '<p class="estado-vacio">Cargando calificaciones…</p>';
    try {
      datos = await api.feedbackAdmin({ desde: form.desde.value, hasta: form.hasta.value, producto: form.producto.value });
      pintar();
    } catch (e) {
      datos = null;
      zonaResumen.innerHTML = '';
      zonaProductos.innerHTML = '';
      zonaComentarios.innerHTML = `<p class="estado-vacio"><strong>No se pudieron cargar las calificaciones</strong>${esc(e.message)}</p>`;
    }
  }

  function pintar() {
    const r = datos.resumen;
    const maxD = Math.max(1, ...Object.values(r.distribucion));
    zonaResumen.innerHTML = `
      <div class="promedio-grande">
        <span class="promedio-numero">${r.promedio === null ? '—' : r.promedio.toFixed(1).replace('.', ',')}</span>
        ${r.promedio === null ? '' : ui.estrellas(r.promedio)}
        <span class="promedio-texto">${r.total} ${r.total === 1 ? 'calificación' : 'calificaciones'} · ${r.con_comentario} con comentario</span>
      </div>
      <div class="distribucion" aria-label="Cantidad de calificaciones por estrellas">
        ${[5, 4, 3, 2, 1].map((n) => {
          const c = r.distribucion[n] || 0;
          return `<div class="distribucion-fila">
            <span>${n} ★</span>
            <div class="ranking-barra" aria-hidden="true"><span style="width:${(c / maxD) * 100}%"></span></div>
            <span class="distribucion-n">${c}</span>
          </div>`;
        }).join('')}
      </div>`;

    zonaProductos.innerHTML = datos.por_producto.length ? `<table class="tabla">
      <thead><tr><th>Producto</th><th>Promedio</th><th class="num">Calificaciones</th></tr></thead>
      <tbody>${datos.por_producto.map((p) => `<tr class="${p.promedio < 3 ? 'fila-alerta' : ''}">
        <td><strong>${esc(p.nombre)}</strong>${p.promedio < 3 ? '<small class="tabla-sub">⚠ Revisar calidad</small>' : ''}</td>
        <td>${ui.estrellas(p.promedio)} <span class="promedio-mini">${p.promedio.toFixed(1).replace('.', ',')}</span></td>
        <td class="num">${p.calificaciones}</td></tr>`).join('')}</tbody></table>`
      : '<p class="estado-vacio">Todavía no hay calificaciones en este filtro.</p>';

    pintarComentarios();
  }

  function pintarComentarios() {
    const lista = datos.comentarios.filter((c) => !soloComentarios.checked || (c.comentario && c.comentario.trim()));
    cuenta.textContent = `(${lista.length})`;
    zonaComentarios.innerHTML = lista.length ? lista.map((c) => `
      <article class="opinion">
        <div class="opinion-cabecera">
          ${ui.estrellas(c.calificacion)}
          <span class="opinion-meta">${esc(c.usuario)} · Pedido #${esc(c.id_pedido)} · ${esc(ui.fecha(c.fecha) ? ui.fecha(c.fecha).toLocaleDateString('es-BO') + ' ' + ui.hora(c.fecha) : '')}</span>
        </div>
        ${c.comentario ? `<p class="opinion-texto">“${esc(c.comentario)}”</p>` : '<p class="opinion-texto sin-texto">Sin comentario</p>'}
        <p class="opinion-productos">${esc(c.productos || '')} · ${bs(c.total)}</p>
      </article>`).join('')
      : '<p class="estado-vacio">No hay calificaciones que mostrar con estos filtros.</p>';
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (form.desde.value && form.hasta.value && form.desde.value > form.hasta.value) {
      ui.aviso('La fecha "desde" no puede ser posterior a la fecha "hasta".', 'error');
      return;
    }
    cargar();
  });
  form.producto.addEventListener('change', cargar);
  document.getElementById('limpiar-filtros').addEventListener('click', () => { form.reset(); cargar(); });
  soloComentarios.addEventListener('change', () => { if (datos) pintarComentarios(); });

  cargarProductos();
  cargar();
})();
