const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');
const { assertNotDevelopmentDefault, assertProductionConfig } = require('@ecobazar/platform');

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
  PUBLIC_APP_URL: optionalUrl.default('http://localhost:5173'),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default(''),
  EMAIL_VERIFICATION_TTL_MS: z.coerce.number().int().positive().default(86400000),
  PASSWORD_RESET_TTL_MS: z.coerce.number().int().positive().default(1800000),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  INTERNAL_SERVICE_TOKENS: z.string().optional().default(''),
  INTERNAL_SERVICE_TOKEN: z.string().optional().default(''),
  OUTBOX_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  CATALOG_SERVICE_URL: optionalUrl.default('http://catalog-service:4002'),
  CART_SERVICE_URL: optionalUrl.default('http://cart-service:4003'),
  ORDER_SERVICE_URL: optionalUrl.default('http://order-service:4004'),
  PAYMENT_SERVICE_URL: optionalUrl.default('http://payment-service:4005'),
  MODERATION_SERVICE_URL: optionalUrl.default('http://moderation-service:4006'),
  PRIVACY_WORKER_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  PRIVACY_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  PRIVACY_RETENTION_DAYS: z.coerce.number().int().positive().default(365),
  RATE_LIMIT_HASH_KEY: z.string().min(16).default('ecobazar-development-rate-limit-secret'),
  RATE_LIMIT_MUTATION_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_MUTATION_WINDOW_MS: z.coerce.number().int().positive().default(3600000),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  REGISTER_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  REGISTER_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(3600000),
  EMAIL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  EMAIL_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  GOOGLE_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  GOOGLE_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(3600000),
  PRIVACY_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(6),
  PRIVACY_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(86400000),
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

const config = parsed.data;

if (config.NODE_ENV === 'production'
  && (!config.SUPABASE_URL || !config.SUPABASE_SERVER_KEY)) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVER_KEY are required in production');
}

assertProductionConfig(config, {
  required: ['PUBLIC_APP_URL', 'SMTP_HOST', 'SMTP_FROM'],
  httpsUrls: ['PUBLIC_APP_URL', 'SUPABASE_URL'],
});
assertNotDevelopmentDefault(config, ['RATE_LIMIT_HASH_KEY', 'INTERNAL_SERVICE_TOKEN']);

if (config.NODE_ENV === 'production'
  && !config.INTERNAL_SERVICE_TOKENS
  && !config.INTERNAL_SERVICE_TOKEN) {
  throw new Error('INTERNAL_SERVICE_TOKENS or INTERNAL_SERVICE_TOKEN is required in production');
}

module.exports = config;
