import { describe, it, expect, afterAll } from 'vitest';
import { db } from '../../src/main/database/db.js';

describe('PostgreSQL Database Pool & Migrations', () => {
  afterAll(async () => {
    await db.close();
  });

  it('debe responder satisfactoriamente al healthcheck de la base de datos', async () => {
    const health = await db.checkHealth();
    expect(health.status).toBe('healthy');
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('debe verificar que las tablas principales del esquema existen tras la migración', async () => {
    const res = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);

    const tableNames = res.rows.map((r: { table_name: string }) => r.table_name);
    
    expect(tableNames).toContain('restaurant');
    expect(tableNames).toContain('table');
    expect(tableNames).toContain('tariff');
    expect(tableNames).toContain('category');
    expect(tableNames).toContain('dish');
    expect(tableNames).toContain('table_session');
    expect(tableNames).toContain('order_round');
    expect(tableNames).toContain('order_line');
    expect(tableNames).toContain('staff_user');
    expect(tableNames).toContain('audit_log');
  });

  it('debe contener los datos sembrados (seed) de restaurante y mesas', async () => {
    const restaurantRes = await db.query('SELECT COUNT(*) as count FROM restaurant');
    expect(Number(restaurantRes.rows[0].count)).toBeGreaterThan(0);

    const tablesRes = await db.query('SELECT COUNT(*) as count FROM "table"');
    expect(Number(tablesRes.rows[0].count)).toBeGreaterThanOrEqual(3);
  });
});
