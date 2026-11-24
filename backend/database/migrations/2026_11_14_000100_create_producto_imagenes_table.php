<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Las fotos de los productos se guardan dentro de la base de datos (y no como archivos en
 * storage/), así viajan con la base: al copiar el proyecto o exportar la base a otra
 * computadora, las fotos se ven sin pasos extra.
 *
 * Van en una tabla aparte para que listar productos no cargue las fotos.
 * productos.imagen guarda una huella corta de la foto (cambia cuando se sube otra).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('producto_imagenes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('producto_id')->unique()->constrained('productos')->cascadeOnDelete();
            $table->string('tipo', 50);          // image/jpeg, image/png, image/webp
            $table->binary('datos');
            $table->timestamps();
        });

        // En MySQL/MariaDB "binary" crea un BLOB de 64 KB: se amplía a 16 MB.
        if (Schema::getConnection()->getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE producto_imagenes MODIFY datos MEDIUMBLOB NOT NULL');
        }

        // Las fotos que ya estaban como archivo en storage/app/public pasan a la base.
        $tipos = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
        $productos = DB::table('productos')->whereNotNull('imagen')->where('imagen', '<>', '')->get(['id', 'imagen']);
        foreach ($productos as $p) {
            $ruta = storage_path('app/public/' . ltrim($p->imagen, '/'));
            $extension = strtolower(pathinfo($ruta, PATHINFO_EXTENSION));
            if (!is_file($ruta) || !isset($tipos[$extension])) {
                DB::table('productos')->where('id', $p->id)->update(['imagen' => null]);
                continue;
            }
            $datos = file_get_contents($ruta);
            DB::table('producto_imagenes')->insert([
                'producto_id' => $p->id, 'tipo' => $tipos[$extension], 'datos' => $datos,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('productos')->where('id', $p->id)->update(['imagen' => substr(sha1($datos), 0, 16)]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('producto_imagenes');
    }
};
