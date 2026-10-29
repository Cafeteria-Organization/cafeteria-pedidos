<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('NOTIFICACION', function (Blueprint $table) {
            $table->increments('id_notificacion');
            $table->unsignedInteger('id_usuario'); // A quién va dirigida
            $table->string('titulo', 100);
            $table->string('mensaje', 255);
            $table->boolean('leida')->default(false);
            $table->dateTime('fecha_envio')->useCurrent();
            
            $table->foreign('id_usuario')->references('id_usuario')->on('USUARIO')->onDelete('cascade');
        });
    }

    public function down()
    {
        Schema::dropIfExists('NOTIFICACION');
    }
};