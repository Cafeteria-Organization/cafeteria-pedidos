<?php

namespace App\Http\Controllers;

use App\Exceptions\ReglaNegocioException;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

/**
 * HU-02: gestión del personal (exclusivo del Admin). Baja lógica con softDeletes.
 * El admin puede crear empleados o administradores y cambiar el rol de una cuenta.
 * La baja aplica solo a empleados: para dar de baja a un admin, primero se le cambia el rol.
 */
class EmpleadoController extends Controller
{
    private const CAMPOS = ['id', 'name', 'email', 'rol', 'created_at', 'deleted_at'];
    private const ROLES_PERSONAL = [User::ROL_EMPLEADO, User::ROL_ADMIN];

    /** Empleados; con ?incluir_admins=1 también los administradores. ?inactivos=1 para los dados de baja. */
    public function index(Request $request)
    {
        $roles = $request->boolean('incluir_admins') ? self::ROLES_PERSONAL : [User::ROL_EMPLEADO];
        $q = User::whereIn('rol', $roles);

        if ($request->boolean('inactivos')) {
            $q->onlyTrashed();
        }

        return response()->json($q->orderByRaw("rol = 'admin' desc")->orderBy('name')->get(self::CAMPOS));
    }

    public function store(Request $request)
    {
        $datos = $request->validate([
            'name' => 'required|string|max:100',
            'email' => 'required|email|max:150|unique:users,email',
            'password' => 'required|string|min:8|max:100',
            'rol' => ['sometimes', Rule::in(self::ROLES_PERSONAL)],
        ]);

        $empleado = User::create([
            'name' => $datos['name'],
            'email' => strtolower($datos['email']),
            'password' => Hash::make($datos['password']),
            'rol' => $datos['rol'] ?? User::ROL_EMPLEADO,
        ]);

        $texto = $empleado->esAdmin() ? 'Administrador creado' : 'Empleado creado';

        return response()->json(['mensaje' => $texto, 'data' => $empleado->only(self::CAMPOS)], 201);
    }

    public function update(Request $request, int $id)
    {
        $empleado = User::whereIn('rol', self::ROLES_PERSONAL)->findOrFail($id);

        $datos = $request->validate([
            'name' => 'sometimes|required|string|max:100',
            'email' => ['sometimes', 'required', 'email', 'max:150', Rule::unique('users', 'email')->ignore($empleado->id)],
            'password' => 'sometimes|required|string|min:8|max:100',
            'rol' => ['sometimes', Rule::in(self::ROLES_PERSONAL)],
        ]);

        $cambiaRol = isset($datos['rol']) && $datos['rol'] !== $empleado->rol;
        if ($cambiaRol) {
            if ($empleado->id === $request->user()->id) {
                throw new ReglaNegocioException('No puedes cambiar tu propio rol.', 422);
            }
            if ($empleado->esAdmin() && User::where('rol', User::ROL_ADMIN)->count() <= 1) {
                throw new ReglaNegocioException('Debe quedar al menos un administrador.', 422);
            }
        }

        if (isset($datos['password'])) {
            $datos['password'] = Hash::make($datos['password']);
        }
        if (isset($datos['email'])) {
            $datos['email'] = strtolower($datos['email']);
        }

        $empleado->update($datos);

        // Con otro rol cambian sus permisos: se cierran sus sesiones para que vuelva a ingresar.
        if ($cambiaRol) {
            $empleado->tokens()->delete();
        }

        return response()->json(['mensaje' => 'Datos actualizados', 'data' => $empleado->only(self::CAMPOS)]);
    }

    /** Baja lógica: conserva el historial y revoca sus sesiones. */
    public function destroy(int $id)
    {
        $empleado = User::where('rol', User::ROL_EMPLEADO)->findOrFail($id);
        $empleado->tokens()->delete();
        $empleado->delete();

        return response()->json(['mensaje' => 'Empleado dado de baja']);
    }

    public function restaurar(int $id)
    {
        $empleado = User::onlyTrashed()->where('rol', User::ROL_EMPLEADO)->findOrFail($id);
        $empleado->restore();

        return response()->json(['mensaje' => 'Empleado reactivado', 'data' => $empleado->only(self::CAMPOS)]);
    }
}
