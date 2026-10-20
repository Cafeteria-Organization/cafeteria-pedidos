<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Producto;
use Illuminate\Http\Request;

class MenuController extends Controller
{
    // Retorna todos los productos disponibles con sus categorías (HU-01)
    public function index()
    {
        $productos = Producto::with('categorias')
            ->where('estado', 'Disponible')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $productos
        ]);
    }
    public function buscar(Request $request)
    {
        $termino = $request->query('q');
 
        if (!$termino) {
            return response()->json(['success' => false, 'message' => 'Debe ingresar un término de búsqueda'], 400);
        }
 
        $productos = Producto::with('categorias')
            ->where('estado', 'Disponible')
            ->where('nombre', 'LIKE', '%' . $termino . '%')
            ->get();
 
        return response()->json([
            'success' => true,
            'data' => $productos
        ]);
    }
}