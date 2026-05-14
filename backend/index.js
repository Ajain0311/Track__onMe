// index.js — AttendTrack API entry point

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const attendanceRoutes = require('./routes/attendance');
const adminRoutes = require('./routes/admin');
const locationRoutes = require('./routes/locations');

require('./services/supabase');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/', (_req, res) => res.status(200).json({ status: 'ok', message: 'AttendTrack API' }));

app.use('/api', attendanceRoutes);          // /api/checkin, /api/status, /api/me …
app.use('/api/locations', locationRoutes);  // /api/locations (active list for users)
app.use('/api/admin', adminRoutes);         // /api/admin/* (admin-only)

// ─── Global Error Handler ────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error(`[Error] ${err.message}`);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[Server] AttendTrack API on port ${PORT}`);
});
