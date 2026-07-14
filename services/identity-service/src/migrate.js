const path = require('node:path');
const { createDb, runMigrations } = require('@ecobazar/platform');
const env = require('./config/env');

async function migrate() {
  const db = createDb({ connectionString: env.DATABASE_URL, schema: 'identity' });
  try {
    await runMigrations(db, path.resolve(__dirname, '../migrations'));
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  migrate().catch((error) => {
    console.error('[identity-service] step=migration_failed', error);
    process.exitCode = 1;
  });
}

module.exports = { migrate };
