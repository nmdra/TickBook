const express = require('express');
const { setPreferences } = require('../config/preferences');

const router = express.Router();

router.post('/preferences/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  setPreferences(userId, req.body || {});
  return res.status(202).json({ status: 'updated' });
});

module.exports = router;
