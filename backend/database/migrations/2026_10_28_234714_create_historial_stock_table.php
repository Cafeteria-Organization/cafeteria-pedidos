<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up()
    {
        Schema::create('HISTORIAL_STOCK', function (Blueprint $table) {
            $table->increments('id_historial_stock');
            $table->unsignedInteger('id_producto');
            $table->integer('cantidad_anterior');
            $table->integer('cantidad_nueva');
            $table->string('motivo', 100)->default('Venta/Descuento de pedido');
            $table->dateTime('fecha_cambio')->useCurrent();
            
            $table->foreign('id_producto')->references('id_producto')->on('PRODUCTO')->onDelete('cascade');
        });

        
        DB::unprepared("
            CREATE TRIGGER trg_auditoria_stock
            AFTER UPDATE ON PRODUCTO
            FOR EACH ROW
            BEGIN
                IF OLD.stock_actual != NEW.stock_actual THEN
                    INSERT INTO HISTORIAL_STOCK (id_producto, cantidad_anterior, cantidad_nueva, fecha_cambio)
                    VALUES (NEW.id_producto, OLD.stock_actual, NEW.stock_actual, CURRENT_TIMESTAMP);
                END IF;
            END;
        ");
    }

    public function down()
    {
        DB::unprepared("DROP TRIGGER IF EXISTS trg_auditoria_stock");
        Schema::dropIfExists('HISTORIAL_STOCK');
    }
};