// ============================================================
// Control de stock en tiempo real (empleados y admin).
//   GET   /api/inventario/alertas            productos agotados o con stock <= stock mínimo
//   PATCH /api/productos/{id}/stock           { agregar } suma unidades · { stock } fija el valor
//   PATCH /api/productos/{id}/agotado         marca el producto como Agotado
//   GET   /api/productos/{id}/movimientos     historial de movimientos de stock
//   PATCH /api/admin/productos/{id}/toggle    (solo admin) Disponible ⇄ Agotado
// El servidor descuenta el stock al confirmar cada pedido, lo devuelve al
// cancelar y marca Agotado cuando llega a 0 (vuelve al menú al reponer).
// ============================================================
(function () {
  const { api, ui, sesion, almacen, iconos } = window.Cafeteria;
  const { esc } = ui;
  const CLAVE_CATALOGO = 'cafeteria6.catalogo';

  function normalizar(p) {
    return {
      id: p.id, nombre: p.nombre, categoria: p.categoria || 'Otros', precio: Number(p.precio),
      categorias: iconos.categoriasDe(p).length ? iconos.categoriasDe(p) : ['Otros'],
      eliminado: p.deleted_at || null,
      descripcion: p.descripcion || '', stock: Number(p.stock) || 0, stockMinimo: Number(p.stock_minimo) || 0,
      disponible: Boolean(p.disponible), imagen: p.imagen_url || null,
    };
  }

  // Lista de productos para el panel de stock.
  //   Admin: GET /admin/productos (todos, también los agotados).
  //   Empleado: no tiene esa ruta, así que se juntan el menú (disponibles) y las
  //   alertas (agotados o por agotarse). Los que no aparecen en ninguna (agotados
  //   a mano con stock suficiente) se recuerdan de visitas anteriores.
  async function productos() {
    if (sesion.esAdmin()) return (await api.productosAdmin()).map(normalizar);

    const [menu, alertas] = await Promise.all([api.menu(), api.alertas()]);
    const vistos = new Map();
    menu.concat(alertas).forEach((p) => vistos.set(p.id, normalizar(p)));
    const catalogo = almacen.leer(CLAVE_CATALOGO, {});
    Object.values(catalogo).forEach((p) => {
      if (!vistos.has(p.id)) {
        vistos.set(p.id, Object.assign({}, p, { disponible: false, recordado: true, categorias: p.categorias || [p.categoria || 'Otros'] }));
      }
    });
    // De esos "recordados" el stock real sale del último movimiento registrado.
    await Promise.all([...vistos.values()].filter((p) => p.recordado).map(async (p) => {
      try {
        const movs = await api.movimientos(p.id);
        if (movs.length) p.stock = Number(movs[0].stock_resultante) || 0;
      } catch (e) {
        if (e.estado === 404) vistos.delete(p.id);   // el admin lo eliminó
      }
    }));
    const lista = [...vistos.values()];
    almacen.guardar(CLAVE_CATALOGO, Object.fromEntries(lista.map((p) => [p.id, Object.assign({}, p, { recordado: undefined })])));
    return lista;
  }

  const unidades = (n) => `${n} ${Math.abs(n) === 1 ? 'unidad' : 'unidades'}`;

  // ---------- historial de movimientos ----------
  const TIPOS = {
    inicial: { texto: 'Stock inicial', clase: 'entrada', icono: 'estrella' },
    pedido: { texto: 'Venta', clase: 'salida', icono: 'recibo' },
    cancelacion: { texto: 'Devolución por pedido cancelado', clase: 'entrada', icono: 'deshacer' },
    reposicion: { texto: 'Se sumaron unidades', clase: 'entrada', icono: 'caja' },
    ajuste: { texto: 'Cantidad corregida', clase: 'ajuste', icono: 'editar' },
    estado: { texto: 'Cambio en el menú', clase: 'evento', icono: 'pausa' },
    edicion: { texto: 'Datos editados', clase: 'evento', icono: 'editar' },
    eliminado: { texto: 'Producto eliminado', clase: 'salida', icono: 'papelera' },
    restaurado: { texto: 'Producto restaurado', clase: 'entrada', icono: 'deshacer' },
  };
  const ROLES = { admin: 'Admin', empleado: 'Empleado', estudiante: 'Cliente' };

  // Quién hizo el movimiento: nombre y rol (el servidor lo manda en "usuario").
  function quien(m) {
    const yo = sesion.usuario();
    if (!m.user_id) return 'Sistema';
    const u = m.usuario;
    const nombre = u ? esc(u.name) : '#' + esc(m.user_id);
    const rol = u && ROLES[u.rol] ? ` <span class="mov-rol">${ROLES[u.rol]}</span>` : '';
    return (yo && Number(yo.id) === Number(m.user_id) ? `${nombre} (tú)` : nombre) + rol;
  }

  function dia(valor) {
    const d = ui.fecha(valor);
    if (!d) return '—';
    const hoy = new Date();
    const ayer = new Date(Date.now() - 86400000);
    if (d.toDateString() === hoy.toDateString()) return 'Hoy';
    if (d.toDateString() === ayer.toDateString()) return 'Ayer';
    return d.toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  // Acepta el producto completo (o su id y nombre).
  async function abrirMovimientos(producto, nombreSuelto) {
    const p = typeof producto === 'object' ? producto : { id: producto, nombre: nombreSuelto };
    const m = ui.modal(`
      <h2 class="modal-titulo">Historial de ${esc(p.nombre)}</h2>
      <p class="modal-texto" style="margin-bottom:18px">Todo lo que entró, salió o cambió en este producto y quién lo hizo, del más reciente al más antiguo.</p>
      <div data-historial><p class="estado-vacio">Cargando…</p></div>`, { clase: 'modal-ancho', icono: 'reloj' });
    const zona = m.elemento.querySelector('[data-historial]');
    try {
      const lista = await api.movimientos(p.id);
      if (!lista.length) { zona.innerHTML = '<p class="estado-vacio">Todavía no hay movimientos registrados.</p>'; return; }

      const vendidas = lista.filter((h) => h.tipo === 'pedido').reduce((s, h) => s - Number(h.cantidad), 0);
      const entraron = lista.filter((h) => Number(h.cantidad) > 0 && h.tipo !== 'ajuste').reduce((s, h) => s + Number(h.cantidad), 0);
      const actual = p.stock !== undefined ? p.stock : Number(lista[0].stock_resultante);

      let diaAnterior = '';
      const filas = lista.map((h) => {
        const t = TIPOS[h.tipo] || { texto: h.tipo, clase: 'ajuste', icono: 'editar' };
        const c = Number(h.cantidad);
        const d = dia(h.created_at);
        const cabecera = d !== diaAnterior ? `<li class="mov-dia">${esc(d)}</li>` : '';
        diaAnterior = d;
        return `${cabecera}
          <li class="mov-item ${t.clase}">
            <span class="mov-icono">${ui.icono(t.icono)}</span>
            <div class="mov-texto">
              <strong>${esc(t.texto)}${h.pedido_id ? ` · pedido #${esc(h.pedido_id)}` : ''}</strong>
              <small>${ui.hora(h.created_at)} · <span class="mov-quien">${ui.icono('usuario')}${quien(h)}</span></small>
              ${h.motivo ? `<em>“${esc(h.motivo)}”</em>` : ''}
            </div>
            <div class="mov-cambio">
              ${c !== 0 ? `<strong class="${c < 0 ? 'menos' : 'mas'}">${c > 0 ? '+' : ''}${c}</strong>` : ''}
              <small>${c !== 0 ? 'quedan' : 'había'} ${esc(h.stock_resultante)}</small>
            </div>
          </li>`;
      }).join('');

      zona.innerHTML = `
        <div class="mov-resumen">
          <div><span>Hay ahora</span><strong>${unidades(actual)}</strong></div>
          <div class="salida"><span>Vendidas</span><strong>${unidades(vendidas)}</strong></div>
          <div class="entrada"><span>Ingresaron</span><strong>${unidades(entraron)}</strong></div>
        </div>
        <ol class="linea-tiempo">${filas}</ol>`;
    } catch (e) {
      zona.innerHTML = `<p class="estado-vacio">${esc(e.message)}</p>`;
    }
  }

  // ---------- actualizar el stock ----------
  // Dos casos fáciles de entender: "sumar unidades" (llegó mercadería) o
  // "corregir la cantidad" (se contó y el número real es otro).
  // Devuelve el producto actualizado, o null si se cerró sin guardar.
  const MOTIVOS = {
    agregar: ['Llegó del proveedor', 'Se preparó más', 'Sobró de otro turno'],
    fijar: ['Conteo de inventario', 'Producto dañado o vencido', 'Error al registrar'],
  };

  function reponer(p) {
    return new Promise((resolver) => {
      let resultado = null;
      const m = ui.modal(`
        <div class="stock-cabecera">
          <div class="stock-foto">${ui.fotoProducto(p)}</div>
          <div>
            <h2 class="modal-titulo" style="margin-bottom:4px">Stock de ${esc(p.nombre)}</h2>
            <p class="stock-actual">Hay <strong>${unidades(p.stock)}</strong> ${estado(p)}</p>
          </div>
        </div>
        <form class="formulario" data-reponer novalidate>
          <div class="mensaje" data-msg hidden></div>
          <p class="paso-titulo">¿Qué pasó?</p>
          <div class="opciones-grandes" role="radiogroup" aria-label="Tipo de cambio">
            <label class="opcion-grande"><input type="radio" name="modo" value="agregar" checked>
              <span class="opcion-icono">${ui.icono('caja')}</span>
              <span class="opcion-texto"><strong>Llegaron más unidades</strong><small>Se suman a las que ya hay.</small></span></label>
            <label class="opcion-grande"><input type="radio" name="modo" value="fijar">
              <span class="opcion-icono">${ui.icono('editar')}</span>
              <span class="opcion-texto"><strong>Corregir la cantidad</strong><small>Contaste y hay otro número.</small></span></label>
          </div>

          <label class="paso-titulo" for="inv-cantidad" data-etiqueta>¿Cuántas unidades llegaron?</label>
          <div class="contador-stock">
            <button type="button" class="contador-boton" data-paso="-1" aria-label="Una menos">${ui.icono('menos')}</button>
            <input id="inv-cantidad" name="cantidad" type="number" min="0" max="100000" step="1" inputmode="numeric" placeholder="0" autofocus>
            <button type="button" class="contador-boton" data-paso="1" aria-label="Una más">${ui.icono('mas')}</button>
            <div class="atajos" data-atajos>
              <button type="button" data-sumar="5">+5</button><button type="button" data-sumar="10">+10</button><button type="button" data-sumar="20">+20</button>
            </div>
          </div>
          <div class="stock-resultado" data-resultado></div>

          <div class="campo">
            <label for="inv-motivo">Motivo <span class="opcional">(opcional)</span></label>
            <div class="motivos" data-motivos></div>
            <input id="inv-motivo" name="motivo" maxlength="150" placeholder="O escribe otro motivo">
          </div>
          <div class="modal-botones" style="margin-top:8px">
            <button type="button" class="btn btn-contorno" data-cerrar>Cancelar</button>
            <button type="submit" class="btn btn-oscuro" data-guardar>Guardar</button>
          </div>
        </form>`, { clase: 'modal-stock', icono: 'caja' });

      const form = m.elemento.querySelector('[data-reponer]');
      const msg = form.querySelector('[data-msg]');
      const etiqueta = form.querySelector('[data-etiqueta]');
      const atajos = form.querySelector('[data-atajos]');
      const resultadoEl = form.querySelector('[data-resultado]');
      const motivosEl = form.querySelector('[data-motivos]');
      const guardar = form.querySelector('[data-guardar]');

      const modo = () => form.modo.value;
      const valor = () => (form.cantidad.value === '' ? null : Number(form.cantidad.value));

      function pintarMotivos() {
        motivosEl.innerHTML = MOTIVOS[modo()].map((t) =>
          `<button type="button" class="motivo ${form.motivo.value === t ? 'activo' : ''}" data-motivo="${esc(t)}">${esc(t)}</button>`).join('');
      }

      function actualizar() {
        const fijar = modo() === 'fijar';
        etiqueta.textContent = fijar ? '¿Cuántas unidades hay realmente?' : '¿Cuántas unidades llegaron?';
        atajos.hidden = fijar;
        const n = valor();
        const valido = n !== null && Number.isInteger(n) && n >= (fijar ? 0 : 1) && n <= 100000;
        if (!valido) {
          resultadoEl.className = 'stock-resultado vacio';
          resultadoEl.innerHTML = fijar ? 'Escribe la cantidad que contaste.' : 'Escribe cuántas unidades llegaron.';
          guardar.textContent = 'Guardar';
          return;
        }
        const final = fijar ? n : p.stock + n;
        let nota = '';
        if (final === 0) nota = 'Quedará <strong>agotado</strong> y saldrá del menú.';
        else if (p.stock === 0) nota = 'Volverá a aparecer en el menú.';
        else if (final <= p.stockMinimo) nota = `Sigue bajo: el aviso salta con ${p.stockMinimo} o menos.`;
        resultadoEl.className = 'stock-resultado' + (final === 0 ? ' cero' : final <= p.stockMinimo ? ' bajo' : ' ok');
        resultadoEl.innerHTML = `<span>Ahora <strong>${p.stock}</strong></span>
          <span class="flecha-resultado">${ui.ICONOS.der}</span>
          <span>Quedarán <strong>${final}</strong></span>${nota ? `<small>${nota}</small>` : ''}`;
        guardar.textContent = fijar ? `Dejar en ${unidades(n)}` : `Sumar ${unidades(n)}`;
      }

      form.addEventListener('change', (e) => {
        if (e.target.name === 'modo') {
          form.motivo.value = '';
          pintarMotivos();
          // Para corregir se parte de lo que ya hay; para sumar se empieza vacío.
          form.cantidad.value = modo() === 'fijar' ? p.stock : '';
          form.cantidad.focus();
          form.cantidad.select();
        }
        actualizar();
      });
      form.cantidad.addEventListener('input', () => { form.cantidad.classList.remove('con-error'); actualizar(); });
      form.motivo.addEventListener('input', pintarMotivos);
      form.addEventListener('click', (e) => {
        const paso = e.target.closest('[data-paso]');
        if (paso) {
          form.cantidad.value = Math.max(0, (valor() || 0) + Number(paso.dataset.paso));
          actualizar();
          return;
        }
        const sumar = e.target.closest('[data-sumar]');
        if (sumar) { form.cantidad.value = (valor() || 0) + Number(sumar.dataset.sumar); actualizar(); return; }
        const motivo = e.target.closest('[data-motivo]');
        if (motivo) {
          form.motivo.value = form.motivo.value === motivo.dataset.motivo ? '' : motivo.dataset.motivo;
          pintarMotivos();
        }
      });
      pintarMotivos();
      actualizar();

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fijar = modo() === 'fijar';
        const n = valor();
        const mal = n === null || !Number.isInteger(n) || n < (fijar ? 0 : 1) || n > 100000;
        form.cantidad.classList.toggle('con-error', mal);
        if (mal) {
          msg.className = 'mensaje mensaje-error';
          msg.textContent = fijar ? 'Escribe la cantidad real (un número entero desde 0).' : 'Escribe cuántas unidades llegaron (desde 1).';
          msg.hidden = false;
          return;
        }
        guardar.disabled = true;
        try {
          const motivo = form.motivo.value.trim();
          const r = fijar ? await api.fijarStock(p.id, n, motivo) : await api.reponerStock(p.id, n, motivo);
          resultado = normalizar(r.data);
          ui.aviso(`${p.nombre}: ahora hay ${unidades(resultado.stock)}${resultado.disponible ? '' : ' (sigue agotado)'}.`, 'exito', 4500);
          m.cerrar();
        } catch (err) {
          guardar.disabled = false;
          msg.className = 'mensaje mensaje-error';
          msg.textContent = err.message;
          msg.hidden = false;
        }
      });
      m.elemento.addEventListener('cerrado', () => resolver(resultado));
    });
  }

  // ---------- marcar agotado / reactivar ----------
  async function agotar(p) {
    const ok = await ui.confirmar(`¿Sacar “${p.nombre}” del menú?`,
      'Se marcará como agotado y nadie podrá pedirlo hasta que vuelva a estar disponible.'
        + (sesion.esAdmin() ? '' : ' Para volver a ponerlo en el menú, avisa al administrador.'),
      { aceptar: 'Sí, marcar agotado', cancelar: 'No, dejarlo', peligro: true, icono: 'pausa' });
    if (!ok) return false;
    try {
      const r = await api.agotar(p.id);
      ui.aviso(r.mensaje || 'Producto marcado como agotado.', 'exito');
      return true;
    } catch (err) {
      ui.aviso(err.message, 'error', 6000);
      return false;
    }
  }

  async function reactivar(p) {
    if (p.stock === 0) {
      ui.aviso(`${p.nombre} no tiene unidades. Primero actualiza su stock y volverá solo al menú.`, 'error', 6000);
      return false;
    }
    const ok = await ui.confirmar(`¿Volver a vender “${p.nombre}”?`,
      `Aparecerá de nuevo en el menú con las ${unidades(p.stock)} que hay.`, { aceptar: 'Sí, ponerlo en el menú', icono: 'play' });
    if (!ok) return false;
    try {
      const r = await api.alternarProducto(p.id);
      ui.aviso(r.mensaje || 'Producto disponible.', 'exito');
      return true;
    } catch (err) {
      ui.aviso(err.message + (err.estado === 422 ? '. Primero actualiza su stock.' : ''), 'error', 6000);
      return false;
    }
  }

  // Estado para mostrar en tablas y tarjetas.
  function estado(p) {
    if (!p.disponible) return '<span class="badge badge-cancelado">Agotado</span>';
    if (p.stock <= p.stockMinimo) return '<span class="badge badge-pendiente">Por agotarse</span>';
    return '<span class="badge badge-listo">Disponible</span>';
  }

  window.Cafeteria.inventario = { productos, normalizar, abrirMovimientos, reponer, agotar, reactivar, estado, unidades };
})();
