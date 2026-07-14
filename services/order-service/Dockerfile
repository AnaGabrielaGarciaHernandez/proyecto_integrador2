FROM node:24-alpine

WORKDIR /app
COPY package*.json ./
COPY packages ./packages
COPY services/order-service ./services/order-service
RUN npm ci --omit=dev --workspace @ecobazar/order-service

USER node
WORKDIR /app/services/order-service
EXPOSE 4004
CMD ["node", "src/server.js"]
