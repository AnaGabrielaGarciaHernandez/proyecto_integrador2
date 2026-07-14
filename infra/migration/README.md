# Migraciones De Schema

Esta imagen aplica la estructura vigente de los seis dominios en instalaciones
nuevas y futuras actualizaciones de base de datos.

`scripts/migrate-all.js` ejecuta, en orden, las migraciones de Identity, Catalog,
Cart, Order, Payment y Moderation. Cada servicio usa su propio rol y registra los
archivos aplicados en `<schema>.schema_migrations`.

Docker Compose ejecuta el job `migrate` automáticamente antes de iniciar los
servicios. También puede repetirse manualmente; las migraciones ya registradas se
omiten:

```bash
docker compose run --rm migrate
```

El bootstrap de extensiones, roles y schemas está en
`infra/database/bootstrap/001_schemas_roles.sql`. No se deben borrar este job,
las carpetas `services/*/migrations/` ni `packages/platform/src/db.js`: forman
parte permanente del arranque de EcoBazar.
