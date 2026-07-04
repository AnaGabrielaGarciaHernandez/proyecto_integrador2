const Stripe = require('stripe');
const env = require('./env');

module.exports = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;
