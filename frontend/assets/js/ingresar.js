// ============================================================
// Ingreso único (POST /api/login).
// Estudiantes, docentes y personal usan el mismo formulario: las cuentas las
// entrega la universidad o el administrador, así que aquí no se crean cuentas.
// El servidor responde con el rol de la cuenta y según eso se abre su sección:
// personal (admin / empleado) → cocina, estudiante → menú.
// El token de Sanctum se guarda en el navegador y se manda en cada petición.
// ============================================================
(function () {
  const { api, ui, sesion } = window.Cafeteria;
  const CFG = window.CAFETERIA_CONFIG;
  const DOMINIO = '@' + CFG.DOMINIO_UNIVALLE;

  const params = new URLSearchParams(location.search);

  // Al ingresar todos llegan al menú, salvo que vengan de una página concreta
  // (?volver= trae una clave conocida: menu, pedidos, carrito, cocina…, nunca una URL libre).
  function destino() {
    const volver = params.get('volver') || '';
    if (sesion.esAdmin() && ['productos', 'combos', 'empleados', 'cocina', 'reportes'].includes(volver)) return CFG.RUTAS[volver];
    if (sesion.esPersonal() && volver === 'cocina') return CFG.RUTAS.cocina;
    if (!sesion.esPersonal() && volver === 'carrito') return CFG.RUTAS.pedido;
    if (!sesion.esPersonal() && volver === 'pedidos') return CFG.RUTAS.pedidos;
    return CFG.RUTAS.inicio;
  }

  if (sesion.token()) {
    window.location.replace(destino());
    return;
  }

  ui.pintarLayout({ pagina: 'ingresar', transparente: true });
  document.querySelectorAll('[data-icono]').forEach((el) => { el.innerHTML = ui.icono(el.dataset.icono); });

  const form = document.getElementById('form-ingresar');
  const msg = document.getElementById('msg-ingresar');
  const tipo = document.getElementById('tipo-cuenta');
  const verClave = document.getElementById('ver-password');
  form.correo.placeholder = 'tu.nombre' + DOMINIO;

  const correoValido = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);

  function mensaje(texto, clase = 'error') {
    if (!texto) { msg.hidden = true; return; }
    msg.className = 'mensaje mensaje-' + clase;
    msg.textContent = texto;
    msg.hidden = false;
  }

  function marcar(input, conError) {
    input.classList.toggle('con-error', conError);
    input.setAttribute('aria-invalid', String(conError));
  }

  // Solo es una guía mientras escribe: el correo dice qué tipo de cuenta es.
  function pintarTipo() {
    const c = form.correo.value.trim().toLowerCase();
    if (!correoValido(c)) { tipo.hidden = true; return; }
    const univalle = c.endsWith(DOMINIO);
    tipo.className = 'tipo-cuenta ' + (univalle ? 'univalle' : 'personal');
    tipo.innerHTML = univalle
      ? `${ui.icono('usuario')} Correo institucional: estudiante o docente`
      : `${ui.icono('taza')} Cuenta del personal de la cafetería`;
    tipo.hidden = false;
  }
  form.correo.addEventListener('input', () => { marcar(form.correo, false); pintarTipo(); });
  form.password.addEventListener('input', () => marcar(form.password, false));

  verClave.addEventListener('click', () => {
    const ver = form.password.type === 'password';
    form.password.type = ver ? 'text' : 'password';
    verClave.innerHTML = ui.icono(ver ? 'ojoNo' : 'ojo');
    verClave.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const correo = form.correo.value.trim();
    const password = form.password.value;
    const errores = [];
    marcar(form.correo, !correoValido(correo));
    marcar(form.password, !password);
    if (!correoValido(correo)) errores.push('Escribe tu correo completo (por ejemplo, tu.nombre' + DOMINIO + ').');
    if (!password) errores.push('Escribe tu contraseña.');
    if (errores.length) { mensaje(errores.join(' ')); return; }

    mensaje('');
    const boton = form.querySelector('button[type="submit"]');
    boton.disabled = true;
    boton.textContent = 'Ingresando…';
    try {
      const r = await api.ingresar(correo, password);
      sesion.guardar(r.token, { id: r.id, nombre: r.usuario, correo: r.email, rol: r.rol });
      window.location.replace(destino());
    } catch (err) {
      boton.disabled = false;
      boton.textContent = 'Ingresar';
      mensaje(err.estado === 401
        ? 'El correo o la contraseña no son correctos. Si eres del personal y tu cuenta no entra, consulta al administrador.'
        : err.message);
      form.password.select();
    }
  });

  // ---------- mensajes al llegar ----------
  if (params.get('salio')) mensaje('Cerraste sesión correctamente. ¡Hasta pronto!', 'exito');
  else if (params.get('inactivo')) mensaje('Cerramos tu sesión porque pasó un buen rato sin actividad. Vuelve a ingresar.', 'info');
  else if (params.get('volver') === 'carrito') mensaje('Ingresa para confirmar tu pedido. Los productos que elegiste te esperan.', 'info');
  else if (params.get('volver')) mensaje('Ingresa para continuar.', 'info');

  if (!params.get('salio')) setTimeout(() => form.correo.focus({ preventScroll: true }), 100);
})();
