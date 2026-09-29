<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up()
    {
        // 1. Tabla Roles
        Schema::create('ROL', function (Blueprint $table) {
            $table->increments('id_rol');
            $table->string('nombre_rol', 50);
        });

        // 2. Tabla Usuarios
        Schema::create('USUARIO', function (Blueprint $table) {
            $table->increments('id_usuario');
            $table->unsignedInteger('id_rol');
            $table->string('nombre', 100);
            $table->string('correo', 100)->unique();
            $table->string('password_hash', 255);
            $table->dateTime('fecha_registro')->useCurrent();
            
            $table->foreign('id_rol')->references('id_rol')->on('ROL');
        });

        // 3. Catálogo (Categorías y Productos)
        Schema::create('CATEGORIA', function (Blueprint $table) {
            $table->increments('id_categoria');
            $table->string('nombre', 100);
        });

        Schema::create('PRODUCTO', function (Blueprint $table) {
            $table->increments('id_producto');
            $table->string('nombre', 100);
            $table->string('descripcion', 255)->nullable();
            $table->decimal('precio', 10, 2);
            $table->integer('stock_actual')->default(0);
            $table->string('estado', 20)->default('Disponible');
        });

        Schema::create('PRODUCTO_CATEGORIA', function (Blueprint $table) {
            $table->unsignedInteger('id_producto');
            $table->unsignedInteger('id_categoria');
            $table->primary(['id_producto', 'id_categoria']);
            
            $table->foreign('id_producto')->references('id_producto')->on('PRODUCTO')->onDelete('cascade');
            $table->foreign('id_categoria')->references('id_categoria')->on('CATEGORIA')->onDelete('cascade');
        });

        // 4. Pedidos y Detalles
        Schema::create('PEDIDO', function (Blueprint $table) {
            $table->increments('id_pedido');
            $table->unsignedInteger('id_usuario');
            $table->dateTime('fecha_pedido')->useCurrent();
            $table->string('estado', 20)->default('Pendiente');
            $table->decimal('total', 10, 2)->default(0);
            $table->integer('tiempo_estimado')->nullable();
            $table->string('codigo_verificacion', 10)->unique()->nullable();
            
            $table->foreign('id_usuario')->references('id_usuario')->on('USUARIO');
        });

        Schema::create('DETALLE_PEDIDO', function (Blueprint $table) {
            $table->increments('id_detalle');
            $table->unsignedInteger('id_pedido');
            $table->unsignedInteger('id_producto');
            $table->integer('cantidad');
            $table->decimal('precio_unitario', 10, 2);
            $table->string('notas_personalizacion', 255)->nullable();
            
            $table->foreign('id_pedido')->references('id_pedido')->on('PEDIDO')->onDelete('cascade');
            $table->foreign('id_producto')->references('id_producto')->on('PRODUCTO');
        });

        // 5. Historial
        Schema::create('HISTORIAL_PEDIDO', function (Blueprint $table) {
            $table->increments('id_historial');
            $table->unsignedInteger('id_pedido');
            $table->string('estado_anterior', 20)->nullable();
            $table->string('estado_nuevo', 20)->nullable();
            $table->dateTime('fecha_cambio')->useCurrent();
            
            $table->foreign('id_pedido')->references('id_pedido')->on('PEDIDO')->onDelete('cascade');
        });

        // 6. PROCEDIMIENTOS Y TRIGGERS (Se ejecutan directo en MySQL)
        DB::unprepared("
            CREATE TRIGGER trg_auditoria_pedido
            AFTER UPDATE ON PEDIDO
            FOR EACH ROW
            BEGIN
                IF OLD.estado != NEW.estado THEN
                    INSERT INTO HISTORIAL_PEDIDO (id_pedido, estado_anterior, estado_nuevo, fecha_cambio)
                    VALUES (NEW.id_pedido, OLD.estado, NEW.estado, CURRENT_TIMESTAMP);
                END IF;
            END;
        ");

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
            END;
        ");

        DB::unprepared("
            CREATE PROCEDURE pr_calcular_total(IN p_id_pedido INT)
            BEGIN
                DECLARE v_total_final DECIMAL(10,2);
                SELECT SUM(cantidad * precio_unitario) INTO v_total_final FROM DETALLE_PEDIDO WHERE id_pedido = p_id_pedido;
                IF v_total_final IS NOT NULL THEN
                    UPDATE PEDIDO SET total = v_total_final WHERE id_pedido = p_id_pedido;
                END IF;
            END;
        ");
    }

    public function down()
    {
        // Orden inverso para evitar errores de llaves foráneas
        DB::unprepared("DROP TRIGGER IF EXISTS trg_auditoria_pedido");
        DB::unprepared("DROP PROCEDURE IF EXISTS pr_cancelar_pedido");
        DB::unprepared("DROP PROCEDURE IF EXISTS pr_calcular_total");
        
        Schema::dropIfExists('HISTORIAL_PEDIDO');
        Schema::dropIfExists('DETALLE_PEDIDO');
        Schema::dropIfExists('PEDIDO');
        Schema::dropIfExists('PRODUCTO_CATEGORIA');
        Schema::dropIfExists('PRODUCTO');
        Schema::dropIfExists('CATEGORIA');
        Schema::dropIfExists('USUARIO');
        Schema::dropIfExists('ROL');
    }
};