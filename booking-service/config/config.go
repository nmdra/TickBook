package config

import "os"

type Config struct {
	Port            string
	DBHost          string
	DBPort          string
	DBUser          string
	DBPassword      string
	DBName          string
	KafkaBrokers    string
	EventServiceURL string
	UserServiceURL  string
}

func Load() *Config {
	return &Config{
		Port:            getEnv("PORT", "3003"),
		DBHost:          getEnv("DB_HOST", "localhost"),
		DBPort:          getEnv("DB_PORT", "5432"),
		DBUser:          getEnv("DB_USER", "postgres"),
		DBPassword:      getEnv("DB_PASSWORD", "postgres"),
		DBName:          getEnv("DB_NAME", "bookingdb"),
		KafkaBrokers:    getEnv("KAFKA_BROKERS", "localhost:9092"),
		EventServiceURL: getEnv("EVENT_SERVICE_URL", "http://localhost:3001"),
		UserServiceURL:  getEnv("USER_SERVICE_URL", "http://localhost:3002"),
	}
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}
