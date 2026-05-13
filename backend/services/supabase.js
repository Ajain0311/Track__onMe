// services/supabase.js
// Initializes the Supabase Admin client using the service role key.
// The service role key bypasses Row Level Security — backend use only.

const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    'Missing Supabase environment variables. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env'
  );
}

// Pass ws explicitly for Node.js < 22 which lacks a native WebSocket global
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  realtime: {
    transport: ws,
  },
});

console.log('[Supabase] Admin client initialized.');

module.exports = { supabase };
