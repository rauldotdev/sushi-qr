import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/main/app.js';
import { db } from '../../src/main/database/db.js';
import { redis } from '../../src/main/redis/redisClient.js';

describe('Catalog & Menu Flow with Redis Cache and ETag (Fase 3)', () => {
  const app = buildApp();
  let adminToken: string;
  let waiterToken: string;
  let customerToken: string;

  const mesa2Id = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a42';
  const mesa2QrToken = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b';
  const tarifaNocheId = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

  let createdCategoryId: string;
  let createdDishId: string;

  beforeAll(async () => {
    // 1. Logins de personal
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/login',
      payload: { email: 'admin@sakura.es', password: 'Sakura2026!' }
    });
    adminToken = JSON.parse(adminLogin.body).token;

    const waiterLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/login',
      payload: { email: 'waiter@sakura.es', password: 'Sakura2026!' }
    });
    waiterToken = JSON.parse(waiterLogin.body).token;

    // 2. Limpiar sesiones en Mesa 2 y abrirla con Tarifa Noche
    await db.query(`UPDATE table_session SET estado = 'cerrada' WHERE table_id = $1 AND estado = 'abierta'`, [mesa2Id]);
    await app.inject({
      method: 'POST',
      url: `/api/v1/staff/tables/${mesa2Id}/open`,
      headers: { authorization: `Bearer ${waiterToken}` },
      payload: { tariff_id: tarifaNocheId, comensales: 2 }
    });

    // 3. Cliente se une a Mesa 2
    const joinRes = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${mesa2QrToken}/join`
    });
    customerToken = JSON.parse(joinRes.body).sessionToken;
  });

  afterAll(async () => {
    await db.query(`UPDATE table_session SET estado = 'cerrada' WHERE table_id = $1 AND estado = 'abierta'`, [mesa2Id]);
    if (createdDishId) {
      await db.query(`DELETE FROM dish WHERE id = $1`, [createdDishId]);
    }
    if (createdCategoryId) {
      await db.query(`DELETE FROM category WHERE id = $1`, [createdCategoryId]);
    }
    await app.close();
    await db.close();
    await redis.close();
  });

  it('1. Camarero NO debe poder crear platos en /admin/dishes devolviendo 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/dishes',
      headers: { authorization: `Bearer ${waiterToken}` },
      payload: {
        category_id: 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a51',
        nombre_es: 'Plato Prohibido',
        nombre_en: 'Forbidden Dish'
      }
    });

    expect(res.statusCode).toBe(403);
  });

  it('2. Administrador crea categoría y plato con alérgenos correctamente (201 Created)', async () => {
    // Crear categoría
    const catRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/categories',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        nombre_es: 'Tempuras & Fritos',
        nombre_en: 'Tempura & Fried',
        orden: 5
      }
    });
    expect(catRes.statusCode).toBe(201);
    createdCategoryId = JSON.parse(catRes.body).category.id;

    // Crear plato
    const dishRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/dishes',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        category_id: createdCategoryId,
        nombre_es: 'Tempura de Langostinos Tigre (3 uds)',
        nombre_en: 'Tiger Prawn Tempura (3 pcs)',
        descripcion_es: 'Crujientes langostinos con salsa tentsuyu',
        descripcion_en: 'Crispy prawns served with tentsuyu dip',
        imagen: '/images/dishes/tempura.webp',
        alergenos: ['crustaceos', 'gluten'],
        limite_por_ronda: 2,
        activo: true
      }
    });
    expect(dishRes.statusCode).toBe(201);
    createdDishId = JSON.parse(dishRes.body).dish.id;

    // Asignar a tarifa noche
    await app.inject({
      method: 'POST',
      url: `/api/v1/admin/tariffs/${tarifaNocheId}/dishes`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        dish_ids: [
          'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a61',
          'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a62',
          createdDishId
        ]
      }
    });
  });

  it('3. GET /api/v1/menu devuelve la carta con ETag y Cache-Control en primera visita', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/menu',
      headers: {
        authorization: `Bearer ${customerToken}`
      }
    });

    expect(res.statusCode).toBe(200);
    const etag = res.headers['etag'];
    expect(etag).toBeDefined();
    expect(res.headers['cache-control']).toContain('must-revalidate');

    const body = JSON.parse(res.body);
    expect(body.categories).toBeDefined();
    expect(body.categories.length).toBeGreaterThan(0);
  });

  it('4. Reenviar petición con If-None-Match devuelve HTTP 304 Not Modified sin recargar datos', async () => {
    // 1. Primera petición para obtener el ETag
    const firstRes = await app.inject({
      method: 'GET',
      url: '/api/v1/menu',
      headers: { authorization: `Bearer ${customerToken}` }
    });
    const currentEtag = firstRes.headers['etag'] as string;

    // 2. Segunda petición con If-None-Match
    const secondRes = await app.inject({
      method: 'GET',
      url: '/api/v1/menu',
      headers: {
        authorization: `Bearer ${customerToken}`,
        'if-none-match': currentEtag
      }
    });

    expect(secondRes.statusCode).toBe(304);
    expect(secondRes.body).toBe('');
    expect(secondRes.headers['etag']).toBe(currentEtag);
  });

  it('5. Filtro de alérgenos: ?exclude_allergens=crustaceos oculta platos con dicho alérgeno', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/menu?exclude_allergens=crustaceos',
      headers: { authorization: `Bearer ${customerToken}` }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const allDishes = body.categories.flatMap((c: any) => c.platos);

    const hasCrustaceos = allDishes.some((d: any) =>
      d.alergenos.includes('crustaceos')
    );
    expect(hasCrustaceos).toBe(false);
  });

  it('6. Modificación por el Administrador invalida la caché en Redis y devuelve nuevo ETag', async () => {
    // 1. Obtener ETag actual
    const initialRes = await app.inject({
      method: 'GET',
      url: '/api/v1/menu',
      headers: { authorization: `Bearer ${customerToken}` }
    });
    const oldEtag = initialRes.headers['etag'] as string;

    // 2. Admin edita el plato
    const updateRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/admin/dishes/${createdDishId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        nombre_es: 'Tempura de Langostinos Especial Crujiente'
      }
    });
    expect(updateRes.statusCode).toBe(200);

    // 3. Cliente vuelve a consultar con el ETag anterior: debe recibir 200 y nuevo ETag
    const afterUpdateRes = await app.inject({
      method: 'GET',
      url: '/api/v1/menu',
      headers: {
        authorization: `Bearer ${customerToken}`,
        'if-none-match': oldEtag
      }
    });

    expect(afterUpdateRes.statusCode).toBe(200);
    expect(afterUpdateRes.headers['etag']).not.toBe(oldEtag);
    const body = JSON.parse(afterUpdateRes.body);
    const updatedDish = body.categories
      .flatMap((c: any) => c.platos)
      .find((d: any) => d.id === createdDishId);
    expect(updatedDish.nombre_es).toBe('Tempura de Langostinos Especial Crujiente');
  });
});
