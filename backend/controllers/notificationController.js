// controllers/notificationController.js

const asyncHandler = require('../utils/asyncHandler');
const notify = require('../services/notificationService');

// GET /api/notifications?unread=1
const list = asyncHandler(async (req, res) => {
  const items = await notify.listForUser(req.user.id, {
    unreadOnly: req.query.unread === '1' || req.query.unread === 'true',
    limit: Math.min(parseInt(req.query.limit, 10) || 50, 200),
  });
  res.json({ notifications: items });
});

// PATCH /api/notifications/:id/read
const markRead = asyncHandler(async (req, res) => {
  const updated = await notify.markRead(req.params.id, req.user.id);
  res.json({ notification: updated });
});

// PATCH /api/notifications/read-all
const markAllRead = asyncHandler(async (req, res) => {
  await notify.markAllRead(req.user.id);
  res.json({ message: 'All notifications marked as read.' });
});

module.exports = { list, markRead, markAllRead };
