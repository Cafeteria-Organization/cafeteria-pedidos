<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// HU-15 y HU-19: el historial de stock guarda quién hizo el cambio y el motivo real.
// La API indica el motivo y el usuario con dos variables de sesión de MySQL
// (@motivo_stock y @usuario_stock) antes de modificar el stock; el trigger las lee.
return new class extends Migration
{
    public function up()
    {
        Schema::table('HISTORIAL_STOCK', function (Blueprint $table) {
            $table->unsignedInteger('id_usuario')->nullable()->after('id_producto');
            $table->foreign('id_usuario')->references('id_usuario')->on('USUARIO')->nullOnDelete();
        });

        DB::unprepared("DROP TRIGGER IF EXISTS trg_auditoria_stock");
        DB::unprepared("
            CREATE TRIGGER trg_auditoria_stock
            AFTER UPDATE ON PRODUCTO
            FOR EACH ROW
            BEGIN
                IF OLD.stock_actual != NEW.stock_actual THEN
                    INSERT INTO HISTORIAL_STOCK (id_producto, id_usuario, cantidad_anterior, cantidad_nueva, motivo, fecha_cambio)
                    VALUES (NEW.id_producto, @usuario_stock, OLD.stock_actual, NEW.stock_actual,
                            COALESCE(@motivo_stock, 'Ajuste de stock'), CURRENT_TIMESTAMP);
                END IF;
            END;
        ");
    }

    public function down()
    {
        DB::unprepared("DROP TRIGGER IF EXISTS trg_auditoria_stock");
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
        Schema::table('HISTORIAL_STOCK', function (Blueprint $table) {
            $table->dropForeign(['id_usuario']);
            $table->dropColumn('id_usuario');
        });
    }
};
