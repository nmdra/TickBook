const TEMPLATE_REGISTRY = {
  'user.registered': {
    email: {
      en: {
        subject: 'Welcome to TickBook',
        body: 'Hi {{name}}, your TickBook account has been created successfully.',
      },
    },
  },
  'event.created': {
    email: { en: { subject: 'New event published', body: 'A new event "{{title}}" is now available.' } },
    push: { en: { body: 'New event "{{title}}" is now live.' } },
  },
  'booking.created': {
    email: { en: { subject: 'Booking received', body: 'Your booking {{bookingId}} has been created and is pending payment.' } },
    push: { en: { body: 'Booking {{bookingId}} created. Complete payment to confirm it.' } },
    sms: { en: { body: 'Booking {{bookingId}} created. Payment pending.' } },
  },
  'booking.confirmed': {
    email: { en: { subject: 'Booking confirmed', body: 'Your booking {{bookingId}} is confirmed.' } },
    push: { en: { body: 'Booking {{bookingId}} confirmed.' } },
    sms: { en: { body: 'Booking {{bookingId}} confirmed.' } },
  },
  'booking.cancelled': {
    email: { en: { subject: 'Booking cancelled', body: 'Booking {{bookingId}} has been cancelled.' } },
    push: { en: { body: 'Booking {{bookingId}} cancelled.' } },
  },
  'payment.failed': {
    email: { en: { subject: 'Payment failed', body: 'Payment failed for booking {{bookingId}}.' } },
    sms: { en: { body: 'Payment failed for booking {{bookingId}}.' } },
    push: { en: { body: 'Payment failed for booking {{bookingId}}.' } },
  },
  'seat.lock.expired': {
    email: { en: { subject: 'Seat hold expired', body: 'Seat hold expired for event {{eventId}}.' } },
    push: { en: { body: 'Your seat hold has expired.' } },
  },
  'waitlist.offer.sent': {
    push: { en: { body: 'A waitlist offer is available now.' } },
    sms: { en: { body: 'Waitlist offer available now.' } },
    email: { en: { subject: 'Waitlist offer', body: 'A waitlist offer is now available.' } },
  },
  'refund.issued': {
    email: { en: { subject: 'Refund issued', body: 'Your refund has been issued.' } },
  },
  'waitlist.position.updated': {
    push: { en: { body: 'Your waitlist position was updated to {{position}}.' } },
  },
};

const interpolate = (template, payload) =>
  template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => String(payload[key] ?? payload.data?.[key] ?? ''));

const resolveTemplate = (eventType, channel, locale = 'en') => {
  const channelTemplates = TEMPLATE_REGISTRY[eventType]?.[channel];
  if (!channelTemplates) {
    return null;
  }
  return channelTemplates[locale] || channelTemplates.en || null;
};

module.exports = {
  resolveTemplate,
  interpolate,
};
