// index.js
// Entry point for the AttendTrack backend server.

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const attendanceRoutes = require('./routes/attendance');

// Initialize Supabase client on startup so errors surface immediately
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

app.get('/', (_req, res) => res.status(200).json({ status: 'ok', message: 'AttendTrack API running' }));

app.use('/api', attendanceRoutes);

// ─── Global Error Handler ────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error(`[Error] ${err.message}`);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// ─── Start Server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[Server] AttendTrack API listening on port ${PORT}`);
});
