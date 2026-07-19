CREATE TABLE wishlist_items (
  user_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

CREATE INDEX wishlist_items_user_created_idx
  ON wishlist_items (user_id, created_at DESC);

CREATE INDEX wishlist_items_product_idx
  ON wishlist_items (product_id);
