// ============================================================
// Panel de cocina (Admin y Empleado).
//   HU-13  Lista en vivo de GET /api/pedidos/activos, ya ordenada por
//          hora de recepción (fecha_pedido ASC), con detalle y notas.
//   HU-05  Aceptar el pedido (pasa a Preparando) o rechazarlo
//          (Cancelado; la API devuelve el stock).
//   HU-14  Botón para marcar "Listo".
//   HU-17  Entregar solo si el código que muestra el cliente coincide
//          con el codigo_verificacion del pedido.
// Todo cambio de estado va por PATCH /api/pedidos/{id}/estado.
// ============================================================
(function () {
  const { api, ui } = window.Cafeteria;
  const { esc, bs } = ui;
  const CFG = window.CAFETERIA_CONFIG;
  const MINUTOS_DEMORA = 15;

  if (!ui.exigirSesion([1, 2], 'cocina')) return;
  ui.pintarLayout({ pagina: 'cocina' });

  const tablero = document.getElementById('tablero');
  const punto = document.getElementById('punto-vivo');
  const textoVivo = document.getElementById('texto-vivo');

  let pedidos = [];
  let vistos = null;         // ids ya mostrados (para resaltar los nuevos)
  let firmaAnterior = '';
  let ocupado = false;

  // ---------- tickets ----------
  function ticket(p, nuevo) {
    const minutos = Math.round((Date.now() - (ui.fecha(p.fecha_pedido) || new Date()).getTime()) / 60000);
    const demora = p.estado !== 'Listo' && minutos >= MINUTOS_DEMORA;
    const items = (p.detalles || []).map((d) => `
      <li><span><strong>${d.cantidad} ×</strong> ${esc(d.producto ? d.producto.nombre : 'Producto #' + d.id_producto)}
        ${d.notas_personalizacion ? `<span class="nota">Nota: “${esc(d.notas_personalizacion)}”</span>` : ''}</span></li>`).join('');

    let acciones = '';
    if (p.estado === 'Pendiente') {
      acciones = `<div class="ticket-acciones">
        <button type="button" class="btn btn-sm btn-peligro-contorno" data-estado="Cancelado">Rechazar</button>
        <button type="button" class="btn btn-sm btn-oscuro" data-estado="Preparando">Aceptar y preparar</button></div>`;
    } else if (p.estado === 'Preparando') {
      acciones = `<div class="ticket-acciones">
        <button type="button" class="btn btn-sm btn-verde" data-estado="Listo">Marcar como listo</button></div>`;
    } else if (p.estado === 'Listo') {
      acciones = `<form class="verificacion" data-verificar>
        <label class="solo-lectores" for="codigo-${p.id_pedido}">Código del cliente para el pedido ${p.id_pedido}</label>
        <input id="codigo-${p.id_pedido}" maxlength="10" placeholder="Código" autocomplete="off" spellcheck="false">
        <button type="submit" class="btn btn-sm btn-oscuro">Entregar</button></form>`;
    }

    return `
      <article class="ticket ${p.estado.toLowerCase()} ${nuevo ? 'nuevo' : ''}" data-id="${p.id_pedido}">
        <div class="ticket-cabecera">
          <span class="ticket-numero">#${esc(p.id_pedido)}</span>
          <span class="ticket-hora ${demora ? 'demora' : ''}">${ui.hora(p.fecha_pedido)}<br>${ui.hace(p.fecha_pedido)}</span>
        </div>
        <p class="ticket-codigo">Cliente #${esc(p.id_usuario)} · Total ${bs(p.total)}</p>
        <ul class="pedido-items">${items}</ul>
        ${acciones}
      </article>`;
  }

  function pintar(forzar) {
    const minuto = Math.floor(Date.now() / 60000);
    const firma = minuto + '|' + JSON.stringify(pedidos.map((p) => [p.id_pedido, p.estado, p.total, (p.detalles || []).length]));
    if (!forzar && firma === firmaAnterior) return;
    firmaAnterior = firma;

    // Conservar lo que se esté escribiendo en un código de verificación.
    const activo = document.activeElement;
    const enfocado = activo && activo.id && activo.id.startsWith('codigo-') ? activo.id : null;
    const escritos = {};
    tablero.querySelectorAll('.verificacion input').forEach((i) => { if (i.value) escritos[i.id] = i.value; });

    const primeraVez = vistos === null;
    if (primeraVez) vistos = new Set();
    const nuevos = [];

    ['Pendiente', 'Preparando', 'Listo'].forEach((estado) => {
      const col = tablero.querySelector(`[data-columna="${estado}"]`);
      const deEstado = pedidos.filter((p) => p.estado === estado);
      col.querySelector('[data-cuenta]').textContent = deEstado.length;
      document.getElementById('n-' + estado.toLowerCase()).textContent = deEstado.length;
      col.querySelector('.columna-lista').innerHTML = deEstado.length
        ? deEstado.map((p) => {
            const esNuevo = !primeraVez && !vistos.has(p.id_pedido);
            if (esNuevo) nuevos.push(p.id_pedido);
            return ticket(p, esNuevo);
          }).join('')
        : `<p class="columna-vacia">${estado === 'Pendiente' ? 'Sin pedidos nuevos por ahora.' : 'Nada por aquí.'}</p>`;
    });
    pedidos.forEach((p) => vistos.add(p.id_pedido));

    Object.entries(escritos).forEach(([id, v]) => { const i = document.getElementById(id); if (i) i.value = v; });
    if (enfocado && document.getElementById(enfocado)) document.getElementById(enfocado).focus();

    if (nuevos.length) ui.aviso(nuevos.length === 1 ? `Nuevo pedido #${nuevos[0]}` : `${nuevos.length} pedidos nuevos`, 'info');
  }

  // ---------- datos ----------
  async function refrescar(forzar) {
    try {
      pedidos = await api.pedidosActivos();
      punto.classList.remove('caido');
      textoVivo.textContent = 'En vivo · ' + new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      pintar(forzar);
    } catch (e) {
      punto.classList.add('caido');
      textoVivo.textContent = e.message;
    }
  }

  async function cambiar(id, estado, boton) {
    if (ocupado) return;
    ocupado = true;
    if (boton) boton.disabled = true;
    try {
      await api.cambiarEstado(id, estado);
      const textos = { Preparando: 'en preparación', Listo: 'listo para entregar', Entregado: 'entregado', Cancelado: 'rechazado' };
      ui.aviso(`Pedido #${id} ${textos[estado]}.`, 'exito', 2500);
    } catch (e) {
      ui.aviso(e.message, 'error', 6000);
      if (boton) boton.disabled = false;
    } finally {
      ocupado = false;
      refrescar(true);
    }
  }

  // ---------- eventos ----------
  tablero.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-estado]');
    if (!b) return;
    const id = Number(b.closest('[data-id]').dataset.id);
    const estado = b.dataset.estado;
    if (estado === 'Cancelado') {
      const ok = await ui.confirmar(`¿Rechazar el pedido #${id}?`,
        'Úsalo si falta algún producto. El pedido se cancela y las unidades vuelven al stock.',
        { aceptar: 'Rechazar pedido', peligro: true });
      if (!ok) return;
    }
    cambiar(id, estado, b);
  });

  tablero.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-verificar]');
    if (!form) return;
    e.preventDefault();
    const id = Number(form.closest('[data-id]').dataset.id);
    const p = pedidos.find((x) => Number(x.id_pedido) === id);
    const input = form.querySelector('input');
    const escrito = input.value.trim().toUpperCase();
    if (!escrito) { input.classList.add('con-error'); input.focus(); return; }
    if (!p || escrito !== String(p.codigo_verificacion || '').toUpperCase()) {
      input.classList.add('con-error');
      ui.aviso('El código no coincide con el del pedido #' + id + '. Pide al cliente que lo revise.', 'error', 5000);
      input.select();
      return;
    }
    cambiar(id, 'Entregado', form.querySelector('button'));
  });

  tablero.addEventListener('input', (e) => {
    if (e.target.matches('.verificacion input')) e.target.classList.remove('con-error');
  });

  refrescar(true);
  setInterval(() => refrescar(false), CFG.REFRESCO_COCINA_MS);
})();
