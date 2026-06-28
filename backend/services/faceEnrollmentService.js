// services/faceEnrollmentService.js
// DB operations for the manager-approved face enrollment workflow.
// Mirrors locationRequestService.js: users submit, admins/managers approve,
// and only on approval does the embedding land in user_face_data (active).

const { supabase } = require('./supabase');
const logger = require('../utils/logger');

// ── Mappers ─────────────────────────────────────────────────────────────────

// Full mapper (includes the raw embedding payload — used internally on approve).
const mapFull = (r) => ({
  id:         r.id,
  userId:     r.user_id,
  payload:    r.payload,
  model:      r.model,
  dim:        r.dim,
  status:     r.status,
  adminNote:  r.admin_note || null,
  reviewedBy: r.reviewed_by || null,
  reviewedAt: r.reviewed_at || null,
  createdAt:  r.created_at,
  updatedAt:  r.updated_at,
  userEmail:  r.user_email || null,
});

// List mapper for the admin UI — strips the raw embedding vectors (managers
// don't need them and they bloat the response) but keeps useful metadata.
const mapForList = (r) => {
  const { payload, ...rest } = mapFull(r);
  return {
    ...rest,
    sampleCount: payload?.sampleCount ?? (Array.isArray(payload?.embeddings) ? payload.embeddings.length : 0),
    quality:     payload?.quality ?? null,
  };
};

// ── Submit (user-facing) ──────────────────────────────────────────────────────

/**
 * Submit (or replace) a pending enrollment for a user. A user can have at most
 * one pending request (enforced by a partial unique index); re-submitting
 * replaces the previous pending one. Does NOT activate the face.
 */
const submitEnrollment = async (userId, features) => {
  // Replace any existing pending submission for this user.
  await supabase
    .from('face_enrollment_requests')
    .delete()
    .eq('user_id', userId)
    .eq('status', 'pending');

  const { data, error } = await supabase
    .from('face_enrollment_requests')
    .insert({
      user_id: userId,
      payload: features,
      model:   features.model,
      dim:     features.dim,
      status:  'pending',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapForList(data);
};

// ── Status (user-facing) ──────────────────────────────────────────────────────

/**
 * Resolve a user's overall face status:
 *   approved → has an active row in user_face_data
 *   pending  → has a pending enrollment request
 *   rejected → most recent request was rejected (and no active face)
 *   none     → never enrolled
 */
const getStatusForUser = async (userId) => {
  const { data: active } = await supabase
    .from('user_face_data')
    .select('model, dim, updated_at, approved_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (active) {
    return { status: 'approved', model: active.model, dim: active.dim, updatedAt: active.updated_at };
  }

  const { data: latest } = await supabase
    .from('face_enrollment_requests')
    .select('status, admin_note, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) return { status: 'none' };
  return { status: latest.status, adminNote: latest.admin_note || null, submittedAt: latest.created_at };
};

/** Active, approved enrollment embeddings for a user (used by verify). */
const getActiveEnrollment = async (userId) => {
  const { data, error } = await supabase
    .from('user_face_data')
    .select('features, model, dim')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    if (error.code === '42P01' || /user_face_data/i.test(error.message)) {
      return { migrationPending: true };
    }
    throw new Error(error.message);
  }
  return data || null;
};

// ── Admin / manager operations ────────────────────────────────────────────────

const getRequestById = async (id) => {
  const { data, error } = await supabase
    .from('face_enrollment_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapFull(data) : null;
};

/** List enrollment requests (optionally filtered by status), enriched with emails. */
const listAll = async (status = null) => {
  let query = supabase
    .from('face_enrollment_requests')
    .select('*')
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    if (error.code === '42P01' || /face_enrollment_requests/i.test(error.message)) {
      logger.warn('face_enrollment_requests table missing — apply migration 005');
      return [];
    }
    throw new Error(error.message);
  }

  const requests = (data || []).map(mapForList);
  if (requests.length === 0) return requests;

  const { data: { users } = { users: [] } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = {};
  (users || []).forEach((u) => { emailMap[u.id] = u.email; });
  return requests.map((r) => ({ ...r, userEmail: emailMap[r.userId] || null }));
};

const getPendingCount = async () => {
  const { count, error } = await supabase
    .from('face_enrollment_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) return 0;
  return count || 0;
};

/**
 * Approve a pending enrollment: copy its embeddings into user_face_data
 * (the active, approved table) and mark the request approved.
 */
const approve = async (requestId, adminId, adminNote = null) => {
  const req = await getRequestById(requestId);
  if (!req) throw new Error('Request not found.');
  if (req.status !== 'pending') throw new Error('Request is not pending.');

  const now = new Date().toISOString();

  // Activate: upsert the approved embeddings into user_face_data.
  const { error: ufdErr } = await supabase
    .from('user_face_data')
    .upsert({
      user_id:      req.userId,
      features:     req.payload,
      sample_count: req.payload?.sampleCount ?? (req.payload?.embeddings?.length ?? 1),
      model:        req.model,
      dim:          req.dim,
      approved_by:  adminId,
      approved_at:  now,
      updated_at:   now,
    }, { onConflict: 'user_id' });
  if (ufdErr) throw new Error('Failed to activate face data: ' + ufdErr.message);

  const { data: updated, error: updErr } = await supabase
    .from('face_enrollment_requests')
    .update({ status: 'approved', admin_note: adminNote, reviewed_by: adminId, reviewed_at: now, updated_at: now })
    .eq('id', requestId)
    .select()
    .single();
  if (updErr) throw new Error('Failed to update request: ' + updErr.message);

  return { request: mapForList(updated), userId: req.userId };
};

/** Reject a pending enrollment with an optional note. */
const reject = async (requestId, adminId, adminNote = null) => {
  const req = await getRequestById(requestId);
  if (!req) throw new Error('Request not found.');
  if (req.status !== 'pending') throw new Error('Request is not pending.');

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('face_enrollment_requests')
    .update({ status: 'rejected', admin_note: adminNote, reviewed_by: adminId, reviewed_at: now, updated_at: now })
    .eq('id', requestId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { request: mapForList(data), userId: req.userId };
};

/** Delete a user's active face + any enrollment requests (used by DELETE /api/face). */
const purgeForUser = async (userId) => {
  await supabase.from('user_face_data').delete().eq('user_id', userId);
  await supabase.from('face_enrollment_requests').delete().eq('user_id', userId);
};

/** User IDs of admins/managers to notify when a new enrollment is submitted. */
const getApproverIds = async () => {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('user_id, role, roles(slug)');
    if (error) return [];
    return (data || [])
      .filter((r) => ['admin', 'manager', 'super_admin'].includes(r.roles?.slug || r.role))
      .map((r) => r.user_id);
  } catch {
    return [];
  }
};

module.exports = {
  submitEnrollment,
  getStatusForUser,
  getActiveEnrollment,
  getRequestById,
  listAll,
  getPendingCount,
  approve,
  reject,
  purgeForUser,
  getApproverIds,
};
