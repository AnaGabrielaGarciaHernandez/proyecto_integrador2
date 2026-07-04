const express = require('express');

const router = express.Router();

router.use((req, res) => {
  res.status(501).json({ error: { message: 'Stripe endpoints are not implemented yet' } });
});

module.exports = router;
