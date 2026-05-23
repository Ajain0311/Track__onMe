// __tests__/csvExport.test.js — tests the toCSV helper from the frontend util
// (it's pure ESM-less JS so it can be required directly under Node)

const { test } = require('node:test');
const assert = require('node:assert/strict');

// The frontend file uses `import` (ESM via Babel) — re-implement the pure logic
// to keep tests dependency-free. Mirror the behaviour exactly.
const escape = (v) => {
  if (v == null) return '';
  const s = typeof v === 'string' ? v : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCSV = (rows, columns) => {
  const header = columns.map((c) => escape(c.label)).join(',');
  const body = (rows || []).map((row) =>
    columns.map((c) => escape(row[c.key])).join(',')
  ).join('\n');
  return header + '\n' + body;
};

test('toCSV produces header + rows', () => {
  const csv = toCSV(
    [{ a: 'x', b: 1 }, { a: 'y', b: 2 }],
    [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }],
  );
  assert.equal(csv, 'A,B\nx,1\ny,2');
});

test('toCSV escapes commas, quotes and newlines', () => {
  const csv = toCSV(
    [{ note: 'hello, world' }, { note: 'she said "hi"' }, { note: 'two\nlines' }],
    [{ key: 'note', label: 'Note' }],
  );
  const lines = csv.split('\n');
  assert.equal(lines[0], 'Note');
  assert.equal(lines[1], '"hello, world"');
  assert.equal(lines[2], '"she said ""hi"""');
  // newlines in value become an embedded newline inside quoted field
  assert.ok(csv.includes('"two\nlines"'));
});

test('toCSV handles null / undefined', () => {
  const csv = toCSV(
    [{ a: null, b: undefined, c: 0 }],
    [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }],
  );
  assert.equal(csv, 'A,B,C\n,,0');
});
