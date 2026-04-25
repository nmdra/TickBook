package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type contextKey string

const UserContextKey contextKey = "user"

type tokenVerificationResponse struct {
	IsValid bool `json:"isValid"`
	User    *struct {
		ID   int    `json:"id"`
		Role string `json:"role"`
	} `json:"user,omitempty"`
	Service string `json:"service,omitempty"`
}

type AuthenticatedUser struct {
	ID   int
	Role string
}

// AuthenticateToken validates incoming bearer tokens with the User Service.
func AuthenticateToken(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}

		token := extractBearerToken(r.Header.Get("Authorization"))
		if token == "" {
			respondError(w, http.StatusUnauthorized, "Access denied. No token provided.")
			return
		}

		// Bypass User Service if it's an internal service token
		if InternalServiceToken != "" && token == InternalServiceToken {
			ctx := context.WithValue(r.Context(), UserContextKey, &AuthenticatedUser{
				ID:   0,
				Role: "service",
			})
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		verification, err := verifyTokenWithUserService(token)
		if err != nil {
			respondError(w, http.StatusServiceUnavailable, "Token validation service unavailable.")
			return
		}

		if !verification.IsValid {
			respondError(w, http.StatusUnauthorized, "Invalid or expired token.")
			return
		}

		// Inject user into context if present
		ctx := r.Context()
		if verification.User != nil {
			ctx = context.WithValue(ctx, UserContextKey, &AuthenticatedUser{
				ID:   verification.User.ID,
				Role: verification.User.Role,
			})
		} else if verification.Service != "" {
			ctx = context.WithValue(ctx, UserContextKey, &AuthenticatedUser{
				ID:   0,
				Role: verification.Service,
			})
		}

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func extractBearerToken(authHeader string) string {
	if !strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		return ""
	}

	return strings.TrimSpace(authHeader[7:])
}

func verifyTokenWithUserService(token string) (*tokenVerificationResponse, error) {
	body, err := json.Marshal(map[string]string{"token": token})
	if err != nil {
		return nil, err
	}

	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequest(
		http.MethodPost,
		fmt.Sprintf("%s/api/users/verify-token", UserServiceURL),
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return &tokenVerificationResponse{IsValid: false}, nil
	}

	var verification tokenVerificationResponse
	if err := json.NewDecoder(resp.Body).Decode(&verification); err != nil {
		return nil, err
	}

	return &verification, nil
}
