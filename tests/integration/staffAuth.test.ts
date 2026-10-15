import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/main/app.js';
import { db } from '../../src/main/database/db.js';
import { redis } from '../../src/main/redis/redisClient.js';

describe('Staff Authentication & Role Authorization Integration', () => {
  const app = buildApp();
  let adminToken: string;
  let waiterToken: string;
  let kitchenToken: string;

  beforeAll(async () => {
    // 1. Login como admin
    const adminLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/login',
      payload: {
        email: 'admin@sakura.es',
        password: 'Sakura2026!'
      }
    });
    expect(adminLoginRes.statusCode).toBe(200);
    adminToken = JSON.parse(adminLoginRes.body).token;

    // 2. Login como camarero (sala)
    const waiterLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/login',
      payload: {
        email: 'waiter@sakura.es',
        password: 'Sakura2026!'
      }
    });
    expect(waiterLoginRes.statusCode).toBe(200);
    waiterToken = JSON.parse(waiterLoginRes.body).token;

    // 3. Login como cocina
    const kitchenLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/login',
      payload: {
        email: 'kitchen@sakura.es',
        password: 'Sakura2026!'
      }
    });
    expect(kitchenLoginRes.statusCode).toBe(200);
    kitchenToken = JSON.parse(kitchenLoginRes.body).token;
  });

  afterAll(async () => {
    await app.close();
    await db.close();
    await redis.close();
  });

  it('debe rechazar el login con contraseña incorrecta devolviendo 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/login',
      payload: {
        email: 'admin@sakura.es',
        password: 'WrongPassword'
      }
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('INVALID_CREDENTIALS');
  });

  it('GET /api/v1/staff/me debe devolver los datos del usuario autenticado', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/staff/me',
      headers: {
        authorization: `Bearer ${waiterToken}`
      }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe('waiter@sakura.es');
    expect(body.user.rol).toBe('sala');
  });

  it('debe rechazar accesos sin token a endpoints protegidos devolviendo 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/staff/me'
    });
    expect(res.statusCode).toBe(401);
  });

  it('cocina NO debe poder abrir mesas devolviendo 403 FORBIDDEN', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/tables/d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a41/open',
      headers: {
        authorization: `Bearer ${kitchenToken}`
      },
      payload: {
        tariff_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        comensales: 2
      }
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('sala NO debe poder crear mesas de administración devolviendo 403 FORBIDDEN', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/tables',
      headers: {
        authorization: `Bearer ${waiterToken}`
      },
      payload: {
        numero: 99
      }
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('admin SÍ puede crear mesas devolviendo 201 Created con token QR seguro', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/tables',
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        numero: 10
      }
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.table.numero).toBe(10);
    expect(body.table.qr_token).toHaveLength(64);

    // Limpieza
    await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/tables/${body.table.id}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
  });
});
