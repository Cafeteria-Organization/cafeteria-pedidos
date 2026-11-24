<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // HU-09: historial de movimientos de inventario
        Schema::create('movimientos_stock', function (Blueprint $table) {
            $table->id();
            $table->foreignId('producto_id')->constrained('productos');
            $table->foreignId('pedido_id')->nullable()->constrained('pedidos');
            $table->foreignId('user_id')->nullable()->constrained('users');
            // inicial | pedido | cancelacion | reposicion | ajuste
            $table->string('tipo', 20);
            $table->integer('cantidad');            // variación (+/-)
            $table->unsignedInteger('stock_resultante');
            $table->string('motivo')->nullable();
            $table->timestamps();
            $table->index(['producto_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('movimientos_stock');
    }
};
