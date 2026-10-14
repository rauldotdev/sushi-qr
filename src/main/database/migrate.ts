import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from './db.js';

export async function runMigrations(): Promise<void> {
  console.log('🔄 Iniciando migraciones de base de datos...');
  const client = await db.getClient();

  try {
    // 1. Crear tabla de control de migraciones
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 2. Leer migraciones aplicadas
    const { rows: appliedRows } = await client.query<{ filename: string }>(
      'SELECT filename FROM _migrations ORDER BY id ASC'
    );
    const appliedSet = new Set(appliedRows.map((r) => r.filename));

    // 3. Buscar archivos en infra/migrations
    const migrationsDir = path.resolve(process.cwd(), 'infra/migrations');
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files
      .filter((f) => f.endsWith('.sql') && !f.includes('seed'))
      .sort();

    for (const file of sqlFiles) {
      if (appliedSet.has(file)) {
        console.log(`⏩ Migración ya aplicada: ${file}`);
        continue;
      }

      console.log(`▶️ Aplicando migración: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sqlContent = await fs.readFile(filePath, 'utf-8');

      await client.query('BEGIN');
      try {
        await client.query(sqlContent);
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`✅ Migración completada con éxito: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ Error al aplicar migración ${file}:`, err);
        throw err;
      }
    }

    console.log('🎉 Todas las migraciones se han procesado correctamente.');
  } finally {
    client.release();
  }
}

// Ejecución directa si se invoca por CLI
if (process.argv[1]?.includes('migrate.ts') || process.argv[1]?.includes('migrate.js')) {
  runMigrations()
    .then(() => db.close())
    .catch(async (err) => {
      console.error('Fallo crítico en migraciones:', err);
      await db.close();
      process.exit(1);
    });
}
