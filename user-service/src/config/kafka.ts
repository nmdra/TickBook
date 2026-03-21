import { Kafka } from 'kafkajs';
import { logger } from '../utils/logger';

const kafka = new Kafka({
  clientId: 'user-service',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});

const consumer = kafka.consumer({ groupId: 'user-service-group' });

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
