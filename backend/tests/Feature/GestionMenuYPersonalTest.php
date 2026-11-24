<?php

namespace Tests\Feature;

use App\Models\Categoria;
use App\Models\Pedido;
use App\Models\Producto;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Categorías de muchos a muchos, productos eliminados, historial con responsable,
 * administradores y reporte de ventas.
 */
class GestionMenuYPersonalTest extends TestCase
{
    use RefreshDatabase;

    private function usuario(string $rol, string $email): User
    {
        return User::create(['name' => ucfirst($rol), 'email' => $email, 'password' => Hash::make('password123'), 'rol' => $rol]);
    }

    private function admin(string $email = 'admin@cafeteria.com'): User { return $this->usuario('admin', $email); }

    private function crearProducto(array $datos = [])
    {
        return $this->postJson('/api/admin/productos', array_merge(
            ['nombre' => 'Waffles', 'precio' => 19, 'stock' => 10, 'categorias' => ['Desayunos', 'Postres']], $datos
        ));
    }

    // ---------------------------------------------------------------- categorías
    public function test_un_producto_puede_tener_varias_categorias(): void
    {
        Sanctum::actingAs($this->admin());
        $r = $this->crearProducto()->assertStatus(201);

        $this->assertSame('Desayunos', $r->json('data.categoria'));   // la primera es la principal
        $this->assertSame(['Desayunos', 'Postres'], array_column($r->json('data.categorias'), 'nombre'));
        $this->assertDatabaseCount('categoria_producto', 2);

        // Aparece al filtrar por cualquiera de sus categorías
        $this->assertCount(1, $this->getJson('/api/menu?categoria=Postres')->json());
        $this->assertCount(1, $this->getJson('/api/menu?categoria=Desayunos')->json());
        $this->assertCount(0, $this->getJson('/api/menu?categoria=Bebidas')->json());
    }

    public function test_editar_categorias_reemplaza_las_anteriores(): void
    {
        Sanctum::actingAs($this->admin());
        $id = $this->crearProducto()->json('data.id');
        $this->putJson("/api/admin/productos/{$id}", ['categorias' => ['Postres']])->assertOk()
            ->assertJsonPath('data.categoria', 'Postres');
        $this->assertSame(['Postres'], Producto::find($id)->categorias->pluck('nombre')->all());
    }

    public function test_crear_renombrar_y_eliminar_categorias(): void
    {
        Sanctum::actingAs($this->admin());
        $id = $this->postJson('/api/admin/categorias', ['nombre' => 'Snacks'])->assertStatus(201)->json('data.id');
        $this->postJson('/api/admin/categorias', ['nombre' => 'Snacks'])->assertStatus(422);   // repetida
        $this->getJson('/api/categorias')->assertOk()->assertJsonPath('0.nombre', 'Snacks');

        $this->crearProducto(['nombre' => 'Papas', 'categorias' => ['Snacks']]);
        $this->putJson("/api/admin/categorias/{$id}", ['nombre' => 'Bocaditos'])->assertOk();
        $this->assertDatabaseHas('productos', ['nombre' => 'Papas', 'categoria' => 'Bocaditos']);

        $this->deleteJson("/api/admin/categorias/{$id}")->assertStatus(422);   // tiene productos
        $vacia = Categoria::create(['nombre' => 'Vacía', 'orden' => 9]);
        $this->deleteJson("/api/admin/categorias/{$vacia->id}")->assertOk();
    }

    public function test_la_cocina_filtra_por_cualquier_categoria_del_producto(): void
    {
        Sanctum::actingAs($this->admin());
        $id = $this->crearProducto()->json('data.id');
        $est = $this->usuario('estudiante', 'est@univalle.edu');
        $pedido = Pedido::create(['user_id' => $est->id, 'codigo' => 'WAFLE', 'estado' => 'Recibido', 'total' => 19]);
        $pedido->detalles()->create(['producto_id' => $id, 'nombre' => 'Waffles', 'cantidad' => 1, 'precio_unitario' => 19, 'subtotal' => 19]);

        $this->assertCount(1, $this->getJson('/api/pedidos/activos?categoria=Postres')->json());
        $this->assertCount(0, $this->getJson('/api/pedidos/activos?categoria=Bebidas')->json());
    }

    // ---------------------------------------------------------------- eliminados y restauración
    public function test_productos_eliminados_se_listan_y_se_restauran(): void
    {
        Sanctum::actingAs($this->admin());
        $id = $this->crearProducto()->json('data.id');
        $this->deleteJson("/api/admin/productos/{$id}")->assertOk();

        $this->assertSame([$id], array_column($this->getJson('/api/admin/productos?eliminados=1')->json(), 'id'));
        $this->postJson("/api/admin/productos/{$id}/restaurar")->assertOk();
        $this->assertNotSoftDeleted('productos', ['id' => $id]);
        $this->assertCount(1, $this->getJson('/api/menu')->json());
        $this->postJson("/api/admin/productos/{$id}/restaurar")->assertStatus(404);   // ya no está eliminado
    }

    // ---------------------------------------------------------------- historial con responsable
    public function test_el_historial_muestra_quien_hizo_cada_cambio(): void
    {
        $admin = $this->admin();
        Sanctum::actingAs($admin);
        $id = $this->crearProducto()->json('data.id');
        $this->putJson("/api/admin/productos/{$id}", ['precio' => 21])->assertOk();

        $empleado = $this->usuario('empleado', 'emp@cafeteria.com');
        Sanctum::actingAs($empleado);
        $this->patchJson("/api/productos/{$id}/stock", ['stock' => 7, 'motivo' => 'Conteo'])->assertOk();
        $this->patchJson("/api/productos/{$id}/agotado")->assertOk();

        $movs = $this->getJson("/api/productos/{$id}/movimientos")->assertOk()->json();
        $this->assertSame(['estado', 'ajuste', 'edicion', 'inicial'], array_column($movs, 'tipo'));
        $this->assertSame('Empleado', $movs[0]['usuario']['name']);
        $this->assertSame('empleado', $movs[1]['usuario']['rol']);
        $this->assertSame('admin', $movs[2]['usuario']['rol']);
        $this->assertStringContainsString('Precio: Bs 19.00 → Bs 21.00', $movs[2]['motivo']);
    }

    // ---------------------------------------------------------------- administradores
    public function test_el_admin_crea_otro_administrador_y_cambia_roles(): void
    {
        $yo = $this->admin();
        Sanctum::actingAs($yo);
        $r = $this->postJson('/api/admin/empleados', ['name' => 'Ana', 'email' => 'ana@cafeteria.com', 'password' => 'password123', 'rol' => 'admin'])
            ->assertStatus(201)->assertJsonPath('data.rol', 'admin');
        $ana = User::find($r->json('data.id'));

        $emp = $this->usuario('empleado', 'emp@cafeteria.com');
        $this->putJson("/api/admin/empleados/{$emp->id}", ['rol' => 'admin'])->assertOk();
        $this->assertSame('admin', $emp->fresh()->rol);

        $this->assertCount(3, $this->getJson('/api/admin/empleados?incluir_admins=1')->json());
        $this->postJson('/api/admin/empleados', ['name' => 'X', 'email' => 'x@cafeteria.com', 'password' => 'password123', 'rol' => 'estudiante'])
            ->assertStatus(422);

        $this->putJson("/api/admin/empleados/{$yo->id}", ['rol' => 'empleado'])->assertStatus(422);   // no a sí mismo
        $this->putJson("/api/admin/empleados/{$ana->id}", ['rol' => 'empleado'])->assertOk();
    }

    public function test_siempre_queda_al_menos_un_administrador(): void
    {
        $unico = $this->admin();
        $otro = $this->admin('otro@cafeteria.com');
        Sanctum::actingAs($otro);
        $this->putJson("/api/admin/empleados/{$unico->id}", ['rol' => 'empleado'])->assertOk();
        // Ahora "otro" es el único admin y no puede quitarse el rol a sí mismo
        $this->putJson("/api/admin/empleados/{$otro->id}", ['rol' => 'empleado'])->assertStatus(422);
    }

    // ---------------------------------------------------------------- reporte de ventas
    public function test_reporte_de_ventas_cuenta_solo_pedidos_entregados(): void
    {
        Sanctum::actingAs($this->admin());
        $est = $this->usuario('estudiante', 'est@univalle.edu');
        $p = Producto::create(['nombre' => 'Capuchino', 'categoria' => 'Cafetería', 'precio' => 9, 'stock' => 50, 'disponible' => true]);
        foreach ([['Completado', 'AAAA1', 2], ['Completado', 'AAAA2', 1], ['Cancelado', 'AAAA3', 4], ['Recibido', 'AAAA4', 1]] as [$estado, $codigo, $cant]) {
            $pedido = Pedido::create(['user_id' => $est->id, 'codigo' => $codigo, 'estado' => $estado, 'total' => 9 * $cant]);
            $pedido->detalles()->create(['producto_id' => $p->id, 'nombre' => 'Capuchino', 'cantidad' => $cant, 'precio_unitario' => 9, 'subtotal' => 9 * $cant]);
        }

        $r = $this->getJson('/api/admin/reportes/ventas')->assertOk();
        $this->assertEquals(27, $r->json('resumen.ingresos_totales'));
        $this->assertSame(2, $r->json('resumen.pedidos_completados'));
        $this->assertSame(3, $r->json('resumen.unidades_vendidas'));
        $this->assertSame(1, $r->json('resumen.pedidos_cancelados'));
        $this->assertCount(7, $r->json('ventas'));                         // últimos 7 días, aunque no haya ventas
        $this->assertSame('Capuchino', $r->json('top_productos.0.nombre'));
        $this->assertEquals(100, $r->json('top_productos.0.porcentaje'));
        $this->assertNull($r->json('resumen.ticket_promedio'));
        $this->assertCount(7, $r->json('dias_semana'));                    // lunes a domingo
        $this->assertEquals(27, array_sum(array_column($r->json('dias_semana'), 'ingresos')));
        $this->assertSame('Cafetería', $r->json('por_categoria.0.categoria'));
        $this->assertEquals(100, $r->json('por_categoria.0.porcentaje'));

        $this->getJson('/api/admin/reportes/ventas?desde=2026-11-10&hasta=2026-11-01')->assertStatus(422);
        $this->getJson('/api/admin/reportes/ventas?agrupar=mes')->assertStatus(422);
    }

    public function test_solo_el_admin_ve_reportes_y_gestiona_categorias(): void
    {
        Sanctum::actingAs($this->usuario('empleado', 'emp@cafeteria.com'));
        $this->getJson('/api/admin/reportes/ventas')->assertStatus(403);
        $this->postJson('/api/admin/categorias', ['nombre' => 'X'])->assertStatus(403);
    }

    // ---------------------------------------------------------------- logos, notas, detalle del día
    private function png(): UploadedFile
    {
        // PNG de 1x1 (sin depender de la extensión gd)
        $datos = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
        return UploadedFile::fake()->createWithContent('logo.png', $datos);
    }

    public function test_la_categoria_puede_tener_logo_guardado_en_la_base(): void
    {
        Sanctum::actingAs($this->admin());
        $r = $this->post('/api/admin/categorias', ['nombre' => 'Salteñas', 'logo' => $this->png()], ['Accept' => 'application/json'])
            ->assertStatus(201);
        $id = $r->json('data.id');
        $this->assertStringContainsString("/api/categorias/{$id}/logo?v=", $r->json('data.logo_url'));
        $this->assertDatabaseHas('categoria_logos', ['categoria_id' => $id, 'tipo' => 'image/png']);
        $this->get("/api/categorias/{$id}/logo")->assertOk()->assertHeader('Content-Type', 'image/png');
        $this->assertNotNull($this->getJson('/api/categorias')->json('0.logo_url'));

        $this->deleteJson("/api/admin/categorias/{$id}/logo")->assertOk()->assertJsonPath('data.logo_url', null);
        $this->assertDatabaseCount('categoria_logos', 0);
        $this->post("/api/admin/categorias/{$id}/logo", ['logo' => $this->png()], ['Accept' => 'application/json'])->assertOk();
        $this->post("/api/admin/categorias/{$id}/logo", [], ['Accept' => 'application/json'])->assertStatus(422);
    }

    public function test_la_categoria_guarda_el_icono_elegido_de_la_galeria(): void
    {
        Sanctum::actingAs($this->admin());
        $id = $this->postJson('/api/admin/categorias', ['nombre' => 'Empanadas', 'icono' => 'horno'])
            ->assertStatus(201)->assertJsonPath('data.icono', 'horno')->json('data.id');
        $this->postJson('/api/admin/categorias', ['nombre' => 'Raras', 'icono' => '<script>'])->assertStatus(422);

        // Elegir un ícono quita la imagen subida (se muestra el ícono).
        $this->post("/api/admin/categorias/{$id}/logo", ['logo' => $this->png()], ['Accept' => 'application/json'])->assertOk();
        $this->putJson("/api/admin/categorias/{$id}/icono", ['icono' => 'pizza'])
            ->assertOk()->assertJsonPath('data.icono', 'pizza')->assertJsonPath('data.logo_url', null);
        $this->assertDatabaseCount('categoria_logos', 0);
        $this->putJson("/api/admin/categorias/{$id}/icono", [])->assertStatus(422);
        $this->assertSame('pizza', $this->getJson('/api/categorias')->json('0.icono'));
    }

    public function test_el_pedido_guarda_las_notas_de_cada_producto(): void
    {
        $p = Producto::create(['nombre' => 'Hamburguesa', 'precio' => 18, 'stock' => 10, 'stock_minimo' => 2, 'categoria' => 'Comida caliente', 'disponible' => true]);
        Sanctum::actingAs($this->usuario('estudiante', 'ana@univalle.edu'));
        $r = $this->postJson('/api/pedidos', ['productos' => [['id' => $p->id, 'cantidad' => 2, 'notas' => '  sin   tomate ']]])->assertStatus(201);
        $this->assertSame('sin tomate', $r->json('pedido.detalles.0.notas'));
        $this->postJson('/api/pedidos', ['productos' => [['id' => $p->id, 'cantidad' => 1, 'notas' => str_repeat('x', 201)]]])->assertStatus(422);

        // "Volver a pedir" conserva la nota
        $this->postJson('/api/pedidos/' . $r->json('pedido.id') . '/repetir')->assertStatus(201)
            ->assertJsonPath('pedido.detalles.0.notas', 'sin tomate');
    }

    public function test_detalle_de_ventas_de_un_dia_con_hora_y_notas(): void
    {
        Sanctum::actingAs($this->admin());
        $est = $this->usuario('estudiante', 'ana@univalle.edu');
        $p = Producto::create(['nombre' => 'Capuchino', 'precio' => 9, 'stock' => 10, 'stock_minimo' => 2, 'categoria' => 'Cafetería', 'disponible' => true]);
        foreach ([['Completado', 'BBBB1', 2, 'sin azúcar'], ['Completado', 'BBBB2', 1, null], ['Cancelado', 'BBBB3', 4, null]] as [$estado, $codigo, $cant, $nota]) {
            $pedido = Pedido::create(['user_id' => $est->id, 'codigo' => $codigo, 'estado' => $estado, 'total' => 9 * $cant, 'entregado_at' => now()]);
            $pedido->detalles()->create(['producto_id' => $p->id, 'nombre' => 'Capuchino', 'notas' => $nota, 'cantidad' => $cant, 'precio_unitario' => 9, 'subtotal' => 9 * $cant]);
        }

        $r = $this->getJson('/api/admin/reportes/detalle')->assertOk();   // hoy
        $this->assertEquals(27, $r->json('resumen.ingresos_totales'));
        $this->assertCount(2, $r->json('lineas'));                         // el cancelado no cuenta
        $this->assertSame('sin azúcar', $r->json('lineas.0.notas'));
        $this->assertSame('Estudiante', $r->json('lineas.0.cliente'));
        $this->assertArrayNotHasKey('codigo', $r->json('lineas.0'));      // se muestra el n.º de pedido, no el código
        $this->assertIsInt($r->json('lineas.0.pedido_id'));
        $this->assertMatchesRegularExpression('/^\d{2}:\d{2}$/', $r->json('lineas.0.hora_pedido'));
        $this->assertSame(3, $r->json('por_producto.0.unidades'));
        $this->assertSame(1, $r->json('por_producto.0.con_notas'));

        $this->assertCount(0, $this->getJson('/api/admin/reportes/detalle?fecha=2020-01-01')->json('lineas'));
        $this->getJson('/api/admin/reportes/detalle?fecha=ayer')->assertStatus(422);
    }

    public function test_el_seeder_crea_pedidos_de_ejemplo_para_los_reportes(): void
    {
        $this->seed(\Database\Seeders\DatabaseSeeder::class);
        $this->assertGreaterThan(100, Pedido::where('estado', 'Completado')->count());
        $this->assertSame(0, Pedido::whereIn('estado', ['Completado', 'Cancelado'])->whereNotNull('codigo')->count());
        $this->assertGreaterThan(0, Pedido::whereIn('estado', Pedido::ACTIVOS)->whereNotNull('codigo')->count());
        $total = Pedido::count();
        $this->seed(\Database\Seeders\PedidoSeeder::class);                 // no se duplica
        $this->assertSame($total, Pedido::count());

        Sanctum::actingAs(User::where('rol', 'admin')->first());
        $r = $this->getJson('/api/admin/reportes/ventas?desde=' . now()->subDays(30)->toDateString() . '&hasta=' . now()->toDateString())->assertOk();
        $this->assertGreaterThan(0, $r->json('resumen.ingresos_totales'));
    }
}
