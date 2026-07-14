const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.resolve(__dirname, '../migrations/001_identity_schema.sql'),
  'utf8',
);
const preferencesMigration = fs.readFileSync(
  path.resolve(__dirname, '../migrations/002_user_preferences.sql'),
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

test('identity schema keeps stable identifiers and optional payment profile fields', () => {
  assert.match(migration, /id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/i);
  assert.match(migration, /avatar_file_id uuid/i);
  assert.match(migration, /stripe_customer_id varchar\(255\)/i);
  assert.match(migration, /users_stripe_customer_unique_idx/i);
});

test('user preferences migration adds a non-null banner preference defaulting to true', () => {
  assert.match(preferencesMigration, /ALTER TABLE identity\.users/i);
  assert.match(
    preferencesMigration,
    /ADD COLUMN IF NOT EXISTS show_home_sell_banner boolean NOT NULL DEFAULT true/i,
  );
  assert.doesNotMatch(preferencesMigration, /UPDATE identity\.users/i);
  assert.doesNotMatch(preferencesMigration, /CREATE(?: UNIQUE)? INDEX/i);
});
