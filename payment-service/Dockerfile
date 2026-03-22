FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine
WORKDIR /app
RUN addgroup -g 1001 appgroup && adduser -u 1001 -G appgroup -s /bin/sh -D appuser
COPY --from=builder /app/node_modules ./node_modules
COPY src/ ./src/
COPY package.json ./
ENV NODE_ENV=production
USER appuser
EXPOSE 3004
CMD ["node", "src/index.js"]