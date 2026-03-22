package kafka

import (
	"context"
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
	paymentEventPrefix      = "payment."
	bookingStatusConfirmed  = "confirmed"
	bookingStatusCancelled  = "cancelled"
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
	if eventType == "" && event.Status != "" {
		eventType = fmt.Sprintf("%s%s", paymentEventPrefix, strings.TrimSpace(event.Status))
	}

	if event.BookingID == 0 {
		return errors.New("payment event missing booking_id")
	}

	switch eventType {
	case "payment.completed":
		return updateBookingStatusIfAllowed(event.BookingID, bookingStatusConfirmed, bookingStatusCancelled)
	case "payment.failed":
		return updateBookingStatusIfAllowed(event.BookingID, bookingStatusCancelled, bookingStatusConfirmed)
	case "payment.refunded":
		return updateBookingStatusIfAllowed(event.BookingID, bookingStatusCancelled, "")
	default:
		log.Printf("Ignoring payment event type: %s", eventType)
		return nil
	}
}

func updateBookingStatusIfAllowed(bookingID int, newStatus string, skipIfCurrentStatus string) error {
	query := "UPDATE bookings SET status = $1, updated_at = $2 WHERE id = $3"
	args := []interface{}{newStatus, time.Now(), bookingID}

	if skipIfCurrentStatus != "" {
		query += " AND status <> $4"
		args = append(args, skipIfCurrentStatus)
	}

	result, err := database.DB.Exec(query, args...)
	if err != nil {
		return err
	}

	affected, err := result.RowsAffected()
	if err == nil && affected == 0 {
		log.Printf("No booking update applied for booking %d (status unchanged or not found)", bookingID)
	}

	return nil
}
