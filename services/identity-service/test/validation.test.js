const test = require('node:test');
const assert = require('node:assert/strict');
const {
  googleSchema,
  loginSchema,
  registerSchema,
} = require('../src/services/validation');

test('normalizes a valid email registration', () => {
  const result = registerSchema.parse({
    email: 'USER@Example.COM',
    full_name: 'Usuario EcoBazar',
    password: 'password-seguro',
    phone: '8112345678',
  });
  assert.equal(result.email, 'user@example.com');
});

test('rejects malformed registration and login payloads', () => {
  assert.equal(registerSchema.safeParse({
    email: 'not-an-email',
    full_name: 'A',
    password: 'short',
  }).success, false);
  assert.equal(loginSchema.safeParse({ email: 'person@example.com', password: '' }).success, false);
  assert.equal(googleSchema.safeParse({ id_token: '' }).success, false);
});
