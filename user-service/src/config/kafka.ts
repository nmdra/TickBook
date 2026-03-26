import { Kafka } from 'kafkajs';
import { logger } from '../utils/logger';

const kafka = new Kafka({
  clientId: 'user-service',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});

const consumer = kafka.consumer({ groupId: 'user-service-group' });
const producer = kafka.producer();
let producerConnected = false;

export const connectConsumer = async (): Promise<void> => {
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: 'bookings', fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const value = message.value?.toString() ?? '';

          try {
            JSON.parse(value);
          } catch {
            // Preserve passive logging behavior while ensuring malformed JSON never crashes the consumer.
          }

          logger.info(`[Kafka] Received message on "${topic}" (partition ${partition}): ${value}`);
        } catch (error) {
          logger.warn(
            `Kafka consumer message handling failed (non-fatal): ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      },
    });

    logger.success('Kafka consumer connected and listening on "bookings" topic');
  } catch (error) {
    logger.warn(
      `Kafka consumer connection failed (non-fatal): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

export const disconnectConsumer = async (): Promise<void> => {
  try {
    await consumer.disconnect();
    logger.info('Kafka consumer disconnected.');
  } catch (error) {
    logger.warn(
      `Kafka consumer disconnect error: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

const connectProducer = async (): Promise<void> => {
  if (producerConnected) {
    return;
  }

  await producer.connect();
  producerConnected = true;
};

export const publishUserEvent = async (
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> => {
  try {
    await connectProducer();
    await producer.send({
      topic: process.env.KAFKA_USERS_TOPIC || 'users',
      messages: [
        {
          key: eventType,
          value: JSON.stringify({
            event_type: eventType,
            ...payload,
          }),
        },
      ],
    });
  } catch (error) {
    logger.warn(
      `Kafka producer publish failed (non-fatal): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};

export const disconnectProducer = async (): Promise<void> => {
  if (!producerConnected) {
    return;
  }

  try {
    await producer.disconnect();
    producerConnected = false;
    logger.info('Kafka producer disconnected.');
  } catch (error) {
    logger.warn(
      `Kafka producer disconnect error: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
};
