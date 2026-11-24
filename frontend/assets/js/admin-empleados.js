// ============================================================
// Personal de la cafetería (exclusivo del Admin): empleados y administradores.
//   Listar:     GET    /api/admin/empleados?incluir_admins=1   (&inactivos=1 → dados de baja)
//   Crear:      POST   /api/admin/empleados        { name, email, password, rol: empleado | admin }
//   Editar:     PUT    /api/admin/empleados/{id}   (nombre, correo, contraseña y/o rol)
//   Dar de baja: DELETE /api/admin/empleados/{id}  (solo empleados; cierra sus sesiones)
//   Reactivar:  POST   /api/admin/empleados/{id}/restaurar
// Nadie puede cambiar su propio rol y siempre queda al menos un administrador.
// ============================================================
(function () {
  const { api, ui, iconos, sesion } = window.Cafeteria;
  const { esc } = ui;
  const ROL_TEXTO = { admin: 'Administrador', empleado: 'Empleado' };
  const esYo = (u) => Number(u.id) === Number((sesion.usuario() || {}).id);
  const CFG = window.CAFETERIA_CONFIG;

  if (!ui.exigirSesion(['admin'], 'empleados')) return;
  ui.pintarLayout({ pagina: 'empleados' });
  document.querySelectorAll('[data-icono]').forEach((el) => { el.innerHTML = ui.icono(el.dataset.icono); });

  const zona = document.getElementById('tabla-empleados');
  const filtro = document.getElementById('filtro-empleados');
  const formNuevo = document.getElementById('form-nuevo');
  const msgNuevo = document.getElementById('msg-nuevo');
  const pestanas = document.querySelectorAll('[data-vista]');

  let vista = 'activos';
  let empleados = [];
  let resaltarId = null;   // id de la cuenta recién creada o editada

  const correoValido = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);

  function fechaCorta(valor) {
    const d = ui.fecha(valor);
    return d ? d.toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  }

  // ---------- lista ----------
  function pintar() {
    const t = iconos.normalizar(filtro.value.trim());
    const visibles = empleados.filter((u) => !t || iconos.normalizar(u.name + ' ' + u.email).includes(t));
    pestanas.forEach((b) => {
      const activa = b.dataset.vista === vista;
      b.classList.toggle('activo', activa);
      b.setAttribute('aria-pressed', String(activa));
    });

    if (!visibles.length) {
      zona.innerHTML = `<p class="estado-vacio">${empleados.length ? 'Nadie coincide con la búsqueda.'
        : vista === 'activos' ? 'Todavía no hay empleados. Crea el primero arriba.' : 'No hay empleados dados de baja.'}</p>`;
      return;
    }

    const inactivos = vista === 'inactivos';
    zona.innerHTML = `<div class="persona-grid">${visibles.map((u) => `
      <article data-id="${esc(u.id)}" class="persona-card ${Number(u.id) === resaltarId ? 'fila-nueva' : ''} ${inactivos ? 'inactivo' : ''}">
        <div class="persona-cabecera">
          <span class="persona-avatar ${u.rol === 'admin' ? 'admin' : ''}" aria-hidden="true">${esc(iniciales(u.name))}</span>
          <div class="persona-datos">
            <strong>${esc(u.name)}${esYo(u) ? ' <span class="chip">tú</span>' : ''}</strong>
            <small>${esc(u.email)}</small>
          </div>
        </div>
        <div class="persona-meta">
          <span class="badge ${u.rol === 'admin' ? 'badge-admin' : 'badge-empleado'}">${esc(ROL_TEXTO[u.rol] || u.rol)}</span>
          <small>${inactivos ? 'De baja desde el' : 'Desde el'} ${fechaCorta(inactivos ? u.deleted_at : u.created_at)}</small>
        </div>
        <div class="persona-acciones">${inactivos
          ? `<button type="button" class="accion exito" data-restaurar>${ui.icono('play')}Reactivar</button>`
          : `<button type="button" class="accion" data-editar>${ui.icono('editar')}Editar</button>
             ${u.rol === 'admin'
               ? `<button type="button" class="accion peligro" disabled title="Para dar de baja a un administrador, primero cámbialo a Empleado">${ui.icono('pausa')}Dar de baja</button>`
               : `<button type="button" class="accion peligro" data-baja>${ui.icono('pausa')}Dar de baja</button>`}`}</div>
      </article>`).join('')}</div>`;
  }

  // "María Quispe" → "MQ"
  function iniciales(nombre) {
    return String(nombre || '?').trim().split(/\s+/).slice(0, 2).map((p) => p.charAt(0)).join('').toUpperCase();
  }

  let firma = '';
  async function cargar(silencioso = false) {
    if (!silencioso) zona.innerHTML = '<p class="estado-vacio">Cargando…</p>';
    try {
      const lista = await api.empleados(vista === 'inactivos');
      const nueva = vista + JSON.stringify(lista);
      if (silencioso && nueva === firma) return;
      firma = nueva;
      empleados = lista;
      pintar();
    } catch (e) {
      if (silencioso) return;
      zona.innerHTML = `<div class="mensaje mensaje-error"><strong>No se pudo cargar la lista.</strong><br>${esc(e.message)}</div>`;
    }
  }

  pestanas.forEach((b) => b.addEventListener('click', () => {
    if (vista === b.dataset.vista) return;
    vista = b.dataset.vista;
    resaltarId = null;
    cargar();
  }));
  filtro.addEventListener('input', pintar);

  // ---------- crear ----------
  function mensajeNuevo(html, tipo = 'error') {
    msgNuevo.className = 'mensaje mensaje-' + tipo;
    msgNuevo.innerHTML = html;
    msgNuevo.hidden = !html;
  }

  formNuevo.querySelector('.toggle-pass').addEventListener('click', (e) => {
    const input = document.getElementById(e.currentTarget.dataset.objetivo);
    const ver = input.type === 'password';
    input.type = ver ? 'text' : 'password';
    e.currentTarget.textContent = ver ? 'Ocultar' : 'Mostrar';
  });

  formNuevo.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = formNuevo.nombre.value.trim();
    const correo = formNuevo.correo.value.trim();
    const password = formNuevo.password.value;
    const password2 = formNuevo.password2.value;

    // Datos obligatorios completos (el servidor revisa que el correo no se repita).
    const errores = [];
    const marcar = (el, mal) => { el.classList.toggle('con-error', mal); el.setAttribute('aria-invalid', String(mal)); };
    marcar(formNuevo.nombre, !nombre);
    if (!nombre) errores.push('Escribe el nombre.');
    marcar(formNuevo.correo, !correoValido(correo));
    if (!correoValido(correo)) errores.push('Escribe un correo válido.');
    marcar(formNuevo.password, password.length < CFG.PASSWORD_MIN);
    if (password.length < CFG.PASSWORD_MIN) errores.push(`La contraseña debe tener al menos ${CFG.PASSWORD_MIN} caracteres.`);
    marcar(formNuevo.password2, password !== password2);
    if (password !== password2) errores.push('Las contraseñas no coinciden.');
    if (errores.length) { mensajeNuevo(esc(errores.join(' '))); return; }

    const boton = formNuevo.querySelector('button[type="submit"]');
    boton.disabled = true;
    boton.textContent = 'Creando…';
    try {
      const r = await api.crearEmpleado({ name: nombre, email: correo, password, rol: formNuevo.rol.value });
      const u = r.data;
      mensajeNuevo(`<strong>Cuenta creada:</strong> ${esc(u.name)} como <strong>${esc(ROL_TEXTO[u.rol] || u.rol)}</strong>.
        Entrégale su correo <strong>${esc(u.email)}</strong> y la contraseña que escribiste.`, 'exito');
      ui.aviso(`${u.name} ya puede ingresar con su correo y contraseña.`, 'exito');
      resaltarId = Number(u.id);
      formNuevo.reset();
      filtro.value = '';
      if (vista !== 'activos') pestanas[0].click(); else cargar();
    } catch (err) {
      mensajeNuevo(esc(err.message));
    } finally {
      boton.disabled = false;
      boton.textContent = 'Crear cuenta';
    }
  });

  // ---------- editar ----------
  function editar(u) {
    const m = ui.modal(`
      <h2 class="modal-titulo">Editar a ${esc(u.name)}</h2>
      <p class="modal-texto" style="margin-bottom:14px">Si no escribes una contraseña nueva, se queda la de siempre.</p>
      <form class="formulario" data-editar-form novalidate>
        <div class="mensaje" data-msg hidden></div>
        <div class="form-grid">
          <div class="campo ancho">
            <label for="e-nombre">Nombre completo *</label>
            <input id="e-nombre" name="nombre" maxlength="100" required value="${esc(u.name)}">
          </div>
          <div class="campo ancho">
            <label for="e-correo">Correo *</label>
            <input id="e-correo" name="correo" type="email" maxlength="150" required value="${esc(u.email)}">
          </div>
          <div class="campo ancho">
            <label for="e-password">Nueva contraseña</label>
            <input id="e-password" name="password" type="password" autocomplete="new-password" maxlength="100" placeholder="Mínimo ${CFG.PASSWORD_MIN} caracteres">
          </div>
          <div class="campo ancho">
            <label>Rol</label>
            ${esYo(u)
              ? `<p class="campo-ayuda" style="margin:0">Eres ${esc(ROL_TEXTO[u.rol])}. No puedes cambiar tu propio rol.</p>`
              : `<div class="opciones-grandes opciones-rol" role="radiogroup" aria-label="Rol">
                  <label class="opcion-grande"><input type="radio" name="rol" value="empleado" ${u.rol === 'empleado' ? 'checked' : ''}>
                    <span class="opcion-icono">${ui.icono('taza')}</span>
                    <span class="opcion-texto"><strong>Empleado</strong><small>Cocina, caja e inventario.</small></span></label>
                  <label class="opcion-grande"><input type="radio" name="rol" value="admin" ${u.rol === 'admin' ? 'checked' : ''}>
                    <span class="opcion-icono">${ui.icono('estrella')}</span>
                    <span class="opcion-texto"><strong>Administrador</strong><small>Además: productos, combos, personal y reportes.</small></span></label>
                </div>
                <span class="campo-ayuda">Si cambias el rol, se cerrará su sesión para que vuelva a ingresar con los permisos nuevos.</span>`}
          </div>
        </div>
        <div class="modal-botones" style="margin-top:6px">
          <button type="button" class="btn btn-contorno" data-cerrar>Cancelar</button>
          <button type="submit" class="btn btn-oscuro">Guardar cambios</button>
        </div>
      </form>`, { icono: 'usuario' });
    const form = m.elemento.querySelector('[data-editar-form]');
    const msg = form.querySelector('[data-msg]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nombre = form.nombre.value.trim();
      const correo = form.correo.value.trim();
      const password = form.password.value;
      const errores = [];
      if (!nombre) errores.push('Escribe el nombre.');
      if (!correoValido(correo)) errores.push('Escribe un correo válido.');
      if (password && password.length < CFG.PASSWORD_MIN) errores.push(`La contraseña debe tener al menos ${CFG.PASSWORD_MIN} caracteres.`);
      if (errores.length) {
        msg.className = 'mensaje mensaje-error';
        msg.textContent = errores.join(' ');
        msg.hidden = false;
        return;
      }
      const datos = { name: nombre, email: correo };
      if (password) datos.password = password;
      const rolNuevo = form.rol ? form.rol.value : u.rol;
      if (rolNuevo !== u.rol) datos.rol = rolNuevo;
      const boton = form.querySelector('button[type="submit"]');
      boton.disabled = true;
      try {
        await api.editarEmpleado(u.id, datos);
        m.cerrar();
        ui.aviso(datos.rol ? `${nombre} ahora es ${ROL_TEXTO[datos.rol]}.` : password ? `Datos y contraseña de ${nombre} actualizados.` : `Datos de ${nombre} actualizados.`, 'exito', 4500);
        resaltarId = Number(u.id);
        cargar();
      } catch (err) {
        boton.disabled = false;
        msg.className = 'mensaje mensaje-error';
        msg.textContent = err.message;
        msg.hidden = false;
      }
    });
  }

  // ---------- acciones de la lista ----------
  zona.addEventListener('click', async (e) => {
    const fila = e.target.closest('[data-id]');
    if (!fila) return;
    const u = empleados.find((x) => Number(x.id) === Number(fila.dataset.id));
    if (!u) return;

    if (e.target.closest('[data-editar]')) { editar(u); return; }

    const baja = e.target.closest('[data-baja]');
    if (baja) {
      const ok = await ui.confirmar(`¿Dar de baja a ${u.name}?`,
        'Ya no podrá ingresar y se cerrarán sus sesiones abiertas. Su historial se conserva y puedes reactivarlo cuando quieras.',
        { aceptar: 'Sí, dar de baja', cancelar: 'No, mantenerlo', peligro: true, icono: 'usuario' });
      if (!ok) return;
      baja.disabled = true;
      try {
        await api.bajaEmpleado(u.id);
        ui.aviso(`${u.name} fue dado de baja.`, 'exito');
      } catch (err) {
        ui.aviso(err.message, 'error', 6000);
      }
      cargar();
      return;
    }

    const restaurar = e.target.closest('[data-restaurar]');
    if (restaurar) {
      restaurar.disabled = true;
      try {
        await api.restaurarEmpleado(u.id);
        ui.aviso(`${u.name} puede volver a ingresar.`, 'exito');
      } catch (err) {
        ui.aviso(err.message, 'error', 6000);
      }
      cargar();
    }
  });

  cargar();
  // Lo que se cambie en otra pestaña o computadora se ve sin recargar la página.
  api.alCambiar(() => cargar(true), { cada: 30000 });
})();
