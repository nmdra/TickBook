const { Kafka } = require('kafkajs');
const logger = require('./logger');

let producer = null;
let consumer = null;

const createKafkaProducer = async () => {
  try {
    const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
    const kafka = new Kafka({
      clientId: 'event-service-producer',
      brokers,
      retry: { retries: 3 },
    });

    producer = kafka.producer();
    await producer.connect();
    logger.info('Kafka producer connected');
  } catch (err) {
    logger.warn('Failed to connect Kafka producer', { error: err.message });
    producer = null;
  }

  return producer;
};

const startKafkaConsumer = async () => {
  const { getBookingById } = require('../services/bookingService');
  const { reduceTicketsByBooking } = require('../controllers/eventController');

  try {
    const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
    const kafka = new Kafka({
      clientId: 'event-service-consumer',
      brokers,
    });

    consumer = kafka.consumer({ groupId: 'event-service-group' });
    await consumer.connect();
    await consumer.subscribe({ topic: 'payments', fromBeginning: false });

    logger.info('Kafka consumer connected and listening on "payments" topic');

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const payload = JSON.parse(message.value.toString());
          const eventType = payload.event_type || payload.type;

          if (eventType === 'payment.completed') {
            const bookingId = payload.booking_id || payload.bookingId;
            if (!bookingId) {
              logger.warn('payment.completed event missing booking_id');
              return;
            }

            logger.info(`Processing payment confirmation for booking ${bookingId}`);

            // Fetch booking details to get event_id and tickets count
            const booking = await getBookingById(bookingId);
            if (booking && booking.event_id && booking.tickets) {
              await reduceTicketsByBooking(booking.event_id, booking.tickets);
            } else {
              logger.warn(`Could not retrieve booking details for ${bookingId} to reduce tickets`);
            }
          }
        } catch (err) {
          logger.error('Error processing Kafka message in Event Service:', err.message);
        }
      },
    });
  } catch (err) {
    logger.error('Failed to start Kafka consumer in Event Service:', err.message);
  }
};

const publishEvent = async (topic, key, message) => {
  if (!producer) {
    logger.warn('Kafka producer not available, skipping publish');
    return;
  }

  try {
    await producer.send({
      topic,
      messages: [{ key, value: JSON.stringify(message) }],
    });
  } catch (err) {
    logger.warn('Failed to publish Kafka message', { error: err.message, topic, key });
  }
};

const disconnectKafka = async () => {
  if (producer) {
    try {
      await producer.disconnect();
    } catch (err) {
      logger.warn('Error disconnecting Kafka producer', { error: err.message });
    }
  }
  if (consumer) {
    try {
      await consumer.disconnect();
    } catch (err) {
      logger.warn('Error disconnecting Kafka consumer', { error: err.message });
    }
  }
};

module.exports = { createKafkaProducer, startKafkaConsumer, publishEvent, disconnectKafka };
