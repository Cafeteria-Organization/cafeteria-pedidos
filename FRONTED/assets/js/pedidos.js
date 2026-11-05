// ============================================================
// Mis pedidos (cliente).
//   HU-08  Historial real: GET /api/mis-pedidos devuelve todos los pedidos
//          del usuario (con detalle) ordenados del más reciente al más antiguo.
//   HU-04 / HU-17  Número de pedido y código de entrega.
//   HU-06  Estado en vivo y aviso cuando pasa a "Listo".
//   HU-16  Si la cocina avisó un retraso, se muestra en el pedido.
//   HU-07  Cancelar mientras no esté Listo: POST /pedidos/{id}/cancelar
//          (la cocina recibe el aviso y el stock vuelve al menú).
//   HU-12  "Repetir pedido": POST /pedidos/{id}/repetir devuelve los productos con
//          precio y disponibilidad de hoy; se cargan al carrito para revisarlos.
//   HU-09  Calificar de 1 a 5 estrellas (y comentario) un pedido ya recogido.
// ============================================================
(function () {
  const { api, arte, ui, qr, carrito } = window.Cafeteria;
  const { esc, bs } = ui;
  const CFG = window.CAFETERIA_CONFIG;

  if (!ui.exigirSesion([3], 'pedidos')) return;
  ui.pintarLayout({ pagina: 'pedidos' });
  arte.asegurarDefs();
  document.getElementById('hero-arte').innerHTML = arte.hero();

  const lista = document.getElementById('lista-pedidos');
  const historial = document.getElementById('lista-historial');
  const punto = document.getElementById('punto-vivo');
  const textoVivo = document.getElementById('texto-vivo');
  const btnAvisos = document.getElementById('activar-avisos');

  const PASOS = ['Pendiente', 'Preparando', 'Listo', 'Entregado'];
  const ACTIVOS = ['Pendiente', 'Preparando', 'Listo'];
  const TEXTO_ESTADO = {
    Pendiente: 'Recibimos tu pedido. La cocina lo tomará en breve.',
    Preparando: 'Tu pedido se está preparando.',
    Listo: '¡Tu pedido está listo! Acércate con tu código.',
    Entregado: 'Pedido entregado. ¡Buen provecho!',
    Cancelado: 'Este pedido fue cancelado.',
  };

  let pedidos = [];
  let retrasos = {};          // codigo_verificacion -> { fecha, minutos } del último aviso de retraso
  let estadosPrevios = null;  // id -> estado (para detectar el paso a "Listo")
  let firma = '';             // evita redibujar (y regenerar los QR) si nada cambió

  // ---------- pintado ----------
  function progreso(estado) {
    if (estado === 'Cancelado') return '';
    const actual = PASOS.indexOf(estado);
    return `<div class="progreso" aria-label="Progreso del pedido">
      ${PASOS.map((p, i) => `<div class="progreso-paso ${i <= actual ? 'hecho' : ''} ${i === actual ? 'actual' : ''}">${p === 'Preparando' ? 'En preparación' : p}</div>`).join('')}
    </div>`;
  }

  function tarjeta(p) {
    const cerrado = !ACTIVOS.includes(p.estado);
    const clase = cerrado ? 'cerrado' : (p.estado === 'Listo' ? 'listo' : '');
    const fecha = ui.fecha(p.fecha_pedido) || new Date();
    const items = (p.detalles || []).map((d) => {
      const nombre = d.producto ? d.producto.nombre : 'Producto #' + d.id_producto;
      return `<li><span>${d.cantidad} × ${esc(nombre)}${d.notas_personalizacion ? `<span class="nota">“${esc(d.notas_personalizacion)}”</span>` : ''}</span>
        <span>${bs(Number(d.precio_unitario) * d.cantidad)}</span></li>`;
    }).join('');
    // HU-16: la hora estimada sale de fecha_pedido + tiempo_estimado (lo actualiza la cocina al avisar retraso).
    const estimada = !cerrado && p.estado !== 'Listo' && p.tiempo_estimado
      ? new Date(fecha.getTime() + Number(p.tiempo_estimado) * 60000).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
      : null;
    const aviso = retrasos[p.codigo_verificacion];
    const retraso = aviso && !cerrado && p.estado !== 'Listo'
      ? `<div class="aviso-retraso">⏱ <strong>La cocina avisó un retraso${aviso.minutos ? ' de ' + aviso.minutos + ' min' : ''}</strong> (${esc(ui.hora(aviso.fecha))}) por la alta demanda.
          ${estimada ? `<br>Nueva hora estimada: <strong>${esc(estimada)}</strong>` : ''}</div>`
      : (estimada ? `<div class="aviso-retraso">⏱ Hora estimada: <strong>${esc(estimada)}</strong></div>` : '');
    // HU-17: el QR solo se muestra mientras el pedido sigue en curso.
    const qrHtml = cerrado ? '' : `<div class="pedido-qr" data-qr="${esc(p.id_pedido)}" data-codigo="${esc(p.codigo_verificacion)}" hidden></div>
          <small class="pedido-qr-ayuda">Muéstralo en caja para recoger</small>`;
    return `
      <article class="pedido-cliente ${clase}" data-id="${esc(p.id_pedido)}">
        <div>
          <div class="pedido-cabecera">
            <span class="pedido-numero">Pedido #${esc(p.id_pedido)}</span>
            <span class="badge badge-${esc(p.estado.toLowerCase())}">${esc(p.estado === 'Preparando' ? 'En preparación' : p.estado)}</span>
          </div>
          <div class="pedido-meta">${fecha.toLocaleDateString('es-BO')} · ${fecha.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</div>
          ${progreso(p.estado)}
          ${retraso}
        </div>
        <div class="pedido-codigo"><span>Código de entrega</span><strong>${esc(p.codigo_verificacion)}</strong>${qrHtml}</div>
        <div>
          <ul class="pedido-items">${items}</ul>
          <div class="pedido-total"><span>Total</span><span>${bs(p.total)}</span></div>
          <div class="pedido-acciones">
            <span class="pedido-nota-estado">${TEXTO_ESTADO[p.estado] || ''}</span>
            ${p.estado === 'Pendiente' || p.estado === 'Preparando' ? '<button type="button" class="btn btn-sm btn-peligro-contorno" data-cancelar style="margin-left:auto">Cancelar pedido</button>' : ''}
            ${cerrado ? '<button type="button" class="btn btn-sm btn-contorno" data-repetir style="margin-left:auto">↻ Repetir pedido</button>' : ''}
          </div>
          ${p.estado === 'Entregado' ? bloqueCalificacion(p) : ''}
        </div>
      </article>`;
  }

  // HU-09: calificación del pedido recogido (una sola vez).
  function bloqueCalificacion(p) {
    const f = p.feedback;
    if (f) {
      return `<div class="calificacion hecha">
        <span class="calificacion-titulo">Tu calificación</span> ${ui.estrellas(f.calificacion)}
        ${f.comentario ? `<p class="calificacion-comentario">“${esc(f.comentario)}”</p>` : ''}
      </div>`;
    }
    return `<form class="calificacion" data-calificar>
      <span class="calificacion-titulo">¿Qué tal estuvo? Califica tu pedido</span>
      <div class="selector-estrellas" role="radiogroup" aria-label="Calificación de 1 a 5 estrellas">
        ${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="estrellas-${p.id_pedido}" value="${n}" required>
          <span aria-hidden="true">★</span><span class="solo-lectores">${n} estrella${n > 1 ? 's' : ''}</span></label>`).join('')}
      </div>
      <textarea maxlength="500" placeholder="Comentario opcional: ¿qué te gustó o qué podemos mejorar?" aria-label="Comentario opcional"></textarea>
      <button type="submit" class="btn btn-sm btn-oscuro">Enviar calificación</button>
    </form>`;
  }

  function pintar() {
    const activos = pedidos.filter((p) => ACTIVOS.includes(p.estado));
    const cerrados = pedidos.filter((p) => !ACTIVOS.includes(p.estado));
    lista.innerHTML = activos.length ? activos.map(tarjeta).join('') : `<p class="estado-vacio"><strong>No tienes pedidos en curso</strong>
        Elige algo del menú y confírmalo; aquí verás su estado y tu código de entrega.<br><br>
        <a class="btn btn-oscuro" href="${CFG.RUTAS.menu}">Ir al menú</a></p>`;
    historial.innerHTML = cerrados.length ? cerrados.map(tarjeta).join('')
      : '<p class="estado-vacio">Todavía no tienes compras anteriores.</p>';
    lista.querySelectorAll('[data-qr]').forEach((el) => qr.dibujar(el, el.dataset.qr, el.dataset.codigo));
  }

  // ---------- estado en vivo ----------
  const tituloOriginal = document.title;

  function avisarListo(p) {
    ui.aviso(`¡Tu pedido #${p.id_pedido} está listo! Código: ${p.codigo_verificacion}`, 'exito', 8000);
    document.title = '¡Pedido listo! · ' + tituloOriginal;
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Tu pedido está listo', { body: `Pedido #${p.id_pedido} · Código ${p.codigo_verificacion}` });
      }
    } catch (e) { /* algunos navegadores no permiten notificaciones aquí */ }
  }

  let consultando = false;
  async function refrescar() {
    if (consultando) return;
    consultando = true;
    try {
      const [lista, notis] = await Promise.all([api.misPedidos(), api.misNotificaciones().catch(() => [])]);
      pedidos = lista;
      retrasos = {};
      const firmaAntes = firma;
      notis.filter((n) => /retraso/i.test(n.titulo))
        .sort((a, b) => String(b.fecha_envio).localeCompare(String(a.fecha_envio)))
        .forEach((n) => {
          const m = String(n.mensaje).match(/código\s+([A-Z0-9]{4,10})/i);
          const min = String(n.mensaje).match(/unos\s+(\d+)\s+minutos/i);
          if (m && !retrasos[m[1].toUpperCase()]) retrasos[m[1].toUpperCase()] = { fecha: n.fecha_envio, minutos: min ? Number(min[1]) : null };
        });
      if (estadosPrevios) {
        pedidos.forEach((p) => { if (p.estado === 'Listo' && estadosPrevios[p.id_pedido] && estadosPrevios[p.id_pedido] !== 'Listo') avisarListo(p); });
      }
      estadosPrevios = Object.fromEntries(pedidos.map((p) => [p.id_pedido, p.estado]));
      punto.classList.remove('caido');
      textoVivo.textContent = 'Actualizado a las ' + new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      firma = JSON.stringify([pedidos.map((p) => [p.id_pedido, p.estado, p.tiempo_estimado, p.total, p.feedback ? p.feedback.id_feedback : 0]), retrasos]);
      // No se repinta mientras el cliente está escribiendo su calificación.
      if (firma !== firmaAntes && document.activeElement && document.activeElement.closest('[data-calificar]')) firma = firmaAntes;
      if (firma !== firmaAntes) pintar();
    } catch (e) {
      punto.classList.add('caido');
      textoVivo.textContent = e.message;
    } finally {
      consultando = false;
    }
  }

  // ---------- cancelar (HU-07) ----------
  lista.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cancelar]');
    if (!b) return;
    const id = Number(b.closest('[data-id]').dataset.id);
    const ok = await ui.confirmar(
      `¿Cancelar el pedido #${id}?`,
      'Se puede cancelar mientras no esté Listo. Avisaremos a cocina y las unidades vuelven al menú para que otra persona las aproveche.',
      { aceptar: 'Sí, cancelar', peligro: true }
    );
    if (!ok) return;
    b.disabled = true;
    try {
      await api.cancelarPedido(id);
      ui.aviso(`Pedido #${id} cancelado. Ya avisamos a cocina.`, 'exito');
    } catch (err) {
      ui.aviso(err.message, 'error', 6000);
    }
    refrescar();
  });

  // ---------- repetir (HU-12) ----------
  async function repetir(b) {
    const id = Number(b.closest('[data-id]').dataset.id);
    b.disabled = true;
    let r;
    try {
      r = await api.repetirPedido(id);
    } catch (err) {
      b.disabled = false;
      ui.aviso(err.message, 'error', 6000);
      return;
    }
    b.disabled = false;
    const items = r.items || [];
    const faltan = r.no_disponibles || [];
    const filas = items.map((i) => {
      const cambioPrecio = Math.abs(i.precio - i.precio_anterior) >= 0.01
        ? `<span class="repetir-cambio">antes ${bs(i.precio_anterior)}</span>` : '';
      const menos = i.cantidad < i.cantidad_anterior ? `<span class="repetir-cambio">solo quedan ${i.cantidad}</span>` : '';
      return `<li><span>${i.cantidad} × ${i.tipo === 'combo' ? '<span class="chip-combo">Combo</span> ' : ''}${esc(i.nombre)} ${menos}</span>
        <span>${bs(i.precio * i.cantidad)} ${cambioPrecio}</span></li>`;
    }).join('');
    const avisoFaltan = faltan.length
      ? `<div class="mensaje mensaje-info" style="margin-top:12px"><strong>No están disponibles hoy:</strong>
          ${faltan.map((f) => `${esc(f.nombre)} (${esc(f.motivo.toLowerCase())})`).join(', ')}.</div>` : '';

    if (!items.length) {
      ui.modal(`<h2 class="modal-titulo">No se puede repetir el pedido #${id}</h2>
        <p class="modal-texto">Ninguno de sus productos está disponible hoy.</p>${avisoFaltan}
        <div class="modal-botones"><button type="button" class="btn btn-oscuro" data-cerrar>Entendido</button></div>`, { clase: 'modal-chico' });
      return;
    }
    const m = ui.modal(`
      <h2 class="modal-titulo">Repetir el pedido #${id}</h2>
      <p class="modal-texto">Se agregarán a tu pedido con los precios de hoy. Podrás cambiar cantidades, notas o quitar algo antes de confirmar.</p>
      <ul class="pedido-items repetir-lista">${filas}</ul>
      ${avisoFaltan}
      <div class="modal-botones">
        <button type="button" class="btn btn-contorno" data-cerrar>Volver</button>
        <button type="button" class="btn btn-oscuro" data-si>Agregar a mi pedido</button>
      </div>`, { clase: 'modal-chico' });
    m.elemento.querySelector('[data-si]').addEventListener('click', () => {
      carrito.cargar(items.map((i) => (i.tipo === 'combo'
        ? { id_producto: -i.id_combo, id_combo: i.id_combo, es_combo: true, nombre: i.nombre, precio: i.precio, stock: i.stock,
            cantidad: i.cantidad, notas: i.notas, categoria: 'Combos', detalle: (i.productos || []).map((p) => p.cantidad + ' × ' + p.nombre).join(' + ') }
        : { id_producto: i.id_producto, nombre: i.nombre, precio: i.precio, stock: i.stock, cantidad: i.cantidad, notas: i.notas, categoria: i.categoria })));
      window.location.href = CFG.RUTAS.pedido;
    });
  }

  // ---------- calificar (HU-09) ----------
  async function calificar(form) {
    const id = Number(form.closest('[data-id]').dataset.id);
    const elegida = form.querySelector('input[type="radio"]:checked');
    if (!elegida) { ui.aviso('Elige de 1 a 5 estrellas.', 'error'); return; }
    const boton = form.querySelector('button[type="submit"]');
    boton.disabled = true;
    try {
      const r = await api.calificar(id, elegida.value, form.querySelector('textarea').value.trim());
      ui.aviso(r.message || '¡Gracias por tu calificación!', 'exito');
      if (document.activeElement) document.activeElement.blur();
      firma = '';
      refrescar();
    } catch (err) {
      boton.disabled = false;
      ui.aviso(err.message, 'error', 6000);
    }
  }

  historial.addEventListener('click', (e) => {
    const b = e.target.closest('[data-repetir]');
    if (b) repetir(b);
  });
  historial.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-calificar]');
    if (!f) return;
    e.preventDefault();
    calificar(f);
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
  refrescar();
  setInterval(refrescar, CFG.REFRESCO_CLIENTE_MS);
})();
