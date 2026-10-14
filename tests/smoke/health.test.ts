import { describe, it, expect, afterAll } from 'vitest';
import { buildApp } from '../../src/main/app.js';
import { db } from '../../src/main/database/db.js';
import { redis } from '../../src/main/redis/redisClient.js';

describe('Fastify Health Endpoint Integration', () => {
  const app = buildApp();

  afterAll(async () => {
    await app.close();
    await db.close();
    await redis.close();
  });

  it('GET /api/v1/health debe responder 200 con estado healthy de DB y Redis', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    expect(body.status).toBe('healthy');
    expect(body.timestamp).toBeDefined();
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(body.services.database.status).toBe('healthy');
    expect(body.services.redis.status).toBe('healthy');
  });
});
