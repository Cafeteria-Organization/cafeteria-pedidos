// ============================================================
// Panel de cocina y caja (empleado y admin).
//   GET /api/pedidos/activos: pedidos en vivo ordenados por hora de recepción
//       (el más antiguo primero), con su detalle. Se traen todos y el filtro por
//       categoría se aplica aquí, así cada categoría muestra cuántos pedidos tiene
//       (mismo criterio que ?categoria= del servidor).
//   PUT /api/pedidos/{id}/estado: Recibido → En preparación → Listo ("Para entregar"),
//       en ese orden; el servidor guarda la hora.
//   POST /api/pedidos/entregar { codigo }: el servidor valida el código del cliente
//       (escrito o leído del QR), rechaza códigos inválidos o ya usados, solo entrega
//       pedidos Listos y registra quién y a qué hora.
//   Si un pedido Recibido desaparece del panel es porque lo cancelaron: se avisa a la
//   cocina para que no lo prepare.
//   Inventario: alertas, actualizar stock, marcar agotado e historial.
// ============================================================
(function () {
  const { api, ui, qr, inventario, sesion, iconos } = window.Cafeteria;
  const { esc, bs } = ui;
  const CFG = window.CAFETERIA_CONFIG;
  const MINUTOS_DEMORA = 15;
  const COLUMNAS = { Recibido: 'n-recibido', 'En preparación': 'n-preparacion', 'Para entregar': 'n-listo' };

  if (!ui.exigirSesion(['admin', 'empleado'], 'cocina')) return;
  ui.pintarLayout({ pagina: 'cocina' });

  const tablero = document.getElementById('tablero');
  const punto = document.getElementById('punto-vivo');
  const textoVivo = document.getElementById('texto-vivo');
  const zonaFiltro = document.getElementById('filtro-cocina');
  const alertaStock = document.getElementById('alerta-stock');
  const tablaStock = document.getElementById('tabla-stock');
  const filtroProductos = document.getElementById('filtro-productos');
  const formEntrega = document.getElementById('form-entrega');
  document.getElementById('escanear-entrega').innerHTML = ui.ICONOS.qr;

  let todos = [];               // todos los pedidos activos
  let pedidos = [];             // los que se ven con el filtro elegido
  let vistos = null;            // ids ya mostrados (para resaltar los nuevos)
  let estadosAntes = null;      // id -> estado en la consulta anterior
  const tocadosAqui = new Set(); // pedidos que este panel cambió (no avisar como cancelados)
  let firmaAnterior = '';
  let ocupado = false;
  let categoriaFiltro = null;   // nombre de la categoría elegida
  let categorias = [];
  let productos = [];
  let alertasPrevias = null;    // ids en alerta

  // ---------- tickets ----------
  function itemsDelPedido(p) {
    const detalles = p.detalles || [];
    if (categoriaFiltro === null) return { visibles: detalles, ocultos: 0 };
    // Solo los productos del tipo de preparación elegido.
    const visibles = detalles.filter((d) => d.producto && d.producto.categoria === categoriaFiltro);
    return { visibles, ocultos: detalles.length - visibles.length };
  }

  function ticket(p, nuevo) {
    const minutos = Math.round((Date.now() - (ui.fecha(p.created_at) || new Date()).getTime()) / 60000);
    const demora = p.estado !== 'Para entregar' && minutos >= MINUTOS_DEMORA;
    const { visibles, ocultos } = itemsDelPedido(p);
    const items = visibles.map((d) => `
      <li><span><strong>${d.cantidad} ×</strong> ${d.combo_id ? '<span class="chip-combo">Combo</span> ' : ''}${esc(d.nombre)}
        ${d.combo_id && d.contenido && d.contenido.length ? `<small class="combo-contenido">${ui.contenidoCombo(d.contenido)}</small>` : ''}</span>
        ${d.notas ? `<span class="nota-item">${ui.icono('editar')}${esc(d.notas)}</span>` : ''}</li>`).join('');
    const otros = ocultos ? `<p class="ticket-otros">+ ${ocultos} producto(s) de otras categorías</p>` : '';

    let acciones = '';
    if (p.estado === 'Recibido') {
      acciones = `<div class="ticket-acciones">
        <button type="button" class="btn btn-sm btn-peligro-contorno" data-rechazar>Rechazar</button>
        <button type="button" class="btn btn-sm btn-oscuro" data-estado="En preparación">Empezar a preparar</button></div>`;
    } else if (p.estado === 'En preparación') {
      acciones = `<div class="ticket-acciones">
        <button type="button" class="btn btn-sm btn-verde" data-estado="Para entregar">Marcar como listo</button></div>`;
    } else if (p.estado === 'Para entregar') {
      acciones = `<form class="verificacion" data-verificar>
        <label class="solo-lectores" for="codigo-${p.id}">Código del cliente para el pedido ${p.id}</label>
        <input id="codigo-${p.id}" maxlength="10" placeholder="Código" autocomplete="off" spellcheck="false">
        <button type="button" class="btn btn-sm btn-contorno btn-qr" data-escanear title="Escanear el QR del cliente" aria-label="Escanear el QR del cliente del pedido ${p.id}">${ui.ICONOS.qr}</button>
        <button type="submit" class="btn btn-sm btn-oscuro">Entregar</button></form>`;
    }

    const clase = { Recibido: 'pendiente', 'En preparación': 'preparando', 'Para entregar': 'listo' }[p.estado] || '';
    return `
      <article class="ticket ${clase} ${nuevo ? 'nuevo' : ''}" data-id="${p.id}">
        <div class="ticket-cabecera">
          <span class="ticket-numero">#${esc(p.id)}</span>
          <span class="ticket-hora ${demora ? 'demora' : ''}">${ui.hora(p.created_at)}<br>${ui.hace(p.created_at)}</span>
        </div>
        <p class="ticket-codigo">${esc(p.usuario ? p.usuario.name : 'Cliente #' + p.user_id)} · Total ${bs(p.total)}</p>
        <ul class="pedido-items">${items}</ul>
        ${otros}
        ${acciones}
      </article>`;
  }

  function pintar(forzar) {
    const minuto = Math.floor(Date.now() / 60000);
    const firma = minuto + '|' + categoriaFiltro + '|' + JSON.stringify(todos.map((p) => [p.id, p.estado, p.total]));
    if (!forzar && firma === firmaAnterior) return;
    firmaAnterior = firma;

    // Conservar lo que se esté escribiendo en un código de verificación.
    const activo = document.activeElement;
    const enfocado = activo && activo.id && activo.id.startsWith('codigo-') && activo.closest('#tablero') ? activo.id : null;
    const escritos = {};
    tablero.querySelectorAll('.verificacion input').forEach((i) => { if (i.value) escritos[i.id] = i.value; });

    // Los pedidos nuevos se cuentan sobre todos (también los que el filtro oculta).
    const primeraVez = vistos === null;
    if (primeraVez) vistos = new Set();
    const nuevos = primeraVez ? [] : todos.filter((p) => !vistos.has(p.id)).map((p) => p.id);

    Object.keys(COLUMNAS).forEach((estado) => {
      const col = tablero.querySelector(`[data-columna="${estado}"]`);
      const deEstado = pedidos.filter((p) => p.estado === estado);
      col.querySelector('[data-cuenta]').textContent = deEstado.length;
      document.getElementById(COLUMNAS[estado]).textContent = todos.filter((p) => p.estado === estado).length;
      col.querySelector('.columna-lista').innerHTML = deEstado.length
        ? deEstado.map((p) => ticket(p, nuevos.includes(p.id))).join('')
        : `<p class="columna-vacia">${categoriaFiltro !== null ? 'Sin pedidos de esta categoría.' : (estado === 'Recibido' ? 'Sin pedidos nuevos por ahora.' : 'Nada por aquí.')}</p>`;
    });
    todos.forEach((p) => vistos.add(p.id));

    Object.entries(escritos).forEach(([id, v]) => { const i = document.getElementById(id); if (i) i.value = v; });
    if (enfocado && document.getElementById(enfocado)) document.getElementById(enfocado).focus();

    if (nuevos.length) ui.aviso(nuevos.length === 1 ? `Nuevo pedido #${nuevos[0]}` : `${nuevos.length} pedidos nuevos`, 'info');
  }

  // Un pedido "Recibido" que ya no está en el panel fue cancelado.
  function avisarCancelados() {
    const ahora = new Map(todos.map((p) => [p.id, p.estado]));
    if (estadosAntes) {
      estadosAntes.forEach((estado, id) => {
        if (estado === 'Recibido' && !ahora.has(id) && !tocadosAqui.has(id)) {
          ui.aviso(`El pedido #${id} fue cancelado: ya no hay que prepararlo y su stock volvió al inventario.`, 'error', 9000);
          cargarProductos();
        }
      });
    }
    estadosAntes = ahora;
  }

  // ---------- filtro por categoría ----------
  // Un pedido es de la categoría si alguno de sus productos la tiene (un producto puede tener varias).
  const tieneCategoria = (p, c) => (p.detalles || []).some((d) => d.producto && iconos.categoriasDe(d.producto).includes(c));

  function aplicarFiltro() {
    pedidos = categoriaFiltro === null ? todos : todos.filter((p) => tieneCategoria(p, categoriaFiltro));
  }

  // Con muchas categorías no se muestran todas: primero las que tienen pedidos
  // (en el orden del menú), y el resto queda en "Más categorías" con buscador.
  const MAXIMO_VISIBLES = 6;
  let restoFiltro = [];
  let filtroAnterior = '';
  function pintarFiltro() {
    const datos = categorias.map((c) => ({ c, n: todos.filter((p) => tieneCategoria(p, c)).length }));
    let visibles = datos;
    restoFiltro = [];
    if (datos.length > MAXIMO_VISIBLES) {
      const primero = datos.filter((d) => d.n > 0).concat(datos.filter((d) => d.n === 0));
      visibles = primero.slice(0, MAXIMO_VISIBLES - 1);
      restoFiltro = primero.slice(MAXIMO_VISIBLES - 1);
      const elegida = restoFiltro.find((d) => d.c === categoriaFiltro);
      if (elegida) { visibles.push(elegida); restoFiltro = restoFiltro.filter((d) => d !== elegida); }
      visibles = iconos.ordenarCategorias(visibles.map((d) => d.c)).map((c) => visibles.find((d) => d.c === c));
    }
    const conPedidosOcultos = restoFiltro.filter((d) => d.n > 0).length;
    const opcion = (c, icono, nombre, n) => `
      <button type="button" class="filtro-op ${categoriaFiltro === c ? 'activo' : ''} ${n ? '' : 'sin-pedidos'}"
        data-categoria="${c === null ? '' : esc(c)}" aria-pressed="${categoriaFiltro === c}">
        <span class="filtro-op-icono">${icono}</span>
        <span class="filtro-op-texto"><strong>${esc(nombre)}</strong><small>${n ? `${n} pedido${n === 1 ? '' : 's'}` : 'sin pedidos'}</small></span>
      </button>`;
    const html = `<p class="filtro-titulo">${ui.icono('filtro')}Ver pedidos de</p>
      <div class="filtro-opciones">
        ${opcion(null, ui.icono('recibo'), 'Todo', todos.length)}
        ${visibles.map((d) => opcion(d.c, iconos.iconoCategoria(d.c), d.c, d.n)).join('')}
        ${restoFiltro.length ? `<button type="button" class="filtro-op filtro-mas" data-mas aria-expanded="false">
          <span class="filtro-op-icono">${ui.icono('mas')}</span>
          <span class="filtro-op-texto"><strong>Ver ${restoFiltro.length} categoría${restoFiltro.length === 1 ? '' : 's'} más</strong>
          <small>${conPedidosOcultos ? `${conPedidosOcultos} con pedidos` : 'Toca para buscar'}</small></span>
          <span class="mas-flecha">${ui.icono('abajo')}</span></button>` : ''}
      </div>`;
    if (html !== filtroAnterior) { zonaFiltro.innerHTML = html; filtroAnterior = html; }
  }

  function elegirCategoria(elegida) {
    categoriaFiltro = categoriaFiltro === elegida ? null : elegida;
    aplicarFiltro();
    pintarFiltro();
    pintar(true);
  }

  zonaFiltro.addEventListener('click', (e) => {
    const mas = e.target.closest('[data-mas]');
    if (mas) {
      ui.desplegable(mas, restoFiltro.map((d) => ({
        id: d.c, nombre: d.c, icono: iconos.iconoCategoria(d.c),
        detalle: d.n ? `${d.n} pedido${d.n === 1 ? '' : 's'}` : 'sin pedidos',
      })), { titulo: 'Más categorías', elegida: categoriaFiltro, alElegir: elegirCategoria });
      return;
    }
    const b = e.target.closest('[data-categoria]');
    if (b) elegirCategoria(b.dataset.categoria === '' ? null : b.dataset.categoria);
  });

  // ---------- inventario ----------
  function pintarStock() {
    const t = filtroProductos.value.trim().toLowerCase();
    const lista = productos
      .filter((p) => !t || (p.nombre + ' ' + p.categorias.join(' ')).toLowerCase().includes(t))
      .sort((a, b) => {
        const peso = (p) => (!p.disponible ? 0 : p.stock <= p.stockMinimo ? 1 : 2);
        return peso(a) - peso(b) || a.nombre.localeCompare(b.nombre, 'es');
      });
    if (!lista.length) {
      tablaStock.innerHTML = '<p class="estado-vacio">No hay productos que coincidan.</p>';
      return;
    }
    // En celular cada fila se ve como una tarjeta (ver .tabla-inventario en app.css).
    tablaStock.innerHTML = `<table class="tabla tabla-inventario">
      <thead><tr><th>Producto</th><th>Categoría</th><th class="num">Stock</th><th class="num">Mínimo</th><th>Estado</th><th></th></tr></thead>
      <tbody>${lista.map((p, i) => {
        const bajo = p.disponible && p.stock <= p.stockMinimo;
        let habilitar = '';
        if (!p.disponible && p.stock > 0) {
          habilitar = sesion.esAdmin()
            ? `<button type="button" class="accion exito" data-reactivar>${ui.icono('play')}Volver al menú</button>`
            : '<span class="campo-ayuda">Lo vuelve a poner el admin</span>';
        }
        return `<tr data-producto="${p.id}">
          <td class="inv-producto"><div class="tabla-producto">
            <div class="carrito-mini ${p.disponible ? '' : 'apagado'}">${ui.fotoProducto(p)}</div>
            <div><strong>${esc(p.nombre)}</strong>${p.recordado ? '<small>No aparece en el menú</small>' : ''}</div>
          </div></td>
          <td class="inv-categorias">${p.categorias.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</td>
          <td class="num inv-stock ${p.stock === 0 ? 'stock-cero' : bajo ? 'stock-bajo' : ''}" data-etiqueta="Stock">${p.stock}</td>
          <td class="num inv-minimo" data-etiqueta="Mínimo">${p.stockMinimo}</td>
          <td class="inv-estado">${inventario.estado(p)}</td>
          <td class="tabla-acciones inv-acciones">
            <button type="button" class="accion" data-movimientos>${ui.icono('reloj')}Historial</button>
            <button type="button" class="accion principal" data-reponer>${ui.icono('caja')}Actualizar stock</button>
            ${p.disponible ? `<button type="button" class="accion peligro" data-agotar>${ui.icono('pausa')}Marcar agotado</button>` : habilitar}
          </td>
        </tr>`;
      }).join('')}</tbody></table>`;
  }

  // Alertas de stock: aviso fijo arriba y un aviso emergente cuando entra un producto nuevo.
  async function revisarAlertas() {
    try {
      const alertas = await api.alertas();
      if (alertas.length) {
        alertaStock.hidden = false;
        const agotados = alertas.filter((a) => a.alerta === 'agotado');
        const bajos = alertas.filter((a) => a.alerta !== 'agotado');
        alertaStock.innerHTML = '<strong>Atención con el stock:</strong> '
          + [agotados.length ? `agotado${agotados.length === 1 ? '' : 's'}: ${agotados.map((p) => esc(p.nombre)).join(', ')}` : '',
            bajos.length ? `por agotarse: ${bajos.map((p) => `${esc(p.nombre)} (quedan ${p.stock})`).join(', ')}` : '']
            .filter(Boolean).join(' · ') + '.';
      } else {
        alertaStock.hidden = true;
      }
      const ids = new Set(alertas.map((a) => a.id));
      if (alertasPrevias) {
        alertas.filter((a) => !alertasPrevias.has(a.id)).forEach((a) => {
          ui.aviso(a.alerta === 'agotado' ? `${a.nombre} se agotó.` : `${a.nombre} está por agotarse: quedan ${a.stock}.`, 'error', 7000);
        });
      }
      alertasPrevias = ids;
    } catch (e) { /* se reintenta en la próxima vuelta */ }
  }

  async function cargarProductos() {
    try {
      productos = await inventario.productos();
      // Mismo orden que el menú (config.js); las demás categorías van al final.
      // Todas las categorías de los productos (un producto puede tener varias), en el orden del menú.
      iconos.recordarOrden(await api.categorias().catch(() => []));
      const nuevas = iconos.ordenarCategorias([...new Set(productos.flatMap((p) => iconos.categoriasDe(p)))]);
      if (JSON.stringify(nuevas) !== JSON.stringify(categorias)) { categorias = nuevas; pintarFiltro(); }
      pintarStock();
    } catch (e) {
      tablaStock.innerHTML = `<p class="estado-vacio">${esc(e.message)}</p>`;
    }
    revisarAlertas();
  }

  filtroProductos.addEventListener('input', pintarStock);

  tablaStock.addEventListener('click', async (e) => {
    const fila = e.target.closest('tr[data-producto]');
    if (!fila) return;
    const p = productos.find((x) => x.id === Number(fila.dataset.producto));
    if (!p) return;
    if (e.target.closest('[data-movimientos]')) { inventario.abrirMovimientos(p); return; }
    if (e.target.closest('[data-reponer]')) { if (await inventario.reponer(p)) cargarProductos(); return; }
    if (e.target.closest('[data-agotar]')) { if (await inventario.agotar(p)) cargarProductos(); return; }
    if (e.target.closest('[data-reactivar]')) { if (await inventario.reactivar(p)) cargarProductos(); }
  });

  // ---------- pedidos ----------
  async function refrescar(forzar) {
    try {
      todos = await api.pedidosActivos();
      aplicarFiltro();
      punto.classList.remove('caido');
      textoVivo.textContent = 'En vivo · ' + new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      avisarCancelados();
      pintarFiltro();
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
    tocadosAqui.add(id);
    try {
      await api.cambiarEstado(id, estado);
      ui.aviso(`Pedido #${id} ${estado === 'Para entregar' ? 'listo para entregar: el cliente ya lo ve.' : 'en preparación.'}`, 'exito', 3000);
    } catch (e) {
      // 409 si otra persona ya lo movió o si se intenta saltar un paso.
      ui.aviso(e.message, 'error', 6000);
      if (boton) boton.disabled = false;
    } finally {
      ocupado = false;
      refrescar(true);
    }
  }

  // Entrega con el código. Devuelve true si se entregó.
  async function entregar(codigo, input, boton) {
    if (ocupado) return false;
    ocupado = true;
    if (boton) boton.disabled = true;
    try {
      const r = await api.entregar(codigo);
      tocadosAqui.add(r.pedido.id);
      const local = todos.find((p) => p.id === r.pedido.id);
      const nombre = local && local.usuario ? local.usuario.name : 'su dueño';
      ui.aviso(`Pedido #${r.pedido.id} entregado a ${nombre} (registrado a las ${ui.hora(r.pedido.entregado_at)}).`, 'exito', 5000);
      refrescar(true);
      return true;
    } catch (err) {
      if (input) { input.classList.add('con-error'); input.select(); }
      ui.aviso(err.estado === 404 ? `El código ${codigo} no existe o ya se usó. Pide al cliente que lo revise.` : err.message, 'error', 6000);
      return false;
    } finally {
      ocupado = false;
      if (boton) boton.disabled = false;
    }
  }

  // ---------- eventos del tablero ----------
  tablero.addEventListener('click', async (e) => {
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
      form.querySelector('input').value = leido.codigo;
      form.requestSubmit();
      return;
    }

    const r = e.target.closest('[data-rechazar]');
    if (r) {
      const id = Number(r.closest('[data-id]').dataset.id);
      const ok = await ui.confirmar(`¿Rechazar el pedido #${id}?`,
        'Úsalo solo si no se puede preparar. El cliente lo verá como cancelado y las unidades vuelven al stock.',
        { aceptar: 'Sí, rechazar', cancelar: 'No, seguir', peligro: true, icono: 'recibo' });
      if (!ok) return;
      r.disabled = true;
      tocadosAqui.add(id);
      try {
        await api.cancelarPedido(id);
        ui.aviso(`Pedido #${id} rechazado. El stock volvió al inventario.`, 'exito', 4000);
      } catch (err) {
        ui.aviso(err.message, 'error', 6000);
      }
      refrescar(true);
      cargarProductos();
      return;
    }

    const b = e.target.closest('[data-estado]');
    if (!b) return;
    cambiar(Number(b.closest('[data-id]').dataset.id), b.dataset.estado, b);
  });

  // Entrega desde la tarjeta del pedido: el código debe ser el de ESE pedido.
  tablero.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-verificar]');
    if (!form) return;
    e.preventDefault();
    const id = Number(form.closest('[data-id]').dataset.id);
    const input = form.querySelector('input');
    const codigo = input.value.trim().toUpperCase();
    if (!codigo) { input.classList.add('con-error'); input.focus(); return; }
    const pedido = pedidos.find((p) => p.id === id);
    if (pedido && pedido.codigo && pedido.codigo !== codigo) {
      input.classList.add('con-error');
      input.select();
      ui.aviso(`El código no corresponde al pedido #${id}. Pide al cliente que lo revise.`, 'error', 5000);
      return;
    }
    entregar(codigo, input, form.querySelector('button[type="submit"]'));
  });

  tablero.addEventListener('input', (e) => {
    if (e.target.matches('.verificacion input')) e.target.classList.remove('con-error');
  });

  // Entrega rápida (caja): el cliente dicta o muestra su código.
  const inputEntrega = document.getElementById('codigo-entrega');
  formEntrega.addEventListener('submit', async (e) => {
    e.preventDefault();
    const codigo = inputEntrega.value.trim().toUpperCase();
    if (!codigo) { inputEntrega.classList.add('con-error'); inputEntrega.focus(); return; }
    if (await entregar(codigo, inputEntrega, formEntrega.querySelector('button[type="submit"]'))) inputEntrega.value = '';
  });
  inputEntrega.addEventListener('input', () => inputEntrega.classList.remove('con-error'));
  document.getElementById('escanear-entrega').addEventListener('click', async () => {
    const leido = await qr.escanear('Escanear el QR del cliente');
    if (!leido) return;
    inputEntrega.value = leido.codigo;
    formEntrega.requestSubmit();
  });

  pintarFiltro();
  cargarProductos();
  refrescar(true);
  setInterval(() => refrescar(false), CFG.REFRESCO_COCINA_MS);
  setInterval(cargarProductos, CFG.REFRESCO_INVENTARIO_MS);
  // Si en otra pestaña se cambió algo (un pedido nuevo, stock, productos) se ve al instante.
  api.alCambiar(() => { refrescar(false); cargarProductos(); }, { cada: 0 });
})();
