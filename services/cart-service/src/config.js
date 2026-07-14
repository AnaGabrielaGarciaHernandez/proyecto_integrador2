const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4003),
  DATABASE_URL: z.string().min(1),
  RABBITMQ_URL: z.string().min(1).default('amqp://localhost:5672'),
  CATALOG_SERVICE_URL: z.string().url().default('http://catalog-service:4002'),
  INTERNAL_SERVICE_TOKEN: z.string().min(16),
  OUTBOX_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  CATALOG_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
});

function loadConfig(source = process.env) {
  return EnvSchema.parse(source);
}

module.exports = { loadConfig };
