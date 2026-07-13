const express = require('express');
const { requireAuth } = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { getSellerOrders, getSellerOrder } = require('../services/orders.service');

const router = express.Router();

router.use(requireAuth, requireRole('vendedor', 'admin'));

router.get('/orders', async (req, res, next) => {
  try {
    res.json({ orders: await getSellerOrders(req.user.id) });
  } catch (error) {
    next(error);
  }
});

router.get('/orders/:id', async (req, res, next) => {
  try {
    ensureUuid(req.params.id);
    res.json({ order: await getSellerOrder(req.params.id, req.user.id) });
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

router.use(pending('Seller endpoints are not implemented yet'));

function pending(message) {
  return (req, res) => {
    res.status(501).json({ error: { message } });
  };
}

module.exports = router;
