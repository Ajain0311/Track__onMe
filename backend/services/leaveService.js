// services/leaveService.js — Leave management DB operations

const { supabase } = require('./supabase');

// ── Mappers ────────────────────────────────────────────────────────────────

const mapLeave = (r) => ({
  id:           r.id,
  userId:       r.user_id,
  leaveTypeId:  r.leave_type_id,
  leaveTypeName: r.leave_types?.name ?? r.leave_type_name ?? null,
  leaveTypeColor: r.leave_types?.color ?? r.leave_type_color ?? null,
  isPaid:       r.leave_types?.is_paid ?? r.is_paid ?? null,
  startDate:    r.start_date,
  endDate:      r.end_date,
  days:         r.days,
  reason:       r.reason,
  status:       r.status,
  adminNote:    r.admin_note ?? null,
  reviewedBy:   r.reviewed_by ?? null,
  reviewedAt:   r.reviewed_at ?? null,
  createdAt:    r.created_at,
  updatedAt:    r.updated_at,
  // admin view
  userEmail:    r.user_email ?? null,
});

const mapLeaveType = (r) => ({
  id:          r.id,
  name:        r.name,
  description: r.description ?? null,
  color:       r.color,
  maxDays:     r.max_days ?? null,
  annualDays:  r.annual_days ?? 0,
  isPaid:      r.is_paid,
  isActive:    r.is_active,
});

// ── Leave Types ────────────────────────────────────────────────────────────

const getLeaveTypes = async () => {
  const { data, error } = await supabase
    .from('leave_types')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw new Error(error.message);
  return data.map(mapLeaveType);
};

// ── User operations ────────────────────────────────────────────────────────

const getUserLeaves = async (userId, { status, year } = {}) => {
  let query = supabase
    .from('leaves')
    .select('*, leave_types(name, color, is_paid)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (status && status !== 'all') query = query.eq('status', status);
  if (year) {
    query = query
      .gte('start_date', `${year}-01-01`)
      .lte('end_date',   `${year}-12-31`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data.map(mapLeave);
};

const createLeave = async (userId, { leaveTypeId, startDate, endDate, days, reason }) => {
  // Validate leave type exists and is active
  const { data: lt, error: ltErr } = await supabase
    .from('leave_types')
    .select('id, max_days, name')
    .eq('id', leaveTypeId)
    .eq('is_active', true)
    .maybeSingle();
  if (ltErr) throw new Error(ltErr.message);
  if (!lt) throw new Error('Invalid or inactive leave type.');

  // Check for overlapping approved/pending leaves
  const { data: overlap } = await supabase
    .from('leaves')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['pending', 'approved'])
    .lte('start_date', endDate)
    .gte('end_date',   startDate)
    .maybeSingle();
  if (overlap) throw new Error('You already have a leave request overlapping these dates.');

  const { data, error } = await supabase
    .from('leaves')
    .insert({
      user_id:       userId,
      leave_type_id: leaveTypeId,
      start_date:    startDate,
      end_date:      endDate,
      days,
      reason,
      status:        'pending',
    })
    .select('*, leave_types(name, color, is_paid)')
    .single();

  if (error) throw new Error(error.message);
  return mapLeave(data);
};

const cancelLeave = async (id, userId) => {
  const { data: existing } = await supabase
    .from('leaves')
    .select('id, status, user_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing || existing.user_id !== userId) throw new Error('Leave request not found.');
  if (existing.status !== 'pending') throw new Error('Only pending leaves can be cancelled.');

  const { error } = await supabase
    .from('leaves')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('status', 'pending');

  if (error) throw new Error(error.message);
};

// ── Admin operations ───────────────────────────────────────────────────────

const getAllLeaves = async ({ status, year } = {}) => {
  // Fetch leaves and join user email via profiles or auth.users
  let query = supabase
    .from('leaves')
    .select(`
      *,
      leave_types(name, color, is_paid),
      profiles:user_id(email)
    `)
    .order('created_at', { ascending: false });

  if (status && status !== 'all') query = query.eq('status', status);
  if (year) {
    query = query
      .gte('start_date', `${year}-01-01`)
      .lte('end_date',   `${year}-12-31`);
  }

  const { data, error } = await query;
  if (error) {
    // Fallback without profiles join if the view doesn't exist
    const { data: d2, error: e2 } = await supabase
      .from('leaves')
      .select('*, leave_types(name, color, is_paid)')
      .order('created_at', { ascending: false });
    if (e2) throw new Error(e2.message);
    return d2.map(mapLeave);
  }

  return data.map((r) => ({
    ...mapLeave(r),
    userEmail: r.profiles?.email ?? null,
  }));
};

const getPendingCount = async () => {
  const { count, error } = await supabase
    .from('leaves')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) return 0;
  return count ?? 0;
};

const approveLeave = async (id, adminId, adminNote = null) => {
  const { data: existing } = await supabase
    .from('leaves')
    .select('id, status, user_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing) throw new Error('Leave request not found.');
  if (existing.status !== 'pending') throw new Error('Only pending leaves can be approved.');

  const { data, error } = await supabase
    .from('leaves')
    .update({
      status:      'approved',
      admin_note:  adminNote,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*, leave_types(name, color, is_paid)')
    .single();

  if (error) throw new Error(error.message);
  return mapLeave(data);
};

const rejectLeave = async (id, adminId, adminNote = null) => {
  const { data: existing } = await supabase
    .from('leaves')
    .select('id, status, user_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing) throw new Error('Leave request not found.');
  if (existing.status !== 'pending') throw new Error('Only pending leaves can be rejected.');

  const { data, error } = await supabase
    .from('leaves')
    .update({
      status:      'rejected',
      admin_note:  adminNote,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*, leave_types(name, color, is_paid)')
    .single();

  if (error) throw new Error(error.message);
  return mapLeave(data);
};

// ── Leave Balance ──────────────────────────────────────────────────────────

const getLeaveBalance = async (userId, year) => {
  const [typesRes, leavesRes, allowancesRes] = await Promise.all([
    supabase.from('leave_types').select('*').eq('is_active', true).order('name'),
    supabase.from('leaves')
      .select('leave_type_id, status, days')
      .eq('user_id', userId)
      .in('status', ['approved', 'pending'])
      .gte('start_date', `${year}-01-01`)
      .lte('end_date',   `${year}-12-31`),
    supabase.from('leave_allowances')
      .select('leave_type_id, total_days')
      .eq('user_id', userId)
      .eq('year', year),
  ]);

  if (typesRes.error) throw new Error(typesRes.error.message);

  const leaves     = leavesRes.data  || [];
  const allowances = allowancesRes.data || [];
  const allowMap   = Object.fromEntries(allowances.map((a) => [a.leave_type_id, a.total_days]));

  return typesRes.data.map((t) => {
    const typeLeaves = leaves.filter((l) => l.leave_type_id === t.id);
    const usedDays    = typeLeaves.filter((l) => l.status === 'approved').reduce((s, l) => s + (l.days || 0), 0);
    const pendingDays = typeLeaves.filter((l) => l.status === 'pending').reduce((s, l) => s + (l.days || 0), 0);
    // Per-user override takes precedence over org default
    const totalDays   = allowMap[t.id] ?? t.annual_days ?? 0;
    const remaining   = Math.max(0, totalDays - usedDays - pendingDays);
    return {
      ...mapLeaveType(t),
      totalDays,
      usedDays,
      pendingDays,
      remaining,
    };
  });
};

// ── Admin: set per-user allowance ──────────────────────────────────────────

const setLeaveAllowance = async (userId, leaveTypeId, year, totalDays) => {
  const { data, error } = await supabase
    .from('leave_allowances')
    .upsert(
      { user_id: userId, leave_type_id: leaveTypeId, year, total_days: totalDays },
      { onConflict: 'user_id,leave_type_id,year' }
    )
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
};

module.exports = {
  getLeaveTypes,
  getUserLeaves, createLeave, cancelLeave,
  getAllLeaves, getPendingCount, approveLeave, rejectLeave,
  getLeaveBalance, setLeaveAllowance,
};
