import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { kitchenService } from '../services/kitchenService.js';
import { listKitchenOrdersSchema } from '../dtos/listKitchenOrders.dto.js';
import { updateOrderLineSchema } from '../dtos/updateOrderLine.dto.js';
import { authorizeRole } from '../../common/middleware/authMiddleware.js';
import { AppError } from '../../common/errors/appError.js';

export const kitchenRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Requiere autenticación de personal para todas las operaciones de cocina y sala
  app.addHook('preHandler', app.authenticateStaff);

  // GET /api/v1/staff/orders (Pantalla KDS de cocina y control de sala)
  app.get(
    '/orders',
    {
      preHandler: [authorizeRole(['cocina', 'sala', 'admin'])]
    },
    async (request, reply) => {
      const parseResult = listKitchenOrdersSchema.safeParse(request.query);
      if (!parseResult.success) {
        throw new AppError('VALIDATION_ERROR', 'Parámetros de consulta no válidos', 400, parseResult.error.format());
      }

      const orders = await kitchenService.getOrders(parseResult.data);
      return reply.status(200).send({ orders });
    }
  );

  // PATCH /api/v1/staff/order-lines/:id (Avanzar estado o cancelar comanda)
  app.patch(
    '/order-lines/:id',
    {
      preHandler: [authorizeRole(['cocina', 'sala', 'admin'])]
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = updateOrderLineSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new AppError('VALIDATION_ERROR', 'Entrada no válida', 400, parseResult.error.format());
      }

      const staffUser = request.staffUser!;
      const { estado, motivo } = parseResult.data;

      const result = await kitchenService.updateOrderLineStatus(id, estado, staffUser, motivo);
      return reply.status(200).send({
        message: 'Estado de comanda actualizado con éxito',
        ...result
      });
    }
  );
};
