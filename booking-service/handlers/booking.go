package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/mux"
	"github.com/nmdra/TickBook/booking-service/database"
	"github.com/nmdra/TickBook/booking-service/kafka"
	"github.com/nmdra/TickBook/booking-service/models"
)

var (
	EventServiceURL string
	UserServiceURL  string
)

func respondJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(payload)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}

// GetBookings returns all bookings
func GetBookings(w http.ResponseWriter, r *http.Request) {
	rows, err := database.DB.Query(
		"SELECT id, user_id, event_id, tickets, total_amount, status, created_at, updated_at FROM bookings ORDER BY created_at DESC",
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch bookings")
		return
	}
	defer rows.Close()

	var bookings []models.Booking
	for rows.Next() {
		var b models.Booking
		if err := rows.Scan(&b.ID, &b.UserID, &b.EventID, &b.Tickets, &b.TotalAmount, &b.Status, &b.CreatedAt, &b.UpdatedAt); err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to scan booking")
			return
		}
		bookings = append(bookings, b)
	}

	if bookings == nil {
		bookings = []models.Booking{}
	}
	respondJSON(w, http.StatusOK, bookings)
}

// GetBooking returns a single booking by ID
func GetBooking(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid booking ID")
		return
	}

	var b models.Booking
	err = database.DB.QueryRow(
		"SELECT id, user_id, event_id, tickets, total_amount, status, created_at, updated_at FROM bookings WHERE id = $1", id,
	).Scan(&b.ID, &b.UserID, &b.EventID, &b.Tickets, &b.TotalAmount, &b.Status, &b.CreatedAt, &b.UpdatedAt)

	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "Booking not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch booking")
		return
	}

	respondJSON(w, http.StatusOK, b)
}

// CreateBooking creates a new booking after validating with Event and User services
func CreateBooking(w http.ResponseWriter, r *http.Request) {
	var req models.CreateBookingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.UserID <= 0 || req.EventID <= 0 || req.Tickets <= 0 {
		respondError(w, http.StatusBadRequest, "user_id, event_id, and tickets must be positive integers")
		return
	}

	// Validate user exists via User Service
	userURL := fmt.Sprintf("%s/api/users/%d", UserServiceURL, req.UserID)
	if err := validateServiceCall(userURL); err != nil {
		log.Printf("User validation failed: %v", err)
		respondError(w, http.StatusBadRequest, fmt.Sprintf("User validation failed: %v", err))
		return
	}

	// Check event availability via Event Service
	eventURL := fmt.Sprintf("%s/api/events/%d/availability", EventServiceURL, req.EventID)
	ticketPrice, err := checkEventAvailability(eventURL, req.Tickets)
	if err != nil {
		log.Printf("Event availability check failed: %v", err)
		respondError(w, http.StatusBadRequest, fmt.Sprintf("Event availability check failed: %v", err))
		return
	}

	totalAmount := ticketPrice * float64(req.Tickets)

	var booking models.Booking
	err = database.DB.QueryRow(
		`INSERT INTO bookings (user_id, event_id, tickets, total_amount, status, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, 'pending', $5, $5)
		 RETURNING id, user_id, event_id, tickets, total_amount, status, created_at, updated_at`,
		req.UserID, req.EventID, req.Tickets, totalAmount, time.Now(),
	).Scan(&booking.ID, &booking.UserID, &booking.EventID, &booking.Tickets, &booking.TotalAmount, &booking.Status, &booking.CreatedAt, &booking.UpdatedAt)

	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to create booking")
		return
	}

	// Publish booking.created event to Kafka
	kafkaEvent := models.KafkaBookingEvent{
		EventType: "booking.created",
		BookingID: booking.ID,
		UserID:    booking.UserID,
		EventID:   booking.EventID,
		Tickets:   booking.Tickets,
		Amount:    booking.TotalAmount,
		Status:    booking.Status,
	}
	if err := kafka.Publish("booking.created", kafkaEvent); err != nil {
		log.Printf("Warning: Failed to publish booking.created event: %v", err)
	}

	respondJSON(w, http.StatusCreated, booking)
}

// UpdateBookingStatus updates the status of a booking
func UpdateBookingStatus(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid booking ID")
		return
	}

	var req models.UpdateStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Status == "" {
		respondError(w, http.StatusBadRequest, "Status is required")
		return
	}

	validStatuses := map[string]bool{"pending": true, "confirmed": true, "cancelled": true}
	if !validStatuses[req.Status] {
		respondError(w, http.StatusBadRequest, "Invalid status. Must be: pending, confirmed, or cancelled")
		return
	}

	var booking models.Booking
	err = database.DB.QueryRow(
		`UPDATE bookings SET status = $1, updated_at = $2 WHERE id = $3
		 RETURNING id, user_id, event_id, tickets, total_amount, status, created_at, updated_at`,
		req.Status, time.Now(), id,
	).Scan(&booking.ID, &booking.UserID, &booking.EventID, &booking.Tickets, &booking.TotalAmount, &booking.Status, &booking.CreatedAt, &booking.UpdatedAt)

	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "Booking not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to update booking status")
		return
	}

	respondJSON(w, http.StatusOK, booking)
}

// DeleteBooking cancels a booking
func DeleteBooking(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid booking ID")
		return
	}

	var booking models.Booking
	err = database.DB.QueryRow(
		`UPDATE bookings SET status = 'cancelled', updated_at = $1 WHERE id = $2
		 RETURNING id, user_id, event_id, tickets, total_amount, status, created_at, updated_at`,
		time.Now(), id,
	).Scan(&booking.ID, &booking.UserID, &booking.EventID, &booking.Tickets, &booking.TotalAmount, &booking.Status, &booking.CreatedAt, &booking.UpdatedAt)

	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "Booking not found")
		return
	}
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to cancel booking")
		return
	}

	// Publish booking.cancelled event to Kafka
	kafkaEvent := models.KafkaBookingEvent{
		EventType: "booking.cancelled",
		BookingID: booking.ID,
		UserID:    booking.UserID,
		EventID:   booking.EventID,
		Tickets:   booking.Tickets,
		Amount:    booking.TotalAmount,
		Status:    booking.Status,
	}
	if err := kafka.Publish("booking.cancelled", kafkaEvent); err != nil {
		log.Printf("Warning: Failed to publish booking.cancelled event: %v", err)
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "Booking cancelled successfully"})
}

// GetBookingsByUser returns all bookings for a specific user
func GetBookingsByUser(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	userID, err := strconv.Atoi(vars["userId"])
	if err != nil {
		respondError(w, http.StatusBadRequest, "Invalid user ID")
		return
	}

	rows, err := database.DB.Query(
		"SELECT id, user_id, event_id, tickets, total_amount, status, created_at, updated_at FROM bookings WHERE user_id = $1 ORDER BY created_at DESC", userID,
	)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to fetch bookings")
		return
	}
	defer rows.Close()

	var bookings []models.Booking
	for rows.Next() {
		var b models.Booking
		if err := rows.Scan(&b.ID, &b.UserID, &b.EventID, &b.Tickets, &b.TotalAmount, &b.Status, &b.CreatedAt, &b.UpdatedAt); err != nil {
			respondError(w, http.StatusInternalServerError, "Failed to scan booking")
			return
		}
		bookings = append(bookings, b)
	}

	if bookings == nil {
		bookings = []models.Booking{}
	}
	respondJSON(w, http.StatusOK, bookings)
}

// validateServiceCall makes a GET request to the given URL and returns an error if it fails
func validateServiceCall(url string) error {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return fmt.Errorf("service unavailable: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("resource not found")
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("service returned status %d", resp.StatusCode)
	}
	return nil
}

// checkEventAvailability calls the Event Service to verify ticket availability
// and returns the ticket price
func checkEventAvailability(availabilityURL string, requestedTickets int) (float64, error) {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(availabilityURL)
	if err != nil {
		return 0, fmt.Errorf("event service unavailable: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return 0, fmt.Errorf("event not found")
	}
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("event service returned status %d", resp.StatusCode)
	}

	var result struct {
		IsAvailable      bool `json:"is_available"`
		AvailableTickets int  `json:"available_tickets"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, fmt.Errorf("failed to parse event availability response: %v", err)
	}

	if !result.IsAvailable || result.AvailableTickets < requestedTickets {
		return 0, fmt.Errorf("not enough tickets available (requested: %d, available: %d)", requestedTickets, result.AvailableTickets)
	}

	// Fetch event details to get the ticket price
	eventDetailURL := availabilityURL[:len(availabilityURL)-len("/availability")]
	ticketPrice, err := fetchEventPrice(client, eventDetailURL)
	if err != nil {
		log.Printf("Warning: Could not fetch event price, using default: %v", err)
		ticketPrice = 50.00
	}

	return ticketPrice, nil
}

// fetchEventPrice retrieves the ticket price from the event detail endpoint
func fetchEventPrice(client *http.Client, eventURL string) (float64, error) {
	resp, err := client.Get(eventURL)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("event service returned status %d", resp.StatusCode)
	}

	var event struct {
		Price interface{} `json:"price"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&event); err != nil {
		return 0, err
	}

	var price float64
	switch v := event.Price.(type) {
	case string:
		price, err = strconv.ParseFloat(v, 64)
		if err != nil {
			return 0, err
		}
	case float64:
		price = v
	case nil:
		return 0, fmt.Errorf("price field is missing in event response")
	default:
		return 0, fmt.Errorf("unexpected type for price field in event response")
	}

	if price <= 0 {
		return 50.00, nil
	}
	return price, nil
}
