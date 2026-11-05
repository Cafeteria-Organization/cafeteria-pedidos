// ============================================================
// HU-23 — Horarios de atención (solo Admin).
//   Ver:      GET /api/horarios       (estado actual + semana + capacidad de cocina)
//   Guardar:  PUT /api/admin/horarios { horarios: [...7 días], capacidad_cocina }
// Al guardar se aplica de inmediato: el menú lo revisa cada minuto y el
// servidor rechaza los pedidos fuera de horario.
// HU-11 — Capacidad de cocina: cuántos pedidos se preparan a la vez
// (se usa para calcular el tiempo de espera).
// ============================================================
(function () {
  const { api, ui } = window.Cafeteria;
  const { esc } = ui;

  if (!ui.exigirSesion([1], 'horarios')) return;
  ui.pintarLayout({ pagina: 'horarios' });

  const form = document.getElementById('form-horarios');
  const tabla = document.getElementById('tabla-horarios');
  const estadoEl = document.getElementById('estado-actual');
  const msg = document.getElementById('msg-horarios');

  function pintarEstado(e) {
    if (!e) { estadoEl.innerHTML = ''; return; }
    estadoEl.className = 'estado-horario ' + (e.abierto ? 'abierto' : 'cerrado');
    estadoEl.innerHTML = `<span class="estado-horario-punto" aria-hidden="true"></span>
      <div><strong>${e.abierto ? 'Abierto ahora' : 'Cerrado ahora'}</strong>
      <span>${esc(e.mensaje || '')} · Hora del servidor: ${esc(e.hora_actual || '')} (${esc(e.dia || '')})</span></div>`;
  }

  function pintarSemana(semana) {
    tabla.innerHTML = `<table class="tabla tabla-horarios">
      <thead><tr><th>Día</th><th>Atiende</th><th>Abre</th><th>Cierra</th></tr></thead>
      <tbody>${semana.map((d) => `
        <tr data-dia="${esc(d.dia_semana)}" class="${d.abierto ? '' : 'dia-cerrado'}">
          <td><strong>${esc(d.dia_semana)}</strong></td>
          <td><label class="interruptor"><input type="checkbox" name="abierto" ${d.abierto ? 'checked' : ''}>
            <span class="interruptor-pista" aria-hidden="true"></span><span class="interruptor-texto">${d.abierto ? 'Abierto' : 'Cerrado'}</span></label></td>
          <td><input type="time" name="apertura" value="${esc(d.hora_apertura)}" aria-label="Hora de apertura del ${esc(d.dia_semana)}" ${d.abierto ? '' : 'disabled'}></td>
          <td><input type="time" name="cierre" value="${esc(d.hora_cierre)}" aria-label="Hora de cierre del ${esc(d.dia_semana)}" ${d.abierto ? '' : 'disabled'}></td>
        </tr>`).join('')}</tbody></table>`;
  }

  async function cargar() {
    try {
      const d = await api.horarios();
      pintarEstado(d.estado);
      pintarSemana(d.semana);
      form.capacidad.value = d.capacidad_cocina || 2;
    } catch (e) {
      tabla.innerHTML = `<p class="estado-vacio">${esc(e.message)}</p>`;
    }
  }

  tabla.addEventListener('change', (e) => {
    if (e.target.name !== 'abierto') return;
    const fila = e.target.closest('tr');
    fila.classList.toggle('dia-cerrado', !e.target.checked);
    fila.querySelector('.interruptor-texto').textContent = e.target.checked ? 'Abierto' : 'Cerrado';
    fila.querySelectorAll('input[type="time"]').forEach((i) => { i.disabled = !e.target.checked; });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.hidden = true;
    const horarios = [...tabla.querySelectorAll('tr[data-dia]')].map((f) => ({
      dia_semana: f.dataset.dia,
      abierto: f.querySelector('[name="abierto"]').checked,
      hora_apertura: f.querySelector('[name="apertura"]').value.slice(0, 5),
      hora_cierre: f.querySelector('[name="cierre"]').value.slice(0, 5),
    }));
    const malo = horarios.find((h) => h.abierto && (!h.hora_apertura || !h.hora_cierre || h.hora_cierre <= h.hora_apertura));
    if (malo) {
      msg.className = 'mensaje mensaje-error';
      msg.textContent = `Revisa el ${malo.dia_semana}: la hora de cierre debe ser después de la de apertura.`;
      msg.hidden = false;
      return;
    }
    const capacidad = Number(form.capacidad.value);
    if (!Number.isInteger(capacidad) || capacidad < 1 || capacidad > 20) {
      msg.className = 'mensaje mensaje-error';
      msg.textContent = 'La capacidad de cocina debe ser un número de 1 a 20.';
      msg.hidden = false;
      return;
    }
    const boton = form.querySelector('button[type="submit"]');
    boton.disabled = true;
    try {
      const r = await api.guardarHorarios(horarios, capacidad);
      pintarEstado(r.data.estado);
      pintarSemana(r.data.semana);
      ui.aviso(r.message || 'Horario guardado.', 'exito');
    } catch (err) {
      msg.className = 'mensaje mensaje-error';
      msg.textContent = err.message;
      msg.hidden = false;
    }
    boton.disabled = false;
  });

  cargar();
  setInterval(async () => { try { pintarEstado((await api.horarios()).estado); } catch (e) { /* reintenta */ } }, 60000);
})();
