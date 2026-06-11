// smoke_admin.js — sign in as seeded admin and hit every GET endpoint
// Run: node backend/scripts/smoke_admin.js [baseUrl]
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const BASE = process.argv[2] || 'http://localhost:5000/api';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const GETS = [
  // user-facing
  '/me', '/status', '/attendance', '/attendance/daily', '/locations',
  '/location-requests', '/notifications', '/activity',
  '/leaves', '/leaves/types', '/leaves/balance?year=2026',
  '/corrections', '/departments', '/departments/profile',
  '/analytics/summary', '/analytics/punctuality?months=3',
  '/holidays?year=2026', '/shifts', '/designations', '/manager/team',
  // admin
  '/admin/stats', '/admin/active-sessions', '/admin/users?page=1',
  '/admin/locations', '/admin/location-requests?status=pending',
  '/admin/leaves', '/admin/corrections',
  '/admin/departments', '/admin/profiles', '/admin/audit-logs',
  '/admin/analytics?days=30', '/admin/punctuality?days=30',
  '/admin/absenteeism?days=30&threshold=70', '/admin/anomalies?days=30',
  '/admin/leave-analytics?year=2026',
  '/admin/settings', '/admin/holidays', '/admin/designations',
  '/admin/shifts', '/admin/shifts/assignments',
  '/admin/reports/attendance', '/admin/reports/leaves',
  // salaries / payroll
  '/salary/me', '/admin/salaries', '/admin/salary-payouts',
  '/admin/salary-settings',
];

(async () => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'admin@trackme.com', password: 'Admin@123',
  });
  if (error) { console.error('SIGN-IN FAILED:', error.message); process.exit(1); }
  const token = data.session.access_token;
  console.log('Signed in as admin, testing', GETS.length, 'endpoints against', BASE, '\n');

  let fails = 0;
  for (const path of GETS) {
    try {
      const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${token}` } });
      const body = await res.text();
      if (res.ok) {
        console.log(`OK    ${res.status} ${path}`);
      } else {
        fails++;
        console.log(`FAIL  ${res.status} ${path}\n      ${body.slice(0, 300)}`);
      }
    } catch (e) {
      fails++;
      console.log(`ERR   ---- ${path}\n      ${e.message}`);
    }
  }
  console.log(`\n${fails} failing of ${GETS.length}`);
  process.exit(0);
})();
