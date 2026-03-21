# 🎫 TickBook — Complete Architectural Analysis

> **Analysis Date:** 2026-03-21  
> **Purpose:** Pre-build foundation for a new Python-based Payment Service  
> **Approach:** Read-only, zero modifications

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Project Structure & Domains](#2-project-structure--domains)
3. [API Contracts](#3-api-contracts-crucial-for-integration)
4. [Database & Data Models](#4-database--data-models)
5. [Inter-Service Communication](#5-inter-service-communication)
6. [Security & Authentication](#6-security--authentication)
7. [Configuration Details](#7-configuration-details)
8. [CI/CD & Docker](#8-cicd--docker)
9. [Integration Checklist for Python Rewrite](#9-integration-checklist-for-python-payment-service)

---

## 1. Executive Summary

> **Important:** This is **NOT** a Spring Boot project. TickBook is a polyglot microservices system built with **Node.js/Express** (3 services) and **Go** (1 service). There is no JPA, no Spring Security, no Eureka. The current Payment Service already exists as a Node.js/Express service — the goal is to **rewrite it in Python**.

| Aspect | Current State |
|---|---|
| **Architecture** | 4 microservices in a monorepo |
| **Languages** | JavaScript (Node.js 20) + Go 1.22+ |
| **Databases** | 4 separate PostgreSQL 17 instances (one per service) |
| **Messaging** | Apache Kafka (KRaft mode, no Zookeeper) |
| **Caching** | Redis 7 (Event Service only) |
| **Auth** | JWT (User Service only) |
| **API Docs** | Swagger/OpenAPI 3.0 on each service |
| **Orchestration** | Docker Compose + GitHub Actions CI/CD |

---

## 2. Project Structure & Domains

### 2.1 High-Level Directory Tree

```
TickBook/
├── .github/workflows/
│   └── docker-build-push.yml        # Unified CI/CD pipeline
├── event-service/                    # 📅 Domain: Event Management
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js                 # PostgreSQL pool + schema init
│   │   │   ├── kafka.js              # Kafka PRODUCER
│   │   │   └── redis.js              # Redis cache client
│   │   ├── controllers/
│   │   │   └── eventController.js    # Business logic
│   │   ├── routes/
│   │   │   └── eventRoutes.js        # Route definitions + Swagger annotations
│   │   ├── index.js                  # Express app entrypoint
│   │   └── swagger.js                # Swagger config
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
├── user-service/                     # 👤 Domain: User Auth & Management
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js                 # PostgreSQL pool + schema init
│   │   │   └── kafka.js              # Kafka CONSUMER (bookings topic)
│   │   ├── controllers/
│   │   │   └── userController.js     # Business logic (register, login, CRUD)
│   │   ├── middleware/
│   │   │   └── auth.js               # JWT authentication + admin authorization
│   │   ├── routes/
│   │   │   └── userRoutes.js         # Route definitions + Swagger annotations
│   │   ├── index.js                  # Express app entrypoint
│   │   └── swagger.js                # Swagger config + schema definitions
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
├── booking-service/                  # 🎟️ Domain: Booking Orchestration
│   ├── config/
│   │   └── config.go                 # Env-based config loader
│   ├── database/
│   │   └── db.go                     # PostgreSQL connection + schema init
│   ├── handlers/
│   │   └── booking.go                # HTTP handlers (largest file — 366 lines)
│   ├── kafka/
│   │   └── producer.go               # Kafka PRODUCER (bookings topic)
│   ├── models/
│   │   └── booking.go                # Go structs (Booking, request/response)
│   ├── docs/
│   │   └── swagger.json              # OpenAPI 3.0 spec (static JSON)
│   ├── main.go                       # Mux router entrypoint
│   ├── Dockerfile
│   ├── go.mod / go.sum
│   └── .env.example
├── payment-service/                  # 💳 Domain: Payment Processing (TARGET FOR REWRITE)
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js                 # PostgreSQL pool + schema init
│   │   │   └── kafka.js              # Kafka CONSUMER (bookings topic)
│   │   ├── controllers/
│   │   │   └── paymentController.js  # Business logic
│   │   ├── routes/
│   │   │   └── paymentRoutes.js      # Route definitions + Swagger annotations
│   │   ├── index.js                  # Express app entrypoint
│   │   └── swagger.js                # Swagger config
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
├── postman/
│   └── collection.json               # Pre-built Postman collection (34 KB)
├── docker-compose.yml                # Full stack orchestration
├── docker-bake.hcl                   # Docker Bake build config
├── Agents.md                         # Project overview
└── ARCHITECTURE.md                   # ← THIS FILE
```

### 2.2 Core Business Domains

| Domain | Service | Language | Package Organization |
|---|---|---|---|
| **Event Management** | `event-service` | Node.js/Express | `config/` → `controllers/` → `routes/` |
| **User Auth & Management** | `user-service` | Node.js/Express | `config/` → `middleware/` → `controllers/` → `routes/` |
| **Booking Orchestration** | `booking-service` | Go/Gorilla Mux | `config/` → `database/` → `models/` → `handlers/` → `kafka/` |
| **Payment Processing** | `payment-service` | Node.js/Express | `config/` → `controllers/` → `routes/` |

---

## 3. API Contracts (Crucial for Integration)

### 3.1 Event Service — `http://localhost:3001`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Health check |
| `GET` | `/api/events` | None | List all events (cached in Redis, TTL 60s) |
| `GET` | `/api/events/:id` | None | Get event by ID (cached in Redis, TTL 60s) |
| `GET` | `/api/events/:id/availability` | None | Check ticket availability (used by Booking Service) |
| `POST` | `/api/events` | None | Create a new event |
| `PUT` | `/api/events/:id` | None | Update an event |
| `DELETE` | `/api/events/:id` | None | Delete an event |

#### Key Payloads

**`POST /api/events` — Request:**

```json
{
  "title": "Concert Night",
  "description": "An amazing concert",
  "venue": "Grand Arena",
  "date": "2026-06-15T19:00:00Z",
  "total_tickets": 500,
  "price": 75.00
}
```

> Required fields: `title`, `date`, `total_tickets`, `price`  
> Optional fields: `description`, `venue`

**`POST /api/events` — Response (201):**

```json
{
  "id": 1,
  "title": "Concert Night",
  "description": "An amazing concert",
  "venue": "Grand Arena",
  "date": "2026-06-15T19:00:00.000Z",
  "total_tickets": 500,
  "available_tickets": 500,
  "price": "75.00",
  "created_at": "2026-03-21T06:30:00.000Z",
  "updated_at": "2026-03-21T06:30:00.000Z"
}
```

> ⚠️ **Note:** The `price` field is returned as a **string** (PostgreSQL `DECIMAL` → JS string serialization). The Booking Service handles this with a type-switch when parsing. Your Python service must account for this if it reads event data.

**`PUT /api/events/:id` — Request:**

```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "venue": "New Venue",
  "date": "2026-07-20T20:00:00Z",
  "total_tickets": 600,
  "available_tickets": 550,
  "price": 85.00
}
```

> All fields are optional for partial updates.

**`GET /api/events/:id/availability` — Response (200):**

```json
{
  "id": 1,
  "title": "Concert Night",
  "available_tickets": 498,
  "total_tickets": 500,
  "is_available": true
}
```

**`GET /api/events/:id` — Response (404):**

```json
{
  "error": "Event not found"
}
```

**`DELETE /api/events/:id` — Response (200):**

```json
{
  "message": "Event deleted successfully"
}
```

---

### 3.2 User Service — `http://localhost:3002`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Health check |
| `POST` | `/api/users/register` | None | Register new user |
| `POST` | `/api/users/login` | None | Login → receive JWT token |
| `GET` | `/api/users/profile` | 🔒 JWT | Get current user profile |
| `GET` | `/api/users` | 🔒 JWT + Admin | List all users |
| `GET` | `/api/users/:id` | None | Get user by ID (public info, no password) |
| `PUT` | `/api/users/:id` | 🔒 JWT | Update user (own profile or admin) |
| `DELETE` | `/api/users/:id` | 🔒 JWT | Delete user (own account or admin) |

#### Key Payloads

**`POST /api/users/register` — Request:**

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword123",
  "role": "user"
}
```

> Required fields: `name`, `email`, `password`  
> Optional: `role` (defaults to `"user"`)

**`POST /api/users/register` — Response (201):**

```json
{
  "id": 1,
  "name": "John Doe",
  "email": "john@example.com",
  "role": "user",
  "created_at": "2026-03-21T06:30:00.000Z",
  "updated_at": "2026-03-21T06:30:00.000Z"
}
```

> **Note:** Passwords are **never** returned in API responses. The `password` column is excluded from all SELECT queries except internal login validation.

**`POST /api/users/register` — Response (409 — Duplicate Email):**

```json
{
  "error": "Email already registered."
}
```

**`POST /api/users/login` — Request:**

```json
{
  "email": "john@example.com",
  "password": "securepassword123"
}
```

**`POST /api/users/login` — Response (200):**

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

**`POST /api/users/login` — Response (401):**

```json
{
  "error": "Invalid email or password."
}
```

**`GET /api/users/:id` — Response (200):**

```json
{
  "id": 1,
  "name": "John Doe",
  "email": "john@example.com",
  "role": "user",
  "created_at": "2026-03-21T06:30:00.000Z",
  "updated_at": "2026-03-21T06:30:00.000Z"
}
```

**`PUT /api/users/:id` — Request:**

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "newpassword456",
  "role": "admin"
}
```

> All fields are optional. The `role` field can only be changed by an admin.

**`DELETE /api/users/:id` — Response (200):**

```json
{
  "message": "User deleted successfully."
}
```

**Auth Error Responses:**

```json
// 401 — No token or invalid token
{ "error": "Access denied. No token provided." }
{ "error": "Invalid or expired token." }

// 403 — Insufficient role
{ "error": "Access denied. Admin role required." }
{ "error": "You can only update your own profile." }
{ "error": "You can only delete your own account." }
```

---

### 3.3 Booking Service — `http://localhost:3003`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Health check |
| `GET` | `/api/bookings` | None | List all bookings |
| `GET` | `/api/bookings/:id` | None | Get booking by ID (called by Payment Service) |
| `POST` | `/api/bookings` | None | Create a booking (validates user + event first) |
| `PUT` | `/api/bookings/:id/status` | None | Update booking status |
| `DELETE` | `/api/bookings/:id` | None | Cancel booking (soft-delete → `status='cancelled'`) |
| `GET` | `/api/bookings/user/:userId` | None | Get all bookings by user ID |

#### Key Payloads

**`POST /api/bookings` — Request:**

```json
{
  "user_id": 1,
  "event_id": 10,
  "tickets": 2
}
```

> All three fields are required and must be positive integers.

**`POST /api/bookings` — Response (201):**

```json
{
  "id": 1,
  "user_id": 1,
  "event_id": 10,
  "tickets": 2,
  "total_amount": 150.00,
  "status": "pending",
  "created_at": "2026-03-21T06:30:00Z",
  "updated_at": "2026-03-21T06:30:00Z"
}
```

> The `total_amount` is auto-calculated as `event.price × tickets`.

**`POST /api/bookings` — Response (400 — Validation Failures):**

```json
{ "error": "user_id, event_id, and tickets must be positive integers" }
{ "error": "User validation failed: resource not found" }
{ "error": "Event availability check failed: not enough tickets available (requested: 5, available: 2)" }
```

**`PUT /api/bookings/:id/status` — Request:**

```json
{
  "status": "confirmed"
}
```

> Valid statuses: `pending`, `confirmed`, `cancelled`

**`PUT /api/bookings/:id/status` — Response (200):**

```json
{
  "id": 1,
  "user_id": 1,
  "event_id": 10,
  "tickets": 2,
  "total_amount": 150.00,
  "status": "confirmed",
  "created_at": "2026-03-21T06:30:00Z",
  "updated_at": "2026-03-21T06:35:00Z"
}
```

**`DELETE /api/bookings/:id` — Response (200):**

```json
{
  "message": "Booking cancelled successfully"
}
```

> Note: DELETE does NOT remove the row. It sets `status = 'cancelled'` (soft delete).

**`GET /api/bookings/:id` — Response (200):**

```json
{
  "id": 1,
  "user_id": 1,
  "event_id": 10,
  "tickets": 2,
  "total_amount": 150.00,
  "status": "pending",
  "created_at": "2026-03-21T06:30:00Z",
  "updated_at": "2026-03-21T06:30:00Z"
}
```

**`GET /api/bookings/user/:userId` — Response (200):**

```json
[
  {
    "id": 1,
    "user_id": 1,
    "event_id": 10,
    "tickets": 2,
    "total_amount": 150.00,
    "status": "pending",
    "created_at": "2026-03-21T06:30:00Z",
    "updated_at": "2026-03-21T06:30:00Z"
  }
]
```

> Returns an empty array `[]` if the user has no bookings.

---

### 3.4 Payment Service — `http://localhost:3004` (Current Node.js — Target for Python Rewrite)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Health check |
| `GET` | `/api/payments` | None | List all payments |
| `GET` | `/api/payments/:id` | None | Get payment by ID |
| `POST` | `/api/payments` | None | Create a payment (validates booking via REST) |
| `PUT` | `/api/payments/:id/status` | None | Update payment status |
| `GET` | `/api/payments/booking/:bookingId` | None | Get payments by booking ID |

#### Key Payloads

**`POST /api/payments` — Request:**

```json
{
  "bookingId": 1,
  "userId": 42,
  "amount": 150.00,
  "status": "pending",
  "paymentMethod": "credit_card"
}
```

> Required fields: `bookingId`, `userId`, `amount`  
> Optional: `status` (defaults to `"pending"`), `paymentMethod` (defaults to `null`)  
> ⚠️ **Uses camelCase** in request body but **snake_case** in DB and response!

**`POST /api/payments` — Response (201):**

```json
{
  "id": 1,
  "booking_id": 1,
  "user_id": 42,
  "amount": "150.00",
  "status": "pending",
  "payment_method": "credit_card",
  "created_at": "2026-03-21T06:30:00.000Z",
  "updated_at": "2026-03-21T06:30:00.000Z"
}
```

> Note: `amount` is returned as a **string** (PostgreSQL DECIMAL serialization).

**`POST /api/payments` — Response (500 — Booking validation failure):**

```json
{
  "error": "Booking validation failed for id: 999"
}
```

**`PUT /api/payments/:id/status` — Request:**

```json
{
  "status": "completed"
}
```

> Valid statuses: `pending`, `completed`, `failed`, `refunded`

**`PUT /api/payments/:id/status` — Response (200):**

```json
{
  "id": 1,
  "booking_id": 1,
  "user_id": 42,
  "amount": "150.00",
  "status": "completed",
  "payment_method": "credit_card",
  "created_at": "2026-03-21T06:30:00.000Z",
  "updated_at": "2026-03-21T06:35:00.000Z"
}
```

**`PUT /api/payments/:id/status` — Response (400):**

```json
{ "error": "Status is required" }
{ "error": "Invalid status. Must be: pending, completed, failed, or refunded" }
```

**`GET /api/payments/booking/:bookingId` — Response (200):**

```json
[
  {
    "id": 1,
    "booking_id": 1,
    "user_id": 42,
    "amount": "150.00",
    "status": "completed",
    "payment_method": "credit_card",
    "created_at": "2026-03-21T06:30:00.000Z",
    "updated_at": "2026-03-21T06:35:00.000Z"
  }
]
```

> Returns an empty array `[]` if no payments exist for the booking.

**All services — Standard Error format:**

```json
{
  "error": "Description of the error"
}
```

---

## 4. Database & Data Models

### 4.1 Database Architecture

Each service has its own **isolated PostgreSQL 17** instance (Database-per-Service pattern). There are **no foreign keys** between service databases — referential integrity is maintained at the application level via REST calls.

| Service | Database Name | Docker Host | Host Port | Internal Port |
|---|---|---|---|---|
| Event Service | `eventdb` | `postgres-event` | `5433` | `5432` |
| User Service | `userdb` | `postgres-user` | `5434` | `5432` |
| Booking Service | `bookingdb` | `postgres-booking` | `5435` | `5432` |
| Payment Service | `paymentdb` | `postgres-payment` | `5436` | `5432` |

All databases use the same credentials: `postgres` / `postgres`.

### 4.2 Table Schemas (Exact DDL)

#### `events` table (in `eventdb`)

```sql
CREATE TABLE IF NOT EXISTS events (
  id                SERIAL PRIMARY KEY,
  title             VARCHAR(255) NOT NULL,
  description       TEXT,
  venue             VARCHAR(255),
  date              TIMESTAMP NOT NULL,
  total_tickets     INTEGER NOT NULL,
  available_tickets INTEGER NOT NULL,
  price             DECIMAL(10,2) NOT NULL,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW()
);
```

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `SERIAL` | PK, auto-increment | |
| `title` | `VARCHAR(255)` | NOT NULL | |
| `description` | `TEXT` | nullable | |
| `venue` | `VARCHAR(255)` | nullable | |
| `date` | `TIMESTAMP` | NOT NULL | Event date/time |
| `total_tickets` | `INTEGER` | NOT NULL | Must be > 0 |
| `available_tickets` | `INTEGER` | NOT NULL | Set = `total_tickets` on creation |
| `price` | `DECIMAL(10,2)` | NOT NULL | Must be > 0, returned as string in JSON |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | |
| `updated_at` | `TIMESTAMP` | DEFAULT NOW() | Manually set on update |

---

#### `users` table (in `userdb`)

```sql
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  email      VARCHAR(255) UNIQUE NOT NULL,
  password   VARCHAR(255) NOT NULL,
  role       VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `SERIAL` | PK, auto-increment | |
| `name` | `VARCHAR(255)` | NOT NULL | |
| `email` | `VARCHAR(255)` | UNIQUE, NOT NULL | |
| `password` | `VARCHAR(255)` | NOT NULL | bcrypt hash (salt rounds = 10) |
| `role` | `VARCHAR(50)` | DEFAULT `'user'` | `'user'` or `'admin'` |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | |
| `updated_at` | `TIMESTAMP` | DEFAULT NOW() | Manually set on update |

---

#### `bookings` table (in `bookingdb`)

```sql
CREATE TABLE IF NOT EXISTS bookings (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL,
  event_id     INTEGER NOT NULL,
  tickets      INTEGER NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  status       VARCHAR(50) DEFAULT 'pending',
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);
```

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `SERIAL` | PK, auto-increment | |
| `user_id` | `INTEGER` | NOT NULL | References `users.id` (no FK constraint) |
| `event_id` | `INTEGER` | NOT NULL | References `events.id` (no FK constraint) |
| `tickets` | `INTEGER` | NOT NULL | Number of tickets booked |
| `total_amount` | `DECIMAL(10,2)` | NOT NULL | `event.price × tickets` |
| `status` | `VARCHAR(50)` | DEFAULT `'pending'` | `'pending'`, `'confirmed'`, `'cancelled'` |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | |
| `updated_at` | `TIMESTAMP` | DEFAULT NOW() | Manually set on update |

---

#### `payments` table (in `paymentdb`) — YOUR TABLE TO RECREATE

```sql
CREATE TABLE IF NOT EXISTS payments (
  id              SERIAL PRIMARY KEY,
  booking_id      INTEGER NOT NULL,
  user_id         INTEGER NOT NULL,
  amount          DECIMAL(10,2) NOT NULL,
  status          VARCHAR(50) DEFAULT 'pending',
  payment_method  VARCHAR(100) DEFAULT 'pending_selection',
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);
```

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `SERIAL` | PK, auto-increment | |
| `booking_id` | `INTEGER` | NOT NULL | References `bookings.id` (no FK constraint) |
| `user_id` | `INTEGER` | NOT NULL | References `users.id` (no FK constraint) |
| `amount` | `DECIMAL(10,2)` | NOT NULL | Returned as string in JSON |
| `status` | `VARCHAR(50)` | DEFAULT `'pending'` | `'pending'`, `'completed'`, `'failed'`, `'refunded'` |
| `payment_method` | `VARCHAR(100)` | DEFAULT `'pending_selection'` | e.g., `credit_card`, `paypal` |
| `created_at` | `TIMESTAMP` | DEFAULT NOW() | |
| `updated_at` | `TIMESTAMP` | DEFAULT NOW() | Manually set on update |

---

### 4.3 Entity Relationships (Logical — No FK Constraints)

```
┌──────────┐       ┌──────────────┐       ┌──────────────┐
│  USERS   │       │   BOOKINGS   │       │   PAYMENTS   │
│──────────│       │──────────────│       │──────────────│
│ id (PK)  │◄──┐   │ id (PK)      │◄──┐   │ id (PK)      │
│ name     │   └───│ user_id      │   └───│ booking_id   │
│ email    │       │ event_id     │───┐   │ user_id      │
│ password │       │ tickets      │   │   │ amount       │
│ role     │       │ total_amount │   │   │ status       │
│ ...      │       │ status       │   │   │ payment_meth │
└──────────┘       │ ...          │   │   │ ...          │
                   └──────────────┘   │   └──────────────┘
                                      │
┌──────────┐                          │
│  EVENTS  │                          │
│──────────│                          │
│ id (PK)  │◄─────────────────────────┘
│ title    │
│ desc     │
│ venue    │
│ date     │
│ tickets  │
│ price    │
│ ...      │
└──────────┘

Relationships (all validated via REST, no DB-level FK):
  USERS   ──1:N──  BOOKINGS   (one user creates many bookings)
  EVENTS  ──1:N──  BOOKINGS   (one event has many bookings)
  BOOKINGS ──1:N── PAYMENTS   (one booking generates many payments)
```

---

## 5. Inter-Service Communication

### 5.1 Communication Overview

The system uses **BOTH** synchronous REST calls and asynchronous Kafka messaging:

```
╔════════════════════════════════════════════════════════════════╗
║               SYNCHRONOUS REST CALLS                          ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  Booking Service ──GET /api/events/{id}/availability──► Event  ║
║  Booking Service ──GET /api/events/{id}──────────────► Event   ║
║  Booking Service ──GET /api/users/{id}───────────────► User    ║
║  Payment Service ──GET /api/bookings/{id}────────────► Booking ║
║                                                                ║
╠════════════════════════════════════════════════════════════════╣
║              ASYNCHRONOUS KAFKA MESSAGES                       ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  Event Service ─PRODUCE─► Topic: "events"                      ║
║     Keys: event.created, event.updated, event.deleted          ║
║                                                                ║
║  Booking Service ─PRODUCE─► Topic: "bookings"                  ║
║     Keys: booking.created, booking.cancelled                   ║
║                                                                ║
║  User Service ◄─CONSUME── Topic: "bookings"                    ║
║     Group: user-service-group (logs only, no processing)       ║
║                                                                ║
║  Payment Service ◄─CONSUME── Topic: "bookings"                 ║
║     Group: payment-service (creates payment records)           ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
```

### 5.2 Synchronous REST Call Details

| Caller | Target | Method | Endpoint | Purpose | Timeout |
|---|---|---|---|---|---|
| Booking Service | Event Service | GET | `/api/events/{id}/availability` | Verify tickets available | 5s |
| Booking Service | Event Service | GET | `/api/events/{id}` | Fetch event price | 5s |
| Booking Service | User Service | GET | `/api/users/{id}` | Validate user exists | 5s |
| **Payment Service** | **Booking Service** | **GET** | **`/api/bookings/{id}`** | **Validate booking exists** | **default** |

Implementation details:
- **Booking Service** uses Go's `net/http.Client` with explicit 5-second timeout
- **Payment Service** uses Node.js native `fetch()` (no explicit timeout)
- **No circuit breaker** or retry logic on any service
- **No service registry** — URLs configured via environment variables

### 5.3 Kafka Configuration

**Broker:** `kafka:29092` (internal Docker) / `localhost:9092` (external)  
**Mode:** KRaft (no Zookeeper)  
**Client Libraries:**
- Event Service & User Service & Payment Service: `kafkajs` v2.2.4
- Booking Service: `segmentio/kafka-go` v0.4.50

### 5.4 Kafka Topics & Message Schemas

#### Topic: `events` (Producer: Event Service)

| Key | Trigger | Payload Structure |
|---|---|---|
| `event.created` | `POST /api/events` | Full event object from DB |
| `event.updated` | `PUT /api/events/:id` | Full event object from DB |
| `event.deleted` | `DELETE /api/events/:id` | `{ "id": <eventId> }` |

**Example `event.created` message:**

```json
{
  "id": 1,
  "title": "Concert Night",
  "description": "An amazing concert",
  "venue": "Grand Arena",
  "date": "2026-06-15T19:00:00.000Z",
  "total_tickets": 500,
  "available_tickets": 500,
  "price": "75.00",
  "created_at": "2026-03-21T06:30:00.000Z",
  "updated_at": "2026-03-21T06:30:00.000Z"
}
```

> Currently no service consumes the `events` topic.

---

#### Topic: `bookings` (Producer: Booking Service)

| Key | Trigger | Payload Structure |
|---|---|---|
| `booking.created` | `POST /api/bookings` | `KafkaBookingEvent` struct |
| `booking.cancelled` | `DELETE /api/bookings/:id` | `KafkaBookingEvent` struct |

**Actual `booking.created` message produced by Booking Service (Go):**

```json
{
  "event_type": "booking.created",
  "booking_id": 1,
  "user_id": 42,
  "event_id": 10,
  "tickets": 2,
  "amount": 150.00,
  "status": "pending"
}
```

> ⚠️ **CRITICAL BUG:** The Payment Service Kafka consumer expects a **different format** than what the Booking Service actually produces. See section 5.5 below.

---

### 5.5 Known Bug: Kafka Message Format Mismatch

**What the Booking Service PRODUCES** (from `models/booking.go` → `KafkaBookingEvent`):

```json
{
  "event_type": "booking.created",
  "booking_id": 1,
  "user_id": 42,
  "event_id": 10,
  "tickets": 2,
  "amount": 150.00,
  "status": "pending"
}
```

**What the Payment Service EXPECTS** (from `config/kafka.js` consumer):

```json
{
  "type": "booking.created",
  "data": {
    "bookingId": 1,
    "userId": 42,
    "totalPrice": 150.00
  }
}
```

| Field | Producer (Go) | Consumer (Node.js) | Status |
|---|---|---|---|
| Event type identifier | `event_type` | `type` | ❌ MISMATCH |
| Booking ID | `booking_id` (flat) | `data.bookingId` (nested) | ❌ MISMATCH |
| User ID | `user_id` (flat) | `data.userId` (nested) | ❌ MISMATCH |
| Amount | `amount` (flat) | `data.totalPrice` (nested) | ❌ MISMATCH |

**Impact:** The Payment Service Kafka consumer will **silently fail** to create payment records from Kafka events. The `booking.created` events will be logged as `Ignoring event of type: ` (empty string, because `value.type` is `undefined`).

**Fix for Python rewrite:** Use the **actual producer format** (flat structure with `event_type`, `booking_id`, `user_id`, `amount`).

---

### 5.6 Kafka Consumer Groups

| Service | Group ID | Topic | `fromBeginning` | Behavior |
|---|---|---|---|---|
| User Service | `user-service-group` | `bookings` | `false` | Logs messages only (no business logic) |
| Payment Service | `payment-service` | `bookings` | `true` | Creates payment records on `booking.created` |

---

## 6. Security & Authentication

### 6.1 JWT Authentication (User Service Only)

| Setting | Value |
|---|---|
| **Library** | `jsonwebtoken` v9.0.2 |
| **Password Hashing** | `bcryptjs` (salt rounds = 10) |
| **Token Lifetime** | 24 hours |
| **Algorithm** | HS256 (default) |
| **Secret** | `JWT_SECRET` env variable |
| **Default Secret** | `your-secret-key-change-in-production` |

**JWT Payload Structure:**

```json
{
  "id": 1,
  "email": "john@example.com",
  "role": "user",
  "iat": 1711000000,
  "exp": 1711086400
}
```

### 6.2 Auth Middleware Implementation

Location: `user-service/src/middleware/auth.js`

**`authenticate` middleware:**
1. Reads `Authorization` header
2. Expects format: `Bearer <JWT_TOKEN>`
3. Verifies token with `jwt.verify(token, JWT_SECRET)`
4. Attaches decoded payload to `req.user`
5. Returns `401` if no token, invalid, or expired

**`authorizeAdmin` middleware:**
1. Checks `req.user.role === 'admin'`
2. Returns `403` if not admin

### 6.3 Route Protection Matrix

| Service | Endpoint | Auth Required |
|---|---|---|
| Event Service | All endpoints | ❌ None |
| User Service | `POST /register` | ❌ None |
| User Service | `POST /login` | ❌ None |
| User Service | `GET /:id` | ❌ None |
| User Service | `GET /profile` | ✅ JWT |
| User Service | `GET /` (list all) | ✅ JWT + Admin |
| User Service | `PUT /:id` | ✅ JWT (own or admin) |
| User Service | `DELETE /:id` | ✅ JWT (own or admin) |
| Booking Service | All endpoints | ❌ None |
| Payment Service | All endpoints | ❌ None |

### 6.4 Security Gaps

| # | Gap | Risk |
|---|---|---|
| 1 | **Event Service** has zero authentication | Anyone can create/update/delete events |
| 2 | **Booking Service** has zero authentication | Anyone can create/cancel bookings |
| 3 | **Payment Service** has zero authentication | Anyone can create payments and change statuses |
| 4 | `GET /api/users/:id` is public | Needed for inter-service validation |
| 5 | No API Gateway | All services directly exposed |
| 6 | No service-to-service auth | REST calls between services have no auth headers |
| 7 | JWT secret is hardcoded as fallback | Default secret in code if env var not set |

---

## 7. Configuration Details

### 7.1 Service Port Mapping

| Service | Application Port | Docker Host Port | Swagger Docs URL |
|---|---|---|---|
| Event Service | `3001` | `3001` | `http://localhost:3001/api-docs` |
| User Service | `3002` | `3002` | `http://localhost:3002/api-docs` |
| Booking Service | `3003` | `3003` | `http://localhost:3003/swagger/` |
| Payment Service | `3004` | `3004` | `http://localhost:3004/api-docs` |

> Note: Booking Service uses a different Swagger path (`/swagger/`) because it uses `swaggo/http-swagger` (Go) instead of `swagger-ui-express` (Node.js).

### 7.2 Environment Variables — Complete Reference

#### Common (All Services)

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP server port | Service-specific |
| `DB_HOST` | PostgreSQL hostname | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USER` | PostgreSQL username | `postgres` |
| `DB_PASSWORD` | PostgreSQL password | `postgres` |
| `DB_NAME` | PostgreSQL database name | Service-specific |
| `KAFKA_BROKERS` | Kafka broker address(es), comma-separated | `localhost:9092` |

#### Event Service Specific

| Variable | Description | Default |
|---|---|---|
| `PORT` | | `3001` |
| `DB_NAME` | | `eventdb` |
| `REDIS_HOST` | Redis hostname | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |

#### User Service Specific

| Variable | Description | Default |
|---|---|---|
| `PORT` | | `3002` |
| `DB_NAME` | | `userdb` |
| `JWT_SECRET` | JWT signing secret key | `your-secret-key-change-in-production` |

#### Booking Service Specific

| Variable | Description | Default |
|---|---|---|
| `PORT` | | `3003` |
| `DB_NAME` | | `bookingdb` |
| `EVENT_SERVICE_URL` | Event Service base URL | `http://localhost:3001` |
| `USER_SERVICE_URL` | User Service base URL | `http://localhost:3002` |

#### Payment Service Specific

| Variable | Description | Default |
|---|---|---|
| `PORT` | | `3004` |
| `DB_NAME` | | `paymentdb` |
| `BOOKING_SERVICE_URL` | Booking Service base URL | `http://localhost:3003` |

### 7.3 Docker Compose Infrastructure

**PostgreSQL Instances:**

| Container | Image | Database | Host Port |
|---|---|---|---|
| `postgres-event` | `postgres:17-alpine` | `eventdb` | `5433` |
| `postgres-user` | `postgres:17-alpine` | `userdb` | `5434` |
| `postgres-booking` | `postgres:17-alpine` | `bookingdb` | `5435` |
| `postgres-payment` | `postgres:17-alpine` | `paymentdb` | `5436` |

**Kafka (KRaft mode):**

| Setting | Value |
|---|---|
| Image | `confluentinc/cp-kafka:8.2.0` |
| Internal Listener | `kafka:29092` (PLAINTEXT) |
| External Listener | `localhost:9092` (PLAINTEXT_HOST) |
| Controller | `kafka:9093` |
| Node ID | 1 |
| Cluster ID | `MkU3OEVBNTcwNTJENDM2Qk` |

**Redis:**

| Setting | Value |
|---|---|
| Image | `redis:7-alpine` |
| Port | `6379:6379` |
| Used By | Event Service only |

**Docker Network:** `microservices-net` (bridge driver)

**Volumes:** `pg_event_data`, `pg_user_data`, `pg_booking_data`, `pg_payment_data`, `kafka_data`

### 7.4 Service Dependencies (docker-compose `depends_on`)

```
event-service    → postgres-event, redis, kafka
user-service     → postgres-user, kafka
booking-service  → postgres-booking, kafka, event-service, user-service
payment-service  → postgres-payment, kafka, booking-service
```

---

## 8. CI/CD & Docker

### 8.1 Dockerfile Patterns

All services use **multi-stage builds** with **non-root users**.

**Node.js Services (Event, User, Payment):**

```dockerfile
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
EXPOSE <PORT>
CMD ["node", "src/index.js"]
```

**Go Service (Booking):**

```dockerfile
FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o booking-service .

FROM alpine:3.19
WORKDIR /app
RUN addgroup -g 1001 appgroup && adduser -u 1001 -G appgroup -s /bin/sh -D appuser
COPY --from=builder /app/booking-service .
COPY docs/ ./docs/
ENV GIN_MODE=release
USER appuser
EXPOSE 3003
CMD ["./booking-service"]
```

### 8.2 CI/CD Pipeline

**File:** `.github/workflows/docker-build-push.yml`  
**Triggers:** Push to `main` or `Development`, version tags (`v*`), manual dispatch

**Pipeline Steps:**

```
1. Detect Changed Services (dorny/paths-filter)
      ↓
2. FOR EACH changed service:
   a. Checkout repository
   b. Lint Dockerfile (Hadolint)
   c. Build Docker image (docker-bake.hcl)
   d. Security scan (Snyk → SARIF report)
   e. Login to GitHub Container Registry (GHCR)
   f. Push image to ghcr.io/<repo>/<service>:<tag>
```

**Image Registry:** `ghcr.io/nmdra/tickbook/<service-name>`

**Tagging Strategy:**
- Version tags: `v1.0.0` → tagged as `v1.0.0`
- Branch pushes: tagged as `latest`
- All builds: also tagged with `sha-<7chars>`
- PR builds: tagged as `pr-<number>` (not pushed)

**Caching:** GitHub Actions cache (`type=gha`) per service scope

---

## 9. Integration Checklist for Python Payment Service

### ✅ Must Implement

| # | Requirement | Details |
|---|---|---|
| 1 | **6 REST API endpoints** | Same URLs under `/api/payments/*` (see §3.4) |
| 2 | **Health check** | `GET /health` → `{"status": "ok"}` |
| 3 | **PostgreSQL `payments` table** | Same schema as §4.2 — auto-create on startup with `CREATE TABLE IF NOT EXISTS` |
| 4 | **Kafka consumer** | Subscribe to `bookings` topic, group ID `payment-service`, handle `booking.created` events |
| 5 | **REST client** | Call `GET http://<BOOKING_SERVICE_URL>/api/bookings/{id}` to validate bookings |
| 6 | **Swagger/OpenAPI docs** | Expose at `/api-docs` |
| 7 | **Port 3004** | Match existing deployment config |
| 8 | **Environment variables** | Same env vars as current service (see §7.2) |
| 9 | **`BOOKING_SERVICE_URL`** | Must be configurable via env (default `http://localhost:3003`) |
| 10 | **Docker multi-stage build** | Python + Alpine, non-root user (`appuser:1001`), `EXPOSE 3004` |

### ⚠️ Known Issues to Fix in Rewrite

| # | Issue | Root Cause | Recommendation |
|---|---|---|---|
| 1 | **Kafka message format mismatch** | Producer sends `event_type` + flat fields; consumer expects `type` + nested `data` | Fix consumer to read actual producer format |
| 2 | **camelCase/snake_case inconsistency** | Request body uses `bookingId`; DB/response uses `booking_id` | Pick one convention (Pythonic = snake_case everywhere) |
| 3 | **No authentication** | Payment endpoints are open | Consider adding JWT middleware |
| 4 | **No request timeout** | `fetch()` call to Booking Service has no timeout | Add timeout (e.g., 5 seconds like Booking Service) |

### 🐍 Recommended Python Technology Stack

| Component | Recommended Library | Alternative |
|---|---|---|
| Web Framework | **FastAPI** | Flask |
| PostgreSQL Driver | **asyncpg** (async) | psycopg2 (sync) |
| ORM (optional) | **SQLAlchemy 2.0** | raw SQL |
| Kafka Consumer | **aiokafka** (async) | confluent-kafka-python |
| HTTP Client | **httpx** (async) | requests (sync) |
| API Documentation | Built-in with FastAPI | flask-restx for Flask |
| Environment Config | **pydantic-settings** | python-dotenv |
| Docker Base Image | **python:3.12-slim** | python:3.12-alpine |

### 📦 Minimal `requirements.txt`

```
fastapi==0.111.0
uvicorn[standard]==0.30.0
asyncpg==0.29.0
aiokafka==0.10.0
httpx==0.27.0
pydantic-settings==2.3.0
```

---

*This document was auto-generated by analyzing the TickBook source code. No files were modified during this analysis.*
