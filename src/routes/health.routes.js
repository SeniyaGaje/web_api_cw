const express = require('express');

const router = express.Router();

// Health check, outside /api/v1: shows that the service is up. It does not touch the database, so it still
// answers if the database is down. res.json() sets Content-Type: application/json (§6).
router.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = router;
