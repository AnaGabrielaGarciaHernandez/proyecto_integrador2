const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.resolve(__dirname, '../migrations/001_identity_schema.sql'),
  'utf8',
);

test('identity migration isolates users, sessions and the simplified outbox', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS identity\.users/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS identity\.sessions/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS identity\.message_outbox/i);
  assert.match(migration, /event_id uuid PRIMARY KEY/i);
  assert.match(migration, /processed_at timestamptz/i);
  assert.doesNotMatch(migration, /CREATE TABLE[^;]+public\./i);
});

test('identity migration preserves legacy identifiers needed for the cutover', () => {
  assert.match(migration, /id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/i);
  assert.match(migration, /avatar_file_id uuid/i);
  assert.match(migration, /stripe_customer_id varchar\(255\)/i);
  assert.match(migration, /users_stripe_customer_unique_idx/i);
});
