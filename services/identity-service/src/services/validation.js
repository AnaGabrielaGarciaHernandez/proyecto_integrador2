const { z } = require('zod');

const registerSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  full_name: z.string().trim().min(2).max(180),
  password: z.string().min(8).max(128),
  phone: z.string().trim().max(30).optional(),
}).strict();

const loginSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(1),
});

const googleSchema = z.object({
  id_token: z.string().min(1),
});

const preferencesSchema = z.object({
  show_home_sell_banner: z.boolean(),
});

const privacyDeletionSchema = z.object({
  confirmation: z.literal('ELIMINAR'),
}).strict();

const profileSchema = z.object({
  full_name: z.string().trim().min(2).max(180),
}).strict();

module.exports = {
  googleSchema,
  loginSchema,
  preferencesSchema,
  privacyDeletionSchema,
  profileSchema,
  registerSchema,
};
