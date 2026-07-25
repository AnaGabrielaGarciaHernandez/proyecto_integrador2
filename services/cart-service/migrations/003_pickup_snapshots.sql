ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS pickup_point_id uuid,
  ADD COLUMN IF NOT EXISTS pickup_point jsonb,
  ADD COLUMN IF NOT EXISTS pickup_schedules jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS cart_items_pickup_point_idx
  ON cart_items (pickup_point_id);
