import Fastify, { FastifyInstance, FastifyError } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { db } from './database/db.js';
import { redis } from './redis/redisClient.js';
import { env } from './config/env.js';
import { AppError } from '../common/errors/appError.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : {
      level: 'info'
    }
  });

  // 1. Cabeceras de seguridad HTTP (HSTS, CSP, X-Content-Type-Options, etc.)
  app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'https://localhost', 'wss://localhost'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: []
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin'
    },
    xContentTypeOptions: true
  });

  // 2. Control estricto de CORS
  const allowedOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim());
  app.register(cors, {
    origin: (origin, cb) => {
      // Permitir peticiones sin origin (como tests locales o llamadas internas/Caddy)
      if (!origin || allowedOrigins.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(new AppError('CORS_FORBIDDEN', `Origen no permitido por CORS: ${origin}`, 403), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true
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
