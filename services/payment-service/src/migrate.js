const path = require('node:path');
const { runMigrations, safeLog } = require('@ecobazar/platform');
const db = require('./config/db');

async function main() {
  await runMigrations(db, path.resolve(__dirname, '../migrations'));
  await db.close();
}

main().catch((error) => {
  safeLog('error', 'payment-service', { step: 'migration_failed' }, error);
  process.exitCode = 1;
});
