const { Kafka } = require('kafkajs');

const INTERNAL_TOPICS = {
  email: process.env.NOTIF_EMAIL_TOPIC || 'notif.email',
  sms: process.env.NOTIF_SMS_TOPIC || 'notif.sms',
  push: process.env.NOTIF_PUSH_TOPIC || 'notif.push',
  whatsapp: process.env.NOTIF_WHATSAPP_TOPIC || 'notif.whatsapp',
};

const DOMAIN_TOPICS = (process.env.NOTIF_DOMAIN_TOPICS ||
  'booking.confirmed,booking.cancelled,payment.failed,seat.lock.expired,waitlist.offer.sent,refund.issued,waitlist.position.updated')
  .split(',')
  .map((topic) => topic.trim())
  .filter(Boolean);

const EVENT_CHANNEL_RULES = {
  'booking.confirmed': ['email', 'push', 'sms'],
  'booking.cancelled': ['email', 'push'],
  'payment.failed': ['email', 'sms', 'push'],
  'seat.lock.expired': ['push', 'email'],
  'waitlist.offer.sent': ['push', 'sms', 'email'],
  'refund.issued': ['email'],
  'waitlist.position.updated': ['push'],
};

const TEMPLATE_REGISTRY = {
  'booking.confirmed': {
    email: { en: { id: 'booking-confirmed-email-v1' } },
    push: { en: { id: 'booking-confirmed-push-v1' } },
    sms: { en: { id: 'booking-confirmed-sms-v1' } },
  },
  'booking.cancelled': {
    email: { en: { id: 'booking-cancelled-email-v1' } },
    push: { en: { id: 'booking-cancelled-push-v1' } },
  },
  'payment.failed': {
    email: { en: { id: 'payment-failed-email-v1' } },
    sms: { en: { id: 'payment-failed-sms-v1' } },
    push: { en: { id: 'payment-failed-push-v1' } },
  },
  'seat.lock.expired': {
    email: { en: { id: 'seat-lock-expired-email-v1' } },
    push: { en: { id: 'seat-lock-expired-push-v1' } },
  },
  'waitlist.offer.sent': {
    email: { en: { id: 'waitlist-offer-email-v1' } },
    sms: { en: { id: 'waitlist-offer-sms-v1' } },
    push: { en: { id: 'waitlist-offer-push-v1' } },
  },
  'refund.issued': {
    email: { en: { id: 'refund-issued-email-v1' } },
  },
  'waitlist.position.updated': {
    push: { en: { id: 'waitlist-position-push-v1' } },
  },
};

const inMemoryPreferences = new Map();
const setUserPreference = (userId, prefs) => {
  inMemoryPreferences.set(Number(userId), prefs);
};

const resolveUserPreferences = (userId) => {
  const userPrefs = inMemoryPreferences.get(Number(userId));
  if (userPrefs) {
    return userPrefs;
  }

  return {
    locale: 'en',
    timezone: 'UTC',
    channels: {
      email: true,
      sms: true,
      push: true,
      whatsapp: false,
    },
  };
};

const resolveTemplate = (eventType, channel, locale = 'en') => {
  const channelTemplates = TEMPLATE_REGISTRY[eventType]?.[channel];
  if (!channelTemplates) {
    return null;
  }

  return channelTemplates[locale] || channelTemplates.en || null;
};

const activeChannelsForEvent = (eventType, preferences, payload) => {
  const eventChannels = EVENT_CHANNEL_RULES[eventType] || [];
  return eventChannels.filter((channel) => {
    if (!preferences?.channels?.[channel]) {
      return false;
    }

    if (eventType === 'waitlist.position.updated') {
      const position = Number(payload.position ?? payload.data?.position ?? 0);
      const delta = Number(payload.delta ?? payload.data?.delta ?? 0);
      if (position > 10 && delta < 5) {
        return false;
      }
    }

    return true;
  });
};

const buildIdempotencyKey = (userId, eventType, eventId, channel) =>
  `${userId}:${eventType}:${eventId}:${channel}`;

const extractDomainEvent = (message) => {
  const rawPayload = JSON.parse(message.value.toString());
  const eventType = rawPayload.event_type || rawPayload.eventType;
  return {
    eventType,
    payload: rawPayload,
  };
};

const shouldSkipEvent = (eventType, payload) => {
  if (!eventType) {
    return true;
  }
  const userId = payload.user_id || payload.userId;
  return !userId;
};

const getEventIdForNotification = (payload) =>
  payload.booking_id || payload.bookingId || payload.event_id || payload.eventId || payload.id;

const startNotificationRouter = async () => {
  const kafka = new Kafka({
    clientId: 'notification-router',
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
    eachMessage: async ({ topic, partition, message, heartbeat, pause }) => {
      try {
        const { eventType, payload } = extractDomainEvent(message);
        if (shouldSkipEvent(eventType, payload)) {
          await consumer.commitOffsets([
            {
              topic,
              partition,
              offset: String(Number(message.offset) + 1),
            },
          ]);
          return;
        }

        const userId = payload.user_id || payload.userId;
        const eventId = getEventIdForNotification(payload);
        const preferences = resolveUserPreferences(userId);
        const channels = activeChannelsForEvent(eventType, preferences, payload);
        const locale = preferences.locale || 'en';

        for (const channel of channels) {
          const template = resolveTemplate(eventType, channel, locale);
          if (!template) {
            continue;
          }

          const notificationPayload = {
            userId,
            eventType,
            eventId,
            channel,
            locale,
            timezone: preferences.timezone || 'UTC',
            idempotencyKey: buildIdempotencyKey(userId, eventType, eventId, channel),
            templateId: template.id,
            payload,
            createdAt: new Date().toISOString(),
          };

          await producer.send({
            topic: INTERNAL_TOPICS[channel],
            messages: [{ key: String(userId), value: JSON.stringify(notificationPayload) }],
          });
          await heartbeat();
        }

        await consumer.commitOffsets([
          {
            topic,
            partition,
            offset: String(Number(message.offset) + 1),
          },
        ]);
      } catch (err) {
        console.warn('Notification router failed to process event:', err.message);
        pause();
        setTimeout(() => {
          consumer.resume([{ topic }]);
        }, 1000);
      }
    },
  });
};

module.exports = {
  startNotificationRouter,
  setUserPreference,
  buildIdempotencyKey,
  activeChannelsForEvent,
  resolveTemplate,
};
