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
const privacyMigration = fs.readFileSync(
  path.resolve(__dirname, '../migrations/004_privacy_requests.sql'),
  'utf8',
);
const rateLimitMigration = fs.readFileSync(
  path.resolve(__dirname, '../migrations/005_rate_limits.sql'),
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

test('privacy migrations support asynchronous deletion and hashed rate-limit buckets', () => {
  assert.match(migration, /deletion_requested_at timestamptz/i);
  assert.match(migration, /deleted_at timestamptz/i);
  assert.match(privacyMigration, /identity\.privacy_requests/i);
  assert.match(privacyMigration, /request_type.*export.*deletion/is);
  assert.match(privacyMigration, /retention_hold boolean NOT NULL DEFAULT false/i);
  assert.match(rateLimitMigration, /bucket_key char\(64\) PRIMARY KEY/i);
  assert.doesNotMatch(rateLimitMigration, /user_id|email|ip_address/i);
});
