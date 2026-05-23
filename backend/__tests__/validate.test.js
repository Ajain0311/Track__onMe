// __tests__/validate.test.js — runs with `node --test`, no extra deps

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validate, UUID_RE, EMAIL_RE } = require('../middleware/validate');

const runMiddleware = (mw, req) =>
  new Promise((resolve) => mw(req, {}, (err) => resolve(err)));

test('UUID_RE matches a real UUID', () => {
  assert.ok(UUID_RE.test('6a11ebf7-7ea3-4c7b-67a3-6d3f00000000'));
  assert.equal(UUID_RE.test('not-a-uuid'), false);
});

test('EMAIL_RE accepts common emails and rejects garbage', () => {
  assert.ok(EMAIL_RE.test('aditya@example.com'));
  assert.ok(EMAIL_RE.test('first.last+tag@sub.domain.io'));
  assert.equal(EMAIL_RE.test('no-at-sign'), false);
  assert.equal(EMAIL_RE.test('a@b'), false);
});

test('validate() lets a well-formed body through', async () => {
  const mw = validate({
    body: {
      name:     { type: 'string', required: true, min: 1 },
      lat:      { type: 'number', min: -90, max: 90 },
      isActive: { type: 'boolean' },
    },
  });
  const err = await runMiddleware(mw, {
    body: { name: 'HQ', lat: 28.5, isActive: true },
  });
  assert.equal(err, undefined);
});

test('validate() reports missing required field', async () => {
  const mw = validate({ body: { name: { type: 'string', required: true } } });
  const err = await runMiddleware(mw, { body: {} });
  assert.ok(err, 'Expected an AppError');
  assert.equal(err.status, 422);
  assert.ok(err.details.includes('name is required'), `Got: ${JSON.stringify(err.details)}`);
});

test('validate() rejects out-of-range number', async () => {
  const mw = validate({ body: { lat: { type: 'number', min: -90, max: 90 } } });
  const err = await runMiddleware(mw, { body: { lat: 200 } });
  assert.ok(err);
  assert.equal(err.status, 422);
});

test('validate() rejects bad UUID param', async () => {
  const mw = validate({ params: { id: { type: 'uuid', required: true } } });
  const err = await runMiddleware(mw, { params: { id: 'not-a-uuid' } });
  assert.ok(err);
  assert.equal(err.status, 422);
});

test('validate() enum check', async () => {
  const mw = validate({ body: { role: { type: 'string', enum: ['admin','user'] } } });
  const err = await runMiddleware(mw, { body: { role: 'pirate' } });
  assert.ok(err);
  assert.equal(err.status, 422);
});

test('validate() custom validator', async () => {
  const mw = validate({
    body: {
      slug: { type: 'string', custom: (v) => v.includes(' ') ? 'slug cannot contain spaces' : null },
    },
  });
  const err = await runMiddleware(mw, { body: { slug: 'with space' } });
  assert.ok(err);
  assert.ok(err.details[0].includes('cannot contain spaces'));
});
