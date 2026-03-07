import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), '..');
const req = [
  'index.html',
  'style.css',
  'game.mjs',
  'design.md'
];

const checks = [];
for (const f of req) {
  const full = path.join(root, f);
  checks.push({ name: `exists:${f}`, pass: fs.existsSync(full) });
}

const game = fs.readFileSync(path.join(root, 'game.mjs'), 'utf8');
checks.push({ name: 'has-level-2', pass: /state\.level===2/.test(game) || /level=2/.test(game) });
checks.push({ name: 'has-boss', pass: /spawnBoss/.test(game) && /type:'boss'/.test(game) });
checks.push({ name: 'has-smoke-harness', pass: /smoke/.test(game) });
checks.push({ name: 'has-upgrade-system', pass: /offerUpgrade/.test(game) });

const pass = checks.every(c => c.pass);
console.log('Glassrail Bastion Smoke Test');
console.log(`timestamp=${new Date().toISOString()}`);
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.name}`);
console.log(pass ? 'RESULT: PASS' : 'RESULT: FAIL');
if (!pass) process.exit(1);
