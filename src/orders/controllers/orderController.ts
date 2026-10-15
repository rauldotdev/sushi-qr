import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { orderService } from '../services/orderService.js';
import { createOrderSchema } from '../dtos/createOrder.dto.js';
import { AppError } from '../../common/errors/appError.js';

export const orderRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Todas las rutas de pedidos de comensales requieren sesión activa
  app.addHook('preHandler', app.authenticateCustomerSession);

  // POST /api/v1/orders (Crear ronda de pedidos con idempotencia)
  app.post('/', async (request, reply) => {
    const rawBody = (request.body as Record<string, unknown>) || {};
    const headerIdempotencyKey = request.headers['idempotency-key'] as string | undefined;

    const parseResult = createOrderSchema.safeParse({
      ...rawBody,
      idempotency_key: rawBody['idempotency_key'] || headerIdempotencyKey
    });

    if (!parseResult.success) {
      throw new AppError('VALIDATION_ERROR', 'Entrada no válida', 400, parseResult.error.format());
    }

    const sessionId = request.customerSession!.id;
    const { items, idempotency_key } = parseResult.data;

    const result = await orderService.createOrderRound(sessionId, items, idempotency_key);
    const statusCode = result.isIdempotentReplay ? 200 : 201;

    return reply.status(statusCode).send({
      message: result.isIdempotentReplay ? 'Pedido recuperado (idempotencia)' : 'Ronda creada con éxito',
      round: result.round,
      lines: result.lines
    });
  });

  // GET /api/v1/orders (Ver rondas y estado de líneas de la sesión)
  app.get('/', async (request, reply) => {
    const sessionId = request.customerSession!.id;
    const rounds = await orderService.getSessionOrders(sessionId);
    return reply.status(200).send({ rounds });
  });

  // PATCH /api/v1/orders/lines/:id/cancel (Cancelar línea de pedido en cola)
  app.patch('/lines/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };
    const sessionId = request.customerSession!.id;
    const result = await orderService.cancelOrderLineByCustomer(id, sessionId);
    return reply.status(200).send(result);
  });
};
