const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
router.use((req, res) => {
  res.status(501).json({ error: { message: 'Order endpoints are not implemented yet' } });
});

module.exports = router;
