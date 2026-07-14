const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4005),
  DATABASE_URL: z.string().min(1),
  RABBITMQ_URL: z.string().min(1),
  INTERNAL_SERVICE_TOKEN: z.string().min(16),
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  OUTBOX_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
});

const parsed = schema.safeParse({
  ...process.env,
  INTERNAL_SERVICE_TOKEN: process.env.INTERNAL_SERVICE_TOKEN || process.env.SERVICE_TOKEN,
});
if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Invalid payment-service environment: ${details}`);
}

module.exports = parsed.data;
