CREATE INDEX inventory_reservation_items_product_order_idx
  ON inventory_reservation_items (product_id, order_id);
