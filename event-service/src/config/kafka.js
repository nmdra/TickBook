const { Kafka } = require('kafkajs');

let producer = null;

const createKafkaProducer = async () => {
  try {
    const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
    const kafka = new Kafka({
      clientId: 'event-service',
      brokers,
      retry: { retries: 3 },
    });

    producer = kafka.producer();
    await producer.connect();
    console.log('Connected to Kafka');
  } catch (err) {
    console.warn('Failed to connect to Kafka:', err.message);
    producer = null;
  }

  return producer;
};

const publishEvent = async (topic, key, message) => {
  if (!producer) {
    console.warn('Kafka producer not available, skipping publish');
    return;
  }

  try {
    await producer.send({
      topic,
      messages: [{ key, value: JSON.stringify(message) }],
    });
  } catch (err) {
    console.warn('Failed to publish Kafka message:', err.message);
  }
};

const disconnectKafka = async () => {
  if (producer) {
    try {
      await producer.disconnect();
    } catch (err) {
      console.warn('Error disconnecting Kafka:', err.message);
    }
  }
};

module.exports = { createKafkaProducer, publishEvent, disconnectKafka };
