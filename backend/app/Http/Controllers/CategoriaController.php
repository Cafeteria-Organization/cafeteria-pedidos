<?php

namespace App\Http\Controllers;

use App\Exceptions\ReglaNegocioException;
use App\Models\Categoria;
use App\Models\CategoriaLogo;
use App\Models\Producto;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Categorías del menú (un producto puede estar en varias). */
class CategoriaController extends Controller
{
    /** Logo de la categoría: imagen pequeña (el panel la reduce antes de enviarla). */
    private const REGLA_LOGO = 'nullable|image|mimes:jpg,jpeg,png,webp|max:900';

    /** Ícono de la galería del panel (solo su nombre corto, p. ej. "pizza"). */
    private const REGLA_ICONO = ['string', 'max:40', 'regex:/^[a-z0-9-]+$/'];

    /** Público: todas las categorías en el orden del menú, con cuántos productos tienen. */
    public function index()
    {
        return response()->json(
            Categoria::withCount('productos')->orderBy('orden')->orderBy('nombre')->get()
        );
    }

    public function store(Request $request)
    {
        $datos = $request->validate([
            'nombre' => 'required|string|min:2|max:50|unique:categorias,nombre',
            'logo' => self::REGLA_LOGO,
            'icono' => array_merge(['nullable'], self::REGLA_ICONO),
        ]);

        $categoria = DB::transaction(function () use ($datos, $request) {
            $categoria = Categoria::create([
                'nombre' => trim(preg_replace('/\s+/', ' ', $datos['nombre'])),
                'orden' => (int) Categoria::max('orden') + 1,
                'icono' => $datos['icono'] ?? null,
            ]);
            if ($archivo = $request->file('logo')) {
                $categoria->guardarLogo($archivo->get(), $archivo->getMimeType());
            }
            return $categoria;
        });

        return response()->json(['mensaje' => 'Categoría creada', 'data' => $categoria->loadCount('productos')], 201);
    }

    /** Cambia el nombre; los productos que la tenían como principal se actualizan también. */
    public function update(Request $request, int $id)
    {
        $categoria = Categoria::findOrFail($id);
        $datos = $request->validate([
            'nombre' => ['required', 'string', 'min:2', 'max:50', Rule::unique('categorias', 'nombre')->ignore($categoria->id)],
        ]);
        $nuevo = trim(preg_replace('/\s+/', ' ', $datos['nombre']));

        DB::transaction(function () use ($categoria, $nuevo) {
            Producto::withTrashed()->where('categoria', $categoria->nombre)->update(['categoria' => $nuevo]);
            $categoria->update(['nombre' => $nuevo]);
        });

        return response()->json(['mensaje' => 'Categoría actualizada', 'data' => $categoria->loadCount('productos')]);
    }

    /** Solo se elimina si ningún producto la usa. */
    public function destroy(int $id)
    {
        $categoria = Categoria::withCount('productos')->findOrFail($id);

        if ($categoria->productos_count > 0) {
            throw new ReglaNegocioException(
                "La categoría “{$categoria->nombre}” tiene {$categoria->productos_count} producto(s). Quítala de esos productos primero.", 422
            );
        }

        $categoria->delete();

        return response()->json(['mensaje' => 'Categoría eliminada']);
    }

    /** Sube o reemplaza el logo de la categoría. */
    public function subirLogo(Request $request, int $id)
    {
        $categoria = Categoria::findOrFail($id);
        $request->validate(['logo' => 'required|image|mimes:jpg,jpeg,png,webp|max:900']);
        $archivo = $request->file('logo');
        $categoria->guardarLogo($archivo->get(), $archivo->getMimeType());

        return response()->json(['mensaje' => 'Logo actualizado', 'data' => $categoria->fresh()->loadCount('productos')]);
    }

    /** Elige un ícono de la galería (reemplaza a la imagen subida, si había). */
    public function cambiarIcono(Request $request, int $id)
    {
        $categoria = Categoria::findOrFail($id);
        $datos = $request->validate(['icono' => array_merge(['required'], self::REGLA_ICONO)]);

        DB::transaction(function () use ($categoria, $datos) {
            $categoria->quitarLogo();
            $categoria->update(['icono' => $datos['icono']]);
        });

        return response()->json(['mensaje' => 'Ícono actualizado', 'data' => $categoria->fresh()->loadCount('productos')]);
    }

    /** Quita el logo: la categoría vuelve a mostrar su ícono de siempre. */
    public function quitarLogo(int $id)
    {
        $categoria = Categoria::findOrFail($id);
        $categoria->quitarLogo();

        return response()->json(['mensaje' => 'Logo quitado', 'data' => $categoria->fresh()->loadCount('productos')]);
    }

    /** Público: el logo guardado en la base (el navegador lo guarda en caché). */
    public function logo(int $id)
    {
        $logo = CategoriaLogo::where('categoria_id', $id)->firstOrFail();

        return response($logo->datos, 200, [
            'Content-Type' => $logo->tipo,
            'Cache-Control' => 'public, max-age=31536000, immutable',
        ]);
    }
}
