const INTERNAL_TOPICS = {
  email: process.env.NOTIF_EMAIL_TOPIC || 'notif.email',
  sms: process.env.NOTIF_SMS_TOPIC || 'notif.sms',
  push: process.env.NOTIF_PUSH_TOPIC || 'notif.push',
  whatsapp: process.env.NOTIF_WHATSAPP_TOPIC || 'notif.whatsapp',
};

const DLQ_TOPICS = {
  email: process.env.NOTIF_EMAIL_DLQ_TOPIC || 'notif.email.dlq',
  sms: process.env.NOTIF_SMS_DLQ_TOPIC || 'notif.sms.dlq',
  push: process.env.NOTIF_PUSH_DLQ_TOPIC || 'notif.push.dlq',
  whatsapp: process.env.NOTIF_WHATSAPP_DLQ_TOPIC || 'notif.whatsapp.dlq',
};

const DOMAIN_TOPICS = (process.env.NOTIF_DOMAIN_TOPICS ||
  'events,bookings,payments,seat.lock.expired,waitlist,refunds')
  .split(',')
  .map((topic) => topic.trim())
  .filter(Boolean);

module.exports = {
  INTERNAL_TOPICS,
  DLQ_TOPICS,
  DOMAIN_TOPICS,
};
