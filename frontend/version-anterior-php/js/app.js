// ============================================================
// Cafetería Universitaria — login/registro
// - initPanel(): valida el formulario y activa mostrar/ocultar contraseña.
//   Se vuelve a llamar cada vez que el contenido del panel cambia.
// - cambiarPagina(): trae la otra página (login.php / registro.php) con
//   fetch, y hace un fundido + deslizado en vez de una recarga seca.
//   Se dispara desde el enlace de texto "¿Ya tienes cuenta? / ¿Aún no
//   tienes cuenta?" (clase .js-enlace-alternar). Si algo falla (por
//   ejemplo, abriendo el sitio con file://), cae de vuelta a una
//   navegación normal.
// ============================================================

function initPanel() {
  document.querySelectorAll('.toggle-pass').forEach((boton) => {
    boton.addEventListener('click', () => {
      const input = document.getElementById(boton.dataset.target);
      if (!input) return;
      const oculto = input.type === 'password';
      input.type = oculto ? 'text' : 'password';
      boton.textContent = oculto ? 'Ocultar' : 'Mostrar';
    });
  });

  const formRegistro = document.getElementById('form-registro');
  if (formRegistro) {
    const password = document.getElementById('password');
    const confirmar = document.getElementById('confirmar_password');
    const ayudaConfirmar = document.getElementById('ayuda-confirmar');

    const validarCoincidencia = () => {
      if (confirmar.value.length === 0) {
        ayudaConfirmar.textContent = 'Repite la misma contraseña.';
        ayudaConfirmar.classList.remove('error-texto');
        confirmar.classList.remove('campo-error');
        return true;
      }
      const coincide = password.value === confirmar.value;
      ayudaConfirmar.textContent = coincide
        ? 'Las contraseñas coinciden.'
        : 'Las contraseñas no coinciden.';
      ayudaConfirmar.classList.toggle('error-texto', !coincide);
      confirmar.classList.toggle('campo-error', !coincide);
      return coincide;
    };

    password.addEventListener('input', validarCoincidencia);
    confirmar.addEventListener('input', validarCoincidencia);

    formRegistro.addEventListener('submit', (evento) => {
      if (password.value.length < 8) {
        evento.preventDefault();
        password.classList.add('campo-error');
        alert('La contraseña debe tener al menos 8 caracteres.');
        return;
      }
      if (!validarCoincidencia()) {
        evento.preventDefault();
      }
    });
  }
}

function cambiarPagina(url, agregarHistorial = true) {
  const panel = document.getElementById('panel-contenido');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  fetch(url)
    .then((respuesta) => {
      if (!respuesta.ok) throw new Error('No se pudo cargar la página');
      return respuesta.text();
    })
    .then((html) => {
      const nuevoDoc = new DOMParser().parseFromString(html, 'text/html');
      const nuevoPanel = nuevoDoc.getElementById('panel-contenido');
      const nuevoTitulo = nuevoDoc.querySelector('title');
      if (!nuevoPanel) throw new Error('El panel no existe en la página de destino');

      const aplicarCambio = () => {
        panel.innerHTML = nuevoPanel.innerHTML;
        if (nuevoTitulo) document.title = nuevoTitulo.textContent;
        if (agregarHistorial) history.pushState({ url }, '', url);

        // Vuelve a mostrar el panel con la animación de entrada.
        panel.classList.remove('transicion-fuera');
        initPanel();
        activarEnlacesAlternar();
      };

      if (reduceMotion) {
        aplicarCambio();
        return;
      }

      panel.classList.add('transicion-fuera');
      window.setTimeout(aplicarCambio, 200);
    })
    .catch(() => {
      // Si el fetch falla (bloqueado, sin conexión, file://, etc.)
      // simplemente navegamos como una página normal.
      window.location.href = url;
    });
}

function activarEnlacesAlternar() {
  document.querySelectorAll('.js-enlace-alternar').forEach((enlace) => {
    enlace.addEventListener('click', (evento) => {
      evento.preventDefault();
      cambiarPagina(enlace.getAttribute('href'));
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initPanel();
  activarEnlacesAlternar();

  window.addEventListener('popstate', (evento) => {
    const url = (evento.state && evento.state.url) || location.pathname.split('/').pop();
    cambiarPagina(url, false);
  });
});
