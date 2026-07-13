const express = require('express');
const { constructWebhookEvent, processStripeEvent } = require('../services/checkout.service');

const router = express.Router();

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
  try {
    const event = constructWebhookEvent(req.body, req.get('stripe-signature'));
    await processStripeEvent(event);
    res.json({ received: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
