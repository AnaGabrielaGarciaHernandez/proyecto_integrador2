const path = require('path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(24, 'JWT_SECRET must be at least 24 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  COOKIE_NAME: z.string().min(1).default('ecobazar_session'),
  CLIENT_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  STRIPE_SECRET_KEY: z.string().optional().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

module.exports = parsed.data;
