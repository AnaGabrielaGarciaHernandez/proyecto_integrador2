const path = require('node:path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const optionalUrl = z.union([z.literal(''), z.string().url()]);

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
  SUPABASE_URL: optionalUrl.default(''),
  SUPABASE_SERVER_KEY: z.string().optional().default(''),
  SUPABASE_PRODUCT_IMAGES_BUCKET: z.string()
    .regex(/^[a-z0-9][a-z0-9._-]{1,62}$/)
    .default('product-images'),
  PRODUCT_IMAGE_MAX_FILES: z.coerce.number().int().min(1).max(8).default(8),
  PRODUCT_IMAGE_MAX_INPUT_BYTES: z.coerce.number().int().positive().default(8388608),
  PRODUCT_IMAGE_MAX_OUTPUT_BYTES: z.coerce.number().int().positive().default(1572864),
  PRODUCT_IMAGE_MAX_PIXELS: z.coerce.number().int().positive().default(25000000),
  PRODUCT_IMAGE_MAX_DIMENSION: z.coerce.number().int().positive().default(6000),
});

function loadConfig(source = process.env) {
  return EnvSchema.parse(source);
}

module.exports = { loadConfig };
