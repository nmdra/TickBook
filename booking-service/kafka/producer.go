package kafka

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"time"

	kafkago "github.com/segmentio/kafka-go"
)

var writer *kafkago.Writer

func InitProducer(brokers string) {
	brokerList := strings.Split(brokers, ",")
	writer = &kafkago.Writer{
		Addr:         kafkago.TCP(brokerList...),
		Topic:        "bookings",
		Balancer:     &kafkago.LeastBytes{},
		BatchTimeout: 10 * time.Millisecond,
	}
	log.Printf("Kafka producer initialized with brokers: %s", brokers)
}

func Publish(key string, value interface{}) error {
	if writer == nil {
		log.Println("Warning: Kafka writer not initialized, skipping publish")
		return nil
	}

	data, err := json.Marshal(value)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err = writer.WriteMessages(ctx, kafkago.Message{
		Key:   []byte(key),
		Value: data,
	})
	if err != nil {
		log.Printf("Warning: Failed to publish to Kafka: %v", err)
		return err
	}

	log.Printf("Published message to Kafka topic 'bookings' with key: %s", key)
	return nil
}

func Close() {
	if writer != nil {
		if err := writer.Close(); err != nil {
			log.Printf("Warning: Failed to close Kafka writer: %v", err)
		}
	}
}
