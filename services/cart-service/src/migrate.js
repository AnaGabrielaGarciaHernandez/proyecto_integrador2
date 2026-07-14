const path = require('node:path');
const { createDb, runMigrations } = require('@ecobazar/platform');
const { loadConfig } = require('./config');

async function main() {
  const config = loadConfig();
  const db = createDb({ connectionString: config.DATABASE_URL, schema: 'cart' });
  try {
    await runMigrations(db, path.join(__dirname, '..', 'migrations'));
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error('[cart-service] step=migration_failed', error);
  process.exitCode = 1;
});
