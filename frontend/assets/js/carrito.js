// ============================================================
// "Tu pedido": carrito del cliente y confirmación.
//   - En escritorio se ve siempre al costado del menú y se actualiza al
//     agregar productos; en celular es un panel que se abre desde la
//     barra flotante o el ícono de la bolsa.
//   - Se puede armar sin sesión: recién al confirmar se pide ingresar y,
//     al volver, el pedido sigue ahí listo para confirmar.
//   - HU-03: nota por producto (máx. 255, lo que valida PedidoController).
//   - Confirmar: POST /api/pedidos → id_pedido + codigo_entrega (HU-04 / HU-17).
// ============================================================
(function () {
  const { api, arte, ui, carrito, sesion, pedidosLocales } = window.Cafeteria;
  const { esc, bs, ICONOS } = ui;
  const MAX_NOTA = 255;
  const RUTAS = window.CAFETERIA_CONFIG.RUTAS;

  const layout = document.getElementById('menu-layout');
  const panel = document.getElementById('carrito');
  const fondo = document.getElementById('carrito-fondo');
  const lista = document.getElementById('carrito-lista');
  const pie = document.getElementById('carrito-pie');
  const cuenta = document.getElementById('carrito-cuenta');
  const barra = document.getElementById('barra-pedido');
  if (!panel) return;

  // El personal (Admin/Empleado) no hace pedidos: el menú ocupa todo el ancho.
  if (!ui.puedePedir()) {
    panel.remove();
    if (barra) barra.remove();
    layout.classList.add('sin-carrito');
    return;
  }

  document.getElementById('carrito-cerrar').innerHTML = ICONOS.cerrar;
  const notasAbiertas = new Set();
  let enviando = false;
  let cantidadesPrevias = new Map(carrito.items().map((i) => [i.id_producto, i.cantidad]));

  // ---------- modo lateral (escritorio) o panel (celular) ----------
  function actualizarModo() {
    const lateral = ui.esEscritorio();
    panel.classList.toggle('lateral', lateral);
    if (lateral) cerrar();
    panel.setAttribute('aria-hidden', String(!lateral && !panel.classList.contains('visible')));
    actualizarBarra();
  }

  function abrir() {
    if (ui.esEscritorio()) {
      // Ya está a la vista: se lleva al usuario hasta él y se resalta.
      layout.scrollIntoView({ behavior: 'smooth', block: 'start' });
      panel.classList.remove('resaltar');
      void panel.offsetWidth;
      panel.classList.add('resaltar');
      return;
    }
    panel.classList.add('visible');
    fondo.classList.add('visible');
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sin-scroll');
    actualizarBarra();
    setTimeout(() => document.getElementById('carrito-cerrar').focus(), 60);
  }

  function cerrar() {
    if (!panel.classList.contains('visible')) return;
    panel.classList.remove('visible');
    fondo.classList.remove('visible');
    panel.setAttribute('aria-hidden', String(!ui.esEscritorio()));
    document.body.classList.remove('sin-scroll');
    actualizarBarra();
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-accion="abrir-carrito"]')) abrir();
  });
  fondo.addEventListener('click', cerrar);
  document.getElementById('carrito-cerrar').addEventListener('click', cerrar);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('visible') && !document.querySelector('.modal-fondo')) cerrar();
  });
  window.addEventListener('resize', actualizarModo);

  // Barra flotante (solo celular): resumen de lo que llevas.
  function actualizarBarra() {
    if (!barra) return;
    const n = carrito.unidades();
    barra.hidden = n === 0 || ui.esEscritorio() || panel.classList.contains('visible');
    barra.innerHTML = `${ICONOS.bolsa}<span>Tu pedido · ${n} ${n === 1 ? 'producto' : 'productos'}</span>
      <strong>${bs(carrito.total())}</strong><span class="barra-ver">Ver</span>`;
  }

  // ---------- pintado ----------
  function pintar() {
    const items = carrito.items();
    const n = carrito.unidades();
    cuenta.textContent = n ? `(${n})` : '';

    if (!items.length) {
      lista.innerHTML = `<div class="carrito-vacio">
          ${ICONOS.bolsa}
          <strong>Tu pedido está vacío</strong>
          <span>Toca “Agregar” en cualquier producto y aparecerá aquí.</span>
        </div>`;
      pie.innerHTML = '';
      actualizarBarra();
      return;
    }

    lista.innerHTML = items.map((i, idx) => {
      const abierta = notasAbiertas.has(i.id_producto);
      return `
      <div class="carrito-item" data-id="${i.id_producto}">
        <div class="carrito-mini tono-${(i.id_producto + idx) % 4}">${arte.producto(i.nombre, i.categoria)}</div>
        <div>
          <div class="carrito-fila">
            <span class="carrito-nombre">${esc(i.nombre)}</span>
            <span class="carrito-subtotal">${bs(i.precio * i.cantidad)}</span>
          </div>
          <p class="carrito-unitario">${bs(i.precio)} c/u${i.stock <= 5 ? ` · quedan ${i.stock}` : ''}</p>
          <div class="carrito-controles">
            <div class="cantidad" role="group" aria-label="Cantidad de ${esc(i.nombre)}">
              <button type="button" data-restar aria-label="Quitar uno">−</button>
              <span>${i.cantidad}</span>
              <button type="button" data-sumar aria-label="Agregar uno" ${i.cantidad >= i.stock ? 'disabled' : ''}>+</button>
            </div>
            <button type="button" class="enlace-mini" data-nota>${i.notas ? 'Editar nota' : 'Agregar nota'}</button>
            <button type="button" class="enlace-mini peligro" data-quitar>Quitar</button>
          </div>
          ${abierta ? `
            <div class="nota-campo">
              <label class="solo-lectores" for="nota-${i.id_producto}">Nota para ${esc(i.nombre)}</label>
              <textarea id="nota-${i.id_producto}" maxlength="${MAX_NOTA}" placeholder="Ej.: sin azúcar, leche deslactosada, aderezo aparte…">${esc(i.notas)}</textarea>
              <div class="nota-contador"><span data-contador>${(i.notas || '').length}</span>/${MAX_NOTA}</div>
            </div>`
          : (i.notas ? `<p class="nota-vista">“${esc(i.notas)}”</p>` : '')}
        </div>
      </div>`;
    }).join('');

    let accion;
    if (!sesion.token()) {
      accion = `<a class="btn btn-oscuro btn-bloque" href="${RUTAS.ingresar}?volver=carrito">Ingresar para confirmar</a>
        <p class="carrito-aviso carrito-aviso-centro">¿Aún no tienes cuenta? <a href="${RUTAS.ingresar}?volver=carrito#registro">Créala aquí</a>. Tu pedido no se pierde.</p>`;
    } else {
      accion = `<button type="button" class="btn btn-oscuro btn-bloque" data-confirmar ${enviando ? 'disabled' : ''}>
        ${enviando ? 'Enviando pedido…' : 'Confirmar pedido'}</button>`;
    }

    pie.innerHTML = `
      <div class="carrito-total"><span>Total a pagar</span><strong>${bs(carrito.total())}</strong></div>
      <p class="carrito-aviso">Pagas al recoger con tu código de entrega.</p>
      ${accion}
      <button type="button" class="enlace-mini peligro" data-vaciar style="margin:12px auto 0;display:block">Vaciar pedido</button>`;

    actualizarBarra();
  }

  // Resalta la fila del producto que acaba de agregarse o cambiar.
  function resaltarCambios() {
    const actuales = new Map(carrito.items().map((i) => [i.id_producto, i.cantidad]));
    actuales.forEach((cant, id) => {
      if ((cantidadesPrevias.get(id) || 0) < cant) {
        const fila = lista.querySelector(`.carrito-item[data-id="${id}"]`);
        if (fila) {
          fila.classList.add('recien');
          if (panel.classList.contains('lateral')) fila.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    });
    cantidadesPrevias = actuales;
  }

  document.addEventListener('carrito-cambio', () => {
    pintar();
    resaltarCambios();
  });

  // ---------- acciones dentro del pedido ----------
  panel.addEventListener('click', async (e) => {
    if (e.target.closest('[data-confirmar]')) { confirmarPedido(); return; }
    if (e.target.closest('[data-vaciar]')) {
      if (await ui.confirmar('¿Vaciar tu pedido?', 'Se quitarán todos los productos que agregaste.', { aceptar: 'Vaciar', peligro: true })) {
        notasAbiertas.clear();
        carrito.vaciar();
      }
      return;
    }

    const fila = e.target.closest('.carrito-item');
    if (!fila) return;
    const id = Number(fila.dataset.id);
    const item = carrito.items().find((i) => i.id_producto === id);
    if (!item) return;

    if (e.target.closest('[data-sumar]')) carrito.cambiar(id, { cantidad: Math.min(item.cantidad + 1, item.stock) });
    else if (e.target.closest('[data-restar]')) carrito.cambiar(id, { cantidad: item.cantidad - 1 });
    else if (e.target.closest('[data-quitar]')) { notasAbiertas.delete(id); carrito.quitar(id); }
    else if (e.target.closest('[data-nota]')) {
      if (notasAbiertas.has(id)) notasAbiertas.delete(id); else notasAbiertas.add(id);
      pintar();
      const t = document.getElementById('nota-' + id);
      if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
    }
  });

  panel.addEventListener('input', (e) => {
    if (e.target.tagName !== 'TEXTAREA') return;
    const fila = e.target.closest('.carrito-item');
    const texto = e.target.value.slice(0, MAX_NOTA);
    carrito.nota(Number(fila.dataset.id), texto);
    fila.querySelector('[data-contador]').textContent = texto.length;
  });

  // ---------- confirmar ----------
  async function confirmarPedido() {
    const items = carrito.items();
    if (!items.length || enviando) return;

    enviando = true;
    pintar();
    try {
      const productos = items.map((i) => ({
        id_producto: i.id_producto,
        cantidad: i.cantidad,
        notas: (i.notas || '').trim() || null,
      }));
      const r = await api.crearPedido(productos);

      pedidosLocales.agregar({
        id_pedido: r.id_pedido,
        codigo: r.codigo_entrega,
        total: Number(r.total_pagar),
        estado: r.estado,
        fecha: new Date().toISOString(),
        items: items.map((i) => ({ nombre: i.nombre, cantidad: i.cantidad, precio: i.precio, notas: (i.notas || '').trim() })),
      });

      enviando = false;
      notasAbiertas.clear();
      carrito.vaciar();
      cerrar();
      mostrarComprobante(r);
      document.dispatchEvent(new CustomEvent('menu-recargar'));
    } catch (err) {
      enviando = false;
      pintar();
      ui.aviso(err.message, 'error', 6000);
      // Si fue por stock, el menú y el pedido se actualizan con los datos reales.
      if (err.estado === 400) document.dispatchEvent(new CustomEvent('menu-recargar'));
    }
  }

  function mostrarComprobante(r) {
    ui.modal(`
      <div class="comprobante">
        <div class="comprobante-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg></div>
        <h2 class="modal-titulo" style="padding:0">¡Pedido confirmado!</h2>
        <p class="modal-texto" style="margin:0">Guarda tu código: lo necesitas para recoger tu pedido.</p>
        <div class="comprobante-datos">
          <div class="dato"><span>Pedido</span><strong>#${esc(r.id_pedido)}</strong></div>
          <div class="dato"><span>Total</span><strong>${bs(r.total_pagar)}</strong></div>
          <div class="dato codigo-entrega"><span>Código de entrega</span><strong>${esc(r.codigo_entrega)}</strong></div>
        </div>
        <p class="modal-texto">Estado actual: <span class="badge badge-${esc(String(r.estado).toLowerCase())}">${esc(r.estado)}</span><br>
          Te avisaremos en “Mis pedidos” cuando esté listo.</p>
        <div class="modal-botones" style="justify-content:center">
          <button type="button" class="btn btn-contorno" data-cerrar>Seguir viendo el menú</button>
          <a class="btn btn-oscuro" href="${RUTAS.pedidos}">Ver mis pedidos</a>
        </div>
      </div>`);
  }

  // ---------- inicio ----------
  pintar();
  actualizarModo();

  // Vuelve de ingresar con el pedido armado: se muestra listo para confirmar.
  if (location.hash === '#pedido') {
    history.replaceState(null, '', location.pathname + location.search);
    if (carrito.unidades() && sesion.token()) {
      setTimeout(() => {
        abrir();
        ui.aviso('Ya iniciaste sesión. Revisa tu pedido y confírmalo.', 'exito', 5000);
      }, 400);
    }
  }
})();
