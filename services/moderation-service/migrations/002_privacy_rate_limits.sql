CREATE TABLE IF NOT EXISTS moderation.rate_limit_buckets (
  bucket_key char(64) PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  attempt_count integer NOT NULL CHECK (attempt_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limit_buckets_updated_idx
  ON moderation.rate_limit_buckets (updated_at);
