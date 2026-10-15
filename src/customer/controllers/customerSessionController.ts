import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { customerSessionService } from '../services/customerSessionService.js';

export const customerSessionRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/v1/tables/:qr_token (Consulta pública del estado de la mesa)
  app.get('/tables/:qr_token', async (request, reply) => {
    const { qr_token } = request.params as { qr_token: string };
    const status = await customerSessionService.getTableStatus(qr_token);
    return reply.status(200).send(status);
  });

  // POST /api/v1/sessions/:qr_token/join (Unirse a la sesión de mesa abierta)
  app.post('/sessions/:qr_token/join', async (request, reply) => {
    const { qr_token } = request.params as { qr_token: string };
    const joinData = await customerSessionService.joinSession(qr_token);

    // Generar token JWT para el comensal
    const sessionToken = await reply.jwtSign({
      sub: joinData.sessionId,
      sessionId: joinData.sessionId,
      tableId: joinData.tableId,
      tariffId: joinData.tariffId,
      comensales: joinData.comensales,
      type: 'customer'
    });

    return reply.status(200).send({
      sessionToken,
      session: {
        id: joinData.sessionId,
        tableId: joinData.tableId,
        tableNumber: joinData.tableNumber,
        comensales: joinData.comensales,
        inicio: joinData.inicio
      },
      tariff: joinData.tariff
    });
  });

  // GET /api/v1/session/status (Estado en tiempo real de la sesión del comensal)
  app.get('/session/status', {
    preHandler: [app.authenticateCustomerSession]
  }, async (request, reply) => {
    const session = request.customerSession!;
    const startTime = new Date(session.inicio).getTime();
    const elapsedMinutes = Math.floor((Date.now() - startTime) / (1000 * 60));
    const remainingMinutes = Math.max(0, session.duracionMaxMin - elapsedMinutes);

    return reply.status(200).send({
      sessionId: session.id,
      comensales: session.comensales,
      tiempoTranscurridoMinutos: elapsedMinutes,
      tiempoRestanteMinutos: remainingMinutes,
      duracionMaxMinutos: session.duracionMaxMin,
      platosPorRonda: session.platosPorRonda,
      pausaEntreRondasSegundos: session.pausaEntreRondasS
    });
  });
};
