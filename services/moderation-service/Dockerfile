FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
COPY packages ./packages
COPY services/moderation-service ./services/moderation-service
RUN npm ci --omit=dev --workspace @ecobazar/moderation-service
USER node
WORKDIR /app/services/moderation-service
EXPOSE 4006
CMD ["node", "src/server.js"]
