// controllers/departmentController.js — Department and profile handlers

const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const {
  getDepartments, getDepartment, createDepartment, updateDepartment, deleteDepartment,
  getProfile, upsertProfile, getAllProfiles, setUserDepartment,
} = require('../services/departmentService');
const audit = require('../services/auditService');

// ─── User-facing: read departments ───────────────────────────────────────────

const listDepartments = asyncHandler(async (_req, res) => {
  const departments = await getDepartments({ activeOnly: true });
  res.json({ departments });
});

// ─── User-facing: own profile ─────────────────────────────────────────────────

const getMyProfile = asyncHandler(async (req, res) => {
  const profile = await getProfile(req.user.id);
  res.json({ profile });
});

const updateMyProfile = asyncHandler(async (req, res) => {
  const { displayName, phone, departmentId, designation, employeeId, joinedDate, bio } = req.body;
  const profile = await upsertProfile(req.user.id, {
    displayName, phone, departmentId, designation, employeeId, joinedDate, bio,
  });
  res.json({ profile });
});

// ─── Admin: department CRUD ───────────────────────────────────────────────────

const adminListDepartments = asyncHandler(async (_req, res) => {
  const departments = await getDepartments({ activeOnly: false });
  res.json({ departments });
});

const adminGetDepartment = asyncHandler(async (req, res) => {
  const dept = await getDepartment(req.params.id);
  if (!dept) throw AppError.notFound('Department not found.');
  res.json({ department: dept });
});

const adminCreateDepartment = asyncHandler(async (req, res) => {
  try {
    const { name, description, color, managerId } = req.body;
    const dept = await createDepartment({ name, description, color, managerId });
    await audit.record({
      actor: req.user, action: 'department.create', resource: 'departments',
      resourceId: dept.id, metadata: { name }, req,
    });
    res.status(201).json({ department: dept });
  } catch (err) {
    if (/already exists/i.test(err.message)) throw AppError.badRequest(err.message);
    throw err;
  }
});

const adminUpdateDepartment = asyncHandler(async (req, res) => {
  try {
    const { name, description, color, managerId, isActive } = req.body;
    const dept = await updateDepartment(req.params.id, { name, description, color, managerId, isActive });
    await audit.record({
      actor: req.user, action: 'department.update', resource: 'departments',
      resourceId: dept.id, metadata: { name: dept.name }, req,
    });
    res.json({ department: dept });
  } catch (err) {
    if (/already exists/i.test(err.message)) throw AppError.badRequest(err.message);
    throw err;
  }
});

const adminDeleteDepartment = asyncHandler(async (req, res) => {
  await deleteDepartment(req.params.id);
  await audit.record({
    actor: req.user, action: 'department.delete', resource: 'departments',
    resourceId: req.params.id, metadata: {}, req,
  });
  res.json({ message: 'Department deleted.' });
});

// ─── Admin: profiles ──────────────────────────────────────────────────────────

const adminListProfiles = asyncHandler(async (_req, res) => {
  const profiles = await getAllProfiles();
  res.json({ profiles });
});

const adminSetUserDepartment = asyncHandler(async (req, res) => {
  const profile = await setUserDepartment(req.params.userId, req.body.departmentId ?? null);
  await audit.record({
    actor: req.user, action: 'profile.department.set', resource: 'employee_profiles',
    resourceId: req.params.userId, metadata: { departmentId: req.body.departmentId }, req,
  });
  res.json({ profile });
});

module.exports = {
  listDepartments, getMyProfile, updateMyProfile,
  adminListDepartments, adminGetDepartment,
  adminCreateDepartment, adminUpdateDepartment, adminDeleteDepartment,
  adminListProfiles, adminSetUserDepartment,
};
