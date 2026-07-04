# EcoBazar

EcoBazar es una plataforma para que bazares locales, vendedores y tiendas publiquen productos y lleguen a mas clientes. Este repositorio contiene el frontend React/Vite y el script fuente de PostgreSQL para la base de datos `bd_EcoBazar`.

## Estructura principal

- `frontend-web/`: aplicacion web hecha con React + Vite.
- `bd_EcoBazar.sql`: script completo para crear la base de datos, tablas, restricciones, indices, funciones y triggers.
- `package.json`: dependencias sueltas de la raiz; la app real se ejecuta desde `frontend-web`.

## Como crear la base de datos

Requisitos:

- PostgreSQL instalado.
- Usuario local con permisos para crear bases de datos.
- Cliente `psql` disponible en terminal.

Ejecuta desde la raiz del proyecto:

```bash
psql -d postgres -f bd_EcoBazar.sql
```

El script crea la base de datos `bd_EcoBazar` si no existe y luego se conecta a ella para crear todo el esquema.

Para entrar a la base:

```bash
psql -d bd_EcoBazar
```

Para ver las tablas:

```sql
\dt
```

Importante: el script esta pensado para una base limpia. Si ya existe una version vieja de `bd_EcoBazar`, lo mas claro en desarrollo local es borrarla y volver a correr el script:

```bash
dropdb bd_EcoBazar
psql -d postgres -f bd_EcoBazar.sql
```

Haz esto solo en local o cuando estes seguro de que no hay datos reales que conservar.

## Logica de la base de datos

La base esta separada por areas de negocio.

### Autenticacion y usuarios

Tabla principal: `users`.

Soporta dos formas de login:

- Email y contrasena:
  - `auth_provider = 'email'`
  - requiere `password_hash`
  - no permite `google_sub`
- Google:
  - `auth_provider = 'google'`
  - requiere `google_sub`
  - `password_hash` puede ir vacio

El email es unico sin importar el metodo de login. Esto evita que una misma persona tenga dos cuentas separadas con el mismo correo.

Roles:

- `cliente`: compra productos.
- `vendedor`: publica productos.
- `admin`: revisa vendedores, productos y reportes.

Cuando se crea un usuario con rol `cliente`, un trigger crea automaticamente su carrito en `shopping_carts`.

### Archivos e imagenes

Tabla principal: `files`.

La base no guarda imagenes como URLs hardcodeadas ni como imagenes pegadas en el frontend. Guarda metadata del archivo subido:

- proveedor de storage: local, S3, Cloudflare R2, Supabase Storage u otro.
- bucket.
- `object_key`.
- nombre original.
- tipo MIME.
- tamano.
- checksum.
- usuario que subio el archivo.

Las fotos de perfil y productos apuntan a registros de `files`.

En produccion, el backend debe subir la imagen al storage privado y guardar en PostgreSQL la metadata. Cuando el frontend necesite mostrar una imagen, el backend debe devolver una URL firmada o una ruta publica controlada.

### Vendedores y bazares

Tablas principales:

- `seller_profiles`: perfil publico del vendedor.
- `seller_applications`: solicitudes para convertirse en vendedor.
- `bazaars`: bazares, eventos o tiendas locales.
- `bazaar_members`: relacion entre bazares y vendedores.

Un usuario solo puede publicar productos si:

- tiene rol `vendedor`.
- tiene un `seller_profile` con `status = 'approved'`.

Esto se valida con un trigger antes de insertar o actualizar productos.

### Productos, tallas y stock

Tablas principales:

- `products`: datos generales del producto.
- `product_variants`: tallas y stock independiente.
- `product_images`: imagenes del producto.
- `categories`: categorias base.

`products` no guarda talla ni stock directamente. Un producto puede tener muchas variantes:

```text
Producto: Chamarra vintage
Variantes:
- S: stock 1
- M: stock 3
- L: stock 0
```

Esto permite manejar inventario real por talla.

Reglas importantes:

- no puede repetirse la misma `size_name` para el mismo producto.
- el stock no puede ser negativo.
- el precio vive en `products.price_cents`.
- el carrito y los pedidos apuntan a `product_variants`, no solo al producto.

### Carrito

Tablas principales:

- `shopping_carts`
- `cart_items`

Cada cliente tiene un carrito. Cada item del carrito apunta a una variante especifica:

```text
cart_items.variant_id -> product_variants.id
```

Eso significa que el usuario no agrega "Chamarra vintage" de forma generica, sino "Chamarra vintage talla M".

El backend debe guardar el precio vigente en `cart_items.unit_price_cents` cuando el usuario agrega el producto.

### Ordenes y pickup

Tablas principales:

- `orders`
- `order_items`
- `payments`

La plataforma esta disenada para recoleccion local, no envio por paqueteria.

Por eso `orders` no tiene direccion de envio. Tiene:

- `pickup_scheduled_at`: fecha y hora desde la que el pedido estara listo para recogerse.
- `subtotal_cents`
- `total_cents`
- estado del pedido.

La direccion de recoleccion se debe resolver desde el backend:

- si el producto pertenece a un bazar: usar direccion de `bazaars`.
- si no pertenece a un bazar: usar direccion de `seller_profiles`.

`order_items` guarda snapshots:

- nombre del producto.
- talla.
- precio unitario.
- total.

Esto conserva el historial aunque el vendedor cambie el nombre, precio o stock despues.

### Pagos con Stripe

Tabla principal: `payments`.

La base esta lista para Stripe con campos como:

- `stripe_checkout_session_id`
- `stripe_payment_intent_id`
- `stripe_charge_id`
- `stripe_receipt_url`
- `status`
- `raw_event`

Las llaves secretas de Stripe no van en la base. Deben vivir en variables de entorno del backend.

Flujo esperado:

1. El frontend pide crear checkout.
2. El backend crea una orden en `orders`.
3. El backend crea una sesion de Stripe.
4. El backend guarda el pago en `payments`.
5. Stripe manda un webhook.
6. El backend actualiza `payments.status` y `orders.status`.

### Reviews

Tabla principal: `reviews`.

Un cliente puede calificar una compra con:

- `order_id`
- `buyer_id`
- `seller_id`
- `rating` de 1 a 5
- `comment`

Hay un trigger que recalcula automaticamente `seller_profiles.rating_average` cada vez que se inserta, actualiza o borra una review.

La base evita reseñas duplicadas para la misma combinacion:

```text
order_id + buyer_id + seller_id
```

El backend debe validar que el comprador realmente compro algo de ese vendedor antes de permitir la review.

### Reportes y administracion

Tablas principales:

- `reports`
- `admin_actions`

Sirven para reportar productos, vendedores, bazares o usuarios, y para dejar historial de acciones administrativas.

## Como deberia integrarse con el frontend

El frontend actual todavia usa datos locales y `localStorage` en varias partes. Para conectarlo a la base de datos se necesita un backend/API entre React y PostgreSQL.

React no debe conectarse directo a PostgreSQL porque expondria credenciales y reglas internas. La arquitectura correcta es:

```text
Frontend React -> Backend API -> PostgreSQL
Frontend React -> Backend API -> Storage de imagenes
Stripe -> Backend Webhook -> PostgreSQL
Google Login -> Backend API -> PostgreSQL
```

### Variables de entorno del frontend

En `frontend-web/.env`:

```env
VITE_API_URL=http://localhost:3000/api
```

En produccion:

```env
VITE_API_URL=https://api.tudominio.com/api
```

### Servicio HTTP sugerido

Crear un cliente API en el frontend, por ejemplo `frontend-web/src/services/api.js`:

```js
const API_URL = import.meta.env.VITE_API_URL

export async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    credentials: 'include',
    ...options,
  })

  if (!response.ok) {
    throw new Error('Error en la API')
  }

  return response.json()
}
```

Si usan JWT en vez de cookies, el frontend debera mandar el token en `Authorization: Bearer <token>`.

### Pantallas que deben dejar de usar datos hardcodeados

- `LoginScreen.jsx`
  - Quitar arreglo local de usuarios.
  - Llamar `POST /auth/login`.
  - Para Google, llamar `GET /auth/google` o usar Google Identity Services y mandar el token al backend.

- `RegistroScreen.jsx`
  - Quitar guardado directo en `localStorage`.
  - Llamar `POST /auth/register`.
  - Si el usuario quiere registrarse con Google, usar endpoint de Google login.

- `HomeScreen.jsx` y `ExplorarScreen.jsx`
  - Quitar imports desde `src/data/productos.js`.
  - Llamar `GET /products`.
  - Mostrar imagenes usando URLs firmadas devueltas por backend.

- `ProductoScreen.jsx`
  - Llamar `GET /products/:id`.
  - Mostrar variantes disponibles desde `product_variants`.
  - El usuario debe elegir talla antes de agregar al carrito.

- `CarritoScreen.jsx` y `services/carrito.js`
  - Dejar de usar `localStorage` como fuente real.
  - Llamar endpoints de carrito.
  - Guardar `variant_id`, no solo `product_id`.

- `VenderScreen.jsx`
  - Debe crear producto real con `POST /seller/products`.
  - Debe subir imagenes con `multipart/form-data`.
  - Debe mandar variantes: talla y stock.

- `AdminScreen.jsx`
  - Quitar arreglos locales de vendedores, productos y reportes.
  - Consumir endpoints admin.

## Endpoints minimos recomendados

Autenticacion:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/google`
- `POST /auth/logout`
- `GET /auth/me`

Productos:

- `GET /products`
- `GET /products/:id`
- `POST /seller/products`
- `PATCH /seller/products/:id`
- `POST /seller/products/:id/images`
- `POST /seller/products/:id/variants`

Carrito:

- `GET /cart`
- `POST /cart/items`
- `PATCH /cart/items/:id`
- `DELETE /cart/items/:id`

Ordenes y pagos:

- `POST /checkout`
- `GET /orders`
- `GET /orders/:id`
- `POST /stripe/webhook`

Reviews:

- `POST /reviews`
- `GET /sellers/:id/reviews`

Admin:

- `GET /admin/seller-applications`
- `PATCH /admin/seller-applications/:id`
- `GET /admin/reports`
- `PATCH /admin/reports/:id`

## Plan para construir el backend

La arquitectura recomendada para este proyecto es una API REST monolitica con Express + PostgreSQL. No conviene separar en microservicios todavia porque el producto esta en etapa inicial y necesitan entregar una plataforma funcional, mantenible y facil de desplegar.

Arquitectura objetivo:

```text
frontend-web React
  -> backend Express API
  -> PostgreSQL bd_EcoBazar

backend Express API
  -> Stripe
  -> Google OAuth
  -> Storage de imagenes
```

### Estructura sugerida

Crear un folder `backend/` en la raiz:

```text
backend/
  src/
    app.js
    server.js
    config/
      env.js
      db.js
      stripe.js
      storage.js
    middleware/
      auth.js
      requireRole.js
      errorHandler.js
      upload.js
    routes/
      auth.routes.js
      products.routes.js
      cart.routes.js
      orders.routes.js
      seller.routes.js
      admin.routes.js
      reviews.routes.js
      stripe.routes.js
    controllers/
    services/
    repositories/
    utils/
  package.json
  .env.example
```

Responsabilidades:

- `routes`: define URLs y middlewares.
- `controllers`: recibe request/response y valida entrada basica.
- `services`: contiene reglas de negocio.
- `repositories`: consultas SQL a PostgreSQL.
- `middleware`: autenticacion, roles, errores y subida de archivos.
- `config`: variables de entorno y clientes externos.

### Dependencias recomendadas

Dentro de `backend/`:

```bash
npm init -y
npm install express pg dotenv cors helmet morgan bcrypt jsonwebtoken cookie-parser multer stripe google-auth-library zod
npm install -D nodemon
```

Scripts sugeridos en `backend/package.json`:

```json
{
  "scripts": {
    "dev": "nodemon src/server.js",
    "start": "node src/server.js"
  }
}
```

### Variables de entorno del backend

Crear `backend/.env.example`:

```env
NODE_ENV=development
PORT=3000

DATABASE_URL=postgres://usuario:password@localhost:5432/bd_EcoBazar

FRONTEND_URL=http://localhost:5173

JWT_SECRET=change_me
JWT_EXPIRES_IN=7d

GOOGLE_CLIENT_ID=your_google_client_id

STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

STORAGE_PROVIDER=local
STORAGE_BUCKET=uploads
STORAGE_BASE_PATH=./uploads
```

Nunca subir `.env` real al repositorio.

### Orden correcto de implementacion

#### 1. Base del servidor

Crear Express con:

- `GET /api/health`
- CORS restringido a `FRONTEND_URL`
- `helmet`
- `express.json()`
- `cookie-parser`
- `errorHandler`

Resultado esperado:

```bash
cd backend
npm run dev
```

Debe responder:

```text
GET http://localhost:3000/api/health
```

#### 2. Conexion a PostgreSQL

Crear `config/db.js` usando `pg.Pool`.

Reglas:

- Usar `DATABASE_URL`.
- No abrir conexiones manuales sin cerrarlas.
- Para operaciones multi-tabla, usar transacciones.

Probar con un endpoint temporal o desde `health` que haga:

```sql
SELECT now();
```

#### 3. Autenticacion por email

Endpoints:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

Reglas:

- Hashear contrasenas con `bcrypt`.
- Guardar `password_hash`, nunca password plano.
- Crear JWT firmado con `JWT_SECRET`.
- Guardar sesion en cookie `httpOnly` o enviar token Bearer. Para produccion se recomienda cookie `httpOnly`, `secure`, `sameSite=lax`.
- `GET /api/auth/me` debe devolver datos seguros del usuario, no `password_hash`.

#### 4. Login con Google

Endpoint:

- `POST /api/auth/google`

Flujo:

1. Frontend obtiene `id_token` de Google.
2. Backend valida el token con `google-auth-library` y `GOOGLE_CLIENT_ID`.
3. Backend busca usuario por email o `google_sub`.
4. Si no existe, crea usuario con `auth_provider = 'google'`.
5. Backend genera sesion igual que login normal.

#### 5. Catalogo de productos

Endpoints publicos:

- `GET /api/products`
- `GET /api/products/:id`

Debe devolver:

- producto.
- vendedor.
- bazar si aplica.
- categoria.
- variantes con talla y stock.
- imagenes con URL servible por frontend.

La consulta debe filtrar `products.status = 'active'`.

#### 6. Flujo de vendedor

Endpoints:

- `POST /api/seller/applications`
- `GET /api/seller/me`
- `POST /api/seller/products`
- `PATCH /api/seller/products/:id`
- `POST /api/seller/products/:id/variants`
- `POST /api/seller/products/:id/images`

Reglas:

- Solo vendedores aprobados pueden publicar.
- El producto se crea en `products`.
- Tallas y stock se crean en `product_variants`.
- Imagenes se suben con `multipart/form-data`.
- El backend guarda metadata en `files` y relaciona en `product_images`.

Para local se puede guardar en `backend/uploads`. Para produccion conviene S3, Cloudflare R2 o storage del proveedor.

#### 7. Carrito

Endpoints:

- `GET /api/cart`
- `POST /api/cart/items`
- `PATCH /api/cart/items/:id`
- `DELETE /api/cart/items/:id`

Reglas:

- El frontend manda `variant_id`.
- El backend consulta el producto y valida stock.
- `cart_items.unit_price_cents` debe guardar el precio actual.
- No duplicar una misma variante en el carrito; si ya existe, aumentar cantidad.

#### 8. Checkout y Stripe

Endpoints:

- `POST /api/checkout`
- `POST /api/stripe/webhook`

Flujo:

1. Backend lee carrito del usuario.
2. Valida stock de cada variante.
3. Crea `orders`.
4. Crea `order_items` con snapshot de producto, talla y precio.
5. Crea sesion de Stripe Checkout.
6. Guarda `payments` con `stripe_checkout_session_id`.
7. Devuelve `checkout_url` al frontend.
8. Stripe llama al webhook.
9. Backend valida firma con `STRIPE_WEBHOOK_SECRET`.
10. Si pago fue exitoso, actualiza `payments.status`, `orders.status` y descuenta stock.

El descuento de stock debe hacerse en transaccion para evitar vender mas unidades de las disponibles.

#### 9. Ordenes pickup-only

Endpoints:

- `GET /api/orders`
- `GET /api/orders/:id`
- `PATCH /api/seller/orders/:id/pickup`

Reglas:

- No pedir direccion de envio.
- El vendedor define `pickup_scheduled_at`.
- La direccion de recoleccion se muestra desde `bazaars` o `seller_profiles`.

#### 10. Reviews

Endpoints:

- `POST /api/reviews`
- `GET /api/sellers/:id/reviews`

Reglas:

- Solo compradores autenticados.
- Validar que el pedido pertenece al comprador.
- Validar que el pedido tiene un item del vendedor.
- La tabla `reviews` actualiza automaticamente `seller_profiles.rating_average` con trigger.

#### 11. Admin

Endpoints:

- `GET /api/admin/seller-applications`
- `PATCH /api/admin/seller-applications/:id`
- `GET /api/admin/products`
- `PATCH /api/admin/products/:id/status`
- `GET /api/admin/reports`
- `PATCH /api/admin/reports/:id`

Reglas:

- Proteger con `requireRole('admin')`.
- Registrar acciones importantes en `admin_actions`.

### Integracion del frontend por etapas

No intentes conectar todo al mismo tiempo. Orden recomendado:

1. Crear `frontend-web/src/services/api.js`.
2. Conectar login y registro.
3. Reemplazar `localStorage.usuario` por `GET /auth/me`.
4. Reemplazar `src/data/productos.js` por `GET /products`.
5. Hacer que `ProductoScreen` use variantes reales.
6. Reemplazar carrito en `localStorage` por endpoints.
7. Conectar checkout.
8. Conectar vendedor/admin.

Mientras migran, pueden dejar pantallas no terminadas con mensajes controlados, pero no deben mezclar datos falsos con datos reales en el mismo flujo de compra.

### Seguridad minima para produccion

- Usar HTTPS.
- Usar cookies `httpOnly`, `secure` y `sameSite=lax` para sesion.
- No exponer `DATABASE_URL`, Stripe secret ni Google secret al frontend.
- Validar inputs con `zod`.
- Validar roles en backend.
- Aplicar rate limit a login y registro.
- Limitar tamano y tipo MIME de imagenes.
- Validar webhooks de Stripe con firma.
- Usar transacciones para checkout, pagos y stock.
- Configurar CORS solo para el dominio real.
- Mantener logs sin imprimir passwords, tokens ni secretos.

### Despliegue recomendado

Opcion simple:

- Frontend: Vercel, Netlify o el hosting que prefieran.
- Backend: Render, Railway, Fly.io o VPS.
- Base de datos: PostgreSQL administrado del proveedor.
- Imagenes: Cloudflare R2, S3 o storage compatible.

Variables en produccion:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://...
FRONTEND_URL=https://tudominio.com
JWT_SECRET=...
GOOGLE_CLIENT_ID=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STORAGE_PROVIDER=...
```

Antes de salir a produccion:

```bash
psql "$DATABASE_URL" -f bd_EcoBazar.sql
cd backend
npm install
npm start
cd ../frontend-web
npm install
npm run build
```

Checklist de salida:

- Login email funciona.
- Login Google funciona.
- Productos vienen de la API.
- Imagenes se suben y se muestran.
- Carrito usa `variant_id`.
- Stripe checkout crea orden.
- Webhook confirma pago.
- Stock baja despues del pago exitoso.
- Vendedor puede agendar pickup.
- Cliente puede dejar review.
- Admin puede aprobar vendedores y revisar reportes.

## Resumen de flujo principal

1. Usuario se registra con email o Google.
2. Si quiere vender, crea solicitud en `seller_applications`.
3. Admin aprueba solicitud y se crea/activa `seller_profiles`.
4. Vendedor crea producto en `products`.
5. Vendedor agrega tallas y stock en `product_variants`.
6. Vendedor sube imagenes; backend guarda metadata en `files` y relaciona en `product_images`.
7. Cliente explora productos desde `GET /products`.
8. Cliente elige talla y agrega `variant_id` al carrito.
9. Cliente paga con Stripe.
10. Backend crea orden y payment.
11. Stripe confirma por webhook.
12. Vendedor agenda `pickup_scheduled_at`.
13. Cliente recoge el pedido.
14. Cliente deja review.
15. Trigger actualiza el promedio del vendedor.

## Comandos utiles del frontend

```bash
cd frontend-web
npm install
npm run dev
```

La app normalmente abre en:

```text
http://localhost:5173
```

## Notas para produccion

- No conectar React directo a PostgreSQL.
- No guardar secretos de Stripe, Google ni PostgreSQL en el frontend.
- Usar variables de entorno en el backend.
- Usar HTTPS en dominio real.
- Usar storage privado para imagenes y generar URLs firmadas.
- Validar permisos en backend, aunque la base ya tenga restricciones importantes.
- Usar migraciones cuando el proyecto tenga datos reales; este SQL es la fuente inicial del esquema.
