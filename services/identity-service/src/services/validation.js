const { z } = require('zod');

const registerSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  full_name: z.string().trim().min(2).max(180),
  password: z.string().min(8).max(128),
  phone: z.string().trim().max(30).optional(),
  avatar_url: z.string().trim().max(20000).optional().nullable(),
});

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

const profileSchema = z.object({
  full_name: z.string().trim().min(2).max(180),
  avatar_url: z.string().trim().max(20000).optional().nullable(),
});

module.exports = {
  googleSchema,
  loginSchema,
  preferencesSchema,
  profileSchema,
  registerSchema,
};
