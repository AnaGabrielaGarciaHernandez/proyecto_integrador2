ALTER TABLE seller_applications
  ADD COLUMN IF NOT EXISTS contact_email varchar(255),
  ADD COLUMN IF NOT EXISTS contact_address varchar(255);

CREATE INDEX IF NOT EXISTS seller_applications_user_status_created_idx
  ON seller_applications (user_id, status, created_at DESC);
