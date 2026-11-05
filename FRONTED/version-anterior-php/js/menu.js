// ============================================================
// HU-02 — Búsqueda de productos por nombre.
// Busca "en tiempo real" mientras el usuario escribe (con un pequeño
// retraso para no disparar una petición por cada tecla), y también
// funciona con el botón "Buscar" / tecla Enter si JS falla.
//
// Interfaz: además maneja las flechas de los carruseles de cada
// categoría (solo desplazan la fila; no cambian los datos).
// ============================================================
(function () {
  const campo = document.getElementById('campo-busqueda');
  const resultados = document.getElementById('menu-resultados');
  const form = document.getElementById('form-buscador');
  if (!campo || !resultados || !form) return;

  let temporizador = null;

  // ---------- Carruseles ----------
  function actualizarFlechas() {
    resultados.querySelectorAll('.carrusel').forEach((carrusel) => {
      const pista = carrusel.querySelector('.carrusel-pista');
      if (!pista) return;
      const sinDesborde = pista.scrollWidth <= pista.clientWidth + 2;
      carrusel.classList.toggle('sin-desborde', sinDesborde);
    });
  }

  resultados.addEventListener('click', (evento) => {
    const flecha = evento.target.closest('.flecha');
    if (!flecha) return;
    const pista = flecha.closest('.carrusel').querySelector('.carrusel-pista');
    const paso = Math.max(pista.clientWidth * 0.8, 240);
    pista.scrollBy({ left: paso * Number(flecha.dataset.dir), behavior: 'smooth' });
  });

  window.addEventListener('resize', actualizarFlechas);
  window.addEventListener('load', actualizarFlechas);
  actualizarFlechas();

  // ---------- Búsqueda en vivo ----------
  async function buscar(termino) {
    try {
      const respuesta = await fetch('menu_buscar.php?q=' + encodeURIComponent(termino), {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      if (!respuesta.ok) throw new Error('Error de red');
      resultados.innerHTML = await respuesta.text();
      actualizarFlechas();
    } catch (error) {
      // Si falla el fetch, dejamos que el formulario normal se encargue.
      form.submit();
    }
  }

  campo.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => buscar(campo.value.trim()), 300);
  });

  form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    clearTimeout(temporizador);
    buscar(campo.value.trim());
  });
})();
