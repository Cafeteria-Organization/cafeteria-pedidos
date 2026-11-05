<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Completa lo que faltaba de las iteraciones 4 y 5:
//   HU-11  tiempo de preparación por producto y capacidad de cocina
//   HU-21  combos de varios productos (COMBO + COMBO_PRODUCTO) y su registro en el detalle
//   HU-07  se puede cancelar mientras el pedido no esté "Listo" (Pendiente o Preparando)
//   HU-10  un producto solo puede estar una vez en los favoritos de cada usuario
//   HU-09  un pedido solo se puede calificar una vez
//   HU-23  horario inicial de atención (se cambia desde el panel del administrador)
return new class extends Migration {
    public function up()
    {
        // HU-11: minutos que tarda en prepararse cada producto
        Schema::table('PRODUCTO', function (Blueprint $table) {
            $table->unsignedSmallInteger('tiempo_preparacion')->default(5);
        });

        // HU-11: datos de configuración (capacidad de cocina = pedidos que se preparan a la vez)
        Schema::create('CONFIGURACION', function (Blueprint $table) {
            $table->string('clave', 50)->primary();
            $table->string('valor', 255);
        });
        DB::table('CONFIGURACION')->insert(['clave' => 'capacidad_cocina', 'valor' => '2']);

        // HU-21: combos del día
        Schema::create('COMBO', function (Blueprint $table) {
            $table->increments('id_combo');
            $table->string('nombre', 100);
            $table->string('descripcion', 255)->nullable();
            $table->decimal('precio', 10, 2);
            $table->boolean('activo')->default(true);
            $table->dateTime('fecha_creacion')->useCurrent();
        });
        Schema::create('COMBO_PRODUCTO', function (Blueprint $table) {
            $table->unsignedInteger('id_combo');
            $table->unsignedInteger('id_producto');
            $table->unsignedSmallInteger('cantidad')->default(1);
            $table->primary(['id_combo', 'id_producto']);
            $table->foreign('id_combo')->references('id_combo')->on('COMBO')->onDelete('cascade');
            $table->foreign('id_producto')->references('id_producto')->on('PRODUCTO');
        });
        Schema::table('DETALLE_PEDIDO', function (Blueprint $table) {
            $table->unsignedInteger('id_combo')->nullable();
            $table->foreign('id_combo')->references('id_combo')->on('COMBO')->nullOnDelete();
        });

        // HU-10 y HU-09: sin duplicados
        Schema::table('FAVORITOS', function (Blueprint $table) {
            $table->unique(['id_usuario', 'id_producto']);
        });
        Schema::table('FEEDBACK', function (Blueprint $table) {
            $table->unique('id_pedido');
        });

        // HU-23: horario inicial (el administrador lo cambia cuando quiera)
        if (DB::table('HORARIO_ATENCION')->count() === 0) {
            $dias = [
                ['Lunes', '07:00', '21:00', true], ['Martes', '07:00', '21:00', true],
                ['Miércoles', '07:00', '21:00', true], ['Jueves', '07:00', '21:00', true],
                ['Viernes', '07:00', '21:00', true], ['Sábado', '08:00', '14:00', true],
                ['Domingo', '08:00', '12:00', false],
            ];
            foreach ($dias as [$dia, $abre, $cierra, $abierto]) {
                DB::table('HORARIO_ATENCION')->insert([
                    'dia_semana' => $dia, 'hora_apertura' => $abre, 'hora_cierre' => $cierra, 'abierto' => $abierto,
                ]);
            }
        }

        // HU-07: "cancelar mientras no esté Listo" → se permite Pendiente y Preparando
        DB::unprepared('DROP PROCEDURE IF EXISTS pr_cancelar_pedido');
        DB::unprepared("
            CREATE PROCEDURE pr_cancelar_pedido(IN p_id_pedido INT)
            BEGIN
                DECLARE v_estado_actual VARCHAR(20);
                SELECT estado INTO v_estado_actual FROM PEDIDO WHERE id_pedido = p_id_pedido;
                IF v_estado_actual IN ('Pendiente', 'Preparando') THEN
                    UPDATE PEDIDO SET estado = 'Cancelado' WHERE id_pedido = p_id_pedido;
                ELSE
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cancelación denegada.';
                END IF;
            END
        ");
    }

    public function down()
    {
        DB::unprepared('DROP PROCEDURE IF EXISTS pr_cancelar_pedido');
        DB::unprepared("
            CREATE PROCEDURE pr_cancelar_pedido(IN p_id_pedido INT)
            BEGIN
                DECLARE v_estado_actual VARCHAR(20);
                SELECT estado INTO v_estado_actual FROM PEDIDO WHERE id_pedido = p_id_pedido;
                IF v_estado_actual = 'Pendiente' THEN
                    UPDATE PEDIDO SET estado = 'Cancelado' WHERE id_pedido = p_id_pedido;
                ELSE
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Cancelación denegada.';
                END IF;
            END
        ");

        // MySQL usa el índice único para la llave foránea: se quita la llave, el índice y se vuelve a poner la llave
        Schema::table('FEEDBACK', function (Blueprint $table) {
            $table->dropForeign(['id_pedido']);
        });
        Schema::table('FEEDBACK', function (Blueprint $table) {
            $table->dropUnique(['id_pedido']);
            $table->foreign('id_pedido')->references('id_pedido')->on('PEDIDO')->onDelete('cascade');
        });
        Schema::table('FAVORITOS', function (Blueprint $table) {
            $table->dropForeign(['id_usuario']);
        });
        Schema::table('FAVORITOS', function (Blueprint $table) {
            $table->dropUnique(['id_usuario', 'id_producto']);
            $table->foreign('id_usuario')->references('id_usuario')->on('USUARIO')->onDelete('cascade');
        });
        Schema::table('DETALLE_PEDIDO', function (Blueprint $table) {
            $table->dropForeign(['id_combo']);
            $table->dropColumn('id_combo');
        });
        Schema::dropIfExists('COMBO_PRODUCTO');
        Schema::dropIfExists('COMBO');
        Schema::dropIfExists('CONFIGURACION');
        Schema::table('PRODUCTO', function (Blueprint $table) {
            $table->dropColumn('tiempo_preparacion');
        });
    }
};
