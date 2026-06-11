// check_frontend_imports.js — cross-check named imports vs exports in frontend
// Run from repo root: node backend/scripts/check_frontend_imports.js
const fs = require('fs');
const path = require('path');

const FRONTEND = path.join(__dirname, '../../frontend');
const parser = require(path.join(FRONTEND, 'node_modules/@babel/parser'));

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) files.push(p);
  }
})(FRONTEND);

const parse = (file) => parser.parse(fs.readFileSync(file, 'utf8'), {
  sourceType: 'module',
  plugins: ['jsx'],
  errorRecovery: false,
});

// Collect exports per file
const exportsOf = {};
const syntaxErrors = [];
for (const f of files) {
  let ast;
  try { ast = parse(f); } catch (e) { syntaxErrors.push(`${f}: ${e.message}`); continue; }
  const names = new Set();
  for (const node of ast.program.body) {
    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) {
        if (node.declaration.declarations) {
          for (const d of node.declaration.declarations) {
            if (d.id.type === 'Identifier') names.add(d.id.name);
            if (d.id.type === 'ObjectPattern') for (const p of d.id.properties) p.value && p.value.name && names.add(p.value.name);
          }
        } else if (node.declaration.id) names.add(node.declaration.id.name);
      }
      for (const s of node.specifiers || []) names.add(s.exported.name);
    }
    if (node.type === 'ExportDefaultDeclaration') names.add('default');
  }
  exportsOf[f] = names;
}

const resolve = (from, spec) => {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const cand of [base, base + '.js', path.join(base, 'index.js')]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  return 'MISSING';
};

const problems = [];
for (const f of files) {
  let ast;
  try { ast = parse(f); } catch { continue; }
  for (const node of ast.program.body) {
    if (node.type !== 'ImportDeclaration') continue;
    const target = resolve(f, node.source.value);
    if (target === null) continue; // package import
    const rel = path.relative(FRONTEND, f);
    if (target === 'MISSING') {
      problems.push(`${rel}: module not found: '${node.source.value}'`);
      continue;
    }
    const exp = exportsOf[target];
    if (!exp) continue;
    for (const s of node.specifiers) {
      if (s.type === 'ImportSpecifier' && !exp.has(s.imported.name)) {
        problems.push(`${rel}: '${s.imported.name}' not exported by '${node.source.value}'`);
      }
      if (s.type === 'ImportDefaultSpecifier' && !exp.has('default')) {
        problems.push(`${rel}: no default export in '${node.source.value}'`);
      }
    }
  }
}

if (syntaxErrors.length) { console.log('SYNTAX ERRORS:'); syntaxErrors.forEach((s) => console.log(' ', s)); }
if (problems.length) { console.log('IMPORT PROBLEMS:'); problems.forEach((s) => console.log(' ', s)); }
console.log(`\nChecked ${files.length} files — ${syntaxErrors.length} syntax errors, ${problems.length} import problems`);
