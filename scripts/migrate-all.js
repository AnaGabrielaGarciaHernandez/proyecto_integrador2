const { spawnSync } = require('node:child_process');
const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: process.env.ENV_FILE || path.resolve(__dirname, '../.env'), quiet: true });

const host = process.env.POSTGRES_HOST || 'postgres';
const port = process.env.POSTGRES_PORT || '5432';
const database = process.env.POSTGRES_DB || 'bd_EcoBazar';
const services = [
  ['identity-service', 'ecobazar_identity', 'identity_dev'],
  ['catalog-service', 'ecobazar_catalog', 'catalog_dev'],
  ['cart-service', 'ecobazar_cart', 'cart_dev'],
  ['order-service', 'ecobazar_ordering', 'ordering_dev'],
  ['payment-service', 'ecobazar_payment', 'payment_dev'],
  ['moderation-service', 'ecobazar_moderation', 'moderation_dev'],
];

for (const [service, user, password] of services) {
  const script = path.resolve(__dirname, `../services/${service}/src/migrate.js`);
  const result = spawnSync(process.execPath, [script], {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: `postgres://${user}:${password}@${host}:${port}/${database}`,
      RABBITMQ_URL: process.env.RABBITMQ_URL || 'amqp://ecobazar:ecobazar_dev@rabbitmq:5672',
      INTERNAL_SERVICE_TOKEN: process.env.INTERNAL_SERVICE_TOKEN || 'change_this_internal_token_32_chars',
      JWT_PRIVATE_KEY_PATH: process.env.JWT_PRIVATE_KEY_PATH || '/run/secrets/jwt-private.pem',
      JWT_PUBLIC_KEY_PATH: process.env.JWT_PUBLIC_KEY_PATH || '/run/secrets/jwt-public.pem',
    },
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log('[migration] all service migrations applied');
