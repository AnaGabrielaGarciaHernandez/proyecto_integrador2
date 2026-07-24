const test = require('node:test');
const assert = require('node:assert/strict');
const {
  googleSchema,
  loginSchema,
  preferencesSchema,
  profileSchema,
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

test('accepts profile updates with a display name and a real avatar photo URL', () => {
  const result = profileSchema.parse({
    full_name: 'Nuevo nombre',
    avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80',
  });

  assert.equal(result.full_name, 'Nuevo nombre');
  assert.match(result.avatar_url, /^https:\/\//);
});

test('accepts only a present boolean home banner preference', () => {
  assert.deepEqual(
    preferencesSchema.parse({ show_home_sell_banner: false }),
    { show_home_sell_banner: false },
  );
  assert.equal(preferencesSchema.safeParse({}).success, false);
  assert.equal(
    preferencesSchema.safeParse({ show_home_sell_banner: 'false' }).success,
    false,
  );
  assert.equal(
    preferencesSchema.safeParse({ show_home_sell_banner: null }).success,
    false,
  );
});
