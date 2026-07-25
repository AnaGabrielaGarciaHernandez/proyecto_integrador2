ALTER TABLE ordering.order_items
  ADD COLUMN IF NOT EXISTS seller_name varchar(180);

CREATE INDEX IF NOT EXISTS ordering_orders_order_number_trgm_idx
  ON ordering.orders USING gin (lower(order_number) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ordering_orders_buyer_name_trgm_idx
  ON ordering.orders USING gin (lower(buyer_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ordering_orders_id_trgm_idx
  ON ordering.orders USING gin (lower((id::text)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ordering_orders_buyer_id_trgm_idx
  ON ordering.orders USING gin (lower((buyer_id::text)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ordering_items_seller_name_trgm_idx
  ON ordering.order_items USING gin (lower(seller_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ordering_items_seller_user_id_trgm_idx
  ON ordering.order_items USING gin (lower((seller_user_id::text)) gin_trgm_ops);
