<?php

namespace App\Http\Controllers;

use App\Exceptions\ReglaNegocioException;
use App\Models\Categoria;
use App\Models\Producto;
use App\Models\ProductoImagen;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProductoController extends Controller
{
    public function __construct(private StockService $stock)
    {
    }

    /** HU-04: menú digital público (solo disponibles) con búsqueda por nombre y filtro por categoría. */
    public function menu(Request $request)
    {
        $q = Producto::with('categorias:id,nombre,orden,logo,icono')->where('disponible', true);

        if ($request->filled('buscar')) {
            $q->where('nombre', 'like', '%' . addcslashes($request->query('buscar'), '%_\\') . '%');
        }
        if ($request->filled('categoria')) {
            $q->enCategoria($request->query('categoria'));
        }

        return response()->json($q->orderBy('nombre')->get());
    }

    /** HU-03: listado completo para el admin (incluye agotados). Con ?eliminados=1, los eliminados. */
    public function adminIndex(Request $request)
    {
        $q = Producto::with('categorias:id,nombre,orden,logo,icono');

        if ($request->boolean('eliminados')) {
            $q->onlyTrashed();
        }
        if ($request->filled('buscar')) {
            $q->where('nombre', 'like', '%' . addcslashes($request->query('buscar'), '%_\\') . '%');
        }

        return response()->json($q->orderBy('nombre')->get());
    }

    public function store(Request $request)
    {
        $datos = $request->validate($this->reglas());
        $categorias = $this->categoriasPedidas($request);
        $foto = $request->file('imagen');
        unset($datos['categorias'], $datos['imagen']);

        $datos['stock'] = $datos['stock'] ?? 0;
        $datos['disponible'] = $datos['stock'] > 0;
        if ($categorias !== null) {
            $datos['categoria'] = $categorias[0] ?? null;
        }

        $producto = DB::transaction(function () use ($datos, $categorias, $foto, $request) {
            $p = Producto::create($datos);
            if ($foto) {
                $p->guardarFoto($foto->get(), $foto->getMimeType());
            }
            $this->sincronizarCategorias($p, $categorias ?? array_filter([$p->categoria]));
            $this->stock->registrarInicial($p, $request->user()->id);
            return $p;
        });

        return response()->json(['mensaje' => 'Producto creado', 'data' => $producto->load('categorias:id,nombre,orden,logo,icono')], 201);
    }

    /** El stock no se edita aquí: se gestiona en /productos/{id}/stock para dejar historial. */
    public function update(Request $request, int $id)
    {
        $producto = Producto::with('categorias')->findOrFail($id);
        $datos = $request->validate($this->reglas(true));
        $categorias = $this->categoriasPedidas($request);
        $foto = $request->file('imagen');
        unset($datos['stock'], $datos['categorias'], $datos['imagen']);

        $antes = $producto->only(['nombre', 'precio', 'descripcion', 'stock_minimo']);
        $categoriasAntes = $producto->categorias->pluck('nombre')->all();
        $fotoNueva = (bool) $foto;

        if ($categorias !== null) {
            $datos['categoria'] = $categorias[0] ?? null;
        }

        DB::transaction(function () use ($producto, $datos, $categorias, $antes, $categoriasAntes, $foto, $fotoNueva, $request) {
            $producto->update($datos);
            if ($foto) {
                $producto->guardarFoto($foto->get(), $foto->getMimeType());
            }
            if ($categorias !== null) {
                $this->sincronizarCategorias($producto, $categorias);
            }
            $cambios = $this->describirCambios($antes, $producto->fresh()->only(array_keys($antes)), $categoriasAntes, $categorias, $fotoNueva);
            if ($cambios) {
                $this->stock->registrarEvento($producto, 'edicion', $request->user()->id, $cambios);
            }
        });

        return response()->json(['mensaje' => 'Producto actualizado', 'data' => $producto->fresh()->load('categorias:id,nombre,orden,logo,icono')]);
    }

    public function destroy(Request $request, int $id)
    {
        $producto = Producto::findOrFail($id);

        DB::transaction(function () use ($producto, $request) {
            $this->stock->registrarEvento($producto, 'eliminado', $request->user()->id, 'Se quitó del menú y del catálogo');
            $producto->delete(); // baja lógica: los pedidos antiguos conservan su detalle
        });

        return response()->json(['mensaje' => 'Producto eliminado']);
    }

    /**
     * Foto del producto, guardada en la base de datos. Es pública (el menú es público) y el
     * navegador la guarda en caché: la dirección cambia (?v=) cuando se sube otra foto.
     */
    public function imagen(int $id)
    {
        $foto = ProductoImagen::where('producto_id', $id)->firstOrFail();

        return response($foto->datos, 200, [
            'Content-Type' => $foto->tipo,
            'Cache-Control' => 'public, max-age=31536000, immutable',
        ]);
    }

    /** Vuelve a poner en el catálogo un producto eliminado (con su stock y su foto). */
    public function restaurar(Request $request, int $id)
    {
        $producto = Producto::onlyTrashed()->findOrFail($id);

        DB::transaction(function () use ($producto, $request) {
            $producto->restore();
            $this->stock->registrarEvento($producto, 'restaurado', $request->user()->id, 'Volvió al catálogo');
        });

        return response()->json(['mensaje' => 'Producto restaurado', 'data' => $producto->fresh()->load('categorias:id,nombre,orden,logo,icono')]);
    }

    /** Cambia entre Disponible y Agotado. No permite habilitar un producto sin stock. */
    public function toggle(Request $request, int $id)
    {
        $producto = Producto::findOrFail($id);

        if (!$producto->disponible && $producto->stock <= 0) {
            throw new ReglaNegocioException('No se puede marcar como disponible un producto sin stock', 422);
        }

        DB::transaction(function () use ($producto, $request) {
            $producto->update(['disponible' => !$producto->disponible]);
            $this->stock->registrarEvento($producto, 'estado', $request->user()->id,
                $producto->disponible ? 'Volvió a venderse en el menú' : 'Se marcó como agotado');
        });

        return response()->json([
            'mensaje' => 'El producto ahora está ' . ($producto->disponible ? 'Disponible' : 'Agotado'),
            'data' => $producto,
        ]);
    }

    private function reglas(bool $parcial = false): array
    {
        $r = $parcial ? 'sometimes|' : '';

        return [
            'nombre' => $r . 'required|string|max:100',
            'descripcion' => 'nullable|string|max:500',
            'categoria' => 'nullable|string|max:50',
            'categorias' => 'nullable|array|max:10',
            'categorias.*' => 'string|min:2|max:50',
            'precio' => $r . 'required|numeric|min:0.01|max:9999.99',
            'stock' => 'nullable|integer|min:0|max:100000',
            'stock_minimo' => 'nullable|integer|min:0|max:100000',
            // Hasta 900 KB: MySQL/MariaDB de XAMPP acepta 1 MB por consulta (max_allowed_packet).
            // El panel reduce la foto antes de subirla, así que casi nunca llega a ese tamaño.
            'imagen' => 'nullable|image|mimes:jpg,jpeg,png,webp|max:900',
        ];
    }

    /** Lista de categorías enviada (categorias[] o, como antes, categoria). null si no se envió ninguna. */
    private function categoriasPedidas(Request $request): ?array
    {
        if ($request->has('categorias')) {
            $lista = (array) $request->input('categorias', []);
        } elseif ($request->filled('categoria')) {
            $lista = [$request->input('categoria')];
        } else {
            return null;
        }

        $vistas = [];
        foreach ($lista as $nombre) {
            $nombre = trim(preg_replace('/\s+/', ' ', (string) $nombre));
            if ($nombre !== '' && !isset($vistas[mb_strtolower($nombre)])) {
                $vistas[mb_strtolower($nombre)] = $nombre;
            }
        }
        return array_values($vistas);
    }

    private function sincronizarCategorias(Producto $producto, array $nombres): void
    {
        $producto->categorias()->sync(array_map(fn ($n) => Categoria::obtener($n)->id, $nombres));
    }

    /** Texto corto con lo que cambió, para el historial del producto. */
    private function describirCambios(array $antes, array $despues, array $catAntes, ?array $catDespues, bool $fotoNueva): ?string
    {
        $partes = [];
        if ($antes['nombre'] !== $despues['nombre']) {
            $partes[] = "Nombre: {$antes['nombre']} → {$despues['nombre']}";
        }
        if ((float) $antes['precio'] !== (float) $despues['precio']) {
            $partes[] = 'Precio: Bs ' . number_format((float) $antes['precio'], 2) . ' → Bs ' . number_format((float) $despues['precio'], 2);
        }
        if ((int) $antes['stock_minimo'] !== (int) $despues['stock_minimo']) {
            $partes[] = "Aviso de stock: {$antes['stock_minimo']} → {$despues['stock_minimo']}";
        }
        if ((string) $antes['descripcion'] !== (string) $despues['descripcion']) {
            $partes[] = 'Descripción';
        }
        if ($catDespues !== null && $catAntes !== $catDespues) {
            $partes[] = 'Categorías: ' . (implode(', ', $catDespues) ?: 'ninguna');
        }
        if ($fotoNueva) {
            $partes[] = 'Foto nueva';
        }
        return $partes ? implode(' · ', $partes) : null;
    }
}
