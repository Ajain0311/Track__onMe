// controllers/punctualityController.js

const asyncHandler = require('../utils/asyncHandler');
const { getPersonalPunctuality, getOrgPunctuality } = require('../services/punctualityService');

const getMyPunctuality = asyncHandler(async (req, res) => {
  const months = parseInt(req.query.months, 10) || 3;
  const data = await getPersonalPunctuality(req.user.id, Math.min(Math.max(months, 1), 12));
  res.json(data);
});

const getAdminPunctuality = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days, 10) || 30;
  const data = await getOrgPunctuality(Math.min(Math.max(days, 7), 90));
  res.json(data);
});

module.exports = { getMyPunctuality, getAdminPunctuality };
