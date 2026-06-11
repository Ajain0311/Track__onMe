// seed_users.js — full reset + create admin/manager/user
// Run: node backend/scripts/seed_users.js

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
  { email: 'admin@trackme.com',   password: 'Admin@123',   role: 'admin' },
  { email: 'manager@trackme.com', password: 'Manager@123', role: 'manager' },
  { email: 'user@trackme.com',    password: 'User@123',    role: 'user' },
];

async function run() {
  console.log('\n─── Step 1: Delete all existing auth users ───');
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) { console.error('listUsers error:', error.message); break; }
    if (!data.users.length) break;
    for (const u of data.users) {
      const { error: delErr } = await supabase.auth.admin.deleteUser(u.id);
      if (delErr) console.error(`  delete ${u.email}:`, delErr.message);
      else console.log(`  deleted: ${u.email}`);
    }
    if (data.users.length < 1000) break;
    page++;
  }

  console.log('\n─── Step 2: Clear remaining non-cascade tables ───');
  // Most tables cascade-delete when auth.users rows are deleted.
  // Only these three have no FK cascade to auth.users:
  const nonCascade = ['audit_logs', 'activity_logs', 'notifications'];
  for (const t of nonCascade) {
    const { error } = await supabase.from(t).delete().gte('created_at', '2000-01-01');
    if (error) console.error(`  ${t}:`, error.message);
    else console.log(`  cleared: ${t}`);
  }

  console.log('\n─── Step 3: Create fresh users ───');
  for (const u of USERS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    });
    if (error) { console.error(`  create ${u.email}:`, error.message); continue; }

    const userId = data.user.id;
    const { error: roleErr } = await supabase.from('user_roles').upsert({
      user_id: userId,
      role: u.role,
    }, { onConflict: 'user_id' });

    if (roleErr) console.error(`  role ${u.role} for ${u.email}:`, roleErr.message);
    else console.log(`  ✓ ${u.email}  [${u.role}]  id=${userId}`);
  }

  console.log('\n─── Done ───\n');
}

run().catch(console.error);
