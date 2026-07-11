// Joust MODERN 3D — shell: state machine, input, screens, HUD, options, achievements,
// leaderboard, kill-cam, rumble, main loop. The SAME deterministic engine as the retro
// remake is authoritative — this shell only feeds it inputs and draws its snapshots in 3D.
'use strict';

const VERSION = 'v' + (window.__V3 || '0.9.0');
const ASSET_Q = '?v=' + (window.__V3 || '0.9.0');
const DATA = window.JOUST_DATA;
const { JoustEngine } = window.JOUST_ENGINE;
const { Renderer3D } = window.JOUST_RENDER3D;
const { AudioSys } = window.JOUST_AUDIO;
const { WORLD, PHRASES, waveInfo, PHYS } = DATA;
const STEP_MS = 1000 / (PHYS.TICK_HZ || 60.096154);   // v2 physics are calibrated for the real 60.096 Hz tick
const LB_URL = 'https://game-scores.jez237.workers.dev/scores/joust-modern';

const glCanvas = document.getElementById('gl');
const hudCanvas = document.getElementById('hud');
const ctx = hudCanvas.getContext('2d');
// roundRect is missing on older Firefox/Safari — without this every panel() throws and the HUD goes blank
if (!ctx.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(Math.abs(r || 0), Math.abs(w) / 2, Math.abs(h) / 2);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r);
    this.closePath(); return this;
  };
}
const renderer = new Renderer3D(glCanvas, hudCanvas);
const audio = new AudioSys();

// ─── save / options / stats ───
const SAVE_KEY = 'joust3d_save_v1';
const defaultKeys = () => ({
  p1: { left: 'ArrowLeft', right: 'ArrowRight', flap: 'ArrowUp' },
  p2: { left: 'KeyA', right: 'KeyD', flap: 'KeyW' },
});
let save = {
  hi: 0, scores: [], maxWave: 1, unlockAll: false,
  stats: { games: 0, kills: 0, pteroKills: 0, eggs: 0, maxChain: 0, waves: 0, deaths: 0 },
  feats: {},
  opts: { sfx: 0.7, mus: 0.5, quality: 'high', camShake: true, rumble: true, difficulty: 'normal', lives: 5, keys: defaultKeys() },
};
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.opts) { save = Object.assign(save, s); if (!save.opts.keys) save.opts.keys = defaultKeys(); if (!save.stats) save.stats = { games: 0, kills: 0, pteroKills: 0, eggs: 0, maxChain: 0, waves: 0, deaths: 0 }; if (!save.feats) save.feats = {}; } } catch (e) {}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
audio.setSfx(save.opts.sfx); audio.setMus(save.opts.mus);
renderer.setQuality(save.opts.quality);

// ─── achievements ───
const FEATS = [
  ['firstBlood', 'FIRST BLOOD', 'Win your first joust'],
  ['pterorider', 'PTERO SLAYER', 'Lance a pterodactyl in the beak'],
  ['chain4', 'EGG BARON', 'Chain 4 eggs in one streak'],
  ['wave5', 'SURVIVOR', 'Reach wave 5'],
  ['wave10', 'GLADIATOR', 'Reach wave 10'],
  ['wave20', 'SHADOW LORD', 'Reach wave 20'],
  ['score50k', 'HALF LEGEND', 'Score 50,000'],
  ['score100k', 'LEGEND', 'Score 100,000'],
  ['noDeath', 'UNSEATED NEVER', 'Clear 3 straight waves without dying'],
  ['trollEscape', 'SLIPPERY', 'Break free from the lava troll'],
  ['airEgg', 'SKY HARVEST', 'Catch an egg in mid-air'],
  ['centurion', 'CENTURION', '100 lifetime joust kills'],
];
let featToasts = [];
function grantFeat(id) {
  if (save.feats[id]) return;
  save.feats[id] = Date.now(); persist();
  const f = FEATS.find(x => x[0] === id);
  featToasts.push({ name: f ? f[1] : id, t: 0 });
  audio.play('bounty');
}

// ─── state ───
let state = 'title';
let engine = null, mode = '1p';
let menuIdx = 0, optIdx = 0, wsPage = 0;
let introTimer = 0, clearTimer = 0, bannerLines = [];
let flashMsg = '', flashUntil = 0;
let globalScores = null, globalFetchedAt = -1e9;
let hsInitials = 'AAA', hsPos = 0, hsScore = 0, hsWave = 1, hsPending = false;
let rebindTarget = null;
let escDownAt = 0;
let paused = false;
let attract = null;
let killCam = 0;           // slow-mo frames remaining on the final death
let noDeathStreak = 0;     // consecutive waves cleared without dying
let _lastSnap = null;      // cached snapshot for static screens (no re-snapshot behind menus)

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
    if (p >= 0 && (state === 'playing' || state === 'intro')) {
      flapQueue[p] = true;
      if (state === 'intro') introTimer = 0;
    }
    // Space is a P1 flap in 1-player mode, including the stroke that dismisses the wave card
    if (e.code === 'Space' && mode === '1p' && (state === 'playing' || state === 'intro')) {
      flapQueue[0] = true;
      if (state === 'intro') introTimer = 0;
    }
  }
  keys[e.code] = true;
  handleKeyUI(e);
  const kk = save.opts.keys;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) ||
      e.code === kk.p1.left || e.code === kk.p1.right || e.code === kk.p1.flap ||
      e.code === kk.p2.left || e.code === kk.p2.right || e.code === kk.p2.flap) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Escape') escDownAt = 0; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; escDownAt = 0; touch.left = touch.right = touch.flapHeld = false; });
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
    if (touch.active && i === 0) { left = left || touch.left; right = right || touch.right; held = held || touch.flapHeld; }
    if (pad.on && i === 0) { left = left || pad.left; right = right || pad.right; held = held || pad.flapHeld; }
    const flap = flapQueue[i]; flapQueue[i] = false;
    out.push({ left: !!left, right: !!right, flap: !!flap, flapHeld: !!held });
  }
  return out;
}

// ─── touch ───
const touch = { active: false, device: false, left: false, right: false, flapHeld: false };
function setupTouch() {
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  if (!isTouch) return;
  touch.active = true; touch.device = true;
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
  f.addEventListener('pointerdown', e => {
    e.preventDefault(); touch.active = true; touch.flapHeld = true; audio.init();
    if (state === 'title') startFromTitle();
    else if (state === 'intro') { introTimer = 0; flapQueue[0] = true; }
    else if (state === 'playing') flapQueue[0] = true;
    else advanceScreen();
  });
  const flapUp = e => { e.preventDefault(); touch.flapHeld = false; };
  f.addEventListener('pointerup', flapUp); f.addEventListener('pointerleave', flapUp); f.addEventListener('pointercancel', flapUp);
  window._touchbar = bar;
}
function updateTouchVis() { if (window._touchbar) window._touchbar.style.display = (touch.device && (state === 'playing' || state === 'intro')) ? 'flex' : 'none'; }
function evToCanvas(e) { const r = hudCanvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * (hudCanvas.width / r.width), y: (e.clientY - r.top) * (hudCanvas.height / r.height) }; }

// ─── gamepad (+ rumble) ───
const pad = { on: false, left: false, right: false, flapHeld: false, _flap: false, _up: false, _down: false, _ok: false, _esc: false, _pause: false };
window.addEventListener('gamepadconnected', () => { pad.on = true; });
let _gpRef = null;
function rumble(strong, weak, ms) {
  if (!save.opts.rumble || !_gpRef) return;
  const a = _gpRef.vibrationActuator;
  if (a && a.playEffect) a.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
}
function pollGamepad() {
  if (!navigator.getGamepads) return;
  let gp = null; for (const g of navigator.getGamepads()) { if (g && g.connected) { gp = g; break; } }
  _gpRef = gp;
  if (!gp) { pad.left = pad.right = pad.flapHeld = false; return; }
  pad.on = true;
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, B = i => gp.buttons[i] && gp.buttons[i].pressed;
  pad.left = ax < -0.35 || B(14); pad.right = ax > 0.35 || B(15);
  pad.flapHeld = B(0) || B(1) || B(7) || B(12);
  const edge = (now, key) => { const was = pad['_' + key]; pad['_' + key] = now; return now && !was; };
  const flapNow = pad.flapHeld;
  if (edge(flapNow, 'flap') && (state === 'playing' || state === 'intro')) {
    flapQueue[0] = true; if (state === 'intro') introTimer = 0;
  }
  const upNow = ay < -0.5 || B(12), downNow = ay > 0.5 || B(13), okNow = B(0) || B(9), escNow = B(1) || B(8) || B(3);
  const pauseNow = B(9), up = edge(upNow, 'up'), down = edge(downNow, 'down'), ok = edge(okNow, 'ok'), esc = edge(escNow, 'esc'), pauseEdge = edge(pauseNow, 'pause');
  if (state !== 'playing') {
    if (up) handleKeyUI({ code: 'ArrowUp' }); if (down) handleKeyUI({ code: 'ArrowDown' });
    if (pad.left && !pad._padLeftWas) handleKeyUI({ code: 'ArrowLeft' }); if (pad.right && !pad._padRightWas) handleKeyUI({ code: 'ArrowRight' });
    if (ok) { audio.init(); handleKeyUI({ code: 'Enter' }); } if (esc) handleKeyUI({ code: 'Escape' });
  } else {
    if (pauseEdge) paused = !paused;
    if (esc && !escDownAt) escDownAt = performance.now();
    if (!escNow) escDownAt = 0;
  }
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
let pendingMode = '1p';
function startRun(wv) {
  mode = pendingMode || '1p';
  engine = new JoustEngine({ mode, wave: wv || 1, lives: save.opts.lives, difficulty: save.opts.difficulty, seed: (Date.now() & 0xffff) ^ 0x1234, holdUntilInput: true });
  renderer.clearViews();
  audio.init(); audio.stopMusic();
  paused = false; acc = 0; killCam = 0; noDeathStreak = 0;
  save.stats.games++; persist();
  gotoIntro();
}
function gotoIntro() {
  state = 'intro'; introTimer = 210;
  bannerLines = bannerForWave(engine.wave, engine.waveType);
  audio.play('start');
}
function bannerForWave(wv, type) {
  const lines = [];
  if (wv === 1) lines.push('WAVE 1', PHRASES.prepare, 'BUZZARD BAIT!');
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
  save.stats.waves++;
  const anyDeath = engine.players.some(p => p.deathsThisWave > 0);
  noDeathStreak = anyDeath ? 0 : noDeathStreak + 1;
  if (noDeathStreak >= 3) grantFeat('noDeath');
  if (engine.wave + 1 >= 5) grantFeat('wave5');
  if (engine.wave + 1 >= 10) grantFeat('wave10');
  if (engine.wave + 1 >= 20) grantFeat('wave20');
  persist();
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
  if (hsScore >= 50000) grantFeat('score50k');
  if (hsScore >= 100000) grantFeat('score100k');
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

// ─── event → fx/sound/achievement bridge ───
const SND = { flap: 'flap', thud: 'thud', cthud: 'cthud', skid: 'skid', walk: 'walk', eggDrop: 'eggDrop', eggCollect: 'eggCollect', eggHatch: 'eggHatch', eggLand: 'thud', enemyDie: 'enemyDie', playerDie: 'playerDie', ptero: 'ptero', pteroDie: 'pteroDie', troll: 'troll', bounce: 'bounce', bounty: 'bounty', extraMan: 'extraMan', bait: 'bait', spawn: 'spawn', mount: 'mount', materialized: 'materialized', waveClear: 'waveClear' };
function processEvents(evs, quiet) {
  for (const e of evs) {
    if (!quiet) { const s = SND[e.type]; if (s) audio.play(s); }
    switch (e.type) {
      case 'enemyDie':
        renderer.addEffect(null, e.x, e.y - 8, 1.4, 16);
        renderer.burst('feather', e.x, e.y, { n: 10, col: '#ffe14d' });
        if (e.points && !quiet) { renderer.float('+' + e.points, e.x, e.y - 14, '#ffd23a'); if (save.opts.camShake) renderer.shakeBy(2); rumble(0.5, 0.3, 90); }
        if (!quiet) { save.stats.kills++; grantFeat('firstBlood'); if (save.stats.kills >= 100) grantFeat('centurion'); }
        break;
      case 'eggCollect':
        renderer.burst('spark', e.x, e.y, { n: 8, col: e.air ? '#7fd4ff' : '#f3ead0', up: true });
        if (!quiet) { renderer.float('+' + e.points, e.x, e.y - 12, e.air ? '#7fd4ff' : '#ffe14d'); save.stats.eggs++; if (e.air) grantFeat('airEgg'); }
        break;
      case 'combo': {
        const col = ['#ffe14d', '#ffd23a', '#ff8a00', '#ff4d4d'][Math.min(3, e.level - 1)];
        if (!quiet) {
          renderer.float('CHAIN x' + e.level, e.x, e.y - 22, col, e.level >= 3);
          if (e.level > save.stats.maxChain) save.stats.maxChain = e.level;
          if (e.level >= 4) grantFeat('chain4');
          if (e.level >= 3) audio.play('bounty');
        }
        renderer.burst('spark', e.x, e.y - 6, { n: 6 + e.level * 3, col, up: true });
        break;
      }
      case 'pteroDie':
        renderer.addEffect(null, e.x, e.y, 2.2, 22);
        renderer.burst('feather', e.x, e.y, { n: 18, col: '#39c06a' });
        if (!quiet) { renderer.float('+' + e.points, e.x, e.y - 16, '#39c06a', true); if (save.opts.camShake) renderer.shakeBy(7); rumble(0.9, 0.6, 200); save.stats.pteroKills++; grantFeat('pterorider'); flash('NICE JOUSTING!'); }
        break;
      case 'playerDie':
        renderer.addEffect(null, e.x, e.y - 8, 1.8, 22);
        renderer.burst('ash', e.x, e.y, { n: 16, col: '#cccccc', life: 45 });
        if (!quiet) {
          if (save.opts.camShake) renderer.shakeBy(6); rumble(1, 0.7, 320);
          save.stats.deaths++; noDeathStreak = 0;
          // kill-cam: if this was the last life anywhere, run a slow-mo beat
          if (engine && engine.players.every(p => p.out || (p.lives <= 0))) killCam = 80;
        }
        break;
      case 'bounty': if (!quiet) { renderer.float('BOUNTY +' + e.points, e.x, e.y - 16, '#ff5f5f', true); if (save.opts.camShake) renderer.shakeBy(3); } break;
      case 'bonus': if (!quiet) renderer.float('+' + e.points + (e.kind === 'survival' ? ' SURVIVAL' : e.kind === 'team' ? ' TEAM' : ''), WORLD.VIEW_W / 2, 110 + (e.pi || 0) * 16, '#ffd23a', true); break;
      case 'extraMan': if (!quiet) flash('EXTRA MOUNT!'); break;
      case 'playerOut': if (!quiet) flash('PLAYER ' + ((e.pi || 0) + 1) + ' OUT'); break;
      case 'spawn': renderer.burst('spark', e.x, e.y, { n: 10, col: '#66ccff', up: true }); break;
      case 'bounce': renderer.burst('spark', e.x, e.y, { n: 5, col: '#ffffff' }); if (!quiet && save.opts.camShake) renderer.shakeBy(1.5); break;
      case 'troll': renderer.burst('spark', e.x, WORLD.FLOOR, { n: 6, col: '#ff6a00' }); if (!quiet) grantFeatOnEscapeWatch(); break;
      case 'lavaEscape': if (!quiet) grantFeat('trollEscape'); break;
    }
  }
}
// troll escape detection: engine emits no explicit escape event — watch score bump via addScore LAVA_ESCAPE?
// simpler: engine emits 'troll' on grab; if the player survives (no death within the grab), grant on next waveClear.
let _trollWatch = false;
function grantFeatOnEscapeWatch() { _trollWatch = true; }

// ─── main loop ───
let acc = 0, lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = now - lastT; lastT = now; if (dt > 200) dt = 200;
  pollGamepad();
  renderer.resize();
  const frameUnits = Math.min(4, dt / STEP_MS);   // 60Hz-normalized so timers are FPS-independent
  renderer.updateFx(frameUnits);

  if (state === 'playing' && !paused) {
    const rate = killCam > 0 ? 0.32 : 1;      // kill-cam slow-mo
    acc += dt * rate;
    if (killCam > 0) { killCam -= frameUnits; renderer.punchT = Math.max(renderer.punchT, 0.7); }
    while (acc >= STEP_MS) {
      acc -= STEP_MS;
      const snap = engine.tick(readInputs());
      processEvents(snap.events);
      if (engine.gameOver) { if (killCam <= 0) { onGameOver(); } break; }
      if (engine.waveCleared && engine.clearTimer <= 0) { if (_trollWatch) { grantFeat('trollEscape'); _trollWatch = false; } onWaveCleared(); break; }
    }
    if (engine.gameOver && killCam <= 0 && state === 'playing') onGameOver();
    if (escDownAt && now - escDownAt > 800) { escDownAt = 0; restartWaveCostLife(); }
  } else if (state === 'title' || state === 'attract') {
    acc += dt; while (acc >= STEP_MS) { acc -= STEP_MS; stepAttract(); }
  } else if (state === 'intro') {
    introTimer -= frameUnits; if (introTimer <= 0) state = 'playing';
  } else if (state === 'clear') {
    clearTimer -= frameUnits; if (clearTimer <= 0) advanceAfterClear();
  }

  draw(now, dt);
  updateTouchVis();
}

function restartWaveCostLife() {
  for (const p of engine.players) {
    if (p.out) continue;
    p.lives--; p.eggStreak = 0;
    if (p.lives <= 0) p.out = true;
  }
  paused = false;
  if (engine.players.every(p => p.out)) { onGameOver(); return; }
  engine.startWave(engine.wave);
  renderer.clearViews();
  flash('RESTARTING WAVE');
  gotoIntro();
}

// ─── attract ───
function startAttract() {
  attract = new JoustEngine({ mode: '1p', wave: 1 + ((Date.now() / 9000 | 0) % 4), lives: 9, difficulty: 'normal', seed: Date.now() & 0xffff, holdUntilInput: false });
  attract.started = true;
  renderer.clearViews();
}
function stepAttract() {
  if (!attract || attract.gameOver || attract.wave > 6) startAttract();
  const p = attract.players[0];
  let inp = { left: false, right: false, flap: false };
  if (p && p.alive) {
    let tx = p.x, targetY = p.y;
    const eggs = attract.eggs.filter(e => !e.dead);
    let tgt = eggs[0] || attract.enemies.find(e => e.alive);
    if (tgt) { tx = tgt.x; targetY = tgt.kind === 'egg' ? tgt.y : tgt.y - 22; }
    const d = window.JOUST_ENGINE.wrapDelta(p.x, tx);
    if (d > 4) inp.right = true; else if (d < -4) inp.left = true;
    attract._fc = (attract._fc || 0) + 1;
    if (p.y > targetY + 6 || p.y > WORLD.FLOOR - 45) { if (attract._fc % 8 === 0) inp.flap = true; }
    else if (attract._fc % 20 === 0) inp.flap = true;
  }
  attract.tick([inp]);
  processEvents(attract.events, true);
}

// ─── drawing (HUD canvas over the 3D view) ───
const FONT = `'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif`;
function txt(s, x, y, size, col, align, weight) {
  ctx.font = `${weight || 800} ${size}px ${FONT}`;
  ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillText(s, x + 1.5, y + 2);
  ctx.fillStyle = col || '#fff'; ctx.fillText(s, x, y);
}
function panel(x, y, w, h, r) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r || 14);
  ctx.fillStyle = 'rgba(5,8,18,0.78)'; ctx.fill();
  ctx.strokeStyle = 'rgba(127,180,255,0.22)'; ctx.lineWidth = 1.4; ctx.stroke();
}

function draw(now, dt) {
  const W = hudCanvas.width, H = hudCanvas.height;
  ctx.clearRect(0, 0, W, H);
  // fresh snapshots only for live sims; static screens (paused/menus/gameover) reuse the last one
  let snap;
  if (state === 'title' || state === 'attract') snap = _lastSnap = (attract ? attract.snapshot() : null);
  else if (engine && (state === 'playing' || state === 'intro' || state === 'clear') && !paused) snap = _lastSnap = engine.snapshot();
  else snap = _lastSnap;
  renderer.render(snap, dt);

  if (state === 'title' || state === 'attract') drawTitle(now);
  else if (state === 'help') { dim(); drawHelp(); }
  else if (state === 'options') { dim(); drawOptions(); }
  else if (state === 'waveselect') { dim(); drawWaveSelect(); }
  else if (state === 'scores') { dim(); drawScores(); }
  else if (state === 'feats') { dim(); drawFeats(); }
  else if (state === 'hsentry') { dim(); drawHsEntry(); }
  else if (state === 'intro') { drawHUD(); drawBanner(); }
  else if (state === 'playing') { renderer.drawFloats(txt); drawHUD(); drawEscHold(now); if (!engine.started || engine.players.some(p => p.safe)) drawStartPrompt(now); if (paused) drawPause(); if (killCam > 0) drawKillCam(); }
  else if (state === 'clear') { drawHUD(); drawClear(); }
  else if (state === 'gameover') drawGameOver();

  drawVignette(W, H);
  drawToasts(W, H);
  if (flashMsg && now < flashUntil) txt(flashMsg, W / 2, H * 0.16, Math.round(H / 20), '#ffcc44');
}
function dim() { ctx.fillStyle = 'rgba(3,5,14,0.7)'; ctx.fillRect(0, 0, hudCanvas.width, hudCanvas.height); }
function drawVignette(W, H) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function drawToasts(W, H) {
  const u = H / 720;
  let y = H * 0.2;
  for (const t of featToasts) {
    t.t++;
    const a = t.t < 20 ? t.t / 20 : t.t > 160 ? 1 - (t.t - 160) / 30 : 1;
    ctx.globalAlpha = Math.max(0, a);
    panel(W - 340 * u, y, 300 * u, 54 * u, 12 * u);
    txt('🏆 ' + t.name, W - 190 * u, y + 20 * u, 17 * u, '#ffd23a');
    txt('ACHIEVEMENT UNLOCKED', W - 190 * u, y + 39 * u, 10.5 * u, '#8a93a8', 'center', 600);
    ctx.globalAlpha = 1;
    y += 64 * u;
  }
  featToasts = featToasts.filter(t => t.t < 190);
}

function drawTitle(now) {
  const W = hudCanvas.width, H = hudCanvas.height;
  ctx.fillStyle = 'rgba(3,4,12,0.42)'; ctx.fillRect(0, 0, W, H);
  // wordmark (clamped by width so portrait phones don't overflow)
  const ts = Math.round(Math.min(H / 5.6, W / 4.6));
  ctx.font = `900 ${ts}px 'Courier New',monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const gy = H * 0.185;
  const grad = ctx.createLinearGradient(0, gy - ts / 2, 0, gy + ts / 2);
  grad.addColorStop(0, '#fff2b0'); grad.addColorStop(0.45, '#ffd23a'); grad.addColorStop(1, '#8a4a08');
  ctx.shadowColor = 'rgba(255,150,30,.45)'; ctx.shadowBlur = 28;
  ctx.fillStyle = grad; ctx.fillText('JOUST', W / 2, gy);
  ctx.shadowBlur = 0;
  txt('M O D E R N   3 D', W / 2, H * 0.30, Math.round(H / 30), '#7fd4ff', 'center', 700);
  const items = ['1 PLAYER', '2 PLAYERS', 'HOW TO PLAY', 'OPTIONS', 'WAVE SELECT', 'HIGH SCORES', 'ACHIEVEMENTS'];
  const y0 = H * 0.42, dy = H * 0.066;
  for (let i = 0; i < items.length; i++) {
    const sel = i === menuIdx;
    if (sel) { panel(W / 2 - 170, y0 + i * dy - dy * 0.42, 340, dy * 0.84, 10); }
    txt(items[i], W / 2, y0 + i * dy, Math.round(H / (sel ? 24 : 27)), sel ? '#ffe14d' : '#b9c2d4');
  }
  txt('HI ' + save.hi.toLocaleString(), W / 2, H * 0.925, Math.round(H / 30), '#39c06a');
  if (W > 760 && Math.floor(now / 600) % 2 === 0) txt('SAME GAME · NEW WORLD — THE ROM-FAITHFUL ENGINE IN FULL 3D', W / 2, H * 0.965, Math.round(H / 46), '#6f7690', 'center', 600);
  if (W > 760) txt('RETRO EDITION ⇦ H', Math.round(H / 40) + 8, H - Math.round(H / 40), Math.round(H / 48), '#5a6378', 'left', 700);
  txt(VERSION, W - Math.round(H / 40), H - Math.round(H / 40), Math.round(H / 48), '#5a6378', 'right');
}

function drawHUD() {
  const W = hudCanvas.width, H = hudCanvas.height;
  const u = H / 720;                 // scale factor: HUD layout was designed at 720p
  const P = engine.players;
  const fs = Math.round(H / 34);
  // P1 score card
  panel(14 * u, 12 * u, 200 * u, 58 * u, 12 * u);
  txt('P1', 34 * u, 28 * u, fs * 0.66, '#ffd23a', 'left');
  txt(P[0].score.toLocaleString(), 34 * u, 51 * u, fs * 0.92, '#fff', 'left');
  drawLivesGlyphs(128 * u, 28 * u, P[0].lives, '#ffd23a', u);
  if (P[0].eggStreak >= 2) { const col = ['#ffe14d', '#ffd23a', '#ff8a00', '#ff4d4d'][Math.min(3, P[0].eggStreak - 1)]; txt('CHAIN x' + P[0].eggStreak, 34 * u, 84 * u, fs * 0.66, col, 'left'); }
  if (mode === '2p') {
    panel(W - 214 * u, 12 * u, 200 * u, 58 * u, 12 * u);
    txt('P2', W - 194 * u, 28 * u, fs * 0.66, '#7fd4ff', 'left');
    txt(P[1].score.toLocaleString(), W - 194 * u, 51 * u, fs * 0.92, '#fff', 'left');
    drawLivesGlyphs(W - 100 * u, 28 * u, P[1].lives, '#7fd4ff', u);
    if (P[1].eggStreak >= 2) txt('CHAIN x' + P[1].eggStreak, W - 194 * u, 84 * u, fs * 0.66, '#ff8a00', 'left');
  }
  // wave pill (hidden while the kill-cam letterbox owns the top of the screen)
  if (killCam <= 0) {
    panel(W / 2 - 84 * u, 12 * u, 168 * u, 34 * u, 17 * u);
    const wt = engine.waveType;
    const wl = wt === 'survival' ? ' · SURVIVAL' : wt === 'gladiator' ? ' · GLADIATOR' : wt === 'egg' ? ' · EGG' : wt === 'ptero' ? ' · PTERO' : '';
    txt('WAVE ' + engine.wave + wl, W / 2, 29 * u, fs * 0.7, '#dfe6f5');
  }
  // next special
  const nxt = nextSpecial(engine.wave);
  if (nxt) txt(nxt, W - 22 * u, H - 24 * u, fs * 1.1, '#ff8a00', 'right');
}
// spare mounts (the one you ride isn't a spare — mirror the retro HUD semantics)
function drawLivesGlyphs(x, y, lives, col, u) {
  u = u || 1;
  ctx.fillStyle = col;
  for (let i = 0; i < Math.min(lives - 1, 5); i++) {
    const gx = x + i * 15 * u;
    ctx.beginPath();
    ctx.ellipse(gx, y + 3 * u, 4.4 * u, 3.2 * u, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(gx + 2 * u, y + 1 * u); ctx.quadraticCurveTo(gx + 6 * u, y - 4 * u, gx + 7 * u, y - 6 * u);
    ctx.strokeStyle = col; ctx.lineWidth = 1.6 * u; ctx.stroke();
  }
}
function nextSpecial(wv) {
  for (let n = wv + 1; n <= wv + 5; n++) { const t = waveInfo(n).type; if (t === 'survival') return 'S'; if (t === 'gladiator') return 'G'; if (t === 'egg') return 'E'; if (t === 'ptero') return 'P'; }
  return '';
}
function drawBanner() {
  const W = hudCanvas.width, H = hudCanvas.height;
  panel(W * 0.18, H * 0.34, W * 0.64, H * 0.3, 18);
  for (let i = 0; i < bannerLines.length; i++) txt(bannerLines[i], W / 2, H * 0.43 + i * (H * 0.08), Math.round(H / (i === 0 ? 15 : 26)), i === 0 ? '#ffd23a' : '#7fd4ff');
}
function drawStartPrompt(now) {
  if (Math.floor(now / 400) % 2) return;
  txt(touch.active ? 'TAP FLAP TO START' : 'FLAP TO START', hudCanvas.width / 2, hudCanvas.height * 0.72, Math.round(hudCanvas.height / 22), '#aaffaa');
}
function drawClear() {
  const W = hudCanvas.width, H = hudCanvas.height;
  txt(PHRASES.nice, W / 2, H * 0.4, Math.round(H / 14), '#ffd23a');
  txt('WAVE ' + engine.wave + ' CLEARED', W / 2, H * 0.52, Math.round(H / 26), '#7fd4ff');
}
function drawKillCam() {
  const W = hudCanvas.width, H = hudCanvas.height;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(0, 0, W, H * 0.09); ctx.fillRect(0, H * 0.91, W, H * 0.09);
  txt('F I N A L   F L I G H T', W / 2, H * 0.055, Math.round(H / 34), '#ff9a9a');
}
function drawPause() {
  const W = hudCanvas.width, H = hudCanvas.height;
  dim();
  txt('PAUSED', W / 2, H * 0.42, Math.round(H / 12), '#ffd23a');
  txt('P / ESC  RESUME', W / 2, H * 0.56, Math.round(H / 26), '#7fd4ff');
  txt('Q  QUIT TO TITLE', W / 2, H * 0.62, Math.round(H / 26), '#7fd4ff');
  txt('HOLD ESC  RESTART WAVE (−1 LIFE)', W / 2, H * 0.68, Math.round(H / 30), '#c9c9d6');
}
function drawEscHold(now) {
  if (!escDownAt) return;
  const t = Math.min(1, (now - escDownAt) / 800); if (t < 0.12) return;
  const W = hudCanvas.width, cx = W / 2, y = hudCanvas.height * 0.1, u = hudCanvas.height / 720;
  panel(cx - 140 * u, y, 280 * u, 40 * u, 10 * u);
  ctx.fillStyle = '#333'; ctx.fillRect(cx - 116 * u, y + 24 * u, 232 * u, 7 * u);
  ctx.fillStyle = '#ff5555'; ctx.fillRect(cx - 116 * u, y + 24 * u, 232 * u * t, 7 * u);
  txt('HOLD ESC — RESTART WAVE (−1 LIFE)', cx, y + 12 * u, 12 * u, '#ffaaaa');
}
function drawHelp() {
  const W = hudCanvas.width, H = hudCanvas.height;
  txt('HOW TO PLAY', W / 2, H * 0.08, Math.round(H / 16), '#ffd23a');
  const lines = [
    'You ride a war-bird over a lava arena. TAP or HOLD FLAP to climb;',
    'release to glide. Momentum carries you — push the opposite way to brake.',
    'The arena wraps left ↔ right.',
    '',
    'JOUST: on contact the HIGHER LANCE wins and unseats the rider.',
    'Equal height = bounce. Always attack from above.',
    '',
    'Unseated enemies drop EGGS — collect for 250/500/750/1000',
    '(+500 mid-air). Left too long they HATCH into a tougher rider.',
    '',
    'BOUNDER 500 · HUNTER 750 · SHADOW LORD 1500',
    'PTERODACTYL 1000 — only a lance in its OPEN BEAK kills it!',
    'Near the lava, the TROLL grabs your mount — flap hard to escape.',
    '',
    'Extra mount every 20,000 · P pause · hold ESC restart (−1 life)',
  ];
  const fs = Math.round(H / 36);
  for (let i = 0; i < lines.length; i++) txt(lines[i], W / 2, H * 0.16 + i * (H * 0.047), fs, i === 0 ? '#fff' : '#c9d0e0', 'center', 600);
  txt('ENTER / ESC TO RETURN', W / 2, H * 0.95, Math.round(H / 30), '#7fd4ff');
}
function OPT_ROWS() {
  return [
    ['SFX VOLUME', () => Math.round(save.opts.sfx * 100) + '%', d => { save.opts.sfx = Math.max(0, Math.min(1, save.opts.sfx + d * 0.1)); audio.setSfx(save.opts.sfx); audio.play('flap'); }],
    ['MUSIC VOLUME', () => Math.round(save.opts.mus * 100) + '%', d => { save.opts.mus = Math.max(0, Math.min(1, save.opts.mus + d * 0.1)); audio.setMus(save.opts.mus); }],
    ['QUALITY', () => save.opts.quality.toUpperCase(), d => { const o = ['low', 'medium', 'high']; let i = (o.indexOf(save.opts.quality) + (d > 0 ? 1 : o.length - 1)) % o.length; save.opts.quality = o[i]; renderer.setQuality(o[i]); }],
    ['CAMERA SHAKE', () => save.opts.camShake ? 'ON' : 'OFF', () => save.opts.camShake = !save.opts.camShake],
    ['GAMEPAD RUMBLE', () => save.opts.rumble ? 'ON' : 'OFF', () => save.opts.rumble = !save.opts.rumble],
    ['DIFFICULTY', () => save.opts.difficulty.toUpperCase(), d => { const o = ['easy', 'normal', 'hard']; let i = (o.indexOf(save.opts.difficulty) + (d > 0 ? 1 : o.length - 1)) % o.length; save.opts.difficulty = o[i]; }],
    ['STARTING MOUNTS', () => '' + save.opts.lives, d => { save.opts.lives = Math.max(1, Math.min(9, save.opts.lives + d)); }],
    ['REMAP P1 FLAP', () => keyName(save.opts.keys.p1.flap), () => rebindTarget = { player: 'p1', action: 'flap' }],
    ['REMAP P2 FLAP', () => keyName(save.opts.keys.p2.flap), () => rebindTarget = { player: 'p2', action: 'flap' }],
    ['ALL WAVES (PASS:1234)', () => save.unlockAll ? 'UNLOCKED' : 'LOCKED', () => { promptUnlock(); }],
    ['RESET PROGRESS', () => '', () => { if (confirm('Reset progress, scores, achievements and options?')) { save.maxWave = 1; save.unlockAll = false; save.scores = []; save.hi = 0; save.feats = {}; save.stats = { games: 0, kills: 0, pteroKills: 0, eggs: 0, maxChain: 0, waves: 0, deaths: 0 }; persist(); flash('RESET'); } }],
  ];
}
function keyName(code) { return code.replace('Arrow', '').replace('Key', '').replace('Digit', '').toUpperCase(); }
function doRebind(code) { const t = rebindTarget; save.opts.keys[t.player][t.action] = code; rebindTarget = null; persist(); flash('BOUND ' + keyName(code)); }
function promptUnlock() { const p = prompt('Enter unlock password:'); if (p === '1234') { save.unlockAll = true; persist(); flash('ALL WAVES UNLOCKED'); } else if (p != null) flash('WRONG PASSWORD'); }
function drawOptions() {
  const W = hudCanvas.width, H = hudCanvas.height;
  txt('OPTIONS', W / 2, H * 0.08, Math.round(H / 15), '#ffd23a');
  const rows = OPT_ROWS(), y0 = H * 0.19, dy = H * 0.066;
  for (let i = 0; i < rows.length; i++) {
    const sel = i === optIdx, y = y0 + i * dy;
    if (sel) panel(W * 0.2, y - dy * 0.4, W * 0.6, dy * 0.8, 9);
    txt(rows[i][0], W * 0.24, y, Math.round(H / 30), sel ? '#ffe14d' : '#c9c9d6', 'left');
    txt(rows[i][1](), W * 0.76, y, Math.round(H / 30), sel ? '#fff' : '#8fa', 'right');
  }
  txt(rebindTarget ? 'PRESS A KEY…' : '← → CHANGE · ESC BACK', W / 2, H * 0.95, Math.round(H / 30), '#7fd4ff');
}
function drawWaveSelect() {
  const W = hudCanvas.width, H = hudCanvas.height;
  txt('WAVE SELECT', W / 2, H * 0.1, Math.round(H / 15), '#ffd23a');
  const maxW = save.unlockAll ? 99 : save.maxWave;
  const perPage = 25, cols = 5;
  const start = wsPage * perPage;
  txt('REACHED WAVE ' + save.maxWave + (save.unlockAll ? '  (ALL UNLOCKED)' : ''), W / 2, H * 0.18, Math.round(H / 32), '#7fd4ff');
  for (let i = 0; i < perPage; i++) {
    const n = start + i + 1; const r = (i / cols | 0), c = i % cols;
    const x = W * 0.2 + c * (W * 0.15), y = H * 0.28 + r * (H * 0.1);
    const unlocked = n <= maxW;
    const t = waveInfo(n).type[0].toUpperCase();
    txt(n + (t !== 'N' ? t : ''), x, y, Math.round(H / 28), unlocked ? '#ffe14d' : '#555');
  }
  txt('DIGITS/ARROWS PICK · TYPE WAVE# THEN ENTER · ESC BACK', W / 2, H * 0.92, Math.round(H / 34), '#7fd4ff');
  txt(wsInput ? 'GO TO WAVE: ' + wsInput : '', W / 2, H * 0.85, Math.round(H / 24), '#fff');
}
let wsInput = '';
function drawScores() {
  const W = hudCanvas.width, H = hudCanvas.height;
  txt(PHRASES.champions, W / 2, H * 0.09, Math.round(H / 16), '#ffd23a');
  txt('LOCAL', W * 0.27, H * 0.2, Math.round(H / 26), '#7fd4ff');
  txt('GLOBAL (MODERN)', W * 0.73, H * 0.2, Math.round(H / 26), '#39c06a');
  for (let i = 0; i < 10; i++) {
    const L = save.scores[i], y = H * 0.28 + i * H * 0.06;
    txt((i + 1) + '.', W * 0.1, y, Math.round(H / 32), '#888', 'left');
    if (L) { txt(L.initials, W * 0.16, y, Math.round(H / 30), '#fff', 'left'); txt(L.score.toLocaleString(), W * 0.44, y, Math.round(H / 30), '#ffe14d', 'right'); }
    const G = globalScores && globalScores[i];
    if (G) { txt((G.initials || '???'), W * 0.6, y, Math.round(H / 30), '#fff', 'left'); txt((G.score || 0).toLocaleString(), W * 0.9, y, Math.round(H / 30), '#8fdca0', 'right'); }
  }
  txt('ESC TO RETURN', W / 2, H * 0.95, Math.round(H / 30), '#7fd4ff');
}
function drawFeats() {
  const W = hudCanvas.width, H = hudCanvas.height;
  txt('ACHIEVEMENTS', W / 2, H * 0.08, Math.round(H / 16), '#ffd23a');
  const s = save.stats;
  txt(`GAMES ${s.games} · KILLS ${s.kills} · PTEROS ${s.pteroKills} · EGGS ${s.eggs} · BEST CHAIN x${s.maxChain} · WAVES ${s.waves}`,
    W / 2, H * 0.155, Math.round(H / 42), '#8a93a8', 'center', 600);
  const cols = 2, cw = W * 0.42, x0 = W * 0.06, y0 = H * 0.22, rh = H * 0.115;
  for (let i = 0; i < FEATS.length; i++) {
    const [id, name, desc] = FEATS[i];
    const c = i % cols, r = (i / cols) | 0;
    const x = x0 + c * (cw + W * 0.04), y = y0 + r * rh;
    const got = !!save.feats[id];
    panel(x, y, cw, rh * 0.82, 12);
    ctx.globalAlpha = got ? 1 : 0.45;
    txt(got ? '🏆' : '🔒', x + 26, y + rh * 0.4, Math.round(H / 30), got ? '#ffd23a' : '#666');
    txt(name, x + 52, y + rh * 0.27, Math.round(H / 36), got ? '#ffe14d' : '#9aa', 'left');
    txt(desc, x + 52, y + rh * 0.58, Math.round(H / 48), got ? '#c9d0e0' : '#778', 'left', 600);
    ctx.globalAlpha = 1;
  }
  txt('ESC TO RETURN', W / 2, H * 0.96, Math.round(H / 30), '#7fd4ff');
}
function drawHsEntry() {
  const W = hudCanvas.width, H = hudCanvas.height;
  txt(PHRASES.enterName, W / 2, H * 0.2, Math.round(H / 18), '#ffd23a');
  txt('SCORE ' + hsScore.toLocaleString() + '  ·  WAVE ' + hsWave, W / 2, H * 0.32, Math.round(H / 28), '#7fd4ff');
  for (let i = 0; i < 3; i++) {
    const x = W / 2 + (i - 1) * (H * 0.1);
    txt(hsInitials[i], x, H * 0.48, Math.round(H / 10), i === hsPos ? '#ffe14d' : '#fff');
    if (i === hsPos && Math.floor(performance.now() / 300) % 2) txt('_', x, H * 0.54, Math.round(H / 12), '#ffe14d');
  }
  txt('↑↓ LETTER · ←→ MOVE · ENTER OK', W / 2, H * 0.72, Math.round(H / 30), '#7fd4ff');
}
function drawGameOver() {
  const W = hudCanvas.width, H = hudCanvas.height;
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, H);
  txt(PHRASES.gameOver, W / 2, H * 0.36, Math.round(H / 12), '#ff5f5f');
  txt('SCORE ' + hsScore.toLocaleString(), W / 2, H * 0.5, Math.round(H / 22), '#ffe14d');
  txt('WAVE ' + hsWave, W / 2, H * 0.58, Math.round(H / 28), '#7fd4ff');
  if (Math.floor(performance.now() / 500) % 2) txt('PRESS ENTER', W / 2, H * 0.72, Math.round(H / 24), '#fff');
}

// ─── UI keys ───
function startFromTitle() { menuAction(menuIdx); }
function menuAction(i) {
  audio.init(); audio.resume();
  if (i === 0) { pendingMode = '1p'; startRun(1); }
  else if (i === 1) { pendingMode = '2p'; startRun(1); }
  else if (i === 2) state = 'help';
  else if (i === 3) { state = 'options'; optIdx = 0; }
  else if (i === 4) { state = 'waveselect'; wsInput = ''; }
  else if (i === 5) { state = 'scores'; fetchGlobal(); }
  else if (i === 6) state = 'feats';
}
function advanceScreen() { if (state === 'gameover' || state === 'help' || state === 'scores' || state === 'feats') backToTitle(); }
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
  const N = 7;
  if (state === 'title') {
    if (code === 'ArrowUp') { menuIdx = (menuIdx + N - 1) % N; audio.init(); audio.play('walk'); }
    if (code === 'ArrowDown') { menuIdx = (menuIdx + 1) % N; audio.init(); audio.play('walk'); }
    if (code === 'Enter' || code === 'Space') menuAction(menuIdx);
    if (code === 'KeyH') location.href = '../retro/';
  } else if (state === 'help' || state === 'feats') { if (code === 'Enter' || code === 'Escape') backToTitle(); }
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
    if (code === 'Enter' || code === 'Space') { if (state === 'intro') introTimer = 0; }
  }
}
function bumpInitial(d) { const c = (hsInitials.charCodeAt(hsPos) - 65 + d + 26) % 26; hsInitials = hsInitials.slice(0, hsPos) + String.fromCharCode(65 + c) + hsInitials.slice(hsPos + 1); }

// touch on menus
hudCanvas.addEventListener('pointerdown', e => {
  audio.init(); audio.resume();
  const c = evToCanvas(e), H = hudCanvas.height, W = hudCanvas.width;
  if (state === 'title') {
    const y0 = H * 0.42, dy = H * 0.066, idx = Math.round((c.y - y0) / dy);
    if (idx >= 0 && idx < 7) { menuIdx = idx; menuAction(idx); }
  } else if (state === 'help' || state === 'scores' || state === 'gameover' || state === 'feats') { backToTitle(); }
  else if (state === 'intro') { introTimer = 0; }
  else if (state === 'options') {
    const rows = OPT_ROWS(), y0 = H * 0.19, dy = H * 0.066, idx = Math.round((c.y - y0) / dy);
    if (idx >= 0 && idx < rows.length) { optIdx = idx; rows[idx][2](c.x < W * 0.4 ? -1 : 1); persist(); }
    else if (c.y > H * 0.9) backToTitle();
  } else if (state === 'waveselect') {
    if (c.y > H * 0.86) { backToTitle(); return; }
    const cols = 5, col = Math.floor((c.x - W * 0.2) / (W * 0.15)), row = Math.round((c.y - H * 0.28) / (H * 0.1));
    if (col >= 0 && col < cols && row >= 0) { const n = wsPage * 25 + row * cols + col + 1; const maxW = save.unlockAll ? 99 : save.maxWave; if (n >= 1 && n <= maxW) { pendingMode = '1p'; startRun(n); } }
  } else if (state === 'hsentry') {
    if (c.y > H * 0.65) { commitHs(); return; }
    if (c.x < W * 0.4) hsPos = Math.max(0, hsPos - 1); else if (c.x > W * 0.6) hsPos = Math.min(2, hsPos + 1); else bumpInitial(c.y < H * 0.45 ? 1 : -1);
  }
});

// boot
setupTouch();
startAttract();
document.addEventListener('pointerdown', () => { audio.init(); if (state === 'title') audio.startMusic(); }, { once: true });
document.addEventListener('keydown', () => { audio.init(); if (state === 'title') audio.startMusic(); }, { once: true });
const boot = document.getElementById('boot'); if (boot) boot.style.display = 'none';
requestAnimationFrame(frame);

// QA hook (same API as retro so the shared tools drive both)
window.__joustQA = {
  bot: false,
  engine: () => engine, state: () => state, wave: () => engine && engine.wave,
  start: (wv, m) => { pendingMode = m || '1p'; startRun(wv || 1); engine.started = true; state = 'playing'; },
  playReal: (wv, m) => { pendingMode = m || '1p'; startRun(wv || 1); introTimer = 1; window.__joustQA.bot = true; },
  tick: (n, inp) => { for (let i = 0; i < (n || 1); i++) { const s = engine.tick(inp || readInputs()); processEvents(s.events); } return engine.snapshot(); },
  setState: s => state = s, snapshot: () => engine && engine.snapshot(), version: VERSION,
  renderer: () => renderer, modern: true,
};
