const { Kafka } = require('kafkajs');
const { pool } = require('./db');

const kafka = new Kafka({
  clientId: 'payment-service',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});

const consumer = kafka.consumer({ groupId: 'payment-service' });

const connectConsumer = async () => {
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: 'bookings', fromBeginning: true });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const value = JSON.parse(message.value.toString());
          const eventType = value.type || '';

          if (eventType === 'booking.created') {
            const data = value.data;
            const bookingId = data.bookingId;
            const userId = data.userId;
            const amount = data.totalPrice || 0;

            await pool.query(
              `INSERT INTO payments (booking_id, user_id, amount, status, payment_method)
               VALUES ($1, $2, $3, $4, $5) RETURNING *`,
              [bookingId, userId, amount, 'pending', 'pending_selection']
            );

            console.log(`Processed booking.created event for booking ${bookingId} (user: ${userId})`);
          } else {
            console.log(`Ignoring event of type: ${eventType}`);
          }
        } catch (err) {
          console.error('Error processing booking event:', err.message);
        }
      },
    });

    console.log('Kafka consumer connected and listening on "bookings" topic');
  } catch (err) {
    console.warn('Kafka consumer connection failed (non-fatal):', err.message);
  }
};

const disconnectConsumer = async () => {
  try {
    await consumer.disconnect();
  } catch (err) {
    console.warn('Kafka consumer disconnect error:', err.message);
  }
};

module.exports = { connectConsumer, disconnectConsumer };
