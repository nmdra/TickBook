const { Kafka } = require('kafkajs');
const logger = require('./logger');

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
    logger.info('Connected to Kafka');
  } catch (err) {
    logger.warn('Failed to connect to Kafka', { error: err.message });
    producer = null;
  }

  return producer;
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
      logger.warn('Error disconnecting Kafka', { error: err.message });
    }
  }
};

module.exports = { createKafkaProducer, publishEvent, disconnectKafka };
