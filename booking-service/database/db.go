package database

import (
	"database/sql"
	"fmt"
	"log"

	"github.com/nmdra/TickBook/booking-service/config"

	_ "github.com/lib/pq"
)

var DB *sql.DB

func Connect(cfg *config.Config) {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName,
	)

	var err error
	DB, err = sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	if err = DB.Ping(); err != nil {
		log.Printf("Warning: Could not ping database: %v", err)
	} else {
		log.Println("Connected to PostgreSQL database")
	}

	createTable()
	migrateTable()
}

func createTable() {
	query := `
	CREATE TABLE IF NOT EXISTS bookings (
		id SERIAL PRIMARY KEY,
		user_id INTEGER NOT NULL,
		event_id INTEGER NOT NULL,
		seat_id VARCHAR(128),
		tickets INTEGER NOT NULL,
		total_amount DECIMAL(10,2) NOT NULL,
		status VARCHAR(50) DEFAULT 'pending',
		created_at TIMESTAMP DEFAULT NOW(),
		updated_at TIMESTAMP DEFAULT NOW()
	);`

	_, err := DB.Exec(query)
	if err != nil {
		log.Printf("Warning: Could not create bookings table: %v", err)
	} else {
		log.Println("Bookings table ready")
	}
}

// migrateTable adds any missing columns to an existing bookings table.
// Safe to run on every startup — uses ADD COLUMN IF NOT EXISTS.
func migrateTable() {
	migrations := []struct {
		desc string
		sql  string
	}{
		{
			desc: "add seat_id column",
			sql:  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS seat_id VARCHAR(128);`,
		},
	}

	for _, m := range migrations {
		if _, err := DB.Exec(m.sql); err != nil {
			log.Printf("Warning: migration failed (%s): %v", m.desc, err)
		} else {
			log.Printf("Migration OK: %s", m.desc)
		}
	}
}
