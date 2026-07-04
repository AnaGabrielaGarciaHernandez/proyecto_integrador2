const express = require('express');
const { requireAuth } = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));
router.use(pending('Admin endpoints are not implemented yet'));

function pending(message) {
  return (req, res) => {
    res.status(501).json({ error: { message } });
  };
}

module.exports = router;
