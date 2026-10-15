import { describe, it, expect } from 'vitest';
import http from 'node:http';

describe('Caddy TLS & HTTP Redirection', () => {
  it('una petición por HTTP al puerto 80 debe recibir redirección (301 o 308) hacia HTTPS', async () => {
    const redirectPromise = new Promise<{ statusCode?: number; location?: string }>((resolve, reject) => {
      const req = http.get(
        {
          host: '127.0.0.1',
          port: 80,
          path: '/api/v1/health',
          headers: {
            Host: 'localhost'
          }
        },
        (res) => {
          resolve({
            statusCode: res.statusCode,
            location: res.headers.location
          });
        }
      );

      req.on('error', (err) => reject(err));
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Timeout de conexión a Caddy en puerto 80'));
      });
    });

    const response = await redirectPromise;

    // Caddy redirige de puerto 80 a 443 con 308 (o 301)
    expect([301, 308]).toContain(response.statusCode);
    expect(response.location).toBeDefined();
    expect(response.location).toMatch(/^https:\/\/localhost/i);
  });
});
