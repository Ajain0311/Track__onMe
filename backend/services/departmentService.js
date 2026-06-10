// services/departmentService.js — Departments and employee profiles

const { supabase } = require('./supabase');

// ── Mappers ────────────────────────────────────────────────────────────────

const mapDept = (r) => ({
  id:          r.id,
  name:        r.name,
  description: r.description ?? null,
  color:       r.color,
  managerId:   r.manager_id ?? null,
  managerEmail:r.manager_email ?? null,
  isActive:    r.is_active,
  memberCount: r.member_count ?? null,
  createdAt:   r.created_at,
  updatedAt:   r.updated_at,
});

const mapProfile = (r) => ({
  userId:        r.user_id,
  displayName:   r.display_name ?? null,
  phone:         r.phone ?? null,
  departmentId:  r.department_id ?? null,
  departmentName:r.departments?.name ?? r.department_name ?? null,
  departmentColor:r.departments?.color ?? r.department_color ?? null,
  designation:   r.designation ?? null,
  employeeId:    r.employee_id ?? null,
  joinedDate:    r.joined_date ?? null,
  bio:           r.bio ?? null,
  createdAt:     r.created_at,
  updatedAt:     r.updated_at,
});

// ── Departments ────────────────────────────────────────────────────────────

const getDepartments = async ({ activeOnly = true } = {}) => {
  let query = supabase
    .from('departments')
    .select('*')
    .order('name');
  if (activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Count members per department
  const { data: counts } = await supabase
    .from('employee_profiles')
    .select('department_id');

  const countMap = {};
  for (const p of counts || []) {
    if (p.department_id) countMap[p.department_id] = (countMap[p.department_id] || 0) + 1;
  }

  return data.map((d) => mapDept({ ...d, member_count: countMap[d.id] || 0 }));
};

const getDepartment = async (id) => {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapDept(data) : null;
};

const createDepartment = async ({ name, description, color, managerId }) => {
  const { data, error } = await supabase
    .from('departments')
    .insert({ name, description: description ?? null, color: color || '#8b7cff', manager_id: managerId ?? null })
    .select()
    .single();
  if (error) {
    if (/unique/i.test(error.message)) throw new Error(`A department named "${name}" already exists.`);
    throw new Error(error.message);
  }
  return mapDept(data);
};

const updateDepartment = async (id, { name, description, color, managerId, isActive }) => {
  const patch = {};
  if (name        !== undefined) patch.name        = name;
  if (description !== undefined) patch.description = description;
  if (color       !== undefined) patch.color       = color;
  if (managerId   !== undefined) patch.manager_id  = managerId;
  if (isActive    !== undefined) patch.is_active   = isActive;
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('departments')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (/unique/i.test(error.message)) throw new Error(`A department named "${name}" already exists.`);
    throw new Error(error.message);
  }
  return mapDept(data);
};

const deleteDepartment = async (id) => {
  // Unlink profiles first to avoid FK constraint errors
  await supabase
    .from('employee_profiles')
    .update({ department_id: null })
    .eq('department_id', id);

  const { error } = await supabase
    .from('departments')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
};

// ── Employee Profiles ──────────────────────────────────────────────────────

const getProfile = async (userId) => {
  const { data, error } = await supabase
    .from('employee_profiles')
    .select('*, departments(name, color)')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapProfile(data) : null;
};

const upsertProfile = async (userId, patch) => {
  const allowed = ['display_name', 'phone', 'department_id', 'designation', 'employee_id', 'joined_date', 'bio'];
  const row = { user_id: userId };
  if (patch.displayName  !== undefined) row.display_name  = patch.displayName;
  if (patch.phone        !== undefined) row.phone         = patch.phone;
  if (patch.departmentId !== undefined) row.department_id = patch.departmentId;
  if (patch.designation  !== undefined) row.designation   = patch.designation;
  if (patch.employeeId   !== undefined) row.employee_id   = patch.employeeId;
  if (patch.joinedDate   !== undefined) row.joined_date   = patch.joinedDate;
  if (patch.bio          !== undefined) row.bio           = patch.bio;

  const { data, error } = await supabase
    .from('employee_profiles')
    .upsert(row, { onConflict: 'user_id' })
    .select('*, departments(name, color)')
    .single();

  if (error) throw new Error(error.message);
  return mapProfile(data);
};

// Admin: get all profiles enriched with email
const getAllProfiles = async () => {
  const { data, error } = await supabase
    .from('employee_profiles')
    .select('*, departments(name, color)');
  if (error) throw new Error(error.message);
  return data.map(mapProfile);
};

// Admin: set a user's department directly
const setUserDepartment = async (userId, departmentId) => {
  const { data, error } = await supabase
    .from('employee_profiles')
    .upsert({ user_id: userId, department_id: departmentId ?? null }, { onConflict: 'user_id' })
    .select('*, departments(name, color)')
    .single();
  if (error) throw new Error(error.message);
  return mapProfile(data);
};

module.exports = {
  getDepartments, getDepartment, createDepartment, updateDepartment, deleteDepartment,
  getProfile, upsertProfile, getAllProfiles, setUserDepartment,
};
