// ============================================================
// Ingresar (POST /api/login, HU-27) y crear cuenta (POST /api/register).
// El token que devuelve Laravel (Sanctum) se guarda en el navegador y se
// manda en cada petición protegida. Según id_rol se redirige:
//   1 Admin / 2 Empleado → panel de cocina,  3 Cliente → menú.
// ============================================================
(function () {
  const { api, arte, ui, sesion } = window.Cafeteria;
  const CFG = window.CAFETERIA_CONFIG;

  const params = new URLSearchParams(location.search);

  // ?volver= trae una clave conocida (menu, pedidos, carrito, cocina…), nunca una URL libre.
  //   Admin → a la sección de admin que pidió, o a cocina.  Empleado → cocina.
  //   Cliente → de vuelta al pedido que estaba armando, o al menú.
  function destino() {
    const volver = params.get('volver') || '';
    if (sesion.esAdmin() && ['productos', 'personal', 'cocina'].includes(volver)) return CFG.RUTAS[volver];
    if (sesion.esPersonal()) return CFG.RUTAS.cocina;
    if (volver === 'carrito') return CFG.RUTAS.pedido;
    if (['menu', 'pedidos'].includes(volver)) return CFG.RUTAS[volver];
    return CFG.RUTAS.inicio;
  }

  if (sesion.token()) {
    window.location.replace(destino());
    return;
  }

  ui.pintarLayout({ pagina: 'ingresar', transparente: true });
  document.getElementById('hero-arte').innerHTML = arte.hero();

  // ---------- pestañas ----------
  const panel = document.getElementById('panel');
  const pestanas = document.querySelectorAll('.pestana');

  function mostrar(vista, animar = true) {
    pestanas.forEach((p) => {
      const activa = p.dataset.panel === vista;
      p.classList.toggle('activa', activa);
      p.setAttribute('aria-selected', String(activa));
    });
    const cambiar = () => {
      panel.querySelectorAll('[data-vista]').forEach((v) => { v.hidden = v.dataset.vista !== vista; });
      panel.classList.remove('oculto');
      const primero = panel.querySelector(`[data-vista="${vista}"] input`);
      if (primero && animar) primero.focus();
    };
    if (!animar) { cambiar(); return; }
    panel.classList.add('oculto');
    setTimeout(cambiar, 180);
  }
  pestanas.forEach((p) => p.addEventListener('click', () => mostrar(p.dataset.panel)));

  // Mostrar / ocultar contraseña
  document.querySelectorAll('.toggle-pass').forEach((b) => {
    b.addEventListener('click', () => {
      const input = document.getElementById(b.dataset.objetivo);
      const ver = input.type === 'password';
      input.type = ver ? 'text' : 'password';
      b.textContent = ver ? 'Ocultar' : 'Mostrar';
    });
  });

  // ---------- mensajes ----------
  function mensaje(id, texto, tipo = 'error') {
    const el = document.getElementById(id);
    if (!texto) { el.hidden = true; return; }
    el.className = 'mensaje mensaje-' + tipo;
    el.textContent = texto;
    el.hidden = false;
  }

  function marcar(input, conError) {
    input.classList.toggle('con-error', conError);
    input.setAttribute('aria-invalid', String(conError));
  }

  const correoValido = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);
  const esInstitucional = (c) => CFG.DOMINIOS_INSTITUCIONALES.some((d) => c.toLowerCase().endsWith(d));

  function ocupado(form, si, texto) {
    const b = form.querySelector('button[type="submit"]');
    b.disabled = si;
    if (si) { b.dataset.original = b.textContent; b.textContent = texto; }
    else if (b.dataset.original) b.textContent = b.dataset.original;
  }

  // ---------- ingresar ----------
  const formIngresar = document.getElementById('form-ingresar');
  formIngresar.addEventListener('submit', async (e) => {
    e.preventDefault();
    const correo = formIngresar.correo.value.trim();
    const password = formIngresar.password.value;
    const errores = [];
    marcar(formIngresar.correo, !correoValido(correo));
    marcar(formIngresar.password, !password);
    if (!correoValido(correo)) errores.push('Ingresa un correo válido.');
    if (!password) errores.push('Ingresa tu contraseña.');
    if (errores.length) { mensaje('msg-ingresar', errores.join(' ')); return; }

    mensaje('msg-ingresar', '');
    ocupado(formIngresar, true, 'Ingresando…');
    try {
      const datos = await api.ingresar(correo, password);
      sesion.guardar(datos.token, datos.usuario);
      window.location.replace(destino());
    } catch (err) {
      ocupado(formIngresar, false);
      mensaje('msg-ingresar', err.estado === 401 ? 'Correo o contraseña incorrectos.' : err.message);
      formIngresar.password.select();
    }
  });

  // ---------- crear cuenta ----------
  const formRegistro = document.getElementById('form-registro');
  formRegistro.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = formRegistro.nombre.value.trim();
    const correo = formRegistro.correo.value.trim();
    const password = formRegistro.password.value;
    const password2 = formRegistro.password2.value;
    const errores = [];

    marcar(formRegistro.nombre, !nombre);
    if (!nombre) errores.push('Escribe tu nombre.');

    const correoOk = correoValido(correo) && esInstitucional(correo);
    marcar(formRegistro.correo, !correoOk);
    if (!correoValido(correo)) errores.push('Ingresa un correo válido.');
    else if (!esInstitucional(correo)) errores.push('Usa tu correo institucional (@univalle.edu o @est.univalle.edu).');

    marcar(formRegistro.password, password.length < 6);
    if (password.length < 6) errores.push('La contraseña debe tener al menos 6 caracteres.');

    marcar(formRegistro.password2, password !== password2);
    if (password !== password2) errores.push('Las contraseñas no coinciden.');

    if (errores.length) { mensaje('msg-registro', errores.join(' ')); return; }

    mensaje('msg-registro', '');
    ocupado(formRegistro, true, 'Creando cuenta…');
    try {
      await api.registrar(nombre, correo, password);
      formRegistro.reset();
      ocupado(formRegistro, false);
      formIngresar.correo.value = correo;
      mostrar('ingresar');
      mensaje('msg-ingresar', '¡Cuenta creada! Ahora ingresa con tu contraseña.', 'exito');
      setTimeout(() => formIngresar.password.focus(), 220);
    } catch (err) {
      ocupado(formRegistro, false);
      mensaje('msg-registro', err.message);
    }
  });

  // ---------- estado inicial ----------
  if (location.hash === '#registro') mostrar('registro', false);
  if (params.get('salio')) mensaje('msg-ingresar', 'Cerraste sesión correctamente.', 'exito');
  else if (params.get('volver') === 'carrito') {
    mensaje('msg-ingresar', 'Ingresa (o crea tu cuenta) para confirmar tu pedido. Los productos que elegiste se guardan.', 'info');
    mensaje('msg-registro', 'Crea tu cuenta y luego ingresa: tu pedido te estará esperando.', 'info');
  } else if (params.get('volver')) mensaje('msg-ingresar', 'Ingresa para continuar.', 'info');
})();
