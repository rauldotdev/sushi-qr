import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { tableSessionService } from '../services/tableSessionService.js';
import { openTableSchema } from '../dtos/waiterTable.dto.js';
import { authorizeRole } from '../../common/middleware/authMiddleware.js';
import { AppError } from '../../common/errors/appError.js';

export const waiterTableRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Requiere autenticación de personal
  app.addHook('preHandler', app.authenticateStaff);

  // POST /api/v1/staff/tables/:id/open (sala o admin)
  app.post('/:id/open', {
    preHandler: [authorizeRole(['sala', 'admin'])]
  }, async (request, reply) => {
    const { id: tableId } = request.params as { id: string };
    const parseResult = openTableSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new AppError('VALIDATION_ERROR', 'Entrada no válida', 400, parseResult.error.format());
    }

    const staffUserId = request.staffUser!.sub;
    const result = await tableSessionService.openSession(tableId, staffUserId, parseResult.data);

    return reply.status(201).send({
      message: 'Mesa abierta con éxito',
      session: {
        id: result.session.id,
        tableId: result.session.table_id,
        tariffId: result.session.tariff_id,
        comensales: result.session.comensales,
        inicio: result.session.inicio,
        estado: result.session.estado
      }
    });
  });

  // POST /api/v1/staff/tables/:id/close (sala o admin)
  app.post('/:id/close', {
    preHandler: [authorizeRole(['sala', 'admin'])]
  }, async (request, reply) => {
    const { id: tableId } = request.params as { id: string };
    const staffUserId = request.staffUser!.sub;
    const result = await tableSessionService.closeSession(tableId, staffUserId);

    return reply.status(200).send({
      message: 'Mesa cerrada correctamente',
      sessionId: result.sessionId
    });
  });
};
