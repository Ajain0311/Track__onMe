// services/salaryService.js — salary configuration + payout ledger

const { supabase } = require('./supabase');
const { dispatchPayment } = require('./paymentProvider');

// Generate TEST bank details (clearly fake — never real account numbers)
const makeTestBank = () => ({
  bank_name: 'AttendTrack Test Bank',
  bank_account: 'TEST' + String(Math.floor(1000000000 + Math.random() * 9000000000)),
  bank_ifsc: 'ATTB0TEST01',
});

const bankRef = (s) =>
  s?.bank_name ? `${s.bank_name} ••${String(s.bank_account || '').slice(-4)}` : null;

async function getAllSalaries() {
  const { data, error } = await supabase
    .from('salaries')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function setSalary(userId, { baseSalary, currency = 'INR' }, updatedBy) {
  // Auto-provision test bank details on first salary setup
  const existing = await getSalary(userId);
  const bank = existing?.bank_account
    ? {}
    : makeTestBank();

  const { data, error } = await supabase
    .from('salaries')
    .upsert({
      user_id: userId,
      base_salary: baseSalary,
      currency,
      ...bank,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getSalary(userId) {
  const { data, error } = await supabase
    .from('salaries')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function listPayouts({ period = null, userId = null, limit = 200 } = {}) {
  let q = supabase
    .from('salary_payouts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (period) q = q.eq('period', period);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

async function hasPayout(userId, period) {
  const { data, error } = await supabase
    .from('salary_payouts')
    .select('id, status')
    .eq('user_id', userId)
    .eq('period', period)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Dispatch one user's salary for a period ('YYYY-MM').
 * Skips (returns the existing row) if a PAID payout already exists.
 * A previously FAILED payout row is replaced by the retry.
 */
async function dispatchSalary({ userId, period, amount, currency, note, dispatchedBy }) {
  const existing = await hasPayout(userId, period);
  if (existing && existing.status === 'paid') {
    return { skipped: true, reason: 'already paid for this period', payout: existing };
  }

  const config = await getSalary(userId);
  const result = await dispatchPayment({
    amount,
    currency,
    description: `Salary ${period}`,
    metadata: { user_id: userId, period, app: 'AttendTrack' },
  });

  const row = {
    user_id: userId,
    period,
    amount,
    currency,
    status: result.status,
    method: result.method,
    provider_ref: result.ref,
    bank_ref: bankRef(config),
    note: note || result.error || null,
    dispatched_by: dispatchedBy,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('salary_payouts')
    .upsert(row, { onConflict: 'user_id,period' })
    .select()
    .single();
  if (error) throw error;
  return { skipped: false, payout: data };
}

async function getSalarySettings() {
  const { data, error } = await supabase
    .from('salary_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return data || { id: 1, autopay_enabled: false, autopay_day: 1 };
}

async function setSalarySettings({ autopayEnabled, autopayDay }, updatedBy) {
  const patch = { id: 1, updated_by: updatedBy, updated_at: new Date().toISOString() };
  if (autopayEnabled !== undefined) patch.autopay_enabled = !!autopayEnabled;
  if (autopayDay !== undefined) patch.autopay_day = autopayDay;
  const { data, error } = await supabase
    .from('salary_settings')
    .upsert(patch, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

module.exports = {
  getAllSalaries, setSalary, getSalary,
  listPayouts, dispatchSalary,
  getSalarySettings, setSalarySettings,
};
