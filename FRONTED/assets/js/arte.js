// ============================================================
// Ilustraciones SVG de la interfaz (sin imágenes externas).
// La API todavía no tiene columna de foto para los productos, así que
// cada tarjeta se ilustra según el tipo de producto (taza, jugo,
// salteña o postre). Solo dibujan: no llaman a la API.
// ============================================================
(function () {
  // Generador pseudoaleatorio con semilla: el dibujo sale igual en cada carga.
  function aleatorio(semilla) {
    let a = semilla >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const entre = (r, min, max) => min + r() * (max - min);

  // Degradados compartidos: se insertan una sola vez en el documento.
  const DEFS = `
    <linearGradient id="g-grano" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6b3d24"/><stop offset="1" stop-color="#2b160c"/></linearGradient>
    <radialGradient id="g-plato" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#f6f4f0"/><stop offset="1" stop-color="#c9c4ba"/></radialGradient>
    <radialGradient id="g-taza" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d8d3ca"/></radialGradient>
    <radialGradient id="g-cafe" cx=".45" cy=".35" r=".75"><stop offset="0" stop-color="#dfa96d"/><stop offset=".6" stop-color="#b8752f"/><stop offset="1" stop-color="#7b431c"/></radialGradient>
    <radialGradient id="g-jugo" cx=".42" cy=".38" r=".75"><stop offset="0" stop-color="#ffd27a"/><stop offset=".65" stop-color="#f39a1e"/><stop offset="1" stop-color="#c9670c"/></radialGradient>
    <radialGradient id="g-masa" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#f0b56a"/><stop offset=".7" stop-color="#c97a34"/><stop offset="1" stop-color="#8e4a1c"/></radialGradient>
    <linearGradient id="g-torta" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6a3a22"/><stop offset="1" stop-color="#2e160b"/></linearGradient>
    <radialGradient id="g-galleta" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#f3d3a4"/><stop offset=".7" stop-color="#d9a868"/><stop offset="1" stop-color="#a86f36"/></radialGradient>`;

  function asegurarDefs() {
    if (document.getElementById('arte-defs')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', 'arte-defs');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    svg.innerHTML = '<defs>' + DEFS + '</defs>';
    document.body.prepend(svg);
  }

  // ---------- piezas ----------
  function granos(cantidad, semilla, ancho, alto) {
    const r = aleatorio(semilla);
    let o = '';
    for (let i = 0; i < cantidad; i++) {
      const x = entre(r, 0, ancho).toFixed(1);
      const y = entre(r, 0, alto).toFixed(1);
      const a = Math.floor(entre(r, 0, 360));
      const s = entre(r, 0.8, 1.25).toFixed(2);
      o += `<g transform="translate(${x} ${y}) rotate(${a}) scale(${s})">`
        + '<ellipse rx="17" ry="11" fill="url(#g-grano)"/>'
        + '<ellipse rx="17" ry="11" fill="none" stroke="#9a6a48" stroke-opacity=".35"/>'
        + '<path d="M-15 0 C-6 -5 6 5 15 0" fill="none" stroke="#150a05" stroke-width="2" stroke-linecap="round"/>'
        + '</g>';
    }
    return o;
  }

  const CORAZON = 'M0 40 C-50 5 -46 -45 -18 -45 C-8 -45 0 -38 0 -30 C0 -38 8 -45 18 -45 C46 -45 50 5 0 40 Z';

  // Plato base (radio 180) con sombra.
  function plato() {
    return '<circle r="184" cy="10" fill="#000" opacity=".28"/>'
      + '<circle r="180" fill="url(#g-plato)"/>'
      + '<circle r="142" fill="none" stroke="#d6d1c7" stroke-width="3"/>';
  }

  // Taza vista desde arriba con arte latte.
  function taza() {
    return plato()
      + '<path d="M-100 -22 H-146 Q-172 -22 -172 2 Q-172 26 -146 26 H-100" fill="none" stroke="#bfb9ae" stroke-width="24" stroke-linecap="round"/>'
      + '<path d="M-100 -22 H-146 Q-172 -22 -172 2 Q-172 26 -146 26 H-100" fill="none" stroke="#f4f1ec" stroke-width="18" stroke-linecap="round"/>'
      + '<circle r="114" fill="url(#g-taza)"/>'
      + '<circle r="94" fill="#f7f5f1" stroke="#cfcac1"/>'
      + '<circle r="84" fill="url(#g-cafe)"/>'
      + `<path d="${CORAZON}" fill="#f6e9d4" opacity=".95" transform="translate(0 -2) scale(1.25)"/>`
      + `<path d="${CORAZON}" fill="#b8752f" opacity=".85" transform="translate(0 2) scale(.85)"/>`
      + `<path d="${CORAZON}" fill="#f6e9d4" transform="translate(0 6) scale(.5)"/>`;
  }

  // Vaso de jugo visto desde arriba, con rodaja y bombilla.
  function jugo() {
    let gajos = '';
    for (let i = 0; i < 8; i++) {
      gajos += `<path d="M0 0 L${(38 * Math.cos(i * Math.PI / 4)).toFixed(1)} ${(38 * Math.sin(i * Math.PI / 4)).toFixed(1)}" stroke="#fff6df" stroke-width="3"/>`;
    }
    return '<circle r="150" cy="10" fill="#000" opacity=".3"/>'
      + '<circle r="146" fill="#e9f1f3" opacity=".55" stroke="#ffffff" stroke-opacity=".8" stroke-width="4"/>'
      + '<circle r="128" fill="url(#g-jugo)"/>'
      + '<ellipse cx="-40" cy="-54" rx="46" ry="20" fill="#fff" opacity=".25" transform="rotate(-30)"/>'
      + '<g transform="translate(74 -72)"><circle r="50" fill="#f7a825" stroke="#fff3d6" stroke-width="7"/>'
      + '<circle r="40" fill="#ffc553"/>' + gajos + '</g>'
      + '<path d="M-12 -12 L-150 -150" stroke="#2b0d0a" stroke-width="16" stroke-linecap="round"/>'
      + '<path d="M-12 -12 L-150 -150" stroke="#c94a3c" stroke-width="10" stroke-linecap="round" stroke-dasharray="18 14"/>';
  }

  // Salteña / empanada sobre plato.
  function saltena() {
    let repulgue = '';
    for (let i = -5; i <= 5; i++) {
      const x = i * 22;
      const y = -6 - Math.sqrt(Math.max(0, 1 - (x / 130) ** 2)) * 8;
      repulgue += `<ellipse cx="${x}" cy="${y.toFixed(1)}" rx="13" ry="9" fill="#a85c26" stroke="#6e3712" stroke-width="2" transform="rotate(${i * 6} ${x} ${y.toFixed(1)})"/>`;
    }
    return plato()
      + '<ellipse cx="0" cy="18" rx="138" ry="84" fill="#000" opacity=".18"/>'
      + '<ellipse cx="0" cy="8" rx="134" ry="82" fill="url(#g-masa)"/>'
      + '<ellipse cx="-38" cy="-18" rx="52" ry="18" fill="#ffe0ad" opacity=".35" transform="rotate(-12)"/>'
      + repulgue
      + '<circle cx="-60" cy="40" r="3" fill="#8e4a1c"/><circle cx="50" cy="48" r="3" fill="#8e4a1c"/><circle cx="10" cy="60" r="2.5" fill="#8e4a1c"/>';
  }

  // Porción de torta vista desde arriba.
  function torta() {
    return plato()
      + '<path d="M-10 -120 L110 90 Q0 130 -110 90 Z" fill="#000" opacity=".18" transform="translate(6 10)"/>'
      + '<path d="M-10 -120 L110 90 Q0 130 -110 90 Z" fill="url(#g-torta)"/>'
      + '<path d="M-110 90 Q0 130 110 90" fill="none" stroke="#f3e2c8" stroke-width="10" stroke-linecap="round"/>'
      + '<path d="M-60 20 Q-30 0 0 20 T60 20" fill="none" stroke="#f3e2c8" stroke-width="7" stroke-linecap="round" opacity=".9"/>'
      + '<path d="M-40 -30 Q-15 -48 10 -30 T50 -26" fill="none" stroke="#f3e2c8" stroke-width="6" stroke-linecap="round" opacity=".8"/>'
      + '<g transform="translate(8 58)"><path d="M0 -22 C18 -22 26 -4 16 12 C10 22 -10 22 -16 12 C-26 -4 -18 -22 0 -22 Z" fill="#c8202c"/>'
      + '<path d="M-10 -24 L0 -32 L10 -24 L4 -18 L-4 -18 Z" fill="#3f7a2e"/>'
      + '<circle cx="-6" cy="-4" r="1.8" fill="#ffd9a0"/><circle cx="6" cy="2" r="1.8" fill="#ffd9a0"/><circle cx="-2" cy="10" r="1.8" fill="#ffd9a0"/></g>';
  }

  function galleta(x, y, s, semilla) {
    const r = aleatorio(semilla);
    let chispas = '';
    for (let i = 0; i < 7; i++) {
      chispas += `<circle cx="${entre(r, -26, 26).toFixed(1)}" cy="${entre(r, -26, 26).toFixed(1)}" r="${entre(r, 3, 6).toFixed(1)}" fill="#4a2410"/>`;
    }
    return `<g transform="translate(${x} ${y}) scale(${s})"><circle r="44" cy="4" fill="#000" opacity=".3"/>`
      + '<circle r="42" fill="url(#g-galleta)"/>' + chispas + '</g>';
  }

  // ---------- composiciones ----------
  function hero() {
    asegurarDefs();
    const r = aleatorio(11);
    let especias = '';
    for (let i = 0; i < 45; i++) {
      especias += `<circle cx="${Math.floor(entre(r, 20, 330))}" cy="${Math.floor(entre(r, 60, 300))}" r="${entre(r, 0.8, 2.2).toFixed(1)}" fill="#d2691e" opacity="${entre(r, 0.35, 0.8).toFixed(2)}"/>`;
    }
    return '<svg viewBox="0 0 640 560" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="presentation">'
      + granos(170, 7, 640, 560) + especias
      + galleta(600, 175, 0.85, 3) + galleta(575, 470, 0.75, 5)
      + '<g transform="translate(395 285) scale(.72)">' + taza() + '</g>'
      + '</svg>';
  }

  function banda(semilla) {
    asegurarDefs();
    return '<svg viewBox="0 0 300 170" preserveAspectRatio="xMidYMid slice" aria-hidden="true">'
      + granos(48, semilla, 300, 170) + '</svg>';
  }

  const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function tipoProducto(nombre, categoria) {
    const n = normalizar(nombre + ' ' + (categoria || ''));
    if (/torta|postre|cheesecake|pastel|queque|brownie|helado|dulce|galleta|gelatina|flan/.test(n)) return 'torta';
    if (/jugo|limonada|refresco|agua|batido|smoothie|soda|gaseosa/.test(n)) return 'jugo';
    if (/salte|empanada|tucuman|sandwich|desayun|comida|almuerzo|plato|snack|hamburg/.test(n)) return 'saltena';
    return 'taza';
  }

  function producto(nombre, categoria) {
    asegurarDefs();
    const dibujos = { taza, jugo, saltena, torta };
    return '<svg viewBox="-200 -200 400 400" role="presentation">' + dibujos[tipoProducto(nombre, categoria)]() + '</svg>';
  }

  // Íconos lineales para la franja de categorías.
  function iconoCategoria(nombre) {
    const n = normalizar(nombre);
    const a = 'viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    if (/postre|dulce|torta|pastel|helado|gelatina/.test(n)) {
      return `<svg ${a}><path d="M7 33h26M9 33V22h22v11M9 27c3 2 5 2 7 0s5-2 7 0 5 2 8 0"/><path d="M20 22v-6M20 16c-1.5-1.5-1.5-3 0-4.5 1.5 1.5 1.5 3 0 4.5Z"/></svg>`;
    }
    if (/jugo|refresco|batido|bebida fria|frio/.test(n)) {
      return `<svg ${a}><path d="M11 12h18l-2.5 21a2 2 0 0 1-2 1.8h-9a2 2 0 0 1-2-1.8L11 12Z"/><path d="M12 19h16M23 12l4-7h4"/></svg>`;
    }
    if (/bebida/.test(n)) {
      return `<svg ${a}><path d="M12 10h16l-1.5 22a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2L12 10Z"/><path d="M11 10h18M13 6h14v4H13z"/><path d="M14 20h12"/></svg>`;
    }
    if (/desayun|comida|caliente|plato|almuerzo|salte|sandwich/.test(n)) {
      return `<svg ${a}><circle cx="21" cy="22" r="10"/><circle cx="21" cy="22" r="5.5"/><path d="M6 9v7a2.5 2.5 0 0 0 2.5 2.5M11 9v9.5M6 13h5M8.5 18.5V33M35 9c-3 2-4 6-4 10h4v14"/></svg>`;
    }
    if (/snack|galleta|bocadillo|aperitivo/.test(n)) {
      return `<svg ${a}><path d="M11 14h18l-2 20H13L11 14Z"/><path d="M9 14h22M12 9h16v5H12z"/></svg>`;
    }
    return `<svg ${a}><path d="M8 17h20v8a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8v-8Z"/><path d="M28 19h2.5a3.5 3.5 0 0 1 0 7H28"/><path d="M14 8c0 2-2 2-2 4M20 8c0 2-2 2-2 4M26 8c0 2-2 2-2 4"/></svg>`;
  }

  window.Cafeteria = Object.assign(window.Cafeteria || {}, {
    arte: { asegurarDefs, hero, banda, producto, iconoCategoria, normalizar },
  });
})();
