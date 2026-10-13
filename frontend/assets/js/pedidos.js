// ============================================================
// Mis pedidos (cliente).
//   - Muestra número de pedido y código de entrega (HU-04 / HU-17).
//   - Estado en vivo consultando GET /api/pedidos/activos (HU-06: aviso
//     visual, y del navegador si se permite, cuando pasa a "Listo").
//   - Cancelar mientras esté Pendiente: PATCH /api/pedidos/{id}/estado
//     con estado = Cancelado (HU-07). La regla la aplica MySQL con
//     pr_cancelar_pedido, que rechaza si ya está en preparación.
//
// Nota: la API aún no tiene "GET mis pedidos"; por eso la lista sale de
// lo que se confirmó desde este navegador y el estado se cruza con los
// pedidos activos. Si un pedido ya no figura como activo, quedó cerrado
// (entregado, o cancelado por la cafetería).
// ============================================================
(function () {
  const { api, arte, ui, pedidosLocales } = window.Cafeteria;
  const { esc, bs } = ui;
  const CFG = window.CAFETERIA_CONFIG;

  if (!ui.exigirSesion([3], 'pedidos')) return;
  ui.pintarLayout({ pagina: 'pedidos' });
  arte.asegurarDefs();
  document.getElementById('hero-arte').innerHTML = arte.hero();

  const lista = document.getElementById('lista-pedidos');
  const punto = document.getElementById('punto-vivo');
  const textoVivo = document.getElementById('texto-vivo');
  const btnAvisos = document.getElementById('activar-avisos');
  const btnLimpiar = document.getElementById('limpiar-finalizados');

  const PASOS = ['Pendiente', 'Preparando', 'Listo', 'Entregado'];
  const CERRADOS = ['Entregado', 'Cancelado', 'Finalizado'];
  const TEXTO_ESTADO = {
    Pendiente: 'Recibimos tu pedido. La cocina lo tomará en breve.',
    Preparando: 'Tu pedido se está preparando.',
    Listo: '¡Tu pedido está listo! Acércate con tu código.',
    Entregado: 'Pedido entregado. ¡Buen provecho!',
    Cancelado: 'Este pedido fue cancelado.',
    Finalizado: 'Ya no está activo en cocina (entregado o cancelado por la cafetería).',
  };

  // ---------- pintado ----------
  function progreso(estado) {
    if (estado === 'Cancelado' || estado === 'Finalizado') return '';
    const actual = PASOS.indexOf(estado);
    return `<div class="progreso" aria-label="Progreso del pedido">
      ${PASOS.map((p, i) => `<div class="progreso-paso ${i <= actual ? 'hecho' : ''} ${i === actual ? 'actual' : ''}">${p === 'Preparando' ? 'En preparación' : p}</div>`).join('')}
    </div>`;
  }

  function pintar() {
    const pedidos = pedidosLocales.todos();
    btnLimpiar.hidden = !pedidos.some((p) => CERRADOS.includes(p.estado));

    if (!pedidos.length) {
      lista.innerHTML = `<p class="estado-vacio"><strong>Aún no hiciste pedidos desde este dispositivo</strong>
        Elige algo del menú y confírmalo; aquí verás su estado y tu código de entrega.<br><br>
        <a class="btn btn-oscuro" href="${CFG.RUTAS.menu}">Ir al menú</a></p>`;
      return;
    }

    lista.innerHTML = pedidos.map((p) => {
      const cerrado = CERRADOS.includes(p.estado);
      const clase = cerrado ? 'cerrado' : (p.estado === 'Listo' ? 'listo' : '');
      const fecha = new Date(p.fecha);
      return `
      <article class="pedido-cliente ${clase}" data-id="${esc(p.id_pedido)}">
        <div>
          <div class="pedido-cabecera">
            <span class="pedido-numero">Pedido #${esc(p.id_pedido)}</span>
            <span class="badge badge-${esc(p.estado.toLowerCase())}">${esc(p.estado === 'Preparando' ? 'En preparación' : p.estado)}</span>
          </div>
          <div class="pedido-meta">${fecha.toLocaleDateString('es-BO')} · ${fecha.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</div>
          ${progreso(p.estado)}
        </div>
        <div class="pedido-codigo"><span>Código de entrega</span><strong>${esc(p.codigo)}</strong></div>
        <div>
          <ul class="pedido-items">
            ${p.items.map((i) => `<li><span>${i.cantidad} × ${esc(i.nombre)}${i.notas ? `<span class="nota">“${esc(i.notas)}”</span>` : ''}</span><span>${bs(i.precio * i.cantidad)}</span></li>`).join('')}
          </ul>
          <div class="pedido-total"><span>Total</span><span>${bs(p.total)}</span></div>
          <div class="pedido-acciones">
            <span class="pedido-nota-estado">${TEXTO_ESTADO[p.estado] || ''}</span>
            ${p.estado === 'Pendiente' ? '<button type="button" class="btn btn-sm btn-peligro-contorno" data-cancelar style="margin-left:auto">Cancelar pedido</button>' : ''}
          </div>
        </div>
      </article>`;
    }).join('');
  }

  // ---------- estado en vivo ----------
  const tituloOriginal = document.title;

  function avisarListo(p) {
    ui.aviso(`¡Tu pedido #${p.id_pedido} está listo! Código: ${p.codigo}`, 'exito', 8000);
    document.title = '¡Pedido listo! · ' + tituloOriginal;
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Tu pedido está listo', { body: `Pedido #${p.id_pedido} · Código ${p.codigo}` });
      }
    } catch (e) { /* algunos navegadores no permiten notificaciones aquí */ }
  }

  let consultando = false;
  async function refrescar() {
    if (consultando) return;
    const pendientes = pedidosLocales.todos().filter((p) => !CERRADOS.includes(p.estado));
    if (!pendientes.length) {
      punto.classList.remove('caido');
      textoVivo.textContent = 'Sin pedidos activos';
      return;
    }
    consultando = true;
    try {
      const activos = await api.pedidosActivos();
      const porId = new Map(activos.map((a) => [Number(a.id_pedido), a]));
      pendientes.forEach((p) => {
        const a = porId.get(Number(p.id_pedido));
        const nuevo = a ? a.estado : 'Finalizado';
        if (nuevo !== p.estado) {
          pedidosLocales.actualizar(p.id_pedido, { estado: nuevo, total: a ? Number(a.total) : p.total });
          if (nuevo === 'Listo') avisarListo(p);
        }
      });
      punto.classList.remove('caido');
      textoVivo.textContent = 'Actualizado a las ' + new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      pintar();
    } catch (e) {
      punto.classList.add('caido');
      textoVivo.textContent = e.message;
    } finally {
      consultando = false;
    }
  }

  // ---------- acciones ----------
  lista.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cancelar]');
    if (!b) return;
    const id = Number(b.closest('[data-id]').dataset.id);
    const ok = await ui.confirmar(
      `¿Cancelar el pedido #${id}?`,
      'Solo se puede cancelar mientras está Pendiente. Las unidades vuelven al menú para que otra persona las aproveche.',
      { aceptar: 'Sí, cancelar', peligro: true }
    );
    if (!ok) return;
    b.disabled = true;
    try {
      await api.cambiarEstado(id, 'Cancelado');
      pedidosLocales.actualizar(id, { estado: 'Cancelado' });
      ui.aviso(`Pedido #${id} cancelado.`, 'exito');
      pintar();
    } catch (err) {
      ui.aviso(err.message, 'error', 6000);
      b.disabled = false;
      refrescar();
    }
  });

  btnLimpiar.addEventListener('click', () => {
    pedidosLocales.guardarTodos(pedidosLocales.todos().filter((p) => !CERRADOS.includes(p.estado)));
    pintar();
  });

  if ('Notification' in window && Notification.permission === 'default') {
    btnAvisos.hidden = false;
    btnAvisos.addEventListener('click', async () => {
      try { await Notification.requestPermission(); } catch (e) { /* sin soporte */ }
      btnAvisos.hidden = true;
      if (Notification.permission === 'granted') ui.aviso('Te avisaremos cuando tu pedido esté listo.', 'exito');
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { document.title = tituloOriginal; refrescar(); }
  });

  pintar();
  refrescar();
  setInterval(refrescar, CFG.REFRESCO_CLIENTE_MS);
})();
