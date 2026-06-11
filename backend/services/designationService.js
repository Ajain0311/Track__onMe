// services/designationService.js

const { supabase } = require('./supabase');

async function getActiveDesignations() {
  const { data, error } = await supabase
    .from('designations')
    .select('id, name, level')
    .eq('is_active', true)
    .order('level', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return data;
}

async function getAllDesignations() {
  const { data, error } = await supabase
    .from('designations')
    .select('*')
    .order('level', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return data;
}

async function createDesignation({ name, level = 1 }) {
  const { data, error } = await supabase
    .from('designations')
    .insert({ name, level })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateDesignation(id, patch) {
  const update = {};
  if (patch.name  !== undefined) update.name      = patch.name;
  if (patch.level !== undefined) update.level     = patch.level;
  if (patch.isActive !== undefined) update.is_active = patch.isActive;
  const { data, error } = await supabase
    .from('designations')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteDesignation(id) {
  const { error } = await supabase
    .from('designations')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

module.exports = { getActiveDesignations, getAllDesignations, createDesignation, updateDesignation, deleteDesignation };
