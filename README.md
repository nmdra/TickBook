# TickBook

A microservices-based event ticket booking system built with **Node.js** and **Go**. TickBook allows users to register, browse events, book tickets, and process payments — all through a distributed architecture that uses REST for synchronous calls and Apache Kafka for asynchronous event streaming.

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Setup Instructions](#setup-instructions)
- [Docker Usage](#docker-usage)
- [API Documentation](#api-documentation)
- [Environment Variables](#environment-variables)
- [Postman Collection](#postman-collection)
- [CI/CD](#cicd)
- [Project Structure](#project-structure)
- [License](#license)

## Project Overview

TickBook is a full-stack ticket booking platform composed of four independently deployable microservices:

- **Event Service** — Create, update, delete, and query events with Redis caching for fast reads.
- **User Service** — Register and authenticate users with JWT-based security.
- **Booking Service** — Book tickets with real-time availability validation across services.
- **Payment Service** — Process payments triggered by booking events via Kafka.

## Tech Stack

| Category | Technologies |
|----------|-------------|
| **Languages** | JavaScript (Node.js 20), Go 1.22+ |
| **Frameworks** | Express.js, gorilla/mux |
| **Databases** | PostgreSQL 17 |
| **Caching** | Redis 7 |
| **Messaging** | Apache Kafka (KRaft mode) |
| **Authentication** | JWT (jsonwebtoken), bcryptjs |
| **API Docs** | Swagger / OpenAPI 3.0 (swagger-jsdoc, swaggo) |
| **Containerization** | Docker, Docker Compose |
| **CI/CD** | GitHub Actions, GitHub Container Registry (GHCR) |

## Architecture

TickBook consists of four microservices that communicate via **REST** (synchronous) and **Apache Kafka** (asynchronous event streaming).

```
┌─────────────┐  REST   ┌──────────────┐  REST   ┌────────────────┐
│ User Service│◄───────►│Booking Service│◄───────►│  Event Service │
│  (Node.js)  │         │    (Go)       │         │   (Node.js)    │
└─────────────┘         └──────┬───────┘         └────────────────┘
                               │                        │
                          Kafka│"bookings"          Kafka│"events"
                               ▼                        ▼
                       ┌───────────────┐
                       │Payment Service│
                       │  (Node.js)    │
                       └───────────────┘
```

### Services

| Service | Tech Stack | Port | Database | Description |
|---------|-----------|------|----------|-------------|
| **Event Service** | Node.js / Express | 3001 | PostgreSQL + Redis | Manages events, caching with Redis |
| **User Service** | Node.js / Express | 3002 | PostgreSQL | User registration, authentication (JWT) |
| **Booking Service** | Go / gorilla/mux | 3003 | PostgreSQL | Booking management, REST calls to Event & User services |
| **Payment Service** | Node.js / Express | 3004 | PostgreSQL | Payment processing, Kafka consumer for bookings |

### Inter-Service Communication

- **REST (Synchronous):** Booking Service calls Event Service (check availability) and User Service (validate user).
- **Kafka (Asynchronous):** Booking Service publishes to `bookings` topic → Payment Service consumes and creates payments. Payment Service publishes payment status updates to `payments` → Booking Service consumes to confirm or cancel bookings. Event Service publishes to `events` topic.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/install/) (for containerized setup)
- [Node.js 20+](https://nodejs.org/) & npm (for Event, User, and Payment services)
- [Go 1.22+](https://go.dev/dl/) (for Booking Service)
- [PostgreSQL 17](https://www.postgresql.org/download/) (if running locally without Docker)
- [Redis 7](https://redis.io/download) (if running locally without Docker)
- [Apache Kafka](https://kafka.apache.org/downloads) (if running locally without Docker)

## Setup Instructions

### Quick Start with Docker (Recommended)

The easiest way to run all services together:

```bash
docker compose up --build
```

This starts all four services along with PostgreSQL (4 instances), Redis, and Kafka. See [Docker Usage](#docker-usage) for more details.

### Running Services Locally

To run individual services outside Docker, ensure PostgreSQL, Redis, and Kafka are available locally.

#### Event Service

```bash
cd event-service
cp .env.example .env        # Edit .env with your local settings
npm ci                      # Install dependencies
npm run dev                 # Start with hot-reload (nodemon)
# or
npm start                   # Start in production mode
```

#### User Service

```bash
cd user-service
cp .env.example .env        # Edit .env with your local settings
npm ci                      # Install dependencies
npm run dev                 # Start with hot-reload (nodemon)
# or
npm start                   # Start in production mode
```

#### Booking Service

```bash
cd booking-service
cp .env.example .env        # Edit .env with your local settings
go mod download             # Download dependencies
go build -o booking-service .
./booking-service           # Start the service
```

#### Payment Service

```bash
cd payment-service
cp .env.example .env        # Edit .env with your local settings
npm ci                      # Install dependencies
npm start                   # Start the service
```

## Docker Usage

### Run All Services

```bash
docker compose up --build
```

### Run in Detached Mode

```bash
docker compose up --build -d
```

### Stop All Services

```bash
docker compose down
```

### Stop and Remove Volumes

```bash
docker compose down -v
```

### Build and Run a Single Service

```bash
# Example: Build and run only the event-service
docker build -t tickbook-event-service ./event-service
docker run -p 3001:3001 \
  -e PORT=3001 \
  -e DB_HOST=localhost \
  -e DB_PORT=5432 \
  -e DB_USER=postgres \
  -e DB_PASSWORD=postgres \
  -e DB_NAME=eventdb \
  -e REDIS_HOST=localhost \
  -e REDIS_PORT=6379 \
  -e KAFKA_BROKERS=localhost:9092 \
  tickbook-event-service
```

### Service URLs (after `docker compose up`)

The nginx gateway proxy exposes a single entry point at `http://localhost:8080` (override with `GATEWAY_PORT`)
and routes `/api/events`, `/api/users`, `/api/bookings`, and `/api/payments` to the corresponding services.

| Service | URL | Swagger |
|---------|-----|---------|
| Gateway (nginx) | http://localhost:8080 | N/A |
| Event Service | http://localhost:3001 | http://localhost:3001/api-docs |
| User Service | http://localhost:3002 | http://localhost:3002/api-docs |
| Booking Service | http://localhost:3003 | http://localhost:3003/swagger/ |
| Payment Service | http://localhost:3004 | http://localhost:3004/api-docs |

## API Documentation

All services expose Swagger/OpenAPI documentation at the URLs listed above. Below is a detailed reference with example requests and responses.

### Event Service (Port 3001)

#### List All Events

```bash
curl http://localhost:3001/api/events
```

Response `200 OK`:
```json
[
  {
    "id": 1,
    "title": "Tech Conference 2025",
    "description": "Annual tech conference",
    "venue": "Convention Center",
    "date": "2025-09-15T09:00:00.000Z",
    "total_tickets": 500,
    "available_tickets": 450,
    "price": 99.99,
    "created_at": "2025-01-10T08:00:00.000Z",
    "updated_at": "2025-01-10T08:00:00.000Z"
  }
]
```

#### Create Event

```bash
curl -X POST http://localhost:3001/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Tech Conference 2025",
    "description": "Annual tech conference",
    "venue": "Convention Center",
    "date": "2025-09-15T09:00:00.000Z",
    "total_tickets": 500,
    "price": 99.99
  }'
```

Response `201 Created`:
```json
{
  "id": 1,
  "title": "Tech Conference 2025",
  "description": "Annual tech conference",
  "venue": "Convention Center",
  "date": "2025-09-15T09:00:00.000Z",
  "total_tickets": 500,
  "available_tickets": 500,
  "price": 99.99,
  "created_at": "2025-01-10T08:00:00.000Z",
  "updated_at": "2025-01-10T08:00:00.000Z"
}
```

#### Get Event by ID

```bash
curl http://localhost:3001/api/events/1
```

#### Update Event

```bash
curl -X PUT http://localhost:3001/api/events/1 \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Tech Conference 2025 - Updated",
    "price": 129.99
  }'
```

#### Delete Event

```bash
curl -X DELETE http://localhost:3001/api/events/1
```

Response `200 OK`:
```json
{
  "message": "Event deleted successfully"
}
```

#### Check Ticket Availability

```bash
curl http://localhost:3001/api/events/1/availability
```

Response `200 OK`:
```json
{
  "id": 1,
  "title": "Tech Conference 2025",
  "available_tickets": 450,
  "total_tickets": 500,
  "is_available": true
}
```

---

### User Service (Port 3002)

#### Register User

```bash
curl -X POST http://localhost:3002/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "securepassword123"
  }'
```

Response `201 Created`:
```json
{
  "id": 1,
  "name": "John Doe",
  "email": "john@example.com",
  "role": "user",
  "created_at": "2025-01-10T08:00:00.000Z",
  "updated_at": "2025-01-10T08:00:00.000Z"
}
```

#### Login

```bash
curl -X POST http://localhost:3002/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "securepassword123"
  }'
```

Response `200 OK`:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user"
  }
}
```

#### Get Profile (Auth Required)

```bash
curl http://localhost:3002/api/users/profile \
  -H "Authorization: Bearer <your-jwt-token>"
```

Response `200 OK`:
```json
{
  "id": 1,
  "name": "John Doe",
  "email": "john@example.com",
  "role": "user",
  "created_at": "2025-01-10T08:00:00.000Z",
  "updated_at": "2025-01-10T08:00:00.000Z"
}
```

#### List All Users

```bash
curl http://localhost:3002/api/users
```

#### Get User by ID

```bash
curl http://localhost:3002/api/users/1
```

#### Update User (Auth Required)

```bash
curl -X PUT http://localhost:3002/api/users/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-jwt-token>" \
  -d '{
    "name": "John Updated"
  }'
```

#### Delete User (Auth Required)

```bash
curl -X DELETE http://localhost:3002/api/users/1 \
  -H "Authorization: Bearer <your-jwt-token>"
```

Response `200 OK`:
```json
{
  "message": "User deleted successfully."
}
```

---

### Booking Service (Port 3003)

#### Create Booking

```bash
curl -X POST http://localhost:3003/api/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "event_id": 1,
    "tickets": 2
  }'
```

Response `201 Created`:
```json
{
  "id": 1,
  "user_id": 1,
  "event_id": 1,
  "tickets": 2,
  "total_amount": 199.98,
  "status": "pending",
  "created_at": "2025-01-10T08:30:00.000Z",
  "updated_at": "2025-01-10T08:30:00.000Z"
}
```

#### List All Bookings

```bash
curl http://localhost:3003/api/bookings
```

#### Get Booking by ID

```bash
curl http://localhost:3003/api/bookings/1
```

#### Update Booking Status

```bash
curl -X PUT http://localhost:3003/api/bookings/1/status \
  -H "Content-Type: application/json" \
  -d '{
    "status": "confirmed"
  }'
```

#### Cancel Booking

```bash
curl -X DELETE http://localhost:3003/api/bookings/1
```

Response `200 OK`:
```json
{
  "message": "Booking cancelled successfully"
}
```

#### Get Bookings by User

```bash
curl http://localhost:3003/api/bookings/user/1
```

---

### Payment Service (Port 3004)

#### List All Payments

```bash
curl http://localhost:3004/api/payments
```

#### Create Payment

```bash
curl -X POST http://localhost:3004/api/payments \
  -H "Content-Type: application/json" \
  -d '{
    "bookingId": 1,
    "userId": 1,
    "amount": 199.98,
    "status": "pending",
    "paymentMethod": "credit_card"
  }'
```

Response `201 Created`:
```json
{
  "id": 1,
  "booking_id": 1,
  "user_id": 1,
  "amount": "199.98",
  "status": "pending",
  "payment_method": "credit_card",
  "created_at": "2025-01-10T08:35:00.000Z",
  "updated_at": "2025-01-10T08:35:00.000Z"
}
```

#### Get Payment by ID

```bash
curl http://localhost:3004/api/payments/1
```

#### Update Payment Status

```bash
curl -X PUT http://localhost:3004/api/payments/1/status \
  -H "Content-Type: application/json" \
  -d '{
    "status": "completed"
  }'
```

#### Get Payments by Booking

```bash
curl http://localhost:3004/api/payments/booking/1
```

---

### Health Check (All Services)

```bash
curl http://localhost:3001/health   # Event Service
curl http://localhost:3002/health   # User Service
curl http://localhost:3003/health   # Booking Service
curl http://localhost:3004/health   # Payment Service
```

Response `200 OK`:
```json
{
  "status": "ok"
}
```

## Environment Variables

Each service reads its configuration from environment variables. Copy the `.env.example` file in each service directory to `.env` and adjust values as needed.

### Event Service

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USER` | PostgreSQL username | `postgres` |
| `DB_PASSWORD` | PostgreSQL password | `postgres` |
| `DB_NAME` | Database name | `eventdb` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `KAFKA_BROKERS` | Kafka broker addresses | `localhost:9092` |

### User Service

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3002` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USER` | PostgreSQL username | `postgres` |
| `DB_PASSWORD` | PostgreSQL password | `postgres` |
| `DB_NAME` | Database name | `userdb` |
| `KAFKA_BROKERS` | Kafka broker addresses | `localhost:9092` |
| `JWT_SECRET` | Secret key for JWT signing | *(required)* |

### Booking Service

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3003` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USER` | PostgreSQL username | `postgres` |
| `DB_PASSWORD` | PostgreSQL password | `postgres` |
| `DB_NAME` | Database name | `bookingdb` |
| `KAFKA_BROKERS` | Kafka broker addresses | `localhost:9092` |
| `KAFKA_PAYMENTS_TOPIC` | Kafka topic for payment status events | `payments` |
| `KAFKA_PAYMENTS_GROUP` | Kafka consumer group for payment events | `booking-service` |
| `EVENT_SERVICE_URL` | Event Service base URL | `http://localhost:3001` |
| `USER_SERVICE_URL` | User Service base URL | `http://localhost:3002` |

### Payment Service

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3004` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USER` | PostgreSQL username | `postgres` |
| `DB_PASSWORD` | PostgreSQL password | `postgres` |
| `DB_NAME` | Database name | `paymentdb` |
| `KAFKA_BROKERS` | Kafka broker addresses | `localhost:9092` |
| `KAFKA_PAYMENTS_TOPIC` | Kafka topic for payment status events | `payments` |
| `BOOKING_SERVICE_URL` | Booking Service base URL | `http://localhost:3003` |

## Postman Collection

A Postman collection is included in the [`postman/`](postman/) directory for easy API testing.

### Import into Postman

1. Open Postman
2. Click **Import** → **Upload Files**
3. Select `postman/collection.json`
4. The collection will appear in your sidebar with all endpoints ready to use

The collection includes all API endpoints with example request bodies and organized by service.

## CI/CD

Each service has a GitHub Actions workflow that:
1. Runs lint/build checks on pull requests
2. Builds and pushes Docker images to GitHub Container Registry (GHCR) on merge to `main` using the repository `GITHUB_TOKEN`

Required permissions/secrets:
- `GITHUB_TOKEN` – must have `packages: write` and `contents: read` permissions (configured in the workflow or repo settings)

## Project Structure

```
TickBook/
├── event-service/          # Node.js – Event management
├── user-service/           # Node.js – User auth & management
├── booking-service/        # Go – Booking management
├── payment-service/        # Node.js – Payment processing
├── postman/                # Postman API collection
├── docker-compose.yml      # Local development orchestration
└── .github/workflows/      # CI/CD pipelines
```

## License

MIT
