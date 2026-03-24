package lock

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/nmdra/TickBook/booking-service/models"
	"github.com/redis/go-redis/v9"
	kafkago "github.com/segmentio/kafka-go"
)

const (
	DefaultLockTTL            = 8 * time.Minute
	DefaultIdempotencyTTL     = 10 * time.Minute
	DefaultTTLWatcherInterval = 30 * time.Second
	DefaultRequestTimeout     = 5 * time.Second
	DefaultResultPollInterval = 25 * time.Millisecond
	DefaultResultWaitTimeout  = 2 * time.Second
	DefaultRequestTopic       = "seat.lock.requested"
	DefaultLockedTopic        = "seat.locked"
	DefaultLockFailedTopic    = "seat.lock.failed"
	DefaultLockExpiredTopic   = "seat.lock.expired"
	reasonAlreadyLocked       = "ALREADY_LOCKED"
	reasonInvalidRequest      = "INVALID_REQUEST"
	seatLockKeyPrefix         = "seat.lock"
	idempotencyKeyPrefix      = "seat.lock.idempotency"
	lockEventTypeRequested    = "seat.lock.requested"
	lockEventTypeLocked       = "seat.locked"
	lockEventTypeFailed       = "seat.lock.failed"
	lockEventTypeExpired      = "seat.lock.expired"
	lockScript                = `
if redis.call("GET", KEYS[1]) then
	return 0
else
	return redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2], "NX") and 1 or 0
end
`
)

type lockState struct {
	UserID         int       `json:"user_id"`
	SeatID         string    `json:"seat_id"`
	EventID        int       `json:"event_id"`
	SessionToken   string    `json:"session_token"`
	IdempotencyKey string    `json:"idempotency_key"`
	LockedAt       time.Time `json:"locked_at"`
	LockExpiresAt  time.Time `json:"lock_expires_at"`
}

type LockManager struct {
	redisClient *redis.Client
	writer      *kafkago.Writer
	reader      *kafkago.Reader

	lockTTL            time.Duration
	idempotencyTTL     time.Duration
	requestTimeout     time.Duration
	resultWaitTimeout  time.Duration
	resultPollInterval time.Duration

	mu             sync.Mutex
	lockOutcomes   map[string]string
	ttlWatcherStop chan struct{}
}

func NewLockManager(redisAddr string, brokers []string, groupID string) (*LockManager, error) {
	if redisAddr == "" {
		return nil, fmt.Errorf("redis address is required")
	}
	if len(brokers) == 0 {
		return nil, fmt.Errorf("at least one kafka broker is required")
	}

	redisClient := redis.NewClient(&redis.Options{
		Addr: redisAddr,
	})

	writer := &kafkago.Writer{
		Addr:         kafkago.TCP(brokers...),
		Balancer:     &kafkago.LeastBytes{},
		BatchTimeout: 10 * time.Millisecond,
	}

	reader := kafkago.NewReader(kafkago.ReaderConfig{
		Brokers:  brokers,
		GroupID:  groupID,
		Topic:    DefaultRequestTopic,
		MinBytes: 1e3,
		MaxBytes: 10e6,
	})

	return &LockManager{
		redisClient:        redisClient,
		writer:             writer,
		reader:             reader,
		lockTTL:            DefaultLockTTL,
		idempotencyTTL:     DefaultIdempotencyTTL,
		requestTimeout:     DefaultRequestTimeout,
		resultWaitTimeout:  DefaultResultWaitTimeout,
		resultPollInterval: DefaultResultPollInterval,
		lockOutcomes:       map[string]string{},
	}, nil
}

func (m *LockManager) Start(ctx context.Context) {
	go m.startRequestConsumer(ctx)
	m.startTTLWatcher(ctx)
}

func (m *LockManager) Close() {
	if m.ttlWatcherStop != nil {
		close(m.ttlWatcherStop)
	}
	if m.reader != nil {
		_ = m.reader.Close()
	}
	if m.writer != nil {
		_ = m.writer.Close()
	}
	if m.redisClient != nil {
		_ = m.redisClient.Close()
	}
}

func (m *LockManager) RequestLock(
	ctx context.Context,
	userID int,
	eventID int,
	seatID string,
	sessionToken string,
) (string, error) {
	seatID = strings.TrimSpace(seatID)
	sessionToken = strings.TrimSpace(sessionToken)
	if userID <= 0 || eventID <= 0 || seatID == "" || sessionToken == "" {
		return "", fmt.Errorf("user_id, event_id, seat_id and session_token are required")
	}

	idempotencyKey := buildLockIdempotencyKey(userID, seatID, sessionToken)
	requestedAt := time.Now().UTC()
	lockExpiresAt := requestedAt.Add(m.lockTTL)

	event := models.SeatLockRequestEvent{
		EventType:      lockEventTypeRequested,
		UserID:         userID,
		SeatID:         seatID,
		EventID:        eventID,
		SessionToken:   sessionToken,
		IdempotencyKey: idempotencyKey,
		LockExpiresAt:  lockExpiresAt,
		RequestedAt:    requestedAt,
	}

	if err := m.publishJSON(ctx, DefaultRequestTopic, strconvEventID(eventID), event); err != nil {
		return "", fmt.Errorf(
			"failed to request seat reservation. please try again: %w",
			err,
		)
	}

	return idempotencyKey, m.waitForOutcome(idempotencyKey)
}

func (m *LockManager) ValidateLock(ctx context.Context, eventID int, seatID string, userID int, sessionToken string) (bool, error) {
	seatID = strings.TrimSpace(seatID)
	sessionToken = strings.TrimSpace(sessionToken)
	if eventID <= 0 || seatID == "" {
		return false, fmt.Errorf("event_id and seat_id are required")
	}

	raw, err := m.redisClient.Get(ctx, buildSeatLockKey(eventID, seatID)).Result()
	if err == redis.Nil {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	var state lockState
	if err := json.Unmarshal([]byte(raw), &state); err != nil {
		return false, err
	}

	if state.EventID != eventID || state.SeatID != seatID {
		return false, nil
	}
	if userID > 0 && state.UserID != userID {
		return false, nil
	}
	if sessionToken != "" && state.SessionToken != sessionToken {
		return false, nil
	}
	return true, nil
}

func (m *LockManager) DeleteLock(ctx context.Context, eventID int, seatID string) error {
	seatID = strings.TrimSpace(seatID)
	if eventID <= 0 || seatID == "" {
		return fmt.Errorf("event_id and seat_id are required")
	}

	return m.redisClient.Del(ctx, buildSeatLockKey(eventID, seatID)).Err()
}

func (m *LockManager) startRequestConsumer(ctx context.Context) {
	for {
		msg, err := m.reader.ReadMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("Warning: seat lock consumer read error: %v", err)
			time.Sleep(2 * time.Second)
			continue
		}

		var event models.SeatLockRequestEvent
		if err := json.Unmarshal(msg.Value, &event); err != nil {
			log.Printf("Warning: invalid seat lock request payload: %v", err)
			continue
		}
		m.processLockRequest(ctx, event)
	}
}

func (m *LockManager) processLockRequest(ctx context.Context, event models.SeatLockRequestEvent) {
	if !isValidLockRequest(event) {
		m.publishLockFailed(ctx, event, reasonInvalidRequest)
		m.setOutcome(event.IdempotencyKey, reasonInvalidRequest)
		return
	}

	idempotencyCacheKey := buildIdempotencyCacheKey(event.IdempotencyKey)
	cachedLockJSON, err := m.redisClient.Get(ctx, idempotencyCacheKey).Result()
	if err == nil {
		var priorLock lockState
		if jsonErr := json.Unmarshal([]byte(cachedLockJSON), &priorLock); jsonErr == nil {
			if _, lockErr := m.redisClient.Get(ctx, buildSeatLockKey(priorLock.EventID, priorLock.SeatID)).Result(); lockErr == nil {
				m.publishLocked(ctx, priorLock)
				m.setOutcome(event.IdempotencyKey, "")
				return
			}
		}
	}
	if err != nil && err != redis.Nil {
		m.publishLockFailed(ctx, event, reasonInvalidRequest)
		m.setOutcome(event.IdempotencyKey, reasonInvalidRequest)
		return
	}

	seatLockKey := buildSeatLockKey(event.EventID, event.SeatID)
	if _, lockErr := m.redisClient.Get(ctx, seatLockKey).Result(); lockErr == nil {
		m.publishLockFailed(ctx, event, reasonAlreadyLocked)
		m.setOutcome(event.IdempotencyKey, reasonAlreadyLocked)
		return
	} else if lockErr != redis.Nil {
		m.publishLockFailed(ctx, event, reasonInvalidRequest)
		m.setOutcome(event.IdempotencyKey, reasonInvalidRequest)
		return
	}

	lockedAt := time.Now().UTC()
	lockExpiresAt := lockedAt.Add(m.lockTTL)
	state := lockState{
		UserID:         event.UserID,
		SeatID:         event.SeatID,
		EventID:        event.EventID,
		SessionToken:   event.SessionToken,
		IdempotencyKey: event.IdempotencyKey,
		LockedAt:       lockedAt,
		LockExpiresAt:  lockExpiresAt,
	}

	stateJSON, marshalErr := json.Marshal(state)
	if marshalErr != nil {
		m.publishLockFailed(ctx, event, reasonInvalidRequest)
		m.setOutcome(event.IdempotencyKey, reasonInvalidRequest)
		return
	}

	ttlSeconds := int64(m.lockTTL / time.Second)
	acquired, casErr := m.redisClient.Eval(
		ctx,
		lockScript,
		[]string{seatLockKey},
		string(stateJSON),
		ttlSeconds,
	).Int()
	if casErr != nil {
		m.publishLockFailed(ctx, event, reasonInvalidRequest)
		m.setOutcome(event.IdempotencyKey, reasonInvalidRequest)
		return
	}
	if acquired != 1 {
		m.publishLockFailed(ctx, event, reasonAlreadyLocked)
		m.setOutcome(event.IdempotencyKey, reasonAlreadyLocked)
		return
	}

	if err := m.redisClient.Set(ctx, idempotencyCacheKey, stateJSON, m.idempotencyTTL).Err(); err != nil {
		log.Printf("Warning: failed to persist seat lock idempotency key: %v", err)
	}

	m.publishLocked(ctx, state)
	m.setOutcome(event.IdempotencyKey, "")
}

func (m *LockManager) startTTLWatcher(ctx context.Context) {
	ticker := time.NewTicker(DefaultTTLWatcherInterval)
	m.ttlWatcherStop = make(chan struct{})

	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-m.ttlWatcherStop:
				return
			case <-ticker.C:
				m.scanExpiringLocks(ctx)
			}
		}
	}()
}

func (m *LockManager) scanExpiringLocks(ctx context.Context) {
	var cursor uint64
	now := time.Now().UTC()
	for {
		keys, nextCursor, err := m.redisClient.Scan(ctx, cursor, seatLockKeyPrefix+":*", 100).Result()
		if err != nil {
			return
		}
		for _, key := range keys {
			ttl, err := m.redisClient.TTL(ctx, key).Result()
			if err != nil || ttl <= 0 || ttl > DefaultTTLWatcherInterval {
				continue
			}

			raw, getErr := m.redisClient.Get(ctx, key).Result()
			if getErr != nil {
				continue
			}

			var state lockState
			if err := json.Unmarshal([]byte(raw), &state); err != nil {
				continue
			}
			if state.LockExpiresAt.After(now.Add(DefaultTTLWatcherInterval)) {
				continue
			}

			expiryNoticeKey := fmt.Sprintf("%s:expiry.notice:%s", seatLockKeyPrefix, state.IdempotencyKey)
			set, err := m.redisClient.SetNX(ctx, expiryNoticeKey, "1", 2*time.Minute).Result()
			if err != nil || !set {
				continue
			}

			expired := models.SeatLockExpiredEvent{
				EventType:      lockEventTypeExpired,
				UserID:         state.UserID,
				SeatID:         state.SeatID,
				EventID:        state.EventID,
				SessionToken:   state.SessionToken,
				IdempotencyKey: state.IdempotencyKey,
				LockExpiresAt:  state.LockExpiresAt,
				ExpiredAt:      state.LockExpiresAt,
			}
			_ = m.publishJSON(ctx, DefaultLockExpiredTopic, strconvEventID(state.EventID), expired)
		}

		cursor = nextCursor
		if cursor == 0 {
			return
		}
	}
}

func (m *LockManager) publishLocked(ctx context.Context, state lockState) {
	event := models.SeatLockedEvent{
		EventType:      lockEventTypeLocked,
		UserID:         state.UserID,
		SeatID:         state.SeatID,
		EventID:        state.EventID,
		SessionToken:   state.SessionToken,
		IdempotencyKey: state.IdempotencyKey,
		LockedAt:       state.LockedAt,
		LockExpiresAt:  state.LockExpiresAt,
	}
	_ = m.publishJSON(ctx, DefaultLockedTopic, strconvEventID(state.EventID), event)
}

func (m *LockManager) publishLockFailed(ctx context.Context, request models.SeatLockRequestEvent, reason string) {
	event := models.SeatLockFailedEvent{
		EventType:      lockEventTypeFailed,
		UserID:         request.UserID,
		SeatID:         request.SeatID,
		EventID:        request.EventID,
		SessionToken:   request.SessionToken,
		IdempotencyKey: request.IdempotencyKey,
		Reason:         reason,
		FailedAt:       time.Now().UTC(),
	}
	_ = m.publishJSON(ctx, DefaultLockFailedTopic, strconvEventID(request.EventID), event)
}

func (m *LockManager) publishJSON(ctx context.Context, topic string, key string, payload interface{}) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	publishCtx, cancel := context.WithTimeout(ctx, m.requestTimeout)
	defer cancel()

	return m.writer.WriteMessages(publishCtx, kafkago.Message{
		Topic: topic,
		Key:   []byte(key),
		Value: data,
	})
}

func (m *LockManager) waitForOutcome(idempotencyKey string) error {
	deadline := time.Now().Add(m.resultWaitTimeout)
	for time.Now().Before(deadline) {
		if outcome, ok := m.getOutcome(idempotencyKey); ok {
			if outcome == "" {
				return nil
			}
			return fmt.Errorf("seat lock failed: %s", outcome)
		}
		time.Sleep(m.resultPollInterval)
	}
	return fmt.Errorf("seat lock failed: timeout")
}

func (m *LockManager) setOutcome(idempotencyKey, outcome string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.lockOutcomes[idempotencyKey] = outcome
}

func (m *LockManager) getOutcome(idempotencyKey string) (string, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	outcome, ok := m.lockOutcomes[idempotencyKey]
	if ok {
		delete(m.lockOutcomes, idempotencyKey)
	}
	return outcome, ok
}

func buildLockIdempotencyKey(userID int, seatID, sessionToken string) string {
	return fmt.Sprintf("%d:%s:%s", userID, seatID, sessionToken)
}

func buildSeatLockKey(eventID int, seatID string) string {
	return fmt.Sprintf("%s:%d:%s", seatLockKeyPrefix, eventID, seatID)
}

func buildIdempotencyCacheKey(idempotencyKey string) string {
	return fmt.Sprintf("%s:%s", idempotencyKeyPrefix, idempotencyKey)
}

func isValidLockRequest(event models.SeatLockRequestEvent) bool {
	return event.UserID > 0 &&
		event.EventID > 0 &&
		strings.TrimSpace(event.SeatID) != "" &&
		strings.TrimSpace(event.SessionToken) != "" &&
		strings.TrimSpace(event.IdempotencyKey) != ""
}

func strconvEventID(eventID int) string {
	return fmt.Sprintf("%d", eventID)
}
