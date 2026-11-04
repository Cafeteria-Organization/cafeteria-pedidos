<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up() {
        // HU-25: Tabla de reseñas y retroalimentación
        Schema::create('FEEDBACK', function (Blueprint $table) {
            $table->increments('id_feedback');
            $table->unsignedInteger('id_usuario');
            $table->unsignedInteger('id_pedido');
            $table->integer('calificacion'); // Estrellas del 1 al 5
            $table->text('comentario')->nullable();
            $table->dateTime('fecha')->useCurrent();
            
            $table->foreign('id_usuario')->references('id_usuario')->on('USUARIO')->onDelete('cascade');
            $table->foreign('id_pedido')->references('id_pedido')->on('PEDIDO')->onDelete('cascade');
        });

        // HU-23: Horarios de atención configurables
        Schema::create('HORARIO_ATENCION', function (Blueprint $table) {
            $table->increments('id_horario');
            $table->string('dia_semana', 20); // Lunes, Martes, etc.
            $table->time('hora_apertura');
            $table->time('hora_cierre');
            $table->boolean('abierto')->default(true);
        });

        // HU-21: Agregar soporte para Combos y Ofertas en los Productos
        Schema::table('PRODUCTO', function (Blueprint $table) {
            $table->decimal('precio_oferta', 8, 2)->nullable();
            $table->boolean('es_combo')->default(false);
        });
    }

    public function down() {
        Schema::table('PRODUCTO', function (Blueprint $table) {
            $table->dropColumn(['precio_oferta', 'es_combo']);
        });
        Schema::dropIfExists('HORARIO_ATENCION');
        Schema::dropIfExists('FEEDBACK');
    }
};
