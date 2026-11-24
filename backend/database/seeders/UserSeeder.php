<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        // Contraseña de prueba: password123 (solo para desarrollo)
        $usuarios = [
            ['Americo Admin', 'admin@cafeteria.com', User::ROL_ADMIN],
            ['Empleado Cocina', 'empleado@cafeteria.com', User::ROL_EMPLEADO],
            ['Estudiante Demo', 'estudiante@univalle.edu', User::ROL_ESTUDIANTE],
        ];

        foreach ($usuarios as [$name, $email, $rol]) {
            User::updateOrCreate(['email' => $email], [
                'name' => $name,
                'password' => Hash::make('password123'),
                'rol' => $rol,
            ]);
        }
    }
}
