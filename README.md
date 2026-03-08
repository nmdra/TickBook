# TickBook

A microservices-based event ticket booking system.

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
                       │ (Spring Boot) │
                       └───────────────┘
```

### Services

| Service | Tech Stack | Port | Database | Description |
|---------|-----------|------|----------|-------------|
| **Event Service** | Node.js / Express | 3001 | PostgreSQL + Redis | Manages events, caching with Redis |
| **User Service** | Node.js / Express | 3002 | PostgreSQL | User registration, authentication (JWT) |
| **Booking Service** | Go / gorilla/mux | 3003 | PostgreSQL | Booking management, REST calls to Event & User services |
| **Payment Service** | Java / Spring Boot | 3004 | PostgreSQL | Payment processing, Kafka consumer for bookings |

### Inter-Service Communication

- **REST (Synchronous):** Booking Service calls Event Service (check availability) and User Service (validate user).
- **Kafka (Asynchronous):** Booking Service publishes to `bookings` topic → Payment Service consumes and creates payments. Event Service publishes to `events` topic.

## Getting Started

### Prerequisites

- Docker & Docker Compose

### Run All Services

```bash
docker compose up --build
```

### Service Endpoints

| Service | URL | Swagger |
|---------|-----|---------|
| Event Service | http://localhost:3001 | http://localhost:3001/api-docs |
| User Service | http://localhost:3002 | http://localhost:3002/api-docs |
| Booking Service | http://localhost:3003 | http://localhost:3003/swagger/ |
| Payment Service | http://localhost:3004 | http://localhost:3004/swagger-ui.html |

### API Quick Reference

#### Event Service
- `GET /api/events` – List events
- `POST /api/events` – Create event
- `GET /api/events/:id` – Get event
- `GET /api/events/:id/availability` – Check ticket availability

#### User Service
- `POST /api/users/register` – Register user
- `POST /api/users/login` – Login (returns JWT)
- `GET /api/users/profile` – Get profile (auth required)

#### Booking Service
- `POST /api/bookings` – Create booking (validates event & user via REST)
- `GET /api/bookings` – List bookings
- `GET /api/bookings/user/{userId}` – Bookings by user

#### Payment Service
- `GET /api/payments` – List payments
- `POST /api/payments` – Create payment
- `GET /api/payments/booking/{bookingId}` – Payments by booking

## CI/CD

Each service has a GitHub Actions workflow that:
1. Runs lint/build checks on pull requests
2. Builds and pushes Docker images to Docker Hub on merge to `main`

Required GitHub Secrets:
- `DOCKER_USERNAME` – Docker Hub username
- `DOCKER_PASSWORD` – Docker Hub access token

## Project Structure

```
TickBook/
├── event-service/          # Node.js – Event management
├── user-service/           # Node.js – User auth & management
├── booking-service/        # Go – Booking management
├── payment-service/        # Spring Boot – Payment processing
├── docker-compose.yml      # Local development orchestration
└── .github/workflows/      # CI/CD pipelines
```

## License

MIT
