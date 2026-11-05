<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Categoria;
use App\Models\Producto;
use App\Models\Usuario;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminController extends Controller
{
    // Lista TODOS los productos (también los agotados) para el panel de admin y cocina.
    // GET /admin/productos
    public function listarProductos()
    {
        $productos = Producto::with('categorias')->orderBy('nombre')->get();
        return response()->json([
            'success' => true,
            'data' => $productos,
            'categorias' => Categoria::orderBy('nombre')->get(['id_categoria', 'nombre'])
        ]);
    }

    public function storeProducto(Request $request)
    {
        $request->validate([
            'nombre' => 'required|string|max:100',
            'descripcion' => 'nullable|string',
            'precio' => 'required|numeric|min:0',
            'stock_actual' => 'required|integer|min:0',
            'categorias' => 'required|array', // IDs de las categorías
            'tiempo_preparacion' => 'nullable|integer|min:1|max:120', // HU-11
            'precio_oferta' => 'nullable|numeric|min:0'               // HU-21
        ]);
        if ($error = $this->errorOferta($request->precio_oferta, $request->precio)) {
            return response()->json(['success' => false, 'message' => $error], 422);
        }

        $datos = $request->only(['nombre', 'descripcion', 'precio', 'stock_actual', 'precio_oferta']);
        $datos['tiempo_preparacion'] = $request->tiempo_preparacion ?: 5;
        $producto = Producto::create($datos);
        // Relacionamos el producto con sus categorías en la tabla intermedia
        $producto->categorias()->attach($request->categorias);

        return response()->json(['success' => true, 'message' => 'Producto creado', 'data' => $producto], 201);
    }

    public function updateProducto(Request $request, $id)
    {
        $producto = Producto::find($id);
        if (!$producto) return response()->json(['success' => false, 'message' => 'No encontrado'], 404);

        $request->validate([
            'nombre' => 'sometimes|required|string|max:100',
            'descripcion' => 'nullable|string',
            'precio' => 'sometimes|required|numeric|min:0',
            'stock_actual' => 'sometimes|required|integer|min:0',
            'estado' => 'sometimes|required|in:Disponible,Agotado',
            'categorias' => 'sometimes|array',
            'tiempo_preparacion' => 'sometimes|required|integer|min:1|max:120',
            'precio_oferta' => 'nullable|numeric|min:0'
        ]);
        $precio = $request->has('precio') ? $request->precio : $producto->precio;
        $oferta = $request->has('precio_oferta') ? $request->precio_oferta : $producto->precio_oferta;
        if ($error = $this->errorOferta($oferta, $precio)) {
            return response()->json(['success' => false, 'message' => $error], 422);
        }

        // HU-15: si cambia el stock, el trigger guarda este motivo y quién lo hizo
        DB::statement("SET @motivo_stock = ?, @usuario_stock = ?", ['Ajuste manual del administrador', $request->user()->id_usuario]);
        $producto->update($request->only(['nombre', 'descripcion', 'precio', 'stock_actual', 'estado', 'tiempo_preparacion', 'precio_oferta']));
        DB::statement("SET @motivo_stock = NULL, @usuario_stock = NULL");
        if ($request->has('categorias')) {
            $producto->categorias()->sync($request->categorias); // Actualiza la tabla intermedia
        }

        return response()->json(['success' => true, 'message' => 'Producto actualizado']);
    }

    private function errorOferta($oferta, $precio): ?string
    {
        if ($oferta === null || $oferta === '') return null;
        if ((float) $oferta <= 0) return 'El precio de oferta debe ser mayor a 0.';
        if ((float) $oferta >= (float) $precio) return 'El precio de oferta debe ser menor que el precio normal (Bs ' . number_format((float) $precio, 2) . ').';
        return null;
    }

    public function listarPersonal()
    {
        // Lista usuarios que sean Administradores (1) o Empleados (2)
        $personal = Usuario::select('id_usuario', 'id_rol', 'nombre', 'correo', 'fecha_registro')
            ->whereIn('id_rol', [1, 2])
            ->orderBy('nombre')
            ->get();
        return response()->json(['success' => true, 'data' => $personal]);
    }

    public function asignarRol(Request $request, $id_usuario)
    {
        $request->validate(['id_rol' => 'required|integer|exists:ROL,id_rol']);
        $usuario = Usuario::find($id_usuario);
        if (!$usuario) return response()->json(['success' => false, 'message' => 'Usuario no encontrado'], 404);

        $usuario->id_rol = $request->id_rol;
        $usuario->save();

        return response()->json(['success' => true, 'message' => 'Rol actualizado correctamente']);
    }

    // HU-19: Reapertura rápida de productos agotados (Cambio de estado)
    // Registra en HISTORIAL_STOCK quién y a qué hora hizo el cambio.
    public function toggleEstadoProducto(Request $request, $id)
    {
        $producto = Producto::find($id);

        if (!$producto) {
            return response()->json(['success' => false, 'message' => 'Producto no encontrado'], 404);
        }

        // Alterna el estado entre Disponible y Agotado
        $producto->estado = ($producto->estado === 'Disponible') ? 'Agotado' : 'Disponible';
        $producto->save();

        DB::table('HISTORIAL_STOCK')->insert([
            'id_producto' => $producto->id_producto,
            'id_usuario' => $request->user()->id_usuario,
            'cantidad_anterior' => $producto->stock_actual,
            'cantidad_nueva' => $producto->stock_actual,
            'motivo' => $producto->estado === 'Agotado' ? 'Marcado como Agotado' : 'Reactivado (Disponible)',
            'fecha_cambio' => DB::raw('CURRENT_TIMESTAMP')
        ]);

        return response()->json([
            'success' => true,
            'message' => 'El producto ahora está marcado como: ' . $producto->estado,
            'data' => [
                'id_producto' => $producto->id_producto,
                'estado' => $producto->estado,
                'cambiado_por' => $request->user()->nombre,
                'fecha_cambio' => DB::selectOne('SELECT DATE_FORMAT(NOW(), "%Y-%m-%d %H:%i:%s") AS f')->f
            ]
        ]);
    }

    // HU-15 / HU-19: Ver el historial de movimientos de stock y disponibilidad
    // GET /admin/stock/historial?producto=ID (el filtro es opcional)
    public function historialStock(Request $request)
    {
        $query = DB::table('HISTORIAL_STOCK as h')
            ->join('PRODUCTO as p', 'p.id_producto', '=', 'h.id_producto')
            ->leftJoin('USUARIO as u', 'u.id_usuario', '=', 'h.id_usuario')
            ->select('h.id_historial_stock', 'h.id_producto', 'p.nombre as producto',
                     'h.cantidad_anterior', 'h.cantidad_nueva', 'h.motivo',
                     'h.id_usuario', 'u.nombre as usuario', 'h.fecha_cambio')
            ->orderBy('h.fecha_cambio', 'desc')
            ->orderBy('h.id_historial_stock', 'desc')
            ->limit(200);

        if ($request->filled('producto')) {
            $query->where('h.id_producto', $request->producto);
        }

        return response()->json(['success' => true, 'data' => $query->get()]);
    }

    // ------------------------------------------------------------------
    // Iteración 5
    // ------------------------------------------------------------------

    // Rango de fechas del filtro (por defecto, los últimos 7 días según la hora de MySQL)
    private function rangoFechas(Request $request, int $diasPorDefecto = 7): array
    {
        $request->validate([
            'desde' => 'nullable|date_format:Y-m-d',
            'hasta' => 'nullable|date_format:Y-m-d',
        ]);
        $hoy = DB::selectOne('SELECT CURDATE() AS d')->d;
        $hasta = $request->hasta ?: $hoy;
        $desde = $request->desde ?: Carbon::parse($hasta)->subDays($diasPorDefecto - 1)->toDateString();
        if ($desde > $hasta) return [null, null, 'La fecha "desde" no puede ser posterior a la fecha "hasta".'];
        if (Carbon::parse($desde)->diffInDays(Carbon::parse($hasta)) > 366) return [null, null, 'El rango no puede ser mayor a un año.'];
        return [$desde, $hasta, null];
    }

    // HU-22: Reporte de ventas por día o semana + productos más vendidos
    // GET /admin/reportes/ventas?desde=2026-11-01&hasta=2026-11-07&agrupar=dia|semana
    // Solo cuenta pedidos "Entregado" (los que el cliente recogió y pagó).
    public function reporteVentas(Request $request)
    {
        $request->validate(['agrupar' => 'nullable|in:dia,semana']);
        [$desde, $hasta, $error] = $this->rangoFechas($request);
        if ($error) return response()->json(['success' => false, 'message' => $error], 422);
        $agrupar = $request->agrupar ?: 'dia';

        $periodo = $agrupar === 'semana'
            ? 'DATE_SUB(DATE(fecha_pedido), INTERVAL WEEKDAY(fecha_pedido) DAY)'
            : 'DATE(fecha_pedido)';
        $rango = "estado = 'Entregado' AND fecha_pedido >= ? AND fecha_pedido < DATE_ADD(?, INTERVAL 1 DAY)";

        $filas = collect(DB::select("SELECT {$periodo} AS periodo, SUM(total) AS ingresos, COUNT(*) AS pedidos
                                       FROM PEDIDO WHERE {$rango}
                                      GROUP BY {$periodo} ORDER BY periodo", [$desde, $hasta]))
            ->keyBy(fn ($f) => (string) $f->periodo);

        // Todos los días (o semanas) del rango, también los que no tuvieron ventas
        $ventas = [];
        $paso = Carbon::parse($desde);
        if ($agrupar === 'semana') $paso = $paso->startOfWeek(Carbon::MONDAY);
        $fin = Carbon::parse($hasta);
        while ($paso->lte($fin)) {
            $clave = $paso->toDateString();
            $f = $filas->get($clave);
            $ventas[] = [
                'periodo' => $clave,
                'fin' => $agrupar === 'semana' ? $paso->copy()->addDays(6)->toDateString() : $clave,
                'ingresos_totales' => $f ? round((float) $f->ingresos, 2) : 0,
                'pedidos_completados' => $f ? (int) $f->pedidos : 0,
            ];
            $agrupar === 'semana' ? $paso->addWeek() : $paso->addDay();
        }

        $top = DB::select("SELECT pr.id_producto, pr.nombre, SUM(d.cantidad) AS unidades,
                                  SUM(d.cantidad * d.precio_unitario) AS ingresos, COUNT(DISTINCT p.id_pedido) AS pedidos
                             FROM DETALLE_PEDIDO d
                             JOIN PEDIDO p ON p.id_pedido = d.id_pedido
                             JOIN PRODUCTO pr ON pr.id_producto = d.id_producto
                            WHERE p.{$this->conTabla($rango)}
                            GROUP BY pr.id_producto, pr.nombre
                            ORDER BY unidades DESC, ingresos DESC
                            LIMIT 10", [$desde, $hasta]);

        $resumen = DB::selectOne("SELECT COALESCE(SUM(total), 0) AS ingresos, COUNT(*) AS pedidos FROM PEDIDO WHERE {$rango}", [$desde, $hasta]);
        $unidades = DB::selectOne("SELECT COALESCE(SUM(d.cantidad), 0) AS u FROM DETALLE_PEDIDO d JOIN PEDIDO p ON p.id_pedido = d.id_pedido WHERE p.{$this->conTabla($rango)}", [$desde, $hasta])->u;
        $cancelados = DB::selectOne("SELECT COUNT(*) AS c FROM PEDIDO WHERE estado = 'Cancelado' AND fecha_pedido >= ? AND fecha_pedido < DATE_ADD(?, INTERVAL 1 DAY)", [$desde, $hasta])->c;

        return response()->json([
            'success' => true,
            'data' => [
                'desde' => $desde,
                'hasta' => $hasta,
                'agrupar' => $agrupar,
                'resumen' => [
                    'ingresos_totales' => round((float) $resumen->ingresos, 2),
                    'pedidos_completados' => (int) $resumen->pedidos,
                    'ticket_promedio' => $resumen->pedidos ? round($resumen->ingresos / $resumen->pedidos, 2) : 0,
                    'unidades_vendidas' => (int) $unidades,
                    'pedidos_cancelados' => (int) $cancelados,
                ],
                'ventas' => $ventas,
                'top_productos' => array_map(fn ($t) => [
                    'id_producto' => $t->id_producto,
                    'nombre' => $t->nombre,
                    'unidades' => (int) $t->unidades,
                    'ingresos' => round((float) $t->ingresos, 2),
                    'pedidos' => (int) $t->pedidos,
                ], $top),
            ]
        ]);
    }

    // "estado = ... AND fecha_pedido ..." → "estado = ... AND p.fecha_pedido ..." (para consultas con JOIN)
    private function conTabla(string $condicion): string
    {
        return str_replace(' AND fecha_pedido', ' AND p.fecha_pedido', $condicion);
    }

    // HU-25: Panel de retroalimentación (resumen, promedio, por producto y comentarios)
    // GET /admin/feedback?desde=&hasta=&producto=
    public function listarFeedback(Request $request)
    {
        $request->validate([
            'desde' => 'nullable|date_format:Y-m-d',
            'hasta' => 'nullable|date_format:Y-m-d',
            'producto' => 'nullable|integer',
        ]);
        if ($request->desde && $request->hasta && $request->desde > $request->hasta) {
            return response()->json(['success' => false, 'message' => 'La fecha "desde" no puede ser posterior a la fecha "hasta".'], 422);
        }

        $condiciones = ['1 = 1'];
        $params = [];
        if ($request->desde) { $condiciones[] = 'f.fecha >= ?'; $params[] = $request->desde; }
        if ($request->hasta) { $condiciones[] = 'f.fecha < DATE_ADD(?, INTERVAL 1 DAY)'; $params[] = $request->hasta; }
        if ($request->producto) {
            $condiciones[] = 'EXISTS (SELECT 1 FROM DETALLE_PEDIDO dx WHERE dx.id_pedido = f.id_pedido AND dx.id_producto = ?)';
            $params[] = (int) $request->producto;
        }
        $donde = implode(' AND ', $condiciones);

        $resumen = DB::selectOne("SELECT COUNT(*) AS total, AVG(f.calificacion) AS promedio,
                                         SUM(f.calificacion = 5) AS e5, SUM(f.calificacion = 4) AS e4, SUM(f.calificacion = 3) AS e3,
                                         SUM(f.calificacion = 2) AS e2, SUM(f.calificacion = 1) AS e1,
                                         SUM(f.comentario IS NOT NULL AND f.comentario <> '') AS con_comentario
                                    FROM FEEDBACK f WHERE {$donde}", $params);

        $porProducto = DB::select("SELECT pr.id_producto, pr.nombre, ROUND(AVG(f.calificacion), 2) AS promedio,
                                          COUNT(DISTINCT f.id_feedback) AS calificaciones
                                     FROM FEEDBACK f
                                     JOIN (SELECT DISTINCT id_pedido, id_producto FROM DETALLE_PEDIDO) d ON d.id_pedido = f.id_pedido
                                     JOIN PRODUCTO pr ON pr.id_producto = d.id_producto
                                    WHERE {$donde}
                                    GROUP BY pr.id_producto, pr.nombre
                                    ORDER BY promedio ASC, calificaciones DESC", $params);

        $comentarios = DB::select("SELECT f.id_feedback, f.id_pedido, f.calificacion, f.comentario, f.fecha,
                                          u.nombre AS usuario, p.total,
                                          (SELECT GROUP_CONCAT(DISTINCT pr.nombre ORDER BY pr.nombre SEPARATOR ', ')
                                             FROM DETALLE_PEDIDO d JOIN PRODUCTO pr ON pr.id_producto = d.id_producto
                                            WHERE d.id_pedido = f.id_pedido) AS productos
                                     FROM FEEDBACK f
                                     JOIN USUARIO u ON u.id_usuario = f.id_usuario
                                     JOIN PEDIDO p ON p.id_pedido = f.id_pedido
                                    WHERE {$donde}
                                    ORDER BY f.fecha DESC, f.id_feedback DESC
                                    LIMIT 300", $params);

        return response()->json([
            'success' => true,
            'data' => [
                'resumen' => [
                    'total' => (int) $resumen->total,
                    'promedio' => $resumen->total ? round((float) $resumen->promedio, 2) : null,
                    'con_comentario' => (int) $resumen->con_comentario,
                    'distribucion' => [
                        '5' => (int) $resumen->e5, '4' => (int) $resumen->e4, '3' => (int) $resumen->e3,
                        '2' => (int) $resumen->e2, '1' => (int) $resumen->e1,
                    ],
                ],
                'por_producto' => array_map(fn ($r) => [
                    'id_producto' => $r->id_producto, 'nombre' => $r->nombre,
                    'promedio' => (float) $r->promedio, 'calificaciones' => (int) $r->calificaciones,
                ], $porProducto),
                'comentarios' => $comentarios,
            ]
        ]);
    }

    // HU-21: oferta de un producto suelto (precio_oferta = null la quita)
    public function configurarOferta(Request $request, $id_producto)
    {
        $producto = Producto::find($id_producto);
        if (!$producto) return response()->json(['success' => false, 'message' => 'Producto no encontrado'], 404);

        $request->validate([
            'precio_oferta' => 'nullable|numeric|min:0',
            'es_combo' => 'nullable|boolean'
        ], [
            'precio_oferta.numeric' => 'El precio de oferta debe ser un número.',
        ]);
        if ($error = $this->errorOferta($request->precio_oferta, $producto->precio)) {
            return response()->json(['success' => false, 'message' => $error], 422);
        }

        $producto->precio_oferta = $request->precio_oferta; // Null para quitar la oferta
        $producto->es_combo = (bool) ($request->es_combo ?? false);
        $producto->save();

        return response()->json(['success' => true, 'message' => $request->precio_oferta === null ? 'Oferta quitada.' : 'Oferta guardada.']);
    }
}
