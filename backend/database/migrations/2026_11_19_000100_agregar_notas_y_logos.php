<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * - detalle_pedidos.notas: lo que el cliente pide para ese producto ("sin tomate").
 * - Logo de cada categoría, guardado en la base como las fotos de los productos:
 *   categorias.logo guarda una huella corta y la imagen va en categoria_logos
 *   (tabla aparte para que listar categorías no cargue las imágenes).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('detalle_pedidos', function (Blueprint $table) {
            $table->string('notas', 200)->nullable()->after('nombre');
        });

        Schema::table('categorias', function (Blueprint $table) {
            $table->string('logo', 16)->nullable()->after('orden');
        });

        Schema::create('categoria_logos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('categoria_id')->unique()->constrained('categorias')->cascadeOnDelete();
            $table->string('tipo', 50);          // image/jpeg, image/png, image/webp
            $table->binary('datos');
            $table->timestamps();
        });

        if (Schema::getConnection()->getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE categoria_logos MODIFY datos MEDIUMBLOB NOT NULL');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('categoria_logos');
        Schema::table('categorias', fn (Blueprint $table) => $table->dropColumn('logo'));
        Schema::table('detalle_pedidos', fn (Blueprint $table) => $table->dropColumn('notas'));
    }
};
