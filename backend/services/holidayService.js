// services/holidayService.js — Holiday calendar management

const { supabase } = require('./supabase');

const mapHoliday = (r) => ({
  id:        r.id,
  date:      r.date,
  name:      r.name,
  type:      r.type,
  isActive:  r.is_active,
  createdAt: r.created_at,
});

const getHolidaysForYear = async (year) => {
  const { data, error } = await supabase
    .from('holidays')
    .select('*')
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)
    .eq('is_active', true)
    .order('date');
  if (error) throw new Error(error.message);
  return (data || []).map(mapHoliday);
};

const getAllHolidays = async () => {
  const { data, error } = await supabase
    .from('holidays')
    .select('*')
    .order('date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(mapHoliday);
};

const createHoliday = async ({ date, name, type = 'public' }) => {
  const { data, error } = await supabase
    .from('holidays')
    .insert({ date, name, type })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapHoliday(data);
};

const updateHoliday = async (id, { date, name, type, isActive }) => {
  const patch = {};
  if (date     !== undefined) patch.date      = date;
  if (name     !== undefined) patch.name      = name;
  if (type     !== undefined) patch.type      = type;
  if (isActive !== undefined) patch.is_active = isActive;

  const { data, error } = await supabase
    .from('holidays')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapHoliday(data);
};

const deleteHoliday = async (id) => {
  const { error } = await supabase.from('holidays').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

// Returns a Set of holiday date strings for quick O(1) lookup
const buildHolidaySet = (holidays) => new Set(holidays.map((h) => h.date));

module.exports = {
  getHolidaysForYear,
  getAllHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  buildHolidaySet,
};
