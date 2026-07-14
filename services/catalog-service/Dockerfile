FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
COPY packages ./packages
COPY services/catalog-service ./services/catalog-service

RUN npm ci --omit=dev --workspace @ecobazar/catalog-service

USER node
WORKDIR /app/services/catalog-service
EXPOSE 4002
CMD ["node", "src/server.js"]
