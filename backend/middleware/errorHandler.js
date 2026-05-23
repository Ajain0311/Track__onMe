// middleware/errorHandler.js — centralized error response

const logger = require('../utils/logger');

module.exports = (err, req, res, _next) => {
  const status = err.status || 500;
  const payload = {
    error: err.message || 'Internal Server Error',
    code:  err.code || (status >= 500 ? 'internal' : 'error'),
  };
  if (err.details) payload.details = err.details;

  // Log 5xx with stack, 4xx as warn without stack
  if (status >= 500) {
    logger.error(`${req.method} ${req.url} → ${status}`, { message: err.message, stack: err.stack });
  } else {
    logger.warn(`${req.method} ${req.url} → ${status}`, { message: err.message });
  }

  res.status(status).json(payload);
};
