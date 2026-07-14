const { createDb } = require('@ecobazar/platform');
const env = require('./config');
const { createApp } = require('./app');

const db = createDb({ connectionString: env.DATABASE_URL, schema: 'moderation' });
const server = createApp({ db }).listen(env.PORT, () => {
  console.log(`[moderation-service] port=${env.PORT} step=listening`);
});

async function shutdown(signal) {
  console.log(`[moderation-service] signal=${signal} step=shutdown_started`);
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
