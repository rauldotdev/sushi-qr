import { describe, it, expect } from 'vitest';
import { env } from '../../src/main/config/env.js';

describe('Environment Configuration (Zod)', () => {
  it('debe cargar y validar las variables de entorno requeridas', () => {
    expect(env).toBeDefined();
    expect(env.PORT).toBeGreaterThan(0);
    expect(env.POSTGRES_DB).toBe('sushi_qr_db');
    expect(env.POSTGRES_USER).toBe('sushi_user');
    expect(env.REDIS_PORT).toBe(6379);
    expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(16);
  });
});
