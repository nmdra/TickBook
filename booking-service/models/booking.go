package models

import "time"

type Booking struct {
	ID          int       `json:"id"`
	UserID      int       `json:"user_id"`
	EventID     int       `json:"event_id"`
	Tickets     int       `json:"tickets"`
	TotalAmount float64   `json:"total_amount"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CreateBookingRequest struct {
	UserID  int `json:"user_id"`
	EventID int `json:"event_id"`
	Tickets int `json:"tickets"`
}

type UpdateStatusRequest struct {
	Status string `json:"status"`
}

type KafkaBookingEvent struct {
	EventType string  `json:"event_type"`
	BookingID int     `json:"booking_id"`
	UserID    int     `json:"user_id"`
	EventID   int     `json:"event_id"`
	Tickets   int     `json:"tickets"`
	Amount    float64 `json:"amount"`
	Status    string  `json:"status"`
}

type KafkaPaymentEvent struct {
	EventType     string  `json:"event_type"`
	PaymentID     int     `json:"payment_id"`
	BookingID     int     `json:"booking_id"`
	UserID        int     `json:"user_id"`
	Amount        float64 `json:"amount"`
	Currency      string  `json:"currency"`
	Status        string  `json:"status"`
	PaymentMethod string  `json:"payment_method"`
	FailureReason string  `json:"failure_reason"`
	PaidAt        string  `json:"paid_at"`
}
