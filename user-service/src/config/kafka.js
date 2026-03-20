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
        const value = message.value.toString();
        console.log(`[Kafka] Received message on "${topic}" (partition ${partition}):`, value);
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
