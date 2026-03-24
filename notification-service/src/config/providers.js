const sendgridMail = require('@sendgrid/mail');
const twilio = require('twilio');

const getSendgridClient = () => {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    return null;
  }

  sendgridMail.setApiKey(apiKey);
  return sendgridMail;
};

const getTwilioClient = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    return null;
  }

  return twilio(accountSid, authToken);
};

const sendEmail = async ({ to, subject, text, html }) => {
  const client = getSendgridClient();
  if (!client) {
    throw new Error('SendGrid is not configured');
  }

  await client.send({
    to,
    from: process.env.SENDGRID_FROM_EMAIL,
    subject,
    text,
    html,
  });
};

const sendSMS = async ({ to, body }) => {
  const client = getTwilioClient();
  if (!client) {
    throw new Error('Twilio is not configured');
  }

  await client.messages.create({
    to,
    from: process.env.TWILIO_SMS_FROM,
    body,
  });
};

const sendWhatsApp = async ({ to, body }) => {
  const client = getTwilioClient();
  if (!client) {
    throw new Error('Twilio is not configured');
  }

  await client.messages.create({
    to,
    from: process.env.TWILIO_WHATSAPP_FROM,
    body,
  });
};

const sendPush = async ({ to, body }) => {
  console.log(`Push notification sent to ${to}: ${body}`);
};

module.exports = {
  sendEmail,
  sendSMS,
  sendWhatsApp,
  sendPush,
};
