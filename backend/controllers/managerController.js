// controllers/managerController.js

const asyncHandler = require('../utils/asyncHandler');
const { getTeamOverview } = require('../services/managerService');

const getMyTeam = asyncHandler(async (req, res) => {
  const data = await getTeamOverview(req.user.id);
  res.json(data);
});

module.exports = { getMyTeam };
