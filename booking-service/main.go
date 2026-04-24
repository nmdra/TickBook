package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/gorilla/mux"
	"github.com/nmdra/TickBook/booking-service/config"
	"github.com/nmdra/TickBook/booking-service/database"
	"github.com/nmdra/TickBook/booking-service/handlers"
	"github.com/nmdra/TickBook/booking-service/kafka"
	"github.com/nmdra/TickBook/booking-service/lock"

	"github.com/rs/cors"
	httpSwagger "github.com/swaggo/http-swagger"
)

func main() {
	cfg := config.Load()

	database.Connect(cfg)
	kafka.InitProducer(cfg.KafkaBrokers, cfg.KafkaBookingsTopic)
	kafka.StartPaymentConsumer(cfg.KafkaBrokers, cfg.KafkaPaymentsGroup, cfg.KafkaPaymentsTopic)

	lockManager, err := lock.NewLockManager(
		cfg.RedisAddr,
		strings.Split(cfg.KafkaBrokers, ","),
		cfg.SeatLockGroup,
	)
	if err != nil {
		log.Fatalf("Failed to initialize seat lock manager: %v", err)
	}
	lockManager.Start(context.Background())
	handlers.SeatLockManager = lockManager

	handlers.EventServiceURL = cfg.EventServiceURL
	handlers.UserServiceURL = cfg.UserServiceURL

	r := mux.NewRouter()

	// Health check
	r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = fmt.Fprint(w, `{"status":"ok"}`)
	}).Methods("GET")

	// Swagger
	r.PathPrefix("/swagger/").Handler(httpSwagger.Handler(
		httpSwagger.URL("/swagger/doc.json"),
	))
	r.HandleFunc("/swagger/doc.json", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./docs/swagger.json")
	}).Methods("GET")

	// Booking routes
	api := r.PathPrefix("/api/bookings").Subrouter()
	api.HandleFunc("", handlers.GetBookings).Methods("GET")
	api.HandleFunc("/{id:[0-9]+}", handlers.GetBooking).Methods("GET")
	api.HandleFunc("", handlers.CreateBooking).Methods("POST")
	api.HandleFunc("/{id:[0-9]+}/status", handlers.UpdateBookingStatus).Methods("PUT")
	api.HandleFunc("/{id:[0-9]+}", handlers.DeleteBooking).Methods("DELETE")
	api.HandleFunc("/user/{userId:[0-9]+}", handlers.GetBookingsByUser).Methods("GET")

	// Wrap router with CORS
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"}, // allow all origins
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"}, // include common headers
		AllowCredentials: true,                                      // optional if you use cookies/auth
	})
	handler := c.Handler(r)

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan
		log.Println("Shutting down...")
		kafka.StopPaymentConsumer()
		lockManager.Close()
		kafka.Close()
		os.Exit(0)
	}()

	addr := ":" + cfg.Port
	log.Printf("Booking Service starting on port %s", cfg.Port)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
