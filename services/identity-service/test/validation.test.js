const test = require('node:test');
const assert = require('node:assert/strict');
const {
  googleSchema,
  loginSchema,
  preferencesSchema,
  profileSchema,
  privacyDeletionSchema,
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
  assert.equal(registerSchema.safeParse({
    email: 'person@example.com',
    full_name: 'Persona EcoBazar',
    password: 'password-seguro',
    avatar_url: 'data:image/jpeg;base64,not-stored',
  }).success, false);
  assert.equal(registerSchema.safeParse({
    email: 'person@example.com',
    full_name: 'Persona EcoBazar',
    password: 'password-seguro',
    avatar_url: 'https://example.com/avatar.jpg',
  }).success, false);
});

test('profile updates accept only the display name and reject client avatar URLs', () => {
  assert.deepEqual(profileSchema.parse({ full_name: 'Nuevo nombre' }), {
    full_name: 'Nuevo nombre',
  });
  assert.equal(profileSchema.safeParse({
    full_name: 'Usuario con foto',
    avatar_url: 'data:image/jpeg;base64,not-accepted',
  }).success, false);
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

test('privacy deletion requires the exact confirmation phrase', () => {
  assert.deepEqual(privacyDeletionSchema.parse({ confirmation: 'ELIMINAR' }), {
    confirmation: 'ELIMINAR',
  });
  assert.equal(privacyDeletionSchema.safeParse({ confirmation: 'eliminar' }).success, false);
  assert.equal(privacyDeletionSchema.safeParse({ confirmation: 'ELIMINAR', extra: true }).success, false);
});
