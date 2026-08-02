# Operación de producción

Esta instalación está pensada para un VPS Ubuntu con Docker Engine, Docker Compose, un dominio y un bucket S3-compatible para Restic.

## Primera instalación

1. Apunta el registro DNS `A` del dominio al VPS y deja abiertos únicamente `80/tcp` y `443/tcp` en el firewall.
2. Instala Docker Compose, `restic`, `curl` y `jq` en el VPS.
3. Clona el repositorio en una carpeta de despliegue y copia `.env.production.example` como `.env.production`.
4. Completa todos los valores. Las seis `*_DATABASE_URL` deben usar las mismas contraseñas que sus variables `*_DB_PASSWORD`, codificadas para URL.
5. Genera el par RS256 una sola vez antes de arrancar:

   ```bash
   mkdir -p .secrets
   chmod 700 .secrets
   NODE_ENV=development JWT_KEYS_DIR=.secrets npm run keys:generate
   chmod 600 .secrets/jwt-private.pem
   chmod 644 .secrets/jwt-public.pem
   ```

6. Configura el repositorio Restic y el archivo de contraseña fuera del repositorio (`chmod 600`).
7. Valida y arranca:

   ```bash
   docker compose --env-file .env.production -f compose.yaml -f compose.production.yaml config --quiet
   docker compose --env-file .env.production -f compose.yaml -f compose.production.yaml up -d --build
   APP_URL="https://TU_DOMINIO" ./scripts/smoke-production.sh
   ```

Caddy obtiene y renueva el certificado TLS automáticamente. PostgreSQL, RabbitMQ y los servicios de dominio no publican puertos al host.

## Respaldos y restauración

Configura `RESTIC_REPOSITORY`, `RESTIC_PASSWORD_FILE` y las variables del proveedor S3 en el entorno del VPS. Ejecuta al menos una vez al día:

```bash
ENV_FILE=.env.production ./scripts/backup-production.sh
```

El respaldo contiene un dump de PostgreSQL y los objetos de buckets Supabase configurados. Prueba una restauración en un entorno separado antes de declarar un RPO/RTO. Para una restauración destructiva explícita:

```bash
RESTORE_CONFIRM=YES ENV_FILE=.env.production ./scripts/restore-production.sh
```

El script detiene la aplicación y restaura PostgreSQL; la re-subida de objetos Supabase requiere el procedimiento del proveedor y la copia del snapshot.

## Despliegue

El workflow `deploy-production.yml` espera estos secretos de GitHub: `PRODUCTION_HOST`, `PRODUCTION_USER`, `PRODUCTION_SSH_KEY`, `PRODUCTION_APP_DIR` y `PRODUCTION_DOMAIN`. El archivo `.env.production` permanece únicamente en el VPS.

## Operación diaria

- `GET /health/live` confirma que el gateway está vivo; `GET /api/health` verifica dependencias.
- El endpoint interno `/metrics` del gateway expone contadores Prometheus básicos. No lo publiques en Caddy sin protegerlo con autenticación de red.
- Revisa `docker compose ... ps`, los logs JSON y las colas `.dlq` de RabbitMQ.
- Los eventos fallidos usan reintento con backoff y quedan en DLQ después de cinco intentos.
- Programa una tarea de backup, una prueba de restauración y una revisión de alertas antes de aceptar tráfico real.
- El audit de runtime conserva una excepción documentada para el aviso RSC de React Router (1124282): el frontend se compila como cliente con `BrowserRouter` y no usa RSC/SSR actions. Si se introduce SSR, esa excepción debe eliminarse y actualizarse React Router antes del despliegue.

## Alcance publicado

La versión MVP cobra cada pedido en una sola cuenta de Stripe y usa recogida presencial. No anuncia Stripe Connect, pagos a vendedores, reembolsos automáticos, devoluciones garantizadas ni reseñas operativas.
