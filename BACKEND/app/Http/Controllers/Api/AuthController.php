<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Usuario;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    // Auto-registro para estudiantes y docentes (HU-26)
     public function register(Request $request)
    {
        // Esta ruta es pública, así que el token se revisa a mano (si viene)
        $quienCrea = auth('sanctum')->user();
        $esAdmin = $quienCrea && (int) $quienCrea->id_rol === 1;

        $request->validate([
            'nombre'   => 'required|string|max:100',
            'correo'   => 'required|email|max:100|unique:USUARIO,correo',
            'password' => 'required|min:6',
            'id_rol'   => 'nullable|integer|in:1,2,3',
        ]);

        // Nadie que no sea Admin puede elegir rol
        if ($request->filled('id_rol') && !$esAdmin) {
            return response()->json([
                'success' => false,
                'message' => 'Solo un administrador puede asignar roles'
            ], 403);
        }

        // Los clientes que se registran solos deben usar correo institucional
        if (!$esAdmin && !str_ends_with($request->correo, '@univalle.edu') && !str_ends_with($request->correo, '@est.univalle.edu')) {
            return response()->json([
                'success' => false,
                'message' => 'Solo se permiten correos institucionales.'
            ], 403);
        }

        $usuario = Usuario::create([
            'id_rol'        => $esAdmin && $request->filled('id_rol') ? (int) $request->id_rol : 3,
            'nombre'        => $request->nombre,
            'correo'        => $request->correo,
            'password_hash' => Hash::make($request->password),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Cuenta creada exitosamente',
            'data'    => [
                'id_usuario' => $usuario->id_usuario,
                'nombre'     => $usuario->nombre,
                'correo'     => $usuario->correo,
                'id_rol'     => $usuario->id_rol,
            ]
        ], 201);
    }

    // Inicio de sesión (HU-27)
    public function login(Request $request)
    {
        $request->validate([
            'correo' => 'required|email',
            'password' => 'required'
        ]);

        $usuario = Usuario::where('correo', $request->correo)->first();

        // Verificamos si el usuario existe y la contraseña es correcta
        if (!$usuario || !Hash::check($request->password, $usuario->password_hash)) {
            return response()->json([
                'success' => false,
                'message' => 'Credenciales incorrectas'
            ], 401);
        }

        // Generamos un token de acceso para el frontend
        $token = $usuario->createToken('auth_token')->plainTextToken;

        return response()->json([
            'success' => true,
            'message' => 'Inicio de sesión exitoso',
            'data' => [
                'token' => $token,
                'usuario' => [
                    'nombre' => $usuario->nombre,
                    'correo' => $usuario->correo,
                    'id_rol' => $usuario->id_rol
                ]
            ]
        ]);
    }
}