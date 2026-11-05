// ============================================================
// Campanita de notificaciones del cliente (HU-06 y HU-16).
//   GET   /api/mis-notificaciones           → avisos de "pedido listo" y de retraso
//   PATCH /api/mis-notificaciones/{id}/leer → marcar como leída
// Se agrega sola en la barra superior cuando hay alguien con sesión.
// HU-07: el personal de cocina (Admin y Empleado) recibe aquí el aviso
// cuando un cliente cancela su pedido.
// ============================================================
(function () {
  const { api, ui, sesion } = window.Cafeteria;
  const { esc } = ui;
  if (!sesion.token()) return;

  function icono(n) {
    if (/retraso/i.test(n.titulo)) return '⏱ ';
    if (/cancel|rechaz/i.test(n.titulo)) return '✖ ';
    if (/qué tal|califica/i.test(n.titulo)) return '★ ';
    return '✅ ';
  }
  function tipo(n) {
    if (/cancel|rechaz/i.test(n.titulo)) return 'error';
    return /retraso/i.test(n.titulo) ? 'info' : 'exito';
  }

  const acciones = document.querySelector('.topbar-acciones');
  if (!acciones) return;

  const ICONO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  const caja = document.createElement('div');
  caja.className = 'notif';
  caja.innerHTML = `<button type="button" class="icono-redondo" id="notif-boton" aria-label="Notificaciones" aria-expanded="false">${ICONO}
      <span class="contador-carrito" id="notif-cuenta" hidden>0</span></button>
    <div class="notif-panel" id="notif-panel" hidden>
      <div class="notif-cabecera"><strong>Notificaciones</strong>
        <button type="button" class="enlace-mini" id="notif-todas">Marcar todas como leídas</button></div>
      <div class="notif-lista" id="notif-lista"><p class="notif-vacio">Cargando…</p></div>
    </div>`;
  acciones.insertBefore(caja, acciones.querySelector('.topbar-usuario') || acciones.firstChild);

  const boton = caja.querySelector('#notif-boton');
  const cuenta = caja.querySelector('#notif-cuenta');
  const panel = caja.querySelector('#notif-panel');
  const listaEl = caja.querySelector('#notif-lista');

  let notis = [];
  let vistas = null; // ids ya conocidos (para avisar solo las nuevas)

  function pintar() {
    const sinLeer = notis.filter((n) => !Number(n.leida));
    cuenta.textContent = sinLeer.length;
    cuenta.hidden = sinLeer.length === 0;
    listaEl.innerHTML = notis.length ? notis.slice(0, 15).map((n) => `
      <button type="button" class="notif-item ${Number(n.leida) ? '' : 'sin-leer'}" data-notif="${esc(n.id_notificacion)}">
        <span class="notif-titulo">${icono(n)}${esc(n.titulo)}</span>
        <span class="notif-mensaje">${esc(n.mensaje)}</span>
        <span class="notif-fecha">${esc(ui.hace(n.fecha_envio))}</span>
      </button>`).join('') : '<p class="notif-vacio">No tienes notificaciones.</p>';
  }

  async function cargar() {
    try {
      notis = await api.misNotificaciones();
      const nuevas = vistas ? notis.filter((n) => !vistas.has(n.id_notificacion) && !Number(n.leida)) : [];
      vistas = new Set(notis.map((n) => n.id_notificacion));
      nuevas.forEach((n) => {
        ui.aviso(`${n.titulo}: ${n.mensaje}`, tipo(n), 9000);
        // En cocina, un pedido cancelado debe desaparecer del tablero ya mismo.
        if (/cancel/i.test(n.titulo)) document.dispatchEvent(new CustomEvent('pedido-cancelado'));
        try {
          if ('Notification' in window && Notification.permission === 'granted') new Notification(n.titulo, { body: n.mensaje });
        } catch (e) { /* sin soporte */ }
      });
      pintar();
    } catch (e) { /* si falla, se reintenta en el siguiente ciclo */ }
  }

  async function marcar(ids) {
    await Promise.all(ids.map((id) => api.marcarLeida(id).catch(() => null)));
    notis.forEach((n) => { if (ids.includes(n.id_notificacion)) n.leida = 1; });
    pintar();
  }

  boton.addEventListener('click', () => {
    const abrir = panel.hidden;
    panel.hidden = !abrir;
    boton.setAttribute('aria-expanded', String(abrir));
  });
  caja.querySelector('#notif-todas').addEventListener('click', () =>
    marcar(notis.filter((n) => !Number(n.leida)).map((n) => n.id_notificacion)));
  listaEl.addEventListener('click', (e) => {
    const it = e.target.closest('[data-notif]');
    if (it) marcar([Number(it.dataset.notif)]);
  });
  document.addEventListener('click', (e) => {
    if (!caja.contains(e.target) && !panel.hidden) { panel.hidden = true; boton.setAttribute('aria-expanded', 'false'); }
  });

  cargar();
  // Cocina necesita enterarse rápido de las cancelaciones.
  setInterval(cargar, sesion.esPersonal() ? 8000 : 15000);
})();
