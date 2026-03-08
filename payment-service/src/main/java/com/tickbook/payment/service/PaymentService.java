package com.tickbook.payment.service;

import com.tickbook.payment.model.Payment;
import com.tickbook.payment.repository.PaymentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class PaymentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    private final PaymentRepository paymentRepository;
    private final RestTemplate restTemplate;

    @Value("${booking-service.url}")
    private String bookingServiceUrl;

    public PaymentService(PaymentRepository paymentRepository, RestTemplate restTemplate) {
        this.paymentRepository = paymentRepository;
        this.restTemplate = restTemplate;
    }

    public List<Payment> getAllPayments() {
        return paymentRepository.findAll();
    }

    public Optional<Payment> getPaymentById(Long id) {
        return paymentRepository.findById(id);
    }

    public List<Payment> getPaymentsByBookingId(Long bookingId) {
        return paymentRepository.findByBookingId(bookingId);
    }

    public Payment createPayment(Payment payment) {
        validateBookingExists(payment.getBookingId());

        if (payment.getStatus() == null) {
            payment.setStatus("pending");
        }

        return paymentRepository.save(payment);
    }

    public Payment updatePaymentStatus(Long id, String status) {
        java.util.List<String> validStatuses = java.util.List.of("pending", "completed", "failed", "refunded");
        if (!validStatuses.contains(status)) {
            throw new IllegalArgumentException("Invalid status. Must be: pending, completed, failed, or refunded");
        }
        Payment payment = paymentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Payment not found with id: " + id));
        payment.setStatus(status);
        return paymentRepository.save(payment);
    }

    public Payment createPaymentFromBookingEvent(Long bookingId, Long userId, BigDecimal amount) {
        Payment payment = new Payment();
        payment.setBookingId(bookingId);
        payment.setUserId(userId);
        payment.setAmount(amount);
        payment.setStatus("pending");
        payment.setPaymentMethod("pending_selection");

        log.info("Creating pending payment for booking {} (user: {})", bookingId, userId);
        return paymentRepository.save(payment);
    }

    private void validateBookingExists(Long bookingId) {
        if (bookingId == null) {
            throw new RuntimeException("Booking ID is required");
        }

        try {
            String url = bookingServiceUrl + "/api/bookings/" + bookingId;
            ResponseEntity<Map> response = restTemplate.getForEntity(url, Map.class);
            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new RuntimeException("Booking not found with id: " + bookingId);
            }
        } catch (RuntimeException e) {
            log.warn("Could not validate booking {}: {}", bookingId, e.getMessage());
            throw new RuntimeException("Booking validation failed for id: " + bookingId, e);
        }
    }
}
