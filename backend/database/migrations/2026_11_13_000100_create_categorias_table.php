<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Categorías del menú y su relación de muchos a muchos con los productos:
 * un producto puede estar en varias categorías (por ejemplo, "Waffles" en Desayunos y Postres).
 *
 * productos.categoria se mantiene como la categoría principal (la primera), para que
 * lo que ya la usaba siga funcionando.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('categorias', function (Blueprint $table) {
            $table->id();
            $table->string('nombre', 50)->unique();
            $table->unsignedInteger('orden')->default(0);   // orden en el menú
            $table->timestamps();
        });

        Schema::create('categoria_producto', function (Blueprint $table) {
            $table->id();
            $table->foreignId('categoria_id')->constrained('categorias')->cascadeOnDelete();
            $table->foreignId('producto_id')->constrained('productos')->cascadeOnDelete();
            $table->unique(['categoria_id', 'producto_id']);
        });

        // Las categorías que ya existían como texto pasan a la tabla nueva.
        $orden = ['Cafetería', 'Desayunos', 'Sándwiches', 'Comida caliente', 'Ensaladas y fit', 'Bebidas', 'Postres'];
        $siguiente = count($orden) + 1;
        $nombres = DB::table('productos')->whereNotNull('categoria')->where('categoria', '<>', '')
            ->distinct()->orderBy('categoria')->pluck('categoria');

        foreach ($nombres as $nombre) {
            $posicion = array_search($nombre, $orden, true);
            $id = DB::table('categorias')->insertGetId([
                'nombre' => $nombre,
                'orden' => $posicion === false ? $siguiente++ : $posicion + 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            foreach (DB::table('productos')->where('categoria', $nombre)->pluck('id') as $productoId) {
                DB::table('categoria_producto')->insert(['categoria_id' => $id, 'producto_id' => $productoId]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('categoria_producto');
        Schema::dropIfExists('categorias');
    }
};
