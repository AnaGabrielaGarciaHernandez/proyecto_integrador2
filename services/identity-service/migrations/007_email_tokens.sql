CREATE TABLE IF NOT EXISTS identity.email_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  token_type varchar(32) NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_tokens_type_chk CHECK (token_type IN ('verification', 'password_reset')),
  CONSTRAINT email_tokens_expiry_chk CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS email_tokens_user_type_idx
  ON identity.email_tokens (user_id, token_type, created_at DESC);
CREATE INDEX IF NOT EXISTS email_tokens_active_idx
  ON identity.email_tokens (token_hash, expires_at)
  WHERE used_at IS NULL;
