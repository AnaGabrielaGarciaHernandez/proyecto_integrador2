ALTER TABLE files
  ADD COLUMN IF NOT EXISTS public_url text;

CREATE INDEX IF NOT EXISTS files_public_url_idx
  ON files (public_url)
  WHERE public_url IS NOT NULL;
