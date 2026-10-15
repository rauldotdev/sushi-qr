import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { adminTableService } from '../services/adminTableService.js';
import { createTableSchema } from '../dtos/adminTable.dto.js';
import { authorizeRole } from '../../common/middleware/authMiddleware.js';
import { AppError } from '../../common/errors/appError.js';

export const adminTableRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Todas las rutas de administración requieren autenticación de personal
  app.addHook('preHandler', app.authenticateStaff);

  // GET /api/v1/admin/tables (admin o sala)
  app.get('/', {
    preHandler: [authorizeRole(['admin', 'sala'])]
  }, async (request, reply) => {
    const restaurantId = request.staffUser!.restaurantId;
    const tables = await adminTableService.listTables(restaurantId);
    return reply.status(200).send({ tables });
  });

  // POST /api/v1/admin/tables (solo admin)
  app.post('/', {
    preHandler: [authorizeRole(['admin'])]
  }, async (request, reply) => {
    const parseResult = createTableSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new AppError('VALIDATION_ERROR', 'Entrada no válida', 400, parseResult.error.format());
    }

    const restaurantId = request.staffUser!.restaurantId;
    const table = await adminTableService.createTable(restaurantId, parseResult.data);
    return reply.status(201).send({ table });
  });

  // DELETE /api/v1/admin/tables/:id (solo admin)
  app.delete('/:id', {
    preHandler: [authorizeRole(['admin'])]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await adminTableService.deleteTable(id);
    return reply.status(200).send({ message: 'Mesa eliminada correctamente' });
  });
};
