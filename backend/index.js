// index.js
// Entry point for the attendance backend server.

require('dotenv').config();
require('./services/firebase'); // Initialize Firebase Admin early

const express = require('express');
const cors = require('cors');
const attendanceRoutes = require('./routes/attendance');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check
app.get('/', (req, res) => res.status(200).send('API running'));

// Attendance routes
app.use('/api', attendanceRoutes);

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(`[Error] ${err.message}`);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
