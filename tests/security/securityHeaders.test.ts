import { describe, it, expect, afterAll } from 'vitest';
import { buildApp } from '../../src/main/app.js';
import { db } from '../../src/main/database/db.js';
import { redis } from '../../src/main/redis/redisClient.js';

describe('Security Headers & CORS Enforcement', () => {
  const app = buildApp();

  afterAll(async () => {
    await app.close();
    await db.close();
    await redis.close();
  });

  it('debe incluir cabecera HSTS con max-age de un año e includeSubDomains', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health'
    });

    const hsts = response.headers['strict-transport-security'];
    expect(hsts).toBeDefined();
    expect(hsts).toContain('max-age=31536000');
    expect(hsts).toContain('includeSubDomains');
  });

  it('debe incluir cabeceras de protección X-Content-Type-Options y Referrer-Policy', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health'
    });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('debe incluir Content-Security-Policy estricto', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health'
    });

    const csp = response.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('debe permitir peticiones desde orígenes autorizados en CORS (https://localhost)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: {
        origin: 'https://localhost'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://localhost');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('debe bloquear peticiones desde orígenes no autorizados en CORS con error 403', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: {
        origin: 'https://sitio-malicioso.com'
      }
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('CORS_FORBIDDEN');
  });
});
