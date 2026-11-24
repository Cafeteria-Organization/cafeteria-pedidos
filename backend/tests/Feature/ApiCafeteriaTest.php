<?php

namespace Tests\Feature;

use App\Models\Combo;
use App\Models\Pedido;
use App\Models\Producto;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Pruebas de la API de la Cafetería Univalle (12 HU / 3 iteraciones).
 * Cada prueba indica la HU que valida.
 */
class ApiCafeteriaTest extends TestCase
{
    use RefreshDatabase;

    // ---------------------------------------------------------------- helpers
    private function usuario(string $rol, string $email = null): User
    {
        return User::create([
            'name' => ucfirst($rol), 'email' => $email ?? "$rol@" . ($rol === 'estudiante' ? 'univalle.edu' : 'cafeteria.com'),
            'password' => Hash::make('password123'), 'rol' => $rol,
        ]);
    }

    private function admin(): User { return $this->usuario('admin'); }
    private function empleado(): User { return $this->usuario('empleado'); }
    private function estudiante(string $email = 'est@univalle.edu'): User { return $this->usuario('estudiante', $email); }

    private function producto(string $nombre = 'Hamburguesa', float $precio = 15.5, int $stock = 10, string $cat = 'Comida caliente'): Producto
    {
        return Producto::create(['nombre' => $nombre, 'descripcion' => 'x', 'categoria' => $cat,
            'precio' => $precio, 'stock' => $stock, 'disponible' => $stock > 0]);
    }

    private function pedido(User $u, string $estado = 'Recibido', string $codigo = 'AAAAA', ?Producto $p = null, int $cant = 2): Pedido
    {
        $p ??= $this->producto('Base ' . $codigo);
        $ped = Pedido::create(['user_id' => $u->id, 'codigo' => $codigo, 'estado' => $estado, 'total' => $p->precio * $cant]);
        $ped->detalles()->create(['producto_id' => $p->id, 'nombre' => $p->nombre, 'cantidad' => $cant,
            'precio_unitario' => $p->precio, 'subtotal' => $p->precio * $cant]);
        return $ped;
    }

    private function pedir(array $productos = [], array $combos = [])
    {
        $body = [];
        if ($productos) $body['productos'] = $productos;
        if ($combos) $body['combos'] = $combos;
        return $this->postJson('/api/pedidos', $body);
    }

    // ================================================================ HU-01 Autenticación
    public function test_HU01_registro_estudiante_con_correo_univalle_devuelve_token_real(): void
    {
        $r = $this->postJson('/api/register', ['name' => 'Ana', 'email' => 'ana@univalle.edu', 'password' => 'password123']);
        $r->assertStatus(201)->assertJsonPath('rol', 'estudiante');
        $this->assertStringContainsString('|', $r->json('token'));
        $this->assertDatabaseHas('users', ['email' => 'ana@univalle.edu', 'rol' => 'estudiante']);
    }

    public function test_HU01_registro_rechaza_correos_que_no_son_institucionales(): void
    {
        $this->postJson('/api/register', ['name' => 'X', 'email' => 'x@gmail.com', 'password' => 'password123'])->assertStatus(422);
    }

    public function test_HU01_registro_rechaza_correo_duplicado_y_password_corta(): void
    {
        $this->estudiante('dup@univalle.edu');
        $this->postJson('/api/register', ['name' => 'X', 'email' => 'dup@univalle.edu', 'password' => 'password123'])->assertStatus(422);
        $this->postJson('/api/register', ['name' => 'X', 'email' => 'otro@univalle.edu', 'password' => '123'])->assertStatus(422);
    }

    public function test_HU01_nadie_puede_registrarse_como_admin_o_empleado(): void
    {
        $this->postJson('/api/register', ['name' => 'X', 'email' => 'h@univalle.edu', 'password' => 'password123', 'rol' => 'admin']);
        $this->assertDatabaseHas('users', ['email' => 'h@univalle.edu', 'rol' => 'estudiante']);
    }

    public function test_HU01_login_correcto_devuelve_token_sanctum_y_rol(): void
    {
        $this->empleado();
        $r = $this->postJson('/api/login', ['email' => 'empleado@cafeteria.com', 'password' => 'password123']);
        $r->assertOk()->assertJsonPath('rol', 'empleado');
        $this->assertStringContainsString('|', $r->json('token'));
    }

    public function test_HU01_login_password_incorrecta_responde_401(): void
    {
        $this->estudiante();
        $this->postJson('/api/login', ['email' => 'est@univalle.edu', 'password' => 'mala'])->assertStatus(401);
    }

    public function test_HU01_correo_univalle_inexistente_NO_inicia_sesion(): void
    {
        $this->postJson('/api/login', ['email' => 'fantasma@univalle.edu', 'password' => 'lo-que-sea'])->assertStatus(401);
    }

    public function test_HU01_login_sin_campos_responde_422(): void
    {
        $this->postJson('/api/login', [])->assertStatus(422);
    }

    public function test_HU01_el_token_del_login_funciona_en_rutas_protegidas_y_logout_lo_revoca(): void
    {
        $this->estudiante();
        $token = $this->postJson('/api/login', ['email' => 'est@univalle.edu', 'password' => 'password123'])->json('token');
        $this->withHeader('Authorization', "Bearer $token")->getJson('/api/me')->assertOk()->assertJsonPath('rol', 'estudiante');
        $this->withHeader('Authorization', "Bearer $token")->postJson('/api/logout')->assertOk();
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_HU01_rutas_protegidas_sin_token_responden_401(): void
    {
        $this->getJson('/api/admin/empleados')->assertStatus(401);
        $this->postJson('/api/pedidos', [])->assertStatus(401);
        $this->getJson('/api/pedidos/activos')->assertStatus(401);
        $this->getJson('/api/mis-pedidos')->assertStatus(401);
    }

    public function test_HU01_matriz_de_roles_cada_rol_solo_accede_a_lo_suyo(): void
    {
        $e = $this->estudiante(); $emp = $this->empleado(); $a = $this->admin();

        Sanctum::actingAs($e);
        $this->getJson('/api/admin/empleados')->assertStatus(403);
        $this->getJson('/api/admin/productos')->assertStatus(403);
        $this->getJson('/api/pedidos/activos')->assertStatus(403);
        $this->postJson('/api/pedidos/entregar', ['codigo' => 'AAAAA'])->assertStatus(403);
        $this->getJson('/api/inventario/alertas')->assertStatus(403);

        Sanctum::actingAs($emp);
        $this->getJson('/api/admin/empleados')->assertStatus(403);
        $this->postJson('/api/admin/productos', ['nombre' => 'X', 'precio' => 1])->assertStatus(403);
        $this->postJson('/api/admin/combos', [])->assertStatus(403);
        $this->postJson('/api/pedidos', [])->assertStatus(403);
        $this->getJson('/api/pedidos/activos')->assertOk();

        Sanctum::actingAs($a);
        $this->getJson('/api/admin/empleados')->assertOk();
        $this->getJson('/api/pedidos/activos')->assertOk();
    }

    // ================================================================ HU-02 Empleados
    public function test_HU02_admin_lista_solo_empleados(): void
    {
        $this->empleado(); Sanctum::actingAs($this->admin());
        $r = $this->getJson('/api/admin/empleados')->assertOk();
        $this->assertCount(1, $r->json());
        $this->assertSame('empleado', $r->json('0.rol'));
    }

    public function test_HU02_admin_crea_empleado_con_rol_empleado(): void
    {
        Sanctum::actingAs($this->admin());
        $this->postJson('/api/admin/empleados', ['name' => 'Nuevo', 'email' => 'nuevo@cafeteria.com', 'password' => 'password123'])
            ->assertStatus(201)->assertJsonPath('data.rol', 'empleado');
        $this->assertDatabaseHas('users', ['email' => 'nuevo@cafeteria.com', 'rol' => 'empleado']);
    }

    public function test_HU02_validaciones_correo_duplicado_y_password_corta(): void
    {
        $this->empleado(); Sanctum::actingAs($this->admin());
        $this->postJson('/api/admin/empleados', ['name' => 'X', 'email' => 'empleado@cafeteria.com', 'password' => 'password123'])->assertStatus(422);
        $this->postJson('/api/admin/empleados', ['name' => 'X', 'email' => 'x@cafeteria.com', 'password' => '123'])->assertStatus(422);
    }

    public function test_HU02_admin_edita_empleado(): void
    {
        $e = $this->empleado(); Sanctum::actingAs($this->admin());
        $this->putJson("/api/admin/empleados/{$e->id}", ['name' => 'Renombrado', 'password' => 'otraClave123'])->assertOk();
        $this->assertSame('Renombrado', $e->fresh()->name);
        $this->assertTrue(Hash::check('otraClave123', $e->fresh()->password));
    }

    public function test_HU02_baja_logica_conserva_registro_revoca_sesion_y_bloquea_login(): void
    {
        $e = $this->empleado(); $e->createToken('t');
        Sanctum::actingAs($this->admin());
        $this->deleteJson("/api/admin/empleados/{$e->id}")->assertOk();
        $this->assertSoftDeleted('users', ['id' => $e->id]);
        $this->assertSame(0, $e->tokens()->count());
        $this->postJson('/api/login', ['email' => 'empleado@cafeteria.com', 'password' => 'password123'])->assertStatus(401);
    }

    public function test_HU02_admin_puede_reactivar_un_empleado_dado_de_baja(): void
    {
        $e = $this->empleado(); $e->delete(); Sanctum::actingAs($this->admin());
        $this->getJson('/api/admin/empleados?inactivos=1')->assertOk()->assertJsonCount(1);
        $this->postJson("/api/admin/empleados/{$e->id}/restaurar")->assertOk();
        $this->assertNotSoftDeleted('users', ['id' => $e->id]);
    }

    public function test_HU02_la_baja_solo_aplica_a_empleados_no_a_admins_ni_estudiantes(): void
    {
        $a = $this->admin(); $a2 = $this->usuario('admin', 'a2@cafeteria.com'); $est = $this->estudiante();
        Sanctum::actingAs($a);
        $this->deleteJson("/api/admin/empleados/{$a2->id}")->assertStatus(404);
        $this->deleteJson("/api/admin/empleados/{$est->id}")->assertStatus(404);
        $this->assertNotSoftDeleted('users', ['id' => $a2->id]);
        $this->assertNotSoftDeleted('users', ['id' => $est->id]);
    }

    // ================================================================ HU-03 Menú (admin)
    public function test_HU03_admin_crea_producto_con_stock_y_registra_movimiento_inicial(): void
    {
        Sanctum::actingAs($this->admin());
        $r = $this->postJson('/api/admin/productos', ['nombre' => 'Salchipapa', 'precio' => 10, 'stock' => 20, 'categoria' => 'Comida caliente'])->assertStatus(201);
        $this->assertDatabaseHas('productos', ['nombre' => 'Salchipapa', 'stock' => 20, 'disponible' => true]);
        $this->assertDatabaseHas('movimientos_stock', ['producto_id' => $r->json('data.id'), 'tipo' => 'inicial', 'cantidad' => 20]);
    }

    public function test_HU03_producto_sin_stock_nace_agotado(): void
    {
        Sanctum::actingAs($this->admin());
        $this->postJson('/api/admin/productos', ['nombre' => 'Sin stock', 'precio' => 10])->assertStatus(201);
        $this->assertDatabaseHas('productos', ['nombre' => 'Sin stock', 'stock' => 0, 'disponible' => false]);
    }

    public function test_HU03_validaciones_nombre_precio_y_precio_negativo(): void
    {
        Sanctum::actingAs($this->admin());
        $this->postJson('/api/admin/productos', ['precio' => 10])->assertStatus(422);
        $this->postJson('/api/admin/productos', ['nombre' => 'X'])->assertStatus(422);
        $this->postJson('/api/admin/productos', ['nombre' => 'X', 'precio' => -5])->assertStatus(422);
        $this->postJson('/api/admin/productos', ['nombre' => 'X', 'precio' => 5, 'stock' => -1])->assertStatus(422);
    }

    public function test_HU03_admin_edita_producto_pero_no_toca_el_stock_por_esa_via(): void
    {
        Sanctum::actingAs($this->admin()); $p = $this->producto('A', 10, 7);
        $this->putJson("/api/admin/productos/{$p->id}", ['nombre' => 'Nuevo nombre', 'precio' => 12.5, 'stock' => 999])->assertOk();
        $p->refresh();
        $this->assertSame('Nuevo nombre', $p->nombre);
        $this->assertSame('12.50', (string) $p->precio);
        $this->assertSame(7, $p->stock);
    }

    public function test_HU03_eliminar_producto_es_baja_logica_y_sale_del_menu(): void
    {
        Sanctum::actingAs($this->admin()); $p = $this->producto();
        $this->deleteJson("/api/admin/productos/{$p->id}")->assertOk();
        $this->assertSoftDeleted('productos', ['id' => $p->id]);
        $this->getJson('/api/menu')->assertExactJson([]);
    }

    public function test_HU03_toggle_alterna_disponible_y_agotado(): void
    {
        Sanctum::actingAs($this->admin()); $p = $this->producto();
        $this->patchJson("/api/admin/productos/{$p->id}/toggle")->assertOk()->assertJsonPath('mensaje', 'El producto ahora está Agotado');
        $this->assertFalse($p->fresh()->disponible);
        $this->patchJson("/api/admin/productos/{$p->id}/toggle")->assertJsonPath('mensaje', 'El producto ahora está Disponible');
    }

    public function test_HU03_no_se_puede_habilitar_un_producto_sin_stock(): void
    {
        Sanctum::actingAs($this->admin()); $p = $this->producto('A', 10, 0);
        $this->patchJson("/api/admin/productos/{$p->id}/toggle")->assertStatus(422);
        $this->assertFalse($p->fresh()->disponible);
    }

    public function test_HU03_toggle_de_producto_inexistente_responde_404(): void
    {
        Sanctum::actingAs($this->admin());
        $this->patchJson('/api/admin/productos/9999/toggle')->assertStatus(404);
    }

    public function test_HU03_imagen_valida_se_guarda_en_la_base_e_imagen_invalida_se_rechaza(): void
    {
        Sanctum::actingAs($this->admin());
        $ok = $this->post('/api/admin/productos', ['nombre' => 'Con foto', 'precio' => 8, 'stock' => 3,
            'imagen' => UploadedFile::fake()->create('foto.jpg', 40, 'image/jpeg')], ['Accept' => 'application/json']);
        $ok->assertStatus(201);
        $id = $ok->json('data.id');
        $this->assertDatabaseHas('producto_imagenes', ['producto_id' => $id, 'tipo' => 'image/jpeg']);
        $this->assertNotNull($ok->json('data.imagen'));
        $this->assertStringContainsString("/api/productos/{$id}/imagen?v=", $ok->json('data.imagen_url'));

        // La foto sale de la base de datos (no depende de storage ni de storage:link)
        $this->get("/api/productos/{$id}/imagen")->assertOk()->assertHeader('Content-Type', 'image/jpeg');
        $this->get('/api/productos/9999/imagen')->assertNotFound();

        $mal = $this->post('/api/admin/productos', ['nombre' => 'Malo', 'precio' => 8,
            'imagen' => UploadedFile::fake()->create('virus.pdf', 10, 'application/pdf')], ['Accept' => 'application/json']);
        $mal->assertStatus(422);
        $grande = $this->post('/api/admin/productos', ['nombre' => 'Grande', 'precio' => 8,
            'imagen' => UploadedFile::fake()->create('grande.jpg', 1200, 'image/jpeg')], ['Accept' => 'application/json']);
        $grande->assertStatus(422);
    }

    // ================================================================ HU-04 Menú digital
    public function test_HU04_menu_publico_muestra_solo_disponibles(): void
    {
        $this->producto('Hamburguesa'); $this->producto('Agotado', 5, 0);
        $r = $this->getJson('/api/menu')->assertOk();
        $this->assertCount(1, $r->json());
        $this->assertSame('Hamburguesa', $r->json('0.nombre'));
    }

    public function test_HU04_busqueda_por_nombre_parcial_sin_distinguir_mayusculas(): void
    {
        $this->producto('Hamburguesa Clásica'); $this->producto('Salchipapa');
        $this->assertCount(1, $this->getJson('/api/menu?buscar=HAMBUR')->assertOk()->json());
    }

    public function test_HU04_busqueda_sin_resultados_devuelve_lista_vacia(): void
    {
        $this->producto('Hamburguesa');
        $this->getJson('/api/menu?buscar=pizza')->assertOk()->assertExactJson([]);
    }

    public function test_HU04_los_comodines_de_like_se_tratan_como_texto(): void
    {
        $this->producto('Hamburguesa');
        $this->getJson('/api/menu?buscar=%25')->assertOk()->assertExactJson([]);
    }

    public function test_HU04_filtro_por_categoria(): void
    {
        $this->producto('Café', 7, 5, 'Bebidas'); $this->producto('Brownie', 9, 5, 'Postres');
        $this->assertCount(1, $this->getJson('/api/menu?categoria=Bebidas')->json());
    }

    // ================================================================ HU-05 Pedido
    public function test_HU05_crear_pedido_genera_codigo_calcula_total_y_descuenta_stock(): void
    {
        $u = $this->estudiante(); Sanctum::actingAs($u);
        $a = $this->producto('A', 15.5, 10); $b = $this->producto('B', 10, 5);
        $r = $this->pedir([['id' => $a->id, 'cantidad' => 2], ['id' => $b->id, 'cantidad' => 1]])->assertStatus(201);
        $this->assertSame(5, strlen($r->json('codigo')));
        $this->assertDatabaseHas('pedidos', ['codigo' => $r->json('codigo'), 'total' => 41.00, 'estado' => 'Recibido', 'user_id' => $u->id]);
        $this->assertSame(8, $a->fresh()->stock);
        $this->assertSame(4, $b->fresh()->stock);
        $this->assertDatabaseCount('detalle_pedidos', 2);
        $this->assertDatabaseHas('movimientos_stock', ['producto_id' => $a->id, 'tipo' => 'pedido', 'cantidad' => -2, 'stock_resultante' => 8]);
        $this->assertDatabaseHas('pedido_estados', ['pedido_id' => $r->json('pedido.id'), 'estado' => 'Recibido']);
    }

    public function test_HU05_lineas_repetidas_del_mismo_producto_se_suman(): void
    {
        Sanctum::actingAs($this->estudiante()); $a = $this->producto('A', 10, 10);
        $this->pedir([['id' => $a->id, 'cantidad' => 2], ['id' => $a->id, 'cantidad' => 3]])->assertStatus(201);
        $this->assertSame(5, $a->fresh()->stock);
    }

    public function test_HU05_sin_stock_suficiente_rechaza_y_no_modifica_nada(): void
    {
        Sanctum::actingAs($this->estudiante()); $a = $this->producto('A', 10, 1);
        $this->pedir([['id' => $a->id, 'cantidad' => 3]])->assertStatus(400);
        $this->assertSame(1, $a->fresh()->stock);
        $this->assertDatabaseCount('pedidos', 0);
    }

    public function test_HU05_no_permite_pedir_mas_que_el_stock_sumando_lineas(): void
    {
        Sanctum::actingAs($this->estudiante()); $a = $this->producto('A', 10, 4);
        $this->pedir([['id' => $a->id, 'cantidad' => 3], ['id' => $a->id, 'cantidad' => 3]])->assertStatus(400);
        $this->assertSame(4, $a->fresh()->stock);
    }

    public function test_HU05_producto_no_disponible_se_rechaza(): void
    {
        Sanctum::actingAs($this->estudiante()); $a = $this->producto('A', 10, 5); $a->update(['disponible' => false]);
        $this->pedir([['id' => $a->id, 'cantidad' => 1]])->assertStatus(400);
    }

    public function test_HU05_pedido_es_atomico_si_el_segundo_producto_falla(): void
    {
        Sanctum::actingAs($this->estudiante());
        $a = $this->producto('A', 10, 5); $b = $this->producto('B', 10, 0);
        $this->pedir([['id' => $a->id, 'cantidad' => 1], ['id' => $b->id, 'cantidad' => 1]])->assertStatus(400);
        $this->assertSame(5, $a->fresh()->stock);
        $this->assertDatabaseCount('pedidos', 0);
        $this->assertDatabaseCount('movimientos_stock', 0);
    }

    public function test_HU05_validaciones_carrito_vacio_cantidad_cero_y_producto_inexistente(): void
    {
        Sanctum::actingAs($this->estudiante()); $a = $this->producto();
        $this->postJson('/api/pedidos', ['productos' => []])->assertStatus(422);
        $this->postJson('/api/pedidos', [])->assertStatus(422);
        $this->pedir([['id' => $a->id, 'cantidad' => 0]])->assertStatus(422);
        $this->pedir([['id' => $a->id, 'cantidad' => 999]])->assertStatus(422);
        $this->pedir([['id' => 999, 'cantidad' => 1]])->assertStatus(422);
    }

    public function test_HU05_los_productos_del_seeder_se_pueden_pedir(): void
    {
        $this->seed(DatabaseSeeder::class);
        Sanctum::actingAs(User::where('email', 'estudiante@univalle.edu')->first());
        $this->pedir([['id' => 1, 'cantidad' => 1]])->assertStatus(201);
    }

    public function test_HU05_el_pedido_siempre_es_del_usuario_autenticado_aunque_envie_user_id(): void
    {
        $u = $this->estudiante(); $otro = $this->estudiante('otro@univalle.edu'); Sanctum::actingAs($u); $a = $this->producto();
        $this->postJson('/api/pedidos', ['user_id' => $otro->id, 'productos' => [['id' => $a->id, 'cantidad' => 1]]])->assertStatus(201);
        $this->assertDatabaseHas('pedidos', ['user_id' => $u->id]);
        $this->assertDatabaseMissing('pedidos', ['user_id' => $otro->id]);
    }

    public function test_HU05_los_codigos_de_recojo_no_se_repiten(): void
    {
        Sanctum::actingAs($this->estudiante()); $a = $this->producto('A', 1, 100);
        $codigos = [];
        for ($i = 0; $i < 25; $i++) {
            $codigos[] = $this->pedir([['id' => $a->id, 'cantidad' => 1]])->json('codigo');
        }
        $this->assertCount(25, array_unique($codigos));
    }

    public function test_HU05_si_el_producto_fue_eliminado_no_se_puede_pedir(): void
    {
        Sanctum::actingAs($this->estudiante()); $a = $this->producto(); $a->delete();
        $this->pedir([['id' => $a->id, 'cantidad' => 1]])->assertStatus(422);
    }

    // ================================================================ HU-06 Panel de cocina
    public function test_HU06_activos_en_orden_FIFO_sin_completados_ni_cancelados(): void
    {
        $u = $this->estudiante(); Sanctum::actingAs($this->empleado());
        $p1 = $this->pedido($u, 'Recibido', 'PRIM1'); $p1->forceFill(['created_at' => now()->subMinutes(10)])->save();
        $p2 = $this->pedido($u, 'En preparación', 'SEGU2'); $p2->forceFill(['created_at' => now()->subMinutes(5)])->save();
        $this->pedido($u, 'Completado', 'COMP3'); $this->pedido($u, 'Cancelado', 'CANC4');
        $r = $this->getJson('/api/pedidos/activos')->assertOk();
        $this->assertSame(['PRIM1', 'SEGU2'], array_column($r->json(), 'codigo'));
        $this->assertArrayHasKey('detalles', $r->json('0'));
    }

    public function test_HU06_filtro_por_categoria_de_preparacion(): void
    {
        $u = $this->estudiante(); Sanctum::actingAs($this->empleado());
        $this->pedido($u, 'Recibido', 'BEBID', $this->producto('Café', 7, 5, 'Bebidas'));
        $this->pedido($u, 'Recibido', 'COMID', $this->producto('Burger', 18, 5, 'Comida caliente'));
        $r = $this->getJson('/api/pedidos/activos?categoria=Bebidas')->assertOk();
        $this->assertSame(['BEBID'], array_column($r->json(), 'codigo'));
        $this->assertCount(2, $this->getJson('/api/pedidos/activos')->json());
    }

    // ================================================================ HU-07 Estados y seguimiento
    public function test_HU07_flujo_completo_recibido_preparacion_para_entregar_y_queda_historial(): void
    {
        $u = $this->estudiante(); $emp = $this->empleado(); Sanctum::actingAs($emp); $p = $this->pedido($u);
        $this->putJson("/api/pedidos/{$p->id}/estado", ['estado' => 'En preparación'])->assertOk();
        $this->putJson("/api/pedidos/{$p->id}/estado", ['estado' => 'Para entregar'])->assertOk();
        $this->assertSame('Para entregar', $p->fresh()->estado);
        $this->assertDatabaseHas('pedido_estados', ['pedido_id' => $p->id, 'estado' => 'En preparación', 'user_id' => $emp->id]);
        $this->assertDatabaseHas('pedido_estados', ['pedido_id' => $p->id, 'estado' => 'Para entregar']);
    }

    public function test_HU07_estado_invalido_responde_422(): void
    {
        Sanctum::actingAs($this->empleado()); $p = $this->pedido($this->estudiante());
        $this->putJson("/api/pedidos/{$p->id}/estado", ['estado' => 'Volando'])->assertStatus(422);
        $this->putJson("/api/pedidos/{$p->id}/estado", ['estado' => 'Completado'])->assertStatus(422);
    }

    public function test_HU07_no_se_puede_reabrir_un_pedido_cancelado_o_completado(): void
    {
        $u = $this->estudiante(); Sanctum::actingAs($this->empleado());
        $c = $this->pedido($u, 'Cancelado', 'CANCE'); $k = $this->pedido($u, 'Completado', 'COMPL');
        $this->putJson("/api/pedidos/{$c->id}/estado", ['estado' => 'En preparación'])->assertStatus(409);
        $this->putJson("/api/pedidos/{$k->id}/estado", ['estado' => 'Para entregar'])->assertStatus(409);
        $this->assertSame('Cancelado', $c->fresh()->estado);
    }

    public function test_HU07_no_se_puede_saltar_ni_retroceder_estados(): void
    {
        $u = $this->estudiante(); Sanctum::actingAs($this->empleado());
        $p = $this->pedido($u);
        $this->putJson("/api/pedidos/{$p->id}/estado", ['estado' => 'Para entregar'])->assertStatus(409);
        $q = $this->pedido($u, 'Para entregar', 'LISTO');
        $this->putJson("/api/pedidos/{$q->id}/estado", ['estado' => 'En preparación'])->assertStatus(409);
    }

    public function test_HU07_el_cliente_ve_el_seguimiento_visual_de_su_pedido(): void
    {
        $u = $this->estudiante(); $p = $this->pedido($u, 'Para entregar', 'LISTO');
        Sanctum::actingAs($u);
        $this->getJson("/api/pedidos/{$p->id}")->assertOk()
            ->assertJsonPath('estado', 'Para entregar')
            ->assertJsonPath('progreso.paso', 3)
            ->assertJsonPath('progreso.listo_para_recoger', true);
    }

    public function test_HU07_un_estudiante_no_puede_ver_el_pedido_de_otro(): void
    {
        $p = $this->pedido($this->estudiante('dueno@univalle.edu'));
        Sanctum::actingAs($this->estudiante('intruso@univalle.edu'));
        $this->getJson("/api/pedidos/{$p->id}")->assertStatus(404);
    }

    // ================================================================ HU-08 Entrega por código
    public function test_HU08_entrega_con_codigo_valido_en_cualquier_capitalizacion_y_registra_responsable(): void
    {
        $emp = $this->empleado(); Sanctum::actingAs($emp); $p = $this->pedido($this->estudiante(), 'Para entregar', 'A9F2X');
        $this->postJson('/api/pedidos/entregar', ['codigo' => ' a9f2x '])->assertOk();
        $p->refresh();
        $this->assertSame('Completado', $p->estado);
        $this->assertSame($emp->id, (int) $p->entregado_por);
        $this->assertNotNull($p->entregado_at);
    }

    public function test_HU08_codigo_inexistente_responde_404(): void
    {
        Sanctum::actingAs($this->empleado());
        $this->postJson('/api/pedidos/entregar', ['codigo' => 'ZZZZZ'])->assertStatus(404);
    }

    public function test_HU08_pedido_que_no_esta_listo_no_se_entrega(): void
    {
        Sanctum::actingAs($this->empleado()); $p = $this->pedido($this->estudiante(), 'En preparación', 'PREP1');
        $this->postJson('/api/pedidos/entregar', ['codigo' => 'PREP1'])->assertStatus(409);
        $this->assertSame('En preparación', $p->fresh()->estado);
    }

    public function test_HU08_un_codigo_no_se_puede_usar_dos_veces(): void
    {
        Sanctum::actingAs($this->empleado()); $this->pedido($this->estudiante(), 'Para entregar', 'UNAVZ');
        $this->postJson('/api/pedidos/entregar', ['codigo' => 'UNAVZ'])->assertOk();
        $this->postJson('/api/pedidos/entregar', ['codigo' => 'UNAVZ'])->assertStatus(404);   // el código ya se borró
    }

    public function test_HU08_el_codigo_se_borra_al_entregar_o_cancelar_el_pedido(): void
    {
        $u = $this->estudiante(); Sanctum::actingAs($u); $a = $this->producto('A', 10, 10);
        $id1 = $this->pedir([['id' => $a->id, 'cantidad' => 1]])->json('pedido.id');
        $id2 = $this->pedir([['id' => $a->id, 'cantidad' => 1]])->json('pedido.id');
        $this->postJson("/api/pedidos/{$id2}/cancelar")->assertOk();
        $this->assertNull(Pedido::find($id2)->codigo);

        Sanctum::actingAs($this->empleado());
        $codigo = Pedido::find($id1)->codigo;
        $this->assertNotNull($codigo);
        $this->putJson("/api/pedidos/{$id1}/estado", ['estado' => 'En preparación'])->assertOk();
        $this->putJson("/api/pedidos/{$id1}/estado", ['estado' => 'Para entregar'])->assertOk();
        $this->postJson('/api/pedidos/entregar', ['codigo' => $codigo])->assertOk()->assertJsonPath('pedido.codigo', null);
        $this->assertDatabaseMissing('pedidos', ['codigo' => $codigo]);
    }

    public function test_HU08_codigo_es_obligatorio(): void
    {
        Sanctum::actingAs($this->empleado());
        $this->postJson('/api/pedidos/entregar', [])->assertStatus(422);
    }

    // ================================================================ HU-09 Stock en tiempo real
    public function test_HU09_al_llegar_stock_a_cero_el_producto_queda_agotado_y_sale_del_menu(): void
    {
        Sanctum::actingAs($this->estudiante()); $a = $this->producto('A', 10, 2);
        $this->pedir([['id' => $a->id, 'cantidad' => 2]])->assertStatus(201);
        $this->assertFalse($a->fresh()->disponible);
        $this->getJson('/api/menu')->assertExactJson([]);
    }

    public function test_HU09_alertas_de_stock_bajo_y_agotado(): void
    {
        $this->producto('Normal', 5, 50); $this->producto('Bajo', 5, 3); $this->producto('Agotado', 5, 0);
        Sanctum::actingAs($this->empleado());
        $r = $this->getJson('/api/inventario/alertas')->assertOk();
        $this->assertSame(['Agotado', 'Bajo'], array_column($r->json(), 'nombre'));
        $this->assertSame(['agotado', 'stock_bajo'], array_column($r->json(), 'alerta'));
    }

    public function test_HU09_reponer_stock_rehabilita_el_producto_y_deja_historial(): void
    {
        $emp = $this->empleado(); Sanctum::actingAs($emp); $p = $this->producto('A', 10, 0);
        $this->patchJson("/api/productos/{$p->id}/stock", ['agregar' => 20, 'motivo' => 'Compra del día'])->assertOk();
        $p->refresh();
        $this->assertSame(20, $p->stock);
        $this->assertTrue($p->disponible);
        $this->assertDatabaseHas('movimientos_stock', ['producto_id' => $p->id, 'tipo' => 'reposicion', 'cantidad' => 20, 'user_id' => $emp->id]);
        $this->getJson("/api/productos/{$p->id}/movimientos")->assertOk()->assertJsonCount(1);
    }

    public function test_HU09_ajustar_stock_a_un_valor_exacto(): void
    {
        Sanctum::actingAs($this->empleado()); $p = $this->producto('A', 10, 10);
        $this->patchJson("/api/productos/{$p->id}/stock", ['stock' => 4])->assertOk();
        $this->assertSame(4, $p->fresh()->stock);
        $this->patchJson("/api/productos/{$p->id}/stock", ['stock' => 0])->assertOk();
        $this->assertFalse($p->fresh()->disponible);
    }

    public function test_HU09_validaciones_de_stock(): void
    {
        Sanctum::actingAs($this->empleado()); $p = $this->producto();
        $this->patchJson("/api/productos/{$p->id}/stock", [])->assertStatus(422);
        $this->patchJson("/api/productos/{$p->id}/stock", ['agregar' => 0])->assertStatus(422);
        $this->patchJson("/api/productos/{$p->id}/stock", ['stock' => -3])->assertStatus(422);
    }

    public function test_HU09_el_personal_puede_marcar_agotado_manualmente(): void
    {
        Sanctum::actingAs($this->empleado()); $p = $this->producto('A', 10, 10);
        $this->patchJson("/api/productos/{$p->id}/agotado")->assertOk();
        $this->assertFalse($p->fresh()->disponible);
        $this->assertSame(10, $p->fresh()->stock);
    }

    // ================================================================ HU-10 Cancelación
    public function test_HU10_cancelar_pedido_recibido_devuelve_stock_exacto_y_reactiva_producto(): void
    {
        $u = $this->estudiante(); Sanctum::actingAs($u);
        $prod = $this->producto('A', 10, 3);
        $id = $this->pedir([['id' => $prod->id, 'cantidad' => 3]])->json('pedido.id');
        $this->assertFalse($prod->fresh()->disponible);
        $this->postJson("/api/pedidos/{$id}/cancelar")->assertOk();
        $this->assertSame('Cancelado', Pedido::find($id)->estado);
        $this->assertSame(3, $prod->fresh()->stock);
        $this->assertTrue($prod->fresh()->disponible);
        $this->assertDatabaseHas('movimientos_stock', ['pedido_id' => $id, 'tipo' => 'cancelacion', 'cantidad' => 3]);
    }

    public function test_HU10_no_se_cancela_un_pedido_en_preparacion_o_posterior(): void
    {
        $u = $this->estudiante(); Sanctum::actingAs($u);
        foreach (['En preparación', 'Para entregar', 'Completado'] as $i => $estado) {
            $p = $this->pedido($u, $estado, "NOCA$i");
            $this->postJson("/api/pedidos/{$p->id}/cancelar")->assertStatus(400);
        }
    }

    public function test_HU10_cancelar_dos_veces_no_duplica_el_stock(): void
    {
        Sanctum::actingAs($this->estudiante()); $prod = $this->producto('A', 10, 5);
        $id = $this->pedir([['id' => $prod->id, 'cantidad' => 2]])->json('pedido.id');
        $this->postJson("/api/pedidos/{$id}/cancelar")->assertOk();
        $this->postJson("/api/pedidos/{$id}/cancelar")->assertStatus(400);
        $this->assertSame(5, $prod->fresh()->stock);
    }

    public function test_HU10_pedido_inexistente_responde_404(): void
    {
        Sanctum::actingAs($this->estudiante());
        $this->postJson('/api/pedidos/9999/cancelar')->assertStatus(404);
    }

    public function test_HU10_un_estudiante_no_puede_cancelar_el_pedido_de_otro(): void
    {
        $p = $this->pedido($this->estudiante('dueno@univalle.edu'), 'Recibido', 'AJENO');
        Sanctum::actingAs($this->estudiante('intruso@univalle.edu'));
        $this->postJson("/api/pedidos/{$p->id}/cancelar")->assertStatus(404);
        $this->assertSame('Recibido', $p->fresh()->estado);
    }

    // ================================================================ HU-11 Historial
    public function test_HU11_mis_pedidos_devuelve_solo_los_propios_mas_recientes_primero(): void
    {
        $u = $this->estudiante(); $otro = $this->estudiante('otro@univalle.edu'); Sanctum::actingAs($u);
        $a = $this->pedido($u, 'Completado', 'VIEJO'); $a->forceFill(['created_at' => now()->subDay()])->save();
        $this->pedido($u, 'Recibido', 'NUEVO'); $this->pedido($otro, 'Completado', 'AJENO');
        $r = $this->getJson('/api/mis-pedidos')->assertOk();
        $this->assertSame(['NUEVO', 'VIEJO'], array_column($r->json(), 'codigo'));
        $this->assertArrayHasKey('detalles', $r->json('0'));
        $this->assertSame(['VIEJO'], array_column($this->getJson('/api/mis-pedidos?estado=Completado')->json(), 'codigo'));
    }

    public function test_HU11_historial_por_id_solo_completados_y_solo_el_dueno(): void
    {
        $u = $this->estudiante(); $this->pedido($u, 'Completado', 'HECHO'); $this->pedido($u, 'Recibido', 'ACTIV');
        Sanctum::actingAs($u);
        $this->assertSame(['HECHO'], array_column($this->getJson("/api/estudiantes/{$u->id}/historial")->assertOk()->json(), 'codigo'));

        Sanctum::actingAs($this->estudiante('intruso@univalle.edu'));
        $this->getJson("/api/estudiantes/{$u->id}/historial")->assertStatus(403);
    }

    public function test_HU11_volver_a_pedir_crea_un_pedido_nuevo_con_los_mismos_items(): void
    {
        $u = $this->estudiante(); Sanctum::actingAs($u); $a = $this->producto('A', 10, 10);
        $id = $this->pedir([['id' => $a->id, 'cantidad' => 2]])->json('pedido.id');
        $r = $this->postJson("/api/pedidos/{$id}/repetir")->assertStatus(201);
        $this->assertNotSame($id, $r->json('pedido.id'));
        $this->assertSame(6, $a->fresh()->stock);
    }

    public function test_HU11_volver_a_pedir_falla_si_ya_no_hay_stock(): void
    {
        $u = $this->estudiante(); Sanctum::actingAs($u); $a = $this->producto('A', 10, 2);
        $id = $this->pedir([['id' => $a->id, 'cantidad' => 2]])->json('pedido.id');
        $this->postJson("/api/pedidos/{$id}/repetir")->assertStatus(400);
    }

    // ================================================================ HU-12 Combos
    private function combo(): array
    {
        $h = $this->producto('Burger', 18, 10); $r = $this->producto('Refresco', 6, 10, 'Bebidas');
        Sanctum::actingAs($this->admin());
        $res = $this->postJson('/api/admin/combos', ['nombre' => 'Combo del día', 'precio' => 20,
            'productos' => [['id' => $h->id, 'cantidad' => 1], ['id' => $r->id, 'cantidad' => 2]]])->assertStatus(201);
        return [$res->json('data.id'), $h, $r];
    }

    public function test_HU12_el_pedido_guarda_que_llevaba_el_combo_aunque_luego_se_edite(): void
    {
        [$id, $h, $r] = $this->combo();
        Sanctum::actingAs($this->estudiante());
        $pid = $this->pedir([], [['id' => $id, 'cantidad' => 1]])->assertStatus(201)->json('pedido.id');
        Sanctum::actingAs(User::where('rol', 'admin')->first());
        $this->putJson("/api/admin/combos/{$id}", ['productos' => [['id' => $h->id, 'cantidad' => 3]]])->assertOk();

        $linea = Pedido::find($pid)->detalles->first();
        $this->assertSame([['nombre' => 'Burger', 'cantidad' => 1], ['nombre' => 'Refresco', 'cantidad' => 2]], $linea->contenido);
    }

    public function test_HU12_admin_crea_combo_con_precio_especial_y_se_calcula_el_ahorro(): void
    {
        [$id] = $this->combo();
        $this->assertDatabaseHas('combos', ['id' => $id, 'precio' => 20.00]);
        $r = $this->getJson('/api/combos')->assertOk();
        $this->assertSame('30.00', $r->json('0.precio_normal'));
        $this->assertSame('10.00', $r->json('0.ahorro'));
        $this->assertTrue($r->json('0.disponible'));
    }

    public function test_HU12_validaciones_de_combo(): void
    {
        Sanctum::actingAs($this->admin()); $p = $this->producto();
        $this->postJson('/api/admin/combos', ['nombre' => 'X', 'precio' => 5, 'productos' => []])->assertStatus(422);
        $this->postJson('/api/admin/combos', ['nombre' => 'X', 'precio' => 5, 'productos' => [['id' => 999, 'cantidad' => 1]]])->assertStatus(422);
        $this->postJson('/api/admin/combos', ['nombre' => 'X', 'precio' => 5, 'productos' => [['id' => $p->id, 'cantidad' => 1], ['id' => $p->id, 'cantidad' => 1]]])->assertStatus(422);
        $this->postJson('/api/admin/combos', ['precio' => 5, 'productos' => [['id' => $p->id, 'cantidad' => 1]]])->assertStatus(422);
    }

    public function test_HU12_pedir_un_combo_descuenta_el_stock_de_los_productos_base(): void
    {
        [$id, $h, $r] = $this->combo();
        $u = $this->estudiante(); Sanctum::actingAs($u);
        $res = $this->pedir([], [['id' => $id, 'cantidad' => 2]])->assertStatus(201);
        $this->assertEquals(40.00, $res->json('total'));
        $this->assertSame(8, $h->fresh()->stock);   // 2 combos x 1
        $this->assertSame(6, $r->fresh()->stock);   // 2 combos x 2
        $this->assertDatabaseHas('detalle_pedidos', ['combo_id' => $id, 'cantidad' => 2, 'nombre' => 'Combo del día']);
    }

    public function test_HU12_combo_y_producto_suelto_comparten_el_mismo_stock(): void
    {
        [$id, $h] = $this->combo(); $h->update(['stock' => 2]);
        Sanctum::actingAs($this->estudiante());
        $this->pedir([['id' => $h->id, 'cantidad' => 2]], [['id' => $id, 'cantidad' => 1]])->assertStatus(400);
        $this->assertSame(2, $h->fresh()->stock);
    }

    public function test_HU12_cancelar_un_pedido_con_combo_devuelve_el_stock_de_cada_producto_base(): void
    {
        [$id, $h, $r] = $this->combo();
        Sanctum::actingAs($this->estudiante());
        $pid = $this->pedir([], [['id' => $id, 'cantidad' => 1]])->json('pedido.id');
        $this->postJson("/api/pedidos/{$pid}/cancelar")->assertOk();
        $this->assertSame(10, $h->fresh()->stock);
        $this->assertSame(10, $r->fresh()->stock);
    }

    public function test_HU12_el_combo_deja_de_estar_disponible_si_un_producto_base_se_agota(): void
    {
        [$id, $h] = $this->combo();
        $h->update(['stock' => 0, 'disponible' => false]);
        $this->assertCount(0, $this->getJson('/api/combos')->json());          // ya no sale en el menú
        $this->assertFalse($this->getJson('/api/admin/combos')->json('0.disponible'));   // el admin sí lo ve
        Sanctum::actingAs($this->estudiante());
        $this->pedir([], [['id' => $id, 'cantidad' => 1]])->assertStatus(400);
    }

    public function test_HU12_combo_inactivo_no_se_muestra_ni_se_puede_pedir(): void
    {
        [$id] = $this->combo();
        $this->patchJson("/api/admin/combos/{$id}/toggle")->assertOk();
        $this->getJson('/api/combos')->assertExactJson([]);
        Sanctum::actingAs($this->estudiante());
        $this->pedir([], [['id' => $id, 'cantidad' => 1]])->assertStatus(400);
    }

    public function test_HU12_admin_edita_y_elimina_combo(): void
    {
        [$id, $h] = $this->combo();
        $this->putJson("/api/admin/combos/{$id}", ['precio' => 15, 'productos' => [['id' => $h->id, 'cantidad' => 3]]])->assertOk();
        $this->assertDatabaseHas('combo_producto', ['combo_id' => $id, 'producto_id' => $h->id, 'cantidad' => 3]);
        $this->assertDatabaseCount('combo_producto', 1);
        $this->deleteJson("/api/admin/combos/{$id}")->assertOk();
        $this->assertSoftDeleted('combos', ['id' => $id]);
    }
}
