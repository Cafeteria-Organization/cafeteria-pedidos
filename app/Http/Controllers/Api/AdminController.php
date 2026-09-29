<?php
 
namespace App\Http\Controllers\Api;
 
use App\Http\Controllers\Controller;
use App\Models\Producto;
use App\Models\Usuario;
use Illuminate\Http\Request;
 
class AdminController extends Controller
{
    public function storeProducto(Request $request)
    {
        $request->validate([
            'nombre' => 'required|string|max:100',
            'descripcion' => 'nullable|string',
            'precio' => 'required|numeric|min:0',
            'stock_actual' => 'required|integer|min:0',
            'categorias' => 'required|array' // IDs de las categorías
        ]);
 
        $producto = Producto::create($request->only(['nombre', 'descripcion', 'precio', 'stock_actual']));
        // Relacionamos el producto con sus categorías en la tabla intermedia
        $producto->categorias()->attach($request->categorias);
 
        return response()->json(['success' => true, 'message' => 'Producto creado', 'data' => $producto], 201);
    }
 
    public function updateProducto(Request $request, $id)
    {
        $producto = Producto::find($id);
        if (!$producto) return response()->json(['success' => false, 'message' => 'No encontrado'], 404);
 
        $producto->update($request->only(['nombre', 'descripcion', 'precio', 'stock_actual', 'estado']));
        if ($request->has('categorias')) {
            $producto->categorias()->sync($request->categorias); // Actualiza la tabla intermedia
        }
 
        return response()->json(['success' => true, 'message' => 'Producto actualizado']);
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
}