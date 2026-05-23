#!/usr/bin/env node
// backend/scripts/apply-migrations.js
// Applies every .sql file in backend/migrations/ in order.
//
// Requires: SUPABASE_DB_URL — direct Postgres connection string from
// Supabase Dashboard → Project Settings → Database → Connection string (URI).
// Example: postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres

const fs   = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

(async () => {
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('Missing SUPABASE_DB_URL in backend/.env');
    console.error('Grab it from Supabase Dashboard → Project Settings → Database → URI connection string.');
    process.exit(1);
  }

  // Lazy require so missing pg is reported cleanly
  let Client;
  try { ({ Client } = require('pg')); }
  catch { console.error("'pg' not installed. Run: npm i pg"); process.exit(1); }

  const dir   = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  if (!files.length) { console.log('No migrations to apply.'); return; }

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    process.stdout.write(`\n▶ ${f} … `);
    try {
      await client.query(sql);
      console.log('OK');
    } catch (err) {
      console.error('FAILED');
      console.error('  ', err.message);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  console.log('\n✓ All migrations applied');
})();
