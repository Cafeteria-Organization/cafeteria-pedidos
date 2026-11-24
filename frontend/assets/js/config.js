// ============================================================
// Configuración del frontend (CAFETERIA_6).
// Dirección de la API de Laravel (cafeteria-backend). Con
// `php artisan serve` queda en http://127.0.0.1:8000 y todas las
// rutas de routes/api.php cuelgan de /api.
// Si levantas Laravel en otro puerto o con Apache, cambia solo API_URL.
// ============================================================
// Carpeta raíz del sitio (donde está index.html), calculada a partir de
// la ubicación de este archivo: funciona igual en /CAFETERIA_6/ o en otra carpeta.
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
    pedido: RAIZ_SITIO + '#pedido',
    pedidos: RAIZ_SITIO + 'mis-pedidos/',
    cocina: RAIZ_SITIO + 'cocina/',
    productos: RAIZ_SITIO + 'admin/productos/',
    combos: RAIZ_SITIO + 'admin/combos/',
    empleados: RAIZ_SITIO + 'admin/empleados/',
    reportes: RAIZ_SITIO + 'admin/reportes/',
    politicas: RAIZ_SITIO + 'politicas/',
  },

  // Portal de la universidad (SIU), enlazado en el pie de página.
  UNIVALLE_URL: 'https://www.univalle.edu/',

  // Roles tal como los guarda la tabla users (columna rol).
  ROLES: { admin: 'Admin', empleado: 'Empleado', estudiante: 'Estudiante' },

  // Dominio de los correos institucionales de estudiantes y docentes.
  DOMINIO_UNIVALLE: 'univalle.edu',
  PASSWORD_MIN: 8,

  // Máximo de unidades por línea de pedido (config/cafeteria.php).
  MAX_POR_LINEA: 20,

  // Orden en que se muestran las categorías del menú (las demás van al final).
  ORDEN_CATEGORIAS: ['Cafetería', 'Desayunos', 'Sándwiches', 'Comida caliente', 'Ensaladas y fit', 'Bebidas', 'Postres'],

  // Cada cuántos milisegundos se refrescan los datos en vivo.
  REFRESCO_COCINA_MS: 5000,
  REFRESCO_CLIENTE_MS: 5000,
  REFRESCO_INVENTARIO_MS: 30000,

  // La sesión se cierra sola tras este tiempo sin usar la página (minutos).
  INACTIVIDAD_MIN: { estudiante: 30, empleado: 120, admin: 60 },
};
