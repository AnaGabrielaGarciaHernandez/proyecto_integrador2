FROM node:24-alpine

WORKDIR /app
COPY package*.json ./
COPY packages ./packages
COPY services/api-gateway ./services/api-gateway
RUN npm ci --omit=dev --workspace @ecobazar/api-gateway

USER node
WORKDIR /app/services/api-gateway
EXPOSE 4000
CMD ["node", "src/server.js"]
