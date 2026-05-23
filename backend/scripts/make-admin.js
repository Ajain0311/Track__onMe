#!/usr/bin/env node
// backend/scripts/make-admin.js
// Run: node scripts/make-admin.js admin@attendtrack.com
//
// Finds the Supabase auth user by email and upserts them into user_roles
// with role = 'admin'. Uses the service-role key from backend/.env

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/make-admin.js <email>');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

(async () => {
  // 1. Look up the user by email
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) { console.error('Failed to list users:', listErr.message); process.exit(1); }

  const user = users.find((u) => u.email === email);
  if (!user) {
    console.error(`No user found with email "${email}".`);
    console.log('Registered users:', users.map((u) => u.email).join(', '));
    process.exit(1);
  }

  console.log(`Found user: ${user.email} (${user.id})`);

  // 2. Upsert admin role
  const { data, error: upsertErr } = await supabase
    .from('user_roles')
    .upsert(
      { user_id: user.id, role: 'admin', updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  if (upsertErr) { console.error('Failed to set admin role:', upsertErr.message); process.exit(1); }

  console.log(`✓ Success! ${email} is now admin.`);
  console.log('  user_id:', data.user_id, '  role:', data.role);
  console.log('\nRestart the app and log in — the Admin tab will now appear.');
})();
