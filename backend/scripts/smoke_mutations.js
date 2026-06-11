// smoke_mutations.js — round-trip create/update/delete for shifts + designations
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const BASE = process.argv[2] || 'http://localhost:5000/api';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

(async () => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'admin@trackme.com', password: 'Admin@123',
  });
  if (error) { console.error('SIGN-IN FAILED:', error.message); process.exit(1); }
  const token = data.session.access_token;
  const call = async (method, path, body) => {
    const res = await fetch(BASE + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    console.log(`${res.ok ? 'OK  ' : 'FAIL'} ${res.status} ${method} ${path}${res.ok ? '' : ' → ' + text.slice(0, 200)}`);
    return { ok: res.ok, json };
  };

  // Shift round-trip
  const s = await call('POST', '/admin/shifts', { name: '__smoke shift', startHour: 9, startMinute: 0, endHour: 17, endMinute: 0 });
  if (s.ok && s.json.shift?.id) {
    await call('PUT', `/admin/shifts/${s.json.shift.id}`, { name: '__smoke shift 2' });
    await call('DELETE', `/admin/shifts/${s.json.shift.id}`);
  }

  // Designation round-trip
  const d = await call('POST', '/admin/designations', { name: '__smoke designation', level: 1 });
  if (d.ok && d.json.designation?.id) {
    await call('PUT', `/admin/designations/${d.json.designation.id}`, { name: '__smoke designation 2' });
    await call('DELETE', `/admin/designations/${d.json.designation.id}`);
  }

  process.exit(0);
})();
