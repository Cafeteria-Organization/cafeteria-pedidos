<?php

namespace Database\Seeders;

use App\Models\Categoria;
use App\Models\Producto;
use App\Services\StockService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\File;

/**
 * Productos del menú de la cafetería (tomados del menú "El Cafecito del Break"), cada uno con su foto.
 *
 * Las fotos están en database/seeders/fotos y se guardan dentro de la base de datos
 * (tabla producto_imagenes): viajan con la base y no hace falta `storage:link`.
 *
 * Un producto puede estar en varias categorías (la primera es la principal).
 *
 * Se puede volver a ejecutar sobre una base con datos (php artisan db:seed --class=ProductoSeeder):
 * si el producto ya existe no cambia su stock, precio ni descripción; solo le agrega sus
 * categorías y le pone la foto si todavía no tiene una.
 */
class ProductoSeeder extends Seeder
{
    public function run(StockService $stock): void
    {
        // Categorías en el orden en que aparecen en el menú.
        $orden = ['Cafetería', 'Desayunos', 'Sándwiches', 'Comida caliente', 'Ensaladas y fit', 'Bebidas', 'Postres'];
        foreach ($orden as $i => $nombre) {
            Categoria::firstOrCreate(['nombre' => $nombre], ['orden' => $i + 1]);
        }

        // Productos que además aparecen en otra categoría.
        $otrasCategorias = [
            'Panqueques' => ['Postres'],
            'Waffles' => ['Postres'],
            'Jugo verde quema grasa' => ['Ensaladas y fit'],
            'Hamburguesa de quinoa' => ['Comida caliente'],
            'Almuerzo fit' => ['Comida caliente'],
        ];

        // [nombre, descripción, categoría principal, precio, stock inicial, foto]
        $productos = [
            // Cafetería
            ['Café americano', 'Café recién preparado', 'Cafetería', 7.00, 30, 'americano'],
            ['Capuchino', 'Espresso con leche vaporizada y espuma cremosa', 'Cafetería', 9.00, 30, 'capuchino'],
            ['Mocachino', 'Café con chocolate y leche espumada', 'Cafetería', 9.00, 25, 'mocachino'],
            ['Café con leche', 'Café pasado con leche caliente', 'Cafetería', 7.00, 30, 'cafe-con-leche'],
            ['Frapuchino', 'Café frío batido con hielo, crema y chocolate', 'Cafetería', 14.00, 15, 'frapuchino'],
            ['Té o mate', 'Té negro, manzanilla, anís o mate de coca', 'Cafetería', 5.00, 40, 'te'],

            // Desayunos
            ['Desayuno paceño', 'Pan marraqueta con queso y café', 'Desayunos', 10.00, 20, 'paceno'],
            ['Revuelto de huevos', 'Huevos revueltos con jamón y tomate, tostadas, café y jugo', 'Desayunos', 15.00, 15, 'revuelto'],
            ['Panqueques', '3 panqueques con fruta de estación, jarabe de chocolate y café o té', 'Desayunos', 19.00, 12, 'panqueques'],
            ['Waffles', '3 waffles con fruta de estación, jarabe de chocolate y café o té', 'Desayunos', 19.00, 12, 'waffles'],
            ['Desayuno americano', 'Tostadas, huevos revueltos, tocino, mermelada, mantequilla, café y jugo', 'Desayunos', 20.00, 10, 'desayuno-americano'],

            // Sándwiches
            ['Sándwich de pollo', 'Pan artesanal con pollo deshilachado', 'Sándwiches', 14.00, 15, 'sandwich-pollo'],
            ['Jamón y queso caliente', 'Pan miga tostado con jamón y queso', 'Sándwiches', 8.00, 25, 'jamon-queso'],
            ['Lomito con queso', 'Pan, lomito de res, queso, lechuga, tomate y aderezos', 'Sándwiches', 12.00, 15, 'lomito'],
            ['Pollo crispí BBQ', 'Milanesa de pollo empanizada, salsa BBQ, queso, tomate y pepinillos', 'Sándwiches', 14.00, 15, 'pollo-crispi'],
            ['Triple de palta y huevo', 'Pan miga, palta, tomate, huevo frito y queso', 'Sándwiches', 13.00, 12, 'triple-palta'],
            ['Choripán', 'Pan, chorizo, lechuga, cebolla en vinagre, tomate y aderezos', 'Sándwiches', 12.00, 15, 'choripan'],

            // Comida caliente
            ['Hamburguesa clásica', 'Carne, lechuga, tomate y queso', 'Comida caliente', 18.00, 20, 'hamburguesa'],
            ['Salchipapa', 'Papas fritas con salchicha', 'Comida caliente', 12.00, 25, 'salchipapa'],
            ['Hamburguesa BBQ', 'Carne de res, lechuga, tomate, pepinillos, salsa BBQ y papas fritas', 'Comida caliente', 22.00, 12, 'hamburguesa-bbq'],
            ['Mini pique', 'Salteado de carne, salchicha, cebolla, huevo duro, tomate y papas fritas', 'Comida caliente', 19.00, 12, 'pique'],
            ['Milanesa al plato', 'Milanesa de pollo con arroz, papas fritas y ensalada', 'Comida caliente', 19.00, 12, 'milanesa'],

            // Ensaladas y fit
            ['Ensalada César', 'Lechugas, pollo a la plancha, crutones, queso parmesano y salsa de ajo', 'Ensaladas y fit', 20.00, 10, 'cesar'],
            ['Ensalada mexicana', 'Lechugas, palta, pico de gallo, choclo, nachos y pollo a la plancha', 'Ensaladas y fit', 20.00, 10, 'mexicana'],
            ['Ensalada de atún', 'Lechugas, atún, huevo duro, queso criollo, tomate, maní tostado y choclo', 'Ensaladas y fit', 20.00, 10, 'atun'],
            ['Hamburguesa de quinoa', 'Medallón de quinoa con lechuga, tomate, zucchini salteado y papas fritas', 'Ensaladas y fit', 22.00, 10, 'quinoa'],
            ['Almuerzo fit', 'Filete de pollo a la plancha (250 g), arroz blanco y ensalada fresca', 'Ensaladas y fit', 24.00, 10, 'fit'],

            // Bebidas
            ['Refresco 500ml', 'Bebida gaseosa', 'Bebidas', 6.00, 40, 'refresco'],
            ['Jugo natural', 'Jugo de fruta de temporada', 'Bebidas', 8.00, 30, 'jugo-natural'],
            ['Batido de frutilla', 'Frutilla natural licuada con leche', 'Bebidas', 10.00, 20, 'batido-frutilla'],
            ['Limonada con hierba buena', 'Limonada natural con hojas de hierba buena', 'Bebidas', 9.00, 25, 'limonada'],
            ['Batido de plátano con Oreo', 'Plátano, leche y galletas Oreo', 'Bebidas', 10.00, 15, 'batido-oreo'],
            ['Jugo verde quema grasa', 'Manzana verde, limón, piña, pepino, hierba buena y apio', 'Bebidas', 12.00, 15, 'jugo-verde'],

            // Postres
            ['Brownie', 'Brownie de chocolate', 'Postres', 9.00, 12, 'brownie'],
            ['Gelatina', 'Gelatina de sabores', 'Postres', 5.00, 20, 'gelatina'],
            ['Helado con brownie', 'Porción de brownie con helado', 'Postres', 17.00, 10, 'brownie-helado'],
            ['Waffles con helado', '2 waffles con 2 sabores de helado y fruta de estación', 'Postres', 20.00, 10, 'waffle-helado'],
            ['Copa de helado', 'Tres bolas de helado con salsa de frutilla y crema', 'Postres', 16.00, 15, 'copa-helado'],
        ];

        foreach ($productos as [$nombre, $descripcion, $categoria, $precio, $cantidad, $foto]) {
            $producto = Producto::firstOrNew(['nombre' => $nombre]);
            $nuevo = ! $producto->exists;

            if ($nuevo) {
                $producto->fill([
                    'descripcion' => $descripcion, 'precio' => $precio,
                    'stock' => $cantidad, 'stock_minimo' => 5, 'disponible' => true,
                ]);
            }
            $producto->categoria = $categoria;
            $producto->save();

            // La foto se guarda dentro de la base de datos (solo si todavía no tiene una).
            $archivo = database_path("seeders/fotos/{$foto}.jpg");
            if (! $producto->imagen && File::exists($archivo)) {
                $producto->guardarFoto(File::get($archivo), 'image/jpeg');
            }

            $categorias = array_merge([$categoria], $otrasCategorias[$nombre] ?? []);
            $producto->categorias()->syncWithoutDetaching(
                array_map(fn ($c) => Categoria::obtener($c)->id, $categorias)
            );

            if ($nuevo) {
                $stock->registrarInicial($producto, null);   // HU-09: queda el "stock inicial" en el historial
            }
        }
    }
}
