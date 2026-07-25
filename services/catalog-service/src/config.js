const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4002),
  DATABASE_URL: z.string().min(1),
  RABBITMQ_URL: z.string().min(1).default('amqp://localhost:5672'),
  INTERNAL_SERVICE_TOKEN: z.string().min(16),
  OUTBOX_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  RATE_LIMIT_HASH_KEY: z.string().min(16).default('ecobazar-development-rate-limit-secret'),
  RATE_LIMIT_MUTATION_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_MUTATION_WINDOW_MS: z.coerce.number().int().positive().default(3600000),
});

function loadConfig(source = process.env) {
  return EnvSchema.parse(source);
}

module.exports = { loadConfig };
