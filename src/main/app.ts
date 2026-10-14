import Fastify, { FastifyInstance, FastifyError } from 'fastify';
import { db } from './database/db.js';
import { redis } from './redis/redisClient.js';
import { AppError } from '../common/errors/appError.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : {
      level: 'info'
    }
  });

  // Manejador centralizado de errores con formato { code, message }
  app.setErrorHandler((error: FastifyError | Error | unknown, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        details: error.details
      });
    }

    const fastifyErr = error as FastifyError;
    if (fastifyErr.validation) {
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: fastifyErr.message,
        details: fastifyErr.validation
      });
    }

    request.log.error(error);
    return reply.status(500).send({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Ha ocurrido un error interno en el servidor'
    });
  });

  // Endpoint de Salud
  app.get('/api/v1/health', async (_request, reply) => {
    const [pgHealth, redisHealth] = await Promise.all([
      db.checkHealth(),
      redis.checkHealth()
    ]);

    const isHealthy = pgHealth.status === 'healthy' && redisHealth.status === 'healthy';

    const healthPayload = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      services: {
        database: pgHealth,
        redis: redisHealth
      }
    };

    return reply.status(isHealthy ? 200 : 503).send(healthPayload);
  });

  return app;
}
