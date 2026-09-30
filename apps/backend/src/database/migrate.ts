import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool } from './pool.js';

const migrationsDirectory = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations');
const migrationFilePattern = /^(\d{3})_[a-z0-9_]+\.sql$/;

async function runMigrations(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const files = (await readdir(migrationsDirectory))
      .filter((file) => migrationFilePattern.test(file))
      .sort();
    const appliedResult = await client.query<{ version: number }>(
      'SELECT version FROM schema_migrations',
    );
    const appliedVersions = new Set(appliedResult.rows.map(({ version }) => version));

    for (const file of files) {
      const match = migrationFilePattern.exec(file);

      if (!match) {
        continue;
      }

      const version = Number(match[1]);

      if (appliedVersions.has(version)) {
        console.log(`Migration ${file} already applied`);
        continue;
      }

      const sql = await readFile(resolve(migrationsDirectory, file), 'utf8');

      await client.query('BEGIN');

      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [
          version,
          file,
        ]);
        await client.query('COMMIT');
        console.log(`Migration ${file} applied`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((error: unknown) => {
  console.error('Migration failed', error);
  process.exitCode = 1;
});
