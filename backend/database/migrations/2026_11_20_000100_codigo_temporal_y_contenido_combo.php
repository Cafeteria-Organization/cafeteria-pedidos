<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 1) El código de recojo solo sirve mientras el pedido está activo: al entregarlo o cancelarlo
 *    se borra (pedidos.codigo pasa a aceptar NULL y se limpian los pedidos ya terminados).
 * 2) detalle_pedidos.contenido guarda qué productos llevaba un combo al momento del pedido
 *    (si después se edita el combo, el historial y los reportes no cambian).
 */
return new class extends Migration
{
    public function up()
    {
        $this->codigoOpcional(true);
        DB::table('pedidos')->whereIn('estado', ['Completado', 'Cancelado'])->update(['codigo' => null]);

        Schema::table('detalle_pedidos', function (Blueprint $table) {
            $table->text('contenido')->nullable()->after('notas');
        });

        // Pedidos anteriores: se completa con lo que el combo lleva hoy.
        $lineas = DB::table('detalle_pedidos')->whereNotNull('combo_id')->get(['id', 'combo_id']);
        foreach ($lineas as $l) {
            $productos = DB::table('combo_producto')->join('productos', 'productos.id', '=', 'combo_producto.producto_id')
                ->where('combo_producto.combo_id', $l->combo_id)->orderBy('combo_producto.id')
                ->get(['productos.nombre', 'combo_producto.cantidad']);
            $contenido = $productos->map(fn ($p) => ['nombre' => $p->nombre, 'cantidad' => (int) $p->cantidad])->all();
            DB::table('detalle_pedidos')->where('id', $l->id)->update(['contenido' => json_encode($contenido, JSON_UNESCAPED_UNICODE)]);
        }
    }

    public function down()
    {
        Schema::table('detalle_pedidos', function (Blueprint $table) {
            $table->dropColumn('contenido');
        });
        DB::table('pedidos')->whereNull('codigo')->update(['codigo' => DB::raw("CONCAT('X', id)")]);
        $this->codigoOpcional(false);
    }

    private function codigoOpcional(bool $opcional): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE pedidos MODIFY codigo VARCHAR(10) ' . ($opcional ? 'NULL' : 'NOT NULL'));
            return;
        }
        if (DB::getDriverName() !== 'sqlite' || !$opcional) {
            return;
        }
        // SQLite (pruebas) no puede cambiar una columna: se rehace la tabla con la misma definición.
        $tabla = DB::selectOne("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'pedidos'")->sql;
        $indices = collect(DB::select("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'pedidos' AND sql IS NOT NULL"))->pluck('sql');
        $nueva = preg_replace('/"codigo" varchar not null/i', '"codigo" varchar null', $tabla, 1, $cambios);
        if ($cambios !== 1) {
            return;
        }
        Schema::disableForeignKeyConstraints();
        DB::statement(preg_replace('/^CREATE TABLE "pedidos"/i', 'CREATE TABLE "pedidos_tmp"', $nueva));
        DB::statement('INSERT INTO "pedidos_tmp" SELECT * FROM "pedidos"');
        DB::statement('DROP TABLE "pedidos"');
        DB::statement('ALTER TABLE "pedidos_tmp" RENAME TO "pedidos"');
        foreach ($indices as $sql) {
            DB::statement($sql);
        }
        Schema::enableForeignKeyConstraints();
    }
};
