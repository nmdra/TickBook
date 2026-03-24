const { Kafka } = require('kafkajs');

const RETRY_POLICIES = {
  email: [30_000, 120_000, 600_000, 1_800_000, 7_200_000],
  sms: [30_000, 120_000, 300_000, 900_000, 3_600_000],
  push: [30_000, 120_000, 600_000],
  whatsapp: [60_000, 300_000, 1_200_000, 3_600_000],
};

const CHANNEL_TOPICS = {
  email: process.env.NOTIF_EMAIL_TOPIC || 'notif.email',
  sms: process.env.NOTIF_SMS_TOPIC || 'notif.sms',
  push: process.env.NOTIF_PUSH_TOPIC || 'notif.push',
  whatsapp: process.env.NOTIF_WHATSAPP_TOPIC || 'notif.whatsapp',
};

const CHANNEL_DLQ_TOPICS = {
  email: process.env.NOTIF_EMAIL_DLQ_TOPIC || 'notif.email.dlq',
  sms: process.env.NOTIF_SMS_DLQ_TOPIC || 'notif.sms.dlq',
  push: process.env.NOTIF_PUSH_DLQ_TOPIC || 'notif.push.dlq',
  whatsapp: process.env.NOTIF_WHATSAPP_DLQ_TOPIC || 'notif.whatsapp.dlq',
};

const CRITICAL_EVENTS = new Set(['payment.failed', 'waitlist.offer.sent']);

const deliveryLog = new Map();

const setDeliveryLog = (idempotencyKey, value) => {
  deliveryLog.set(idempotencyKey, {
    ...value,
    updatedAt: new Date().toISOString(),
  });
};

const getDeliveryLog = (idempotencyKey) => deliveryLog.get(idempotencyKey);

const sendToProvider = async (channel, payload) => {
  await Promise.race([
    new Promise((resolve) => setTimeout(resolve, 10)),
    new Promise((_, reject) => setTimeout(() => reject(new Error('provider timeout')), 10_000)),
  ]);
  console.log(
    `Notification sent via ${channel} for user ${payload.userId}, event ${payload.eventType}, key ${payload.idempotencyKey}`
  );
};

const delay = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const trySendWithRetry = async (channel, payload) => {
  const retries = RETRY_POLICIES[channel] || [];
  const attempts = retries.length;

  for (let index = 0; index < attempts; index += 1) {
    try {
      await sendToProvider(channel, payload);
      setDeliveryLog(payload.idempotencyKey, {
        status: 'delivered',
        attempts: index + 1,
        errors: null,
        deliveredAt: new Date().toISOString(),
      });
      return true;
    } catch (err) {
      setDeliveryLog(payload.idempotencyKey, {
        status: 'retrying',
        attempts: index + 1,
        errors: err.message,
      });
      if (index < retries.length - 1) {
        await delay(retries[index]);
      }
    }
  }

  setDeliveryLog(payload.idempotencyKey, {
    status: 'failed',
    attempts,
    errors: 'retry exhausted',
  });
  return false;
};

const publishToDLQ = async (producer, channel, payload, reason) => {
  await producer.send({
    topic: CHANNEL_DLQ_TOPICS[channel],
    messages: [
      {
        key: String(payload.userId),
        value: JSON.stringify({
          ...payload,
          dlqReason: reason,
          failedAt: new Date().toISOString(),
        }),
      },
    ],
  });
};

const fallbackChannel = (eventType, channel) => {
  if (!CRITICAL_EVENTS.has(eventType)) {
    return null;
  }

  const fallbackChains = {
    'waitlist.offer.sent': ['push', 'sms', 'email'],
    'payment.failed': ['sms', 'email', 'push'],
  };
  const chain = fallbackChains[eventType] || [];
  const currentIndex = chain.indexOf(channel);
  if (currentIndex === -1 || currentIndex === chain.length - 1) {
    return null;
  }
  return chain[currentIndex + 1];
};

const startChannelWorker = async (channel) => {
  if (!CHANNEL_TOPICS[channel]) {
    throw new Error(`Unsupported channel worker: ${channel}`);
  }

  const kafka = new Kafka({
    clientId: `notification-${channel}-worker`,
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  });

  const consumer = kafka.consumer({ groupId: `notification-${channel}-worker` });
  const producer = kafka.producer();

  await consumer.connect();
  await producer.connect();
  await consumer.subscribe({ topic: CHANNEL_TOPICS[channel], fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const payload = JSON.parse(message.value.toString());
      const existing = getDeliveryLog(payload.idempotencyKey);
      if (existing?.status === 'delivered') {
        return;
      }

      const delivered = await trySendWithRetry(channel, payload);
      if (delivered) {
        return;
      }

      await publishToDLQ(producer, channel, payload, 'max retries exhausted');
      const fallback = fallbackChannel(payload.eventType, channel);
      if (fallback) {
        await producer.send({
          topic: CHANNEL_TOPICS[fallback],
          messages: [
            {
              key: String(payload.userId),
              value: JSON.stringify({
                ...payload,
                channel: fallback,
                idempotencyKey: `${payload.userId}:${payload.eventType}:${payload.eventId}:${fallback}`,
                fallbackFrom: channel,
              }),
            },
          ],
        });
      }
    },
  });
};

module.exports = {
  startChannelWorker,
  RETRY_POLICIES,
};
