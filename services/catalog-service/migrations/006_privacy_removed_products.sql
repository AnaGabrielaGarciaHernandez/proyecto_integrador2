CREATE OR REPLACE FUNCTION validate_product_seller()
RETURNS trigger AS $$
DECLARE
  projected_role varchar(30);
  projected_active boolean;
  profile_status varchar(30);
BEGIN
  -- A removed product is no longer being published. This permits privacy
  -- deletion to remove listings after identity is deactivated.
  IF NEW.status = 'removed' THEN
    RETURN NEW;
  END IF;

  SELECT ur.role, ur.is_active, sp.status
    INTO projected_role, projected_active, profile_status
  FROM seller_profiles sp
  JOIN user_role_projection ur ON ur.user_id = sp.user_id
  WHERE sp.id = NEW.seller_id;

  IF projected_role <> 'vendedor' OR projected_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Only active users with role vendedor can publish products';
  END IF;
  IF profile_status <> 'approved' THEN
    RAISE EXCEPTION 'Seller must be approved before publishing products';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
