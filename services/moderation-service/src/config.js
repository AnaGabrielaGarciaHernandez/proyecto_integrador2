const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ path: process.env.ENV_FILE || path.resolve(__dirname, '../.env'), quiet: true });

module.exports = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4006),
  DATABASE_URL: z.string().min(1),
  RABBITMQ_URL: z.string().min(1),
  INTERNAL_SERVICE_TOKEN: z.string().min(16),
}).parse(process.env);
