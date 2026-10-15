import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { WebSocket } from 'ws';
import { realtimeService } from '../services/realtimeService.js';
import { StaffTokenPayload, CustomerTokenPayload } from '../../common/middleware/authMiddleware.js';
import { customerSessionService } from '../../customer/services/customerSessionService.js';

export const realtimeRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Inicializar suscripción a Redis Pub/Sub al cargar las rutas
  await realtimeService.initRedisSubscription();

  // Endpoint WebSocket: GET /realtime?token=<JWT>
  app.get('/realtime', { websocket: true }, async (socket: WebSocket, request) => {
    const query = request.query as { token?: string };
    const authHeader = request.headers.authorization;
    const token = query?.token || (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);

    if (!token) {
      socket.send(
        JSON.stringify({
          event: 'ERROR',
          payload: { code: 'UNAUTHORIZED', message: 'Token de autenticación requerido en ?token=' },
          timestamp: new Date().toISOString()
        })
      );
      socket.close(1008, 'Token requerido');
      return;
    }

    try {
      const decoded = app.jwt.verify<StaffTokenPayload | CustomerTokenPayload>(token);

      if (decoded.type === 'staff') {
        // Personal de cocina o sala: suscripción al canal general de cocina
        realtimeService.registerKitchenSocket(socket);
        request.log.info({ staff: decoded.email, role: decoded.rol }, 'WebSocket conectado a canal de cocina');
      } else if (decoded.type === 'customer') {
        // Comensal: verificar que la mesa y sesión continúen activas
        await customerSessionService.validateActiveSession(decoded.sessionId);
        realtimeService.registerSessionSocket(decoded.sessionId, socket);
        request.log.info({ sessionId: decoded.sessionId, tableId: decoded.tableId }, 'WebSocket comensal conectado a su sesión');
      } else {
        socket.send(
          JSON.stringify({
            event: 'ERROR',
            payload: { code: 'UNAUTHORIZED', message: 'Tipo de token desconocido' },
            timestamp: new Date().toISOString()
          })
        );
        socket.close(1008, 'Token inválido');
      }
    } catch (err: any) {
      socket.send(
        JSON.stringify({
          event: 'ERROR',
          payload: { code: 'UNAUTHORIZED', message: err.message || 'Token expirado o no válido' },
          timestamp: new Date().toISOString()
        })
      );
      socket.close(1008, 'Autenticación fallida');
    }
  });
};
