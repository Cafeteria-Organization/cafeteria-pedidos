// ============================================================
// HU-13 — Recepción organizada de pedidos.
// - Refresca la lista de pedidos pendientes cada pocos segundos
//   (polling) para que cocina no tenga que recargar la página.
// - Delegación de eventos en el botón "Marcar como atendido",
//   porque el contenido se reemplaza en cada refresco.
// ============================================================
(function () {
  const contenedor = document.getElementById('lista-pedidos');
  if (!contenedor) return;

  const INTERVALO_MS = 8000;
  let actualizando = false;

  async function refrescar() {
    if (actualizando) return;
    actualizando = true;
    try {
      const respuesta = await fetch('pedidos_datos.php', {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      if (respuesta.ok) {
        contenedor.innerHTML = await respuesta.text();
      }
    } catch (error) {
      // Sin conexión momentánea: se reintenta en el próximo ciclo.
    } finally {
      actualizando = false;
    }
  }

  contenedor.addEventListener('click', async (evento) => {
    const boton = evento.target.closest('.btn-marcar-atendido');
    if (!boton) return;

    boton.disabled = true;
    boton.textContent = 'Marcando...';

    try {
      const cuerpo = new URLSearchParams({ id_pedido: boton.dataset.idPedido });
      const respuesta = await fetch('pedido_atender.php', { method: 'POST', body: cuerpo });
      const datos = await respuesta.json();

      if (datos.ok) {
        const tarjeta = boton.closest('.pedido-card');
        if (tarjeta) tarjeta.remove();
        if (!contenedor.querySelector('.pedido-card')) {
          await refrescar();
        }
      } else {
        alert(datos.error || 'No se pudo marcar el pedido.');
        boton.disabled = false;
        boton.textContent = 'Marcar como atendido';
      }
    } catch (error) {
      alert('Error de conexión al marcar el pedido.');
      boton.disabled = false;
      boton.textContent = 'Marcar como atendido';
    }
  });

  setInterval(refrescar, INTERVALO_MS);
})();
