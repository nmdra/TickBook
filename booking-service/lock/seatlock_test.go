package lock

import (
	"testing"

	"github.com/nmdra/TickBook/booking-service/models"
)

func TestBuildLockIdempotencyKey(t *testing.T) {
	key := buildLockIdempotencyKey(10, "A-10", "session-123")
	if key != "10:A-10:session-123" {
		t.Fatalf("unexpected key: %s", key)
	}
}

func TestIsValidLockRequest(t *testing.T) {
	valid := models.SeatLockRequestEvent{
		UserID:         11,
		EventID:        22,
		SeatID:         "B-12",
		SessionToken:   "session",
		IdempotencyKey: "11:B-12:session",
	}
	if !isValidLockRequest(valid) {
		t.Fatal("expected valid lock request to pass")
	}

	invalid := valid
	invalid.SeatID = ""
	if isValidLockRequest(invalid) {
		t.Fatal("expected empty seat id to fail validation")
	}
}
