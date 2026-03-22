package kafka

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	kafkago "github.com/segmentio/kafka-go"

	"github.com/nmdra/TickBook/booking-service/database"
	"github.com/nmdra/TickBook/booking-service/models"
)

const (
	paymentConsumerMinBytes = 1e3
	paymentConsumerMaxBytes = 10e6
	bookingStatusConfirmed  = "confirmed"
	bookingStatusCancelled  = "cancelled"
	noStatusGuard           = ""
)

var paymentReader *kafkago.Reader
var paymentCancel context.CancelFunc

func StartPaymentConsumer(brokers, groupID, topic string) {
	if paymentReader != nil {
		return
	}

	brokerList := strings.Split(brokers, ",")
	paymentReader = kafkago.NewReader(kafkago.ReaderConfig{
		Brokers:  brokerList,
		GroupID:  groupID,
		Topic:    topic,
		MinBytes: paymentConsumerMinBytes,
		MaxBytes: paymentConsumerMaxBytes,
	})

	ctx, cancel := context.WithCancel(context.Background())
	paymentCancel = cancel

	go func() {
		for {
			msg, err := paymentReader.ReadMessage(ctx)
			if err != nil {
				if errors.Is(err, context.Canceled) {
					return
				}
				log.Printf("Warning: payment consumer read error: %v", err)
				time.Sleep(2 * time.Second)
				continue
			}

			if err := handlePaymentEvent(msg.Value); err != nil {
				log.Printf("Warning: failed to handle payment event: %v", err)
			}
		}
	}()

	log.Printf("Kafka payment consumer listening on topic '%s' with group '%s'", topic, groupID)
}

func StopPaymentConsumer() {
	if paymentCancel != nil {
		paymentCancel()
	}
	if paymentReader != nil {
		if err := paymentReader.Close(); err != nil {
			log.Printf("Warning: failed to close payment consumer: %v", err)
		}
	}
}

func handlePaymentEvent(message []byte) error {
	var event models.KafkaPaymentEvent
	if err := json.Unmarshal(message, &event); err != nil {
		return fmt.Errorf("invalid payment event payload: %w", err)
	}

	eventType := strings.TrimSpace(event.EventType)
	if eventType == "" {
		return errors.New("payment event missing event_type")
	}

	if event.BookingID == 0 {
		return errors.New("payment event missing booking_id")
	}

	switch eventType {
	case "payment.completed":
		return confirmBookingIfNotCancelled(event.BookingID)
	case "payment.failed":
		return cancelBookingIfNotConfirmed(event.BookingID)
	case "payment.refunded":
		return cancelBooking(event.BookingID)
	default:
		log.Printf("Ignoring payment event type: %s", eventType)
		return nil
	}
}

func confirmBookingIfNotCancelled(bookingID int) error {
	return updateBookingStatusUnlessCurrentStatus(
		bookingID,
		bookingStatusConfirmed,
		bookingStatusCancelled,
	)
}

func cancelBookingIfNotConfirmed(bookingID int) error {
	return updateBookingStatusUnlessCurrentStatus(
		bookingID,
		bookingStatusCancelled,
		bookingStatusConfirmed,
	)
}

func cancelBooking(bookingID int) error {
	return updateBookingStatusUnlessCurrentStatus(
		bookingID,
		bookingStatusCancelled,
		noStatusGuard,
	)
}

func updateBookingStatusUnlessCurrentStatus(
	bookingID int,
	newStatus string,
	skipIfStatus string,
) error {
	query := "UPDATE bookings SET status = $1, updated_at = $2 WHERE id = $3"
	args := []interface{}{newStatus, time.Now(), bookingID}

	if skipIfStatus != "" {
		query += " AND status <> $4"
		args = append(args, skipIfStatus)
	}

	result, err := database.DB.Exec(query, args...)
	if err != nil {
		return err
	}

	affected, err := result.RowsAffected()
	if err == nil && affected == 0 {
		var currentStatus string
		statusErr := database.DB.QueryRow(
			"SELECT status FROM bookings WHERE id = $1",
			bookingID,
		).Scan(&currentStatus)
		if statusErr == sql.ErrNoRows {
			log.Printf("Booking %d not found while processing payment event", bookingID)
			return nil
		}
		if statusErr != nil {
			return statusErr
		}
		log.Printf("Status guard prevented updating booking %d because status is %s", bookingID, currentStatus)
	}

	return nil
}
