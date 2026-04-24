FROM node:25-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build

FROM node:25-alpine
WORKDIR /app
RUN addgroup -g 1001 appgroup && adduser -u 1001 -G appgroup -s /bin/sh -D appuser
COPY package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
COPY public ./public
ENV NODE_ENV=production
USER appuser
EXPOSE 3002
CMD ["node", "dist/index.js"]
