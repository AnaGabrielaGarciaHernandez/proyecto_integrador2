const path = require('node:path');
const { runMigrations } = require('@ecobazar/platform');
const db = require('./config/db');

async function main() {
  await runMigrations(db, path.resolve(__dirname, '../migrations'));
  await db.close();
}

main().catch((error) => {
  console.error('[order-service] step=migration_failed', error);
  process.exitCode = 1;
});
