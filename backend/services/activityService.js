// services/activityService.js — user-facing activity feed

const { supabase } = require('./supabase');
const logger = require('../utils/logger');

const record = async ({ userId, type, title, description = null, metadata = {} }) => {
  if (!userId) return;
  try {
    await supabase.from('activity_logs').insert({
      user_id: userId,
      type,
      title,
      description,
      metadata,
    });
  } catch (err) {
    logger.warn('Activity log insert failed (non-fatal)', { error: err.message, type });
  }
};

const listForUser = async (userId, { limit = 50 } = {}) => {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (/relation .* does not exist|could not find the table/i.test(error.message)) {
      logger.warn('activity_logs table missing — apply migration 003');
      return [];
    }
    throw new Error(error.message);
  }
  return data;
};

module.exports = { record, listForUser };
