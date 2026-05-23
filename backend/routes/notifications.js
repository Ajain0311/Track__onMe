// routes/notifications.js

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { list, markRead, markAllRead } = require('../controllers/notificationController');

router.use(verifyToken);

router.get('/',           list);
router.patch('/read-all', markAllRead);
router.patch('/:id/read', validate({ params: { id: { type: 'uuid', required: true } } }), markRead);

module.exports = router;
