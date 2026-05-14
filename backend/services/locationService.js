// services/locationService.js
// CRUD for the locations table (admin-managed office/work locations).

const { supabase } = require('./supabase');

const mapRow = (row) => ({
  id: row.id,
  name: row.name,
  address: row.address || '',
  latitude: row.latitude,
  longitude: row.longitude,
  radiusMeters: row.radius_meters,
  wifiSsids: row.wifi_ssids || [],
  isActive: row.is_active,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// All locations (admin)
const getAllLocations = async () => {
  const { data, error } = await supabase
    .from('locations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data.map(mapRow);
};

// Active locations only (users)
const getActiveLocations = async () => {
  const { data, error } = await supabase
    .from('locations')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw new Error(error.message);
  return data.map(mapRow);
};

const getLocationById = async (id) => {
  const { data, error } = await supabase
    .from('locations')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data);
};

const createLocation = async (payload, createdBy) => {
  const { data, error } = await supabase
    .from('locations')
    .insert({
      name: payload.name.trim(),
      address: (payload.address || '').trim(),
      latitude: Number(payload.latitude),
      longitude: Number(payload.longitude),
      radius_meters: Number(payload.radiusMeters) || 200,
      wifi_ssids: payload.wifiSsids || [],
      is_active: payload.isActive !== false,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data);
};

const updateLocation = async (id, payload) => {
  const patch = { updated_at: new Date().toISOString() };
  if (payload.name        !== undefined) patch.name          = payload.name.trim();
  if (payload.address     !== undefined) patch.address       = payload.address.trim();
  if (payload.latitude    !== undefined) patch.latitude      = Number(payload.latitude);
  if (payload.longitude   !== undefined) patch.longitude     = Number(payload.longitude);
  if (payload.radiusMeters !== undefined) patch.radius_meters = Number(payload.radiusMeters);
  if (payload.wifiSsids   !== undefined) patch.wifi_ssids    = payload.wifiSsids;
  if (payload.isActive    !== undefined) patch.is_active     = payload.isActive;

  const { data, error } = await supabase
    .from('locations')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapRow(data);
};

const deleteLocation = async (id) => {
  // Detach attendance records referencing this location first
  await supabase
    .from('attendance')
    .update({ location_id: null })
    .eq('location_id', id);

  const { error } = await supabase.from('locations').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

module.exports = {
  getAllLocations,
  getActiveLocations,
  getLocationById,
  createLocation,
  updateLocation,
  deleteLocation,
};
