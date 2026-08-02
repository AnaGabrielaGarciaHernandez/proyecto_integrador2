const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');
const { assertNotDevelopmentDefault, assertProductionConfig } = require('@ecobazar/platform');

dotenv.config({
  path: process.env.ENV_FILE || path.resolve(process.cwd(), '.env'),
  quiet: true,
});

const url = z.string().url();
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
  EDGE_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  EDGE_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  COOKIE_NAME: z.string().min(1).default('ecobazar_session'),
  JWT_PUBLIC_KEY: z.string().optional().default(''),
  JWT_PUBLIC_KEY_FILE: z.string().optional().default(''),
  JWT_PUBLIC_KEY_PATH: z.string().optional().default(''),
  JWT_ISSUER: z.string().min(1).default('ecobazar-identity'),
  JWT_AUDIENCE: z.string().min(1).default('ecobazar-api'),
  IDENTITY_SERVICE_URL: url.default('http://identity-service:4001'),
  CATALOG_SERVICE_URL: url.default('http://catalog-service:4002'),
  CART_SERVICE_URL: url.default('http://cart-service:4003'),
  ORDER_SERVICE_URL: url.default('http://order-service:4004'),
  PAYMENT_SERVICE_URL: url.default('http://payment-service:4005'),
  MODERATION_SERVICE_URL: url.default('http://moderation-service:4006'),
  INTERNAL_SERVICE_TOKEN: z.string().min(16).default('change_this_internal_token'),
  SESSION_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  PROXY_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  HEALTH_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid api-gateway configuration: ${details}`);
}

const config = parsed.data;
assertProductionConfig(config, {
  required: ['INTERNAL_SERVICE_TOKEN'],
  httpsUrls: ['CLIENT_ORIGIN'],
});
assertNotDevelopmentDefault(config, ['INTERNAL_SERVICE_TOKEN']);

if (config.NODE_ENV === 'production' && config.CLIENT_ORIGIN.includes('localhost')) {
  throw new Error('CLIENT_ORIGIN cannot point to localhost in production');
}

module.exports = config;
