import { describe, it, expect, afterAll } from 'vitest';
import { redis } from '../../src/main/redis/redisClient.js';

describe('Redis Connection & Health', () => {
  afterAll(async () => {
    await redis.close();
  });

  it('debe responder satisfactoriamente al healthcheck de Redis', async () => {
    const health = await redis.checkHealth();
    expect(health.status).toBe('healthy');
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('debe permitir operaciones básicas de SET y GET con TTL', async () => {
    const client = redis.getClient();
    const testKey = 'test:health_check_key';
    const testValue = JSON.stringify({ ok: true, timestamp: Date.now() });

    await client.set(testKey, testValue, 'EX', 10);
    const retrieved = await client.get(testKey);

    expect(retrieved).toBe(testValue);
    await client.del(testKey);
  });
});
