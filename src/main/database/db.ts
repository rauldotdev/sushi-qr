import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from '../config/env.js';

class DatabasePool {
  private static instance: DatabasePool;
  private pool: Pool;

  private constructor() {
    this.pool = new Pool({
      host: env.POSTGRES_HOST,
      port: env.POSTGRES_PORT,
      database: env.POSTGRES_DB,
      user: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client:', err);
    });
  }

  public static getInstance(): DatabasePool {
    if (!DatabasePool.instance) {
      DatabasePool.instance = new DatabasePool();
    }
    return DatabasePool.instance;
  }

  public async query<T extends QueryResultRow = any>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
    const start = Date.now();
    const res = await this.pool.query<T>(text, params);
    const duration = Date.now() - start;
    if (process.env.DEBUG_SQL === 'true') {
      console.log('Executed query', { text, duration, rows: res.rowCount });
    }
    return res;
  }

  public async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  public async checkHealth(): Promise<{ status: 'healthy' | 'unhealthy'; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      await this.pool.query('SELECT 1');
      return { status: 'healthy', latencyMs: Date.now() - start };
    } catch (err) {
      return {
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

export const db = DatabasePool.getInstance();
