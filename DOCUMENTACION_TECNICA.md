# EcoBazar — Documentación Técnica Y De Arquitectura

Última revisión: 14 de julio de 2026.

Este documento conserva y amplía la documentación técnica que anteriormente estaba en el `README.md`. El README raíz queda reservado para presentar el proyecto y explicar a cualquier integrante del equipo cómo levantarlo en Windows o macOS.

## Estado Actual

EcoBazar se instala y opera exclusivamente con la arquitectura de microservicios:

- Un API Gateway y seis servicios de dominio: Identity, Catalog, Cart, Order, Payment y Moderation.
- Seis schemas PostgreSQL con roles independientes.
- Checkout mediante una Saga orquestada por Order, con reserva de inventario, Stripe Checkout y compensación.
- Outbox/Inbox, RabbitMQ, cinco reintentos directos y DLQ sin CDC ni infraestructura adicional.
- Frontend conectado exclusivamente al API Gateway.
- Instalación reproducible mediante Docker Compose y migraciones de schema versionadas.

Admin y Reviews continúan fuera de alcance y responden `501`. El contrato `moderation.seller_rating.changed.v1` y su consumidor en Catalog están preparados, pero Moderation no producirá ese evento hasta que Reviews tenga operaciones reales.

## Objetivo Del Sistema

EcoBazar es una plataforma de moda circular. Permite consultar prendas, mantener un carrito, reservar inventario, pagar mediante Stripe Checkout y consultar compras o ventas. La entrega es únicamente por recolección presencial y no tiene costo de envío.

En esta iteración EcoBazar cobra cada pedido completo en una sola cuenta de Stripe. Stripe Connect, reparto de fondos, payouts, reembolsos, devoluciones y programación de pickup no forman parte del alcance.

## Stack Técnico

| Capa | Tecnología |
|---|---|
| Frontend | React 19, React Router 7, Vite 8 y Lucide React |
| Backend | Node.js 24, Express 5 y Zod 4 |
| Base de datos | PostgreSQL 18 y `pg` |
| Mensajería | RabbitMQ 4.3, `amqplib`, topic exchange y publisher confirms |
| Autenticación | JWT RS256, sesiones persistidas, cookies HTTP-only, bcrypt y Google Identity opcional |
| Pagos | Stripe SDK 22, Stripe-hosted Checkout y webhooks firmados |
| Infraestructura local | Docker Desktop y Docker Compose |
| Pruebas | `node:test`, ESLint y build de Vite |

El proyecto es un monorepo administrado con npm workspaces. No usa Kubernetes, Kafka, Debezium, CDC, motores externos de Saga, Jaeger, OpenTelemetry, Elasticsearch ni Loki.

## Arquitectura General

```mermaid
flowchart LR
  WEB[React / Vite :5173] --> GW[API Gateway :4000]
  GW --> ID[Identity :4001]
  GW --> CAT[Catalog :4002]
  GW --> CART[Cart :4003]
  GW --> ORD[Order :4004]
  GW --> PAY[Payment :4005]
  GW --> MOD[Moderation :4006]

  ID --> PG[(PostgreSQL 18)]
  CAT --> PG
  CART --> PG
  ORD --> PG
  PAY --> PG
  MOD --> PG

  ID <--> MQ[(RabbitMQ 4.3)]
  CAT <--> MQ
  CART <--> MQ
  ORD <--> MQ
  PAY <--> MQ
```

El navegador sólo conoce `http://localhost:4000/api`. El Gateway decide qué servicio posee cada ruta. Los puertos de los servicios de dominio no se publican al host; sólo son accesibles dentro de la red de Compose.

PostgreSQL y RabbitMQ sí publican puertos para diagnóstico durante desarrollo. Esta configuración no debe copiarse sin endurecimiento a producción.

## Componentes

| Componente | Responsabilidad | Schema | Puerto interno |
|---|---|---|---:|
| `frontend-web` | Interfaz, navegación, carrito, checkout y pedidos | — | 5173 |
| `api-gateway` | CORS, seguridad HTTP, JWT, identidad, correlación, health agregado y proxy | — | 4000 |
| `identity-service` | Registro, login, Google, sesiones, roles y JWT | `identity` | 4001 |
| `catalog-service` | Productos, vendedores, bazares, variantes, stock y reservas | `catalog` | 4002 |
| `cart-service` | Carritos, cantidades y snapshots de producto/precio | `cart` | 4003 |
| `order-service` | Órdenes, ventas y orquestación de la Saga | `ordering` | 4004 |
| `payment-service` | Stripe Checkout, pagos, webhooks y auditoría Stripe | `payment` | 4005 |
| `moderation-service` | Datos futuros de reviews, reportes y administración | `moderation` | 4006 |
| `postgres` | Persistencia de todos los schemas con roles aislados | — | 5432 |
| `rabbitmq` | Transporte de eventos y DLQ | — | 5672/15672 |
| `migrate` | Job que aplica las migraciones de los seis schemas | — | — |
| `jwt-keys` | Job que genera el par RS256 en un volumen persistente | — | — |

## Estructura Del Monorepo

```text
services/
  api-gateway/
  identity-service/
  catalog-service/
  cart-service/
  order-service/
  payment-service/
  moderation-service/
packages/
  contracts/            Contratos Zod y nombres de eventos
  platform/             PostgreSQL, HTTP, Outbox/Inbox y RabbitMQ
infra/
  database/             Imagen, bootstrap, roles y seed local opcional
  migration/            Imagen para migraciones de schema y claves JWT
  rabbitmq/             Notas operativas de mensajería
scripts/
  migrate-all.js
  generate-keys.js
frontend-web/
compose.yaml
DOCUMENTACION_TECNICA.md
README.md
```

## Separación De Datos

Todos los servicios comparten una instancia PostgreSQL para simplificar la operación local, pero cada uno usa un rol y un schema propios. Los roles tienen `NOINHERIT` y no reciben `USAGE` sobre schemas ajenos.

| Schema | Tablas principales |
|---|---|
| `identity` | `users`, `sessions`, `message_outbox`, `schema_migrations` |
| `catalog` | `user_role_projection`, `files`, `seller_profiles`, `seller_applications`, `bazaars`, `bazaar_members`, `categories`, `products`, `product_variants`, `product_images`, `inventory_reservations`, `inventory_reservation_items`, Outbox/Inbox |
| `cart` | `shopping_carts`, `cart_items`, Outbox/Inbox |
| `ordering` | `orders`, `order_items`, `checkout_sagas`, Outbox/Inbox |
| `payment` | `payments`, `stripe_events`, `message_outbox` |
| `moderation` | `reviews`, `reports`, `admin_actions`, Outbox/Inbox |

Reglas de propiedad:

- Un servicio no realiza joins ni transacciones con datos de otro schema.
- Las referencias entre dominios se guardan como UUID sin claves foráneas cruzadas.
- Los datos necesarios para leer una orden o carrito se conservan como snapshots.
- Las consultas entre dominios ocurren por REST interno o eventos.
- Cada schema mantiene su propia tabla `schema_migrations`.

## API Gateway Y Seguridad

El Gateway aplica `helmet`, CORS con credenciales, correlation ID y proxy HTTP. Antes de enviar una solicitud a un dominio:

1. Elimina `x-user-id`, `x-user-role`, `x-user-name`, `x-internal-token` y `x-correlation-id` enviados por el cliente.
2. Lee el JWT desde la cookie o desde un Bearer token.
3. Verifica firma RS256, issuer, audience, expiración y rol.
4. Consulta a Identity para confirmar que la sesión no fue revocada y que el usuario sigue activo.
5. Añade headers de identidad confiables y un `x-correlation-id` interno.

Identity posee la clave privada. Gateway sólo monta la clave pública. El job `jwt-keys` genera ambas la primera vez y las guarda en el volumen `jwt-keys`.

En desarrollo, la cookie usa `HttpOnly`, `SameSite=Lax` y no requiere HTTPS. En producción cambia a `SameSite=None` y `Secure`.

Las llamadas REST entre servicios requieren `x-internal-token` y usan comparación de tiempo constante. El Gateway no monta un body parser antes del proxy, por lo que conserva los bytes originales del webhook de Stripe y también permite transportar multipart sin alterarlo.

## API Pública

| Método y ruta | Servicio | Autenticación | Descripción |
|---|---|---|---|
| `POST /api/auth/register` | Identity | No | Registro y creación de sesión |
| `POST /api/auth/login` | Identity | No | Login con email y contraseña |
| `POST /api/auth/google` | Identity | No | Login o registro con Google |
| `POST /api/auth/logout` | Identity | Sesión | Revoca sesión y elimina cookie |
| `GET /api/auth/me` | Identity | Sesión | Usuario actual |
| `GET /api/products` | Catalog | No | Lista y filtros de productos activos |
| `GET /api/products/:id` | Catalog | No | Detalle, variantes, imágenes y vendedor |
| `GET /api/cart` | Cart | Usuario | Carrito autoritativo |
| `POST /api/cart/items` | Cart | Usuario | Agrega una variante |
| `PATCH /api/cart/items/:id` | Cart | Usuario | Cambia cantidad |
| `DELETE /api/cart/items/:id` | Cart | Usuario | Elimina un item |
| `POST /api/checkout` | Order | Usuario | Crea o recupera Stripe Checkout |
| `POST /api/checkout/:orderId/cancel` | Order | Comprador | Expira Checkout y compensa la reserva |
| `GET /api/orders` | Order | Comprador | Lista de compras |
| `GET /api/orders/:id` | Order | Comprador propietario | Detalle de compra |
| `GET /api/seller/orders` | Order | Vendedor/admin | Lista de ventas propias |
| `GET /api/seller/orders/:id` | Order | Vendedor/admin propietario | Detalle limitado a sus items |
| `POST /api/stripe/webhook` | Payment | Firma Stripe | Fuente de verdad del pago |
| `/api/reviews/*` | Moderation | Usuario | Reservado; actualmente `501` |
| `/api/admin/*` | Moderation | Admin | Reservado; actualmente `501` |
| `GET /api/health` | Gateway | No | Readiness agregado |

Los errores usan esta forma:

```json
{
  "error": {
    "message": "Descripción",
    "details": {
      "code": "BUSINESS_CODE"
    }
  }
}
```

Checkout puede devolver `CART_EMPTY`, `STOCK_UNAVAILABLE`, `MIXED_CURRENCY`, `CHECKOUT_IN_PROGRESS` o `STRIPE_UNAVAILABLE`.

## API Interna

Estas rutas no se publican al host y requieren el token de servicio:

| Servicio | Ruta | Uso |
|---|---|---|
| Identity | `GET /internal/sessions/:id` | Introspección de una sesión desde Gateway |
| Identity | `PATCH /internal/users/:id/role` | Cambio controlado de rol y emisión de evento |
| Catalog | `POST /internal/variants/resolve` | Datos autoritativos para Cart |
| Catalog | `POST /internal/reservations` | Reserva idempotente de inventario |
| Catalog | `POST /internal/reservations/:orderId/release` | Liberación idempotente |
| Catalog | `POST /internal/reservations/:orderId/confirm` | Confirmación después del pago |
| Cart | `GET /internal/carts/:buyerId/snapshot` | Snapshot usado por Order |
| Payment | `POST /internal/checkout-sessions` | Crear o recuperar Checkout idempotentemente |
| Payment | `POST /internal/checkout-sessions/:orderId/expire` | Expirar Checkout antes de compensar |

## Checkout Y Saga

Order es el orquestador. El total se calcula desde los snapshots autoritativos del carrito; el frontend no envía precios, total, comprador ni estados.

```mermaid
sequenceDiagram
  actor U as Comprador
  participant G as Gateway
  participant O as Order
  participant C as Cart
  participant K as Catalog
  participant P as Payment
  participant S as Stripe
  participant R as RabbitMQ

  U->>G: POST /api/checkout
  G->>O: identidad + correlation_id
  O->>C: snapshot del carrito
  O->>O: orden pending_payment
  O->>K: reservar inventario por order_id
  K-->>O: reserva activa y stock descontado
  O->>P: crear Checkout Session
  P->>S: sessions.create + idempotency key
  S-->>U: Stripe-hosted Checkout
  S->>P: webhook firmado
  alt pago confirmado
    P->>R: payment.checkout.completed.v1
    R->>O: marcar orden paid
    O->>R: order.paid.v1
    R->>K: confirmar reserva
    R->>C: retirar cantidades compradas
  else fallo, expiración o cancelación
    P->>R: payment.checkout.failed/expired/cancelled.v1
    R->>O: iniciar compensación
    O->>K: liberar reserva
    K-->>O: stock restaurado una vez
    O->>R: order.cancelled.v1
  end
```

### Camino Exitoso

1. Order obtiene el snapshot del carrito y bloquea lógicamente al comprador con un advisory lock.
2. Crea la orden, sus items y `checkout_sagas` en su transacción local.
3. Catalog bloquea las variantes con `FOR UPDATE`, valida producto, moneda y stock, descuenta inventario y registra la reserva.
4. Payment crea Stripe Checkout con metadata de orden, comprador y correlación. La idempotency key deriva de `order_id`.
5. El navegador sólo se redirige a Stripe; no marca la orden pagada.
6. Payment valida `Stripe-Signature`, registra el evento Stripe y publica el resultado desde Outbox.
7. Order consume el evento y marca la orden como pagada.
8. `order.paid.v1` confirma la reserva en Catalog y retira del carrito únicamente las cantidades compradas.

### Compensación

Si Stripe falla de forma definitiva, expira o el comprador cancela:

- Payment persiste el estado y emite el evento correspondiente.
- Order pasa la Saga a `compensating` y solicita inmediatamente la liberación.
- Catalog restaura stock sólo si la reserva todavía estaba `active`.
- Order termina en `cancelled / compensated` y publica `order.cancelled.v1`.
- El carrito se conserva.

Si Catalog no está disponible, la Saga queda en `compensation_pending`. Un worker interno reintenta cada cinco segundos sin backoff exponencial. Mientras exista una compensación vencida pendiente, `/health/ready` de Order devuelve estado degradado.

El mismo worker concilia checkouts vencidos. Si existe incertidumbre sobre si Stripe alcanzó a crear o cobrar una sesión, conserva la reserva, recupera la petición mediante la misma idempotency key y sólo libera stock cuando Payment confirma que no hubo cobro.

Estados de Saga:

```text
created
inventory_reserved
payment_session_created
paid
compensating
compensation_pending
compensated
```

## Stripe

Payment usa Stripe-hosted Checkout en modo `payment` y guarda:

- Checkout Session.
- PaymentIntent.
- Charge.
- URL de recibo.
- Evento crudo recibido.
- Estado, código y mensaje de fallo cuando existen.

El endpoint de webhook usa `express.raw({ type: 'application/json' })` antes de cualquier parser JSON y valida `Stripe-Signature`. `payment.stripe_events.event_id` hace idempotente el webhook.

Eventos admitidos:

- `checkout.session.completed` con `payment_status=paid`.
- `checkout.session.expired`.
- `checkout.session.async_payment_failed`.

Para desarrollo se deben usar únicamente claves sandbox. Una restricted API key de prueba con permisos mínimos es preferible; la variable existente `STRIPE_SECRET_KEY` también acepta ese tipo de clave. Nunca se guarda una clave real en Git, frontend, logs o documentación.

La implementación actual fuerza `payment_method_types: ['card']`. Funciona con el alcance actual, pero está registrado como mejora técnica: Stripe recomienda omitir ese parámetro para habilitar métodos de pago dinámicos configurables desde el Dashboard.

## Outbox, Inbox Y RabbitMQ

### Outbox

La mutación de negocio y el evento se insertan en la misma transacción PostgreSQL. Un worker interno:

1. Se ejecuta aproximadamente cada segundo mediante `setInterval`.
2. Selecciona lotes con `FOR UPDATE SKIP LOCKED`.
3. Publica mensajes persistentes usando un confirm channel de `amqplib`.
4. Espera confirmación de RabbitMQ.
5. Marca `processed_at` o incrementa `attempts` y guarda `last_error`.
6. Retoma eventos pendientes después de reiniciar.

### Inbox

Cada consumidor inserta `event_id` en `message_inbox` dentro de la misma transacción del handler. El `PRIMARY KEY` y `ON CONFLICT DO NOTHING` evitan efectos duplicados. RabbitMQ recibe `ack` únicamente después del commit.

### Topología

- Exchange topic durable: `ecobazar.events`.
- Dead Letter Exchange durable: `ecobazar.dlx`.
- Colas activas: `catalog-service.events`, `cart-service.events` y `order-service.payments`.
- Cada cola tiene su correspondiente `.dlq`.
- Mensajes persistentes, acknowledgements manuales y publisher confirms.

Si un handler falla, el mensaje se republica directamente con `x-retry-count` incrementado. Después de cinco reintentos se publica en la DLQ y se registra un `console.error`. No hay backoff exponencial, TTL escalonado ni plugins adicionales.

Envelope:

```json
{
  "event_id": "uuid",
  "event_type": "order.paid.v1",
  "event_version": 1,
  "producer": "order-service",
  "occurred_at": "ISO-8601",
  "correlation_id": "uuid",
  "causation_id": "uuid|null",
  "payload": {}
}
```

## Catálogo De Eventos

| Evento | Productor | Consumidor |
|---|---|---|
| `identity.user.registered.v1` | Identity | Catalog y Cart |
| `identity.user.role_changed.v1` | Identity | Catalog y Cart |
| `payment.checkout.completed.v1` | Payment | Order |
| `payment.checkout.failed.v1` | Payment | Order |
| `payment.checkout.expired.v1` | Payment | Order |
| `payment.checkout.cancelled.v1` | Payment | Order |
| `order.paid.v1` | Order | Catalog y Cart |
| `order.cancelled.v1` | Order | Catalog |
| `moderation.seller_rating.changed.v1` | Preparado para Moderation | Catalog |

## Logs Y Correlación

No existe un sistema externo de observabilidad. Cada petición, evento y transición escribe por consola:

```text
[order-service] correlation_id=<uuid> event_type=<tipo> step=<paso>
```

Se registran como mínimo inicio/final de petición, Outbox, Inbox, duplicados, reintentos, DLQ, transiciones de Saga, reservas, liberaciones y llamadas Stripe.

```bash
docker compose logs -f
docker compose logs -f order-service payment-service catalog-service
```

`Ctrl+C` sólo deja de seguir los logs; no detiene los contenedores.

## Docker Compose

Servicios publicados en el host:

| Recurso | URL o puerto |
|---|---|
| Frontend | `http://localhost:5173` |
| API Gateway | `http://localhost:4000/api` |
| RabbitMQ Management | `http://localhost:15672` |
| RabbitMQ AMQP | `localhost:5672` por defecto |
| PostgreSQL | `localhost:55432` por defecto |

Volúmenes persistentes:

- `postgres-data`.
- `rabbitmq-data`.
- `jwt-keys`.

Un primer `docker compose up --build` construye imágenes, inicia PostgreSQL/RabbitMQ, ejecuta `migrate`, genera las claves RS256 y después inicia los servicios según sus healthchecks.

El job `migrate` es permanente: crea y actualiza las tablas de los seis dominios en cualquier base nueva. Cada archivo aplicado queda registrado en `<schema>.schema_migrations`, por lo que repetir el job es seguro.

### Datos Demo Opcionales

Una base limpia incluye estructura y categorías, pero no usuarios ni productos. Para desarrollo local puede cargarse un vendedor y tres productos de ejemplo:

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /opt/ecobazar/seeds/development.sql'
```

El seed es idempotente y está separado de las migraciones de schema. Sólo debe usarse en desarrollo.

## Variables De Entorno

El archivo raíz `.env` se crea a partir de `.env.example` y es consumido por Compose.

| Variable | Propósito |
|---|---|
| `POSTGRES_*` | Base administrativa y puerto publicado |
| `RABBITMQ_DEFAULT_*` | Credenciales locales del broker |
| `RABBITMQ_HOST_PORT` | Puerto AMQP publicado |
| `INTERNAL_SERVICE_TOKEN` | Autenticación REST entre servicios; mínimo 16 caracteres |
| `COOKIE_NAME` | Nombre de cookie de sesión |
| `CLIENT_ORIGIN` | Origen permitido por CORS y URLs de Checkout |
| `GOOGLE_CLIENT_ID` | Login Google opcional |
| `STRIPE_SECRET_KEY` | Clave sandbox de Payment; preferentemente restringida |
| `STRIPE_WEBHOOK_SECRET` | Secreto de firma del listener o endpoint Stripe |

Los `.env` reales, `.secrets`, volúmenes, builds y `dogfood-output` están ignorados por Git y por el contexto de Docker.

Los `.env.example` dentro de cada servicio documentan el modo sin Docker, URLs internas, intervals y timeouts.

## Inicio Rápido Genérico

En sistemas con shell Unix:

```bash
cp .env.example .env
docker compose up --build -d
docker compose ps
curl http://localhost:4000/api/health
```

El paso a paso recomendado para Windows/PowerShell y macOS/Terminal está en el `README.md` raíz.

## Desarrollo Sin Docker

Requiere Node.js 24, npm 11, PostgreSQL y RabbitMQ locales. No basta con copiar los `.env`: una instalación PostgreSQL nueva debe crear primero la base, las extensiones, los roles y los schemas.

El siguiente ejemplo presupone que el superusuario local de PostgreSQL se llama `postgres`. Ajusta `-U` si tu instalación usa otro usuario:

```bash
createdb -U postgres bd_EcoBazar
psql -U postgres -d bd_EcoBazar -f infra/database/bootstrap/001_schemas_roles.sql
```

Configura la raíz y aplica las seis migraciones antes de iniciar servicios:

```bash
npm install
cp .env.example .env
node scripts/migrate-all.js
npm run keys:generate
cp services/identity-service/.env.example services/identity-service/.env
cp services/catalog-service/.env.example services/catalog-service/.env
cp services/cart-service/.env.example services/cart-service/.env
cp services/order-service/.env.example services/order-service/.env
cp services/payment-service/.env.example services/payment-service/.env
cp services/moderation-service/.env.example services/moderation-service/.env
cp services/api-gateway/.env.example services/api-gateway/.env
```

RabbitMQ debe aceptar la URL configurada en esos archivos; los ejemplos esperan `amqp://ecobazar:ecobazar_dev@localhost:5672`. Después se inicia cada servicio mediante su workspace. Los servicios de dominio deben estar listos antes que Gateway.

```bash
npm run dev --workspace=@ecobazar/identity-service
npm run dev --workspace=@ecobazar/catalog-service
npm run dev --workspace=@ecobazar/cart-service
npm run dev --workspace=@ecobazar/order-service
npm run dev --workspace=@ecobazar/payment-service
npm run dev --workspace=@ecobazar/moderation-service
npm run dev --workspace=@ecobazar/api-gateway
npm run dev --workspace=frontend-web
```

## Stripe Sandbox Local

1. Activar un sandbox de Stripe.
2. Configurar en `.env` una clave de prueba, nunca una clave live.
3. Instalar Stripe CLI y ejecutar `stripe login`.
4. Mantener un listener abierto:

```bash
stripe listen --events checkout.session.completed,checkout.session.expired,checkout.session.async_payment_failed --forward-to http://localhost:4000/api/stripe/webhook
```

5. Copiar el `whsec_...` que imprime la CLI a `STRIPE_WEBHOOK_SECRET`.
6. Recrear Payment para que lea el nuevo `.env`:

```bash
docker compose up -d --force-recreate payment-service
```

7. Probar con `4242 4242 4242 4242`, fecha futura, CVC y código postal de prueba.

El proceso `stripe listen` debe permanecer abierto durante las pruebas. Al iniciarlo en otra sesión se debe comparar el nuevo secreto mostrado con el de `.env` y actualizar/recrear Payment si cambió.

## Pruebas

Desde la raíz:

```bash
npm test
npm run check
npm run lint
npm run build
```

Última verificación:

- 74 de 74 pruebas aprobadas.
- Checks de sintaxis aprobados en los workspaces.
- ESLint del frontend sin errores.
- Build Vite aprobado.
- Compose válido y diez contenedores persistentes saludables.
- Pago Stripe, cancelación, expiración explícita de una sesión, webhook duplicado y firma inválida verificados en sandbox. No se esperó el vencimiento natural de 30 minutos.
- Outbox sin pendientes y compensaciones de inventario consistentes.

## Operación Y Diagnóstico

```bash
docker compose ps
docker compose logs -f
docker compose logs -f order-service payment-service catalog-service
docker compose restart payment-service
docker compose config --quiet
```

RabbitMQ Management permite revisar exchanges, bindings, consumidores y colas `.dlq`. Las credenciales locales provienen de `.env`.

Casos habituales:

- `no configuration file provided`: la terminal no está ubicada en la raíz del repositorio.
- Payment responde `STRIPE_UNAVAILABLE`: falta una clave Stripe o el secreto webhook, o Payment no fue recreado después de editar `.env`.
- Gateway no está ready: revisar primero health y logs del servicio marcado como no disponible.
- Order está degradado: existe una compensación de inventario pendiente.
- Puerto ocupado: cambiar `POSTGRES_HOST_PORT` o `RABBITMQ_HOST_PORT`; para 4000/5173 hay que modificar Compose o liberar el puerto.
- Cambios de dependencias no aparecen: reconstruir con `docker compose up --build -d`.

## Detener, Reiniciar Y Limpiar

Conservar datos:

```bash
docker compose down
docker compose up -d
```

Eliminar contenedores y volúmenes:

```bash
docker compose down -v
```

`down -v` elimina PostgreSQL, RabbitMQ y las claves JWT locales. Es destructivo y obliga a aplicar migraciones y generar nuevas claves en el siguiente inicio.

## Alcance Y Mejoras Pendientes

- Pickup presencial y gratuito.
- Una cuenta Stripe cobra el total.
- Los vendedores consultan pedidos reales; las demás rutas de vendedor y el flujo de publicación permanecen como placeholders/prototipo.
- Admin y Reviews conservan `501` hasta otra iteración.
- El productor de rating en Moderation se habilitará junto con Reviews.
- Stripe Connect, payouts, refunds y programación de pickup están fuera de alcance.
- El timeout HTTP inicial de Order a Payment es de 5 segundos; una latencia Stripe mayor puede mostrar un `503` recuperable y reutilizar la sesión en el siguiente intento.
- Checkout está limitado actualmente a tarjeta; conviene migrar a métodos dinámicos de Stripe.
- PostgreSQL y RabbitMQ están publicados al host para desarrollo; en un despliegue se deben retirar o enlazar a una interfaz privada.

## Referencias Internas

- `packages/contracts/src/index.js`: contratos compartidos.
- `packages/platform/src/events.js`: implementación Outbox/Inbox/RabbitMQ.
- `scripts/migrate-all.js`: ejecución ordenada de migraciones de schema.
- `infra/database/bootstrap/001_schemas_roles.sql`: extensiones, roles y schemas.
- `infra/migration/README.md`: funcionamiento del job permanente `migrate`.
- `frontend-web/README.md`: contrato específico del frontend con Gateway.
