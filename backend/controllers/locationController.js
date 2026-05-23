// controllers/locationController.js

const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const {
  getAllLocations, getActiveLocations, getLocationById,
  createLocation,  updateLocation,     deleteLocation,
} = require('../services/locationService');
const { getLocationsForUser } = require('../services/locationRequestService');
const audit = require('../services/auditService');
const logger = require('../utils/logger');

// ─── User-facing ──────────────────────────────────────────────────────────

// GET /api/locations
const listActive = asyncHandler(async (req, res) => {
  let locations;
  try {
    locations = await getLocationsForUser(req.user.id);
  } catch (err) {
    // Pre-migration fallback — log once and continue with global-only
    logger.warn('getLocationsForUser failed, falling back to active list', { error: err.message });
    locations = await getActiveLocations();
  }
  res.json({ locations });
});

// ─── Admin-facing ─────────────────────────────────────────────────────────

const listAll = asyncHandler(async (_req, res) => {
  const locations = await getAllLocations();
  res.json({ locations });
});

const getOne = asyncHandler(async (req, res) => {
  const location = await getLocationById(req.params.id);
  if (!location) throw AppError.notFound('Location not found.');
  res.json({ location });
});

const create = asyncHandler(async (req, res) => {
  const location = await createLocation(req.body, req.user.id);
  await audit.record({
    actor: req.user, action: 'location.create', resource: 'locations',
    resourceId: location.id, metadata: { name: location.name }, req,
  });
  res.status(201).json({ location });
});

const update = asyncHandler(async (req, res) => {
  const location = await updateLocation(req.params.id, req.body);
  await audit.record({
    actor: req.user, action: 'location.update', resource: 'locations',
    resourceId: location.id, metadata: { patch: req.body }, req,
  });
  res.json({ location });
});

const toggleActive = asyncHandler(async (req, res) => {
  const existing = await getLocationById(req.params.id);
  if (!existing) throw AppError.notFound('Location not found.');
  const location = await updateLocation(req.params.id, { isActive: !existing.isActive });
  await audit.record({
    actor: req.user, action: 'location.toggle', resource: 'locations',
    resourceId: location.id, metadata: { isActive: location.isActive }, req,
  });
  res.json({ location });
});

const remove = asyncHandler(async (req, res) => {
  await deleteLocation(req.params.id);
  await audit.record({
    actor: req.user, action: 'location.delete', resource: 'locations',
    resourceId: req.params.id, req,
  });
  res.json({ message: 'Location deleted.' });
});

module.exports = { listActive, listAll, getOne, create, update, toggleActive, remove };
