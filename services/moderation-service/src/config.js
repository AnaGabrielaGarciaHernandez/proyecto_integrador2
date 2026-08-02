const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');
const { assertNotDevelopmentDefault } = require('@ecobazar/platform');

dotenv.config({ path: process.env.ENV_FILE || path.resolve(__dirname, '../.env'), quiet: true });

const config = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4006),
  DATABASE_URL: z.string().min(1),
  RABBITMQ_URL: z.string().min(1),
  INTERNAL_SERVICE_TOKEN: z.string().min(16),
  RATE_LIMIT_HASH_KEY: z.string().min(16).default('ecobazar-development-rate-limit-secret'),
  RATE_LIMIT_MUTATION_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_MUTATION_WINDOW_MS: z.coerce.number().int().positive().default(3600000),
}).parse(process.env);

assertNotDevelopmentDefault(config, ['INTERNAL_SERVICE_TOKEN', 'RATE_LIMIT_HASH_KEY', 'RABBITMQ_URL']);
module.exports = config;
