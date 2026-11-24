<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('combos', function (Blueprint $table) {
            $table->id();
            $table->string('nombre');
            $table->text('descripcion')->nullable();
            $table->decimal('precio', 8, 2);
            $table->boolean('activo')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('combo_producto', function (Blueprint $table) {
            $table->id();
            $table->foreignId('combo_id')->constrained('combos')->onDelete('cascade');
            $table->foreignId('producto_id')->constrained('productos');
            $table->unsignedInteger('cantidad')->default(1);
            $table->unique(['combo_id', 'producto_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('combo_producto');
        Schema::dropIfExists('combos');
    }
};
