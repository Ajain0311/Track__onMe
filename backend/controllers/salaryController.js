// controllers/salaryController.js — admin salary management + employee view

const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const {
  getAllSalaries, setSalary, getSalary, listPayouts, dispatchSalary,
  getSalarySettings, setSalarySettings,
} = require('../services/salaryService');
const { providerName } = require('../services/paymentProvider');
const audit = require('../services/auditService');

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/; // YYYY-MM

// GET /api/admin/salaries — salary config for all users who have one
const adminListSalaries = asyncHandler(async (_req, res) => {
  const salaries = await getAllSalaries();
  res.json({ salaries, provider: providerName() });
});

// PUT /api/admin/salaries/:userId  { baseSalary, currency? }
const adminSetSalary = asyncHandler(async (req, res) => {
  const { baseSalary, currency } = req.body || {};
  const amount = Number(baseSalary);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100_000_000) {
    throw AppError.badRequest('baseSalary must be a non-negative number.');
  }
  const salary = await setSalary(req.params.userId, { baseSalary: amount, currency }, req.user.id);
  await audit.record({
    actor: req.user, action: 'salary.set', resource: 'salaries',
    resourceId: req.params.userId, metadata: { baseSalary: amount, currency }, req,
  });
  res.json({ salary });
});

// POST /api/admin/salaries/:userId/dispatch  { period, amount?, note? }
// amount defaults to the user's configured base salary.
const adminDispatchOne = asyncHandler(async (req, res) => {
  const { period, amount, note } = req.body || {};
  if (!period || !PERIOD_RE.test(period)) throw AppError.badRequest('period must be YYYY-MM.');

  const config = await getSalary(req.params.userId);
  const payAmount = amount !== undefined ? Number(amount) : Number(config?.base_salary);
  if (!Number.isFinite(payAmount) || payAmount <= 0) {
    throw AppError.badRequest('No salary configured for this user — set a base salary first.');
  }

  const result = await dispatchSalary({
    userId: req.params.userId,
    period,
    amount: payAmount,
    currency: config?.currency || 'INR',
    note,
    dispatchedBy: req.user.id,
  });

  await audit.record({
    actor: req.user, action: 'salary.dispatch', resource: 'salary_payouts',
    resourceId: req.params.userId, metadata: { period, amount: payAmount, skipped: result.skipped }, req,
  });

  res.json(result);
});

// POST /api/admin/salaries/dispatch-all  { period }
// Pays every user with a configured salary; skips already-paid periods.
const adminDispatchAll = asyncHandler(async (req, res) => {
  const { period } = req.body || {};
  if (!period || !PERIOD_RE.test(period)) throw AppError.badRequest('period must be YYYY-MM.');

  const salaries = await getAllSalaries();
  if (!salaries.length) throw AppError.badRequest('No salaries configured yet.');

  const results = [];
  for (const s of salaries) {
    try {
      const r = await dispatchSalary({
        userId: s.user_id,
        period,
        amount: Number(s.base_salary),
        currency: s.currency,
        dispatchedBy: req.user.id,
      });
      results.push({ userId: s.user_id, ...r });
    } catch (e) {
      results.push({ userId: s.user_id, skipped: false, error: e.message });
    }
  }

  const paid    = results.filter((r) => !r.skipped && r.payout?.status === 'paid').length;
  const failed  = results.filter((r) => r.error || r.payout?.status === 'failed').length;
  const skipped = results.filter((r) => r.skipped).length;

  await audit.record({
    actor: req.user, action: 'salary.dispatch_all', resource: 'salary_payouts',
    resourceId: period, metadata: { period, paid, failed, skipped }, req,
  });

  res.json({ period, paid, failed, skipped, results });
});

// GET /api/admin/salary-payouts?period=&userId=
const adminListPayouts = asyncHandler(async (req, res) => {
  const payouts = await listPayouts({
    period: req.query.period || null,
    userId: req.query.userId || null,
  });
  res.json({ payouts, provider: providerName() });
});

// GET /api/admin/salary-settings
const adminGetSalarySettings = asyncHandler(async (_req, res) => {
  const settings = await getSalarySettings();
  res.json({ settings, provider: providerName() });
});

// PUT /api/admin/salary-settings  { autopayEnabled?, autopayDay? }
const adminSetSalarySettings = asyncHandler(async (req, res) => {
  const { autopayEnabled, autopayDay } = req.body || {};
  if (autopayDay !== undefined) {
    const d = Number(autopayDay);
    if (!Number.isInteger(d) || d < 1 || d > 28) throw AppError.badRequest('autopayDay must be 1–28.');
  }
  const settings = await setSalarySettings({ autopayEnabled, autopayDay }, req.user.id);
  await audit.record({
    actor: req.user, action: 'salary.settings.update', resource: 'salary_settings',
    resourceId: '1', metadata: { autopayEnabled, autopayDay }, req,
  });
  res.json({ settings });
});

// GET /api/salary/me — employee's own salary + payout history
const getMySalary = asyncHandler(async (req, res) => {
  const [salary, payouts] = await Promise.all([
    getSalary(req.user.id),
    listPayouts({ userId: req.user.id, limit: 24 }),
  ]);
  res.json({ salary, payouts });
});

module.exports = {
  adminListSalaries, adminSetSalary, adminDispatchOne, adminDispatchAll,
  adminListPayouts, getMySalary,
  adminGetSalarySettings, adminSetSalarySettings,
};
