<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up() {
        Schema::create('FAVORITOS', function (Blueprint $table) {
            $table->increments('id_favorito');
            $table->unsignedInteger('id_usuario');
            $table->unsignedInteger('id_producto');
            $table->dateTime('fecha_agregado')->useCurrent();
            
            $table->foreign('id_usuario')->references('id_usuario')->on('USUARIO')->onDelete('cascade');
            $table->foreign('id_producto')->references('id_producto')->on('PRODUCTO')->onDelete('cascade');
        });
    }
    public function down() {
        Schema::dropIfExists('FAVORITOS');
    }
};
