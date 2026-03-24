# AGENT KNOWLEDGE DOCUMENT
# Domain: Ticket Booking System — Kafka-Based Architecture
# Format: AI Agent Consumable
# Version: 1.0
# Features: [1] Distributed Seat Locking | [8] Multi-Channel Notification Service
# Encoding: UTF-8 | Sections delimited by ### | Lists delimited by - | Types in "quotes"

### SYSTEM_CONTEXT
- "system_name": "TickBook"
- "architecture_style": "microservices"
- "communication_modes":
  - "REST (synchronous)"
  - "Kafka (asynchronous)"
- "services":
  - "event-service"
  - "user-service"
  - "booking-service"
  - "payment-service"

### FEATURE_1_DISTRIBUTED_SEAT_LOCKING
- "goal": "Prevent overselling by placing short-lived distributed locks on seats before payment completion."
- "lock_owner": "booking-service"
- "state_store": "PostgreSQL booking records with lock metadata"
- "optional_cache_acceleration": "Redis-style TTL lock keys (implementation-dependent)"
- "lock_lifecycle":
  - "LOCK_REQUESTED": "Client starts booking for event/seat set."
  - "LOCK_ACQUIRED": "Seats reserved for a bounded TTL window."
  - "LOCK_RELEASED": "Lock is released on timeout, cancellation, or payment failure."
  - "LOCK_CONFIRMED": "Lock is finalized when payment succeeds."
- "consistency_rules":
  - "A seat can have at most one active lock at a time."
  - "Expired locks must be reclaimable without manual intervention."
  - "Final booking confirmation requires successful payment status."
- "failure_handling":
  - "On payment failure, transition booking to cancelled and release lock."
  - "On booking timeout, release lock and mark reservation expired."
  - "On duplicate lock requests, return conflict for already locked seats."

### FEATURE_8_MULTI_CHANNEL_NOTIFICATION_SERVICE
- "goal": "Deliver booking and payment updates to users through multiple channels."
- "notification_channels":
  - "email"
  - "sms"
  - "push"
  - "webhook"
- "event_sources":
  - "booking events from booking-service"
  - "payment status events from payment-service"
  - "event lifecycle updates from event-service"
- "notification_triggers":
  - "booking.created"
  - "booking.confirmed"
  - "booking.cancelled"
  - "payment.succeeded"
  - "payment.failed"
- "delivery_requirements":
  - "At-least-once delivery semantics with idempotent consumers."
  - "Per-channel retry with backoff and dead-letter handling."
  - "Template-driven message content with locale support."
- "user_preferences":
  - "Users can enable/disable channels."
  - "Critical transactional notices may bypass optional marketing preferences."

### KAFKA_EVENT_MODEL
- "topics":
  - "bookings": "Booking domain events for downstream processors."
  - "payments": "Payment outcome events consumed by booking-service."
  - "events": "Event-service lifecycle/publication events."
- "message_schema_guidance":
  - "event_id": "Unique event identifier for idempotency."
  - "event_type": "Domain event type string."
  - "aggregate_id": "Entity identifier (booking_id, payment_id, event_id)."
  - "timestamp": "RFC3339 UTC timestamp."
  - "payload": "Event-specific object."
- "ordering_and_keys":
  - "Use aggregate_id as partition key where ordering per entity matters."
  - "Consumers must be idempotent to handle redelivery."

### SERVICE_RESPONSIBILITIES
- "event-service":
  - "Manage event inventory and publish event updates."
  - "Expose availability read endpoints for booking decisions."
- "user-service":
  - "Manage user identity and authentication."
  - "Provide user data for booking validation and notifications."
- "booking-service":
  - "Coordinate seat locking and booking state transitions."
  - "Publish booking events and consume payment results."
- "payment-service":
  - "Process payment intents/charges."
  - "Publish payment success/failure events."

### OPERATIONAL_GUARDRAILS
- "security":
  - "Use parameterized SQL queries."
  - "Do not expose password hashes in API responses."
  - "Validate JWT for protected user operations."
- "resilience":
  - "Use health endpoints (GET /health)."
  - "Use retries with bounded backoff for transient inter-service failures."
  - "Track failed async deliveries for replay/recovery."
- "observability":
  - "Structured logs with correlation IDs across services."
  - "Capture booking/payment event traces for troubleshooting."

