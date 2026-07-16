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
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
checks.push({ name: 'has-level-2', pass: /state\.level===2/.test(game) || /level=2/.test(game) });
checks.push({ name: 'has-boss', pass: /spawnBoss/.test(game) && /type:'boss'/.test(game) });
checks.push({ name: 'has-smoke-harness', pass: /smoke/.test(game) });
checks.push({ name: 'has-upgrade-system', pass: /offerUpgrade/.test(game) });
for (const type of ['interceptor', 'bulwark', 'gunship', 'carrier', 'wraith', 'bomber', 'microfighter', 'boss']) {
  checks.push({ name: `fleet-class:${type}`, pass: new RegExp(`${type}:\\{name:`).test(index) });
}
checks.push({ name: 'fleet-has-unique-abilities', pass: /VECTOR JETS/.test(index) && /ABLATIVE SHIELD/.test(index) && /PHASE CLOAK/.test(index) && /VOID MINES/.test(index) && /SIEGE MATRIX/.test(index) });
checks.push({ name: 'fleet-has-detailed-renderers', pass: /function drawInterceptor/.test(index) && /function drawCarrier/.test(index) && /function drawDreadnought/.test(index) && /function drawEnemyShip/.test(index) });
checks.push({ name: 'fleet-has-ability-logic', pass: /e\.cloaked/.test(index) && /spawnEnemy\('microfighter'/.test(index) && /kind==='seeker'/.test(index) && /kind==='mine'/.test(index) });
checks.push({ name: 'fleet-has-surface-microdetail', pass: /function drawFleetSurfaceDetail/.test(index) && /detailSeed/.test(index) && /SIEGE CORE CRITICAL/.test(index) });
checks.push({ name: 'fleet-has-animated-telegraphs', pass: /function drawAbilityTelegraph/.test(index) && /chargeLevel/.test(index) && /sourceType/.test(index) });
checks.push({ name: 'fleet-has-damage-effects', pass: /shockwaves/.test(index) && /SHIELD BREAK/.test(index) && /damageTimer/.test(index) });

const pass = checks.every(c => c.pass);
console.log('Glassrail Bastion Smoke Test');
console.log(`timestamp=${new Date().toISOString()}`);
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.name}`);
console.log(pass ? 'RESULT: PASS' : 'RESULT: FAIL');
if (!pass) process.exit(1);
