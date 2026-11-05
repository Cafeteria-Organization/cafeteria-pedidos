// ============================================================
// HU-15 / HU-19: historial de movimientos de stock y disponibilidad.
// GET /api/admin/stock/historial?producto=ID → fecha, producto, cantidad
// anterior y nueva, motivo (venta, cancelación, ajuste, agotado/reactivado)
// y quién hizo el cambio.
// ============================================================
(function () {
  const { api, ui } = window.Cafeteria;
  const { esc } = ui;

  function fechaHora(valor) {
    const d = ui.fecha(valor);
    return d ? d.toLocaleDateString('es-BO') + ' · ' + d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : '—';
  }

  function claseMotivo(motivo) {
    const m = String(motivo || '').toLowerCase();
    if (m.startsWith('venta')) return 'mov-venta';
    if (m.startsWith('devoluci')) return 'mov-devolucion';
    if (m.includes('agotado')) return 'mov-agotado';
    if (m.startsWith('reactivado')) return 'mov-reactivado';
    return 'mov-ajuste';
  }

  function filas(lista, conProducto) {
    return lista.map((h) => {
      const dif = Number(h.cantidad_nueva) - Number(h.cantidad_anterior);
      const cambio = dif === 0
        ? '<span class="mov-igual">sin cambio</span>'
        : `${h.cantidad_anterior} → ${h.cantidad_nueva} <span class="${dif < 0 ? 'mov-menos' : 'mov-mas'}">(${dif > 0 ? '+' : ''}${dif})</span>`;
      return `<tr>
        <td class="mov-fecha">${fechaHora(h.fecha_cambio)}</td>
        ${conProducto ? `<td><strong>${esc(h.producto)}</strong></td>` : ''}
        <td class="num">${cambio}</td>
        <td><span class="mov ${claseMotivo(h.motivo)}">${esc(h.motivo)}</span></td>
        <td>${h.usuario ? esc(h.usuario) : '<span class="mov-igual">Sistema</span>'}</td>
      </tr>`;
    }).join('');
  }

  async function abrir(idProducto, nombre) {
    const conProducto = !idProducto;
    const m = ui.modal(`
      <h2 class="modal-titulo">Historial de stock${nombre ? ' · ' + esc(nombre) : ''}</h2>
      <p class="modal-texto">Cada venta, devolución, ajuste o cambio de disponibilidad, con la hora y quién lo hizo.</p>
      <div class="tabla-envoltura" data-historial><p class="estado-vacio">Cargando…</p></div>`, { clase: 'modal-ancho' });
    const zona = m.elemento.querySelector('[data-historial]');
    try {
      const lista = await api.historialStock(idProducto);
      zona.innerHTML = lista.length
        ? `<table class="tabla tabla-historial"><thead><tr><th>Fecha</th>${conProducto ? '<th>Producto</th>' : ''}
            <th class="num">Stock</th><th>Motivo</th><th>Quién</th></tr></thead><tbody>${filas(lista, conProducto)}</tbody></table>`
        : '<p class="estado-vacio">Todavía no hay movimientos registrados.</p>';
    } catch (e) {
      zona.innerHTML = `<p class="estado-vacio">${esc(e.message)}</p>`;
    }
  }

  // Último cambio de disponibilidad por producto (HU-19): id_producto → movimiento.
  function ultimosCambiosEstado(lista) {
    const mapa = {};
    lista.forEach((h) => {
      const m = String(h.motivo || '');
      if (!/agotado|reactivado/i.test(m)) return;
      if (!mapa[h.id_producto]) mapa[h.id_producto] = h; // la lista viene de la más nueva a la más vieja
    });
    return mapa;
  }

  window.Cafeteria.historialStock = { abrir, ultimosCambiosEstado, fechaHora };
})();
