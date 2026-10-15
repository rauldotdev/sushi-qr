import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authService } from '../services/authService.js';
import { loginSchema } from '../dtos/login.dto.js';
import { AppError } from '../../common/errors/appError.js';

export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Login de personal
  app.post('/login', async (request, reply) => {
    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new AppError('VALIDATION_ERROR', 'Entrada no válida', 400, parseResult.error.format());
    }

    const staffUser = await authService.authenticate(parseResult.data);
    const token = await reply.jwtSign({
      sub: staffUser.id,
      restaurantId: staffUser.restaurant_id,
      nombre: staffUser.nombre,
      email: staffUser.email,
      rol: staffUser.rol,
      type: 'staff'
    });

    return reply.status(200).send({
      token,
      user: staffUser
    });
  });

  // Perfil del personal autenticado
  app.get('/me', {
    preHandler: [app.authenticateStaff]
  }, async (request, reply) => {
    return reply.status(200).send({
      user: request.staffUser
    });
  });
};
