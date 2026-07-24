ALTER TABLE identity.users
  ADD COLUMN IF NOT EXISTS avatar_url text;
