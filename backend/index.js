// index.js — AttendTrack API entry point

require('dotenv').config();

const express = require('express');
const cors    = require('cors');

const logger          = require('./utils/logger');
const requestLogger   = require('./middleware/requestLogger');
const errorHandler    = require('./middleware/errorHandler');
const rateLimit       = require('./middleware/rateLimit');
const securityHeaders = require('./middleware/securityHeaders');
const AppError        = require('./utils/AppError');

require('./services/supabase');

const attendanceRoutes      = require('./routes/attendance');
const adminRoutes           = require('./routes/admin');
const locationRoutes        = require('./routes/locations');
const locationRequestRoutes = require('./routes/locationRequests');
const notificationRoutes    = require('./routes/notifications');
const activityRoutes        = require('./routes/activity');
const faceRoutes            = require('./routes/face');
const leaveRoutes           = require('./routes/leaves');
const correctionRoutes      = require('./routes/corrections');
const departmentRoutes      = require('./routes/departments');
const reportRoutes          = require('./routes/reports');
const analyticsRoutes       = require('./routes/analytics');

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── Core middleware ──────────────────────────────────────────────────────────

app.set('trust proxy', 1); // honest req.ip behind Render's proxy

app.use(cors({
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
    : true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(securityHeaders);
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

// Global IP-based rate limit for sanity (cheap DoS protection)
app.use(rateLimit({ windowMs: 60_000, max: 200 }));

// ─── Health / root ────────────────────────────────────────────────────────────

app.get('/',        (_req, res) => res.json({ status: 'ok', message: 'AttendTrack API' }));
app.get('/health',  (_req, res) => res.json({ status: 'ok', uptime: process.uptime(), version: '2.0.0' }));

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api',                    attendanceRoutes);        // /api/checkin, /api/status, /api/me …
app.use('/api/face',               faceRoutes);             // /api/face/register, /api/face/verify …
app.use('/api/locations',          locationRoutes);
app.use('/api/location-requests',  locationRequestRoutes);
app.use('/api/notifications',      notificationRoutes);
app.use('/api/activity',           activityRoutes);
app.use('/api/leaves',             leaveRoutes);
app.use('/api/corrections',        correctionRoutes);
app.use('/api/departments',        departmentRoutes);
app.use('/api/admin/reports',      reportRoutes);            // report endpoints
app.use('/api/analytics',          analyticsRoutes);         // personal analytics
app.use('/api/admin',              adminRoutes);             // protected internally

// ─── 404 + error handler (must be last) ───────────────────────────────────────

app.use((req, _res, next) => next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`)));
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => logger.info(`AttendTrack API listening on port ${PORT}`));

// Crash visibility — never crash silently in production
process.on('unhandledRejection', (reason) => logger.error('UnhandledRejection', { reason: reason?.message || reason }));
process.on('uncaughtException',  (err)    => logger.error('UncaughtException',  { error: err.message, stack: err.stack }));
