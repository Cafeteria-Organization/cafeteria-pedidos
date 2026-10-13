// ============================================================
// Personal y roles (HU-24) — solo Admin (rol 1).
//   Crear cuenta:    POST  /api/register  (con el token del Admin respeta
//                    id_rol y devuelve id_usuario — AuthController@register)
//   Listar personal: GET   /api/admin/personal  (tabla USUARIO, roles 1 y 2)
//   Cambiar rol:     PATCH /api/admin/usuarios/{id}/rol { id_rol }
// ============================================================
(function () {
  const { api, ui, sesion, arte } = window.Cafeteria;
  const { esc } = ui;
  const ROLES = window.CAFETERIA_CONFIG.ROLES;
  const CLASE_ROL = { 1: 'badge-admin', 2: 'badge-empleado', 3: 'badge-cliente' };

  if (!ui.exigirSesion([1], 'personal')) return;
  ui.pintarLayout({ pagina: 'personal' });

  const zona = document.getElementById('tabla-personal');
  const total = document.getElementById('total-personal');
  const filtro = document.getElementById('filtro-personal');
  const formNuevo = document.getElementById('form-nuevo');
  const msgNuevo = document.getElementById('msg-nuevo');
  const miCorreo = (sesion.usuario() || {}).correo;

  let personal = [];
  let resaltarId = null;   // id de la cuenta recién creada

  function fechaCorta(valor) {
    const d = ui.fecha(valor);
    return d ? d.toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  }

  // ---------- lista ----------
  function pintar() {
    const t = arte.normalizar(filtro.value.trim());
    const visibles = personal.filter((u) => !t || arte.normalizar(u.nombre + ' ' + u.correo).includes(t));
    total.textContent = `(${personal.length})`;

    if (!visibles.length) {
      zona.innerHTML = `<p class="estado-vacio">${personal.length ? 'Nadie coincide con la búsqueda.' : 'No hay cuentas de personal registradas.'}</p>`;
      return;
    }

    zona.innerHTML = `<table class="tabla">
      <thead><tr><th>ID</th><th>Nombre</th><th>Correo</th><th>Rol</th><th>Registrado</th><th></th></tr></thead>
      <tbody>${visibles.map((u) => {
        const soyYo = u.correo === miCorreo;
        const rol = Number(u.id_rol);
        return `<tr data-id="${esc(u.id_usuario)}" data-nombre="${esc(u.nombre)}" class="${Number(u.id_usuario) === resaltarId ? 'fila-nueva' : ''}">
          <td>#${esc(u.id_usuario)}</td>
          <td><strong>${esc(u.nombre)}</strong>${soyYo ? ' <span class="chip">tú</span>' : ''}</td>
          <td>${esc(u.correo)}</td>
          <td><span class="badge ${CLASE_ROL[rol] || ''}">${esc(ROLES[rol] || rol)}</span></td>
          <td>${fechaCorta(u.fecha_registro)}</td>
          <td class="tabla-acciones">${soyYo
            ? '<span class="campo-ayuda">No puedes cambiar tu propio rol</span>'
            : `<select class="filtro-tabla" style="min-width:0" data-cambiar-rol aria-label="Cambiar rol de ${esc(u.nombre)}">
                 <option value="">Cambiar rol…</option>
                 ${[1, 2, 3].filter((r) => r !== rol).map((r) => `<option value="${r}">${r === 3 ? 'Quitar acceso (Cliente)' : ROLES[r]}</option>`).join('')}
               </select>`}</td>
        </tr>`;
      }).join('')}</tbody></table>`;
  }

  async function cargar() {
    try {
      personal = (await api.personal()).sort((a, b) =>
        Number(a.id_rol) - Number(b.id_rol) || String(a.nombre).localeCompare(String(b.nombre), 'es'));
      pintar();
    } catch (e) {
      total.textContent = '';
      zona.innerHTML = `<div class="mensaje mensaje-error"><strong>No se pudo cargar el personal.</strong><br>${esc(e.message)}</div>`;
    }
  }

  filtro.addEventListener('input', pintar);

  // ---------- crear cuenta de personal ----------
  function mensajeNuevo(texto, tipo = 'error') {
    msgNuevo.className = 'mensaje mensaje-' + tipo;
    msgNuevo.innerHTML = texto;
    msgNuevo.hidden = !texto;
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
    const idRol = Number(formNuevo.querySelector('input[name="rol"]:checked').value);

    const errores = [];
    const marcar = (el, mal) => { el.classList.toggle('con-error', mal); el.setAttribute('aria-invalid', String(mal)); };
    marcar(formNuevo.nombre, !nombre);
    if (!nombre) errores.push('Escribe el nombre.');
    const correoMal = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
    marcar(formNuevo.correo, correoMal);
    if (correoMal) errores.push('Escribe un correo válido.');
    marcar(formNuevo.password, password.length < 6);
    if (password.length < 6) errores.push('La contraseña debe tener al menos 6 caracteres.');
    marcar(formNuevo.password2, password !== password2);
    if (password !== password2) errores.push('Las contraseñas no coinciden.');
    if (errores.length) { mensajeNuevo(esc(errores.join(' '))); return; }

    if (idRol === 1) {
      const ok = await ui.confirmar('¿Crear otra cuenta de Admin?',
        `${nombre} tendrá acceso total: productos, personal y roles.`, { aceptar: 'Sí, crear Admin', peligro: true });
      if (!ok) return;
    }

    const boton = formNuevo.querySelector('button[type="submit"]');
    boton.disabled = true;
    boton.textContent = 'Creando…';
    try {
      const u = await api.crearCuentaPersonal(nombre, correo, password, idRol);
      if (!u || Number(u.id_rol) !== idRol) {
        mensajeNuevo('La cuenta se creó, pero el servidor no asignó el rol elegido. Revisa AuthController@register.', 'error');
      } else {
        mensajeNuevo(`<strong>Cuenta creada:</strong> ${esc(u.nombre)} como <strong>${esc(ROLES[u.id_rol])}</strong>.
          Entrégale su correo <strong>${esc(u.correo)}</strong> y la contraseña que escribiste.`, 'exito');
        ui.aviso(`${u.nombre} ya puede ingresar como ${ROLES[u.id_rol]}.`, 'exito');
      }
      resaltarId = u ? Number(u.id_usuario) : null;
      formNuevo.reset();
      filtro.value = '';
      cargar();
    } catch (err) {
      mensajeNuevo(esc(err.message));
    } finally {
      boton.disabled = false;
      boton.textContent = 'Crear cuenta';
    }
  });

  // ---------- cambiar rol desde la lista ----------
  zona.addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-cambiar-rol]');
    if (!sel || !sel.value) return;
    const fila = sel.closest('tr');
    const id = Number(fila.dataset.id);
    const nombre = fila.dataset.nombre;
    const idRol = Number(sel.value);

    const destino = idRol === 3 ? 'Cliente: ya no podrá entrar a cocina ni a administración' : ROLES[idRol];
    const ok = await ui.confirmar(`¿Cambiar el rol de ${nombre}?`,
      `Pasará a ser ${destino}. Se aplica cuando vuelva a iniciar sesión.`,
      { aceptar: idRol === 3 ? 'Quitar acceso' : 'Cambiar rol', peligro: idRol !== 2 });
    if (!ok) { sel.value = ''; return; }

    try {
      await api.asignarRol(id, idRol);
      ui.aviso(idRol === 3 ? `${nombre} ya no tiene acceso de personal.` : `${nombre} ahora es ${ROLES[idRol]}.`, 'exito');
      resaltarId = null;
      cargar();
    } catch (err) {
      ui.aviso(err.message, 'error', 6000);
      sel.value = '';
    }
  });

  cargar();
})();
