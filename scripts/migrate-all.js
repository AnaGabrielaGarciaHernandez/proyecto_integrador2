const { spawnSync } = require('node:child_process');
const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: process.env.ENV_FILE || path.resolve(__dirname, '../.env'), quiet: true });

const host = process.env.POSTGRES_HOST || 'postgres';
const port = process.env.POSTGRES_PORT || '5432';
const database = process.env.POSTGRES_DB || 'bd_EcoBazar';
const services = [
  ['identity-service', 'ecobazar_identity', 'IDENTITY_DB_PASSWORD', 'identity_dev', 'IDENTITY_DATABASE_URL'],
  ['catalog-service', 'ecobazar_catalog', 'CATALOG_DB_PASSWORD', 'catalog_dev', 'CATALOG_DATABASE_URL'],
  ['cart-service', 'ecobazar_cart', 'CART_DB_PASSWORD', 'cart_dev', 'CART_DATABASE_URL'],
  ['order-service', 'ecobazar_ordering', 'ORDER_DB_PASSWORD', 'ordering_dev', 'ORDER_DATABASE_URL'],
  ['payment-service', 'ecobazar_payment', 'PAYMENT_DB_PASSWORD', 'payment_dev', 'PAYMENT_DATABASE_URL'],
  ['moderation-service', 'ecobazar_moderation', 'MODERATION_DB_PASSWORD', 'moderation_dev', 'MODERATION_DATABASE_URL'],
];

for (const [service, user, passwordEnv, defaultPassword, databaseUrlEnv] of services) {
  const script = path.resolve(__dirname, `../services/${service}/src/migrate.js`);
  const databaseUrl = process.env[databaseUrlEnv]
    || `postgres://${user}:${process.env[passwordEnv] || defaultPassword}@${host}:${port}/${database}`;
  const result = spawnSync(process.execPath, [script], {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      RABBITMQ_URL: process.env.RABBITMQ_URL || 'amqp://ecobazar:ecobazar_dev@rabbitmq:5672',
      INTERNAL_SERVICE_TOKEN: process.env.INTERNAL_SERVICE_TOKEN || 'change_this_internal_token_32_chars',
      JWT_PRIVATE_KEY_PATH: process.env.JWT_PRIVATE_KEY_PATH || '/run/secrets/jwt-private.pem',
      JWT_PUBLIC_KEY_PATH: process.env.JWT_PUBLIC_KEY_PATH || '/run/secrets/jwt-public.pem',
    },
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log('[migration] all service migrations applied');
