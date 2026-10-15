import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/main/app.js';
import { db } from '../../src/main/database/db.js';
import { redis } from '../../src/main/redis/redisClient.js';

describe('Kitchen KDS Screen & Order Transitions Flow (Fase 5)', () => {
  const app = buildApp();
  let cookToken: string;
  let waiterToken: string;
  let customerToken: string;
  let sessionId: string;
  let roundId: string;
  let line1Id: string;
  let line2Id: string;

  // Mesa 4 dedicada para evitar colisiones
  const mesa4Id = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';
  const mesa4QrToken = '4a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a44';
  const restaurantId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const tarifaMediodiaId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

  const edamameId = 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a61';
  const gyozaId = 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a62';

  beforeAll(async () => {
    // 1. Crear Mesa 4 si no existe
    await db.query(
      `INSERT INTO "table" (id, restaurant_id, numero, qr_token)
       VALUES ($1, $2, 4, $3)
       ON CONFLICT (id) DO UPDATE SET qr_token = $3`,
      [mesa4Id, restaurantId, mesa4QrToken]
    );

    // 2. Limpiar sesiones anteriores en Mesa 4
    await db.query(`UPDATE table_session SET estado = 'cerrada' WHERE table_id = $1`, [mesa4Id]);

    // 3. Login de Cocinero
    const cookLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/login',
      payload: { email: 'kitchen@sakura.es', password: 'Sakura2026!' }
    });
    cookToken = JSON.parse(cookLogin.body).token;

    // 4. Login de Camarero
    const waiterLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/login',
      payload: { email: 'waiter@sakura.es', password: 'Sakura2026!' }
    });
    waiterToken = JSON.parse(waiterLogin.body).token;

    // 5. Camarero abre Mesa 4
    const openRes = await app.inject({
      method: 'POST',
      url: `/api/v1/staff/tables/${mesa4Id}/open`,
      headers: { authorization: `Bearer ${waiterToken}` },
      payload: { tariff_id: tarifaMediodiaId, comensales: 2 }
    });
    sessionId = JSON.parse(openRes.body).session.id;

    // 6. Comensal se une y crea una ronda con 2 líneas
    const joinRes = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${mesa4QrToken}/join`
    });
    customerToken = JSON.parse(joinRes.body).sessionToken;

    const orderRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: {
        authorization: `Bearer ${customerToken}`,
        'idempotency-key': 'kds-flow-test-round-1'
      },
      payload: {
        items: [
          { dish_id: edamameId, cantidad: 2 },
          { dish_id: gyozaId, cantidad: 1 }
        ]
      }
    });

    const orderBody = JSON.parse(orderRes.body);
    roundId = orderBody.round.id;
    line1Id = orderBody.lines[0].id;
    line2Id = orderBody.lines[1].id;
  });

  afterAll(async () => {
    await db.query(`UPDATE table_session SET estado = 'cerrada' WHERE table_id = $1`, [mesa4Id]);
    await db.query(`DELETE FROM "table" WHERE id = $1`, [mesa4Id]);
    await app.close();
    await db.close();
    await redis.close();
  });

  it('1. Cliente no autenticado recibe 401 en /api/v1/staff/orders', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/staff/orders'
    });
    expect(res.statusCode).toBe(401);
  });

  it('2. Comensal con token de cliente recibe 401 al intentar acceder a rutas de personal', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/staff/orders',
      headers: { authorization: `Bearer ${customerToken}` }
    });
    expect(res.statusCode).toBe(401);
  });

  it('3. Cocinero consulta la pantalla KDS y ve la comanda en cola (200 OK)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/staff/orders?status=en_cola',
      headers: { authorization: `Bearer ${cookToken}` }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.orders).toBeInstanceOf(Array);

    const round = body.orders.find((r: any) => r.roundId === roundId);
    expect(round).toBeDefined();
    expect(round.tableNumber).toBe(4);
    expect(round.lines).toHaveLength(2);
    expect(round.lines[0].estado).toBe('en_cola');
  });

  it('4. Cocinero cambia estado de plato 1 a "en_cocina" (200 OK)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/staff/order-lines/${line1Id}`,
      headers: { authorization: `Bearer ${cookToken}` },
      payload: { estado: 'en_cocina' }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.estado).toBe('en_cocina');
    expect(body.roundEstado).toBe('en_cocina');

    // Comprobar en BD
    const dbLine = await db.query(`SELECT estado FROM order_line WHERE id = $1`, [line1Id]);
    expect(dbLine.rows[0].estado).toBe('en_cocina');
  });

  it('5. Cocinero marca plato 1 como "servido" (200 OK)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/staff/order-lines/${line1Id}`,
      headers: { authorization: `Bearer ${cookToken}` },
      payload: { estado: 'servido' }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.estado).toBe('servido');
  });

  it('6. Intento de retroceder plato servido a "en_cocina" devuelve 422 INVALID_LINE_TRANSITION', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/staff/order-lines/${line1Id}`,
      headers: { authorization: `Bearer ${cookToken}` },
      payload: { estado: 'en_cocina' }
    });

    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('INVALID_LINE_TRANSITION');
  });

  it('7. Cocinero cancela plato 2 con motivo y se registra en audit_log (200 OK)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/staff/order-lines/${line2Id}`,
      headers: { authorization: `Bearer ${cookToken}` },
      payload: {
        estado: 'cancelado',
        motivo: 'Ingrediente agotado temporalmente en cocina'
      }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.estado).toBe('cancelado');
    expect(body.roundEstado).toBe('servido'); // Ya no quedan platos pendientes

    // Verificar registro en tabla audit_log
    const auditRes = await db.query(
      `SELECT * FROM audit_log WHERE entidad_id = $1 AND accion = 'ORDER_LINE_CANCELLED'`,
      [line2Id]
    );
    expect(auditRes.rows).toHaveLength(1);
    const audit = auditRes.rows[0];
    expect(audit.actor).toContain('kitchen@sakura.es');
    expect(audit.detalles.motivo).toBe('Ingrediente agotado temporalmente en cocina');
    expect(audit.detalles.rol).toBe('cocina');
  });
});
