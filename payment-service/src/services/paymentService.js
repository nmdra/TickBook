const { pool } = require('../config/db');

const DEFAULT_CURRENCY = (process.env.STRIPE_CURRENCY || 'usd').toLowerCase();
const VALID_STATUSES = ['pending', 'completed', 'failed', 'refunded'];

const normalizeCurrency = (currency) => {
  if (!currency || !String(currency).trim()) {
    return DEFAULT_CURRENCY;
  }

  return String(currency).trim().toLowerCase();
};

const normalizeAmount = (amount) => {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Amount must be a positive number');
  }

  return parsed.toFixed(2);
};

const serializeProviderResponse = (providerResponse) => {
  if (providerResponse === undefined) {
    return undefined;
  }

  if (providerResponse === null) {
    return null;
  }

  return JSON.stringify(providerResponse);
};

const getAllPayments = async () => {
  const result = await pool.query('SELECT * FROM payments ORDER BY created_at DESC');
  return result.rows;
};

const getPaymentById = async (id) => {
  const result = await pool.query('SELECT * FROM payments WHERE id = $1', [id]);
  return result.rows[0] || null;
};

const getLatestPaymentByBookingId = async (bookingId) => {
  const result = await pool.query(
    `SELECT * FROM payments
     WHERE booking_id = $1
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [bookingId]
  );

  return result.rows[0] || null;
};

const getPaymentsByBookingId = async (bookingId) => {
  const result = await pool.query(
    `SELECT * FROM payments
     WHERE booking_id = $1
     ORDER BY created_at DESC, id DESC`,
    [bookingId]
  );

  return result.rows;
};

const getPaymentByStripeSessionId = async (sessionId) => {
  const result = await pool.query(
    `SELECT * FROM payments
     WHERE stripe_checkout_session_id = $1
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [sessionId]
  );

  return result.rows[0] || null;
};

const getPaymentByStripePaymentIntentId = async (paymentIntentId) => {
  const result = await pool.query(
    `SELECT * FROM payments
     WHERE stripe_payment_intent_id = $1
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [paymentIntentId]
  );

  return result.rows[0] || null;
};

const createOrUpdatePendingPayment = async ({
  bookingId,
  userId,
  amount,
  currency = DEFAULT_CURRENCY,
  paymentMethod = 'pending_selection',
}) => {
  const normalizedAmount = normalizeAmount(amount);
  const normalizedCurrency = normalizeCurrency(currency);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existingResult = await client.query(
      `SELECT * FROM payments
       WHERE booking_id = $1
       ORDER BY updated_at DESC, id DESC
       LIMIT 1
       FOR UPDATE`,
      [bookingId]
    );

    let result;

    if (existingResult.rows.length > 0) {
      const existingPayment = existingResult.rows[0];
      result = await client.query(
        `UPDATE payments
         SET user_id = $1,
             amount = $2,
             currency = $3,
             payment_method = CASE
               WHEN status = 'completed' THEN payment_method
               ELSE $4
             END,
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [userId, normalizedAmount, normalizedCurrency, paymentMethod, existingPayment.id]
      );
    } else {
      result = await client.query(
        `INSERT INTO payments (
           booking_id,
           user_id,
           amount,
           currency,
           status,
           payment_method,
           created_at,
           updated_at
         )
         VALUES ($1, $2, $3, $4, 'pending', $5, NOW(), NOW())
         RETURNING *`,
        [bookingId, userId, normalizedAmount, normalizedCurrency, paymentMethod]
      );
    }

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const setPaymentStateById = async (id, changes) => {
  const assignments = ['updated_at = NOW()'];
  const values = [];

  const addAssignment = (column, value) => {
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  };

  if (changes.status !== undefined) {
    addAssignment('status', changes.status);
  }

  if (changes.paymentMethod !== undefined) {
    addAssignment('payment_method', changes.paymentMethod);
  }

  if (changes.currency !== undefined) {
    addAssignment('currency', normalizeCurrency(changes.currency));
  }

  if (changes.stripeCheckoutSessionId !== undefined) {
    addAssignment('stripe_checkout_session_id', changes.stripeCheckoutSessionId);
  }

  if (changes.stripePaymentIntentId !== undefined) {
    addAssignment('stripe_payment_intent_id', changes.stripePaymentIntentId);
  }

  if (changes.stripeCustomerId !== undefined) {
    addAssignment('stripe_customer_id', changes.stripeCustomerId);
  }

  if (changes.checkoutUrl !== undefined) {
    addAssignment('checkout_url', changes.checkoutUrl);
  }

  if (changes.failureReason !== undefined) {
    addAssignment('failure_reason', changes.failureReason);
  }

  if (changes.providerResponse !== undefined) {
    addAssignment('provider_response', serializeProviderResponse(changes.providerResponse));
  }

  if (changes.paidAt !== undefined) {
    addAssignment('paid_at', changes.paidAt);
  }

  if (assignments.length === 1) {
    return getPaymentById(id);
  }

  values.push(id);

  const result = await pool.query(
    `UPDATE payments
     SET ${assignments.join(', ')}
     WHERE id = $${values.length}
     RETURNING *`,
    values
  );

  return result.rows[0] || null;
};

const updatePaymentStatusById = async (id, status, changes = {}) => {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error('Invalid status. Must be: pending, completed, failed, or refunded');
  }

  return setPaymentStateById(id, {
    ...changes,
    status,
  });
};

const updatePaymentStatusByBookingId = async (bookingId, status, changes = {}) => {
  const payment = await getLatestPaymentByBookingId(bookingId);
  if (!payment) {
    return null;
  }

  return updatePaymentStatusById(payment.id, status, changes);
};

module.exports = {
  DEFAULT_CURRENCY,
  VALID_STATUSES,
  createOrUpdatePendingPayment,
  getAllPayments,
  getLatestPaymentByBookingId,
  getPaymentById,
  getPaymentByStripePaymentIntentId,
  getPaymentByStripeSessionId,
  getPaymentsByBookingId,
  normalizeAmount,
  normalizeCurrency,
  setPaymentStateById,
  updatePaymentStatusByBookingId,
  updatePaymentStatusById,
};
