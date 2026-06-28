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
const { qrCheckIn }         = require('./controllers/qrController');
const { verifyToken }       = require('./middleware/auth');
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
const holidayRoutes         = require('./routes/holidays');
const managerRoutes         = require('./routes/manager');
const shiftRoutes           = require('./routes/shifts');
const designationRoutes     = require('./routes/designations');

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
app.get('/health',  (_req, res) => res.json({ status: 'ok', uptime: process.uptime(), version: '2.2.0' }));

// ─── Routes ───────────────────────────────────────────────────────────────────

// Public signup — strict per-IP rate limit, no auth required
const { signup } = require('./controllers/authController');
app.post('/api/auth/signup', rateLimit({ windowMs: 15 * 60_000, max: 5 }), signup);

// QR check-in — must be before attendanceRoutes to avoid wildcard clash
app.post('/api/qr-checkin', verifyToken, qrCheckIn);

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
app.use('/api/holidays',           holidayRoutes);           // holiday calendar
app.use('/api/manager',            managerRoutes);           // manager team view
app.use('/api/shifts',             shiftRoutes);             // public shift list
app.use('/api/designations',       designationRoutes);       // public designation list

// Employee's own salary view
const { getMySalary } = require('./controllers/salaryController');
app.get('/api/salary/me', verifyToken, getMySalary);
app.use('/api/admin',              adminRoutes);             // protected internally

// ─── 404 + error handler (must be last) ───────────────────────────────────────

app.use((req, _res, next) => next(AppError.notFound(`Route not found: ${req.method} ${req.originalUrl}`)));
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => logger.info(`AttendTrack API listening on port ${PORT}`));

// Periodic jobs: salary autopay + playful check-in nudges
const { startScheduler } = require('./services/scheduler');
startScheduler();

// Crash visibility — never crash silently in production
process.on('unhandledRejection', (reason) => logger.error('UnhandledRejection', { reason: reason?.message || reason }));
process.on('uncaughtException',  (err)    => logger.error('UncaughtException',  { error: err.message, stack: err.stack }));
