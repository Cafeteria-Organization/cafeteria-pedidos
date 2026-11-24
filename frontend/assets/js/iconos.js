// ============================================================
// Íconos de la franja de categorías (estilo sólido, como el diseño)
// y búsqueda de texto sin tildes ni mayúsculas.
// Las fotos de los productos vienen del backend (campo imagen).
// ============================================================
(function () {
  const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const svg = (contenido) => `<svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">${contenido}</svg>`;
  const trazo = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';

  const ICONOS = {
    // taza humeante sobre su plato
    cafe: svg(`<rect x="13" y="5" width="3.6" height="9" rx="1.8"/><rect x="19.7" y="3" width="3.6" height="11" rx="1.8"/>
      <rect x="26.4" y="5" width="3.6" height="9" rx="1.8"/>
      <path d="M7 18h28v9.5C35 34.4 29.4 40 22.5 40h-3C12.6 40 7 34.4 7 27.5V18Z"/>
      <path d="M35 21h2.5a5.5 5.5 0 0 1 0 11H34" ${trazo} stroke-width="3.6"/>
      <rect x="4" y="42" width="34" height="3.6" rx="1.8"/>`),
    // huevo frito
    desayuno: svg(`<path fill-rule="evenodd" d="M25 4c6.5 0 9.4 4.6 12.6 7.3 3.4 2.9 7.4 4.9 7.4 11.4 0 6.8-4.4 9.4-7.6 12.6C34.6 38.1 31.6 44 23 44c-8.8 0-12.2-5.2-15-8.3C5 32.4 3 30 3 24.4c0-6.9 4.6-9.3 8-12.4C14.4 8.9 17.6 4 25 4ZM15 25a9 9 0 1 0 18 0a9 9 0 1 0-18 0ZM18.2 25a5.8 5.8 0 1 0 11.6 0a5.8 5.8 0 1 0-11.6 0Z"/>`),
    // sándwich triangular con relleno
    sandwich: svg(`<path d="M7 30 22 8.5a2.5 2.5 0 0 1 4 0L41 30Z" ${trazo} stroke-width="3" fill="currentColor"/>
      <path d="M5 34.5c2.6-2.4 4.4 2.4 7.4 0s4.4 2.4 7.4 0 4.4 2.4 7.4 0 4.4 2.4 7.4 0 4.4 2.4 7.4 0" ${trazo} stroke-width="3"/>
      <rect x="5" y="38.5" width="38" height="6" rx="3"/>`),
    // hamburguesa
    hamburguesa: svg(`<path d="M6 21C6 12.7 14 6 24 6s18 6.7 18 15c0 1.1-.9 2-2 2H8c-1.1 0-2-.9-2-2Z"/>
      <path d="M4.5 28.5c2.6-2.4 4.4 2.4 7.4 0s4.4 2.4 7.4 0 4.4 2.4 7.4 0 4.4 2.4 7.4 0 4.4 2.4 7.4 0" ${trazo} stroke-width="3"/>
      <rect x="6" y="32" width="36" height="4.5" rx="2.25"/>
      <path d="M6 39h36v1a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5v-1Z"/>`),
    // bowl con hojas
    ensalada: svg(`<path d="M23.5 21.5c-1.4-7.8 2.6-14.4 11.4-16.5 1.3 8.8-3 15-11.4 16.5Z"/>
      <path d="M20.5 21.5c-6.7-.6-11-5.7-10.4-12.6 6.6.1 11.3 5.6 10.4 12.6Z"/>
      <path d="M4 24h40c0 10.5-8.4 18-20 18S4 34.5 4 24Z"/>
      <rect x="15" y="42" width="18" height="3.6" rx="1.8"/>`),
    // vaso con bombilla
    bebida: svg(`<path d="M27 13 31.5 3H37" ${trazo} stroke-width="3.2"/>
      <path d="M10 13h28l-3.4 29.3A3 3 0 0 1 31.6 45H16.4a3 3 0 0 1-3-2.7L10 13Z"/>`),
    // helado en barquillo
    postre: svg(`<path d="M13.5 22.5a10.5 10.5 0 1 1 21 0Z"/>
      <path d="M12 25h24c0 1.6-1.3 3-3 3H15c-1.7 0-3-1.4-3-3Z"/>
      <path d="M15 30h18l-7.4 14.6a1.8 1.8 0 0 1-3.2 0L15 30Z"/>`),
    // caja de regalo (combos)
    combo: svg(`<path d="M24 16c-3.3-7.6-11.5-8.8-11.5-3.4 0 3.2 6.4 3.4 11.5 3.4Zm0 0c3.3-7.6 11.5-8.8 11.5-3.4 0 3.2-6.4 3.4-11.5 3.4Z"/>
      <rect x="5" y="17" width="16.5" height="8" rx="1.6"/><rect x="26.5" y="17" width="16.5" height="8" rx="1.6"/>
      <path d="M7 28h14.5v17H9a2 2 0 0 1-2-2V28Z"/><path d="M26.5 28H41v15a2 2 0 0 1-2 2H26.5V28Z"/>`),
    // plato con cubiertos (cualquier otra categoría)
    plato: svg(`<path fill-rule="evenodd" d="M10.5 24a13.5 13.5 0 1 0 27 0a13.5 13.5 0 1 0-27 0ZM16.5 24a7.5 7.5 0 1 0 15 0a7.5 7.5 0 1 0-15 0Z"/>
      <path d="M3.5 8v8a3 3 0 0 0 3 3M8.5 8v31M5.5 8v7" ${trazo} stroke-width="2.6"/>
      <path d="M44.5 8c-3.6 2.2-4.8 7-4.8 11.5h4.8V39" ${trazo} stroke-width="2.6"/>`),
  };

  // ---------- galería: íconos propios + los de iconos-galeria.js ----------
  // Cada ícono tiene palabras clave para sugerirlo según el nombre de la categoría.
  const PROPIOS = [
    ['combo', 'Combos', 'combo promo pack'],
    ['cafe', 'Cafetería', 'cafe cafeteria capuchino expreso latte moca'],
    ['desayuno', 'Desayunos', 'desayuno huevo merienda'],
    ['sandwich', 'Sándwiches', 'sandwich sanduche emparedado tostado sandwiches'],
    ['hamburguesa', 'Comida rápida', 'comida hamburguesa rapida hot dog salchipapa'],
    ['ensalada', 'Ensaladas', 'ensalada fit saludable vegano vegetariano light'],
    ['bebida', 'Bebidas', 'bebida jugo refresco batido frio'],
    ['postre', 'Postres', 'postre dulce torta helado gelatina reposteria'],
    ['plato', 'General', 'general otros varios'],
  ];
  const GALERIA = PROPIOS.map(([id, nombre, claves]) => ({ id, nombre, grupo: 'Cafetería', claves: claves.split(' '), svg: ICONOS[id] }))
    .concat((window.CAFETERIA_GALERIA || []).map(([id, nombre, grupo, claves, d]) => ({
      id, nombre, grupo, claves: claves.split(' '),
      svg: `<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`,
    })));
  const PORID = new Map(GALERIA.map((g) => [g.id, g]));

  // Íconos que mejor van con un nombre (de más a menos parecido). Ej.: "Empanadas" → horno.
  function sugerir(nombre, cuantos = 6) {
    const palabras = normalizar(nombre).split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
    if (!palabras.length) return [];
    const puntaje = (g) => palabras.reduce((total, w) => total + Math.max(0, ...g.claves.map((k) => {
      if (w === k || w === k + 's' || w === k + 'es') return 6;
      if (k.length >= 4 && w.startsWith(k)) return 4;
      if (w.length >= 4 && k.startsWith(w)) return 3;                      // mientras se escribe
      if (w.length >= 5 && k.length >= 5 && w.slice(0, 5) === k.slice(0, 5)) return 2;
      return 0;
    })), 0) + (normalizar(g.nombre) === palabras.join(' ') ? 2 : 0);
    return GALERIA.map((g, i) => ({ g, p: puntaje(g), i }))
      .filter((x) => x.p > 0)
      .sort((a, b) => b.p - a.p || a.i - b.i)
      .slice(0, cuantos)
      .map((x) => x.g.id);
  }

  // Buscar en la galería por nombre o palabra clave.
  function buscarIconos(texto) {
    const t = normalizar(texto).trim();
    if (!t) return GALERIA;
    const porNombre = sugerir(t, 99);
    const resto = GALERIA.filter((g) => !porNombre.includes(g.id)
      && (normalizar(g.nombre).includes(t) || normalizar(g.grupo).includes(t) || g.claves.some((k) => k.includes(t))));
    return porNombre.map((id) => PORID.get(id)).concat(resto);
  }

  const svgDe = (id) => (PORID.get(id) || PORID.get('plato')).svg;

  // Logos e íconos que el administrador eligió para cada categoría (por nombre normalizado).
  const logos = new Map();
  const elegidos = new Map();
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function recordarLogos(lista) {
    (lista || []).forEach((c) => {
      if (!c || typeof c !== 'object' || !c.nombre) return;
      const n = normalizar(c.nombre);
      if (c.logo_url) logos.set(n, c.logo_url);
      else if ('logo_url' in c) logos.delete(n);
      if (c.icono && PORID.has(c.icono)) elegidos.set(n, c.icono);
      else if ('icono' in c) elegidos.delete(n);
    });
  }
  const logoDe = (nombre) => logos.get(normalizar(nombre)) || null;
  const iconoElegido = (nombre) => elegidos.get(normalizar(nombre)) || null;

  // Prioridad: imagen subida → ícono elegido → ícono sugerido por el nombre.
  function iconoCategoria(nombre) {
    const logo = logoDe(nombre);
    if (logo) return `<img class="logo-categoria" src="${esc(logo)}" alt="" aria-hidden="true" loading="lazy">`;
    const elegido = iconoElegido(nombre);
    return elegido ? svgDe(elegido) : iconoPorNombre(nombre);
  }

  function iconoPorNombre(nombre) {
    return svgDe(sugerir(nombre, 1)[0] || 'plato');
  }

  // ---------- categorías del menú ----------
  // Vienen del servidor (GET /categorias) en el orden del menú. Un producto puede
  // tener varias: p.categorias = [{ id, nombre }], y p.categoria es la principal.
  let ordenServidor = [];   // nombres normalizados en el orden del servidor

  function recordarOrden(lista) {
    ordenServidor = (lista || []).map((c) => normalizar(c.nombre || c));
    recordarLogos(lista);
  }

  function ordenarCategorias(nombres) {
    const orden = ordenServidor.length ? ordenServidor : (window.CAFETERIA_CONFIG.ORDEN_CATEGORIAS || []).map(normalizar);
    const puesto = (c) => { const i = orden.indexOf(normalizar(c)); return i < 0 ? orden.length : i; };
    return nombres.slice().sort((a, b) => puesto(a) - puesto(b) || a.localeCompare(b, 'es'));
  }

  // Nombres de las categorías de un producto (todas, la principal primero).
  function categoriasDe(p) {
    if (p && p.categorias) recordarLogos(p.categorias);
    const nombres = (p && p.categorias && p.categorias.length)
      ? p.categorias.map((c) => (typeof c === 'string' ? c : c.nombre))
      : [p && p.categoria].filter(Boolean);
    const principal = p && p.categoria;
    return principal && nombres.includes(principal) ? [principal].concat(nombres.filter((n) => n !== principal)) : nombres;
  }

  window.Cafeteria = Object.assign(window.Cafeteria || {}, {
    iconos: { iconoCategoria, iconoPorNombre, logoDe, iconoElegido, recordarLogos, sugerir, buscarIconos, svgDe, GALERIA, normalizar, ordenarCategorias, recordarOrden, categoriasDe },
  });
})();
