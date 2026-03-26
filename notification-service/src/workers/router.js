const { Kafka } = require('kafkajs');
const { DOMAIN_TOPICS, INTERNAL_TOPICS } = require('../config/topics');
const { getPreferences } = require('../config/preferences');
const { resolveTemplate } = require('../config/templates');

const EVENT_CHANNEL_RULES = {
  'event.created': ['email', 'push'],
  'booking.created': ['email', 'push', 'sms'],
  'booking.confirmed': ['email', 'push', 'sms'],
  'booking.cancelled': ['email', 'push'],
  'payment.failed': ['email', 'sms', 'push'],
  'seat.lock.expired': ['push', 'email'],
  'waitlist.offer.sent': ['push', 'sms', 'email'],
  'refund.issued': ['email'],
  'waitlist.position.updated': ['push'],
};

const buildIdempotencyKey = (userId, eventType, eventId, channel) =>
  `${userId}:${eventType}:${eventId}:${channel}`;

const startRouter = async () => {
  const kafka = new Kafka({
    clientId: process.env.NOTIF_ROUTER_CLIENT_ID || 'notification-router',
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  });

  const consumer = kafka.consumer({ groupId: process.env.NOTIF_ROUTER_GROUP || 'notification-router' });
  const producer = kafka.producer();

  await consumer.connect();
  await producer.connect();

  for (const topic of DOMAIN_TOPICS) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }

  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message }) => {
      const payload = JSON.parse(message.value.toString());
      const eventType = payload.event_type || payload.eventType || topic;
      const userId = payload.user_id || payload.userId;
      const eventId = payload.booking_id || payload.bookingId || payload.event_id || payload.eventId || payload.id;

      if (!userId || !eventType) {
        await consumer.commitOffsets([
          { topic, partition, offset: String(Number(message.offset) + 1) },
        ]);
        return;
      }

      const prefs = getPreferences(userId);
      const channels = (EVENT_CHANNEL_RULES[eventType] || []).filter((channel) => prefs.channels?.[channel]);

      for (const channel of channels) {
        const template = resolveTemplate(eventType, channel, prefs.locale || 'en');
        if (!template) {
          continue;
        }

        const notification = {
          userId,
          channel,
          eventType,
          eventId,
          locale: prefs.locale || 'en',
          timezone: prefs.timezone || 'UTC',
          idempotencyKey: buildIdempotencyKey(userId, eventType, eventId, channel),
          template,
          payload,
          createdAt: new Date().toISOString(),
        };

        await producer.send({
          topic: INTERNAL_TOPICS[channel],
          messages: [{ key: String(userId), value: JSON.stringify(notification) }],
        });
      }

      await consumer.commitOffsets([
        { topic, partition, offset: String(Number(message.offset) + 1) },
      ]);
    },
  });
};

module.exports = {
  startRouter,
  buildIdempotencyKey,
};
