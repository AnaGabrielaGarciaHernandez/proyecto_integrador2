const { createApp } = require('./app');
const env = require('./config/env');
const { loadPublicKey } = require('./config/keys');

function start() {
  const publicKey = loadPublicKey(env);
  const app = createApp({ config: env, publicKey });
  const server = app.listen(env.PORT, () => {
    console.log(`[api-gateway] port=${env.PORT} step=service_started`);
  });

  let stopping = false;
  function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    console.log(`[api-gateway] signal=${signal} step=shutdown_started`);
    server.close((error) => {
      if (error) {
        console.error('[api-gateway] step=shutdown_failed', error);
        process.exitCode = 1;
        return;
      }
      console.log('[api-gateway] step=shutdown_finished');
      process.exitCode = 0;
    });
  }

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  return { app, server, shutdown };
}

if (require.main === module) {
  try {
    start();
  } catch (error) {
    console.error('[api-gateway] step=startup_failed', error);
    process.exitCode = 1;
  }
}

module.exports = { start };
