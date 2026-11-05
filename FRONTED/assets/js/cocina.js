// ============================================================
// Panel de cocina (Admin y Empleado).
//   HU-13  Lista en vivo de GET /api/pedidos/activos, ordenada por hora
//          de recepción (fecha_pedido ASC), con detalle y notas.
//   HU-05  Aceptar el pedido (Preparando) o rechazarlo (Cancelado).
//   HU-14  Botón para marcar "Listo".
//   HU-16  "Avisar retraso": POST /api/pedidos/{id}/retraso con los minutos;
//          el servidor notifica al cliente y actualiza tiempo_estimado.
//   HU-17  Entregar con POST /api/pedidos/{id}/entregar: el servidor
//          valida el código del cliente (403 si no coincide). El código se
//          escribe o se lee con la cámara desde el QR del cliente.
//   HU-18  Filtro por categoría: GET /api/pedidos/activos?categoria=ID;
//          en cada pedido se muestran solo los productos de esa área.
//   HU-15  Aviso de productos por agotarse e historial de movimientos de stock.
//   HU-19  Marcar Agotado / Reactivar: PATCH /api/admin/productos/{id}/toggle;
//          se muestra quién hizo el último cambio y a qué hora.
// ============================================================
(function () {
  const { api, ui, catalogo, qr, historialStock } = window.Cafeteria;
  const { esc, bs } = ui;
  const CFG = window.CAFETERIA_CONFIG;
  const MINUTOS_DEMORA = 15;
  const ICONO_QR = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h7v-4"/></svg>';
  const STOCK_BAJO = 5;

  if (!ui.exigirSesion([1, 2], 'cocina')) return;
  ui.pintarLayout({ pagina: 'cocina' });

  const tablero = document.getElementById('tablero');
  const punto = document.getElementById('punto-vivo');
  const textoVivo = document.getElementById('texto-vivo');
  const zonaFiltro = document.getElementById('filtro-cocina');
  const alertaStock = document.getElementById('alerta-stock');
  const tablaStock = document.getElementById('tabla-stock');
  const filtroProductos = document.getElementById('filtro-productos');

  let pedidos = [];
  let vistos = null;          // ids ya mostrados (para resaltar los nuevos)
  let firmaAnterior = '';
  let ocupado = false;
  let categoriaFiltro = null; // id de categoría elegida (HU-18)
  let categorias = [];        // [{id, nombre}]
  let productos = { disponibles: [], agotados: [] };
  let cambiosEstado = {};      // id_producto -> último Agotado/Reactivado (HU-19)
  const MINUTOS_RETRASO = [5, 10, 15, 20, 30];

  // HU-16: hora estimada = fecha_pedido + tiempo_estimado (minutos).
  function horaEstimada(p) {
    const f = ui.fecha(p.fecha_pedido);
    if (!f || !p.tiempo_estimado) return null;
    return new Date(f.getTime() + Number(p.tiempo_estimado) * 60000)
      .toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
  }

  // ---------- tickets ----------
  function itemsDelPedido(p) {
    const detalles = p.detalles || [];
    if (categoriaFiltro === null) return { visibles: detalles, ocultos: 0 };
    // HU-18: solo los productos del área elegida.
    const visibles = detalles.filter((d) => d.producto && (d.producto.categorias || [])
      .some((c) => Number(c.id_categoria) === Number(categoriaFiltro)));
    return { visibles, ocultos: detalles.length - visibles.length };
  }

  function ticket(p, nuevo) {
    const minutos = Math.round((Date.now() - (ui.fecha(p.fecha_pedido) || new Date()).getTime()) / 60000);
    const demora = p.estado !== 'Listo' && minutos >= MINUTOS_DEMORA;
    const { visibles, ocultos } = itemsDelPedido(p);
    const items = visibles.map((d) => `
      <li><span><strong>${d.cantidad} ×</strong> ${esc(d.producto ? d.producto.nombre : 'Producto #' + d.id_producto)}
        ${d.notas_personalizacion ? `<span class="nota">Nota: “${esc(d.notas_personalizacion)}”</span>` : ''}</span></li>`).join('');
    const otros = ocultos ? `<p class="ticket-otros">+ ${ocultos} producto(s) de otras áreas</p>` : '';

    const estimada = horaEstimada(p);
    const enCurso = p.estado === 'Pendiente' || p.estado === 'Preparando';
    // HU-11: el pedido nace con su tiempo estimado; HU-16 lo alarga si se avisa retraso.
    const atrasado = estimada && Date.now() > (ui.fecha(p.fecha_pedido) || new Date()).getTime() + Number(p.tiempo_estimado) * 60000;
    const avisado = enCurso && estimada
      ? `<p class="ticket-avisado ${atrasado ? 'atrasado' : ''}">⏱ Listo aprox. a las ${esc(estimada)}${atrasado ? ' · ya pasó la hora' : ''}</p>` : '';
    const botonRetraso = enCurso
      ? `<button type="button" class="btn btn-sm ${(demora && !estimada) || atrasado ? 'btn-peligro-contorno' : 'btn-contorno'} btn-retraso" data-retraso>Avisar retraso</button>`
      : '';

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
        <button type="button" class="btn btn-sm btn-contorno btn-qr" data-escanear title="Escanear el QR del cliente" aria-label="Escanear el QR del cliente del pedido ${p.id_pedido}">${ICONO_QR}</button>
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
        ${otros}
        ${acciones}
        ${botonRetraso ? `<div class="ticket-retraso">${avisado}${botonRetraso}</div>` : ''}
      </article>`;
  }

  function pintar(forzar) {
    const minuto = Math.floor(Date.now() / 60000);
    const firma = minuto + '|' + categoriaFiltro + '|'
      + JSON.stringify(pedidos.map((p) => [p.id_pedido, p.estado, p.total, p.tiempo_estimado, (p.detalles || []).length]));
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
        : `<p class="columna-vacia">${categoriaFiltro !== null ? 'Sin pedidos de esta área.' : (estado === 'Pendiente' ? 'Sin pedidos nuevos por ahora.' : 'Nada por aquí.')}</p>`;
    });
    pedidos.forEach((p) => vistos.add(p.id_pedido));

    Object.entries(escritos).forEach(([id, v]) => { const i = document.getElementById(id); if (i) i.value = v; });
    if (enfocado && document.getElementById(enfocado)) document.getElementById(enfocado).focus();

    if (nuevos.length) ui.aviso(nuevos.length === 1 ? `Nuevo pedido #${nuevos[0]}` : `${nuevos.length} pedidos nuevos`, 'info');
  }

  // ---------- filtro por categoría (HU-18) ----------
  function pintarFiltro() {
    zonaFiltro.innerHTML = '<span class="filtro-etiqueta">Área:</span>'
      + [{ id: null, nombre: 'Todas' }].concat(categorias).map((c) =>
        `<button type="button" class="chip-filtro ${String(categoriaFiltro) === String(c.id) ? 'activo' : ''}"
          data-categoria="${c.id === null ? '' : c.id}" aria-pressed="${String(categoriaFiltro) === String(c.id)}">${esc(c.nombre)}</button>`).join('');
  }

  zonaFiltro.addEventListener('click', (e) => {
    const b = e.target.closest('[data-categoria]');
    if (!b) return;
    categoriaFiltro = b.dataset.categoria === '' ? null : Number(b.dataset.categoria);
    pintarFiltro();
    refrescar(true);
  });

  // ---------- disponibilidad y stock (HU-15 / HU-19) ----------
  function pintarStock() {
    const bajos = productos.disponibles.filter((p) => p.stock <= STOCK_BAJO);
    if (bajos.length) {
      alertaStock.hidden = false;
      alertaStock.innerHTML = `<strong>⚠ ${bajos.length} producto(s) por agotarse:</strong> `
        + bajos.map((p) => `${esc(p.nombre)} (${p.stock === 0 ? 'sin unidades' : 'quedan ' + p.stock})`).join(' · ')
        + '. Márcalos como Agotado si ya no se pueden preparar.';
    } else {
      alertaStock.hidden = true;
    }

    const t = filtroProductos.value.trim().toLowerCase();
    const lista = productos.disponibles.concat(productos.agotados)
      .filter((p) => !t || p.nombre.toLowerCase().includes(t))
      .sort((a, b) => (a.estado === b.estado ? a.nombre.localeCompare(b.nombre, 'es') : a.estado === 'Agotado' ? -1 : 1));
    if (!lista.length) {
      tablaStock.innerHTML = '<p class="estado-vacio">No hay productos que coincidan.</p>';
      return;
    }
    tablaStock.innerHTML = `<table class="tabla">
      <thead><tr><th>Producto</th><th>Categorías</th><th class="num">Stock</th><th>Estado</th><th></th></tr></thead>
      <tbody>${lista.map((p) => {
        const agotado = p.estado === 'Agotado';
        const bajo = !agotado && p.stock <= STOCK_BAJO;
        return `<tr data-producto="${p.id}" data-nombre="${esc(p.nombre)}" data-estado-prod="${p.estado}">
          <td><strong>${esc(p.nombre)}</strong></td>
          <td>${p.categorias.map((c) => `<span class="chip">${esc(c.nombre)}</span>`).join('')}</td>
          <td class="num ${p.stock === 0 ? 'stock-cero' : bajo ? 'stock-bajo' : ''}">${p.stock}</td>
          <td><span class="badge ${agotado ? 'badge-cancelado' : bajo ? 'badge-pendiente' : 'badge-listo'}">${agotado ? 'Agotado' : bajo ? 'Por agotarse' : 'Disponible'}</span>${ultimoCambio(p.id)}</td>
          <td class="tabla-acciones">
            <button type="button" class="btn btn-sm btn-contorno" data-historial>Historial</button>
            ${agotado
            ? '<button type="button" class="btn btn-sm btn-verde" data-alternar>Reactivar</button>'
            : '<button type="button" class="btn btn-sm btn-peligro-contorno" data-alternar>Marcar agotado</button>'}</td>
        </tr>`;
      }).join('')}</tbody></table>`;
  }

  // HU-19: "Agotado por Ana · 17:40" debajo del estado.
  function ultimoCambio(idProducto) {
    const c = cambiosEstado[idProducto];
    if (!c) return '';
    const accion = /agotado/i.test(c.motivo) ? 'Agotado' : 'Reactivado';
    return `<span class="cambio-estado">${accion} por ${esc(c.usuario || 'Sistema')} · ${esc(historialStock.fechaHora(c.fecha_cambio))}</span>`;
  }

  async function cargarProductos() {
    try {
      // GET /admin/productos trae todos los productos, también los Agotados, con su stock real.
      const [todos, movimientos] = await Promise.all([api.productosAdmin(), api.historialStock().catch(() => [])]);
      cambiosEstado = historialStock.ultimosCambiosEstado(movimientos);
      const lista = (todos.data || []).map((p) => ({
        id: p.id_producto, nombre: p.nombre, precio: Number(p.precio), stock: Number(p.stock_actual) || 0,
        categorias: (p.categorias || []).map((c) => ({ id: c.id_categoria, nombre: c.nombre })), estado: p.estado,
      }));
      productos = { disponibles: lista.filter((p) => p.estado !== 'Agotado'), agotados: lista.filter((p) => p.estado === 'Agotado') };
      const mapa = new Map();
      productos.disponibles.concat(productos.agotados).forEach((p) => p.categorias.forEach((c) => mapa.set(c.id, c)));
      const nuevas = [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      if (JSON.stringify(nuevas) !== JSON.stringify(categorias)) { categorias = nuevas; pintarFiltro(); }
      pintarStock();
    } catch (e) {
      tablaStock.innerHTML = `<p class="estado-vacio">${esc(e.message)}</p>`;
    }
  }

  filtroProductos.addEventListener('input', pintarStock);

  document.getElementById('ver-historial').addEventListener('click', () => historialStock.abrir());

  tablaStock.addEventListener('click', async (e) => {
    const h = e.target.closest('[data-historial]');
    if (h) {
      const fila = h.closest('tr');
      historialStock.abrir(Number(fila.dataset.producto), fila.dataset.nombre);
      return;
    }
    const b = e.target.closest('[data-alternar]');
    if (!b) return;
    const fila = b.closest('tr');
    const id = Number(fila.dataset.producto);
    const nombre = fila.dataset.nombre;
    const reactivar = fila.dataset.estadoProd === 'Agotado';
    const ok = await ui.confirmar(reactivar ? `¿Reactivar “${nombre}”?` : `¿Marcar “${nombre}” como agotado?`,
      reactivar ? 'Volverá a aparecer en el menú y se podrá pedir de nuevo.' : 'Dejará de aparecer en el menú hasta que lo reactives.',
      { aceptar: reactivar ? 'Reactivar' : 'Marcar agotado', peligro: !reactivar });
    if (!ok) return;
    b.disabled = true;
    try {
      const r = await api.alternarProducto(id);
      const d = r.data || {};
      const quien = d.cambiado_por ? ` (por ${d.cambiado_por} a las ${historialStock.fechaHora(d.fecha_cambio).split(' · ')[1]})` : '';
      ui.aviso((r.message || 'Producto actualizado.') + quien, 'exito', 4500);
    } catch (err) {
      ui.aviso(err.message, 'error', 6000);
    }
    cargarProductos();
  });

  // ---------- pedidos ----------
  async function refrescar(forzar) {
    try {
      pedidos = await api.pedidosActivos(categoriaFiltro);
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
      const textos = { Preparando: 'en preparación', Listo: 'listo para entregar', Cancelado: 'rechazado' };
      ui.aviso(`Pedido #${id} ${textos[estado]}.`, 'exito', 2500);
    } catch (e) {
      ui.aviso(e.message, 'error', 6000);
      if (boton) boton.disabled = false;
    } finally {
      ocupado = false;
      refrescar(true);
      if (estado === 'Cancelado') cargarProductos();
    }
  }

  // HU-16: el personal elige cuántos minutos más tardará el pedido.
  function elegirMinutos(id) {
    return new Promise((resolver) => {
      let elegido = null;
      let minutos = 10;
      const m = ui.modal(`
        <h2 class="modal-titulo">Avisar retraso · pedido #${id}</h2>
        <p class="modal-texto">¿Cuántos minutos más tardará? El cliente recibe el aviso con la nueva hora estimada.</p>
        <div class="opciones-minutos" role="group" aria-label="Minutos de retraso">
          ${MINUTOS_RETRASO.map((n) => `<button type="button" class="chip-filtro ${n === 10 ? 'activo' : ''}" data-min="${n}" aria-pressed="${n === 10}">+${n} min</button>`).join('')}
        </div>
        <div class="modal-botones">
          <button type="button" class="btn btn-contorno" data-cerrar>Volver</button>
          <button type="button" class="btn btn-oscuro" data-si>Enviar aviso</button>
        </div>`, { clase: 'modal-chico' });
      m.elemento.querySelector('.opciones-minutos').addEventListener('click', (e) => {
        const b = e.target.closest('[data-min]');
        if (!b) return;
        minutos = Number(b.dataset.min);
        m.elemento.querySelectorAll('[data-min]').forEach((x) => {
          x.classList.toggle('activo', x === b);
          x.setAttribute('aria-pressed', String(x === b));
        });
      });
      m.elemento.querySelector('[data-si]').addEventListener('click', () => { elegido = minutos; m.cerrar(); });
      m.elemento.addEventListener('cerrado', () => resolver(elegido));
    });
  }

  // ---------- eventos ----------
  tablero.addEventListener('click', async (e) => {
    const r = e.target.closest('[data-retraso]');
    if (r) {
      const id = Number(r.closest('[data-id]').dataset.id);
      const minutos = await elegirMinutos(id);
      if (!minutos) return;
      r.disabled = true;
      try {
        const res = await api.notificarRetraso(id, minutos);
        const d = res.data || {};
        ui.aviso(`Aviso enviado al cliente del pedido #${id}: +${minutos} min${d.hora_estimada ? ', listo aprox. a las ' + d.hora_estimada : ''}.`, 'exito', 4500);
      } catch (err) {
        ui.aviso(err.message, 'error', 6000);
        r.disabled = false;
      }
      refrescar(true);
      return;
    }

    const q = e.target.closest('[data-escanear]');
    if (q) {
      const form = q.closest('[data-verificar]');
      const id = Number(form.closest('[data-id]').dataset.id);
      const leido = await qr.escanear(`Escanear QR · pedido #${id}`);
      if (!leido) return;
      if (leido.id && leido.id !== id) {
        ui.aviso(`Ese QR es del pedido #${leido.id}, no del #${id}.`, 'error', 5000);
        return;
      }
      const input = form.querySelector('input');
      input.value = leido.codigo;
      form.requestSubmit();
      return;
    }

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

  // HU-17: la verificación del código la hace el servidor.
  tablero.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-verificar]');
    if (!form) return;
    e.preventDefault();
    const id = Number(form.closest('[data-id]').dataset.id);
    const input = form.querySelector('input');
    const boton = form.querySelector('button');
    const codigo = input.value.trim();
    if (!codigo) { input.classList.add('con-error'); input.focus(); return; }
    if (ocupado) return;
    ocupado = true;
    boton.disabled = true;
    try {
      const r = await api.entregarPedido(id, codigo);
      ui.aviso(r.message || `Pedido #${id} entregado.`, 'exito', 3000);
      refrescar(true);
    } catch (err) {
      input.classList.add('con-error');
      ui.aviso(err.estado === 403 ? `El código no coincide con el del pedido #${id}. Pide al cliente que lo revise.` : err.message, 'error', 5000);
      input.select();
      boton.disabled = false;
    } finally {
      ocupado = false;
    }
  });

  tablero.addEventListener('input', (e) => {
    if (e.target.matches('.verificacion input')) e.target.classList.remove('con-error');
  });

  // HU-07: aviso de cancelación (notificaciones.js) → se saca el pedido del tablero y se actualiza el stock.
  document.addEventListener('pedido-cancelado', () => { refrescar(true); cargarProductos(); });

  pintarFiltro();
  cargarProductos();
  refrescar(true);
  setInterval(() => refrescar(false), CFG.REFRESCO_COCINA_MS);
  setInterval(cargarProductos, 30000);
})();
