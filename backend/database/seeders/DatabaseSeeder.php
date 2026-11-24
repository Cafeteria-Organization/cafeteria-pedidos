<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            UserSeeder::class,
            ProductoSeeder::class,
            ComboSeeder::class,
            PedidoSeeder::class,   // pedidos de ejemplo para reportes y cocina
        ]);
    }
}
