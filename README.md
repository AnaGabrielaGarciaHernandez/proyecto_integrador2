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
