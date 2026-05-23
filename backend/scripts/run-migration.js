#!/usr/bin/env node
// backend/scripts/run-migration.js
// One-time setup script: runs migration 002 (location_requests) against Supabase.
// Usage: node backend/scripts/run-migration.js

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env');
  process.exit(1);
}

// Individual DDL statements — executed one at a time via RPC workaround.
// Supabase REST API does not support raw DDL; we use the pg-meta endpoint
// (available via the service-role key) to execute each statement.
const statements = [
  `ALTER TABLE locations ADD COLUMN IF NOT EXISTS is_global BOOLEAN NOT NULL DEFAULT true`,

  `CREATE TABLE IF NOT EXISTS user_locations (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES locations(id)  ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, location_id)
  )`,

  `CREATE TABLE IF NOT EXISTS location_requests (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    address       TEXT NOT NULL DEFAULT '',
    latitude      DOUBLE PRECISION NOT NULL,
    longitude     DOUBLE PRECISION NOT NULL,
    radius_meters INTEGER NOT NULL DEFAULT 200,
    wifi_ssids    TEXT[] NOT NULL DEFAULT '{}',
    notes         TEXT,
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    admin_note    TEXT,
    reviewed_by   UUID REFERENCES auth.users(id),
    reviewed_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_location_requests_user_id  ON location_requests(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_location_requests_status   ON location_requests(status)`,
  `CREATE INDEX IF NOT EXISTS idx_user_locations_user_id     ON user_locations(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_locations_location_id ON user_locations(location_id)`,

  `ALTER TABLE location_requests ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE user_locations     ENABLE ROW LEVEL SECURITY`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='location_requests' AND policyname='users_read_own_requests') THEN
      CREATE POLICY "users_read_own_requests" ON location_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='location_requests' AND policyname='users_insert_own_requests') THEN
      CREATE POLICY "users_insert_own_requests" ON location_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='location_requests' AND policyname='users_delete_own_pending_requests') THEN
      CREATE POLICY "users_delete_own_pending_requests" ON location_requests FOR DELETE TO authenticated USING (auth.uid() = user_id AND status = 'pending');
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_locations' AND policyname='users_read_own_user_locations') THEN
      CREATE POLICY "users_read_own_user_locations" ON user_locations FOR SELECT TO authenticated USING (auth.uid() = user_id);
    END IF;
  END $$`,
];

async function runMigration() {
  // Use the pg-meta SQL endpoint which is available in Supabase with service-role key
  const baseUrl = SUPABASE_URL.replace('https://', 'https://');
  const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args)).catch(() => {
    // Fallback to built-in fetch (Node 18+)
    return globalThis.fetch(...args);
  });

  console.log('Running migration 002 against', SUPABASE_URL);

  for (const sql of statements) {
    const short = sql.trim().split('\n')[0].substring(0, 60);
    process.stdout.write(`  → ${short}... `);
    try {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        // Try alternative endpoint
        const resp2 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/query`, {
          method: 'POST',
          headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: sql }),
        });
        if (!resp2.ok) {
          console.log('⚠ (run manually in SQL Editor)');
          continue;
        }
      }
      console.log('✓');
    } catch (e) {
      console.log('⚠ Error:', e.message.split('\n')[0]);
    }
  }
  console.log('\nDone. If any statements showed ⚠, paste 002_location_requests.sql into the Supabase SQL Editor.');
}

runMigration();
