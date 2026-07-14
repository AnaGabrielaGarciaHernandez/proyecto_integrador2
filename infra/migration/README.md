# Migración Del Monolito

La migración se ejecuta con una ventana sin escrituras y conserva las tablas de
`public` como respaldo durante una versión.

1. Crear el `pg_dump` indicado en el README raíz.
2. Aplicar `infra/database/bootstrap/001_schemas_roles.sql`.
3. Ejecutar `node scripts/migrate-all.js`.
4. Ejecutar `node scripts/migrate-legacy-data.js`.
5. Ejecutar `node scripts/validate-migration.js`.

Los tres scripts son idempotentes para poder corregir una interrupción antes de
abrir nuevamente las escrituras.

Con Docker Compose, la imagen de migración incorpora el repositorio y sus
dependencias. Los mismos pasos se ejecutan sin montar carpetas del host:

```bash
docker compose run --rm migrate
docker compose run --rm migrate node scripts/migrate-legacy-data.js
docker compose run --rm migrate node scripts/validate-migration.js
```
