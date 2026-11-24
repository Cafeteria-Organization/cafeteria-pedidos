<?php

namespace Database\Seeders;

use App\Models\Combo;
use App\Models\Producto;
use Illuminate\Database\Seeder;

class ComboSeeder extends Seeder
{
    public function run(): void
    {
        $combo = Combo::updateOrCreate(['nombre' => 'Combo Estudiante'], [
            'descripcion' => 'Hamburguesa + refresco + gelatina a precio especial',
            'precio' => 24.00,
            'activo' => true,
        ]);

        $combo->productos()->sync([
            Producto::where('nombre', 'Hamburguesa clásica')->value('id') => ['cantidad' => 1],
            Producto::where('nombre', 'Refresco 500ml')->value('id') => ['cantidad' => 1],
            Producto::where('nombre', 'Gelatina')->value('id') => ['cantidad' => 1],
        ]);
    }
}
