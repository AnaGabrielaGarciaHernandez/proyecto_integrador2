ALTER TABLE identity.users
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE TABLE IF NOT EXISTS identity.privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  request_type varchar(30) NOT NULL CHECK (request_type IN ('export', 'deletion')),
  status varchar(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  correlation_id uuid NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  retention_hold boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS privacy_requests_active_deletion_idx
  ON identity.privacy_requests (user_id)
  WHERE request_type = 'deletion'
    AND status IN ('pending', 'processing', 'failed');

CREATE INDEX IF NOT EXISTS privacy_requests_pending_idx
  ON identity.privacy_requests (next_attempt_at, created_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS privacy_requests_retention_idx
  ON identity.privacy_requests (completed_at)
  WHERE status = 'completed' AND retention_hold = false;

DROP TRIGGER IF EXISTS privacy_requests_set_updated_at ON identity.privacy_requests;
CREATE TRIGGER privacy_requests_set_updated_at
BEFORE UPDATE ON identity.privacy_requests
FOR EACH ROW
EXECUTE FUNCTION identity.set_updated_at();
