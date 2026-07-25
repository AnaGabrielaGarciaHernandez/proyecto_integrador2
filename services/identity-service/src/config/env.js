const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');

const optionalUrl = z.union([z.literal(''), z.string().url()]);

dotenv.config({
  path: process.env.ENV_FILE || path.resolve(process.cwd(), '.env'),
  quiet: true,
});

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  RABBITMQ_URL: z.string().min(1).default('amqp://localhost:5672'),
  JWT_PRIVATE_KEY: z.string().optional().default(''),
  JWT_PRIVATE_KEY_FILE: z.string().optional().default(''),
  JWT_PRIVATE_KEY_PATH: z.string().optional().default(''),
  JWT_EXPIRES_IN: z.string().min(1).default('7d'),
  JWT_ISSUER: z.string().min(1).default('ecobazar-identity'),
  JWT_AUDIENCE: z.string().min(1).default('ecobazar-api'),
  COOKIE_NAME: z.string().min(1).default('ecobazar_session'),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  INTERNAL_SERVICE_TOKENS: z.string().optional().default(''),
  INTERNAL_SERVICE_TOKEN: z.string().optional().default(''),
  OUTBOX_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  SUPABASE_URL: optionalUrl.default(''),
  SUPABASE_SERVER_KEY: z.string().optional().default(''),
  SUPABASE_AVATAR_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,62}$/).default('avatars'),
  AVATAR_MAX_INPUT_BYTES: z.coerce.number().int().positive().default(5242880),
  AVATAR_MAX_OUTPUT_BYTES: z.coerce.number().int().positive().default(307200),
  AVATAR_OUTPUT_SIZE: z.coerce.number().int().positive().default(256),
  AVATAR_MAX_PIXELS: z.coerce.number().int().positive().default(16000000),
  AVATAR_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  AVATAR_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(3600000),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid identity-service configuration: ${details}`);
}

if (parsed.data.NODE_ENV === 'production'
  && (!parsed.data.SUPABASE_URL || !parsed.data.SUPABASE_SERVER_KEY)) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVER_KEY are required in production');
}

module.exports = parsed.data;
