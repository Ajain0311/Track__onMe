// services/locationRequestService.js
// DB operations for location_requests and user_locations tables.

const { supabase } = require('./supabase');

// ── Map DB row → camelCase ─────────────────────────────────────────────────

const mapRequest = (r) => ({
  id:            r.id,
  userId:        r.user_id,
  name:          r.name,
  address:       r.address,
  latitude:      r.latitude,
  longitude:     r.longitude,
  radiusMeters:  r.radius_meters,
  wifiSsids:     r.wifi_ssids || [],
  notes:         r.notes || null,
  status:        r.status,
  adminNote:     r.admin_note || null,
  reviewedBy:    r.reviewed_by || null,
  reviewedAt:    r.reviewed_at || null,
  createdAt:     r.created_at,
  updatedAt:     r.updated_at,
  // joined fields (admin view)
  userEmail:     r.user_email || null,
});

// ── User operations ────────────────────────────────────────────────────────

/** Get all requests for a specific user (any status). */
const getUserRequests = async (userId) => {
  const { data, error } = await supabase
    .from('location_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(mapRequest);
};

/** Get a single request (validates it belongs to userId). */
const getUserRequest = async (id, userId) => {
  const { data, error } = await supabase
    .from('location_requests')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRequest(data) : null;
};

/** Submit a new location request. */
const createRequest = async (userId, payload) => {
  // Use only the columns guaranteed to exist; gracefully add new ones if the
  // 003 migration has been applied (accuracy / captured_at / address are post-003)
  const row = {
    user_id:       userId,
    name:          payload.name,
    address:       payload.address || '',
    latitude:      payload.latitude,
    longitude:     payload.longitude,
    radius_meters: payload.radiusMeters || 200,
    wifi_ssids:    payload.wifiSsids   || [],
    notes:         payload.notes       || null,
    status:        'pending',
  };
  if (payload.accuracy   != null) row.accuracy    = payload.accuracy;
  if (payload.capturedAt)         row.captured_at = payload.capturedAt;

  let { data, error } = await supabase
    .from('location_requests').insert(row).select().single();

  // If new columns aren't present yet (pre-003 schema), retry without them
  if (error && /column .* does not exist/i.test(error.message)) {
    delete row.accuracy;
    delete row.captured_at;
    ({ data, error } = await supabase
      .from('location_requests').insert(row).select().single());
  }

  if (error) throw new Error(error.message);
  return mapRequest(data);
};

/** Cancel a pending request (user can only delete their own pending requests). */
const cancelRequest = async (id, userId) => {
  // Verify ownership + status
  const { data: existing } = await supabase
    .from('location_requests')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!existing) throw new Error('Request not found.');
  if (existing.status !== 'pending') throw new Error('Only pending requests can be cancelled.');

  const { error } = await supabase
    .from('location_requests')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return true;
};

// ── Admin operations ───────────────────────────────────────────────────────

/** List all requests (optionally filtered by status). */
const getAllRequests = async (status = null) => {
  let query = supabase
    .from('location_requests')
    .select('*')
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Enrich with user emails
  const requests = data.map(mapRequest);
  if (requests.length === 0) return requests;

  const userIds = [...new Set(requests.map((r) => r.userId))];
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const emailMap = {};
  (users || []).forEach((u) => { emailMap[u.id] = u.email; });

  return requests.map((r) => ({ ...r, userEmail: emailMap[r.userId] || null }));
};

/** Get a single request by ID (admin view). */
const getRequestById = async (id) => {
  const { data, error } = await supabase
    .from('location_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRequest(data) : null;
};

/**
 * Approve a request:
 *  1. Create a new location (is_global = false, user-specific)
 *  2. Link it to the requesting user in user_locations
 *  3. Update the request status to 'approved'
 */
const approveRequest = async (requestId, adminId, adminNote = null) => {
  // Load request
  const req = await getRequestById(requestId);
  if (!req) throw new Error('Request not found.');
  if (req.status !== 'pending') throw new Error('Request is not pending.');

  // Create the location (user-specific: is_global = false)
  const { data: loc, error: locErr } = await supabase
    .from('locations')
    .insert({
      name:          req.name,
      address:       req.address,
      latitude:      req.latitude,
      longitude:     req.longitude,
      radius_meters: req.radiusMeters,
      wifi_ssids:    req.wifiSsids,
      is_active:     true,
      is_global:     false,
      created_by:    adminId,
    })
    .select()
    .single();
  if (locErr) throw new Error('Failed to create location: ' + locErr.message);

  // Link location to the requesting user
  const { error: ulErr } = await supabase
    .from('user_locations')
    .insert({ user_id: req.userId, location_id: loc.id });
  if (ulErr) throw new Error('Failed to assign location: ' + ulErr.message);

  // Mark request as approved
  const { data: updated, error: updErr } = await supabase
    .from('location_requests')
    .update({
      status:      'approved',
      admin_note:  adminNote,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    })
    .eq('id', requestId)
    .select()
    .single();
  if (updErr) throw new Error('Failed to update request: ' + updErr.message);

  return { request: mapRequest(updated), locationId: loc.id };
};

/** Reject a request with an optional note. */
const rejectRequest = async (requestId, adminId, adminNote = null) => {
  const req = await getRequestById(requestId);
  if (!req) throw new Error('Request not found.');
  if (req.status !== 'pending') throw new Error('Request is not pending.');

  const { data, error } = await supabase
    .from('location_requests')
    .update({
      status:      'rejected',
      admin_note:  adminNote,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    })
    .eq('id', requestId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapRequest(data);
};

// ── Location fetching with user-specific support ───────────────────────────

/** Get active global locations + user-specific locations for a user. */
const getLocationsForUser = async (userId) => {
  // 1. All active global locations
  const { data: globalLocs, error: gErr } = await supabase
    .from('locations')
    .select('*')
    .eq('is_active', true)
    .eq('is_global', true);
  if (gErr) throw new Error(gErr.message);

  // 2. User-specific locations assigned to this user
  const { data: userLocs, error: uErr } = await supabase
    .from('user_locations')
    .select('locations(*)')
    .eq('user_id', userId);
  if (uErr) throw new Error(uErr.message);

  const specificLocs = (userLocs || [])
    .map((ul) => ul.locations)
    .filter((l) => l && l.is_active);

  // Merge (deduplicate by id)
  const seen = new Set();
  const merged = [];
  for (const loc of [...(globalLocs || []), ...specificLocs]) {
    if (!seen.has(loc.id)) {
      seen.add(loc.id);
      merged.push(loc);
    }
  }

  return merged.map(mapLocation);
};

const mapLocation = (r) => ({
  id:           r.id,
  name:         r.name,
  address:      r.address,
  latitude:     r.latitude,
  longitude:    r.longitude,
  radiusMeters: r.radius_meters,
  wifiSsids:    r.wifi_ssids || [],
  isActive:     r.is_active,
  isGlobal:     r.is_global ?? true,
  createdBy:    r.created_by,
  createdAt:    r.created_at,
  updatedAt:    r.updated_at,
});

// Pending request count (for admin badge)
const getPendingCount = async () => {
  const { count, error } = await supabase
    .from('location_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) return 0;
  return count || 0;
};

module.exports = {
  getUserRequests,
  getUserRequest,
  createRequest,
  cancelRequest,
  getAllRequests,
  getRequestById,
  approveRequest,
  rejectRequest,
  getLocationsForUser,
  getPendingCount,
};
