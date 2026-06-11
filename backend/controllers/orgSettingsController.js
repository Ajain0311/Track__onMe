// controllers/orgSettingsController.js

const asyncHandler      = require('../middleware/asyncHandler');
const AppError          = require('../utils/AppError');
const { getAllSettings, updateSettings } = require('../services/orgSettingsService');

const ALLOWED_KEYS = new Set([
  'org_name', 'work_start_hour', 'work_start_minute',
  'work_end_hour', 'work_end_minute', 'late_threshold_minutes',
  'early_checkout_buffer', 'working_days', 'timezone', 'min_session_minutes',
]);

const getOrgSettings = asyncHandler(async (_req, res) => {
  const settings = await getAllSettings({ bypassCache: false });
  res.json({ settings });
});

const updateOrgSettings = asyncHandler(async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') throw AppError.badRequest('Body must be a settings object');

  const updates = {};
  for (const [key, val] of Object.entries(body)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (val === null || val === undefined) continue;
    updates[key] = val;
  }
  if (Object.keys(updates).length === 0) throw AppError.badRequest('No valid settings keys provided');

  await updateSettings(updates);
  const settings = await getAllSettings({ bypassCache: true });
  res.json({ settings });
});

module.exports = { getOrgSettings, updateOrgSettings };
