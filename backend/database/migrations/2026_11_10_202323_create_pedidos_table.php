<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pedidos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users'); // quien hace el pedido
            $table->string('codigo', 10)->unique();            // código de recojo
            // Recibido | En preparación | Para entregar | Completado | Cancelado
            $table->string('estado', 20)->default('Recibido')->index();
            $table->decimal('total', 8, 2);
            $table->foreignId('entregado_por')->nullable()->constrained('users');
            $table->timestamp('entregado_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pedidos');
    }
};
