import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { menuService } from '../services/menuService.js';

export const customerMenuRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/v1/menu (Requiere sesión activa del comensal)
  app.get('/menu', {
    preHandler: [app.authenticateCustomerSession]
  }, async (request, reply) => {
    const session = request.customerSession!;
    const clientEtag = request.headers['if-none-match'];

    const { exclude_allergens } = request.query as { exclude_allergens?: string };
    const allergensToExclude = exclude_allergens
      ? exclude_allergens.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean)
      : [];

    const result = await menuService.getMenu(session.tariffId, clientEtag, allergensToExclude);

    // Cabeceras de rendimiento y caché
    reply.header('ETag', result.etag);
    reply.header('Cache-Control', 'private, must-revalidate');

    if (result.notModified) {
      return reply.status(304).send();
    }

    return reply.status(200).send({
      tariffId: session.tariffId,
      categories: result.menu
    });
  });
};
