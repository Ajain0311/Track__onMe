// services/auditService.js — record sensitive actions to audit_logs

const { supabase } = require('./supabase');
const logger = require('../utils/logger');

// Records an audit entry. Fail-soft: log error but never throw so the caller's
// primary operation still succeeds even if the audit insert fails.
const record = async ({ actor, action, resource, resourceId = null, metadata = {}, req = null }) => {
  try {
    await supabase.from('audit_logs').insert({
      actor_id:    actor?.id ?? null,
      actor_email: actor?.email ?? null,
      action,
      resource,
      resource_id: resourceId == null ? null : String(resourceId),
      metadata,
      ip_address:  req?.ip ?? null,
      user_agent:  req?.headers?.['user-agent'] ?? null,
    });
  } catch (err) {
    logger.warn('Audit log insert failed (non-fatal)', { error: err.message, action });
  }
};

// List with pagination + optional filters (admin only)
const list = async ({ page = 1, perPage = 50, action = null, actorId = null } = {}) => {
  let q = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (action)  q = q.eq('action', action);
  if (actorId) q = q.eq('actor_id', actorId);

  const { data, count, error } = await q;
  if (error) {
    if (/relation .* does not exist|could not find the table/i.test(error.message)) {
      logger.warn('audit_logs table missing — apply migration 003');
      return { rows: [], total: 0, page, perPage };
    }
    throw new Error(error.message);
  }
  return { rows: data, total: count ?? 0, page, perPage };
};

module.exports = { record, list };
