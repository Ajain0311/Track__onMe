// controllers/leaveAnalyticsController.js

const asyncHandler          = require('../middleware/asyncHandler');
const { getLeaveAnalytics } = require('../services/leaveAnalyticsService');

const getAdminLeaveAnalytics = asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const data = await getLeaveAnalytics({ year });
  res.json(data);
});

module.exports = { getAdminLeaveAnalytics };
