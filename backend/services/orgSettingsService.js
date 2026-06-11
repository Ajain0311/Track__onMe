// services/orgSettingsService.js — Organization configuration key-value store

const { supabase } = require('./supabase');

// In-memory cache: { settings: {...}, fetchedAt: Date }
let _cache = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const isCacheValid = () =>
  _cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS;

const invalidateCache = () => { _cache = null; };

// Fetch all settings as a flat key→value object
const getAllSettings = async ({ bypassCache = false } = {}) => {
  if (!bypassCache && isCacheValid()) return _cache.settings;

  const { data, error } = await supabase
    .from('org_settings')
    .select('key, value, label');

  if (error) throw new Error(error.message);

  const settings = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  _cache = { settings, fetchedAt: Date.now() };
  return settings;
};

// Get a single setting with a default fallback
const getSetting = async (key, defaultValue = null) => {
  const settings = await getAllSettings().catch(() => ({}));
  return settings[key] ?? defaultValue;
};

// Upsert multiple settings
const updateSettings = async (updates) => {
  const rows = Object.entries(updates).map(([key, value]) => ({
    key,
    value: String(value),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('org_settings')
    .upsert(rows, { onConflict: 'key' });

  if (error) throw new Error(error.message);
  invalidateCache();
};

// Convenience: get punctuality thresholds
const getPunctualityConfig = async () => {
  const s = await getAllSettings().catch(() => ({}));
  const startHour    = parseInt(s.work_start_hour   ?? '9',  10);
  const startMin     = parseInt(s.work_start_minute ?? '0',  10);
  const graceMin     = parseInt(s.late_threshold_minutes ?? '15', 10);
  const earlyBuffer  = parseInt(s.early_checkout_buffer  ?? '30', 10);
  const endHour      = parseInt(s.work_end_hour   ?? '18', 10);
  const endMin       = parseInt(s.work_end_minute ?? '0',  10);

  const lateHour = Math.floor((startHour * 60 + startMin + graceMin) / 60);
  const lateMin  = (startHour * 60 + startMin + graceMin) % 60;
  const earlyHour = Math.floor((endHour * 60 + endMin - earlyBuffer) / 60);

  return {
    startHour, startMin,
    endHour, endMin,
    graceMin, earlyBuffer,
    lateHour, lateMin,
    earlyCheckoutHour: earlyHour,
  };
};

// Convenience: working days as a Set of JS day-of-week (0=Sun…6=Sat)
// org stores 1=Mon…7=Sun; convert to JS
const getWorkingDays = async () => {
  const s = await getAllSettings().catch(() => ({ working_days: '1,2,3,4,5' }));
  const days = (s.working_days || '1,2,3,4,5').split(',').map((d) => parseInt(d.trim(), 10));
  // Convert Mon=1…Sun=7 → JS 0=Sun…6=Sat
  return new Set(days.map((d) => d === 7 ? 0 : d));
};

module.exports = {
  getAllSettings, getSetting, updateSettings,
  getPunctualityConfig, getWorkingDays,
  invalidateCache,
};
