// seed_dummy_users.js — ADDITIVE seeder: creates core + dummy employee accounts
// without deleting anything (unlike seed_users.js which is a full reset).
// Run: node backend/scripts/seed_dummy_users.js

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  }
);

const USERS = [
  { email: 'admin@trackme.com',    password: 'Admin@123',    role: 'admin' },
  { email: 'manager@trackme.com',  password: 'Manager@123',  role: 'manager' },
  { email: 'user@trackme.com',     password: 'User@123',     role: 'user' },
  { email: 'rahul.sharma@trackme.com',  password: 'Employee@123', role: 'user', name: 'Rahul Sharma' },
  { email: 'priya.patel@trackme.com',   password: 'Employee@123', role: 'user', name: 'Priya Patel' },
  { email: 'amit.verma@trackme.com',    password: 'Employee@123', role: 'user', name: 'Amit Verma' },
  { email: 'sneha.gupta@trackme.com',   password: 'Employee@123', role: 'user', name: 'Sneha Gupta' },
  { email: 'vikram.singh@trackme.com',  password: 'Employee@123', role: 'user', name: 'Vikram Singh' },
];

async function findUserByEmail(email) {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const hit = data.users.find((u) => u.email === email);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
    page++;
  }
}

async function run() {
  console.log('─── Seeding users (additive — nothing is deleted) ───\n');
  for (const u of USERS) {
    let user = await findUserByEmail(u.email);
    if (user) {
      console.log(`  exists: ${u.email}`);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
      });
      if (error) { console.error(`  ✗ create ${u.email}: ${error.message}`); continue; }
      user = data.user;
      console.log(`  ✓ created: ${u.email}  [${u.role}]`);
    }

    const { error: roleErr } = await supabase.from('user_roles').upsert(
      { user_id: user.id, role: u.role },
      { onConflict: 'user_id' }
    );
    if (roleErr) console.error(`  ✗ role for ${u.email}: ${roleErr.message}`);

    if (u.name) {
      const { error: profErr } = await supabase.from('employee_profiles').upsert(
        { user_id: user.id, display_name: u.name },
        { onConflict: 'user_id' }
      );
      if (profErr) console.error(`  ✗ profile for ${u.email}: ${profErr.message}`);
    }
  }

  console.log('\n─── Credentials ───');
  for (const u of USERS) console.log(`  ${u.role.padEnd(8)} ${u.email}  /  ${u.password}`);
  console.log('');
}

run().catch((e) => { console.error(e); process.exit(1); });
