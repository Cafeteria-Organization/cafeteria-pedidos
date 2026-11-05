// ============================================================
// HU-17: código QR del pedido.
//   - dibujar(): el cliente ve su código de entrega como QR.
//   - escanear(): la cocina lee el QR con la cámara (o con una foto).
// El QR lleva el texto "CAFE|<id_pedido>|<codigo>". Al leerlo se toma el código
// y se manda a POST /pedidos/{id}/entregar: el servidor sigue siendo quien valida.
// Las librerías se cargan solo cuando se necesitan (cdnjs / jsDelivr).
// ============================================================
(function () {
  const { ui } = window.Cafeteria;
  const { esc } = ui;
  const LIB_GENERAR = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
  const LIB_LEER = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
  const cargadas = {};

  function cargar(url) {
    if (!cargadas[url]) {
      cargadas[url] = new Promise((ok, mal) => {
        const s = document.createElement('script');
        s.src = url;
        s.async = true;
        s.onload = ok;
        s.onerror = () => { delete cargadas[url]; mal(new Error('No se pudo cargar el lector de QR (revisa la conexión a internet).')); };
        document.head.appendChild(s);
      });
    }
    return cargadas[url];
  }

  const texto = (idPedido, codigo) => `CAFE|${idPedido}|${String(codigo).toUpperCase()}`;

  // Lee "CAFE|12|ABC123" o, si es otro QR, toma el texto completo como código.
  function interpretar(valor) {
    const v = String(valor || '').trim();
    const m = v.match(/^CAFE\|(\d+)\|([A-Z0-9]{4,10})$/i);
    if (m) return { id: Number(m[1]), codigo: m[2].toUpperCase() };
    return /^[A-Z0-9]{4,10}$/i.test(v) ? { id: null, codigo: v.toUpperCase() } : null;
  }

  // Pinta el QR dentro de "elemento". Si no hay internet queda solo el código en texto.
  async function dibujar(elemento, idPedido, codigo) {
    if (!elemento || !codigo) return;
    try {
      await cargar(LIB_GENERAR);
      const qr = window.qrcode(0, 'M');
      qr.addData(texto(idPedido, codigo));
      qr.make();
      elemento.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      const svg = elemento.querySelector('svg');
      if (svg) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Código QR del pedido ' + idPedido); }
      elemento.hidden = false;
    } catch (e) {
      elemento.hidden = true;
    }
  }

  // ---------- lectura ----------
  async function lector() {
    if ('BarcodeDetector' in window) {
      try {
        const formatos = await window.BarcodeDetector.getSupportedFormats();
        if (formatos.includes('qr_code')) {
          const d = new window.BarcodeDetector({ formats: ['qr_code'] });
          return async (fuente) => { const r = await d.detect(fuente); return r.length ? r[0].rawValue : null; };
        }
      } catch (e) { /* se usa jsQR */ }
    }
    await cargar(LIB_LEER);
    const lienzo = document.createElement('canvas');
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    return async (fuente) => {
      const ancho = fuente.videoWidth || fuente.naturalWidth || fuente.width;
      const alto = fuente.videoHeight || fuente.naturalHeight || fuente.height;
      if (!ancho || !alto) return null;
      const escala = Math.min(1, 900 / Math.max(ancho, alto));
      lienzo.width = Math.round(ancho * escala);
      lienzo.height = Math.round(alto * escala);
      ctx.drawImage(fuente, 0, 0, lienzo.width, lienzo.height);
      const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
      const r = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
      return r ? r.data : null;
    };
  }

  // Abre la cámara y devuelve { id, codigo } o null si se cierra sin leer nada.
  function escanear(titulo) {
    return new Promise((resolver) => {
      let resultado = null;
      let flujo = null;
      let activo = true;
      const m = ui.modal(`
        <h2 class="modal-titulo">${esc(titulo || 'Escanear QR del cliente')}</h2>
        <p class="modal-texto">Apunta la cámara al código QR que el cliente muestra en “Mis pedidos”.</p>
        <div class="escaner"><video playsinline muted></video><span class="escaner-marco"></span></div>
        <p class="escaner-estado" data-estado>Abriendo la cámara…</p>
        <div class="modal-botones">
          <label class="btn btn-contorno escaner-foto">Usar una foto
            <input type="file" accept="image/*" capture="environment" hidden></label>
          <button type="button" class="btn btn-oscuro" data-cerrar>Cancelar</button>
        </div>`, { clase: 'modal-escaner' });
      const caja = m.elemento;
      const video = caja.querySelector('video');
      const estado = caja.querySelector('[data-estado]');
      const archivo = caja.querySelector('input[type=file]');

      const terminar = (valor) => {
        const leido = interpretar(valor);
        if (!leido) { estado.textContent = 'Ese QR no es de un pedido de la cafetería.'; return false; }
        resultado = leido;
        m.cerrar();
        return true;
      };

      caja.addEventListener('cerrado', () => {
        activo = false;
        if (flujo) flujo.getTracks().forEach((t) => t.stop());
        resolver(resultado);
      });

      const preparado = lector().catch((e) => { estado.textContent = e.message; return null; });

      archivo.addEventListener('change', async () => {
        const f = archivo.files && archivo.files[0];
        if (!f) return;
        const leer = await preparado;
        if (!leer) return;
        estado.textContent = 'Leyendo la foto…';
        const img = new Image();
        img.onload = async () => {
          let valor = null;
          try { valor = await leer(img); } catch (e) { /* sin QR */ }
          URL.revokeObjectURL(img.src);
          if (!valor) estado.textContent = 'No se encontró un QR en la foto. Prueba con otra más cerca.';
          else terminar(valor);
        };
        img.src = URL.createObjectURL(f);
      });

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        estado.textContent = 'Este navegador no deja usar la cámara aquí (se necesita https o localhost). Usa “Usar una foto”.';
        return;
      }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        .then(async (s) => {
          if (!activo) { s.getTracks().forEach((t) => t.stop()); return; }
          flujo = s;
          video.srcObject = s;
          await video.play().catch(() => {});
          const leer = await preparado;
          if (!leer) return;
          estado.textContent = 'Buscando un código QR…';
          const ciclo = async () => {
            if (!activo) return;
            let valor = null;
            try { if (video.readyState >= 2) valor = await leer(video); } catch (e) { /* sigue */ }
            if (valor && terminar(valor)) return;
            setTimeout(ciclo, 250);
          };
          ciclo();
        })
        .catch(() => {
          estado.textContent = 'No se pudo abrir la cámara (permiso denegado o sin cámara). Usa “Usar una foto”.';
        });
    });
  }

  window.Cafeteria.qr = { dibujar, escanear, interpretar, texto };
})();
