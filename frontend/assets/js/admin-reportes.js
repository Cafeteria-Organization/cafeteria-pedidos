// ============================================================
// Reportes de ventas (solo Admin).
//   GET /api/admin/reportes/ventas?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&agrupar=dia|semana
//   GET /api/admin/reportes/detalle?fecha=AAAA-MM-DD   (lo vendido ese día: hora, notas, cliente)
//   Cuenta los pedidos entregados (recogidos y pagados).
//   Muestra: totales, ventas por día o semana (gráfico + tabla), productos más
//   vendidos con su porcentaje, ventas por categoría y días de la semana con más
//   venta; permite exportar a CSV (Excel) o imprimir / guardar en PDF.
// ============================================================
(function () {
  const { api, ui, iconos } = window.Cafeteria;
  const { esc, bs } = ui;

  if (!ui.exigirSesion(['admin'], 'reportes')) return;
  ui.pintarLayout({ pagina: 'reportes' });
  document.querySelectorAll('[data-icono]').forEach((el) => { el.innerHTML = ui.icono(el.dataset.icono); });

  const form = document.getElementById('filtros-reporte');
  const zonaResumen = document.getElementById('resumen-ventas');
  const zonaGrafico = document.getElementById('grafico-ventas');
  const zonaTabla = document.getElementById('tabla-ventas');
  const zonaTop = document.getElementById('top-productos');
  const zonaCategorias = document.getElementById('por-categoria');
  const zonaDias = document.getElementById('dias-semana');
  const textoDia = document.getElementById('dia-destacado');
  const pct = (n) => String(Number(n).toFixed(1)).replace('.', ',').replace(',0', '') + ' %';
  const titulo = document.getElementById('titulo-periodo');
  const zonaDetalle = document.getElementById('detalle-dia');
  const campoFecha = document.getElementById('d-fecha');
  const campoProducto = document.getElementById('d-producto');
  let reporte = null;
  let detalle = null;
  document.querySelectorAll('[data-icono-flecha]').forEach((el) => { el.innerHTML = ui.ICONOS[el.dataset.iconoFlecha]; });

  const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const aFecha = (t) => new Date(t + 'T12:00:00');
  const corta = (t) => { const d = aFecha(t); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); };
  const larga = (t) => aFecha(t).toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' });
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  function etiqueta(v, agrupar) {
    return agrupar === 'semana' ? `Semana del ${corta(v.periodo)} al ${corta(v.fin)}` : `${DIAS[aFecha(v.periodo).getDay()]} ${corta(v.periodo)}`;
  }

  // ---------- rangos rápidos ----------
  function ponerRango(tipo) {
    const hoy = new Date();
    let desde = new Date(hoy);
    if (tipo === 'hoy') desde = new Date(hoy);
    else if (tipo === '7') desde.setDate(hoy.getDate() - 6);
    else if (tipo === '30') desde.setDate(hoy.getDate() - 29);
    else if (tipo === 'mes') desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    form.desde.value = iso(desde);
    form.hasta.value = iso(hoy);
    form.agrupar.value = tipo === '30' ? 'semana' : 'dia';
    cargar();
  }

  // ---------- carga ----------
  let firma = '';
  async function cargar(silencioso = false) {
    const filtros = { agrupar: form.agrupar.value };
    if (form.desde.value) filtros.desde = form.desde.value;
    if (form.hasta.value) filtros.hasta = form.hasta.value;
    if (!silencioso) zonaGrafico.innerHTML = '<p class="estado-vacio">Generando reporte…</p>';
    try {
      const nuevo = await api.reporteVentas(filtros);
      const nueva = JSON.stringify(nuevo);
      if (silencioso && nueva === firma) return;
      firma = nueva;
      reporte = nuevo;
      form.desde.value = reporte.desde;
      form.hasta.value = reporte.hasta;
      pintar();
      // El detalle muestra el último día del periodo (salvo que ya se eligió uno dentro de él).
      if (!campoFecha.value || campoFecha.value < reporte.desde || campoFecha.value > reporte.hasta) cargarDetalle(reporte.hasta);
    } catch (e) {
      if (silencioso) return;
      reporte = null;
      zonaResumen.innerHTML = '';
      zonaTabla.innerHTML = '';
      zonaTop.innerHTML = '';
      zonaCategorias.innerHTML = '';
      zonaDias.innerHTML = '';
      zonaGrafico.innerHTML = `<p class="estado-vacio"><strong>No se pudo generar el reporte</strong>${esc(e.message)}</p>`;
    }
  }

  // ---------- pintado ----------
  function pintar() {
    const r = reporte;
    const s = r.resumen;
    titulo.textContent = r.desde === r.hasta ? larga(r.desde) : `Del ${larga(r.desde)} al ${larga(r.hasta)}`;

    zonaResumen.innerHTML = `
      <div class="resumen-item"><span>Ventas totales</span><strong>${bs(s.ingresos_totales)}</strong></div>
      <div class="resumen-item"><span>Pedidos entregados</span><strong>${s.pedidos_completados}</strong></div>
      <div class="resumen-item"><span>Unidades vendidas</span><strong>${s.unidades_vendidas}</strong></div>
      <div class="resumen-item"><span>Pedidos cancelados</span><strong>${s.pedidos_cancelados}</strong></div>`;

    pintarGrafico();

    zonaTabla.innerHTML = `<table class="tabla">
      <thead><tr><th>${r.agrupar === 'semana' ? 'Semana' : 'Día'}</th><th class="num">Pedidos</th><th class="num">Ventas</th></tr></thead>
      <tbody>${r.ventas.map((v) => `<tr class="${r.agrupar === 'dia' ? 'fila-dia' : ''}" ${r.agrupar === 'dia' ? `data-ver-dia="${v.periodo}" title="Ver el detalle de este día"` : ''}>
        <td>${esc(etiqueta(v, r.agrupar))}</td><td class="num">${v.pedidos_completados}</td><td class="num">${bs(v.ingresos_totales)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th>Total</th><th class="num">${s.pedidos_completados}</th><th class="num">${bs(s.ingresos_totales)}</th></tr></tfoot></table>`;

    // Más vendidos: barra (unidades) con su porcentaje del total de unidades.
    const maxU = Math.max(1, ...r.top_productos.map((t) => t.unidades));
    zonaTop.innerHTML = r.top_productos.length ? `<ol class="ranking">${r.top_productos.map((t, i) => `
      <li>
        <span class="ranking-pos">${i + 1}</span>
        <div class="ranking-cuerpo">
          <div class="ranking-fila"><strong>${esc(t.nombre)}</strong><span>${t.unidades} u. · ${bs(t.ingresos)}</span></div>
          <div class="barra-pct">
            <div class="ranking-barra" aria-hidden="true"><span style="width:${(t.unidades / maxU) * 100}%"></span></div>
            <b>${pct(t.porcentaje)}</b>
          </div>
        </div>
      </li>`).join('')}</ol>`
      : '<p class="estado-vacio">No hubo ventas entregadas en este periodo.</p>';

    // Por categoría: parte de lo vendido en Bs.
    const cats = r.por_categoria || [];
    const maxC = Math.max(1, ...cats.map((c) => c.ingresos));
    zonaCategorias.innerHTML = cats.length ? `<ul class="lista-pct">${cats.map((c, i) => `
      <li class="${i === 0 ? 'primero' : ''}">
        <span class="lista-pct-icono">${iconos.iconoCategoria(c.categoria)}</span>
        <div class="ranking-cuerpo">
          <div class="ranking-fila"><strong>${esc(c.categoria)}</strong><span>${bs(c.ingresos)} · ${c.unidades} u.</span></div>
          <div class="barra-pct">
            <div class="ranking-barra" aria-hidden="true"><span style="width:${(c.ingresos / maxC) * 100}%"></span></div>
            <b>${pct(c.porcentaje)}</b>
          </div>
        </div>
      </li>`).join('')}</ul>`
      : '<p class="estado-vacio">No hubo ventas entregadas en este periodo.</p>';

    pintarDias();
  }

  // Días de la semana: columnas de lunes a domingo; se resalta el de más venta.
  function pintarDias() {
    const dias = reporte.dias_semana || [];
    const max = Math.max(0, ...dias.map((d) => d.ingresos));
    if (!max) {
      textoDia.textContent = 'Suma de lo vendido cada día de la semana en el periodo elegido.';
      zonaDias.innerHTML = '<p class="estado-vacio">No hubo ventas entregadas en este periodo.</p>';
      return;
    }
    const mejor = dias.find((d) => d.ingresos === max);
    textoDia.innerHTML = `El día que más se vende es el <strong>${esc(mejor.nombre.toLowerCase())}</strong>:
      ${bs(mejor.ingresos)} en ${mejor.pedidos} pedido${mejor.pedidos === 1 ? '' : 's'} (${pct(mejor.porcentaje)} de las ventas).`;
    zonaDias.innerHTML = `<div class="dias-grafico" role="img" aria-label="Ventas por día de la semana; el mejor día es ${esc(mejor.nombre)}">
      ${dias.map((d) => `
        <div class="dia-col ${d.ingresos === max ? 'mejor' : ''}" title="${esc(d.nombre)}: ${bs(d.ingresos)}, ${d.pedidos} pedido(s)">
          <span class="dia-valor">${d.ingresos ? pct(d.porcentaje) : ''}</span>
          <div class="dia-barra" style="height:${(d.ingresos / max) * 100}%"></div>
          <span class="dia-nombre">${esc(d.nombre.slice(0, 3))}</span>
          <small>${d.ingresos ? bs(d.ingresos) : '—'}</small>
        </div>`).join('')}
    </div>`;
  }

  // Gráfico de barras: una serie (ventas en Bs por día o semana).
  function pintarGrafico() {
    const r = reporte;
    const datos = r.ventas;
    if (!datos.length || !datos.some((v) => v.ingresos_totales > 0)) {
      zonaGrafico.innerHTML = '<p class="estado-vacio"><strong>Sin ventas en este periodo</strong>Cuando se entreguen pedidos en estas fechas aparecerán aquí.</p>';
      return;
    }
    const max = Math.max(...datos.map((v) => v.ingresos_totales));
    const tope = escalaBonita(max);
    const iMax = datos.findIndex((v) => v.ingresos_totales === max);
    const muchas = datos.length > 14;
    zonaGrafico.innerHTML = `
      <div class="grafico" role="img" aria-label="Ventas por ${r.agrupar === 'semana' ? 'semana' : 'día'}; la más alta fue ${bs(max)}">
        <div class="grafico-ejes" aria-hidden="true">
          ${[1, 0.5, 0].map((f) => `<div class="grafico-guia" style="bottom:${f * 100}%"><span>${bs(tope * f).replace('Bs ', '')}</span></div>`).join('')}
        </div>
        <div class="grafico-barras">
          ${datos.map((v, i) => `
            <div class="grafico-col" data-i="${i}" tabindex="0" aria-label="${esc(etiqueta(v, r.agrupar))}: ${bs(v.ingresos_totales)}, ${v.pedidos_completados} pedidos">
              <div class="grafico-barra" style="height:${tope ? (v.ingresos_totales / tope) * 100 : 0}%">
                ${i === iMax ? `<span class="grafico-valor">${bs(v.ingresos_totales)}</span>` : ''}
              </div>
              <span class="grafico-x ${muchas && i % Math.ceil(datos.length / 10) ? 'oculta' : ''}">${r.agrupar === 'semana' ? corta(v.periodo) : esc(etiqueta(v, 'dia'))}</span>
            </div>`).join('')}
        </div>
        <div class="grafico-tooltip" hidden></div>
      </div>`;
  }

  function escalaBonita(max) {
    if (max <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p;
    return 10 * p;
  }

  // Tooltip al pasar el mouse (o con el teclado) sobre una barra.
  function mostrarTooltip(col) {
    const tip = zonaGrafico.querySelector('.grafico-tooltip');
    if (!tip || !reporte) return;
    const v = reporte.ventas[Number(col.dataset.i)];
    tip.innerHTML = `<strong>${esc(etiqueta(v, reporte.agrupar))}</strong><span>${bs(v.ingresos_totales)}</span><span>${v.pedidos_completados} pedido(s)</span>`;
    tip.hidden = false;
    const caja = zonaGrafico.querySelector('.grafico').getBoundingClientRect();
    const c = col.getBoundingClientRect();
    const x = Math.min(Math.max(c.left - caja.left + c.width / 2, 70), caja.width - 70);
    tip.style.left = x + 'px';
    zonaGrafico.querySelectorAll('.grafico-col.activa').forEach((el) => el.classList.remove('activa'));
    col.classList.add('activa');
  }
  function ocultarTooltip() {
    const tip = zonaGrafico.querySelector('.grafico-tooltip');
    if (tip) tip.hidden = true;
    zonaGrafico.querySelectorAll('.grafico-col.activa').forEach((el) => el.classList.remove('activa'));
  }
  zonaGrafico.addEventListener('mouseover', (e) => { const c = e.target.closest('.grafico-col'); if (c) mostrarTooltip(c); });
  zonaGrafico.addEventListener('focusin', (e) => { const c = e.target.closest('.grafico-col'); if (c) mostrarTooltip(c); });
  zonaGrafico.addEventListener('mouseleave', ocultarTooltip);
  zonaGrafico.addEventListener('focusout', ocultarTooltip);

  // ---------- detalle de un día ----------
  let firmaDetalle = '';
  async function cargarDetalle(fecha, silencioso = false) {
    campoFecha.value = fecha;
    if (!silencioso) zonaDetalle.innerHTML = '<p class="estado-vacio">Cargando el detalle…</p>';
    try {
      const nuevo = await api.reporteDetalle(fecha);
      const nueva = JSON.stringify(nuevo);
      if (silencioso && nueva === firmaDetalle) return;
      firmaDetalle = nueva;
      detalle = nuevo;
      const elegido = campoProducto.value;
      const nombres = detalle.por_producto.map((p) => p.nombre);
      campoProducto.innerHTML = '<option value="">Todos los productos</option>'
        + nombres.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
      campoProducto.value = nombres.includes(elegido) ? elegido : '';
      pintarDetalle();
    } catch (e) {
      if (silencioso) return;
      detalle = null;
      zonaDetalle.innerHTML = `<p class="estado-vacio"><strong>No se pudo cargar el detalle</strong>${esc(e.message)}</p>`;
    }
  }

  function pintarDetalle() {
    const d = detalle;
    const filtro = campoProducto.value;
    const lineas = d.lineas.filter((l) => !filtro || l.nombre === filtro);
    if (!d.lineas.length) {
      zonaDetalle.innerHTML = `<p class="estado-vacio"><strong>Sin ventas el ${esc(larga(d.fecha))}</strong>Ese día no se entregaron pedidos.</p>`;
      return;
    }
    const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);
    const total = lineas.reduce((s, l) => s + l.subtotal, 0);
    const conNotas = lineas.filter((l) => l.notas).length;
    zonaDetalle.innerHTML = `
      <div class="detalle-resumen">
        <div><span>Día</span><strong>${esc(larga(d.fecha))}</strong></div>
        <div><span>${filtro ? esc(filtro) : 'Pedidos entregados'}</span><strong>${filtro ? unidades + ' u.' : d.resumen.pedidos_completados}</strong></div>
        <div><span>Vendido</span><strong>${bs(total)}</strong></div>
        <div><span>Con notas</span><strong>${conNotas}</strong></div>
      </div>
      ${filtro ? '' : `<div class="detalle-productos">${d.por_producto.map((p) => `
        <button type="button" class="detalle-chip" data-ver-producto="${esc(p.nombre)}" title="Ver solo ${esc(p.nombre)}">
          ${p.tipo === 'combo' ? '<span class="chip-combo">Combo</span>' : ''}<strong>${esc(p.nombre)}</strong>
          <span>${p.unidades} u. · ${bs(p.ingresos)}</span></button>`).join('')}</div>`}
      <div class="tabla-envoltura">
        <table class="tabla tabla-detalle">
          <thead><tr><th>Hora</th><th>N.º pedido</th><th>Cliente</th><th>Producto</th><th class="num">Cant.</th><th>Notas</th><th class="num">Subtotal</th></tr></thead>
          <tbody>${lineas.map((l) => `<tr>
            <td class="det-hora"><strong>${esc(l.hora_pedido || '—')}</strong>${l.hora_entrega ? `<small class="tabla-sub">entregado ${esc(l.hora_entrega)}</small>` : ''}</td>
            <td class="det-pedido"><span class="numero-pedido">#${esc(l.pedido_id)}</span></td>
            <td class="det-cliente">${esc(l.cliente || '—')}</td>
            <td class="det-producto">${l.tipo === 'combo' ? '<span class="chip-combo">Combo</span> ' : ''}${esc(l.nombre)}
              ${l.tipo === 'combo' && l.contenido && l.contenido.length
    ? `<small class="combo-contenido">${l.cantidad > 1 ? 'Cada combo: ' : 'Lleva: '}${ui.contenidoCombo(l.contenido)}</small>` : ''}</td>
            <td class="num det-cantidad">${l.cantidad}</td>
            <td class="det-notas ${l.notas ? '' : 'vacia'}">${l.notas ? `<span class="nota-item">${ui.icono('editar')}${esc(l.notas)}</span>` : '<span class="sin-nota">—</span>'}</td>
            <td class="num det-subtotal">${bs(l.subtotal)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><th colspan="4">Total${filtro ? ' de ' + esc(filtro) : ''}</th><th class="num det-cantidad">${unidades}</th><th class="det-vacia"></th><th class="num">${bs(total)}</th></tr></tfoot>
        </table>
      </div>`;
  }

  function moverDia(dias) {
    const base = aFecha(campoFecha.value || iso(new Date()));
    base.setDate(base.getDate() + dias);
    cargarDetalle(iso(base));
  }

  function exportarDetalle() {
    if (!detalle) return;
    const celda = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const num = (n) => Number(n).toFixed(2).replace('.', ',');
    const filtro = campoProducto.value;
    const filas = [
      ['Detalle de ventas - Cafetería Univalle'], ['Día', detalle.fecha], [],
      ['Hora del pedido', 'Hora de entrega', 'N.º pedido', 'Cliente', 'Tipo', 'Producto', 'Qué lleva (combos)', 'Cantidad', 'Precio unitario (Bs)', 'Subtotal (Bs)', 'Notas'],
      ...detalle.lineas.filter((l) => !filtro || l.nombre === filtro).map((l) => [l.hora_pedido, l.hora_entrega || '', l.pedido_id, l.cliente || '',
        l.tipo === 'combo' ? 'Combo' : 'Producto', l.nombre,
        (l.contenido || []).map((x) => `${x.cantidad} x ${x.nombre}`).join(' + '),
        l.cantidad, num(l.precio_unitario), num(l.subtotal), l.notas || '']),
    ];
    const csv = '\ufeff' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `detalle-ventas_${detalle.fecha}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  campoFecha.addEventListener('change', () => { if (campoFecha.value) cargarDetalle(campoFecha.value); });
  campoProducto.addEventListener('change', () => { if (detalle) pintarDetalle(); });
  document.querySelectorAll('[data-dia]').forEach((b) => b.addEventListener('click', () => moverDia(Number(b.dataset.dia))));
  document.getElementById('exportar-detalle').addEventListener('click', exportarDetalle);
  zonaDetalle.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-ver-producto]');
    if (chip) { campoProducto.value = chip.dataset.verProducto; pintarDetalle(); }
  });
  const irAlDetalle = (fecha) => {
    cargarDetalle(fecha);
    document.getElementById('seccion-detalle').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  zonaTabla.addEventListener('click', (e) => { const f = e.target.closest('[data-ver-dia]'); if (f) irAlDetalle(f.dataset.verDia); });
  zonaGrafico.addEventListener('click', (e) => {
    const col = e.target.closest('.grafico-col');
    if (!col || !reporte || reporte.agrupar !== 'dia') return;
    irAlDetalle(reporte.ventas[Number(col.dataset.i)].periodo);
  });

  // ---------- exportar ----------
  function exportarCsv() {
    if (!reporte) return;
    const r = reporte;
    const celda = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const num = (n) => Number(n).toFixed(2).replace('.', ',');
    const filas = [
      ['Reporte de ventas - Cafetería Univalle'],
      ['Desde', r.desde, 'Hasta', r.hasta],
      [],
      ['Ventas totales (Bs)', num(r.resumen.ingresos_totales)],
      ['Pedidos entregados', r.resumen.pedidos_completados],
      ['Unidades vendidas', r.resumen.unidades_vendidas],
      ['Pedidos cancelados', r.resumen.pedidos_cancelados],
      [],
      [r.agrupar === 'semana' ? 'Semana' : 'Día', 'Pedidos', 'Ventas (Bs)'],
      ...r.ventas.map((v) => [etiqueta(v, r.agrupar), v.pedidos_completados, num(v.ingresos_totales)]),
      [],
      ['Productos más vendidos'],
      ['Puesto', 'Producto', 'Unidades', '% de unidades', 'Ventas (Bs)', 'Pedidos'],
      ...r.top_productos.map((t, i) => [i + 1, t.nombre, t.unidades, num(t.porcentaje), num(t.ingresos), t.pedidos]),
      [],
      ['Ventas por categoría'],
      ['Categoría', 'Ventas (Bs)', '% de ventas', 'Unidades'],
      ...(r.por_categoria || []).map((c) => [c.categoria, num(c.ingresos), num(c.porcentaje), c.unidades]),
      [],
      ['Ventas por día de la semana'],
      ['Día', 'Ventas (Bs)', '% de ventas', 'Pedidos'],
      ...(r.dias_semana || []).map((d) => [d.nombre, num(d.ingresos), num(d.porcentaje), d.pedidos]),
    ];
    // ";" como separador y BOM para que Excel en español lo abra bien.
    const csv = '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-ventas_${r.desde}_a_${r.hasta}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); cargar(); });
  form.agrupar.addEventListener('change', () => cargar());
  document.querySelectorAll('[data-rango]').forEach((b) => b.addEventListener('click', () => ponerRango(b.dataset.rango)));
  document.getElementById('exportar-csv').addEventListener('click', exportarCsv);
  document.getElementById('imprimir').addEventListener('click', () => window.print());

  // Logos de las categorías (si el admin subió alguno) para la lista por categoría.
  api.categorias().then((l) => { iconos.recordarOrden(l); if (reporte) pintar(); }).catch(() => {});
  cargar();
  // Pedidos entregados hace un momento: el reporte se actualiza solo.
  api.alCambiar(() => {
    cargar(true);
    if (campoFecha.value) cargarDetalle(campoFecha.value, true);
  }, { cada: 60000 });
})();
