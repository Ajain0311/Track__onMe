// services/notificationService.js — per-user inbox

const { supabase } = require('./supabase');
const logger = require('../utils/logger');

const send = async ({ userId, type, title, body = null, link = null, metadata = {} }) => {
  if (!userId) return;
  try {
    await supabase.from('notifications').insert({
      user_id: userId, type, title, body, link, metadata,
    });
  } catch (err) {
    logger.warn('Notification insert failed (non-fatal)', { error: err.message, type });
  }
};

const listForUser = async (userId, { unreadOnly = false, limit = 50 } = {}) => {
  let q = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (unreadOnly) q = q.eq('is_read', false);
  const { data, error } = await q;
  if (error) {
    // Graceful fallback if migration 003 hasn't been applied yet
    if (/relation .* does not exist|could not find the table/i.test(error.message)) {
      logger.warn('notifications table missing — apply migration 003');
      return [];
    }
    throw new Error(error.message);
  }
  return data;
};

const markRead = async (id, userId) => {
  const { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
};

const markAllRead = async (userId) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_read', false);
  if (error) throw new Error(error.message);
};

module.exports = { send, listForUser, markRead, markAllRead };
