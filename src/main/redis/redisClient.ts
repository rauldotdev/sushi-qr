import { Redis } from 'ioredis';
import { env } from '../config/env.js';

class RedisManager {
  private static instance: RedisManager;
  private client: Redis;

  private constructor() {
    this.client = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        return Math.min(times * 100, 3000);
      }
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });
  }

  public static getInstance(): RedisManager {
    if (!RedisManager.instance) {
      RedisManager.instance = new RedisManager();
    }
    return RedisManager.instance;
  }

  public getClient(): Redis {
    return this.client;
  }

  public async connect(): Promise<void> {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }
  }

  public async checkHealth(): Promise<{ status: 'healthy' | 'unhealthy'; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      await this.connect();
      const pong = await this.client.ping();
      if (pong === 'PONG') {
        return { status: 'healthy', latencyMs: Date.now() - start };
      }
      return { status: 'unhealthy', latencyMs: Date.now() - start, error: `Unexpected ping response: ${pong}` };
    } catch (err) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  public async close(): Promise<void> {
    if (this.client.status !== 'end') {
      await this.client.quit();
    }
  }
}

export const redis = RedisManager.getInstance();
