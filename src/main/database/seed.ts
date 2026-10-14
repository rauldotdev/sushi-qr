import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from './db.js';

export async function runSeed(): Promise<void> {
  console.log('🌱 Ejecutando seed de datos iniciales...');
  const client = await db.getClient();

  try {
    const seedFile = path.resolve(process.cwd(), 'infra/migrations/002_seed_data.sql');
    const sqlContent = await fs.readFile(seedFile, 'utf-8');

    await client.query('BEGIN');
    try {
      await client.query(sqlContent);
      await client.query('COMMIT');
      console.log('✅ Seed completado con éxito.');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('❌ Error al ejecutar seed:', err);
      throw err;
    }
  } finally {
    client.release();
  }
}

if (process.argv[1]?.includes('seed.ts') || process.argv[1]?.includes('seed.js')) {
  runSeed()
    .then(() => db.close())
    .catch(async (err) => {
      console.error('Fallo crítico en seed:', err);
      await db.close();
      process.exit(1);
    });
}
