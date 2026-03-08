package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/gorilla/mux"
	"github.com/nmdra/TickBook/booking-service/config"
	"github.com/nmdra/TickBook/booking-service/database"
	"github.com/nmdra/TickBook/booking-service/handlers"
	"github.com/nmdra/TickBook/booking-service/kafka"

	httpSwagger "github.com/swaggo/http-swagger"
)

func main() {
	cfg := config.Load()

	database.Connect(cfg)
	kafka.InitProducer(cfg.KafkaBrokers)

	handlers.EventServiceURL = cfg.EventServiceURL
	handlers.UserServiceURL = cfg.UserServiceURL

	r := mux.NewRouter()

	// Health check
	r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, `{"status":"ok"}`)
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

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan
		log.Println("Shutting down...")
		kafka.Close()
		os.Exit(0)
	}()

	addr := ":" + cfg.Port
	log.Printf("Booking Service starting on port %s", cfg.Port)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
