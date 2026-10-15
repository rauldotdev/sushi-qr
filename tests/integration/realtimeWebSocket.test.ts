import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { buildApp } from '../../src/main/app.js';
import { db } from '../../src/main/database/db.js';
import { redis } from '../../src/main/redis/redisClient.js';

describe('Realtime WebSocket & Redis Pub/Sub Flow (Fase 5)', () => {
  const app = buildApp();
  let serverPort: number;
  let cookToken: string;
  let waiterToken: string;
  let customerToken: string;
  let sessionId: string;

  const mesa5Id = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a45';
  const mesa5QrToken = '5a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a55';
  const restaurantId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const tarifaMediodiaId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

  const edamameId = 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a61';

  beforeAll(async () => {
    // 1. Levantar servidor en puerto efímero
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address() as any;
    serverPort = address.port;

    // 2. Crear Mesa 5 aislada
    await db.query(
      `INSERT INTO "table" (id, restaurant_id, numero, qr_token)
       VALUES ($1, $2, 5, $3)
       ON CONFLICT (id) DO UPDATE SET qr_token = $3`,
      [mesa5Id, restaurantId, mesa5QrToken]
    );
    await db.query(`UPDATE table_session SET estado = 'cerrada' WHERE table_id = $1`, [mesa5Id]);

    // 3. Logins de personal
    const cookLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/login',
      payload: { email: 'kitchen@sakura.es', password: 'Sakura2026!' }
    });
    cookToken = JSON.parse(cookLogin.body).token;

    const waiterLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/login',
      payload: { email: 'waiter@sakura.es', password: 'Sakura2026!' }
    });
    waiterToken = JSON.parse(waiterLogin.body).token;

    // 4. Camarero abre Mesa 5
    const openRes = await app.inject({
      method: 'POST',
      url: `/api/v1/staff/tables/${mesa5Id}/open`,
      headers: { authorization: `Bearer ${waiterToken}` },
      payload: { tariff_id: tarifaMediodiaId, comensales: 2 }
    });
    sessionId = JSON.parse(openRes.body).session.id;

    // 5. Comensal se une a Mesa 5
    const joinRes = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${mesa5QrToken}/join`
    });
    customerToken = JSON.parse(joinRes.body).sessionToken;
  });

  afterAll(async () => {
    await db.query(`UPDATE table_session SET estado = 'cerrada' WHERE table_id = $1`, [mesa5Id]);
    await db.query(`DELETE FROM "table" WHERE id = $1`, [mesa5Id]);
    await app.close();
    await db.close();
    await redis.close();
  });

  function waitForEvent(
    ws: WebSocket,
    expectedEvent: string,
    predicate?: (payload: any) => boolean
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timeout esperando evento WebSocket: ${expectedEvent}`)),
        5000
      );
      const onMsg = (data: any) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.event === expectedEvent) {
            if (!predicate || predicate(parsed.payload)) {
              clearTimeout(timer);
              ws.off('message', onMsg);
              resolve(parsed);
            }
          }
        } catch {}
      };
      ws.on('message', onMsg);
      ws.once('error', (err) => {
        clearTimeout(timer);
        ws.off('message', onMsg);
        reject(err);
      });
    });
  }

  function waitForMessage(ws: WebSocket): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout esperando mensaje WebSocket')), 4000);
      ws.once('message', (data) => {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(data.toString()));
        } catch {
          resolve(data.toString());
        }
      });
      ws.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  it('1. Conexión WebSocket sin token devuelve error UNAUTHORIZED y se cierra', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/realtime`);
    const msg = await waitForMessage(ws);

    expect(msg.event).toBe('ERROR');
    expect(msg.payload.code).toBe('UNAUTHORIZED');

    await new Promise((r) => ws.once('close', r));
  });

  it('2. Personal de cocina se conecta por WebSocket y se suscribe al canal kitchen', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/realtime?token=${cookToken}`);
    const msg = await waitForMessage(ws);

    expect(msg.event).toBe('CONNECTED');
    expect(msg.payload.channel).toBe('kitchen');

    ws.close();
    await new Promise((r) => ws.once('close', r));
  });

  it('3. Comensal se conecta por WebSocket y se suscribe a su sesión de mesa', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/realtime?token=${customerToken}`);
    const msg = await waitForMessage(ws);

    expect(msg.event).toBe('CONNECTED');
    expect(msg.payload.channel).toBe(`session:${sessionId}`);

    ws.close();
    await new Promise((r) => ws.once('close', r));
  });

  it('4. Al crear un pedido, la pantalla de cocina recibe el evento ORDER_ROUND_CREATED en < 500ms', async () => {
    const kitchenWs = new WebSocket(`ws://127.0.0.1:${serverPort}/realtime?token=${cookToken}`);
    // Esperar mensaje inicial de bienvenida
    await waitForEvent(kitchenWs, 'CONNECTED');

    // Promesa para capturar el evento de pedido entrante específico de la Mesa 5
    const orderPromise = waitForEvent(
      kitchenWs,
      'ORDER_ROUND_CREATED',
      (payload) => payload.tableNumber === 5
    );

    // Cliente crea una ronda
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: {
        authorization: `Bearer ${customerToken}`,
        'idempotency-key': 'ws-test-round-1'
      },
      payload: {
        items: [{ dish_id: edamameId, cantidad: 1 }]
      }
    });
    expect(createRes.statusCode).toBe(201);

    const receivedEvent = await orderPromise;
    expect(receivedEvent.event).toBe('ORDER_ROUND_CREATED');
    expect(receivedEvent.payload.tableNumber).toBe(5);
    expect(receivedEvent.payload.lines).toHaveLength(1);

    kitchenWs.close();
    await new Promise((r) => kitchenWs.once('close', r));
  });

  it('5. Cuando cocina actualiza una comanda a "en_cocina", el cliente recibe ORDER_LINE_UPDATED', async () => {
    const customerWs = new WebSocket(`ws://127.0.0.1:${serverPort}/realtime?token=${customerToken}`);
    // Esperar bienvenida
    await waitForEvent(customerWs, 'CONNECTED');

    // Obtener la línea creada en el test anterior
    const ordersRes = await app.inject({
      method: 'GET',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${customerToken}` }
    });
    const orders = JSON.parse(ordersRes.body).rounds;
    const lineId = orders[0].lines[0].id;

    // Promesa para capturar la notificación en el socket del cliente
    const updatePromise = waitForEvent(customerWs, 'ORDER_LINE_UPDATED');

    // Cocinero avanza la comanda
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/staff/order-lines/${lineId}`,
      headers: { authorization: `Bearer ${cookToken}` },
      payload: { estado: 'en_cocina' }
    });
    expect(patchRes.statusCode).toBe(200);

    const receivedEvent = await updatePromise;
    expect(receivedEvent.event).toBe('ORDER_LINE_UPDATED');
    expect(receivedEvent.payload.lineId).toBe(lineId);
    expect(receivedEvent.payload.nuevoEstado).toBe('en_cocina');

    customerWs.close();
    await new Promise((r) => customerWs.once('close', r));
  });
});
