const express = require('express');
const router = express.Router();
const {
  getAllPayments,
  getPaymentById,
  createPayment,
  createStripeCheckoutSession,
  handleStripeCancel,
  handleStripeSuccess,
  handleStripeWebhook,
  updatePaymentStatus,
  getPaymentsByBookingId,
} = require('../controllers/paymentController');

/**
 * @swagger
 * components:
 *   schemas:
 *     Payment:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: Auto-generated payment ID
 *         booking_id:
 *           type: integer
 *           description: Associated booking ID
 *         user_id:
 *           type: integer
 *           description: Associated user ID
 *         amount:
 *           type: number
 *           format: float
 *           description: Payment amount
 *         currency:
 *           type: string
 *           description: ISO currency code
 *         status:
 *           type: string
 *           description: Payment status (pending, completed, failed, refunded)
 *         payment_method:
 *           type: string
 *           description: Payment method
 *         stripe_checkout_session_id:
 *           type: string
 *           nullable: true
 *         stripe_payment_intent_id:
 *           type: string
 *           nullable: true
 *         stripe_customer_id:
 *           type: string
 *           nullable: true
 *         checkout_url:
 *           type: string
 *           nullable: true
 *         failure_reason:
 *           type: string
 *           nullable: true
 *         provider_response:
 *           type: object
 *           nullable: true
 *         paid_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     PaymentInput:
 *       type: object
 *       required:
 *         - bookingId
 *       properties:
 *         bookingId:
 *           type: integer
 *         currency:
 *           type: string
 *         status:
 *           type: string
 *         paymentMethod:
 *           type: string
 *     StatusUpdate:
 *       type: object
 *       required:
 *         - status
 *       properties:
 *         status:
 *           type: string
 *           enum: [pending, completed, failed, refunded]
 *         failureReason:
 *           type: string
 *     StripeCheckoutSessionInput:
 *       type: object
 *       properties:
 *         successUrl:
 *           type: string
 *           description: Optional override for Stripe redirect on success
 *         cancelUrl:
 *           type: string
 *           description: Optional override for Stripe redirect on cancel
 *         currency:
 *           type: string
 *           description: Optional ISO currency override
 *     StripeCheckoutSessionResponse:
 *       type: object
 *       properties:
 *         payment:
 *           $ref: '#/components/schemas/Payment'
 *         checkoutUrl:
 *           type: string
 *         sessionId:
 *           type: string
 *     Error:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 */

/**
 * @swagger
 * /api/payments:
 *   get:
 *     summary: List all payments
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: List of payments
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Payment'
 *       500:
 *         description: Internal server error
 */
router.get('/', getAllPayments);

/**
 * @swagger
 * /api/payments/booking/{bookingId}:
 *   get:
 *     summary: Get payments by booking ID
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Booking ID
 *     responses:
 *       200:
 *         description: List of payments for the booking
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Payment'
 *       500:
 *         description: Internal server error
 */
router.get('/booking/:bookingId', getPaymentsByBookingId);

/**
 * @swagger
 * /api/payments/booking/{bookingId}/checkout-session:
 *   post:
 *     summary: Create a Stripe Checkout session for a booking payment
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Booking ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/StripeCheckoutSessionInput'
 *     responses:
 *       201:
 *         description: Stripe Checkout session created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StripeCheckoutSessionResponse'
 *       400:
 *         description: Invalid booking or amount
 *       409:
 *         description: Payment already completed
 *       503:
 *         description: Stripe is not configured
 */
router.post('/booking/:bookingId/checkout-session', createStripeCheckoutSession);

/**
 * @swagger
 * /api/payments/stripe/success:
 *   get:
 *     summary: Handle Stripe success redirect and mark payment completed
 *     tags: [Payments]
 *     parameters:
 *       - in: query
 *         name: session_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment completed successfully
 *       400:
 *         description: Payment not completed or missing session ID
 *       503:
 *         description: Stripe is not configured
 */
router.get('/stripe/success', handleStripeSuccess);

/**
 * @swagger
 * /api/payments/stripe/cancel:
 *   get:
 *     summary: Handle Stripe cancel redirect and mark payment failed
 *     tags: [Payments]
 *     parameters:
 *       - in: query
 *         name: session_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Stripe checkout cancelled
 *       400:
 *         description: Missing session ID
 *       503:
 *         description: Stripe is not configured
 */
router.get('/stripe/cancel', handleStripeCancel);

/**
 * @swagger
 * /api/payments/webhook:
 *   post:
 *     summary: Receive Stripe webhook events
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: Webhook processed
 *       400:
 *         description: Invalid Stripe signature or payload
 *       503:
 *         description: Stripe is not configured
 */
router.post('/webhook', handleStripeWebhook);

/**
 * @swagger
 * /api/payments/{id}:
 *   get:
 *     summary: Get payment by ID
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Payment ID
 *     responses:
 *       200:
 *         description: Payment details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Payment'
 *       404:
 *         description: Payment not found
 *       500:
 *         description: Internal server error
 */
router.get('/:id', getPaymentById);

/**
 * @swagger
 * /api/payments:
 *   post:
 *     summary: Create or sync a payment record for a booking
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PaymentInput'
 *     responses:
 *       201:
 *         description: Payment created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Payment'
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Internal server error
 */
router.post('/', createPayment);

/**
 * @swagger
 * /api/payments/{id}/status:
 *   put:
 *     summary: Update payment status
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Payment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/StatusUpdate'
 *     responses:
 *       200:
 *         description: Payment status updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Payment'
 *       400:
 *         description: Invalid status
 *       404:
 *         description: Payment not found
 *       500:
 *         description: Internal server error
 */
router.put('/:id/status', updatePaymentStatus);

module.exports = router;
