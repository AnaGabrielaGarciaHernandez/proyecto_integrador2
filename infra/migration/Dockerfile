FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
COPY packages ./packages
COPY services ./services
COPY frontend-web/package*.json ./frontend-web/
COPY scripts ./scripts

RUN npm ci --omit=dev --no-audit --no-fund \
  && mkdir -p /run/secrets \
  && chown node:node /run/secrets

USER node

CMD ["node", "scripts/migrate-all.js"]
