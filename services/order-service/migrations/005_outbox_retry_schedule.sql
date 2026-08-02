ALTER TABLE ordering.message_outbox
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS message_outbox_due_idx
  ON ordering.message_outbox (next_attempt_at, created_at)
  WHERE processed_at IS NULL;
