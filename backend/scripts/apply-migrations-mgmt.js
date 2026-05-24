#!/usr/bin/env node
// backend/scripts/apply-migrations-mgmt.js
// Applies every .sql file in backend/migrations/ via Supabase Management API.
// Uses SUPABASE_ACCESS_TOKEN (Personal Access Token from supabase.com/dashboard/account/tokens)
// and SUPABASE_PROJECT_REF (e.g. yjaeekdnzkxghzjyjumr).
//
// Unlike apply-migrations.js (which uses pg + DB password), this uses the
// project's management endpoint and only needs a PAT.

const fs   = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Also try repo-root .env
const ROOT_ENV = path.join(__dirname, '../../.env');
if (fs.existsSync(ROOT_ENV)) require('dotenv').config({ path: ROOT_ENV });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF   = process.env.SUPABASE_PROJECT_REF
  || (process.env.SUPABASE_URL?.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1]);

if (!TOKEN || !REF) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF (or SUPABASE_URL).');
  process.exit(1);
}

const runSQL = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
};

(async () => {
  const dir   = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  if (!files.length) { console.log('No migrations to apply.'); return; }

  console.log(`Applying ${files.length} migration(s) to project ${REF}\n`);

  for (const f of files) {
    process.stdout.write(`▶ ${f} … `);
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    try {
      await runSQL(sql);
      console.log('OK');
    } catch (err) {
      console.log('FAILED');
      console.error(`  ${err.message.split('\n').slice(0, 3).join('\n  ')}`);
      process.exit(1);
    }
  }

  console.log('\n✓ All migrations applied');
})();
