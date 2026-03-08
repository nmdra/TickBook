const express = require('express');
const router = express.Router();
const {
  getAllPayments,
  getPaymentById,
  createPayment,
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
 *         status:
 *           type: string
 *           description: Payment status (pending, completed, failed, refunded)
 *         payment_method:
 *           type: string
 *           description: Payment method
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
 *         - userId
 *         - amount
 *       properties:
 *         bookingId:
 *           type: integer
 *         userId:
 *           type: integer
 *         amount:
 *           type: number
 *           format: float
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
 *     summary: Create a new payment
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

module.exports = router;
