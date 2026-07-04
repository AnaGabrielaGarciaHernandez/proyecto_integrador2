const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  connectionString: env.DATABASE_URL,
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

async function assertConnection() {
  const result = await query('SELECT now() AS now');
  return result.rows[0];
}

module.exports = {
  pool,
  query,
  transaction,
  assertConnection,
};
