package com.tickbook.payment.kafka;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tickbook.payment.service.PaymentService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

@Component
public class BookingEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(BookingEventConsumer.class);

    private final PaymentService paymentService;
    private final ObjectMapper objectMapper;

    public BookingEventConsumer(PaymentService paymentService) {
        this.paymentService = paymentService;
        this.objectMapper = new ObjectMapper();
    }

    @KafkaListener(topics = "bookings", groupId = "payment-service")
    public void handleBookingEvent(String message) {
        try {
            JsonNode event = objectMapper.readTree(message);
            String eventType = event.has("type") ? event.get("type").asText() : "";

            if ("booking.created".equals(eventType)) {
                JsonNode data = event.get("data");
                Long bookingId = data.get("bookingId").asLong();
                Long userId = data.get("userId").asLong();
                BigDecimal amount = data.has("totalPrice")
                        ? data.get("totalPrice").decimalValue()
                        : BigDecimal.ZERO;

                paymentService.createPaymentFromBookingEvent(bookingId, userId, amount);
                log.info("Processed booking.created event for booking {}", bookingId);
            } else {
                log.debug("Ignoring event of type: {}", eventType);
            }
        } catch (Exception e) {
            log.error("Error processing booking event: {}", e.getMessage(), e);
        }
    }
}
