#!/usr/bin/env node
// Subway Siege: Blackout — headless CDP test rig (v3 loop).
// Modes:
//   node tests/run.mjs suite            — regression suite (exit 1 on any fail)
//   node tests/run.mjs shots <set>      — screenshot set -> loop-shots/<set>/
//   node tests/run.mjs perf             — perf baseline (ms/update, ms/render)
// Self-contained: starts its own static server + chrome (killed by PID; no pkill).
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir, stat, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const GAME_DIR = path.resolve(new URL('..', import.meta.url).pathname);
const MODE = process.argv[2] || 'suite';
const SHOT_SET = process.argv[3] || 'unnamed';
const CHROME = existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : 'google-chrome';
const MIME = { '.html': 'text/html', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.png': 'image/png', '.js': 'text/javascript', '.css': 'text/css' };

// ---------- static server ----------
function startServer() {
  return new Promise(res => {
    const srv = createServer(async (req, rsp) => {
      try {
        const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        let f = path.join(GAME_DIR, p === '/' ? 'index.html' : p);
        if ((await stat(f)).isDirectory()) f = path.join(f, 'index.html');
        const body = await readFile(f);
        rsp.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
        rsp.end(body);
      } catch { rsp.writeHead(404); rsp.end('nope'); }
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

// ---------- chrome + CDP ----------
async function startChrome() {
  const udd = path.join(os.tmpdir(), 'ssb-qa-' + process.pid + '-' + Math.random().toString(36).slice(2, 8));
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio=false',
    '--autoplay-policy=no-user-gesture-required',
    '--remote-debugging-port=0', `--user-data-dir=${udd}`, 'about:blank',
  ], { stdio: 'ignore' });
  // chrome writes DevToolsActivePort into the profile dir; poll for it (no fixed port -> no collisions)
  let port = 0;
  for (let i = 0; i < 100 && !port; i++) {
    await sleep(100);
    try { port = parseInt(readFileSync(path.join(udd, 'DevToolsActivePort'), 'utf8').split('\n')[0], 10) || 0; } catch {}
  }
  if (!port) { proc.kill('SIGKILL'); throw new Error('chrome DevToolsActivePort never appeared'); }
  return { proc, port, udd };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.waits = new Map(); this.errors = [];
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.waits.has(m.id)) { const { res, rej } = this.waits.get(m.id); this.waits.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
      if (m.method === 'Runtime.exceptionThrown') this.errors.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '?').split('\n')[0]);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') this.errors.push('console.error ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').split('\n')[0]);
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') this.errors.push('log ' + m.params.entry.text.split('\n')[0]);
    };
  }
  send(method, params = {}) { const id = ++this.id; return new Promise((res, rej) => { this.waits.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (this.waits.has(id)) { this.waits.delete(id); rej(new Error('CDP timeout: ' + method)); } }, 30000); }); }
  // NOTE: evaluate value is two levels deep (result.result.value); screenshot data is ONE level (result.data)
  async eval(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n').slice(0, 3).join(' | ')); return r.result.value; }
  async shot(file) { const r = await this.send('Page.captureScreenshot', { format: 'png' }); await writeFile(file, Buffer.from(r.data, 'base64')); }
}

async function connect(port) {
  let targets = [];
  for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.some(t => t.type === 'page')) break; } catch {} await sleep(100); }
  const page = targets.find(t => t.type === 'page');
  if (!page) throw new Error('no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws failed')); });
  const c = new CDP(ws);
  await c.send('Runtime.enable'); await c.send('Log.enable'); await c.send('Page.enable');
  return c;
}

async function boot() {
  const srv = await startServer();
  const { proc, port, udd } = await startChrome();
  const cleanup = async () => { try { proc.kill('SIGKILL'); } catch {} try { srv.close(); } catch {} try { await rm(udd, { recursive: true, force: true }); } catch {} };
  process.on('exit', () => { try { proc.kill('SIGKILL'); } catch {} });
  try {
    const c = await connect(port);
    await c.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 880, deviceScaleFactor: 2, mobile: true });
    const url = `http://127.0.0.1:${srv.address().port}/index.html?cb=${Math.random().toString(36).slice(2)}`;
    await c.send('Page.navigate', { url }); // always navigate w/ buster, never reload (stale-cache gotcha)
    for (let i = 0; i < 60; i++) { await sleep(100); try { if (await c.eval('!!window.__blackoutQA')) break; } catch {} }
    if (!await c.eval('!!window.__blackoutQA')) throw new Error('__blackoutQA never appeared');
    return { c, cleanup };
  } catch (e) { await cleanup(); throw e; }
}

const QA = 'window.__blackoutQA';

// ---------- suite ----------
async function suite() {
  const { c, cleanup } = await boot();
  const results = [];
  const check = async (name, fn) => {
    try { const detail = await fn(); results.push({ name, ok: true, detail: detail || '' }); }
    catch (e) { results.push({ name, ok: false, detail: String(e.message || e).slice(0, 300) }); }
  };
  const snap = () => c.eval(`${QA}.snapshot()`);

  await check('01 boot title state', async () => { const s = await snap(); if (s.state !== 'title') throw new Error('state=' + s.state); return s.version; });
  await check('02 version format', async () => { const s = await snap(); if (!/^v\d+\.\d+\.\d+$/.test(s.version)) throw new Error(s.version); return s.version; });
  await check('03 leaderboard slug unchanged', async () => { const s = await snap(); if (!s.slug.endsWith('/scores/subway-siege-blackout')) throw new Error(s.slug); });
  await check('04 audio buffers decode (>=12/14)', async () => {
    await c.eval(`${QA}.bootAudio()`); // buffers only fetch/decode once the ctx exists
    let n = 0; for (let i = 0; i < 50; i++) { n = (await snap()).audioBuffers; if (n >= 12) break; await sleep(200); }
    if (n < 12) throw new Error('buffers=' + n); return n + '/14';
  });
  await check('05 start -> play wave1', async () => { const s = await c.eval(`${QA}.start()`); if (s.state !== 'play' || s.wave !== 1 || !s.alive) throw new Error(JSON.stringify({ state: s.state, wave: s.wave, alive: s.alive })); });
  await check('06 tick(120) advances clean', async () => { const s = await c.eval(`${QA}.tick(120)`); if (s.state !== 'play') throw new Error('state=' + s.state); });
  await check('07 music = patrol after start', async () => { let m = null; for (let i = 0; i < 20; i++) { m = (await snap()).music; if (m === 'patrol') break; await sleep(150); } if (m !== 'patrol') throw new Error('music=' + m); });
  await check('08 spawn all 5 field enemy types', async () => {
    const t = await c.eval(`(()=>{const q=${QA};q.killAll();for(const t of ['scout','brute','drone','stalker','mortar'])q.spawn(t);return q.snapshot().enemyTypes;})()`);
    for (const want of ['scout', 'brute', 'drone', 'stalker', 'mortar']) if (!t.includes(want)) throw new Error('missing ' + want + ' in ' + t); return t.join(',');
  });
  await check('09 killAll scores kills', async () => {
    const r = await c.eval(`(()=>{const q=${QA};const b=q.snapshot();const a=q.killAll();return {dk:a.kills-b.kills, ds:a.score-b.score};})()`);
    if (r.dk < 5 || r.ds <= 0) throw new Error(JSON.stringify(r)); return `+${r.dk} kills +${r.ds} score`;
  });
  await check('10 combo x12 auto-engages overdrive', async () => {
    // armed=true means "will engage at x12"; engaging flips it false until combo resets
    const s = await c.eval(`(()=>{const q=${QA};q.start();q.setCombo(11);q.spawn('drone');q.killAll();q.tick(3);return q.snapshot();})()`);
    if (!(s.overdrive > 0) || s.overdriveArmed) throw new Error(JSON.stringify({ combo: s.combo, od: s.overdrive, armed: s.overdriveArmed }));
  });
  await check('11 grantOverdrive + achievement', async () => {
    const s = await c.eval(`${QA}.grantOverdrive()`);
    if (!(s.overdrive > 0)) throw new Error('overdrive=' + s.overdrive);
    if (!s.ach.includes('overdrive')) throw new Error('ach missing overdrive: ' + s.ach);
  });
  await check('12 stalker cloak: turret skips reveal<40', async () => {
    const alive = await c.eval(`(()=>{const q=${QA};q.killAll();q.spawn('stalker');const st=q.enemies.filter(e=>!e.dead&&e.type==='stalker')[0];for(let i=0;i<60;i++){st.reveal=0;q.tick(1);}return !st.dead;})()`);
    if (!alive) throw new Error('cloaked stalker was killed by auto-turret');
  });
  await check('13 mortar telegraphs (mortarMarks)', async () => {
    const seen = await c.eval(`(()=>{const q=${QA};q.killAll();q.spawn('mortar');let seen=0;for(let i=0;i<10;i++){q.tick(45);seen=Math.max(seen,q.snapshot().mortarMarks);if(seen)break;}return seen;})()`);
    if (seen < 1) throw new Error('no mortar mark after 450 ticks'); return 'marks=' + seen;
  });
  await check('14 district rotation by wave', async () => {
    const got = await c.eval(`(()=>{const q=${QA};return [1,6,11,16,21,26].map(w=>q.setWave(w).district);})()`);
    const want = ['STATION PLAZA', 'CRIMSON YARD', 'COLD TERMINAL', 'TOXIC SIDING', 'VIOLET DEPOT', 'STATION PLAZA'];
    for (let i = 0; i < want.length; i++) if (got[i] !== want[i]) throw new Error(`wave->district ${got[i]} != ${want[i]}`); return got.join('|');
  });
  await check('15 wave 5 is boss wave', async () => {
    const s = await c.eval(`(()=>{const q=${QA};q.setWave(5);q.tick(30);return q.snapshot();})()`);
    if (!s.bossActive) throw new Error('bossActive=false enemies=' + s.enemyTypes);
  });
  await check('16 boss kill -> upgrade offer -> pick works', async () => {
    // boss must actually SPAWN before killAll (else it dies in the pending queue and never counts),
    // and showUpgrade fires via a real-time setTimeout(700ms) after the kill — wait wall-clock.
    const s1 = await c.eval(`(()=>{const q=${QA};q.setWave(5);let s=q.snapshot();
      for(let i=0;i<30&&!s.enemyTypes.includes('boss');i++){q.tick(30);s=q.snapshot();}
      if(!s.enemyTypes.includes('boss'))return {err:'boss never spawned',types:s.enemyTypes};
      q.killAll(); return {ok:1};})()`);
    if (s1.err) throw new Error(JSON.stringify(s1));
    let s = null;
    for (let i = 0; i < 20; i++) { await sleep(200); s = await snap(); if (s.upgradePending) break; }
    if (!s.upgradePending) throw new Error('no upgrade offer, state=' + s.state);
    const s2 = await c.eval(`(()=>{const b=document.querySelector('#upg-opts .upg-btn');if(!b)return {err:'no upg button'};b.click();return ${QA}.snapshot();})()`);
    if (s2.err) throw new Error(s2.err);
    if (s2.upgradePending) throw new Error('upgradePending stuck after pick');
  });
  await check('17 perfect-wave flag stays clean under god', async () => {
    const s = await c.eval(`(()=>{const q=${QA};q.setWave(2);q.god(true);q.tick(60);q.killAll();return q.snapshot();})()`);
    if (s.waveHit) throw new Error('waveHit=true under god');
  });
  await check('18 addPickup', async () => { const n = await c.eval(`${QA}.addPickup('repair')`); if (!(n >= 1)) throw new Error('pickups=' + n); });
  await check('19 opt() persists settings', async () => {
    const v = await c.eval(`(()=>{const q=${QA};q.opt('musicVol',0.5);return JSON.parse(localStorage.getItem('ssb_settings_v2')).musicVol;})()`);
    if (v !== 0.5) throw new Error('persisted=' + v);
    await c.eval(`${QA}.opt('musicVol',0.8)`);
  });
  await check('20 selectTank persists + applies', async () => {
    const r = await c.eval(`(()=>{const q=${QA};const id=q.selectTank(1);const ls=localStorage.getItem('ssb_tank');const s=q.start();return {id,ls,hpMax:s.hpMax,tank:s.tank};})()`);
    if (r.id !== 'scout' || r.ls !== 'scout' || r.tank !== 'scout' || r.hpMax !== 70) throw new Error(JSON.stringify(r));
  });
  await check('21 bulwark hp/shield', async () => {
    const r = await c.eval(`(()=>{const q=${QA};q.selectTank(2);const s=q.start();return {hpMax:s.hpMax,shield:s.shield,tank:s.tank};})()`);
    if (r.tank !== 'bulwark' || r.hpMax !== 140 || r.shield !== 2) throw new Error(JSON.stringify(r));
    await c.eval(`${QA}.selectTank(0)`);
  });
  await check('22 endGame freezes score', async () => {
    const r = await c.eval(`(()=>{const q=${QA};q.start();q.tick(30);const s1=q.endGame();q.spawn('drone');q.tick(120);const s2=q.snapshot();return {st:s1.state, a:s1.score, b:s2.score};})()`);
    if (r.st === 'play') throw new Error('still play after endGame');
    if (r.a !== r.b) throw new Error(`score moved ${r.a}->${r.b}`);
  });
  await check('23 restart resets per-run state', async () => {
    const s = await c.eval(`(()=>{const q=${QA};q.grantOverdrive&&0;q.start();return q.snapshot();})()`);
    const bad = [];
    if (s.wave !== 1) bad.push('wave=' + s.wave); if (s.score !== 0) bad.push('score=' + s.score);
    if (s.combo !== 0) bad.push('combo=' + s.combo); if (s.overdrive > 0) bad.push('od=' + s.overdrive);
    if (s.mortarMarks !== 0) bad.push('marks=' + s.mortarMarks); if (s.upgradePending) bad.push('upgPending');
    if (bad.length) throw new Error(bad.join(','));
  });
  await check('24 weapon framework defaults + persist', async () => {
    const r = await c.eval(`(()=>{const q=${QA};const s=q.snapshot();const sel=q.selectWeapon(0);return {weapon:s.weapon,count:s.weapons,sel,ls:localStorage.getItem('ssb_weapon')};})()`);
    if (r.weapon !== 'cannon' || r.count < 1 || r.sel !== 'cannon' || r.ls !== 'cannon') throw new Error(JSON.stringify(r));
    return 'weapons=' + r.count;
  });
  await check('25 start() applies persisted weapon loadout', async () => {
    const r = await c.eval(`(()=>{const q=${QA};const s=q.start();return {weapon:s.weapon,ls:localStorage.getItem('ssb_weapon')};})()`);
    if (r.weapon !== r.ls) throw new Error(JSON.stringify(r));
  });
  await check('26 auto-fire kills through weapon framework', async () => {
    // place 150px east of the player (probed: clear LOS there; default spawn spot at +300x is
    // LOS-blocked by a world obstacle) and pin reveal so the turret can lock
    const r = await c.eval(`(()=>{const q=${QA};q.start();q.god(true);q.killAll();const k0=q.snapshot().kills;
      for(let i=0;i<3;i++)q.spawn('scout');
      for(const e of q.enemies)if(!e.dead){e.x=q.player.x+150;e.y=q.player.y;}
      for(let i=0;i<60;i++){for(const e of q.enemies)if(!e.dead)e.reveal=200;q.tick(10);}
      return {dk:q.snapshot().kills-k0};})()`);
    if (r.dk < 1) throw new Error('auto-fire killed nothing: ' + JSON.stringify(r));
    return `+${r.dk} kills`;
  });
  await check('27 scatter fires and kills up close', async () => {
    const r = await c.eval(`(()=>{const q=${QA};const id=q.selectWeapon(1);q.start();q.god(true);q.killAll();const k0=q.snapshot().kills;
      for(let i=0;i<3;i++)q.spawn('scout');
      for(const e of q.enemies)if(!e.dead){e.x=q.player.x+150;e.y=q.player.y;}
      for(let i=0;i<60;i++){for(const e of q.enemies)if(!e.dead)e.reveal=200;q.tick(10);}
      const dk=q.snapshot().kills-k0;q.selectWeapon(0);return {id,dk,weapon:q.snapshot().weapon};})()`);
    if (r.id !== 'scatter' || r.dk < 1) throw new Error(JSON.stringify(r));
    return `+${r.dk} kills`;
  });
  await check('28 weapon crate swaps run-weapon; restart restores loadout', async () => {
    const r = await c.eval(`(()=>{const q=${QA};q.selectWeapon(0);q.start();q.god(true);q.addPickup('weapon');q.tick(30);
      const inRun=q.snapshot().weapon;const after=q.start().weapon;return {inRun,after};})()`);
    if (r.inRun !== 'scatter') throw new Error('crate gave ' + r.inRun);
    if (r.after !== 'cannon') throw new Error('restart kept ' + r.after);
  });
  await check('29 armory UI selects + persists', async () => {
    const r = await c.eval(`(()=>{const q=${QA};q.endGame();q.clickBtn('btn-garage');const ok1=q.clickBtn('wpn-card-1');const ls1=localStorage.getItem('ssb_weapon');
      const ok0=q.clickBtn('wpn-card-0');const ls0=localStorage.getItem('ssb_weapon');q.clickBtn('btn-garage-back');return {ok1,ls1,ok0,ls0};})()`);
    if (!r.ok1 || r.ls1 !== 'scatter' || !r.ok0 || r.ls0 !== 'cannon') throw new Error(JSON.stringify(r));
  });
  await check('30 railgun beam skewers an aligned line', async () => {
    // 3 scouts in a row east; one 3-dmg hitscan beam should pierce and kill all of them at once
    const r = await c.eval(`(()=>{const q=${QA};const id=q.selectWeapon(2);q.start();q.god(true);q.killAll();const k0=q.snapshot().kills;
      for(let i=0;i<3;i++)q.spawn('scout');
      const es=q.enemies.filter(e=>!e.dead);let sawBeam=0;
      for(let i=0;i<40;i++){
        es.forEach((e,ix)=>{if(!e.dead){e.x=q.player.x+150+ix*55;e.y=q.player.y;e.reveal=200;}});
        q.tick(10);sawBeam=Math.max(sawBeam,q.snapshot().beams);
        if(q.snapshot().kills-k0>=3)break;
      }
      const dk=q.snapshot().kills-k0;q.selectWeapon(0);return {id,dk,sawBeam};})()`);
    if (r.id !== 'railgun' || r.dk < 3 || r.sawBeam < 1) throw new Error(JSON.stringify(r));
    return `+${r.dk} kills, beams seen=${r.sawBeam}`;
  });
  await check('31 no console/page errors (whole run)', async () => { if (c.errors.length) throw new Error(c.errors.slice(0, 5).join(' || ')); });

  await cleanup();
  const pass = results.filter(r => r.ok).length;
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
  console.log(`\nSUITE ${pass}/${results.length}`);
  process.exit(pass === results.length ? 0 : 1);
}

// ---------- shots ----------
async function shots() {
  const dir = path.join(GAME_DIR, 'loop-shots', SHOT_SET);
  await mkdir(dir, { recursive: true });
  const { c, cleanup } = await boot();
  const grab = async (name, setup) => { if (setup) await c.eval(setup); await sleep(120); await c.eval(`${QA}.tick(2)`).catch(() => {}); await c.shot(path.join(dir, name + '.png')); console.log('shot', name); };
  await sleep(800);
  await c.shot(path.join(dir, '01-title.png')); console.log('shot 01-title');
  await c.eval(`${QA}.start()`);
  const districts = [[1, '02-district-station-plaza'], [6, '03-district-crimson-yard'], [11, '04-district-cold-terminal'], [16, '05-district-toxic-siding'], [21, '06-district-violet-depot']];
  for (const [w, name] of districts) await grab(name, `(()=>{const q=${QA};q.god(true);q.setWave(${w});q.tick(90);})()`);
  await grab('07-heavy-combat', `(()=>{const q=${QA};q.setWave(3);for(const t of ['scout','brute','drone','stalker','mortar'])for(let i=0;i<3;i++)q.spawn(t);q.tick(50);})()`);
  await grab('08-boss', `(()=>{const q=${QA};q.setWave(5);q.tick(200);})()`);
  await grab('09-overdrive', `(()=>{const q=${QA};q.grantOverdrive();q.spawn('scout');q.spawn('brute');q.tick(12);})()`);
  await cleanup();
  console.log('\nshots ->', dir);
}

// ---------- perf ----------
async function perf() {
  const { c, cleanup } = await boot();
  await c.eval(`${QA}.start()`);
  const r = await c.eval(`(()=>{const q=${QA};q.god(true);q.setWave(20);for(const t of ['scout','brute','drone','stalker','mortar'])for(let i=0;i<5;i++)q.spawn(t);q.tick(60);
    const n=q.snapshot().enemies;
    const t0=performance.now(); q.tick(600); const upd=(performance.now()-t0)/600;   // 600 updates + 1 render
    const t1=performance.now(); for(let i=0;i<60;i++)q.tick(1); const frame=(performance.now()-t1)/60; // 60 update+render pairs
    return {enemies:n, msPerUpdate:+upd.toFixed(3), msPerTickRender:+frame.toFixed(3)};})()`);
  await cleanup();
  console.log(JSON.stringify(r));
}

// ---------- probe: node tests/run.mjs probe '<js expr evaluated in page>' [shot.png] ----------
async function probe() {
  const { c, cleanup } = await boot();
  try {
    console.log(JSON.stringify(await c.eval(process.argv[3] || `${QA}.snapshot()`), null, 1));
    if (process.argv[4]) { await sleep(250); await c.shot(process.argv[4]); console.log('shot ->', process.argv[4]); }
  }
  finally { if (c.errors.length) console.error('PAGE ERRORS:', c.errors.slice(0, 5)); await cleanup(); }
}

({ suite, shots, perf, probe }[MODE] || (() => { console.error('unknown mode ' + MODE); process.exit(2); }))();
