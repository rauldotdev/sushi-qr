import { buildApp } from './app.js';
import { env } from './config/env.js';
import { db } from './database/db.js';
import { redis } from './redis/redisClient.js';

async function bootstrap() {
  const app = buildApp();

  try {
    // 1. Verificar conexiones de dependencias críticas
    const [pgHealth, redisHealth] = await Promise.all([
      db.checkHealth(),
      redis.checkHealth()
    ]);

    if (pgHealth.status !== 'healthy') {
      console.warn('⚠️ Advertencia: PostgreSQL no respondió en el arranque inicial:', pgHealth.error);
    } else {
      console.log(`✅ Conexión a PostgreSQL establecida (${pgHealth.latencyMs}ms)`);
    }

    if (redisHealth.status !== 'healthy') {
      console.warn('⚠️ Advertencia: Redis no respondió en el arranque inicial:', redisHealth.error);
    } else {
      console.log(`✅ Conexión a Redis establecida (${redisHealth.latencyMs}ms)`);
    }

    // 2. Iniciar servidor Fastify
    await app.listen({ port: env.PORT, host: env.HOST });
    console.log(`🚀 Servidor Fastify escuchando internamente en puerto ${env.PORT}`);
    console.log(`🔒 Acceso público seguro configurado a través de Caddy en https://localhost`);
    console.log(`🩺 Health check disponible en https://localhost/api/v1/health`);
  } catch (err) {
    console.error('❌ Error fatal al iniciar el servidor:', err);
    process.exit(1);
  }
}

bootstrap();
