FROM node:24-alpine

WORKDIR /app
COPY package*.json ./
COPY packages ./packages
COPY services/identity-service ./services/identity-service
RUN npm ci --omit=dev --workspace @ecobazar/identity-service

USER node
WORKDIR /app/services/identity-service
EXPOSE 4001
CMD ["node", "src/server.js"]
