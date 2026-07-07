// Joust remake — game shell: state machine, input, screens, HUD, options, leaderboard, main loop.
// Engine (engine.js) is headless & authoritative; this owns everything user-facing.
'use strict';

const VERSION = 'v' + (window.__V || '1.5.0');   // single source: window.__V (index.html)
const ASSET_Q = '?v=' + (window.__V || '1.5.0');
const STEP_MS = 1000 / 60;
const LB_URL = 'https://game-scores.jez237.workers.dev/scores/joust';
const DATA = window.JOUST_DATA;
const { JoustEngine } = window.JOUST_ENGINE;
const { Renderer } = window.JOUST_RENDER;
const { AudioSys } = window.JOUST_AUDIO;
const { WORLD, PHRASES, waveInfo } = DATA;

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const renderer = new Renderer(canvas);
const audio = new AudioSys();

// ─── save / options ───
const SAVE_KEY = 'joust_save_v1';
const defaultKeys = () => ({
  p1: { left: 'ArrowLeft', right: 'ArrowRight', flap: 'ArrowUp' },
  p2: { left: 'KeyA', right: 'KeyD', flap: 'KeyW' },
});
let save = { hi: 0, scores: [], maxWave: 1, unlockAll: false,
  opts: { sfx: 0.7, mus: 0.5, crt: false, difficulty: 'normal', lives: 3, keys: defaultKeys() } };
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.opts) { save = Object.assign(save, s); if (!save.opts.keys) save.opts.keys = defaultKeys(); } } catch (e) {}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
audio.setSfx(save.opts.sfx); audio.setMus(save.opts.mus); renderer.crt = save.opts.crt;

// ─── state ───
let state = 'title';       // title|help|options|waveselect|scores|hsentry|intro|playing|clear|gameover
let engine = null, mode = '1p';
let menuIdx = 0, optIdx = 0, wsPage = 0;
let introTimer = 0, clearTimer = 0, bannerLines = [];
let flashMsg = '', flashUntil = 0;
let globalScores = null, globalFetchedAt = -1e9;
let hsInitials = 'AAA', hsPos = 0, hsScore = 0, hsWave = 1, hsPending = false;
let rebindTarget = null;   // {player,action}
let escDownAt = 0;
let paused = false;        // in-play pause (P / auto on tab-hide)
let attract = null, attractAI = [{}, {}];

// input
const keys = {};
const flapQueue = [false, false];
function pi_for(code) {
  const k = save.opts.keys;
  if (code === k.p1.flap) return 0;
  if (code === k.p2.flap) return 1;
  return -1;
}
window.addEventListener('keydown', e => {
  if (rebindTarget) { if (e.code === 'Escape') { rebindTarget = null; flash('CANCELLED'); } else doRebind(e.code); e.preventDefault(); return; }
  if (!e.repeat) {
    const p = pi_for(e.code);
    if (p >= 0 && (state === 'playing')) flapQueue[p] = true;
    // Space is a P1 flap in 1-player mode (edge-triggered impulse, not just un-freeze)
    if (e.code === 'Space' && mode === '1p' && state === 'playing') flapQueue[0] = true;
  }
  keys[e.code] = true;
  handleKeyUI(e);
  // stop the page acting on any active game key (arrows/space + both players' mapped keys)
  const kk = save.opts.keys;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) ||
      e.code === kk.p1.left || e.code === kk.p1.right || e.code === kk.p1.flap ||
      e.code === kk.p2.left || e.code === kk.p2.right || e.code === kk.p2.flap) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Escape') escDownAt = 0; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; escDownAt = 0; });
// auto-pause + mute when the tab is hidden (prompt requirement)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state === 'playing') paused = true;
    for (const k in keys) keys[k] = false; escDownAt = 0;
    if (audio.stopMusic) audio.stopMusic();
  } else if (state === 'title' && audio.startMusic) audio.startMusic();
});

function qaBotInput() {
  const { wrapDelta } = window.JOUST_ENGINE;
  const p = engine.players[0];
  const inp = { left: false, right: false, flap: false };
  if (!p || !p.alive || p.materializing > 0) return inp;
  p._fc = (p._fc || 0) + 1;
  const fe = n => { if (p._fc % n === 0) inp.flap = true; };
  const nearLava = p.y > WORLD.FLOOR - 52;
  const pt = engine.pteros.find(x => x.alive && Math.abs(wrapDelta(p.x, x.x)) < 46 && Math.abs(x.y - p.y) < 40);
  if (pt) { const dx = wrapDelta(p.x, pt.x); inp.left = dx > 0; inp.right = dx < 0; if (p.y > pt.y) fe(4); else fe(14); if (nearLava) fe(4); return inp; }
  const threat = engine.enemies.find(en => en.alive && en.materializing <= 0 && Math.abs(wrapDelta(p.x, en.x)) < 26 && en.y < p.y + 2 && p.y - en.y < 30);
  if (threat && !nearLava) { const dx = wrapDelta(p.x, threat.x); inp.left = dx > 0; inp.right = dx < 0; fe(4); return inp; }
  const eggs = engine.eggs.filter(g => !g.dead && ['egg', 'shake', 'walking', 'mounting', 'hatching'].includes(g.state) && g.y < WORLD.FLOOR - 6);
  let tgt = null, m = null;
  if (eggs.length) { eggs.sort((a, b) => Math.abs(wrapDelta(p.x, a.x)) - Math.abs(wrapDelta(p.x, b.x))); tgt = eggs[0]; m = 'egg'; }
  else { const foes = engine.enemies.filter(en => en.alive && en.materializing <= 0 && en.y > p.y - 10); if (foes.length) { foes.sort((a, b) => Math.abs(wrapDelta(p.x, a.x)) - Math.abs(wrapDelta(p.x, b.x))); tgt = foes[0]; m = 'joust'; } }
  if (nearLava) { const dx = tgt ? wrapDelta(p.x, tgt.x) : 0; inp.left = dx < -3; inp.right = dx > 3; fe(4); return inp; }
  if (tgt) { const dx = wrapDelta(p.x, tgt.x); inp.left = dx < -3; inp.right = dx > 3; const aim = m === 'joust' ? tgt.y - 15 : tgt.y - 2; if (p.y > aim + 3) fe(5); else if (p.y < aim - 5) {} else fe(m === 'joust' ? 9 : 12); }
  else { if (p.y > 120) fe(8); else if (p.y < 90) {} else fe(16); }
  return inp;
}
function readInputs() {
  if (window.__joustQA && window.__joustQA.bot && engine) { const b = qaBotInput(); return [b, {}]; }
  const k = save.opts.keys, out = [];
  const n = mode === '2p' ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const kk = i === 0 ? k.p1 : k.p2;
    let left = keys[kk.left], right = keys[kk.right], held = keys[kk.flap];
    if (i === 0) { left = left || keys['KeyA'] && mode === '1p'; right = right || keys['KeyD'] && mode === '1p'; if (mode === '1p') held = held || keys['Space']; }
    // touch + gamepad (P1)
    if (touch.active && i === 0) { left = left || touch.left; right = right || touch.right; }
    if (pad.on && i === 0) { left = left || pad.left; right = right || pad.right; held = held || pad.flapHeld; }
    const flap = flapQueue[i]; flapQueue[i] = false;
    out.push({ left: !!left, right: !!right, flap: !!flap, flapHeld: !!held });
  }
  return out;
}

// ─── touch controls ───
const touch = { active: false, device: false, left: false, right: false };
function setupTouch() {
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (!isTouch) return;
  touch.active = true; touch.device = true;   // touch device — enable touch input + show controls
  const bar = document.createElement('div'); bar.id = 'touchbar';
  bar.innerHTML = `<button id="tL">◀</button><button id="tR">▶</button><div class="sp"></div><button id="tF">FLAP</button>`;
  document.body.appendChild(bar);
  const bind = (id, on, off) => {
    const el = document.getElementById(id);
    const d = e => { e.preventDefault(); touch.active = true; on(); };
    const u = e => { e.preventDefault(); off(); };
    el.addEventListener('pointerdown', d); el.addEventListener('pointerup', u);
    el.addEventListener('pointerleave', u); el.addEventListener('pointercancel', u);
  };
  bind('tL', () => touch.left = true, () => touch.left = false);
  bind('tR', () => touch.right = true, () => touch.right = false);
  const f = document.getElementById('tF');
  f.addEventListener('pointerdown', e => { e.preventDefault(); touch.active = true; audio.init(); if (state === 'title') startFromTitle(); else if (state === 'playing') flapQueue[0] = true; else advanceScreen(); });
  // show only in gameplay
  window._touchbar = bar;
}
function updateTouchVis() { if (window._touchbar) window._touchbar.style.display = (touch.device && (state === 'playing' || state === 'intro')) ? 'flex' : 'none'; }
// map a pointer event to canvas pixel coords
function evToCanvas(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) }; }

// ─── gamepad ─── (stick/d-pad = move, A/B/RT = flap, Start/Y = confirm/pause, d-pad up/down = menu)
const pad = { on: false, left: false, right: false, flapHeld: false, _flap: false, _up: false, _down: false, _ok: false, _esc: false };
window.addEventListener('gamepadconnected', () => { pad.on = true; });
function pollGamepad() {
  if (!navigator.getGamepads) return;
  let gp = null; for (const g of navigator.getGamepads()) { if (g && g.connected) { gp = g; break; } }
  if (!gp) { pad.left = pad.right = pad.flapHeld = false; return; }
  pad.on = true;
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, B = i => gp.buttons[i] && gp.buttons[i].pressed;
  pad.left = ax < -0.35 || B(14); pad.right = ax > 0.35 || B(15);
  pad.flapHeld = B(0) || B(1) || B(7) || B(12);           // A/B/RT/d-pad-up all flap
  const edge = (now, key) => { const was = pad['_' + key]; pad['_' + key] = now; return now && !was; };
  const flapNow = pad.flapHeld;
  if (edge(flapNow, 'flap') && state === 'playing') flapQueue[0] = true;
  // menu navigation
  const upNow = ay < -0.5 || B(12), downNow = ay > 0.5 || B(13), okNow = B(0) || B(9), escNow = B(1) || B(8) || B(3);
  const up = edge(upNow, 'up'), down = edge(downNow, 'down'), ok = edge(okNow, 'ok'), esc = edge(escNow, 'esc');
  if (state !== 'playing') {
    if (up) handleKeyUI({ code: 'ArrowUp' }); if (down) handleKeyUI({ code: 'ArrowDown' });
    if (pad.left && !pad._padLeftWas) handleKeyUI({ code: 'ArrowLeft' }); if (pad.right && !pad._padRightWas) handleKeyUI({ code: 'ArrowRight' });
    if (ok) { audio.init(); handleKeyUI({ code: 'Enter' }); } if (esc) handleKeyUI({ code: 'Escape' });
  } else if (esc && !escDownAt) { escDownAt = performance.now(); }
  pad._padLeftWas = pad.left; pad._padRightWas = pad.right;
}

// ─── leaderboard ───
async function fetchGlobal() {
  if (globalScores && performance.now() - globalFetchedAt < 30000) return;
  try { const r = await fetch(LB_URL + ASSET_Q, { signal: AbortSignal.timeout(5000) }); globalScores = (await r.json()).slice(0, 10); globalFetchedAt = performance.now(); }
  catch (e) { globalScores = globalScores || []; }
}
async function postGlobal(initials, sc, wv) {
  try { await fetch(LB_URL + ASSET_Q, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initials, score: sc, level: wv }) }); globalFetchedAt = 0; fetchGlobal(); } catch (e) {}
}

// ─── run control ───
function startRun(wv) {
  mode = pendingMode || '1p';
  engine = new JoustEngine({ mode, wave: wv || 1, lives: save.opts.lives, difficulty: save.opts.difficulty, seed: (Date.now() & 0xffff) ^ 0x1234, holdUntilInput: true });
  audio.init(); audio.stopMusic();
  paused = false; acc = 0;
  gotoIntro();
}
function gotoIntro() {
  state = 'intro'; introTimer = 150;
  bannerLines = bannerForWave(engine.wave, engine.waveType);
  audio.play('start');
}
function bannerForWave(wv, type) {
  const lines = [];
  if (wv === 1) lines.push(PHRASES.prepare);
  else lines.push('WAVE ' + wv);
  if (type === 'survival') lines.push(mode === '2p' ? PHRASES.team : PHRASES.survival, mode === '2p' ? PHRASES.teamCoop : PHRASES.survivalGet);
  else if (type === 'gladiator') lines.push(PHRASES.gladiator, mode === '2p' ? PHRASES.bounty : PHRASES.prepare);
  else if (type === 'egg') lines.push(PHRASES.egg, PHRASES.eggPick);
  else if (type === 'ptero') lines.push(PHRASES.ptero, PHRASES.bait);
  else if (wv > 1) lines.push(PHRASES.prepare);
  return lines;
}

function onWaveCleared() {
  state = 'clear'; clearTimer = 130;
  flash(PHRASES.nice);
}
function advanceAfterClear() {
  engine.nextWave();
  if (engine.wave > save.maxWave) { save.maxWave = engine.wave; persist(); }
  gotoIntro();
}
function onGameOver() {
  audio.play('playerDie');
  const best = Math.max(...engine.players.map(p => p.score));
  hsScore = best; hsWave = engine.wave;
  if (hsScore > save.hi) { save.hi = hsScore; persist(); }
  if (qualifies(hsScore)) { hsPending = true; state = 'hsentry'; hsInitials = 'AAA'; hsPos = 0; }
  else { state = 'gameover'; fetchGlobal(); }
}
function qualifies(sc) { return sc > 0 && (save.scores.length < 10 || sc > (save.scores[save.scores.length - 1] || {}).score); }
function commitHs() {
  save.scores.push({ initials: hsInitials, score: hsScore, wave: hsWave });
  save.scores.sort((a, b) => b.score - a.score); save.scores = save.scores.slice(0, 10); persist();
  postGlobal(hsInitials, hsScore, hsWave);
  hsPending = false; state = 'scores'; fetchGlobal();
}

function flash(msg) { flashMsg = msg; flashUntil = performance.now() + 1600; }

// ─── event → sound/particle bridge ───
const SND = { flap:'flap', thud:'thud', skid:'skid', walk:'walk', eggDrop:'eggDrop', eggCollect:'eggCollect', eggHatch:'eggHatch', eggLand:'thud', enemyDie:'enemyDie', playerDie:'playerDie', ptero:'ptero', pteroDie:'pteroDie', troll:'troll', bounce:'bounce', bounty:'bounty', extraMan:'extraMan', bait:'bait', spawn:'spawn', mount:'mount', materialized:'materialized', waveClear:'waveClear' };
const POOF = ['FL1', 'FL2', 'FL3'];
function processEvents(evs) {
  for (const e of evs) {
    const s = SND[e.type]; if (s) audio.play(s);
    switch (e.type) {
      case 'enemyDie': renderer.addEffect(POOF, e.x, e.y - 8, 1.4, 16); renderer.burst('feather', e.x, e.y, { n: 10, col: '#ffe14d' }); if (e.points) { renderer.float('+' + e.points, e.x, e.y - 14, '#ffd23a'); renderer.shakeBy(2); } break;
      case 'eggCollect': renderer.burst('spark', e.x, e.y, { n: 8, col: e.air ? '#7fd4ff' : '#f3ead0', up: true }); renderer.float('+' + e.points, e.x, e.y - 12, e.air ? '#7fd4ff' : '#ffe14d'); break;
      case 'combo': { const col = ['#ffe14d', '#ffd23a', '#ff8a00', '#ff4d4d'][Math.min(3, e.level - 1)]; renderer.float('CHAIN x' + e.level, e.x, e.y - 22, col, e.level >= 3); renderer.burst('spark', e.x, e.y - 6, { n: 6 + e.level * 3, col, up: true }); if (e.level >= 3) audio.play('bounty'); break; }
      case 'pteroDie': renderer.addEffect(POOF, e.x, e.y, 2.2, 22); renderer.burst('feather', e.x, e.y, { n: 18, col: '#39c06a' }); renderer.float('+' + e.points, e.x, e.y - 16, '#39c06a', true); renderer.shakeBy(7); flash('NICE JOUSTING!'); break;
      case 'playerDie': renderer.addEffect(POOF, e.x, e.y - 8, 1.8, 22); renderer.burst('ash', e.x, e.y, { n: 16, col: '#cccccc', life: 45 }); renderer.shakeBy(6); break;
      case 'bounty': renderer.float('BOUNTY +' + e.points, e.x, e.y - 16, '#ff5f5f', true); renderer.shakeBy(3); break;
      case 'bonus': renderer.float('+' + e.points + (e.kind === 'survival' ? ' SURVIVAL' : e.kind === 'team' ? ' TEAM' : ''), WORLD.VIEW_W / 2, 110 + (e.pi || 0) * 16, '#ffd23a', true); break;
      case 'extraMan': flash('EXTRA MOUNT!'); break;
      case 'playerOut': flash('PLAYER ' + ((e.pi || 0) + 1) + ' OUT'); break;
      case 'spawn': renderer.burst('spark', e.x, e.y, { n: 10, col: '#66ccff', up: true }); break;
      case 'bounce': renderer.burst('spark', e.x, e.y, { n: 5, col: '#ffffff' }); renderer.shakeBy(1.5); break;
      case 'troll': renderer.burst('spark', e.x, WORLD.FLOOR, { n: 6, col: '#ff6a00' }); break;
    }
  }
}

// ─── main loop ───
let acc = 0, lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = now - lastT; lastT = now; if (dt > 200) dt = 200;
  pollGamepad();
  renderer.resize();
  renderer.updateFx();

  if (state === 'playing' && !paused) {
    acc += dt;
    while (acc >= STEP_MS) {
      acc -= STEP_MS;
      const snap = engine.tick(readInputs());
      processEvents(snap.events);
      if (engine.gameOver) { onGameOver(); break; }
      if (engine.waveCleared && engine.clearTimer <= 0) { onWaveCleared(); break; }
    }
    // hold-ESC restart
    if (escDownAt && now - escDownAt > 800) { escDownAt = 0; restartWaveCostLife(); }
  } else if (state === 'title' || state === 'attract') {
    acc += dt; while (acc >= STEP_MS) { acc -= STEP_MS; stepAttract(); }
  } else if (state === 'intro') {
    introTimer--; if (introTimer <= 0) state = 'playing';
  } else if (state === 'clear') {
    clearTimer--; if (clearTimer <= 0) advanceAfterClear();
  }

  draw(now);
  updateTouchVis();
}

function restartWaveCostLife() {
  // softlock escape hatch: each still-in player pays exactly one life to restart the wave
  for (const p of engine.players) {
    if (p.out) continue;
    p.lives--; p.eggStreak = 0;
    if (p.lives <= 0) p.out = true;
  }
  paused = false;
  if (engine.players.every(p => p.out)) { onGameOver(); return; }
  engine.startWave(engine.wave);
  flash('RESTARTING WAVE');
  gotoIntro();
}

// ─── attract mode (AI demo) ───
function startAttract() {
  attract = new JoustEngine({ mode: '1p', wave: 1 + ((Date.now() / 9000 | 0) % 4), lives: 9, difficulty: 'normal', seed: Date.now() & 0xffff, holdUntilInput: false });
  attract.started = true;
}
function stepAttract() {
  if (!attract || attract.gameOver || attract.wave > 6) startAttract();
  const p = attract.players[0];
  // simple AI: seek nearest egg/enemy, stay above, avoid lava
  let inp = { left: false, right: false, flap: false };
  if (p && p.alive) {
    let tx = p.x, ty = p.y - 20, targetY = p.y;
    const eggs = attract.eggs.filter(e => !e.dead);
    let tgt = eggs[0] || attract.enemies.find(e => e.alive);
    if (tgt) { tx = tgt.x; targetY = tgt.kind === 'egg' ? tgt.y : tgt.y - 22; }
    const dx = DATA.WORLD ? ((tx - p.x)) : 0;
    const d = window.JOUST_ENGINE.wrapDelta(p.x, tx);
    if (d > 4) inp.right = true; else if (d < -4) inp.left = true;
    attract._fc = (attract._fc || 0) + 1;
    if (p.y > targetY + 6 || p.y > WORLD.FLOOR - 45) { if (attract._fc % 8 === 0) inp.flap = true; }
    else if (attract._fc % 20 === 0) inp.flap = true;
  }
  attract.tick([inp]);
  processEventsQuiet(attract.events);
}
function processEventsQuiet(evs) { for (const e of evs) { if (['enemyDie','pteroDie'].includes(e.type)) renderer.burst('feather', e.x, e.y, { n: 6 }); } }

// ─── drawing ───
function txt(s, x, y, size, col, align) {
  ctx.font = `700 ${size}px 'Courier New', monospace`;
  ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(s, x + 1.5, y + 1.5);
  ctx.fillStyle = col || '#fff'; ctx.fillText(s, x, y);
}
const CX = () => canvas.width / 2;

function draw(now) {
  if (state === 'title' || state === 'attract') { renderer.render(attract ? attract.snapshot() : null); drawTitle(now); }
  else if (state === 'help') { drawScreenBg(); drawHelp(); }
  else if (state === 'options') { drawScreenBg(); drawOptions(); }
  else if (state === 'waveselect') { drawScreenBg(); drawWaveSelect(); }
  else if (state === 'scores') { drawScreenBg(); drawScores(); }
  else if (state === 'hsentry') { drawScreenBg(); drawHsEntry(); }
  else if (state === 'intro') { renderer.render(engine.snapshot()); drawHUD(); drawBanner(); }
  else if (state === 'playing') { renderer.render(engine.snapshot()); renderer.drawFloats(txt); drawHUD(); drawEscHold(now); if (!engine.started) drawStartPrompt(now); if (paused) drawPause(); }
  else if (state === 'clear') { renderer.render(engine.snapshot()); drawHUD(); drawClear(); }
  else if (state === 'gameover') { renderer.render(engine ? engine.snapshot() : null); drawGameOver(); }
  // flash
  if (flashMsg && now < flashUntil) { const w = canvas.width; txt(flashMsg, w / 2, canvas.height * 0.16, Math.round(canvas.height / 20), '#ffcc44'); }
}
function drawScreenBg() {
  renderer.render(null);
  ctx.fillStyle = 'rgba(2,3,12,0.72)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawTitle(now) {
  ctx.fillStyle = 'rgba(2,3,12,0.55)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const w = canvas.width, s = canvas.height;
  txt('JOUST', w / 2, s * 0.2, Math.round(s / 6), '#ffd23a');
  txt('KNIGHTS ON FLYING BUZZARDS', w / 2, s * 0.31, Math.round(s / 34), '#7fd4ff');
  const items = ['1 PLAYER', '2 PLAYERS', 'HOW TO PLAY', 'OPTIONS', 'WAVE SELECT', 'HIGH SCORES'];
  const y0 = s * 0.44, dy = s * 0.075;
  for (let i = 0; i < items.length; i++) {
    const sel = i === menuIdx;
    txt((sel ? '▶ ' : '') + items[i] + (sel ? ' ◀' : ''), w / 2, y0 + i * dy, Math.round(s / 22), sel ? '#ffe14d' : '#c9c9d6');
  }
  txt('HI ' + save.hi, w / 2, s * 0.9, Math.round(s / 30), '#39c06a');
  if (Math.floor(now / 600) % 2 === 0) txt('© WILLIAMS 1982 — FAITHFUL BROWSER REMAKE', w / 2, s * 0.96, Math.round(s / 40), '#6f6f82');
  txt(VERSION, w - Math.round(s / 40), s - Math.round(s / 40), Math.round(s / 46), '#5a5a70', 'right');
}

function drawHUD() {
  const sc = renderer.scale;
  const P = engine.players;
  txt('1UP', renderer.sx(24), renderer.sy(8), Math.round(6 * sc), '#ffd23a', 'center');
  txt('' + P[0].score, renderer.sx(24), renderer.sy(18), Math.round(7 * sc), '#fff', 'center');
  if (mode === '2p') {
    txt('2UP', renderer.sx(WORLD.VIEW_W - 24), renderer.sy(8), Math.round(6 * sc), '#7fd4ff', 'center');
    txt('' + P[1].score, renderer.sx(WORLD.VIEW_W - 24), renderer.sy(18), Math.round(7 * sc), '#fff', 'center');
  }
  txt('WAVE ' + engine.wave, renderer.sx(WORLD.VIEW_W / 2), renderer.sy(9), Math.round(6 * sc), '#c9c9d6');
  // egg-chain badge (next egg value grows with the streak)
  if (P[0].eggStreak >= 2) { const col = ['#ffe14d', '#ffd23a', '#ff8a00', '#ff4d4d'][Math.min(3, P[0].eggStreak - 1)]; txt('CHAIN x' + P[0].eggStreak, renderer.sx(24), renderer.sy(34), Math.round(6 * sc), col, 'center'); }
  drawBaseLives();
  // next special wave letter
  const nxt = nextSpecial(engine.wave);
  if (nxt) txt(nxt, renderer.sx(WORLD.VIEW_W - 8), renderer.sy(WORLD.VIEW_H - 8), Math.round(8 * sc), '#ff8a00', 'right');
}
// remaining mounts shown in a recessed band in the base centre (like the arcade)
function drawBaseLives() {
  const sc = renderer.scale, P = engine.players, iconH = 8 * sc, by = 222, mid = WORLD.VIEW_W / 2;
  const bx1 = renderer.sx(mid - 66), bx2 = renderer.sx(mid + 66);
  ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(bx1, renderer.sy(213), bx2 - bx1, 10 * sc);
  if (mode === '2p') {
    for (let i = 0; i < Math.min(P[0].lives, 5); i++) renderer.drawSpriteIcon('ORUN4R', renderer.sx(mid - 12 - i * 11), renderer.sy(by), iconH);
    for (let i = 0; i < Math.min(P[1].lives, 5); i++) renderer.drawSpriteIcon('SRUN4R', renderer.sx(mid + 12 + i * 11), renderer.sy(by), iconH);
  } else {
    const n = Math.min(P[0].lives, 5), tot = (n - 1) * 11;
    for (let i = 0; i < n; i++) renderer.drawSpriteIcon('ORUN4R', renderer.sx(mid - tot / 2 + i * 11), renderer.sy(by), iconH);
  }
}
function nextSpecial(wv) {
  for (let n = wv + 1; n <= wv + 5; n++) { const t = waveInfo(n).type; if (t === 'survival') return 'S'; if (t === 'gladiator') return 'G'; if (t === 'egg') return 'E'; if (t === 'ptero') return 'P'; }
  return '';
}
function drawLifeIcon(x, y, sc, stork) {
  ctx.save(); ctx.translate(x, y); ctx.scale(sc / 4, sc / 4);
  ctx.fillStyle = stork ? '#7fd4ff' : '#ffe14d';
  ctx.beginPath(); ctx.ellipse(0, 4, 5, 4, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = stork ? '#2f8fc4' : '#c9a51f'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(3, 1); ctx.quadraticCurveTo(7, -3, 8, -6); ctx.stroke();
  ctx.restore();
}

function drawBanner() {
  const w = canvas.width, s = canvas.height;
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, s * 0.33, w, s * 0.34);
  for (let i = 0; i < bannerLines.length; i++) txt(bannerLines[i], w / 2, s * 0.42 + i * (s * 0.08), Math.round(s / (i === 0 ? 14 : 24)), i === 0 ? '#ffd23a' : '#7fd4ff');
}
function drawStartPrompt(now) {
  if (Math.floor(now / 400) % 2) return;
  const w = canvas.width, s = canvas.height;
  txt(touch.active ? 'TAP FLAP TO START' : 'FLAP TO START', w / 2, s * 0.72, Math.round(s / 22), '#aaffaa');
}
function drawClear() {
  const w = canvas.width, s = canvas.height;
  txt(PHRASES.nice, w / 2, s * 0.4, Math.round(s / 14), '#ffd23a');
  const P = engine.players;
  txt('WAVE ' + engine.wave + ' CLEARED', w / 2, s * 0.52, Math.round(s / 26), '#7fd4ff');
}
function drawPause() {
  const w = canvas.width, s = canvas.height;
  ctx.fillStyle = 'rgba(2,3,12,0.72)'; ctx.fillRect(0, 0, w, s);
  txt('PAUSED', w / 2, s * 0.42, Math.round(s / 12), '#ffd23a');
  txt('P / ESC  RESUME', w / 2, s * 0.56, Math.round(s / 26), '#7fd4ff');
  txt('Q  QUIT TO TITLE', w / 2, s * 0.62, Math.round(s / 26), '#7fd4ff');
  txt('HOLD ESC  RESTART WAVE (−1 LIFE)', w / 2, s * 0.68, Math.round(s / 30), '#c9c9d6');
}
function drawEscHold(now) {
  if (!escDownAt) return;
  const t = Math.min(1, (now - escDownAt) / 800); if (t < 0.12) return;
  const w = canvas.width, cx = w / 2, y = canvas.height * 0.1;
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(cx - 130, y, 260, 34);
  ctx.fillStyle = '#333'; ctx.fillRect(cx - 116, y + 20, 232, 8);
  ctx.fillStyle = '#ff5555'; ctx.fillRect(cx - 116, y + 20, 232 * t, 8);
  txt('HOLD ESC — RESTART WAVE (−1 LIFE)', cx, y + 10, 12, '#ffaaaa');
}

function drawHelp() {
  const w = canvas.width, s = canvas.height;
  txt('HOW TO PLAY', w / 2, s * 0.08, Math.round(s / 16), '#ffd23a');
  const lines = [
    'You ride a flying buzzard. TAP FLAP repeatedly to climb;',
    'stop flapping to glide down. Momentum carries you — flap the',
    'opposite way to turn. The screen wraps left↔right.',
    '',
    'JOUST: when you collide, the HIGHER LANCE wins and unseats',
    'the other. Equal height = you both bounce. Ride ABOVE your foe.',
    '',
    'Unseated enemies drop EGGS — grab them for 250/500/750/1000',
    '(+500 caught in mid-air). Collect them before they HATCH into',
    'a new, tougher rider.',
    '',
    'BOUNDER (red) 500 · HUNTER (grey) 750 · SHADOW LORD (blue) 1500',
    'PTERODACTYL 1000 — invulnerable except a lance in its open beak!',
    'Beware the LAVA TROLL\'s hand — flap hard to break free.',
    '',
    'Extra mount every 20,000. P pauses; hold ESC restarts a wave (−1 life).',
  ];
  const fs = Math.round(s / 34);
  for (let i = 0; i < lines.length; i++) txt(lines[i], w / 2, s * 0.16 + i * (s * 0.045), fs, i === 0 ? '#fff' : '#c9d0e0');
  txt('PRESS ENTER / ESC TO RETURN', w / 2, s * 0.95, Math.round(s / 30), '#7fd4ff');
}

function OPT_ROWS() {
  return [
    ['SFX VOLUME', () => Math.round(save.opts.sfx * 100) + '%', d => { save.opts.sfx = Math.max(0, Math.min(1, save.opts.sfx + d * 0.1)); audio.setSfx(save.opts.sfx); audio.play('flap'); }],
    ['MUSIC VOLUME', () => Math.round(save.opts.mus * 100) + '%', d => { save.opts.mus = Math.max(0, Math.min(1, save.opts.mus + d * 0.1)); audio.setMus(save.opts.mus); }],
    ['CRT FILTER', () => save.opts.crt ? 'ON' : 'OFF', () => { save.opts.crt = !save.opts.crt; renderer.crt = save.opts.crt; }],
    ['DIFFICULTY', () => save.opts.difficulty.toUpperCase(), d => { const o = ['easy', 'normal', 'hard']; let i = (o.indexOf(save.opts.difficulty) + (d > 0 ? 1 : o.length - 1)) % o.length; save.opts.difficulty = o[i]; }],
    ['STARTING MEN', () => '' + save.opts.lives, d => { save.opts.lives = Math.max(3, Math.min(5, save.opts.lives + d)); }],
    ['REMAP P1 FLAP', () => keyName(save.opts.keys.p1.flap), () => rebindTarget = { player: 'p1', action: 'flap' }],
    ['REMAP P2 FLAP', () => keyName(save.opts.keys.p2.flap), () => rebindTarget = { player: 'p2', action: 'flap' }],
    ['ALL WAVES (PASS:1234)', () => save.unlockAll ? 'UNLOCKED' : 'LOCKED', () => { promptUnlock(); }],
    ['RESET PROGRESS', () => '', () => { if (confirm('Reset progress, scores and options?')) { save.maxWave = 1; save.unlockAll = false; save.scores = []; save.hi = 0; persist(); flash('RESET'); } }],
  ];
}
function keyName(code) { return code.replace('Arrow', '').replace('Key', '').replace('Digit', '').toUpperCase(); }
function doRebind(code) { const t = rebindTarget; save.opts.keys[t.player][t.action] = code; rebindTarget = null; persist(); flash('BOUND ' + keyName(code)); }
function promptUnlock() { const p = prompt('Enter unlock password:'); if (p === '1234') { save.unlockAll = true; persist(); flash('ALL WAVES UNLOCKED'); } else if (p != null) flash('WRONG PASSWORD'); }

function drawOptions() {
  const w = canvas.width, s = canvas.height;
  txt('OPTIONS', w / 2, s * 0.1, Math.round(s / 15), '#ffd23a');
  const rows = OPT_ROWS(), y0 = s * 0.24, dy = s * 0.072;
  for (let i = 0; i < rows.length; i++) {
    const sel = i === optIdx, y = y0 + i * dy;
    txt((sel ? '▶ ' : '') + rows[i][0], w * 0.28, y, Math.round(s / 26), sel ? '#ffe14d' : '#c9c9d6', 'left');
    txt(rows[i][1](), w * 0.75, y, Math.round(s / 26), sel ? '#fff' : '#8fa', 'right');
  }
  txt(rebindTarget ? 'PRESS A KEY…' : '← → CHANGE · ESC BACK', w / 2, s * 0.94, Math.round(s / 30), '#7fd4ff');
}

function drawWaveSelect() {
  const w = canvas.width, s = canvas.height;
  txt('WAVE SELECT', w / 2, s * 0.1, Math.round(s / 15), '#ffd23a');
  const maxW = save.unlockAll ? 99 : save.maxWave;
  const perPage = 25, cols = 5;
  const start = wsPage * perPage;
  txt('REACHED WAVE ' + save.maxWave + (save.unlockAll ? '  (ALL UNLOCKED)' : ''), w / 2, s * 0.18, Math.round(s / 32), '#7fd4ff');
  for (let i = 0; i < perPage; i++) {
    const n = start + i + 1; const r = (i / cols | 0), c = i % cols;
    const x = w * 0.2 + c * (w * 0.15), y = s * 0.28 + r * (s * 0.1);
    const unlocked = n <= maxW;
    const t = waveInfo(n).type[0].toUpperCase();
    txt(n + (t !== 'N' ? t : ''), x, y, Math.round(s / 28), unlocked ? '#ffe14d' : '#555');
  }
  txt('DIGITS/ARROWS PICK · TYPE WAVE# THEN ENTER · ESC BACK', w / 2, s * 0.92, Math.round(s / 34), '#7fd4ff');
  txt(wsInput ? 'GO TO WAVE: ' + wsInput : '', w / 2, s * 0.85, Math.round(s / 24), '#fff');
}
let wsInput = '';

function drawScores() {
  const w = canvas.width, s = canvas.height;
  txt(PHRASES.champions, w / 2, s * 0.09, Math.round(s / 16), '#ffd23a');
  txt('LOCAL', w * 0.27, s * 0.2, Math.round(s / 26), '#7fd4ff');
  txt('GLOBAL', w * 0.73, s * 0.2, Math.round(s / 26), '#39c06a');
  for (let i = 0; i < 10; i++) {
    const L = save.scores[i], y = s * 0.28 + i * s * 0.06;
    txt((i + 1) + '.', w * 0.1, y, Math.round(s / 32), '#888', 'left');
    if (L) { txt(L.initials, w * 0.16, y, Math.round(s / 30), '#fff', 'left'); txt('' + L.score, w * 0.44, y, Math.round(s / 30), '#ffe14d', 'right'); }
    const G = globalScores && globalScores[i];
    if (G) { txt((G.initials || '???'), w * 0.6, y, Math.round(s / 30), '#fff', 'left'); txt('' + G.score, w * 0.9, y, Math.round(s / 30), '#8fdca0', 'right'); }
  }
  txt('ESC TO RETURN', w / 2, s * 0.95, Math.round(s / 30), '#7fd4ff');
}
function drawHsEntry() {
  const w = canvas.width, s = canvas.height;
  txt(PHRASES.enterName, w / 2, s * 0.2, Math.round(s / 18), '#ffd23a');
  txt('SCORE ' + hsScore + '  ·  WAVE ' + hsWave, w / 2, s * 0.32, Math.round(s / 28), '#7fd4ff');
  for (let i = 0; i < 3; i++) {
    const x = w / 2 + (i - 1) * (s * 0.1);
    txt(hsInitials[i], x, s * 0.48, Math.round(s / 10), i === hsPos ? '#ffe14d' : '#fff');
    if (i === hsPos && Math.floor(performance.now() / 300) % 2) txt('_', x, s * 0.54, Math.round(s / 12), '#ffe14d');
  }
  txt('↑↓ LETTER · ←→ MOVE · ENTER OK', w / 2, s * 0.72, Math.round(s / 30), '#7fd4ff');
}
function drawGameOver() {
  const w = canvas.width, s = canvas.height;
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, w, canvas.height);
  txt(PHRASES.gameOver, w / 2, s * 0.36, Math.round(s / 12), '#ff5f5f');
  txt('SCORE ' + hsScore, w / 2, s * 0.5, Math.round(s / 22), '#ffe14d');
  txt('WAVE ' + hsWave, w / 2, s * 0.58, Math.round(s / 28), '#7fd4ff');
  if (Math.floor(performance.now() / 500) % 2) txt('PRESS ENTER', w / 2, s * 0.72, Math.round(s / 24), '#fff');
}

// ─── UI key handling ───
function startFromTitle() { menuAction(menuIdx); }
let pendingMode = '1p';
function menuAction(i) {
  audio.init(); audio.resume();
  if (i === 0) { pendingMode = '1p'; startRun(1); }
  else if (i === 1) { pendingMode = '2p'; startRun(1); }
  else if (i === 2) state = 'help';
  else if (i === 3) { state = 'options'; optIdx = 0; }
  else if (i === 4) { state = 'waveselect'; wsInput = ''; }
  else if (i === 5) { state = 'scores'; fetchGlobal(); }
}
function advanceScreen() { if (state === 'gameover') backToTitle(); else if (state === 'help' || state === 'scores') backToTitle(); }
function backToTitle() { state = 'title'; menuIdx = 0; paused = false; if (!attract) startAttract(); audio.init(); audio.startMusic(); }

function handleKeyUI(e) {
  const code = e.code;
  if (e.repeat && ['Enter', 'Escape', 'Space'].includes(code)) return;
  if (state === 'playing') {
    if (paused) {
      if (code === 'KeyP' || code === 'Escape' || code === 'Enter') paused = false;
      else if (code === 'KeyQ') { paused = false; backToTitle(); }
      return;
    }
    if (code === 'Escape' && !escDownAt) escDownAt = performance.now();
    if (code === 'KeyP') paused = true;
    return;
  }
  if (state === 'title') {
    if (code === 'ArrowUp') { menuIdx = (menuIdx + 5) % 6; audio.init(); audio.play('walk'); }
    if (code === 'ArrowDown') { menuIdx = (menuIdx + 1) % 6; audio.init(); audio.play('walk'); }
    if (code === 'Enter' || code === 'Space') menuAction(menuIdx);
  } else if (state === 'help') { if (code === 'Enter' || code === 'Escape') backToTitle(); }
  else if (state === 'options') {
    const rows = OPT_ROWS();
    if (code === 'ArrowUp') optIdx = (optIdx + rows.length - 1) % rows.length;
    if (code === 'ArrowDown') optIdx = (optIdx + 1) % rows.length;
    if (code === 'ArrowLeft') { rows[optIdx][2](-1); persist(); }
    if (code === 'ArrowRight' || code === 'Enter') { rows[optIdx][2](1); persist(); }
    if (code === 'Escape') { persist(); backToTitle(); }
  } else if (state === 'waveselect') {
    const maxW = save.unlockAll ? 99 : save.maxWave;
    if (code === 'Escape') backToTitle();
    else if (/^(Digit|Numpad)\d$/.test(code)) { wsInput = (wsInput + code.slice(-1)).slice(0, 2); }
    else if (code === 'Backspace') wsInput = wsInput.slice(0, -1);
    else if (code === 'ArrowLeft') wsPage = Math.max(0, wsPage - 1);
    else if (code === 'ArrowRight') wsPage = Math.min(3, wsPage + 1);
    else if (code === 'Enter') { const n = parseInt(wsInput || '1', 10); if (n >= 1 && n <= maxW) { pendingMode = '1p'; startRun(n); } else flash('WAVE LOCKED'); }
  } else if (state === 'scores') { if (code === 'Escape' || code === 'Enter') backToTitle(); }
  else if (state === 'gameover') { if (code === 'Enter' || code === 'Space' || code === 'Escape') backToTitle(); }
  else if (state === 'hsentry') {
    if (/^Key[A-Z]$/.test(code) && hsPos < 3) { hsInitials = hsInitials.slice(0, hsPos) + code[3] + hsInitials.slice(hsPos + 1); hsPos = Math.min(2, hsPos + 1); }
    if (code === 'ArrowUp') bumpInitial(1);
    if (code === 'ArrowDown') bumpInitial(-1);
    if (code === 'ArrowLeft') hsPos = Math.max(0, hsPos - 1);
    if (code === 'ArrowRight') hsPos = Math.min(2, hsPos + 1);
    if (code === 'Backspace') hsPos = Math.max(0, hsPos - 1);
    if (code === 'Enter') commitHs();
  } else if (state === 'clear' || state === 'intro') {
    if (code === 'Enter' || code === 'Space') { if (state === 'intro') { introTimer = 0; } }
  }
}
function bumpInitial(d) { const c = (hsInitials.charCodeAt(hsPos) - 65 + d + 26) % 26; hsInitials = hsInitials.slice(0, hsPos) + String.fromCharCode(65 + c) + hsInitials.slice(hsPos + 1); }

// touch on title
canvas.addEventListener('pointerdown', e => {
  audio.init(); audio.resume();
  const c = evToCanvas(e), s = canvas.height, w = canvas.width;
  if (state === 'title') {
    const y0 = s * 0.44, dy = s * 0.075, idx = Math.round((c.y - y0) / dy);
    if (idx >= 0 && idx < 6) { menuIdx = idx; menuAction(idx); }
  } else if (state === 'help' || state === 'scores' || state === 'gameover') { backToTitle(); }
  else if (state === 'intro') { introTimer = 0; }
  else if (state === 'options') {
    const rows = OPT_ROWS(), y0 = s * 0.24, dy = s * 0.072, idx = Math.round((c.y - y0) / dy);
    if (idx >= 0 && idx < rows.length) { optIdx = idx; rows[idx][2](c.x < w * 0.4 ? -1 : 1); persist(); }
    else if (c.y > s * 0.9) backToTitle();
  } else if (state === 'waveselect') {
    // tap a wave cell (5 cols grid) or bottom to go back
    if (c.y > s * 0.86) { backToTitle(); return; }
    const cols = 5, col = Math.floor((c.x - w * 0.2) / (w * 0.15)), row = Math.round((c.y - s * 0.28) / (s * 0.1));
    if (col >= 0 && col < cols && row >= 0) { const n = wsPage * 25 + row * cols + col + 1; const maxW = save.unlockAll ? 99 : save.maxWave; if (n >= 1 && n <= maxW) { pendingMode = '1p'; startRun(n); } }
  } else if (state === 'hsentry') {
    // tap left/right third to move, upper/lower to change letter, center-bottom to confirm
    if (c.y > s * 0.65) { commitHs(); return; }
    if (c.x < w * 0.4) hsPos = Math.max(0, hsPos - 1); else if (c.x > w * 0.6) hsPos = Math.min(2, hsPos + 1); else bumpInitial(c.y < s * 0.45 ? 1 : -1);
  }
});

// boot
setupTouch();
startAttract();
audio.init && document.addEventListener('pointerdown', () => { audio.init(); if (state === 'title') audio.startMusic(); }, { once: true });
document.addEventListener('keydown', () => { audio.init(); if (state === 'title') audio.startMusic(); }, { once: true });
const boot = document.getElementById('boot'); if (boot) boot.style.display = 'none';
requestAnimationFrame(frame);

// expose QA hook for headless testing
window.__joustQA = {
  bot: false,
  engine: () => engine, state: () => state, wave: () => engine && engine.wave,
  start: (wv, m) => { pendingMode = m || '1p'; startRun(wv || 1); engine.started = true; state = 'playing'; },
  playReal: (wv, m) => { pendingMode = m || '1p'; startRun(wv || 1); introTimer = 1; window.__joustQA.bot = true; }, // full shell flow, bot-driven
  tick: (n, inp) => { for (let i = 0; i < (n || 1); i++) { const s = engine.tick(inp || readInputs()); processEvents(s.events); } return engine.snapshot(); },
  setState: s => state = s, snapshot: () => engine && engine.snapshot(), version: VERSION,
};
