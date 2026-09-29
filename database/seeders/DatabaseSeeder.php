<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run()
    {
        // 1. Llenar Roles
        DB::table('ROL')->insert([
            ['nombre_rol' => 'Admin'],
            ['nombre_rol' => 'Empleado'],
            ['nombre_rol' => 'Cliente'],
        ]);

        // 2. Crear un Administrador de prueba
        DB::table('USUARIO')->insert([
            'id_rol' => 1,
            'nombre' => 'Administrador Univalle',
            'correo' => 'admin@univalle.edu',
            'password_hash' => Hash::make('123456'), // Contraseña por defecto
        ]);

        // 3. Crear Categorías
        $catDesayuno = DB::table('CATEGORIA')->insertGetId(['nombre' => 'Desayunos']);
        $catBebidas = DB::table('CATEGORIA')->insertGetId(['nombre' => 'Bebidas']);

        // 4. Crear Productos
        $prodSaltena = DB::table('PRODUCTO')->insertGetId([
            'nombre' => 'Salteña de Carne',
            'descripcion' => 'Salteña jugosa tradicional',
            'precio' => 8.50,
            'stock_actual' => 30,
            'estado' => 'Disponible'
        ]);

        $prodJugo = DB::table('PRODUCTO')->insertGetId([
            'nombre' => 'Jugo de Naranja',
            'descripcion' => 'Jugo natural 500ml',
            'precio' => 6.00,
            'stock_actual' => 20,
            'estado' => 'Disponible'
        ]);

        // 5. Relacionar Productos con Categorías
        DB::table('PRODUCTO_CATEGORIA')->insert([
            ['id_producto' => $prodSaltena, 'id_categoria' => $catDesayuno],
            ['id_producto' => $prodJugo, 'id_categoria' => $catBebidas],
        ]);
    }
}