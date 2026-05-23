// middleware/validate.js — tiny dependency-free schema validation
//
// Usage:
//   router.post('/locations', validate({ body: locationSchema }), handler)
//
// Schema shape: { fieldName: { type, required?, min?, max?, regex?, enum?, custom? } }
// type ∈ 'string' | 'number' | 'boolean' | 'array' | 'object' | 'uuid' | 'email'

const AppError = require('../utils/AppError');

const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const checkField = (key, value, rule) => {
  if (value === undefined || value === null || value === '') {
    if (rule.required) return `${key} is required`;
    return null;
  }
  switch (rule.type) {
    case 'string':
      if (typeof value !== 'string') return `${key} must be a string`;
      if (rule.min != null && value.length < rule.min) return `${key} must be at least ${rule.min} chars`;
      if (rule.max != null && value.length > rule.max) return `${key} must be at most ${rule.max} chars`;
      if (rule.regex && !rule.regex.test(value)) return `${key} format is invalid`;
      break;
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(n)) return `${key} must be a number`;
      if (rule.min != null && n < rule.min) return `${key} must be >= ${rule.min}`;
      if (rule.max != null && n > rule.max) return `${key} must be <= ${rule.max}`;
      break;
    }
    case 'boolean':
      if (typeof value !== 'boolean') return `${key} must be a boolean`;
      break;
    case 'array':
      if (!Array.isArray(value)) return `${key} must be an array`;
      if (rule.min != null && value.length < rule.min) return `${key} must contain at least ${rule.min} items`;
      break;
    case 'object':
      if (typeof value !== 'object' || Array.isArray(value)) return `${key} must be an object`;
      break;
    case 'uuid':
      if (typeof value !== 'string' || !UUID_RE.test(value)) return `${key} must be a UUID`;
      break;
    case 'email':
      if (typeof value !== 'string' || !EMAIL_RE.test(value)) return `${key} must be a valid email`;
      break;
  }
  if (rule.enum && !rule.enum.includes(value)) return `${key} must be one of ${rule.enum.join(', ')}`;
  if (rule.custom) {
    const customErr = rule.custom(value);
    if (customErr) return customErr;
  }
  return null;
};

const validateObject = (obj, schema) => {
  const errors = [];
  for (const [key, rule] of Object.entries(schema)) {
    const err = checkField(key, obj?.[key], rule);
    if (err) errors.push(err);
  }
  return errors;
};

const validate = (schemas) => (req, _res, next) => {
  const errors = [];
  if (schemas.body)   errors.push(...validateObject(req.body   || {}, schemas.body));
  if (schemas.params) errors.push(...validateObject(req.params || {}, schemas.params));
  if (schemas.query)  errors.push(...validateObject(req.query  || {}, schemas.query));
  if (errors.length) return next(AppError.validation(errors));
  next();
};

module.exports = { validate, UUID_RE, EMAIL_RE };
