# EcoBazar Frontend

Aplicación React 19 y Vite. El navegador se comunica exclusivamente con el API Gateway; nunca debe llamar directamente a un microservicio.

## Variables

```env
VITE_API_URL=http://localhost:4000/api
VITE_GOOGLE_CLIENT_ID=
```

Las sesiones usan cookies HTTP-only, por lo que el cliente HTTP debe conservar `credentials: 'include'`.

## Desarrollo

Desde la raíz del monorepo:

```bash
npm install
npm run dev --workspace=frontend-web
```

O con toda la arquitectura:

```bash
npm run keys:generate
docker compose up --build
```

## Validación

```bash
npm run lint --workspace=frontend-web
npm run build --workspace=frontend-web
```

Las rutas públicas `/api/...` se mantienen estables durante la migración. La distribución entre Identity, Catalog, Cart, Order, Payment y Moderation es responsabilidad del Gateway.
