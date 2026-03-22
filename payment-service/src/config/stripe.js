const Stripe = require('stripe');

let stripeClient = null;

const isStripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);

const getStripeClient = () => {
  if (!isStripeConfigured()) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }

  return stripeClient;
};

module.exports = {
  getStripeClient,
  isStripeConfigured,
};
