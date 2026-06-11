// services/shiftService.js — Shift management

const { supabaseAdmin } = require('./supabase');

async function getAllShifts() {
  const { data, error } = await supabaseAdmin
    .from('shifts')
    .select('*')
    .order('start_hour', { ascending: true });
  if (error) throw error;
  return data;
}

async function getActiveShifts() {
  const { data, error } = await supabaseAdmin
    .from('shifts')
    .select('*')
    .eq('is_active', true)
    .order('start_hour', { ascending: true });
  if (error) throw error;
  return data;
}

async function createShift({ name, startHour, startMinute = 0, endHour, endMinute = 0, lateGraceMinutes = 15, color = '#8b7cff' }) {
  const { data, error } = await supabaseAdmin
    .from('shifts')
    .insert({
      name,
      start_hour:          startHour,
      start_minute:        startMinute,
      end_hour:            endHour,
      end_minute:          endMinute,
      late_grace_minutes:  lateGraceMinutes,
      color,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateShift(id, patch) {
  const allowed = ['name', 'start_hour', 'start_minute', 'end_hour', 'end_minute', 'late_grace_minutes', 'color', 'is_active'];
  const update = {};
  for (const k of allowed) {
    if (patch[k] !== undefined) update[k] = patch[k];
  }
  update.updated_at = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('shifts')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteShift(id) {
  const { error } = await supabaseAdmin
    .from('shifts')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ── Assignments ────────────────────────────────────────────────────────────────

async function assignShift(userId, shiftId) {
  const { data, error } = await supabaseAdmin
    .from('employee_shifts')
    .upsert({ user_id: userId, shift_id: shiftId, effective_from: new Date().toISOString().slice(0, 10) }, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function removeAssignment(userId) {
  const { error } = await supabaseAdmin
    .from('employee_shifts')
    .delete()
    .eq('user_id', userId);
  if (error) throw error;
}

async function getUserShift(userId) {
  const { data, error } = await supabaseAdmin
    .from('employee_shifts')
    .select('*, shifts(*)')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.shifts || null;
}

async function getAllAssignments() {
  const { data, error } = await supabaseAdmin
    .from('employee_shifts')
    .select('user_id, shift_id, effective_from, shifts(id, name, start_hour, start_minute, end_hour, end_minute, color)')
    .order('effective_from', { ascending: false });
  if (error) throw error;
  return data;
}

module.exports = {
  getAllShifts, getActiveShifts,
  createShift, updateShift, deleteShift,
  assignShift, removeAssignment, getUserShift, getAllAssignments,
};
