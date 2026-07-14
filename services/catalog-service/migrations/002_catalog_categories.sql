INSERT INTO categories (name, slug) VALUES
  ('Sudaderas y chamarras', 'sudaderas-chamarras'),
  ('Camisetas y tops', 'camisetas-tops'),
  ('Pantalones', 'pantalones'),
  ('Vestidos y faldas', 'vestidos-faldas'),
  ('Accesorios', 'accesorios'),
  ('Calzado', 'calzado'),
  ('Hogar y decoracion', 'hogar-decoracion'),
  ('Otros', 'otros')
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    is_active = true;
