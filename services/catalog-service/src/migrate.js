const path = require('node:path');
const { createDb, runMigrations } = require('@ecobazar/platform');
const { loadConfig } = require('./config');

async function main() {
  const config = loadConfig();
  const db = createDb({ connectionString: config.DATABASE_URL, schema: 'catalog' });
  try {
    await runMigrations(db, path.join(__dirname, '..', 'migrations'));
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error('[catalog-service] step=migration_failed', error);
  process.exitCode = 1;
});
