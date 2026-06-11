// services/scheduler.js — in-process periodic jobs.
//
// Two jobs run on a 30-minute tick (the GitHub Actions /health keepalive
// stops Render free tier from sleeping, so this interval actually fires):
//
//   1. AUTOPAY — when salary_settings.autopay_enabled and today >= autopay_day,
//      dispatch every configured salary for the current month. dispatchSalary
//      skips already-paid (user, period) rows, so re-running is harmless.
//
//   2. CHECK-IN NUDGES — Zomato-style playful notification for employees who
//      haven't checked in by late morning on a weekday. Max one nudge per
//      user per day.

const { supabase } = require('./supabase');
const logger = require('../utils/logger');
const notify = require('./notificationService');
const {
  getAllSalaries, dispatchSalary, getSalarySettings,
} = require('./salaryService');

const TICK_MS = 30 * 60 * 1000;

// IST is UTC+5:30 — the workforce for this deployment is in India.
const istNow = () => new Date(Date.now() + 5.5 * 3600 * 1000);
const istDateStr = () => istNow().toISOString().slice(0, 10);   // YYYY-MM-DD
const istPeriod  = () => istNow().toISOString().slice(0, 7);    // YYYY-MM

const NUDGES = [
  { title: 'Your chair is feeling lonely 🪑', body: 'It has been holding your spot all morning. Check in and give it purpose.' },
  { title: 'We checked. You did not. 👀', body: 'The attendance sheet has a you-shaped hole in it today.' },
  { title: 'Plot twist: work exists today 📅', body: 'Your team is in. The coffee is hot. Only one thing missing — you.' },
  { title: 'Missing person report filed 🕵️', body: 'Last seen: yesterday. If found, please check in immediately.' },
  { title: 'Your streak called. It is scared. 🔥', body: 'One tap keeps it alive. Check in before it files a complaint.' },
  { title: 'Attendance speedrun, anyone? ⏱️', body: 'Current record: your manager, 8:59 AM. Think you can beat it tomorrow?' },
  { title: 'The office WiFi misses your device 📶', body: 'It keeps asking about you. Check in and reunite them.' },
];

let lastAutopayRun = null; // YYYY-MM-DD of the last attempted autopay sweep

const runAutopay = async () => {
  const settings = await getSalarySettings();
  if (!settings.autopay_enabled) return;

  const today = istDateStr();
  if (lastAutopayRun === today) return;                  // once per day max
  if (istNow().getUTCDate() < settings.autopay_day) return;

  lastAutopayRun = today;
  const period = istPeriod();
  const salaries = await getAllSalaries();
  let paid = 0, skipped = 0, failed = 0;

  for (const s of salaries) {
    try {
      const r = await dispatchSalary({
        userId: s.user_id,
        period,
        amount: Number(s.base_salary),
        currency: s.currency,
        note: 'autopay',
        dispatchedBy: null,
      });
      if (r.skipped) skipped++;
      else if (r.payout?.status === 'paid') {
        paid++;
        notify.send({
          userId: s.user_id,
          type: 'salary',
          title: 'Salary credited 💸',
          body: `Your ${period} salary of ${s.currency} ${Number(s.base_salary).toLocaleString()} was dispatched via autopay.`,
        });
      } else failed++;
    } catch (e) {
      failed++;
      logger.warn('[autopay] dispatch failed', { user: s.user_id, error: e.message });
    }
  }
  if (paid || failed) logger.info('[autopay] sweep done', { period, paid, skipped, failed });
};

const runNudges = async (force = false) => {
  const now = istNow();
  const day = now.getUTCDay();                  // IST day-of-week
  if (!force && (day === 0 || day === 6)) return;  // weekend
  const hour = now.getUTCHours();               // IST hour (shifted date)
  if (!force && (hour < 11 || hour >= 17)) return; // nudge window: 11:00–17:00 IST

  const todayIst = istDateStr();
  // Start of IST day, expressed in UTC
  const dayStartUtc = new Date(new Date(todayIst + 'T00:00:00Z').getTime() - 5.5 * 3600 * 1000).toISOString();

  // Everyone with a role row (the active workforce)
  const { data: people, error } = await supabase.from('user_roles').select('user_id');
  if (error || !people?.length) return;

  // Who already checked in today (IST)?
  const { data: sessions } = await supabase
    .from('attendance')
    .select('user_id')
    .gte('check_in_time', dayStartUtc);
  const checkedIn = new Set((sessions || []).map((r) => r.user_id));

  // Who was already nudged today?
  const { data: nudged } = await supabase
    .from('notifications')
    .select('user_id')
    .eq('type', 'nudge')
    .gte('created_at', dayStartUtc);
  const alreadyNudged = new Set((nudged || []).map((r) => r.user_id));

  // Who is on approved leave today? Don't nudge people on holiday.
  const { data: leaves } = await supabase
    .from('leaves')
    .select('user_id')
    .eq('status', 'approved')
    .lte('start_date', todayIst)
    .gte('end_date', todayIst);
  const onLeave = new Set((leaves || []).map((r) => r.user_id));

  let sent = 0;
  for (const p of people) {
    if (checkedIn.has(p.user_id) || alreadyNudged.has(p.user_id) || onLeave.has(p.user_id)) continue;
    const msg = NUDGES[Math.floor(Math.random() * NUDGES.length)];
    await notify.send({ userId: p.user_id, type: 'nudge', title: msg.title, body: msg.body });
    sent++;
  }
  if (sent) logger.info('[nudge] sent check-in nudges', { sent });
};

const tick = async () => {
  try { await runAutopay(); } catch (e) { logger.error('[scheduler] autopay tick failed', { error: e.message }); }
  try { await runNudges(); } catch (e) { logger.error('[scheduler] nudge tick failed', { error: e.message }); }
};

const startScheduler = () => {
  setInterval(tick, TICK_MS);
  // First tick shortly after boot (cold-started instances should catch up fast)
  setTimeout(tick, 15_000);
  logger.info('Scheduler started (autopay + check-in nudges, 30 min tick)');
};

module.exports = { startScheduler, runAutopay, runNudges };
