DO $$
BEGIN
  CREATE TYPE identity.user_role AS ENUM ('cliente', 'vendedor', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE identity.auth_provider AS ENUM ('email', 'google');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS identity.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL,
  full_name varchar(180) NOT NULL,
  password_hash varchar(255),
  auth_provider identity.auth_provider NOT NULL,
  google_sub varchar(255),
  google_email_verified boolean NOT NULL DEFAULT false,
  role identity.user_role NOT NULL DEFAULT 'cliente',
  phone varchar(30),
  bio text,
  avatar_file_id uuid,
  stripe_customer_id varchar(255),
  is_active boolean NOT NULL DEFAULT true,
  email_verified_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_format_chk CHECK (
    email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  ),
  CONSTRAINT users_email_auth_chk CHECK (
    (auth_provider = 'email' AND password_hash IS NOT NULL AND google_sub IS NULL)
    OR
    (auth_provider = 'google' AND google_sub IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
  ON identity.users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique_idx
  ON identity.users (google_sub)
  WHERE google_sub IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_customer_unique_idx
  ON identity.users (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_role_idx ON identity.users (role);
CREATE INDEX IF NOT EXISTS users_created_at_idx ON identity.users (created_at);

CREATE TABLE IF NOT EXISTS identity.sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_expiry_chk CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS sessions_active_user_idx
  ON identity.sessions (user_id, expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS sessions_expiry_idx
  ON identity.sessions (expires_at);

CREATE TABLE IF NOT EXISTS identity.message_outbox (
  event_id uuid PRIMARY KEY,
  event_type varchar(120) NOT NULL,
  event_version integer NOT NULL DEFAULT 1,
  correlation_id uuid NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_outbox_attempts_chk CHECK (attempts >= 0)
);

CREATE INDEX IF NOT EXISTS message_outbox_pending_idx
  ON identity.message_outbox (created_at)
  WHERE processed_at IS NULL;

CREATE OR REPLACE FUNCTION identity.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_set_updated_at ON identity.users;
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON identity.users
FOR EACH ROW
EXECUTE FUNCTION identity.set_updated_at();
