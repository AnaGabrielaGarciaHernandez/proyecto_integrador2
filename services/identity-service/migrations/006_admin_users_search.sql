CREATE INDEX IF NOT EXISTS users_full_name_search_idx
  ON identity.users USING gin (lower(full_name) gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS users_email_search_idx
  ON identity.users USING gin (lower(email) gin_trgm_ops)
  WHERE deleted_at IS NULL;
