// controllers/locationController.js

const {
  getAllLocations,
  getActiveLocations,
  getLocationById,
  createLocation,
  updateLocation,
  deleteLocation,
} = require('../services/locationService');

// ─── User-facing ──────────────────────────────────────────────────────────────

// GET /api/locations  — active locations for the location picker
const listActive = async (req, res, next) => {
  try {
    const locations = await getActiveLocations();
    return res.status(200).json({ locations });
  } catch (err) {
    next(err);
  }
};

// ─── Admin-facing ─────────────────────────────────────────────────────────────

// GET /api/admin/locations
const listAll = async (req, res, next) => {
  try {
    const locations = await getAllLocations();
    return res.status(200).json({ locations });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/locations/:id
const getOne = async (req, res, next) => {
  try {
    const location = await getLocationById(req.params.id);
    return res.status(200).json({ location });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/locations
const create = async (req, res, next) => {
  try {
    const { name, address, latitude, longitude, radiusMeters, wifiSsids, isActive } = req.body;
    if (!name || latitude == null || longitude == null) {
      return res.status(400).json({ error: 'name, latitude, and longitude are required.' });
    }
    const location = await createLocation(
      { name, address, latitude, longitude, radiusMeters, wifiSsids, isActive },
      req.user.id
    );
    console.log(`[Locations] Created "${location.name}" by ${req.user.email}`);
    return res.status(201).json({ location });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/locations/:id
const update = async (req, res, next) => {
  try {
    const location = await updateLocation(req.params.id, req.body);
    console.log(`[Locations] Updated "${location.name}" by ${req.user.email}`);
    return res.status(200).json({ location });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/locations/:id/toggle
const toggleActive = async (req, res, next) => {
  try {
    const existing = await getLocationById(req.params.id);
    const location = await updateLocation(req.params.id, { isActive: !existing.isActive });
    return res.status(200).json({ location });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/locations/:id
const remove = async (req, res, next) => {
  try {
    await deleteLocation(req.params.id);
    return res.status(200).json({ message: 'Location deleted.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { listActive, listAll, getOne, create, update, toggleActive, remove };
