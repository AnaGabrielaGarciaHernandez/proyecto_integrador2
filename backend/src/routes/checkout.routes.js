const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { createCheckout, cancelCheckout } = require('../services/checkout.service');

const router = express.Router();
router.use(requireAuth);

router.post('/', async (req, res, next) => {
  try {
    const checkout = await createCheckout(req.user.id);
    res.status(201).json({ checkout });
  } catch (error) {
    next(error);
  }
});

router.post('/:orderId/cancel', async (req, res, next) => {
  try {
    ensureUuid(req.params.orderId);
    const order = await cancelCheckout(req.params.orderId, req.user.id);
    res.json({ order });
  } catch (error) {
    next(error);
  }
});

function ensureUuid(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    const error = new Error('Order not found');
    error.status = 404;
    throw error;
  }
}

module.exports = router;
