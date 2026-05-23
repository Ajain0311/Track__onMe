// middleware/requireAdmin.js — back-compat re-export.
// New code should import from './requireRole' directly.

const { requireAdmin, requireRole, requirePermission } = require('./requireRole');

module.exports = { requireAdmin, requireRole, requirePermission };
