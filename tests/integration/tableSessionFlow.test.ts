import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/main/app.js';
import { db } from '../../src/main/database/db.js';
import { redis } from '../../src/main/redis/redisClient.js';

describe('Table & Session Lifecycle Flow (Fase 2)', () => {
  const app = buildApp();
  let waiterToken: string;

  // Datos del seed
  const mesa1Id = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a41';
  const mesa1QrToken = '7f8c9d0e1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d';
  const tarifaMediodiaId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

  beforeAll(async () => {
    // Asegurar que no hay sesiones abiertas residuales en Mesa 1
    await db.query(`UPDATE table_session SET estado = 'cerrada' WHERE table_id = $1 AND estado = 'abierta'`, [mesa1Id]);

    // Login del camarero
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/login',
      payload: {
        email: 'waiter@sakura.es',
        password: 'Sakura2026!'
      }
    });
    waiterToken = JSON.parse(loginRes.body).token;
  });

  afterAll(async () => {
    await db.query(`UPDATE table_session SET estado = 'cerrada' WHERE table_id = $1 AND estado = 'abierta'`, [mesa1Id]);
    await app.close();
    await db.close();
    await redis.close();
  });

  it('1. El cliente escanea el QR y la mesa está inicialmente cerrada (isOpen: false)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/tables/${mesa1QrToken}`
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.isOpen).toBe(false);
    expect(body.tableNumber).toBe(1);
    expect(body.session).toBeUndefined();
  });

  it('2. El cliente intenta unirse antes de que el camarero abra la mesa y recibe 409 SESSION_NOT_OPEN', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${mesa1QrToken}/join`
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('SESSION_NOT_OPEN');
  });

  it('3. El camarero abre la mesa con tarifa y 3 comensales (201 Created)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/staff/tables/${mesa1Id}/open`,
      headers: {
        authorization: `Bearer ${waiterToken}`
      },
      payload: {
        tariff_id: tarifaMediodiaId,
        comensales: 3
      }
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.session.tableId).toBe(mesa1Id);
    expect(body.session.comensales).toBe(3);
    expect(body.session.estado).toBe('abierta');
  });

  it('4. Intentar abrir una mesa ya abierta devuelve 409 TABLE_ALREADY_OPEN', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/staff/tables/${mesa1Id}/open`,
      headers: {
        authorization: `Bearer ${waiterToken}`
      },
      payload: {
        tariff_id: tarifaMediodiaId,
        comensales: 2
      }
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('TABLE_ALREADY_OPEN');
  });

  it('5. El cliente vuelve a escanear el QR y ahora está abierta (isOpen: true)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/tables/${mesa1QrToken}`
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.isOpen).toBe(true);
    expect(body.session).toBeDefined();
    expect(body.session.comensales).toBe(3);
  });

  it('6. El cliente se une a la mesa abierta y recibe el token de sesión y la tarifa', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${mesa1QrToken}/join`
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.sessionToken).toBeDefined();
    expect(body.tariff.nombre).toBe('Buffet Mediodía');
    expect(body.tariff.platosPorRonda).toBe(6);

    const clientSessionToken = body.sessionToken;

    // 7. El cliente consulta el estado de su sesión con su token
    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/v1/session/status',
      headers: {
        authorization: `Bearer ${clientSessionToken}`
      }
    });

    expect(statusRes.statusCode).toBe(200);
    const statusBody = JSON.parse(statusRes.body);
    expect(statusBody.comensales).toBe(3);
    expect(statusBody.tiempoRestanteMinutos).toBeGreaterThan(0);

    // 8. El camarero cierra la mesa
    const closeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/staff/tables/${mesa1Id}/close`,
      headers: {
        authorization: `Bearer ${waiterToken}`
      }
    });
    expect(closeRes.statusCode).toBe(200);

    // 9. El token del cliente deja de valer inmediatamente (401 SESSION_EXPIRED)
    const afterCloseRes = await app.inject({
      method: 'GET',
      url: '/api/v1/session/status',
      headers: {
        authorization: `Bearer ${clientSessionToken}`
      }
    });

    expect(afterCloseRes.statusCode).toBe(401);
    const afterCloseBody = JSON.parse(afterCloseRes.body);
    expect(afterCloseBody.code).toBe('SESSION_EXPIRED');
  });

  it('10. Validación de comensales: abrir mesa con 0 comensales devuelve 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/staff/tables/${mesa1Id}/open`,
      headers: {
        authorization: `Bearer ${waiterToken}`
      },
      payload: {
        tariff_id: tarifaMediodiaId,
        comensales: 0
      }
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});
