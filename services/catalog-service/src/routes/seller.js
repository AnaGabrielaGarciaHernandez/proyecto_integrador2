const express = require('express');
const { createHttpError } = require('@ecobazar/platform');

function createSellerRouter() {
  const router = express.Router();
  router.use(requireSeller);
  router.use(sellerPending);
  return router;
}

function requireSeller(req, res, next) {
  void res;
  const userId = req.get('x-user-id');
  if (!isUuid(userId)) return next(createHttpError('Authentication required', 401));
  if (!['vendedor', 'admin'].includes(req.get('x-user-role'))) {
    return next(createHttpError('Forbidden', 403));
  }
  req.user = { id: userId, role: req.get('x-user-role') };
  return next();
}

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sellerPending(req, res, next) {
  void req;
  void res;
  next(createHttpError('Seller endpoints are not implemented yet', 501));
}

module.exports = { createSellerRouter, requireSeller, sellerPending };
