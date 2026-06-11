// controllers/analyticsController.js

const asyncHandler = require('../utils/asyncHandler');
const { getPersonalAnalytics, getOrgAnalytics, getAbsenteeismReport } = require('../services/analyticsService');

const getMyAnalytics = asyncHandler(async (req, res) => {
  const data = await getPersonalAnalytics(req.user.id);
  res.json(data);
});

const getAdminAnalytics = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days, 10) || 30;
  const data = await getOrgAnalytics(Math.min(Math.max(days, 7), 90));
  res.json(data);
});

const getAbsenteeism = asyncHandler(async (req, res) => {
  const days      = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 7), 90);
  const threshold = Math.min(Math.max(parseInt(req.query.threshold, 10) || 70, 10), 100);
  const data = await getAbsenteeismReport({ days, threshold });
  res.json(data);
});

module.exports = { getMyAnalytics, getAdminAnalytics, getAbsenteeism };
