package models

import "time"

type Booking struct {
	ID          int       `json:"id"`
	UserID      int       `json:"user_id"`
	EventID     int       `json:"event_id"`
	SeatID      string    `json:"seat_id,omitempty"`
	Tickets     int       `json:"tickets"`
	TotalAmount float64   `json:"total_amount"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CreateBookingRequest struct {
	UserID       int    `json:"user_id"`
	EventID      int    `json:"event_id"`
	SeatID       string `json:"seat_id"`
	SessionToken string `json:"session_token"`
	Tickets      int    `json:"tickets"`
}

type UpdateStatusRequest struct {
	Status string `json:"status"`
}

type KafkaBookingEvent struct {
	EventType string  `json:"event_type"`
	BookingID int     `json:"booking_id"`
	UserID    int     `json:"user_id"`
	EventID   int     `json:"event_id"`
	SeatID    string  `json:"seat_id,omitempty"`
	Tickets   int     `json:"tickets"`
	Amount    float64 `json:"amount"`
	Status    string  `json:"status"`
}

type SeatLockRequestEvent struct {
	EventType      string    `json:"event_type"`
	UserID         int       `json:"user_id"`
	SeatID         string    `json:"seat_id"`
	EventID        int       `json:"event_id"`
	SessionToken   string    `json:"session_token"`
	IdempotencyKey string    `json:"idempotency_key"`
	LockExpiresAt  time.Time `json:"lock_expires_at"`
	RequestedAt    time.Time `json:"requested_at"`
}

type SeatLockedEvent struct {
	EventType      string    `json:"event_type"`
	UserID         int       `json:"user_id"`
	SeatID         string    `json:"seat_id"`
	EventID        int       `json:"event_id"`
	SessionToken   string    `json:"session_token"`
	IdempotencyKey string    `json:"idempotency_key"`
	LockedAt       time.Time `json:"locked_at"`
	LockExpiresAt  time.Time `json:"lock_expires_at"`
}

type SeatLockFailedEvent struct {
	EventType      string    `json:"event_type"`
	UserID         int       `json:"user_id"`
	SeatID         string    `json:"seat_id"`
	EventID        int       `json:"event_id"`
	SessionToken   string    `json:"session_token"`
	IdempotencyKey string    `json:"idempotency_key"`
	Reason         string    `json:"reason"`
	FailedAt       time.Time `json:"failed_at"`
}

type SeatLockExpiredEvent struct {
	EventType      string    `json:"event_type"`
	UserID         int       `json:"user_id"`
	SeatID         string    `json:"seat_id"`
	EventID        int       `json:"event_id"`
	SessionToken   string    `json:"session_token"`
	IdempotencyKey string    `json:"idempotency_key"`
	LockExpiresAt  time.Time `json:"lock_expires_at"`
	ExpiredAt      time.Time `json:"expired_at"`
}

type KafkaPaymentEvent struct {
	EventType     string      `json:"event_type"`
	PaymentID     int         `json:"payment_id"`
	BookingID     int         `json:"booking_id"`
	UserID        int         `json:"user_id"`
	Amount        interface{} `json:"amount"`
	Currency      string      `json:"currency"`
	Status        string      `json:"status"`
	PaymentMethod string      `json:"payment_method"`
	FailureReason string      `json:"failure_reason"`
	PaidAt        string      `json:"paid_at"`
}
