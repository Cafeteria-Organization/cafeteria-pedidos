<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

/**
 * HU-01: autenticación integrada.
 *  - Estudiantes/docentes: se registran con su correo institucional @univalle.edu
 *    (validación de dominio; el sistema de Univalle no expone SSO público).
 *  - Empleados/Admin: cuentas locales creadas por el administrador.
 * Todos reciben un token real de Sanctum.
 */
class AuthController extends Controller
{
    public function register(Request $request)
    {
        $dominio = config('cafeteria.dominio_univalle');

        $datos = $request->validate([
            'name' => 'required|string|max:100',
            'email' => ['required', 'email', 'max:150', 'unique:users,email',
                function ($atributo, $valor, $fail) use ($dominio) {
                    if (!str_ends_with(strtolower($valor), '@' . $dominio)) {
                        $fail("Debes registrarte con tu correo institucional @{$dominio}");
                    }
                },
            ],
            'password' => 'required|string|min:8|max:100',
        ]);

        $user = User::create([
            'name' => $datos['name'],
            'email' => strtolower($datos['email']),
            'password' => Hash::make($datos['password']),
            'rol' => User::ROL_ESTUDIANTE,
        ]);

        return response()->json($this->respuestaSesion($user, 'Registro exitoso'), 201);
    }

    public function login(Request $request)
    {
        $datos = $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', strtolower($datos['email']))->first();

        if (!$user || !Hash::check($datos['password'], $user->password)) {
            return response()->json(['mensaje' => 'Credenciales incorrectas'], 401);
        }

        return response()->json($this->respuestaSesion($user, 'Bienvenido al sistema'));
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['mensaje' => 'Sesión cerrada']);
    }

    public function me(Request $request)
    {
        $u = $request->user();

        return response()->json(['id' => $u->id, 'name' => $u->name, 'email' => $u->email, 'rol' => $u->rol]);
    }

    private function respuestaSesion(User $user, string $mensaje): array
    {
        return [
            'mensaje' => $mensaje,
            'id' => $user->id,
            'usuario' => $user->name,
            'email' => $user->email,
            'rol' => $user->rol,
            'token' => $user->createToken('auth_token')->plainTextToken,
        ];
    }
}
