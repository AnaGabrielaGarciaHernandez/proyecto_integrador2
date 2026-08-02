const { z } = require('zod');

const registrationPasswordSchema = z.string()
  .min(8)
  .max(128)
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

const registerSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  full_name: z.string().trim().min(2).max(50),
  password: registrationPasswordSchema,
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
  full_name: z.string().trim().min(2).max(50),
}).strict();

const emailTokenSchema = z.object({
  token: z.string().trim().min(40).max(128),
}).strict();

const emailRequestSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
}).strict();

const passwordResetSchema = z.object({
  token: z.string().trim().min(40).max(128),
  password: registrationPasswordSchema,
}).strict();

module.exports = {
  googleSchema,
  emailRequestSchema,
  emailTokenSchema,
  loginSchema,
  passwordResetSchema,
  preferencesSchema,
  privacyDeletionSchema,
  profileSchema,
  registerSchema,
};
