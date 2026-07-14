const Stripe = require('stripe');
const { createHttpError } = require('@ecobazar/platform');
const env = require('./env');

let client;

function getStripe({ webhook = false } = {}) {
  if (!env.STRIPE_SECRET_KEY || (webhook && !env.STRIPE_WEBHOOK_SECRET)) {
    throw createHttpError('Stripe is not configured', 503, { code: 'STRIPE_UNAVAILABLE' });
  }
  client ||= new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}

module.exports = { getStripe };
