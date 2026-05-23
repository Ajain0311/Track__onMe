// __tests__/rateLimit.test.js

const { test } = require('node:test');
const assert = require('node:assert/strict');
const rateLimit = require('../middleware/rateLimit');

const run = (mw, req) => new Promise((resolve) => mw(req, {}, (err) => resolve(err)));

test('rateLimit allows under the threshold', async () => {
  const mw = rateLimit({ windowMs: 60_000, max: 3, key: (r) => r.ip });
  const req = { ip: '1.2.3.4' };
  assert.equal(await run(mw, req), undefined);
  assert.equal(await run(mw, req), undefined);
  assert.equal(await run(mw, req), undefined);
});

test('rateLimit blocks over the threshold', async () => {
  const mw = rateLimit({ windowMs: 60_000, max: 2, key: () => 'shared-key' });
  const req = { ip: '5.6.7.8' };
  await run(mw, req); // 1
  await run(mw, req); // 2
  const err = await run(mw, req); // 3 — should fail
  assert.ok(err);
  assert.equal(err.status, 429);
});

test('rateLimit per-IP independence', async () => {
  const mw = rateLimit({ windowMs: 60_000, max: 1, key: (r) => r.ip });
  assert.equal(await run(mw, { ip: 'a' }), undefined);
  assert.ok(await run(mw, { ip: 'a' })); // a is now rate-limited
  assert.equal(await run(mw, { ip: 'b' }), undefined); // b independent
});
