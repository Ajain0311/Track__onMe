// check_backend_imports.js — verify destructured require() names exist in target module.exports
// Run: node backend/scripts/check_backend_imports.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) files.push(p);
  }
})(ROOT);

let problems = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  // const { a, b: c } = require('./x')
  const re = /const\s*\{([^}]+)\}\s*=\s*require\(['"](\.[^'"]+)['"]\)/g;
  let m;
  while ((m = re.exec(src))) {
    const names = m[1].split(',').map((s) => s.split(':')[0].trim()).filter(Boolean);
    let target = path.resolve(path.dirname(f), m[2]);
    if (!target.endsWith('.js')) {
      if (fs.existsSync(target + '.js')) target += '.js';
      else if (fs.existsSync(path.join(target, 'index.js'))) target = path.join(target, 'index.js');
    }
    if (!fs.existsSync(target)) { console.log(`${path.relative(ROOT, f)}: module not found ${m[2]}`); problems++; continue; }
    let mod;
    try { mod = require(target); } catch (e) { console.log(`${path.relative(ROOT, f)}: require error ${m[2]}: ${e.message}`); problems++; continue; }
    for (const n of names) {
      if (!(n in mod)) { console.log(`${path.relative(ROOT, f)}: '${n}' not exported by ${m[2]}`); problems++; }
    }
  }
}
console.log(`\nChecked ${files.length} files — ${problems} problems`);
