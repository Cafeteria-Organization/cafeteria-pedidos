// ============================================================
// Mis pedidos (estudiantes y docentes).
//   - Código único de recojo (y su QR) de cada pedido.
//   - Seguimiento visual en 3 pasos (Recibido → En preparación → Listo)
//     con la hora de cada cambio: GET /api/pedidos/{id} trae el historial
//     de estados. La lista se consulta en vivo y avisa cuando está listo.
//   - Cancelar solo en estado "Recibido": POST /pedidos/{id}/cancelar
//     (pide confirmación; el stock vuelve al menú).
//   - Historial propio (GET /mis-pedidos, del más reciente al más antiguo)
//     y "Volver a pedir": POST /pedidos/{id}/repetir crea un pedido nuevo
//     con los mismos productos, revisando otra vez el stock.
// ============================================================
(function () {
  const { api, ui, qr, carrito } = window.Cafeteria;
  const { esc, bs } = ui;
  const CFG = window.CAFETERIA_CONFIG;

  if (!ui.exigirSesion(['estudiante'], 'pedidos')) return;
  ui.pintarLayout({ pagina: 'pedidos' });

  const lista = document.getElementById('lista-pedidos');
  const historial = document.getElementById('lista-historial');
  const punto = document.getElementById('punto-vivo');
  const textoVivo = document.getElementById('texto-vivo');
  const btnAvisos = document.getElementById('activar-avisos');

  const ACTIVOS = ['Recibido', 'En preparación', 'Para entregar'];
  const PASOS = ['Recibido', 'En preparación', 'Para entregar'];
  const TEXTO_ESTADO = {
    Recibido: 'Recibimos tu pedido. Aún puedes cancelarlo mientras la cocina no lo empiece.',
    'En preparación': 'La cocina está preparando tu pedido.',
    'Para entregar': '¡Tu pedido está listo! Acércate a caja con tu código.',
    Completado: 'Pedido entregado. ¡Buen provecho!',
    Cancelado: 'Este pedido fue cancelado.',
  };

  let pedidos = [];
  let estadosPrevios = null;   // id -> estado (para detectar el paso a "Listo")
  let firma = '';              // evita redibujar (y regenerar los QR) si nada cambió
  const horas = {};            // id -> { 'Recibido': fecha, ... }
  const horasDe = {};          // id -> estado con el que se pidieron las horas

  // ---------- pintado ----------
  function progreso(p) {
    if (p.estado === 'Cancelado') return '';
    const actual = p.estado === 'Completado' ? 2 : PASOS.indexOf(p.estado);
    const h = horas[p.id] || {};
    return `<div class="progreso tres" aria-label="Seguimiento del pedido: ${esc(ui.textoEstado(p.estado))}">
      ${PASOS.map((paso, i) => `<div class="progreso-paso ${i <= actual ? 'hecho' : ''} ${i === actual && p.estado !== 'Completado' ? 'actual' : ''}">
        ${esc(ui.textoEstado(paso))}${h[paso] ? `<span class="progreso-hora">${ui.hora(h[paso])}</span>` : ''}</div>`).join('')}
    </div>`;
  }

  function tarjeta(p) {
    const cerrado = !ACTIVOS.includes(p.estado);
    const listo = p.estado === 'Para entregar';
    const clase = cerrado ? 'cerrado' : (listo ? 'listo' : '');
    const creado = ui.fecha(p.created_at) || new Date();
    const items = (p.detalles || []).map((d) => `
      <li><span>${d.cantidad} × ${d.combo_id ? '<span class="chip-combo">Combo</span> ' : ''}${esc(d.nombre)}
          ${d.combo_id && d.contenido && d.contenido.length ? `<small class="combo-contenido">${ui.contenidoCombo(d.contenido)}</small>` : ''}
          ${d.notas ? `<span class="nota-item">${ui.icono('editar')}${esc(d.notas)}</span>` : ''}</span>
        <span>${bs(d.subtotal)}</span></li>`).join('');
    const qrHtml = cerrado ? '' : `<div class="pedido-qr" data-qr="${esc(p.id)}" data-codigo="${esc(p.codigo)}" hidden></div>
          <small class="pedido-qr-ayuda">Muéstralo en caja para recoger</small>`;
    const entregado = p.estado === 'Completado' && p.entregado_at
      ? `<span class="pedido-nota-estado">Entregado el ${esc(ui.fechaHora(p.entregado_at))}.</span>` : '';
    return `
      <article class="pedido-cliente ${clase}" data-id="${esc(p.id)}">
        <div>
          <div class="pedido-cabecera">
            <span class="pedido-numero">Pedido #${esc(p.id)}</span>
            ${ui.badgeEstado(p.estado)}
          </div>
          <div class="pedido-meta">${creado.toLocaleDateString('es-BO')} · ${creado.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</div>
          ${cerrado ? '' : progreso(p)}
          ${listo ? `<div class="aviso-listo">✅ <strong>¡Listo para recoger!</strong> Muestra el código <strong>${esc(p.codigo)}</strong> en caja.</div>` : ''}
        </div>
        ${p.codigo
    ? `<div class="pedido-codigo"><span>Código de recojo</span><strong>${esc(p.codigo)}</strong>${qrHtml}</div>`
    : `<div class="pedido-codigo sin-codigo"><span>Código de recojo</span><strong>—</strong>
          <small class="pedido-qr-ayuda">${p.estado === 'Cancelado' ? 'Se anuló al cancelar el pedido.' : 'Ya se usó y se borró.'}</small></div>`}
        <div>
          <ul class="pedido-items">${items}</ul>
          <div class="pedido-total"><span>Total</span><span>${bs(p.total)}</span></div>
          <div class="pedido-acciones">
            <span class="pedido-nota-estado">${TEXTO_ESTADO[p.estado] || ''}</span>
            ${entregado}
            ${p.estado === 'Recibido' ? '<button type="button" class="btn btn-sm btn-peligro-contorno" data-cancelar style="margin-left:auto">Cancelar pedido</button>' : ''}
            ${cerrado ? '<button type="button" class="btn btn-sm btn-contorno" data-repetir style="margin-left:auto">↻ Volver a pedir</button>' : ''}
          </div>
        </div>
      </article>`;
  }

  function pintar() {
    const activos = pedidos.filter((p) => ACTIVOS.includes(p.estado));
    const cerrados = pedidos.filter((p) => !ACTIVOS.includes(p.estado));
    lista.innerHTML = activos.length ? activos.map(tarjeta).join('') : `<p class="estado-vacio"><strong>No tienes pedidos en curso</strong>
        Elige algo del menú y confírmalo; aquí verás su avance y tu código de recojo.<br><br>
        <a class="btn btn-oscuro" href="${CFG.RUTAS.menu}">Ir al menú</a></p>`;
    historial.innerHTML = cerrados.length ? cerrados.map(tarjeta).join('')
      : '<p class="estado-vacio">Todavía no tienes compras anteriores.</p>';
    lista.querySelectorAll('[data-qr]').forEach((el) => qr.dibujar(el, el.dataset.qr, el.dataset.codigo));
  }

  // ---------- hora de cada cambio de estado ----------
  // Solo se piden de nuevo cuando el pedido cambia de estado.
  async function cargarHoras(activos) {
    const pendientes = activos.filter((p) => horasDe[p.id] !== p.estado);
    if (!pendientes.length) return false;
    await Promise.all(pendientes.map(async (p) => {
      try {
        const d = await api.pedido(p.id);
        // En el backend, pedido_estados.created_at lo pone MySQL con su hora local
        // mientras Laravel guarda todo en UTC, así que puede venir corrido unas horas.
        // "Recibido" se registra en el mismo instante que el pedido: esa diferencia
        // (redondeada a media hora) se usa para corregir todas las horas. Si el
        // backend ya guarda en UTC, la diferencia es 0 y no cambia nada.
        const estados = d.estados || [];
        const recibido = estados.find((e) => e.estado === 'Recibido');
        const creado = ui.fecha(d.created_at);
        const ajuste = recibido && creado && ui.fecha(recibido.created_at)
          ? Math.round((creado - ui.fecha(recibido.created_at)) / 1800000) * 1800000 : 0;
        horas[p.id] = {};
        estados.forEach((e) => {
          const f = ui.fecha(e.created_at);
          if (f) horas[p.id][e.estado] = new Date(f.getTime() + ajuste).toISOString();
        });
        horasDe[p.id] = p.estado;
      } catch (e) { /* sin horas: el seguimiento igual muestra el paso */ }
    }));
    return true;
  }

  // ---------- estado en vivo ----------
  const tituloOriginal = document.title;

  function avisarListo(p) {
    ui.aviso(`¡Tu pedido #${p.id} está listo! Código: ${p.codigo}`, 'exito', 9000);
    document.title = '¡Pedido listo! · ' + tituloOriginal;
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Tu pedido está listo', { body: `Pedido #${p.id} · Código ${p.codigo}` });
      }
    } catch (e) { /* algunos navegadores no permiten notificaciones aquí */ }
  }

  let consultando = false;
  async function refrescar(forzar) {
    if (consultando) return;
    consultando = true;
    try {
      pedidos = await api.misPedidos();
      const nuevasHoras = await cargarHoras(pedidos.filter((p) => ACTIVOS.includes(p.estado)));
      if (estadosPrevios) {
        pedidos.forEach((p) => {
          const antes = estadosPrevios[p.id];
          if (p.estado === 'Para entregar' && antes && antes !== 'Para entregar') avisarListo(p);
          if (p.estado === 'Cancelado' && antes && antes !== 'Cancelado' && !cancelandoAqui.has(p.id)) {
            ui.aviso(`El pedido #${p.id} fue cancelado por la cafetería. El cobro no se realiza.`, 'error', 8000);
          }
        });
      }
      estadosPrevios = Object.fromEntries(pedidos.map((p) => [p.id, p.estado]));
      punto.classList.remove('caido');
      textoVivo.textContent = 'Actualizado a las ' + new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const nueva = JSON.stringify(pedidos.map((p) => [p.id, p.estado, p.total]));
      if (forzar || nuevasHoras || nueva !== firma) {
        firma = nueva;
        pintar();
      }
    } catch (e) {
      punto.classList.add('caido');
      textoVivo.textContent = e.message;
    } finally {
      consultando = false;
    }
  }

  // ---------- cancelar ----------
  const cancelandoAqui = new Set();
  lista.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cancelar]');
    if (!b) return;
    const id = Number(b.closest('[data-id]').dataset.id);
    const ok = await ui.confirmar(
      `¿Cancelar el pedido #${id}?`,
      'Solo se puede cancelar mientras está en "Recibido", antes de que la cocina lo empiece. Las unidades vuelven al menú para que otra persona las aproveche.',
      { aceptar: 'Sí, cancelar', cancelar: 'No, mantenerlo', peligro: true, icono: 'recibo' }
    );
    if (!ok) return;
    b.disabled = true;
    cancelandoAqui.add(id);
    try {
      await api.cancelarPedido(id);
      ui.aviso(`Pedido #${id} cancelado. La cocina ya no lo verá en su panel.`, 'exito', 5000);
    } catch (err) {
      // Si la cocina lo empezó justo antes, el servidor lo rechaza.
      ui.aviso(err.message, 'error', 7000);
    }
    refrescar(true);
  });

  // ---------- volver a pedir ----------
  // Se muestra lo que se va a pedir con los precios y la disponibilidad de hoy.
  async function repetir(b) {
    const id = Number(b.closest('[data-id]').dataset.id);
    const original = pedidos.find((p) => p.id === id);
    if (!original) return;
    b.disabled = true;
    let menu = [];
    let combos = [];
    try {
      [menu, combos] = await Promise.all([api.menu(), api.combos()]);
    } catch (err) {
      b.disabled = false;
      ui.aviso(err.message, 'error', 6000);
      return;
    }
    b.disabled = false;
    const porProducto = new Map(menu.map((p) => [p.id, p]));
    const porCombo = new Map(combos.map((c) => [c.id, c]));

    const lineas = (original.detalles || []).map((d) => {
      if (d.combo_id) {
        const c = porCombo.get(d.combo_id);
        return { d, combo: true, ok: Boolean(c && c.disponible), precio: c ? Number(c.precio) : null, nombre: c ? c.nombre : d.nombre, id: d.combo_id, categoria: 'Combos',
          detalle: c ? (c.productos || []).map((p) => (p.pivot ? p.pivot.cantidad : 1) + ' × ' + p.nombre).join(' + ') : '' };
      }
      const p = porProducto.get(d.producto_id);
      return { d, combo: false, ok: Boolean(p && p.stock >= d.cantidad), precio: p ? Number(p.precio) : null, nombre: p ? p.nombre : d.nombre, id: d.producto_id,
        categoria: p ? p.categoria : '', imagen: p ? (p.imagen_url || null) : null, stock: p ? Number(p.stock) : 0 };
    });
    const disponibles = lineas.filter((l) => l.ok);
    const faltan = lineas.filter((l) => !l.ok);
    const totalHoy = disponibles.reduce((s, l) => s + l.precio * l.d.cantidad, 0);

    const filas = lineas.map((l) => `<li><span>${l.d.cantidad} × ${l.combo ? '<span class="chip-combo">Combo</span> ' : ''}${esc(l.nombre)}
        ${l.ok ? '' : '<span class="repetir-cambio" style="color:var(--rojo)">no disponible hoy</span>'}</span>
      <span>${l.ok ? bs(l.precio * l.d.cantidad) : '—'}${l.ok && Math.abs(l.precio - Number(l.d.precio_unitario)) >= 0.01 ? ` <span class="repetir-cambio">antes ${bs(l.d.precio_unitario)} c/u</span>` : ''}</span></li>`).join('');

    if (!faltan.length) {
      const m = ui.modal(`
        <h2 class="modal-titulo">Volver a pedir el pedido #${id}</h2>
        <p class="modal-texto">Se crea un pedido nuevo con lo mismo, a los precios de hoy. Recibirás un código nuevo.</p>
        <ul class="pedido-items" style="margin-top:14px">${filas}</ul>
        <div class="pedido-total"><span>Total de hoy</span><span>${bs(totalHoy)}</span></div>
        <div class="modal-botones">
          <button type="button" class="btn btn-contorno" data-cerrar>Volver</button>
          <button type="button" class="btn btn-oscuro" data-si>Confirmar pedido</button>
        </div>`, { clase: 'modal-chico', icono: 'recibo' });
      const si = m.elemento.querySelector('[data-si]');
      si.addEventListener('click', async () => {
        si.disabled = true;
        si.textContent = 'Revisando stock…';
        try {
          const r = await api.repetirPedido(id);
          m.cerrar();
          ui.comprobante(r);
          refrescar(true);
        } catch (err) {
          si.disabled = false;
          si.textContent = 'Confirmar pedido';
          ui.aviso(err.message, 'error', 7000);
        }
      });
      return;
    }

    // Si algo ya no está, el servidor rechazaría el pedido completo: se ofrece
    // llevar lo que sí hay al carrito para revisarlo en el menú.
    const m = ui.modal(`
      <h2 class="modal-titulo">No se puede repetir completo</h2>
      <p class="modal-texto">${faltan.length === lineas.length ? 'Ninguno de sus productos está disponible hoy.'
        : 'Algunos productos de este pedido no están disponibles hoy. Puedes llevar el resto a tu pedido y confirmarlo desde el menú.'}</p>
      <ul class="pedido-items" style="margin-top:14px">${filas}</ul>
      <div class="modal-botones">
        <button type="button" class="btn btn-contorno" data-cerrar>Volver</button>
        ${disponibles.length ? '<button type="button" class="btn btn-oscuro" data-si>Llevar lo disponible a mi pedido</button>' : ''}
      </div>`, { clase: 'modal-chico', icono: 'alerta' });
    const si = m.elemento.querySelector('[data-si]');
    if (si) {
      si.addEventListener('click', () => {
        disponibles.forEach((l) => {
          const max = Math.min(l.combo ? CFG.MAX_POR_LINEA : l.stock, CFG.MAX_POR_LINEA);
          const item = { clave: (l.combo ? 'c' : 'p') + l.id, tipo: l.combo ? 'combo' : 'producto', id: l.id, nombre: l.nombre,
            precio: l.precio, max, categoria: l.categoria, detalle: l.detalle || '', imagen: l.imagen || null, notas: l.d.notas || '' };
          for (let i = 0; i < l.d.cantidad; i++) carrito.agregar(item);
        });
        window.location.href = CFG.RUTAS.pedido;
      });
    }
  }

  historial.addEventListener('click', (e) => {
    const b = e.target.closest('[data-repetir]');
    if (b) repetir(b);
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

  lista.innerHTML = '<p class="estado-vacio">Cargando tus pedidos…</p>';
  refrescar(true);
  api.alCambiar(() => refrescar(), { cada: 0 });
  setInterval(refrescar, CFG.REFRESCO_CLIENTE_MS);
})();
