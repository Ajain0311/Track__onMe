// controllers/activityController.js

const asyncHandler = require('../utils/asyncHandler');
const activity = require('../services/activityService');

// GET /api/activity
const listMine = asyncHandler(async (req, res) => {
  const items = await activity.listForUser(req.user.id, {
    limit: Math.min(parseInt(req.query.limit, 10) || 50, 200),
  });
  res.json({ activities: items });
});

module.exports = { listMine };
