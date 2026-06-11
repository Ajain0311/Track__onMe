// controllers/holidayController.js

const asyncHandler = require('../utils/asyncHandler');
const AppError     = require('../utils/AppError');
const {
  getHolidaysForYear, getAllHolidays,
  createHoliday, updateHoliday, deleteHoliday,
} = require('../services/holidayService');

// GET /api/holidays?year=2026
const listHolidays = asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const holidays = await getHolidaysForYear(year);
  res.json({ holidays });
});

// GET /api/admin/holidays
const adminListHolidays = asyncHandler(async (_req, res) => {
  const holidays = await getAllHolidays();
  res.json({ holidays });
});

// POST /api/admin/holidays
const adminCreateHoliday = asyncHandler(async (req, res) => {
  const { date, name, type } = req.body;
  if (!date || !name) throw AppError.badRequest('date and name are required');
  const holiday = await createHoliday({ date, name, type });
  res.status(201).json({ holiday });
});

// PUT /api/admin/holidays/:id
const adminUpdateHoliday = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { date, name, type, isActive } = req.body;
  const holiday = await updateHoliday(id, { date, name, type, isActive });
  res.json({ holiday });
});

// DELETE /api/admin/holidays/:id
const adminDeleteHoliday = asyncHandler(async (req, res) => {
  await deleteHoliday(req.params.id);
  res.json({ success: true });
});

module.exports = { listHolidays, adminListHolidays, adminCreateHoliday, adminUpdateHoliday, adminDeleteHoliday };
