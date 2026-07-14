const path = require('node:path');
const { createDb, runMigrations } = require('@ecobazar/platform');
const env = require('./config');

const db = createDb({ connectionString: env.DATABASE_URL, schema: 'moderation' });

runMigrations(db, path.resolve(__dirname, '../migrations'))
  .then(() => db.close())
  .catch(async (error) => {
    console.error('[moderation-service] step=migration_failed', error);
    await db.close().catch(() => {});
    process.exitCode = 1;
  });
