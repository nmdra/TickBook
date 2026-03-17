const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'user-service',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});

const consumer = kafka.consumer({ groupId: 'user-service-group' });

const connectConsumer = async () => {
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: 'bookings', fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const rawValue = message.value.toString();

        try {
          const payload = JSON.parse(rawValue);
          const eventType = payload.event_type || payload.type || 'unknown';
          console.log(
            `[Kafka] Received ${eventType} on "${topic}" (partition ${partition}):`,
            payload
          );
        } catch (err) {
          console.warn(`[Kafka] Ignoring malformed message on "${topic}":`, rawValue);
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
