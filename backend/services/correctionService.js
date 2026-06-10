// services/correctionService.js — Attendance correction request operations

const { supabase } = require('./supabase');

// ── Mapper ─────────────────────────────────────────────────────────────────

const mapCorrection = (r) => ({
  id:                 r.id,
  userId:             r.user_id,
  attendanceId:       r.attendance_id,
  originalCheckIn:    r.original_check_in,
  originalCheckOut:   r.original_check_out ?? null,
  proposedCheckIn:    r.proposed_check_in,
  proposedCheckOut:   r.proposed_check_out ?? null,
  reason:             r.reason,
  status:             r.status,
  adminNote:          r.admin_note ?? null,
  reviewedBy:         r.reviewed_by ?? null,
  reviewedAt:         r.reviewed_at ?? null,
  createdAt:          r.created_at,
  updatedAt:          r.updated_at,
  // joined
  userEmail:          r.user_email ?? null,
  attendanceDate:     r.attendance_date ?? null,
});

// ── User operations ────────────────────────────────────────────────────────

const getUserCorrections = async (userId, { status } = {}) => {
  let query = supabase
    .from('attendance_corrections')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (status && status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data.map(mapCorrection);
};

const createCorrection = async (userId, payload) => {
  const {
    attendanceId, originalCheckIn, originalCheckOut,
    proposedCheckIn, proposedCheckOut, reason,
  } = payload;

  // Verify the attendance record belongs to this user
  const { data: rec } = await supabase
    .from('attendance')
    .select('id, user_id, check_in_time, check_out_time, date')
    .eq('id', attendanceId)
    .maybeSingle();

  if (!rec || rec.user_id !== userId) {
    throw new Error('Attendance record not found or does not belong to you.');
  }

  // Prevent duplicate pending correction for the same attendance record
  const { data: dup } = await supabase
    .from('attendance_corrections')
    .select('id')
    .eq('attendance_id', attendanceId)
    .eq('status', 'pending')
    .maybeSingle();

  if (dup) throw new Error('A pending correction already exists for this attendance record.');

  const { data, error } = await supabase
    .from('attendance_corrections')
    .insert({
      user_id:            userId,
      attendance_id:      attendanceId,
      original_check_in:  originalCheckIn,
      original_check_out: originalCheckOut ?? null,
      proposed_check_in:  proposedCheckIn,
      proposed_check_out: proposedCheckOut ?? null,
      reason,
      status:             'pending',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { ...mapCorrection(data), attendanceDate: rec.date };
};

const cancelCorrection = async (id, userId) => {
  const { data: existing } = await supabase
    .from('attendance_corrections')
    .select('id, status, user_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing || existing.user_id !== userId) throw new Error('Correction request not found.');
  if (existing.status !== 'pending') throw new Error('Only pending corrections can be cancelled.');

  const { error } = await supabase
    .from('attendance_corrections')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('status', 'pending');

  if (error) throw new Error(error.message);
};

// ── Admin operations ───────────────────────────────────────────────────────

const getAllCorrections = async ({ status } = {}) => {
  let query = supabase
    .from('attendance_corrections')
    .select('*')
    .order('created_at', { ascending: false });

  if (status && status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Enrich with user emails by fetching attendance + user profiles separately
  return data.map(mapCorrection);
};

const getPendingCount = async () => {
  const { count, error } = await supabase
    .from('attendance_corrections')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) return 0;
  return count ?? 0;
};

const approveCorrection = async (id, adminId, adminNote = null) => {
  const { data: corr } = await supabase
    .from('attendance_corrections')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!corr) throw new Error('Correction request not found.');
  if (corr.status !== 'pending') throw new Error('Only pending corrections can be approved.');

  // Apply the proposed times to the attendance record
  const updates = {
    check_in_time: corr.proposed_check_in,
  };
  if (corr.proposed_check_out) {
    const checkIn  = new Date(corr.proposed_check_in);
    const checkOut = new Date(corr.proposed_check_out);
    const durationMin = Math.round((checkOut - checkIn) / 60000);
    updates.check_out_time  = corr.proposed_check_out;
    updates.total_duration  = durationMin;
  }

  const { error: attErr } = await supabase
    .from('attendance')
    .update(updates)
    .eq('id', corr.attendance_id);

  if (attErr) throw new Error('Failed to update attendance record: ' + attErr.message);

  const { data, error } = await supabase
    .from('attendance_corrections')
    .update({
      status:      'approved',
      admin_note:  adminNote,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { correction: mapCorrection(data), userId: corr.user_id };
};

const rejectCorrection = async (id, adminId, adminNote = null) => {
  const { data: corr } = await supabase
    .from('attendance_corrections')
    .select('id, status, user_id')
    .eq('id', id)
    .maybeSingle();

  if (!corr) throw new Error('Correction request not found.');
  if (corr.status !== 'pending') throw new Error('Only pending corrections can be rejected.');

  const { data, error } = await supabase
    .from('attendance_corrections')
    .update({
      status:      'rejected',
      admin_note:  adminNote,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return { correction: mapCorrection(data), userId: corr.user_id };
};

module.exports = {
  getUserCorrections, createCorrection, cancelCorrection,
  getAllCorrections, getPendingCount, approveCorrection, rejectCorrection,
};
