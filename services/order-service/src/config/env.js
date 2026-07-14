const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4004),
  DATABASE_URL: z.string().min(1),
  RABBITMQ_URL: z.string().min(1),
  INTERNAL_SERVICE_TOKEN: z.string().min(16),
  CART_SERVICE_URL: z.string().url().default('http://cart-service:4003'),
  CATALOG_SERVICE_URL: z.string().url().default('http://catalog-service:4002'),
  PAYMENT_SERVICE_URL: z.string().url().default('http://payment-service:4005'),
  OUTBOX_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  COMPENSATION_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
});

const parsed = schema.safeParse({
  ...process.env,
  INTERNAL_SERVICE_TOKEN: process.env.INTERNAL_SERVICE_TOKEN || process.env.SERVICE_TOKEN,
});
if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Invalid order-service environment: ${details}`);
}

module.exports = parsed.data;
