ALTER TABLE identity.users
  ADD COLUMN IF NOT EXISTS show_home_sell_banner boolean NOT NULL DEFAULT true;
