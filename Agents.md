# Agents.md

## Project Overview

**TickBook** is a microservices-based event ticket booking system composed of four services that communicate via REST and Apache Kafka.

## Repository Structure

This is a **monorepo** containing all four microservices:

- `event-service/` – Node.js/Express service for event management
- `user-service/` – Node.js/Express service for user authentication and management
- `booking-service/` – Go service for booking management
- `payment-service/` – Node.js/Express service for payment processing

## Service Details

### Event Service (`event-service/`)
- **Language:** JavaScript (Node.js 20)
- **Framework:** Express.js
- **Database:** PostgreSQL (via `pg` library)
- **Caching:** Redis (via `ioredis`)
- **Messaging:** Kafka producer (via `kafkajs`)
- **Port:** 3001
- **Entry point:** `src/index.js`
- **Build:** `npm ci`
- **Run:** `npm start` or `npm run dev` (with nodemon)

### User Service (`user-service/`)
- **Language:** JavaScript (Node.js 20)
- **Framework:** Express.js
- **Database:** PostgreSQL (via `pg` library)
- **Auth:** JWT (via `jsonwebtoken`), bcryptjs for password hashing
- **Messaging:** Kafka consumer (via `kafkajs`)
- **Port:** 3002
- **Entry point:** `src/index.js`
- **Build:** `npm ci`
- **Run:** `npm start` or `npm run dev` (with nodemon)

### Booking Service (`booking-service/`)
- **Language:** Go 1.22
- **Framework:** gorilla/mux
- **Database:** PostgreSQL (via `lib/pq`)
- **Messaging:** Kafka producer (via `segmentio/kafka-go`)
- **Inter-service calls:** REST to Event Service and User Service
- **Port:** 3003
- **Entry point:** `main.go`
- **Build:** `go build -o booking-service .`
- **Run:** `./booking-service`

### Payment Service (`payment-service/`)
- **Language:** JavaScript (Node.js 20)
- **Framework:** Express.js
- **Database:** PostgreSQL (via `pg` library)
- **Messaging:** Kafka consumer (via `kafkajs`)
- **Inter-service calls:** REST to Booking Service
- **Port:** 3004
- **Entry point:** `src/index.js`
- **Build:** `npm ci`
- **Run:** `npm start` or `npm run dev` (with nodemon)

## Communication Patterns

| From | To | Method | Topic/Endpoint |
|------|----|--------|---------------|
| Booking Service | Event Service | REST GET | `/api/events/{id}/availability` |
| Booking Service | User Service | REST GET | `/api/users/{id}` |
| Booking Service | Payment Service | Kafka | Topic: `bookings` |
| Event Service | (any consumer) | Kafka | Topic: `events` |
| User Service | (Kafka listener) | Kafka | Topic: `bookings` (consumes) |
| Payment Service | Booking Service | REST GET | `/api/bookings/{id}` |

## Development

### Local Development with Docker Compose

```bash
docker compose up --build
```

This starts all four services plus PostgreSQL (4 instances), Redis, Zookeeper, and Kafka.

### Environment Variables

Each service reads configuration from environment variables. See `.env.example` in each service directory.

## CI/CD

GitHub Actions workflows in `.github/workflows/`:
- `event-service-ci.yml` – Build, lint, push Docker image
- `user-service-ci.yml` – Build, lint, push Docker image
- `booking-service-ci.yml` – Build, vet, push Docker image
- `payment-service-ci.yml` – Build, test, push Docker image

## Conventions

- All services expose a `GET /health` endpoint returning `{ "status": "ok" }`
- All services have Swagger/OpenAPI documentation
- Dockerfiles use multi-stage builds with non-root users
- Parameterized queries are used for all database access
- Passwords are never returned in API responses
