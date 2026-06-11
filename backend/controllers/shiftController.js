// controllers/shiftController.js

const asyncHandler = require('../middleware/asyncHandler');
const AppError     = require('../utils/AppError');
const {
  getAllShifts, createShift, updateShift, deleteShift,
  assignShift, removeAssignment, getAllAssignments,
} = require('../services/shiftService');

const listShifts = asyncHandler(async (_req, res) => {
  const shifts = await getAllShifts();
  res.json({ shifts });
});

const createShiftHandler = asyncHandler(async (req, res) => {
  const { name, startHour, startMinute, endHour, endMinute, lateGraceMinutes, color } = req.body;
  if (!name || startHour === undefined || endHour === undefined) {
    throw AppError.badRequest('name, startHour, endHour are required');
  }
  const shift = await createShift({ name, startHour, startMinute, endHour, endMinute, lateGraceMinutes, color });
  res.status(201).json({ shift });
});

const updateShiftHandler = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const shift = await updateShift(id, req.body);
  res.json({ shift });
});

const deleteShiftHandler = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await deleteShift(id);
  res.json({ success: true });
});

const listAssignments = asyncHandler(async (_req, res) => {
  const assignments = await getAllAssignments();
  res.json({ assignments });
});

const assignShiftHandler = asyncHandler(async (req, res) => {
  const { userId, shiftId } = req.body;
  if (!userId || !shiftId) throw AppError.badRequest('userId and shiftId are required');
  const assignment = await assignShift(userId, shiftId);
  res.json({ assignment });
});

const removeAssignmentHandler = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  await removeAssignment(userId);
  res.json({ success: true });
});

module.exports = {
  listShifts, createShiftHandler, updateShiftHandler, deleteShiftHandler,
  listAssignments, assignShiftHandler, removeAssignmentHandler,
};
