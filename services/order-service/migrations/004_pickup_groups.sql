ALTER TABLE ordering.order_items
  ADD COLUMN IF NOT EXISTS pickup_point_id uuid,
  ADD COLUMN IF NOT EXISTS pickup_point jsonb,
  ADD COLUMN IF NOT EXISTS pickup_schedules jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS ordering.pickup_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES ordering.orders(id) ON DELETE CASCADE,
  seller_user_id uuid NOT NULL,
  seller_name varchar(180) NOT NULL DEFAULT 'Vendedor',
  pickup_point_id uuid,
  point_name varchar(160) NOT NULL,
  address_line varchar(255) NOT NULL,
  city varchar(120) NOT NULL,
  state varchar(120) NOT NULL,
  postal_code varchar(20) NOT NULL,
  reference varchar(255),
  scheduled_start_at timestamptz NOT NULL,
  scheduled_end_at timestamptz NOT NULL,
  deadline_at timestamptz NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ordering_pickup_groups_window_chk
    CHECK (scheduled_end_at > scheduled_start_at),
  CONSTRAINT ordering_pickup_groups_deadline_chk
    CHECK (deadline_at >= scheduled_start_at)
);

CREATE TABLE IF NOT EXISTS ordering.pickup_group_items (
  pickup_group_id uuid NOT NULL REFERENCES ordering.pickup_groups(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES ordering.order_items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pickup_group_id, order_item_id),
  UNIQUE (order_item_id)
);

CREATE OR REPLACE FUNCTION ordering.touch_pickup_group_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pickup_groups_touch_updated_at ON ordering.pickup_groups;
CREATE TRIGGER pickup_groups_touch_updated_at
BEFORE UPDATE ON ordering.pickup_groups
FOR EACH ROW EXECUTE FUNCTION ordering.touch_pickup_group_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS ordering_pickup_groups_order_window_idx
  ON ordering.pickup_groups
    (order_id, seller_user_id, pickup_point_id, scheduled_start_at, scheduled_end_at);
CREATE INDEX IF NOT EXISTS ordering_pickup_groups_deadline_idx
  ON ordering.pickup_groups (status, deadline_at)
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS ordering_pickup_groups_order_idx
  ON ordering.pickup_groups (order_id, scheduled_start_at);
CREATE INDEX IF NOT EXISTS ordering_pickup_group_items_order_item_idx
  ON ordering.pickup_group_items (order_item_id);
