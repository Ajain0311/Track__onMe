// middleware/requireRole.js — flexible RBAC.
//   requireRole('admin')                 → must have role slug 'admin' (or super_admin)
//   requireRole(['admin','manager'])     → must have any of these role slugs
//   requirePermission('locations.create')→ checks role_permissions
//
// Falls back to the legacy text 'role' column on user_roles if role_id/role_permissions
// haven't been migrated yet. Caches the role-slug lookup per request.

const { supabase } = require('../services/supabase');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const getRoleAndPermissions = async (userId) => {
  // Prefer the FK-based lookup; fall back to legacy text column
  const { data, error } = await supabase
    .from('user_roles')
    .select('role, role_id, roles(slug)')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { roleSlug: 'user', permissions: [] };

  const roleSlug = data.roles?.slug || data.role || 'user';

  // Fetch permissions (gracefully handle if role_permissions table missing)
  let permissions = [];
  if (data.role_id) {
    try {
      const { data: rp } = await supabase
        .from('role_permissions')
        .select('permissions(slug)')
        .eq('role_id', data.role_id);
      permissions = (rp || []).map((r) => r.permissions?.slug).filter(Boolean);
    } catch {
      /* table missing — pre-migration */
    }
  }

  return { roleSlug, permissions };
};

const requireRole = (allowed) => {
  const allow = Array.isArray(allowed) ? allowed : [allowed];
  return async (req, _res, next) => {
    try {
      if (!req.user?.id) return next(AppError.unauthorized());
      const { roleSlug, permissions } = await getRoleAndPermissions(req.user.id);
      req.user.role = roleSlug;
      req.user.permissions = permissions;

      // super_admin always passes
      if (roleSlug === 'super_admin') return next();
      if (!allow.includes(roleSlug)) {
        return next(AppError.forbidden(`Requires role: ${allow.join(' or ')}`));
      }
      next();
    } catch (err) {
      logger.error('[requireRole]', { error: err.message });
      next(AppError.internal('Role check failed'));
    }
  };
};

const requirePermission = (permissionSlug) => async (req, _res, next) => {
  try {
    if (!req.user?.id) return next(AppError.unauthorized());
    const { roleSlug, permissions } = await getRoleAndPermissions(req.user.id);
    req.user.role = roleSlug;
    req.user.permissions = permissions;

    if (roleSlug === 'super_admin') return next();
    if (!permissions.includes(permissionSlug)) {
      return next(AppError.forbidden(`Missing permission: ${permissionSlug}`));
    }
    next();
  } catch (err) {
    logger.error('[requirePermission]', { error: err.message });
    next(AppError.internal('Permission check failed'));
  }
};

// Back-compat shim for existing routes
const requireAdmin = requireRole(['admin', 'manager']);

module.exports = { requireRole, requirePermission, requireAdmin, getRoleAndPermissions };
