FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
COPY packages ./packages
COPY services/cart-service ./services/cart-service

RUN npm ci --omit=dev --workspace @ecobazar/cart-service

USER node
WORKDIR /app/services/cart-service
EXPOSE 4003
CMD ["node", "src/server.js"]
