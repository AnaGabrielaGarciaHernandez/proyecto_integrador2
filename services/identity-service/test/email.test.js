const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmailService, createOpaqueToken, hashToken } = require('../src/services/email');

test('email tokens are opaque and stored as one-way hashes', () => {
  const first = createOpaqueToken();
  const second = createOpaqueToken();
  assert.notEqual(first, second);
  assert.equal(hashToken(first).length, 64);
  assert.notEqual(hashToken(first), first);
});

test('email links keep tokens in the URL fragment and send only through the transport', async () => {
  const messages = [];
  const service = createEmailService({
    PUBLIC_APP_URL: 'https://app.example.com',
    SMTP_FROM: 'no-reply@example.com',
  }, {
    transport: { sendMail: async (message) => { messages.push(message); } },
  });

  await service.sendVerificationEmail({ to: 'person@example.com', token: 'opaque-token' });
  await service.sendPasswordResetEmail({ to: 'person@example.com', token: 'reset-token' });

  assert.equal(messages.length, 2);
  assert.match(messages[0].text, /verificar-email#token=opaque-token/);
  assert.match(messages[1].text, /restablecer-contrasena#token=reset-token/);
  assert.equal(messages[0].from, 'no-reply@example.com');
});
