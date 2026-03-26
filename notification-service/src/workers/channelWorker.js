const { Kafka } = require('kafkajs');
const { INTERNAL_TOPICS, DLQ_TOPICS } = require('../config/topics');
const { interpolate } = require('../config/templates');
const { sendEmail, sendSMS, sendWhatsApp, sendPush } = require('../config/providers');

const RETRY_POLICIES = {
  email: [30_000, 120_000, 600_000, 1_800_000, 7_200_000],
  sms: [30_000, 120_000, 300_000, 900_000, 3_600_000],
  push: [30_000, 120_000, 600_000],
  whatsapp: [60_000, 300_000, 1_200_000, 3_600_000],
};

const deliveryLog = new Map();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildContent = (notification) => {
  const payload = notification.payload || {};
  const bookingId = payload.booking_id || payload.bookingId || 'N/A';
  const eventId = payload.event_id || payload.eventId || '';
  const title = payload.title || payload.event_title || payload.name || 'Untitled';
  const position = payload.position || payload.data?.position || '';

  const templatePayload = {
    ...payload,
    bookingId,
    eventId,
    title,
    position,
  };

  return {
    subject: notification.template.subject
      ? interpolate(notification.template.subject, templatePayload)
      : undefined,
    body: notification.template.body
      ? interpolate(notification.template.body, templatePayload)
      : '',
  };
};

const sendByChannel = async (channel, notification) => {
  const { subject, body } = buildContent(notification);
  const destination = notification.payload?.email || notification.payload?.phone || notification.payload?.deviceToken;

  if (!destination) {
    throw new Error(`Missing destination for channel ${channel}`);
  }

  if (channel === 'email') {
    await sendEmail({ to: destination, subject: subject || 'TickBook notification', text: body, html: `<p>${body}</p>` });
    return;
  }

  if (channel === 'sms') {
    await sendSMS({ to: destination, body });
    return;
  }

  if (channel === 'whatsapp') {
    const to = destination.startsWith('whatsapp:') ? destination : `whatsapp:${destination}`;
    await sendWhatsApp({ to, body });
    return;
  }

  await sendPush({ to: destination, body });
};

const processWithRetry = async (channel, notification) => {
  const retryDelays = RETRY_POLICIES[channel] || [];
  const maxAttempts = retryDelays.length + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await sendByChannel(channel, notification);
      deliveryLog.set(notification.idempotencyKey, {
        status: 'delivered',
        attempts: attempt,
        updatedAt: new Date().toISOString(),
      });
      return true;
    } catch (err) {
      deliveryLog.set(notification.idempotencyKey, {
        status: 'retrying',
        attempts: attempt,
        error: err.message,
        updatedAt: new Date().toISOString(),
      });

      if (attempt <= retryDelays.length) {
        await wait(retryDelays[attempt - 1]);
      }
    }
  }

  return false;
};

const startChannelWorker = async (channel) => {
  const topic = INTERNAL_TOPICS[channel];
  if (!topic) {
    throw new Error(`Unknown channel: ${channel}`);
  }

  const kafka = new Kafka({
    clientId: `notification-${channel}-worker-${process.env.HOSTNAME || 'local'}`,
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  });

  const consumer = kafka.consumer({ groupId: `notification-${channel}-worker` });
  const producer = kafka.producer();

  await consumer.connect();
  await producer.connect();
  await consumer.subscribe({ topic, fromBeginning: false });

  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic: messageTopic, partition, message }) => {
      const notification = JSON.parse(message.value.toString());

      if (deliveryLog.get(notification.idempotencyKey)?.status === 'delivered') {
        await consumer.commitOffsets([
          { topic: messageTopic, partition, offset: String(Number(message.offset) + 1) },
        ]);
        return;
      }

      const delivered = await processWithRetry(channel, notification);
      if (!delivered) {
        await producer.send({
          topic: DLQ_TOPICS[channel],
          messages: [{ key: String(notification.userId), value: JSON.stringify({ ...notification, failedAt: new Date().toISOString() }) }],
        });
      }

      await consumer.commitOffsets([
        { topic: messageTopic, partition, offset: String(Number(message.offset) + 1) },
      ]);
    },
  });
};

module.exports = {
  startChannelWorker,
  RETRY_POLICIES,
};
