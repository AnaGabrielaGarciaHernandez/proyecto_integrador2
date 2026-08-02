const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Pool } = require('pg');

function createDb({
  connectionString,
  schema,
  max = Number(process.env.DB_POOL_MAX || 20),
  idleTimeoutMillis = Number(process.env.DB_IDLE_TIMEOUT_MS || 30_000),
  connectionTimeoutMillis = Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5_000),
  statementTimeout = Number(process.env.DB_STATEMENT_TIMEOUT_MS || 30_000),
} = {}) {
  if (!/^[a-z][a-z0-9_]*$/.test(schema)) throw new Error(`Invalid PostgreSQL schema: ${schema}`);
  const pool = new Pool({
    connectionString,
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    statement_timeout: statementTimeout,
    options: `-c search_path=${schema},public`,
  });

  async function query(text, params) {
    return pool.query(text, params);
  }

  async function transaction(work) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    pool,
    query,
    transaction,
    health: async () => (await query('SELECT now() AS now')).rows[0],
    close: () => pool.end(),
    schema,
  };
}

async function runMigrations(db, migrationsDir) {
  const filenames = (await fs.readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  await db.transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`ecobazar:migrations:${db.schema}`]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      checksum text,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text');

    for (const filename of filenames) {
      const sql = await fs.readFile(path.join(migrationsDir, filename), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const exists = await client.query(
        'SELECT checksum FROM schema_migrations WHERE filename = $1',
        [filename],
      );
      if (exists.rows[0]) {
        if (!exists.rows[0].checksum) {
          await client.query(
            'UPDATE schema_migrations SET checksum = $2 WHERE filename = $1',
            [filename, checksum],
          );
        } else if (exists.rows[0].checksum !== checksum) {
          throw new Error(`Migration checksum mismatch for ${db.schema}/${filename}`);
        }
        continue;
      }

      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
        [filename, checksum],
      );
      console.log(`[migration] schema=${db.schema} filename=${filename} applied=true`);
    }
  });
}

module.exports = { createDb, runMigrations };
