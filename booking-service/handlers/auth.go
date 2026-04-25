package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type tokenVerificationResponse struct {
	IsValid bool `json:"isValid"`
	User    *struct {
		ID   int    `json:"id"`
		Role string `json:"role"`
	} `json:"user,omitempty"`
	Service string `json:"service,omitempty"`
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

		verification, err := verifyTokenWithUserService(token)
		if err != nil {
			respondError(w, http.StatusServiceUnavailable, "Token validation service unavailable.")
			return
		}

		if !verification.IsValid {
			respondError(w, http.StatusUnauthorized, "Invalid or expired token.")
			return
		}

		next.ServeHTTP(w, r)
	})
}

func extractBearerToken(authHeader string) string {
	if !strings.HasPrefix(authHeader, "Bearer ") {
		return ""
	}

	return strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
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
