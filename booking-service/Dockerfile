FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o booking-service .

FROM alpine:3.23
WORKDIR /app
RUN addgroup -g 1001 appgroup && adduser -u 1001 -G appgroup -s /bin/sh -D appuser
COPY --from=builder /app/booking-service .
COPY docs/ ./docs/
ENV GIN_MODE=release
USER appuser
EXPOSE 3003
CMD ["./booking-service"]