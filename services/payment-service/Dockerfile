FROM node:24-alpine

WORKDIR /app
COPY package*.json ./
COPY packages ./packages
COPY services/payment-service ./services/payment-service
RUN npm ci --omit=dev --workspace @ecobazar/payment-service

USER node
WORKDIR /app/services/payment-service
EXPOSE 4005
CMD ["node", "src/server.js"]
