const { Kafka } = require('kafkajs');
const { DOMAIN_TOPICS, INTERNAL_TOPICS } = require('../config/topics');
const { getPreferences } = require('../config/preferences');
const { resolveTemplate } = require('../config/templates');

const EVENT_CHANNEL_RULES = {
  'user.registered': ['email'],
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

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://user-service:3002';
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || '';

const fetchAllUsers = async () => {
  const response = await fetch(`${USER_SERVICE_URL}/api/users/internal/all`, {
    headers: INTERNAL_SERVICE_TOKEN
      ? { 'x-internal-token': INTERNAL_SERVICE_TOKEN }
      : {},
  });
  if (!response.ok) {
    throw new Error(`User service returned status ${response.status}`);
  }
  const users = await response.json();
  return Array.isArray(users) ? users : [];
};

const resolveTargets = async (eventType, payload) => {
  if (eventType === 'event.created') {
    return fetchAllUsers();
  }

  const singleUserId = payload.user_id || payload.userId;
  return singleUserId ? [{ id: singleUserId, email: payload.email, phone: payload.phone }] : [];
};

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
      const eventId = payload.booking_id || payload.bookingId || payload.event_id || payload.eventId || payload.id;

      if (!eventType) {
        await consumer.commitOffsets([
          { topic, partition, offset: String(Number(message.offset) + 1) },
        ]);
        return;
      }

      let targets = [];
      try {
        targets = await resolveTargets(eventType, payload);
      } catch (error) {
        console.warn(
          `Failed resolving notification targets for ${eventType}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      if (!targets.length) {
        await consumer.commitOffsets([
          { topic, partition, offset: String(Number(message.offset) + 1) },
        ]);
        return;
      }

      for (const target of targets) {
        const userId = target.id || target.user_id || target.userId;
        if (!userId) {
          continue;
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
            payload: {
              ...payload,
              user_id: userId,
              email: target.email || payload.email,
              phone: target.phone || payload.phone,
            },
            createdAt: new Date().toISOString(),
          };

          await producer.send({
            topic: INTERNAL_TOPICS[channel],
            messages: [{ key: String(userId), value: JSON.stringify(notification) }],
          });
        }
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
