// seed_demo_data.js — realistic demo data for sales demos.
// ADDITIVE and idempotent-ish: only fills days that have no attendance row
// for that user. Gives the 5 dummy employees ~30 working days of attendance
// (varied punctuality), a few leaves, salaries, and activity entries so
// analytics, reports, payroll and dashboards all look alive.
//
// Run: node backend/scripts/seed_demo_data.js

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const EMPLOYEES = [
  { email: 'rahul.sharma@trackme.com',  salary: 45000, punctuality: 0.9  },  // early bird
  { email: 'priya.patel@trackme.com',   salary: 52000, punctuality: 0.8  },
  { email: 'amit.verma@trackme.com',    salary: 38000, punctuality: 0.55 },  // chronically late
  { email: 'sneha.gupta@trackme.com',   salary: 61000, punctuality: 0.85 },
  { email: 'vikram.singh@trackme.com',  salary: 47000, punctuality: 0.7  },
  { email: 'user@trackme.com',          salary: 40000, punctuality: 0.75 },
];

const DAYS_BACK = 45; // calendar days to walk back (≈30 working days)

const rand = (min, max) => min + Math.random() * (max - min);

async function seedUser(user, cfg) {
  // Existing attendance dates for this user (skip those days)
  const { data: existing } = await supabase
    .from('attendance').select('date').eq('user_id', user.id);
  const taken = new Set((existing || []).map((r) => r.date));

  const rows = [];
  for (let back = 1; back <= DAYS_BACK; back++) {
    const day = new Date(Date.now() - back * 86400_000);
    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6) continue;             // weekends off
    const dateStr = day.toISOString().slice(0, 10);
    if (taken.has(dateStr)) continue;
    if (Math.random() > 0.93) continue;               // occasional absence

    // Check-in: punctual people land 8:45–9:15 IST, late ones 9:20–10:40
    const onTime = Math.random() < cfg.punctuality;
    const inHourIst  = onTime ? 8 + Math.round(rand(0, 1)) : 9 + rand(0.4, 1.7);
    const inMinutes  = onTime ? rand(45, 75) : rand(20, 100);
    const checkIn  = new Date(`${dateStr}T00:00:00Z`);
    checkIn.setUTCMinutes(Math.round((inHourIst - 5.5) * 60 + inMinutes)); // IST → UTC
    const workedH  = rand(7.4, 9.6);
    const checkOut = new Date(checkIn.getTime() + workedH * 3600_000);

    rows.push({
      user_id: user.id,
      date: dateStr,
      check_in_time: checkIn.toISOString(),
      check_out_time: checkOut.toISOString(),
      total_duration: Math.round(workedH * 60),       // minutes
      check_in_method: Math.random() < 0.7 ? 'wifi' : 'gps',
      face_verified: true,
      face_similarity_score: Number(rand(0.84, 0.97).toFixed(3)),
      face_verification_method: 'face_recognition',
    });
  }

  if (rows.length) {
    const { error } = await supabase.from('attendance').insert(rows);
    if (error) console.error(`  ✗ attendance ${user.email}: ${error.message}`);
    else console.log(`  ✓ ${user.email}: ${rows.length} attendance days`);
  } else {
    console.log(`  = ${user.email}: attendance already seeded`);
  }

  // Salary (also backfills test bank details via column defaults set on insert)
  const { data: sal } = await supabase.from('salaries').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!sal) {
    await supabase.from('salaries').insert({
      user_id: user.id,
      base_salary: cfg.salary,
      currency: 'INR',
      bank_name: 'AttendTrack Test Bank',
      bank_account: 'TEST' + String(Math.floor(1000000000 + Math.random() * 9000000000)),
      bank_ifsc: 'ATTB0TEST01',
    });
    console.log(`  ✓ ${user.email}: salary ₹${cfg.salary.toLocaleString()}`);
  }
}

async function seedLeaves(usersByEmail) {
  const { data: types } = await supabase.from('leave_types').select('id, name').eq('is_active', true);
  if (!types?.length) { console.log('  (no leave types — skipping leaves)'); return; }

  const { data: existing } = await supabase.from('leaves').select('id').limit(1);
  if (existing?.length) { console.log('  = leaves already exist — skipping'); return; }

  const samples = [
    { email: 'priya.patel@trackme.com',  daysAgo: 12, len: 2, reason: 'Family function', status: 'approved' },
    { email: 'amit.verma@trackme.com',   daysAgo: 6,  len: 1, reason: 'Not feeling well', status: 'approved' },
    { email: 'vikram.singh@trackme.com', daysAgo: -4, len: 3, reason: 'Trip to Goa', status: 'pending' },
    { email: 'sneha.gupta@trackme.com',  daysAgo: 20, len: 1, reason: 'Bank work', status: 'rejected' },
  ];
  for (const l of samples) {
    const u = usersByEmail[l.email];
    if (!u) continue;
    const start = new Date(Date.now() - l.daysAgo * 86400_000);
    const end   = new Date(start.getTime() + (l.len - 1) * 86400_000);
    const { error } = await supabase.from('leaves').insert({
      user_id: u.id,
      leave_type_id: types[Math.floor(Math.random() * types.length)].id,
      start_date: start.toISOString().slice(0, 10),
      end_date: end.toISOString().slice(0, 10),
      days: l.len,
      reason: l.reason,
      status: l.status,
    });
    if (error) console.error(`  ✗ leave ${l.email}: ${error.message}`);
    else console.log(`  ✓ leave: ${l.email} (${l.status})`);
  }
}

(async () => {
  console.log('─── Demo data seeder (additive) ───\n');
  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const usersByEmail = Object.fromEntries(list.users.map((u) => [u.email, u]));

  for (const cfg of EMPLOYEES) {
    const user = usersByEmail[cfg.email];
    if (!user) { console.log(`  ? missing user ${cfg.email} — run seed_dummy_users.js first`); continue; }
    await seedUser(user, cfg);
  }

  console.log('');
  await seedLeaves(usersByEmail);
  console.log('\n─── Done ───');
})();
