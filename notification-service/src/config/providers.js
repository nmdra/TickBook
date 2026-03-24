const { Resend } = require('resend');
const twilio = require('twilio');

const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new Resend(apiKey);
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
  const client = getResendClient();
  if (!client) {
    throw new Error('Resend is not configured');
  }

  const response = await client.emails.send({
    to,
    from: process.env.RESEND_FROM_EMAIL,
    subject,
    text,
    html,
  });

  if (response?.error) {
    throw new Error(`Resend send failed: ${response.error.message || 'unknown error'}`);
  }
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
  console.log(`Push notification placeholder sent to ${to}: ${body}`);
};

module.exports = {
  sendEmail,
  sendSMS,
  sendWhatsApp,
  sendPush,
};
