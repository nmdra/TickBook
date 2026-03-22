import { Kafka } from 'kafkajs';
import { logger } from '../utils/logger';
import { UserRepository } from '../repositories/userRepository';

const kafka = new Kafka({
  clientId: 'user-service',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});

const consumer = kafka.consumer({ groupId: 'user-service-group' });
const reconnectIntervalMs = parseInt(process.env.KAFKA_RECONNECT_INTERVAL_MS || '', 10) || 15000;

let isConnecting = false;
let isRunning = false;
let isShuttingDown = false;
let reconnectTimer: NodeJS.Timeout | null = null;

const clearReconnectTimer = (): void => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
};

const scheduleReconnect = (): void => {
  if (isShuttingDown || isConnecting || isRunning || reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectConsumer();
  }, reconnectIntervalMs);

  logger.warn(`Kafka consumer unavailable. Retrying connection in ${reconnectIntervalMs}ms.`);
};

const parseNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const processBookingEvent = async (rawValue: string): Promise<void> => {
  if (!rawValue) {
    return;
  }

  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(rawValue);
  } catch {
    logger.warn('[Kafka] Received malformed booking event payload.');
    return;
  }

  if (!payload || typeof payload !== 'object') {
    logger.warn('[Kafka] Received non-object booking event payload.');
    return;
  }

  const data =
    typeof payload.data === 'object' && payload.data !== null
      ? (payload.data as Record<string, unknown>)
      : undefined;
  const eventType = String(payload.event_type ?? '');
  if (eventType !== 'booking.created' && eventType !== 'booking.cancelled') {
    logger.info(`[Kafka] Ignoring event of type "${eventType}".`);
    return;
  }

  const userId = parseNumber(payload.user_id ?? payload.userId ?? data?.userId);
  const tickets = parseNumber(payload.tickets ?? data?.tickets);
  const bookingId = parseNumber(payload.booking_id ?? payload.bookingId ?? data?.bookingId);

  if (!userId || !tickets) {
    logger.warn(`[Kafka] ${eventType} event missing user_id or tickets.`);
    return;
  }

  const normalizedTickets = Math.abs(tickets);
  const delta = eventType === 'booking.cancelled' ? -normalizedTickets : normalizedTickets;
  const userRepository = new UserRepository();
  const updated = await userRepository.adjustTicketsBooked(userId, delta);

  if (!updated) {
    logger.error(`[Kafka] ${eventType} event for unknown user ${userId}.`);
    return;
  }

  logger.info(
    `[Kafka] Applied ${eventType} for user ${userId}` +
      `${bookingId ? ` (booking ${bookingId})` : ''}: ${delta > 0 ? '+' : ''}${delta} tickets.`
  );
};

const startMessageLoop = (): void => {
  consumer
    .run({
      eachMessage: async ({ message }) => {
        try {
          const value = message.value?.toString() ?? '';
          await processBookingEvent(value);
        } catch (error) {
          logger.warn(
            `Kafka consumer message handling failed (non-fatal): ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      },
    })
    .catch(async (error) => {
      isRunning = false;
      logger.warn(
        `Kafka consumer stopped unexpectedly (non-fatal): ${
          error instanceof Error ? error.message : String(error)
        }`
      );

      try {
        await consumer.disconnect();
      } catch (disconnectError) {
        logger.warn(
          `Kafka consumer disconnect error: ${
            disconnectError instanceof Error ? disconnectError.message : String(disconnectError)
          }`
        );
      }

      scheduleReconnect();
    });
};

export const connectConsumer = async (): Promise<void> => {
  if (isShuttingDown || isConnecting || isRunning) {
    return;
  }

  isConnecting = true;
  clearReconnectTimer();

  try {
    await consumer.connect();
    await consumer.subscribe({ topic: 'bookings', fromBeginning: false });
    isRunning = true;
    logger.success('Kafka consumer connected and listening on "bookings" topic');
    startMessageLoop();
  } catch (error) {
    logger.warn(
      `Kafka consumer connection failed (non-fatal): ${
        error instanceof Error ? error.message : String(error)
      }`
    );

    try {
      await consumer.disconnect();
    } catch (disconnectError) {
      logger.warn(
        `Kafka consumer disconnect error: ${
          disconnectError instanceof Error ? disconnectError.message : String(disconnectError)
        }`
      );
    }

    scheduleReconnect();
  } finally {
    isConnecting = false;
  }
};

export const disconnectConsumer = async (): Promise<void> => {
  isShuttingDown = true;
  isRunning = false;
  clearReconnectTimer();

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
