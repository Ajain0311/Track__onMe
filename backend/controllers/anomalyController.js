// controllers/anomalyController.js

const asyncHandler       = require('../utils/asyncHandler');
const { detectAnomalies } = require('../services/anomalyService');

const getAnomalies = asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 7), 90);
  const data = await detectAnomalies({ days });
  res.json(data);
});

module.exports = { getAnomalies };
