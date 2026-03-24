const { getStripeClient, isStripeConfigured } = require('../config/stripe');
const { publishPaymentEvent } = require('../config/kafka');
const { deleteSeatLock, validateSeatLock } = require('../config/lockStore');
const { getBookingById, updateBookingStatus } = require('../services/bookingService');
const {
  DEFAULT_CURRENCY,
  VALID_STATUSES,
  createOrUpdatePendingPayment,
  getAllPayments: getAllPaymentRecords,
  getLatestPaymentByBookingId,
  getPaymentById: getPaymentRecordById,
  getPaymentByStripePaymentIntentId,
  getPaymentByStripeSessionId,
  getPaymentsByBookingId: getPaymentRecordsByBookingId,
  normalizeCurrency,
  setPaymentStateById,
  updatePaymentStatusById,
} = require('../services/paymentService');

const SERVICE_PORT = process.env.PORT || 3004;
const DEFAULT_SUCCESS_URL = `http://localhost:${SERVICE_PORT}/api/payments/stripe/success?session_id={CHECKOUT_SESSION_ID}`;
const DEFAULT_CANCEL_URL = `http://localhost:${SERVICE_PORT}/api/payments/stripe/cancel?session_id={CHECKOUT_SESSION_ID}`;
const EMITTED_PAYMENT_STATUSES = new Set(['completed', 'failed', 'refunded']);

const ensureUrlContainsSessionId = (url, fallbackUrl) => {
  const resolved = (url && String(url).trim()) || fallbackUrl;
  if (resolved.includes('{CHECKOUT_SESSION_ID}')) {
    return resolved;
  }

  const separator = resolved.includes('?') ? '&' : '?';
  return `${resolved}${separator}session_id={CHECKOUT_SESSION_ID}`;
};

const toStripeAmount = (amount) => {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Payment amount must be greater than zero');
  }

  return Math.round(parsed * 100);
};

const getStripeSessionUrls = (requestBody = {}) => ({
  successUrl: ensureUrlContainsSessionId(
    requestBody.successUrl || process.env.STRIPE_SUCCESS_URL,
    DEFAULT_SUCCESS_URL
  ),
  cancelUrl: ensureUrlContainsSessionId(
    requestBody.cancelUrl || process.env.STRIPE_CANCEL_URL,
    DEFAULT_CANCEL_URL
  ),
});

const ensureSeatLockForBooking = async (booking, sessionToken) => {
  if (!booking?.seat_id) {
    return true;
  }

  return validateSeatLock({
    userId: booking.user_id,
    eventId: booking.event_id,
    seatId: booking.seat_id,
    sessionToken,
  });
};

const syncBookingConfirmation = async (payment) => {
  try {
    await updateBookingStatus(payment.booking_id, 'confirmed');
  } catch (err) {
    console.warn(
      `Payment ${payment.id} completed but booking ${payment.booking_id} confirmation failed: ${err.message}`
    );
  }
};

const emitPaymentStatusEvent = async (payment) => {
  if (!payment || !EMITTED_PAYMENT_STATUSES.has(payment.status)) {
    return;
  }

  try {
    await publishPaymentEvent(`payment.${payment.status}`, payment);
  } catch (err) {
    console.warn(`Failed to publish payment.${payment.status} event: ${err.message}`);
  }
};

const resolvePaymentFromStripeSession = async (session) => {
  const metadataPaymentId = Number(session.metadata?.paymentId);
  const metadataBookingId = Number(session.metadata?.bookingId);

  let payment = null;

  if (metadataPaymentId) {
    payment = await getPaymentRecordById(metadataPaymentId);
  }

  if (!payment && session.id) {
    payment = await getPaymentByStripeSessionId(session.id);
  }

  if (!payment && metadataBookingId) {
    payment = await getLatestPaymentByBookingId(metadataBookingId);
  }

  if (!payment) {
    throw new Error(`Payment record not found for Stripe session ${session.id}`);
  }

  return payment;
};

const resolvePaymentFromPaymentIntent = async (paymentIntent) => {
  const metadataPaymentId = Number(paymentIntent.metadata?.paymentId);
  const metadataBookingId = Number(paymentIntent.metadata?.bookingId);

  let payment = null;

  if (metadataPaymentId) {
    payment = await getPaymentRecordById(metadataPaymentId);
  }

  if (!payment && paymentIntent.id) {
    payment = await getPaymentByStripePaymentIntentId(paymentIntent.id);
  }

  if (!payment && metadataBookingId) {
    payment = await getLatestPaymentByBookingId(metadataBookingId);
  }

  if (!payment) {
    throw new Error(`Payment record not found for Stripe payment intent ${paymentIntent.id}`);
  }

  return payment;
};

const markStripeSessionCompleted = async (session) => {
  const payment = await resolvePaymentFromStripeSession(session);
  const booking = await getBookingById(payment.booking_id);

  const updatedPayment = await updatePaymentStatusById(payment.id, 'completed', {
    paymentMethod: 'stripe',
    currency: session.currency || payment.currency || DEFAULT_CURRENCY,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId:
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || null,
    stripeCustomerId:
      typeof session.customer === 'string' ? session.customer : session.customer?.id || null,
    checkoutUrl: session.url || payment.checkout_url || null,
    failureReason: null,
    providerResponse: session,
    paidAt: new Date(),
  });

  if (updatedPayment) {
    await syncBookingConfirmation(updatedPayment);
    await deleteSeatLock({ eventId: booking.event_id, seatId: booking.seat_id });
    await emitPaymentStatusEvent(updatedPayment);
  }

  return updatedPayment;
};

const markStripeSessionFailed = async (session, failureReason) => {
  const payment = await resolvePaymentFromStripeSession(session);

  if (payment.status === 'completed') {
    return payment;
  }

  const updatedPayment = await updatePaymentStatusById(payment.id, 'failed', {
    paymentMethod: payment.payment_method === 'pending_selection' ? 'stripe' : payment.payment_method,
    stripeCheckoutSessionId: session.id || payment.stripe_checkout_session_id || null,
    stripePaymentIntentId:
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || payment.stripe_payment_intent_id || null,
    stripeCustomerId:
      typeof session.customer === 'string' ? session.customer : session.customer?.id || null,
    checkoutUrl: session.url || payment.checkout_url || null,
    failureReason,
    providerResponse: session,
  });

  await emitPaymentStatusEvent(updatedPayment);
  return updatedPayment;
};

const markPaymentIntentFailed = async (paymentIntent, failureReason) => {
  const payment = await resolvePaymentFromPaymentIntent(paymentIntent);

  if (payment.status === 'completed') {
    return payment;
  }

  const updatedPayment = await updatePaymentStatusById(payment.id, 'failed', {
    paymentMethod: payment.payment_method === 'pending_selection' ? 'stripe' : payment.payment_method,
    stripePaymentIntentId: paymentIntent.id,
    stripeCustomerId:
      typeof paymentIntent.customer === 'string'
        ? paymentIntent.customer
        : paymentIntent.customer?.id || null,
    failureReason,
    providerResponse: paymentIntent,
  });

  await emitPaymentStatusEvent(updatedPayment);
  return updatedPayment;
};

const getAllPayments = async (req, res) => {
  try {
    const payments = await getAllPaymentRecords();
    res.json(payments);
  } catch (err) {
    console.error('Error fetching payments:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await getPaymentRecordById(id);

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(payment);
  } catch (err) {
    console.error('Error fetching payment:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const createPayment = async (req, res) => {
  try {
    const body = req.body || {};
    const { bookingId, status, paymentMethod, currency, sessionToken } = body;

    if (!bookingId) {
      return res.status(400).json({ error: 'bookingId is required' });
    }

    const paymentStatus = status || 'pending';

    if (!VALID_STATUSES.includes(paymentStatus)) {
      return res.status(400).json({
        error: 'Invalid status. Must be: pending, completed, failed, or refunded',
      });
    }

    const booking = await getBookingById(bookingId);
    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot create a payment for a cancelled booking' });
    }
    const hasSeatLock = await ensureSeatLockForBooking(booking, sessionToken);
    if (!hasSeatLock) {
      return res.status(409).json({ error: 'Seat lock is required before payment' });
    }

    const payment = await createOrUpdatePendingPayment({
      bookingId: booking.id,
      userId: booking.user_id,
      amount: booking.total_amount,
      currency,
      paymentMethod: paymentMethod || 'pending_selection',
    });

    const updatedPayment =
      paymentStatus === 'pending'
        ? await setPaymentStateById(payment.id, {
            status: 'pending',
            paymentMethod: paymentMethod || payment.payment_method,
            currency: currency || payment.currency,
            failureReason: null,
            paidAt: null,
          })
        : await updatePaymentStatusById(payment.id, paymentStatus, {
            paymentMethod: paymentMethod || payment.payment_method,
            currency: currency || payment.currency,
            paidAt: paymentStatus === 'completed' ? new Date() : null,
            failureReason: paymentStatus === 'failed' ? 'Payment marked as failed manually' : null,
          });

    if (updatedPayment.status === 'completed') {
      await syncBookingConfirmation(updatedPayment);
      await deleteSeatLock({ eventId: booking.event_id, seatId: booking.seat_id });
    }

    await emitPaymentStatusEvent(updatedPayment);

    res.status(201).json(updatedPayment);
  } catch (err) {
    console.error('Error creating payment:', err.message);
    const statusCode = err.message.includes('Booking') ? 400 : 500;
    res.status(statusCode).json({ error: err.message });
  }
};

const updatePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const status = body.status?.trim();

    if (!status || !status.trim()) {
      return res.status(400).json({ error: 'Status is required' });
    }

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status. Must be: pending, completed, failed, or refunded',
      });
    }

    const updatedPayment = await updatePaymentStatusById(id, status, {
      paidAt: status === 'completed' ? new Date() : status === 'pending' ? null : undefined,
      failureReason:
        status === 'failed'
          ? body.failureReason || 'Payment marked as failed manually'
          : status === 'completed'
            ? null
            : undefined,
    });

    if (!updatedPayment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (updatedPayment.status === 'completed') {
      await syncBookingConfirmation(updatedPayment);
      const booking = await getBookingById(updatedPayment.booking_id);
      await deleteSeatLock({ eventId: booking.event_id, seatId: booking.seat_id });
    }

    await emitPaymentStatusEvent(updatedPayment);

    res.json(updatedPayment);
  } catch (err) {
    console.error('Error updating payment status:', err.message);
    const statusCode = err.message.startsWith('Invalid status') ? 400 : 500;
    res.status(statusCode).json({ error: err.message });
  }
};

const getPaymentsByBookingId = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const payments = await getPaymentRecordsByBookingId(bookingId);
    res.json(payments);
  } catch (err) {
    console.error('Error fetching payments by booking:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

const createStripeCheckoutSession = async (req, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).json({ error: 'Stripe is not configured. Set STRIPE_SECRET_KEY first.' });
    }

    const body = req.body || {};
    const { bookingId } = req.params;
    const sessionToken = req.body?.sessionToken;
    const booking = await getBookingById(bookingId);
    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot pay for a cancelled booking' });
    }
    const hasSeatLock = await ensureSeatLockForBooking(booking, sessionToken);
    if (!hasSeatLock) {
      return res.status(409).json({ error: 'Seat lock is required before payment' });
    }

    const existingPayment = await createOrUpdatePendingPayment({
      bookingId: booking.id,
      userId: booking.user_id,
      amount: booking.total_amount,
      currency: body.currency,
      paymentMethod: 'stripe',
    });

    if (existingPayment.status === 'completed') {
      return res.status(409).json({
        error: 'Payment for this booking is already completed',
        payment: existingPayment,
      });
    }

    const stripe = getStripeClient();
    const currency = normalizeCurrency(body.currency || existingPayment.currency || DEFAULT_CURRENCY);
    const { successUrl, cancelUrl } = getStripeSessionUrls(body);

    const metadata = {
      paymentId: String(existingPayment.id),
      bookingId: String(existingPayment.booking_id),
      userId: String(existingPayment.user_id),
    };

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: String(existingPayment.booking_id),
      metadata,
      payment_intent_data: {
        metadata,
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: toStripeAmount(existingPayment.amount),
            product_data: {
              name: `TickBook booking #${existingPayment.booking_id}`,
              description: `Payment for booking ${existingPayment.booking_id}`,
            },
          },
        },
      ],
    });

    const updatedPayment = await setPaymentStateById(existingPayment.id, {
      status: 'pending',
      paymentMethod: 'stripe',
      currency,
      stripeCheckoutSessionId: session.id,
      checkoutUrl: session.url || null,
      failureReason: null,
      providerResponse: session,
      paidAt: null,
    });

    await emitPaymentStatusEvent(updatedPayment);

    res.status(201).json({
      payment: updatedPayment,
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (err) {
    console.error('Error creating Stripe checkout session:', err.message);
    const statusCode =
      err.message.includes('Booking') || err.message.includes('Amount') ? 400 : 500;
    res.status(statusCode).json({ error: err.message });
  }
};

const handleStripeSuccess = async (req, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).json({ error: 'Stripe is not configured. Set STRIPE_SECRET_KEY first.' });
    }

    const sessionId = req.query.session_id;
    if (!sessionId) {
      return res.status(400).json({ error: 'session_id query parameter is required' });
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });

    if (session.payment_status !== 'paid') {
      const failedPayment = await markStripeSessionFailed(
        session,
        'Stripe redirected without a successful payment confirmation'
      );

      return res.status(400).json({
        error: 'Payment is not marked as paid by Stripe',
        payment: failedPayment,
        stripeStatus: session.payment_status,
      });
    }

    const updatedPayment = await markStripeSessionCompleted(session);

    res.json({
      message: 'Payment completed successfully',
      payment: updatedPayment,
    });
  } catch (err) {
    console.error('Error handling Stripe success redirect:', err.message);
    res.status(500).json({ error: err.message });
  }
};

const handleStripeCancel = async (req, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).json({ error: 'Stripe is not configured. Set STRIPE_SECRET_KEY first.' });
    }

    const sessionId = req.query.session_id;
    if (!sessionId) {
      return res.status(400).json({ error: 'session_id query parameter is required' });
    }

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });

    const updatedPayment = await markStripeSessionFailed(session, 'Customer cancelled Stripe checkout');

    res.json({
      message: 'Stripe checkout was cancelled',
      payment: updatedPayment,
    });
  } catch (err) {
    console.error('Error handling Stripe cancel redirect:', err.message);
    res.status(500).json({ error: err.message });
  }
};

const handleStripeWebhook = async (req, res) => {
  if (!isStripeConfigured()) {
    return res.status(503).json({ error: 'Stripe is not configured. Set STRIPE_SECRET_KEY first.' });
  }

  const stripe = getStripeClient();

  let event;
  try {
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      const signature = req.headers['stripe-signature'];
      if (!signature) {
        return res.status(400).json({ error: 'Missing Stripe signature header' });
      }

      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } else {
      event = JSON.parse(req.body.toString('utf8'));
    }
  } catch (err) {
    console.error('Stripe webhook verification failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await markStripeSessionCompleted(event.data.object);
        break;
      case 'checkout.session.expired':
        await markStripeSessionFailed(event.data.object, 'Stripe checkout session expired');
        break;
      case 'payment_intent.payment_failed':
        await markPaymentIntentFailed(
          event.data.object,
          event.data.object.last_payment_error?.message || 'Stripe payment failed'
        );
        break;
      case 'charge.refunded': {
        const charge = event.data.object;
        const payment = await getPaymentByStripePaymentIntentId(charge.payment_intent);
        if (payment) {
          const updatedPayment = await updatePaymentStatusById(payment.id, 'refunded', {
            providerResponse: charge,
            failureReason: null,
          });
          await emitPaymentStatusEvent(updatedPayment);
        }
        break;
      }
      default:
        console.log(`Ignoring Stripe webhook event type: ${event.type}`);
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('Error processing Stripe webhook:', err.message);
    return res.status(500).json({ error: 'Failed to process Stripe webhook' });
  }
};

module.exports = {
  createPayment,
  createStripeCheckoutSession,
  getAllPayments,
  getPaymentById,
  getPaymentsByBookingId,
  handleStripeCancel,
  handleStripeSuccess,
  handleStripeWebhook,
  updatePaymentStatus,
};
