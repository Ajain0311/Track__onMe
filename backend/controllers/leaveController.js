// controllers/leaveController.js — Leave management handlers

const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const {
  getLeaveTypes,
  getUserLeaves, createLeave, cancelLeave,
  getAllLeaves,  getPendingCount, approveLeave, rejectLeave,
  getLeaveBalance, setLeaveAllowance,
} = require('../services/leaveService');
const audit    = require('../services/auditService');
const activity = require('../services/activityService');
const notify   = require('../services/notificationService');

// ─── Shared ───────────────────────────────────────────────────────────────────

const listLeaveTypes = asyncHandler(async (_req, res) => {
  const types = await getLeaveTypes();
  res.json({ types });
});

// ─── User-facing ──────────────────────────────────────────────────────────────

const listMyLeaves = asyncHandler(async (req, res) => {
  const { status, year } = req.query;
  const leaves = await getUserLeaves(req.user.id, { status, year });
  res.json({ leaves });
});

const submitLeave = asyncHandler(async (req, res) => {
  const { leaveTypeId, startDate, endDate, days, reason } = req.body;
  try {
    const leave = await createLeave(req.user.id, { leaveTypeId, startDate, endDate, days, reason });
    await activity.record({
      userId: req.user.id, type: 'leave.submitted',
      title: `Leave request submitted: ${leave.leaveTypeName} (${days} day${days !== 1 ? 's' : ''})`,
      metadata: { leaveId: leave.id, startDate, endDate },
    });
    res.status(201).json({ leave });
  } catch (err) {
    if (/overlap|invalid|inactive/i.test(err.message)) throw AppError.badRequest(err.message);
    throw err;
  }
});

const cancelMyLeave = asyncHandler(async (req, res) => {
  try {
    await cancelLeave(req.params.id, req.user.id);
    await activity.record({
      userId: req.user.id, type: 'leave.cancelled',
      title: 'Leave request cancelled',
      metadata: { leaveId: req.params.id },
    });
    res.json({ message: 'Leave request cancelled.' });
  } catch (err) {
    if (/not found|pending/i.test(err.message)) throw AppError.badRequest(err.message);
    throw err;
  }
});

const getMyLeaveBalance = asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const balance = await getLeaveBalance(req.user.id, year);
  res.json({ balance, year });
});

// ─── Admin-facing ─────────────────────────────────────────────────────────────

const listAllAdminLeaves = asyncHandler(async (req, res) => {
  const { status, year } = req.query;
  const [leaves, pendingCount] = await Promise.all([
    getAllLeaves({ status, year }),
    getPendingCount(),
  ]);
  res.json({ leaves, pendingCount });
});

const approve = asyncHandler(async (req, res) => {
  try {
    const leave = await approveLeave(req.params.id, req.user.id, req.body?.adminNote ?? null);
    await audit.record({
      actor: req.user, action: 'leave.approve', resource: 'leaves',
      resourceId: req.params.id, metadata: { adminNote: req.body?.adminNote }, req,
    });
    await notify.send({
      userId: leave.userId, type: 'leave.approved',
      title: 'Leave request approved',
      body: `Your ${leave.leaveTypeName} (${leave.days} day${leave.days !== 1 ? 's' : ''}) has been approved.`,
      link: '/MyLeaves',
    });
    res.json({ message: 'Leave approved.', leave });
  } catch (err) {
    if (/not found|pending/i.test(err.message)) throw AppError.badRequest(err.message);
    throw err;
  }
});

const reject = asyncHandler(async (req, res) => {
  try {
    const leave = await rejectLeave(req.params.id, req.user.id, req.body?.adminNote ?? null);
    await audit.record({
      actor: req.user, action: 'leave.reject', resource: 'leaves',
      resourceId: req.params.id, metadata: { adminNote: req.body?.adminNote }, req,
    });
    await notify.send({
      userId: leave.userId, type: 'leave.rejected',
      title: 'Leave request rejected',
      body: req.body?.adminNote || `Your ${leave.leaveTypeName} request has been rejected.`,
      link: '/MyLeaves',
    });
    res.json({ message: 'Leave rejected.', leave });
  } catch (err) {
    if (/not found|pending/i.test(err.message)) throw AppError.badRequest(err.message);
    throw err;
  }
});

const adminSetAllowance = asyncHandler(async (req, res) => {
  const { userId, leaveTypeId, year, totalDays } = req.body;
  if (!userId || !leaveTypeId || !year || totalDays === undefined) {
    throw AppError.badRequest('userId, leaveTypeId, year, and totalDays are required.');
  }
  const record = await setLeaveAllowance(userId, leaveTypeId, parseInt(year), parseInt(totalDays));
  await audit.record({
    actor: req.user, action: 'leave.set_allowance', resource: 'leave_allowances',
    resourceId: record.id, metadata: { userId, leaveTypeId, year, totalDays }, req,
  });
  res.json({ record });
});

const adminGetUserBalance = asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const balance = await getLeaveBalance(req.params.userId, year);
  res.json({ balance, year });
});

module.exports = {
  listLeaveTypes, listMyLeaves, submitLeave, cancelMyLeave,
  getMyLeaveBalance,
  listAllAdminLeaves, approve, reject,
  adminSetAllowance, adminGetUserBalance,
};
