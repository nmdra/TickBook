const { pool } = require('../config/db');

const BOOKING_SERVICE_URL = process.env.BOOKING_SERVICE_URL || 'http://localhost:3003';
const VALID_STATUSES = ['pending', 'completed', 'failed', 'refunded'];

const validateBookingExists = async (bookingId) => {
  if (!bookingId) {
    throw new Error('Booking ID is required');
  }

  try {
    const url = `${BOOKING_SERVICE_URL}/api/bookings/${bookingId}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Booking not found with id: ${bookingId}`);
    }
  } catch (err) {
    console.warn(`Could not validate booking ${bookingId}: ${err.message}`);
    throw new Error(`Booking validation failed for id: ${bookingId}`);
  }
};

const getAllPayments = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM payments ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching payments:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM payments WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching payment:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const createPayment = async (req, res) => {
  try {
    const { bookingId, userId, amount, status, paymentMethod } = req.body;

    await validateBookingExists(bookingId);

    const paymentStatus = status || 'pending';

    const result = await pool.query(
      `INSERT INTO payments (booking_id, user_id, amount, status, payment_method)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [bookingId, userId, amount, paymentStatus, paymentMethod || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating payment:', err.message);
    res.status(500).json({ error: err.message });
  }
};

const updatePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !status.trim()) {
      return res.status(400).json({ error: 'Status is required' });
    }

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status. Must be: pending, completed, failed, or refunded',
      });
    }

    const result = await pool.query(
      `UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating payment status:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getPaymentsByBookingId = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const result = await pool.query(
      'SELECT * FROM payments WHERE booking_id = $1 ORDER BY created_at DESC',
      [bookingId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching payments by booking:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  getAllPayments,
  getPaymentById,
  createPayment,
  updatePaymentStatus,
  getPaymentsByBookingId,
};
