const { z } = require('zod');

const registerSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  full_name: z.string().trim().min(2).max(180),
  password: z.string().min(8).max(128),
  phone: z.string().trim().max(30).optional(),
});

const loginSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(1),
});

const googleSchema = z.object({
  id_token: z.string().min(1),
});

module.exports = { googleSchema, loginSchema, registerSchema };
