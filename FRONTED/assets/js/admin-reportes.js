// ============================================================
// HU-22 — Reportes de ventas (solo Admin).
//   GET /api/admin/reportes/ventas?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&agrupar=dia|semana
//   Solo cuenta pedidos "Entregado" (recogidos y pagados).
//   Muestra: totales, ventas por día o semana (gráfico + tabla), productos
//   más vendidos, y permite exportar a CSV (Excel) o imprimir / guardar en PDF.
// ============================================================
(function () {
  const { api, ui } = window.Cafeteria;
  const { esc, bs } = ui;

  if (!ui.exigirSesion([1], 'reportes')) return;
  ui.pintarLayout({ pagina: 'reportes' });

  const form = document.getElementById('filtros-reporte');
  const zonaResumen = document.getElementById('resumen-ventas');
  const zonaGrafico = document.getElementById('grafico-ventas');
  const zonaTabla = document.getElementById('tabla-ventas');
  const zonaTop = document.getElementById('top-productos');
  const titulo = document.getElementById('titulo-periodo');
  let reporte = null;

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
  async function cargar() {
    const filtros = { agrupar: form.agrupar.value };
    if (form.desde.value) filtros.desde = form.desde.value;
    if (form.hasta.value) filtros.hasta = form.hasta.value;
    zonaGrafico.innerHTML = '<p class="estado-vacio">Generando reporte…</p>';
    try {
      reporte = await api.reporteVentas(filtros);
      form.desde.value = reporte.desde;
      form.hasta.value = reporte.hasta;
      pintar();
    } catch (e) {
      reporte = null;
      zonaResumen.innerHTML = '';
      zonaTabla.innerHTML = '';
      zonaTop.innerHTML = '';
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
      <div class="resumen-item"><span>Ticket promedio</span><strong>${bs(s.ticket_promedio)}</strong></div>
      <div class="resumen-item"><span>Unidades vendidas</span><strong>${s.unidades_vendidas}</strong></div>
      <div class="resumen-item"><span>Pedidos cancelados</span><strong>${s.pedidos_cancelados}</strong></div>`;

    pintarGrafico();

    zonaTabla.innerHTML = `<table class="tabla">
      <thead><tr><th>${r.agrupar === 'semana' ? 'Semana' : 'Día'}</th><th class="num">Pedidos</th><th class="num">Ventas</th></tr></thead>
      <tbody>${r.ventas.map((v) => `<tr><td>${esc(etiqueta(v, r.agrupar))}</td><td class="num">${v.pedidos_completados}</td><td class="num">${bs(v.ingresos_totales)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th>Total</th><th class="num">${s.pedidos_completados}</th><th class="num">${bs(s.ingresos_totales)}</th></tr></tfoot></table>`;

    const maxU = Math.max(1, ...r.top_productos.map((t) => t.unidades));
    zonaTop.innerHTML = r.top_productos.length ? `<ol class="ranking">${r.top_productos.map((t, i) => `
      <li>
        <span class="ranking-pos">${i + 1}</span>
        <div class="ranking-cuerpo">
          <div class="ranking-fila"><strong>${esc(t.nombre)}</strong><span>${t.unidades} u. · ${bs(t.ingresos)}</span></div>
          <div class="ranking-barra" aria-hidden="true"><span style="width:${(t.unidades / maxU) * 100}%"></span></div>
        </div>
      </li>`).join('')}</ol>`
      : '<p class="estado-vacio">No hubo ventas entregadas en este periodo.</p>';
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
      ['Ticket promedio (Bs)', num(r.resumen.ticket_promedio)],
      ['Unidades vendidas', r.resumen.unidades_vendidas],
      ['Pedidos cancelados', r.resumen.pedidos_cancelados],
      [],
      [r.agrupar === 'semana' ? 'Semana' : 'Día', 'Pedidos', 'Ventas (Bs)'],
      ...r.ventas.map((v) => [etiqueta(v, r.agrupar), v.pedidos_completados, num(v.ingresos_totales)]),
      [],
      ['Productos más vendidos'],
      ['Puesto', 'Producto', 'Unidades', 'Ventas (Bs)', 'Pedidos'],
      ...r.top_productos.map((t, i) => [i + 1, t.nombre, t.unidades, num(t.ingresos), t.pedidos]),
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
  form.agrupar.addEventListener('change', cargar);
  document.querySelectorAll('[data-rango]').forEach((b) => b.addEventListener('click', () => ponerRango(b.dataset.rango)));
  document.getElementById('exportar-csv').addEventListener('click', exportarCsv);
  document.getElementById('imprimir').addEventListener('click', () => window.print());

  cargar();
})();
