// controllers/designationController.js

const asyncHandler = require('../middleware/asyncHandler');
const AppError     = require('../utils/AppError');
const {
  getActiveDesignations, getAllDesignations,
  createDesignation, updateDesignation, deleteDesignation,
} = require('../services/designationService');

// Public (authenticated): active list for profile picker
const listActive = asyncHandler(async (_req, res) => {
  const designations = await getActiveDesignations();
  res.json({ designations });
});

// Admin: full list
const listAll = asyncHandler(async (_req, res) => {
  const designations = await getAllDesignations();
  res.json({ designations });
});

const create = asyncHandler(async (req, res) => {
  const { name, level } = req.body;
  if (!name) throw AppError.badRequest('name is required');
  const d = await createDesignation({ name, level });
  res.status(201).json({ designation: d });
});

const update = asyncHandler(async (req, res) => {
  const d = await updateDesignation(req.params.id, req.body);
  res.json({ designation: d });
});

const remove = asyncHandler(async (req, res) => {
  await deleteDesignation(req.params.id);
  res.json({ success: true });
});

module.exports = { listActive, listAll, create, update, remove };
