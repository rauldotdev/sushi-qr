import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/main/app.js';
import { db } from '../../src/main/database/db.js';
import { redis } from '../../src/main/redis/redisClient.js';

describe('Order Creation & Buffet Rules Flow (Fase 4)', () => {
  const app = buildApp();
  let waiterToken: string;
  let customerToken: string;
  let sessionId: string;

  // Datos del seed (Mesa 3 para evitar colisiones con Mesa 1 y Mesa 2)
  const mesa3Id = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a43';
  const mesa3QrToken = '3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d';
  const tarifaMediodiaId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

  const edamameId = 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a61';
  const gyozaId = 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a62';

  let round1Id: string;
  let line1Id: string;
  let line2Id: string;

  beforeAll(async () => {
    // 1. Limpiar sesiones anteriores de Mesa 3
    await db.query(`UPDATE table_session SET estado = 'cerrada' WHERE table_id = $1`, [mesa3Id]);

    // 2. Login de camarero
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/login',
      payload: {
        email: 'waiter@sakura.es',
        password: 'Sakura2026!'
      }
    });
    waiterToken = JSON.parse(loginRes.body).token;

    // 3. Camarero abre Mesa 3
    const openRes = await app.inject({
      method: 'POST',
      url: `/api/v1/staff/tables/${mesa3Id}/open`,
      headers: { authorization: `Bearer ${waiterToken}` },
      payload: {
        tariff_id: tarifaMediodiaId,
        comensales: 2
      }
    });
    sessionId = JSON.parse(openRes.body).session.id;

    // 4. Comensal se une a Mesa 3
    const joinRes = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${mesa3QrToken}/join`
    });
    customerToken = JSON.parse(joinRes.body).sessionToken;
  });

  afterAll(async () => {
    await db.query(`UPDATE table_session SET estado = 'cerrada' WHERE table_id = $1`, [mesa3Id]);
    await app.close();
    await db.close();
    await redis.close();
  });

  it('1. Cliente envía pedido con Idempotency-Key y se crea ronda con éxito (201 Created)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: {
        authorization: `Bearer ${customerToken}`,
        'idempotency-key': 'idem-test-round-1'
      },
      payload: {
        items: [
          { dish_id: edamameId, cantidad: 2 },
          { dish_id: gyozaId, cantidad: 2 }
        ]
      }
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.round).toBeDefined();
    expect(body.round.numero).toBe(1);
    expect(body.round.estado).toBe('en_cola');
    expect(body.lines).toHaveLength(2);

    round1Id = body.round.id;
    line1Id = body.lines[0].id;
    line2Id = body.lines[1].id;
  });

  it('2. Reintento de red con misma Idempotency-Key devuelve el mismo pedido sin duplicar (200 OK)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: {
        authorization: `Bearer ${customerToken}`,
        'idempotency-key': 'idem-test-round-1'
      },
      payload: {
        items: [
          { dish_id: edamameId, cantidad: 2 },
          { dish_id: gyozaId, cantidad: 2 }
        ]
      }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.round.id).toBe(round1Id);
    expect(body.lines).toHaveLength(2);

    // Verificar en la BD que solo hay 1 ronda registrada para esta clave
    const countRes = await db.query(
      `SELECT COUNT(*) FROM order_round WHERE session_id = $1 AND idempotency_key = $2`,
      [sessionId, 'idem-test-round-1']
    );
    expect(Number(countRes.rows[0].count)).toBe(1);
  });

  it('3. Reintento con misma Idempotency-Key pero payload alterado devuelve 409 IDEMPOTENCY_CONFLICT', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: {
        authorization: `Bearer ${customerToken}`,
        'idempotency-key': 'idem-test-round-1'
      },
      payload: {
        items: [
          { dish_id: edamameId, cantidad: 1 } // Cambiado cantidad
        ]
      }
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('4. Intentar pedir otra ronda mientras la anterior sigue en cola/cocina devuelve 422 ROUND_PENDING', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: {
        authorization: `Bearer ${customerToken}`,
        'idempotency-key': 'idem-test-round-2'
      },
      payload: {
        items: [
          { dish_id: edamameId, cantidad: 1 }
        ]
      }
    });

    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('ROUND_PENDING');
  });

  it('5. Comensal puede cancelar un plato de su pedido si sigue en cola (200 OK)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/lines/${line1Id}/cancel`,
      headers: {
        authorization: `Bearer ${customerToken}`
      }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.lineId).toBe(line1Id);
    expect(body.estado).toBe('cancelado');

    // Verificar en la BD
    const lineRes = await db.query(`SELECT estado FROM order_line WHERE id = $1`, [line1Id]);
    expect(lineRes.rows[0].estado).toBe('cancelado');
  });

  it('6. Comensal NO puede cancelar un plato si ya ha pasado a cocina (422 LINE_CANNOT_BE_CANCELLED)', async () => {
    // Simulamos que la cocina aceptó el plato y pasó a en_cocina
    await db.query(`UPDATE order_line SET estado = 'en_cocina' WHERE id = $1`, [line2Id]);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/lines/${line2Id}/cancel`,
      headers: {
        authorization: `Bearer ${customerToken}`
      }
    });

    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('LINE_CANNOT_BE_CANCELLED');
  });

  it('7. Cliente consulta el historial de sus pedidos y obtiene las rondas y platos (200 OK)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/orders',
      headers: {
        authorization: `Bearer ${customerToken}`
      }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.rounds).toBeInstanceOf(Array);
    expect(body.rounds.length).toBeGreaterThanOrEqual(1);

    const round = body.rounds.find((r: any) => r.id === round1Id);
    expect(round).toBeDefined();
    expect(round.lines).toHaveLength(2);
    expect(round.lines.some((l: any) => l.estado === 'cancelado')).toBe(true);
    expect(round.lines.some((l: any) => l.estado === 'en_cocina')).toBe(true);
  });
});
