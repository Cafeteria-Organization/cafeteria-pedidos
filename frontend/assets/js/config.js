// ============================================================
// Configuración del frontend.
// Dirección de la API de Laravel (proy-cafeteria). Con
// `php artisan serve` queda en http://127.0.0.1:8000, y todas las
// rutas de routes/api.php cuelgan de /api.
// Si levantas Laravel en otro puerto o con Apache, cambia solo esta línea.
// ============================================================
// Carpeta raíz del sitio (donde está index.html), calculada a partir de
// la ubicación de este archivo: funciona igual en /CAFETERIA_5/ o en otra carpeta.
const RAIZ_SITIO = (function () {
  const src = document.currentScript && document.currentScript.src;
  return src ? src.replace(/assets\/js\/config\.js.*$/, '') : '/';
})();

window.CAFETERIA_CONFIG = {
  API_URL: 'http://127.0.0.1:8000/api',

  // Páginas del sitio (cada una es una carpeta con su index.html).
  RUTAS: {
    inicio: RAIZ_SITIO,
    menu: RAIZ_SITIO + '#menu',
    ingresar: RAIZ_SITIO + 'ingresar/',
    registro: RAIZ_SITIO + 'ingresar/#registro',
    pedido: RAIZ_SITIO + '#pedido',
    pedidos: RAIZ_SITIO + 'mis-pedidos/',
    cocina: RAIZ_SITIO + 'cocina/',
    productos: RAIZ_SITIO + 'admin/productos/',
    personal: RAIZ_SITIO + 'admin/personal/',
  },

  // Roles tal como los crea el DatabaseSeeder de Laravel (tabla ROL).
  ROLES: { 1: 'Admin', 2: 'Empleado', 3: 'Cliente' },

  // Dominios que acepta AuthController@register.
  DOMINIOS_INSTITUCIONALES: ['@univalle.edu', '@est.univalle.edu'],

  // Cada cuántos milisegundos se refrescan los pedidos (cocina y "mis pedidos").
  REFRESCO_COCINA_MS: 5000,
  REFRESCO_CLIENTE_MS: 8000,
};
