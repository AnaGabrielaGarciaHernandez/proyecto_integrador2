const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('does not mount a body parser before proxying Stripe webhooks', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/app.js'), 'utf8');
  const routing = fs.readFileSync(path.resolve(__dirname, '../src/services/routing.js'), 'utf8');
  assert.doesNotMatch(source, /express\.json\s*\(/);
  assert.doesNotMatch(source, /express\.raw\s*\(/);
  assert.match(source, /original request stream/);
  assert.match(routing, /\/api\/stripe/);
});
