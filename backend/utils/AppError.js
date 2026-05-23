// utils/AppError.js — typed error class for predictable error responses

class AppError extends Error {
  constructor(message, status = 500, code = null, details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }

  static badRequest(msg = 'Bad request', details) { return new AppError(msg, 400, 'bad_request', details); }
  static unauthorized(msg = 'Unauthorized')        { return new AppError(msg, 401, 'unauthorized'); }
  static forbidden(msg = 'Forbidden')              { return new AppError(msg, 403, 'forbidden'); }
  static notFound(msg = 'Not found')               { return new AppError(msg, 404, 'not_found'); }
  static conflict(msg = 'Conflict')                { return new AppError(msg, 409, 'conflict'); }
  static validation(details)                       { return new AppError('Validation failed', 422, 'validation', details); }
  static internal(msg = 'Internal server error')   { return new AppError(msg, 500, 'internal'); }
}

module.exports = AppError;
