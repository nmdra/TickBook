const { Kafka } = require('kafkajs');
const {
  createOrUpdatePendingPayment,
  getLatestPaymentByBookingId,
  updatePaymentStatusByBookingId,
} = require('../services/paymentService');

const kafka = new Kafka({
  clientId: 'payment-service',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});

const paymentsTopic = process.env.KAFKA_PAYMENTS_TOPIC || 'payments';

const consumer = kafka.consumer({ groupId: 'payment-service' });
const producer = kafka.producer();
const reconnectIntervalMs = parseInt(process.env.KAFKA_RECONNECT_INTERVAL_MS, 10) || 15000;

let isConnecting = false;
let isRunning = false;
let isShuttingDown = false;
let reconnectTimer = null;
let isProducerConnecting = false;
let isProducerConnected = false;

const clearReconnectTimer = () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
};

const scheduleReconnect = () => {
  if (isShuttingDown || isConnecting || isRunning || reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectConsumer();
  }, reconnectIntervalMs);

  console.warn(
    `Kafka consumer unavailable. Retrying connection in ${reconnectIntervalMs}ms.`
  );
};

const processBookingEvent = async (message) => {
  const value = JSON.parse(message.value.toString());
  const eventType = value.event_type || value.type || '';

  if (eventType === 'booking.created') {
    const bookingId = value.booking_id || value.bookingId || value.data?.bookingId;
    const userId = value.user_id || value.userId || value.data?.userId;
    const amount =
      value.amount ||
      value.total_amount ||
      value.totalAmount ||
      value.data?.amount ||
      value.data?.totalPrice;

    if (!bookingId || !userId || !amount) {
      throw new Error('booking.created event is missing booking_id, user_id, or amount');
    }

    await createOrUpdatePendingPayment({
      bookingId,
      userId,
      amount,
    });

    console.log(`Processed booking.created event for booking ${bookingId} (user: ${userId})`);
    return;
  }

  if (eventType === 'booking.cancelled') {
    const bookingId = value.booking_id || value.bookingId || value.data?.bookingId;

    if (!bookingId) {
      throw new Error('booking.cancelled event is missing booking_id');
    }

    const payment = await getLatestPaymentByBookingId(bookingId);
    if (payment && !['completed', 'refunded'].includes(payment.status)) {
      const updatedPayment = await updatePaymentStatusByBookingId(bookingId, 'failed', {
        failureReason: 'Booking was cancelled before payment completed',
      });
      if (updatedPayment) {
        await publishPaymentEvent('payment.failed', updatedPayment);
      }
    }

    console.log(`Processed booking.cancelled event for booking ${bookingId}`);
    return;
  }

  console.log(`Ignoring event of type: ${eventType}`);
};

const startMessageLoop = () => {
  consumer
    .run({
      eachMessage: async ({ message }) => {
        try {
          await processBookingEvent(message);
        } catch (err) {
          console.error('Error processing booking event:', err.message);
        }
      },
    })
    .catch(async (err) => {
      isRunning = false;
      console.warn('Kafka consumer stopped unexpectedly:', err.message);

      try {
        await consumer.disconnect();
      } catch (disconnectErr) {
        console.warn('Kafka consumer disconnect error:', disconnectErr.message);
      }

      scheduleReconnect();
    });
};

const connectConsumer = async () => {
  if (isShuttingDown || isConnecting || isRunning) {
    return;
  }

  isConnecting = true;
  clearReconnectTimer();

  try {
    await consumer.connect();
    await consumer.subscribe({ topic: 'bookings', fromBeginning: true });
    isRunning = true;
    console.log('Kafka consumer connected and listening on "bookings" topic');
    startMessageLoop();
  } catch (err) {
    console.warn('Kafka consumer connection failed (non-fatal):', err.message);

    try {
      await consumer.disconnect();
    } catch (disconnectErr) {
      console.warn('Kafka consumer disconnect error:', disconnectErr.message);
    }

    scheduleReconnect();
  } finally {
    isConnecting = false;
  }
};

const disconnectConsumer = async () => {
  isShuttingDown = true;
  isRunning = false;
  clearReconnectTimer();

  try {
    await consumer.disconnect();
  } catch (err) {
    console.warn('Kafka consumer disconnect error:', err.message);
  }
};

const connectProducer = async () => {
  if (isShuttingDown || isProducerConnecting || isProducerConnected) {
    return;
  }

  isProducerConnecting = true;

  try {
    await producer.connect();
    isProducerConnected = true;
    console.log(`Kafka producer connected for "${paymentsTopic}" topic`);
  } catch (err) {
    console.warn('Kafka producer connection failed (non-fatal):', err.message);
  } finally {
    isProducerConnecting = false;
  }
};

const disconnectProducer = async () => {
  isProducerConnected = false;

  try {
    await producer.disconnect();
  } catch (err) {
    console.warn('Kafka producer disconnect error:', err.message);
  }
};

const publishPaymentEvent = async (eventType, payment) => {
  if (!eventType || !payment || isShuttingDown) {
    return;
  }

  if (!isProducerConnected) {
    await connectProducer();
  }

  if (!isProducerConnected) {
    console.warn('Kafka producer unavailable. Skipping payment event publish.');
    return;
  }

  const parsedAmount = Number(payment.amount);
  const payload = {
    event_type: eventType,
    payment_id: payment.id,
    booking_id: payment.booking_id,
    user_id: payment.user_id,
    amount: Number.isFinite(parsedAmount) ? parsedAmount : 0,
    currency: payment.currency,
    status: payment.status,
    payment_method: payment.payment_method,
    failure_reason: payment.failure_reason,
    paid_at: payment.paid_at,
    created_at: payment.created_at,
    updated_at: payment.updated_at,
  };

  try {
    await producer.send({
      topic: paymentsTopic,
      messages: [
        {
          key: eventType,
          value: JSON.stringify(payload),
        },
      ],
    });
    console.log(`Published ${eventType} payment event for booking ${payment.booking_id}`);
  } catch (err) {
    console.warn('Failed to publish payment event:', err.message);
  }
};

module.exports = {
  connectConsumer,
  disconnectConsumer,
  connectProducer,
  disconnectProducer,
  publishPaymentEvent,
};
