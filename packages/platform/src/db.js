const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');

function createDb({ connectionString, schema }) {
  if (!/^[a-z][a-z0-9_]*$/.test(schema)) throw new Error(`Invalid PostgreSQL schema: ${schema}`);
  const pool = new Pool({
    connectionString,
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
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const filenames = (await fs.readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  for (const filename of filenames) {
    const exists = await db.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [filename]);
    if (exists.rows[0]) continue;
    const sql = await fs.readFile(path.join(migrationsDir, filename), 'utf8');
    await db.transaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    });
    console.log(`[migration] schema=${db.schema} filename=${filename} applied=true`);
  }
}

module.exports = { createDb, runMigrations };
