// ============================================================
// "Tu pedido": carrito y confirmación.
//   - En escritorio se ve siempre al costado del menú; en celular es un
//     panel que se abre desde la barra flotante o el ícono de la bolsa.
//   - Se puede armar sin sesión: recién al confirmar se pide ingresar y,
//     al volver, el pedido sigue ahí listo para confirmar.
//   - Cada producto puede llevar una nota ("sin tomate"), que la cocina ve en el ticket.
//   - Confirmar: POST /api/pedidos { productos: [{id, cantidad, notas}], combos: [{id, cantidad, notas}] }.
//     El servidor revisa el stock de todo antes de guardar: si algo ya no
//     alcanza responde 400 con el producto que falta y no se crea nada.
//     Si todo está bien devuelve el código único de recojo.
// ============================================================
(function () {
  const { api, ui, carrito, sesion } = window.Cafeteria;
  const { esc, bs, ICONOS } = ui;
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
  let enviando = false;
  let cantidadesPrevias = new Map(carrito.items().map((i) => [i.clave, i.cantidad]));

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
  function miniatura(i) {
    return `<div class="carrito-mini">${ui.fotoProducto(i)}</div>`;
  }

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

    lista.innerHTML = items.map((i) => `
      <div class="carrito-item" data-clave="${esc(i.clave)}">
        ${miniatura(i)}
        <div>
          <div class="carrito-fila">
            <span class="carrito-nombre">${i.tipo === 'combo' ? '<span class="chip-combo">Combo</span> ' : ''}${esc(i.nombre)}</span>
            <span class="carrito-subtotal">${bs(i.precio * i.cantidad)}</span>
          </div>
          ${i.tipo === 'combo' && i.detalle ? `<p class="carrito-unitario">${esc(i.detalle)}</p>` : ''}
          <p class="carrito-unitario">${bs(i.precio)} c/u${i.max <= 5 ? ` · quedan ${i.max}` : ''}</p>
          <div class="carrito-controles">
            <div class="cantidad" role="group" aria-label="Cantidad de ${esc(i.nombre)}">
              <button type="button" data-restar aria-label="Quitar uno">−</button>
              <span>${i.cantidad}</span>
              <button type="button" data-sumar aria-label="Agregar uno" ${i.cantidad >= i.max ? 'disabled' : ''}>+</button>
            </div>
            <button type="button" class="enlace-mini peligro" data-quitar>Quitar</button>
          </div>
          <label class="carrito-nota">
            <span class="solo-lectores">Nota para ${esc(i.nombre)}</span>
            ${ui.icono('editar')}
            <input type="text" maxlength="200" data-nota value="${esc(i.notas || '')}"
              placeholder="${i.tipo === 'combo' ? 'Nota (opcional): sin hielo, sin azúcar…' : 'Nota (opcional): sin tomate, poco azúcar…'}">
          </label>
        </div>
      </div>`).join('');

    let accion;
    if (!sesion.token()) {
      accion = `<a class="btn btn-oscuro btn-bloque" href="${RUTAS.ingresar}?volver=carrito">Ingresar para confirmar</a>
        <p class="carrito-aviso carrito-aviso-centro">Ingresa con la cuenta que te dio la universidad. Tu pedido no se pierde.</p>`;
    } else {
      accion = `<button type="button" class="btn btn-oscuro btn-bloque" data-confirmar ${enviando ? 'disabled' : ''}>
        ${enviando ? 'Revisando stock y enviando…' : 'Confirmar pedido'}</button>`;
    }

    pie.innerHTML = `
      <div class="carrito-total"><span>Total a pagar</span><strong>${bs(carrito.total())}</strong></div>
      <p class="carrito-aviso">Pagas al recoger, mostrando tu código de recojo.</p>
      ${accion}
      <button type="button" class="enlace-mini peligro" data-vaciar style="margin:12px auto 0;display:block">Vaciar pedido</button>`;

    actualizarBarra();
  }

  // Resalta la fila del producto que acaba de agregarse o cambiar.
  function resaltarCambios() {
    const actuales = new Map(carrito.items().map((i) => [i.clave, i.cantidad]));
    actuales.forEach((cant, clave) => {
      if ((cantidadesPrevias.get(clave) || 0) < cant) {
        const fila = lista.querySelector(`.carrito-item[data-clave="${CSS.escape(clave)}"]`);
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

  // Notas de cada producto: se guardan mientras se escribe.
  lista.addEventListener('input', (e) => {
    const campo = e.target.closest('[data-nota]');
    if (!campo) return;
    carrito.notar(campo.closest('.carrito-item').dataset.clave, campo.value.slice(0, 200));
  });
  lista.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-nota]')) { e.preventDefault(); e.target.blur(); }
  });

  // ---------- acciones dentro del pedido ----------
  panel.addEventListener('click', async (e) => {
    if (e.target.closest('[data-confirmar]')) { confirmarPedido(); return; }
    if (e.target.closest('[data-vaciar]')) {
      if (await ui.confirmar('¿Vaciar tu pedido?', 'Se quitarán todos los productos que agregaste.', { aceptar: 'Sí, vaciar', cancelar: 'No, seguir eligiendo', peligro: true, icono: 'papelera' })) {
        carrito.vaciar();
      }
      return;
    }

    const fila = e.target.closest('.carrito-item');
    if (!fila) return;
    const clave = fila.dataset.clave;
    const item = carrito.items().find((i) => i.clave === clave);
    if (!item) return;

    if (e.target.closest('[data-sumar]')) carrito.cambiar(clave, Math.min(item.cantidad + 1, item.max));
    else if (e.target.closest('[data-restar]')) carrito.cambiar(clave, item.cantidad - 1);
    else if (e.target.closest('[data-quitar]')) carrito.quitar(clave);
  });

  // ---------- confirmar ----------
  async function confirmarPedido() {
    const items = carrito.items();
    if (!items.length || enviando) return;

    enviando = true;
    pintar();
    try {
      const linea = (i) => Object.assign({ id: i.id, cantidad: i.cantidad }, (i.notas || '').trim() ? { notas: i.notas.trim() } : {});
      const productos = items.filter((i) => i.tipo === 'producto').map(linea);
      const combos = items.filter((i) => i.tipo === 'combo').map(linea);
      const r = await api.crearPedido(productos, combos);

      enviando = false;
      carrito.vaciar();
      cerrar();
      ui.comprobante(r);
      document.dispatchEvent(new CustomEvent('menu-recargar'));
    } catch (err) {
      enviando = false;
      pintar();
      // El servidor dice qué producto ya no está disponible o no alcanza.
      ui.aviso(err.message, 'error', 7000);
      if (err.estado === 400 || err.estado === 422) document.dispatchEvent(new CustomEvent('menu-recargar'));
    }
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
