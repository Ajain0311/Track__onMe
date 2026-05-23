// __tests__/AppError.test.js

const { test } = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../utils/AppError');

test('AppError has correct shape', () => {
  const e = new AppError('boom', 418, 'teapot', { hint: 'try again' });
  assert.equal(e.message, 'boom');
  assert.equal(e.status, 418);
  assert.equal(e.code, 'teapot');
  assert.deepEqual(e.details, { hint: 'try again' });
  assert.equal(e.isOperational, true);
});

test('factory shorthands set sensible defaults', () => {
  assert.equal(AppError.badRequest().status,   400);
  assert.equal(AppError.unauthorized().status, 401);
  assert.equal(AppError.forbidden().status,    403);
  assert.equal(AppError.notFound().status,     404);
  assert.equal(AppError.conflict().status,     409);
  assert.equal(AppError.validation(['x']).status, 422);
  assert.equal(AppError.internal().status,     500);
});
