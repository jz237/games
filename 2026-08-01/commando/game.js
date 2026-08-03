// Commando HD — engine core. All feel constants come from COMMANDO-PARITY.md
// measurements of the user's own disk. Logic runs at PAL 50Hz fixed timestep.
(() => {
'use strict';

// ---------- measured constants (parity ledger) ----------
const LOGIC_HZ = 50;
const VIEW_W = 274, VIEW_H = 224;      // logical playfield (lores px)
const SPEED_H = 2.0, SPEED_V = 1.0;    // px/frame — LOCKED it14
const TURN_DELAY = 10;                 // frames when reversing facing — it14
const START_LATENCY = 2;               // frames from standstill — it14
const BULLET_SPEED = 3.5;              // px/frame upward-dominant — it11-16
const FIRE_MIN_INTERVAL = 10;          // frames between shots — it13/15 spec
const MAX_BULLETS = 3;
const ENEMY_WALK = 1.3;                // px/frame — it13 (charge speed)
// it42 disk observation (idle-Joe filmstrip, enemy-watch.mjs): soldiers enter
// from a screen EDGE at a fixed y and run straight across at ~0.9-1.0 px/f,
// then turn and home in only once they get near Joe. No straight-line enemy
// bullets were seen in 360 frames — the ranged threat is ARCING grenades.
const TRAVERSE_SPEED = 0.95;
const WAVE_INTERVAL = 150;             // frames between edge waves (unmeasured)
// Ranged-combat model — a DELIBERATE DEPARTURE from the disk (which charges).
// The user asked for soldiers that shoot, walk and dodge instead of ramming.
const ENGAGE_RANGE = 108;              // start fighting rather than crossing
const HOLD_RANGE = 62;                 // preferred firing distance
const ENEMY_BULLET_SPEED = 1.9;        // slower than Joe's 3.5 so it can be read
const ENEMY_SHOT_CD = 78;
// Dodge tuning — kept deliberately mean so soldiers stay killable: they only
// react to a round already on target, need room to react (so point-blank shots
// always land), and only flinch about half the time.
const DODGE_MIN_LEAD = 16;             // closer than this and he cannot react
const DODGE_MAX_LEAD = 46;
const DODGE_HIT_WIDTH = 8;             // only dodge rounds that would connect
const DODGE_CHANCE = 55;               // percent
const DODGE_COOLDOWN = 210;
// New unit types (it44). Motorcycles race across on a line and are lethal on
// contact; mortar crews are dug in and drop shells on the player's position.
const MOTO_SPEED = 2.6;
const MORTAR_INTERVAL = 210;
const MORTAR_FLIGHT = 78;
const PICKUP_DROP_CHANCE = 22;        // percent of infantry that drop supplies
const LOB_SPEED = 2.0;                 // px/frame horizontal drift — it12
const SCROLL_LINE = 100;               // Joe screen-y that pushes the camera north
// sprite render heights: 274 logical px = 26 m (plate scale), so a 1.8 m
// soldier is ~19 logical px tall — matched to the painted set dressing
const HERO_H = 19, ENEMY_H = 18;
const WALK_STRIDE = 4.5;               // logical px travelled per run frame
// hero-act sheet: 0 fire standing, 1 fire crouched, 2 duck, 3 grenade throw
// hero-die / rif-die sheets: 0 hit, 1 buckling, 2 falling, 3 dead
const ACT_FIRE = 0, ACT_CROUCH_FIRE = 1, ACT_DUCK = 2, ACT_THROW = 3;
// rif-act sheet: 0 firing, 1 ducking, 2 popping up, 3 staggering
const RIF_FIRE = 0, RIF_DUCK = 1, RIF_POP = 2, RIF_STAGGER = 3;
const FIRE_POSE_FRAMES = 9;            // how long the firing stance is held
const THROW_POSE_FRAMES = 14;
const DEATH_FRAMES = 96;               // full collapse, then the body lingers
const LIVES_START = 4;                 // HUD observation
const START_AMMO = 120;                // rifle rounds; pickups top this up
const KILL_POINTS = 100;
const POW_POINTS = 500;                // rescuing a prisoner

// ---------- setup ----------
const qa = new URLSearchParams(location.search).has('qa');
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const S = 4; // render scale: logic in lores units, painterly art drawn at 4x
function fit() {
  const cssScale = Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H);
  canvas.width = VIEW_W * S; canvas.height = VIEW_H * S;
  canvas.style.width = Math.floor(VIEW_W * cssScale) + 'px';
  canvas.style.height = Math.floor(VIEW_H * cssScale) + 'px';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
}
addEventListener('resize', fit); fit();

// painted terrain plates: full-scene art-directed sections layered over the
// baked ground (dense set dressing painted in; engine draws only moving things
// on top). Props inside a plate's range are painted, not engine-drawn.
// NORTH -> SOUTH order: plates are drawn in this order and each carries a baked
// alpha ramp on its top edge, so neighbours crossfade across their 31px overlap
// instead of hard-cutting. All plates are painted to one metric scale
// (274 logical px = 26 metres), so object sizes match across seams.
let PLATES = [];
// Build the plate list for an area and bind each one's walkability mask.
function loadPlates(area) {
  PLATES = (area.plates || []).map(p => ({ ...p, img: null, mask: null }));
  const M = window.PLATE_MASKS || {};
  for (const p of PLATES) {
    const im = new Image();
    im.src = p.src;
    im.onload = () => { p.img = im; };
    const m = M[p.name];
    if (!m) continue;
    const grid = new Uint8Array(m.w * m.h);
    for (let my = 0; my < m.h; my++) {
      const row = m.rows[my];
      for (let ci = 0; ci < row.length; ci++) {
        const nib = parseInt(row[ci], 16);
        for (let k = 0; k < 4; k++) { const mx = ci * 4 + k; if (mx < m.w && (nib >> k & 1)) grid[my * m.w + mx] = 1; }
      }
    }
    p.mask = { cell: m.cell, w: m.w, h: m.h, y0: m.y0, y1: m.y1, grid };
  }
}
function plateAt(y) { for (const p of PLATES) if (y >= p.y0 && y < p.y1 && p.img) return p; return null; }
function maskRange(y) { for (const p of PLATES) if (p.mask && y >= p.mask.y0 && y < p.mask.y1) return p.mask; return null; }
// plate ranges overlap at seams — a point is blocked if ANY covering plate says so
function maskBlocked(px, py) {
  // a destroyed prop clears the painted obstruction it stood on
  if (G.props) for (const p of G.props) {
    if (p.dead && Math.hypot(px - p.x, py - p.y) < p.r) return false;
  }
  let covered = false;
  for (const p of PLATES) {
    const mk = p.mask;
    if (!mk || py < mk.y0 || py >= mk.y1) continue;
    covered = true;
    const mx = (px / mk.cell) | 0, my = ((py - mk.y0) / mk.cell) | 0;
    if (mx < 0 || my < 0 || mx >= mk.w || my >= mk.h) continue;
    if (mk.grid[my * mk.w + mx] === 1) return true;
  }
  return covered ? false : false;
}

// painterly assets (graceful fallback to placeholder shapes until loaded)
const IMGS = {};
let groundSlices = null; // [{y0}, canvas] pair-list: full-res bake, sliced to stay under mobile canvas limits
const BAKE_S = S;        // bake at output resolution — 1:1 blit, zero scaling smudge
const SLICES = 2;
const SPRITE_SETS = ['hero-n', 'hero-s', 'hero-e', 'hero-act', 'hero-die', 'rif-s', 'rif-n', 'rif-e', 'rif-act', 'rif-die', 'rif-die2', 'moto',
  'off-s', 'off-e', 'off-n', 'off-act', 'lob-s', 'lob-act', 'mortar'];
const SPRITE_NAMES = ['sprites/hero', 'sprites/rifleman', 'sprites/officer', 'sprites/lobber',
  'ui/portrait', 'ui/rifle', 'ui/keyart.webp', 'tiles/sand', 'tiles/grass',
  'props/palm', 'props/boulder', 'props/pond', 'props/trench', 'props/gate', 'props/wreck',
  'props/obj-0', 'props/obj-1', 'props/obj-2', 'props/obj-3'];
for (const set of SPRITE_SETS) for (let i = 0; i < 4; i++) SPRITE_NAMES.push(`sprites/${set}-${i}`);
for (const name of SPRITE_NAMES) {
  const img = new Image();
  // names may carry an explicit extension (WebP for the big key art)
  img.src = 'assets/' + (name.includes('.') ? name : name + '.png');
  img.onload = () => { IMGS[name] = img; if (IMGS['tiles/sand'] && IMGS['tiles/grass'] && !groundSlices) bakeGround(); };
}

// one-time ground composition: sand base; jungle zones get a grass layer with
// soft-edged winding sand paths punched through (the original's composition).
// Baked at FULL output resolution in vertical slices (mobile canvas caps);
// every slice paints the same absolute-coordinate content with the same seeds,
// so the cut line is pixel-identical and invisible.
function bakeGround() {
  const W = A.width * BAKE_S, H = A.height * BAKE_S;
  const SH = Math.ceil(H / SLICES);
  const T = 64 * BAKE_S; // 256px tile drawn 1:1 at S=4 — the crispness limit of the source
  // seam concealment: crisp plain-grid tiling, then organic radial-masked
  // patches sampled 1:1 from random tile regions stamped ALONG the grid lines
  // only — hides every seam without blurring the field or mirror butterflies
  const seamSplat = (c2, img, y0, y1, seedBase) => {
    const R = 30 * BAKE_S; // sample window 2R=240 must stay inside the 256px tile
    const m = document.createElement('canvas'); m.width = m.height = R * 2;
    const mc = m.getContext('2d');
    let h = seedBase >>> 0;
    const rnd = () => { h = (h * 1103515245 + 12345) >>> 0; return (h >>> 9) / 8388608; };
    const stampAt = (cx, cy) => {
      const jx = cx + (rnd() - 0.5) * R, jy = cy + (rnd() - 0.5) * R;
      const sx = rnd() * (img.width - R * 2), sy = rnd() * (img.height - R * 2);
      mc.clearRect(0, 0, R * 2, R * 2);
      const grd = mc.createRadialGradient(R, R, R * 0.35, R, R, R * 0.98);
      grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      mc.fillStyle = grd; mc.fillRect(0, 0, R * 2, R * 2);
      mc.globalCompositeOperation = 'source-in';
      mc.drawImage(img, sx, sy, R * 2, R * 2, 0, 0, R * 2, R * 2);
      mc.globalCompositeOperation = 'source-over';
      c2.drawImage(m, jx - R, jy - R);
    };
    for (let x = T; x < W; x += T) for (let y = y0 - R; y < y1 + R; y += R * 0.55) stampAt(x, y);
    for (let y = Math.ceil(y0 / T) * T; y < y1; y += T) for (let x = -R; x < W + R; x += R * 0.55) stampAt(x, y);
  };

  groundSlices = [];
  for (let si = 0; si < SLICES; si++) {
    const sy0 = si * SH, sh = Math.min(SH, H - sy0);
    const g = document.createElement('canvas'); g.width = W; g.height = sh;
    const gc = g.getContext('2d');
    gc.save(); gc.translate(0, -sy0); // absolute coords; canvas bounds clip the rest

    for (let y = Math.floor(sy0 / T) * T; y < sy0 + sh; y += T) for (let x = 0; x < W; x += T) gc.drawImage(IMGS['tiles/sand'], x, y, T, T);
    seamSplat(gc, IMGS['tiles/sand'], 0, H, 0xBEEF01);

    // grass layer restricted to jungle/scrub zones (slice-local layer canvas,
    // same absolute painting -> destination-out paths only erase grass)
    const gl = document.createElement('canvas'); gl.width = W; gl.height = sh;
    const glc = gl.getContext('2d');
    glc.save(); glc.translate(0, -sy0);
    for (const z of (A.zones || [])) {
      if (!/jungle|scrub/.test(z.kind)) continue;
      const y0 = z.y0 * BAKE_S, y1 = z.y1 * BAKE_S;
      glc.save(); glc.beginPath(); glc.rect(0, y0, W, y1 - y0); glc.clip();
      for (let y = Math.floor(y0 / T) * T; y < y1; y += T) for (let x = 0; x < W; x += T) glc.drawImage(IMGS['tiles/grass'], x, y, T, T);
      seamSplat(glc, IMGS['tiles/grass'], y0, y1, 0xF00D00 + z.y0);
      glc.restore();
      // winding sand path punched through the grass: smoothed polyline stroke
      // (hard core + soft shoulders) — disc-chain stamps left scalloped rims
      glc.globalCompositeOperation = 'destination-out';
      let px = 137, h = (z.y0 * 2654435761) >>> 0;
      const pts = [];
      for (let wy = z.y1; wy > z.y0; wy -= 20) {
        h = (h * 1103515245 + 12345) >>> 0;
        px += ((h >>> 8) % 41) - 20;
        px = Math.max(40, Math.min(234, px));
        pts.push([px * BAKE_S, wy * BAKE_S]);
      }
      if (pts.length > 1) {
        glc.lineCap = 'round'; glc.lineJoin = 'round';
        for (const [wMul, alpha] of [[2.0, 0.1], [1.75, 0.14], [1.5, 0.2], [1.28, 0.3], [1.12, 0.45], [1.0, 1.0]]) {
          glc.strokeStyle = `rgba(0,0,0,${alpha})`;
          glc.lineWidth = 44 * BAKE_S * wMul;
          glc.beginPath();
          glc.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) {
            const mx = (pts[i - 1][0] + pts[i][0]) / 2, my = (pts[i - 1][1] + pts[i][1]) / 2;
            glc.quadraticCurveTo(pts[i - 1][0], pts[i - 1][1], mx, my);
          }
          glc.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
          glc.stroke();
        }
      }
      // a few open clearings
      for (let i = 0; i < 6; i++) {
        h = (h * 1103515245 + 12345) >>> 0;
        const cx = 20 + ((h >>> 7) % 234), cyw = z.y0 + ((h >>> 15) % Math.max(1, z.y1 - z.y0));
        const r = (20 + ((h >>> 22) % 22)) * BAKE_S;
        const grd = glc.createRadialGradient(cx * BAKE_S, cyw * BAKE_S, 0, cx * BAKE_S, cyw * BAKE_S, r);
        grd.addColorStop(0, 'rgba(0,0,0,0.95)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        glc.fillStyle = grd;
        glc.beginPath(); glc.arc(cx * BAKE_S, cyw * BAKE_S, r, 0, 7); glc.fill();
      }
      // feather the zone's top/bottom edges into the sand (hard straight zone
      // rects read as ruled lines at full-res crispness)
      const F = 14 * BAKE_S;
      let fg = glc.createLinearGradient(0, y0, 0, y0 + F);
      fg.addColorStop(0, 'rgba(0,0,0,0.92)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
      glc.fillStyle = fg; glc.fillRect(0, y0, W, F);
      fg = glc.createLinearGradient(0, y1 - F, 0, y1);
      fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(0,0,0,0.92)');
      glc.fillStyle = fg; glc.fillRect(0, y1 - F, W, F);
      glc.globalCompositeOperation = 'source-over';
    }
    glc.restore();
    gc.drawImage(gl, 0, sy0); // gc is translated by -sy0 -> lands at slice-local 0
    gc.restore();
    groundSlices.push({ y0: sy0, h: sh, canvas: g });
  }
}

// ---------- settings (persisted) ----------
const SETTINGS_KEY = 'commandoHD.settings';
const SETTINGS_DEFAULTS = {
  musicVol: 0.55, sfxVol: 0.8,
  shake: 1.0, flash: 0.6,      // photosensitivity-safe flash default
  autoFire: false,             // keyboard hold-to-fire (touch always auto-fires at the cap)
  leftHand: false,
  retro: false, scanlines: true,
  mode: 'normal',              // normal (checkpoints+continues) | arcade (original rules)
  keys: { fire: 'KeyZ', grenade: 'KeyX', pause: 'Space' },
};
const Settings = (() => {
  const s = JSON.parse(JSON.stringify(SETTINGS_DEFAULTS));
  try {
    const j = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (j && typeof j === 'object') { Object.assign(s, j); s.keys = Object.assign({}, SETTINGS_DEFAULTS.keys, j.keys || {}); }
  } catch (e) {}
  return s;
})();
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(Settings)); } catch (e) {} }
function applySettings() {
  if (window.Sfx) Sfx.volume = Settings.sfxVol;
  if (window.Music && Music.setVolume) Music.setVolume(Settings.musicVol);
  saveSettings();
}

// deterministic RNG under ?qa=1
let seed = qa ? 0x1234567 : (Date.now() & 0xffffff);
function rng() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }

// ---------- input ----------
const keys = {};
const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', KeyM: 'music', Escape: 'menu' };
function actionFor(code) {
  if (code === Settings.keys.fire) return 'fire';
  if (code === Settings.keys.grenade) return 'grenade';
  if (code === Settings.keys.pause) return 'pause';
  return KEYMAP[code];
}
let musicStarted = false;
function ensureMusic() {
  if (!musicStarted && window.Music) {
    musicStarted = true;
    Music.init().then(() => { Music.setVolume(Settings.musicVol); if (Music.currentCue) Music.play(Music.currentCue); else Music.play('main'); });
    if (window.Sfx) { Sfx.init(); Sfx.volume = Settings.sfxVol; }
  }
}
addEventListener('keydown', e => {
  // key-remap capture (settings panel)
  if (G && G.remap) {
    if (e.code !== 'Escape') { Settings.keys[G.remap] = e.code; applySettings(); }
    G.remap = null; e.preventDefault(); return;
  }
  const k = actionFor(e.code);
  if (k) {
    ensureMusic();
    if (k === 'music') { if (window.Music) Music.toggle(); }
    else keys[k] = true;
    e.preventDefault();
  }
});
addEventListener('keyup', e => { const k = actionFor(e.code); if (k) { keys[k] = false; e.preventDefault(); } });
// twin-zone touch UI: left half = floating 8-way stick, right half = fire zone
// (hold to auto-fire at the measured min interval — same cadence cap as the
// original), discrete grenade button, music toggle on the HUD ♪ corner.
const GREN_BTN = { x: VIEW_W - 24, y: VIEW_H - 78, r: 13 };
const FIRE_BTN = { x: VIEW_W - 38, y: VIEW_H - 34, r: 22 }; // visual hint; whole right half fires
const touchUI = { stick: null, fireIds: new Set(), grenIds: new Set(), seen: false, dir: { x: 0, y: 0 }, fire: false, gren: false };
function touchLogical(t, r) { return { x: (t.clientX - r.left) / r.width * VIEW_W, y: (t.clientY - r.top) / r.height * VIEW_H }; }
function onTouch(e) {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  touchUI.seen = true;
  const live = new Set();
  for (const t of e.touches) live.add(t.identifier);
  if (touchUI.stick && !live.has(touchUI.stick.id)) touchUI.stick = null;
  for (const id of [...touchUI.fireIds]) if (!live.has(id)) touchUI.fireIds.delete(id);
  for (const id of [...touchUI.grenIds]) if (!live.has(id)) touchUI.grenIds.delete(id);
  if (e.type === 'touchstart') {
    for (const t of e.changedTouches) {
      const p = touchLogical(t, r);
      if (p.x > VIEW_W - 60 && p.y < 16) { if (window.Music) Music.toggle(); continue; }
      if (p.x < 60 && p.y < 16 && (G.state === 'title' || (G.state === 'play' && G.paused))) { openSettings(); continue; }
      const gx = Settings.leftHand ? VIEW_W - GREN_BTN.x : GREN_BTN.x;
      if (Math.hypot(p.x - gx, p.y - GREN_BTN.y) < GREN_BTN.r + 5) { touchUI.grenIds.add(t.identifier); continue; }
      const inStickHalf = Settings.leftHand ? p.x >= VIEW_W * 0.5 : p.x < VIEW_W * 0.5;
      if (inStickHalf) { if (!touchUI.stick) touchUI.stick = { id: t.identifier, ox: p.x, oy: p.y, cx: p.x, cy: p.y }; }
      else touchUI.fireIds.add(t.identifier);
    }
  }
  for (const t of e.touches) {
    if (touchUI.stick && t.identifier === touchUI.stick.id) { const p = touchLogical(t, r); touchUI.stick.cx = p.x; touchUI.stick.cy = p.y; }
  }
  let dx = 0, dy = 0;
  const st = touchUI.stick;
  if (st) {
    const ox = st.cx - st.ox, oy = st.cy - st.oy;
    if (Math.hypot(ox, oy) > 6) { // deadzone, then 8-way quantize (45° sectors)
      if (Math.abs(ox) > Math.abs(oy) * 0.4142) dx = Math.sign(ox);
      if (Math.abs(oy) > Math.abs(ox) * 0.4142) dy = Math.sign(oy);
    }
  }
  touchUI.dir = { x: dx, y: dy };
  touchUI.fire = touchUI.fireIds.size > 0;
  touchUI.gren = touchUI.grenIds.size > 0;
}
canvas.addEventListener('touchstart', e => { ensureMusic(); onTouch(e); }, { passive: false });
canvas.addEventListener('touchmove', onTouch, { passive: false });
canvas.addEventListener('touchend', onTouch, { passive: false });
canvas.addEventListener('touchcancel', onTouch, { passive: false });
// gamepad (standard mapping: stick/dpad move, A/R2 fire, B/R1 grenade, Start pause)
const gp = { dx: 0, dy: 0, fire: false, gren: false, pause: false };
function pollGamepad() {
  gp.dx = 0; gp.dy = 0; gp.fire = false; gp.gren = false; gp.pause = false;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let p = null;
  for (const c of pads) if (c && c.connected) { p = c; break; }
  if (!p) return;
  const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
  if (Math.abs(ax) > 0.4) gp.dx = Math.sign(ax);
  if (Math.abs(ay) > 0.4) gp.dy = Math.sign(ay);
  const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
  if (b(14)) gp.dx = -1; if (b(15)) gp.dx = 1;
  if (b(12)) gp.dy = -1; if (b(13)) gp.dy = 1;
  gp.fire = b(0) || b(7);
  gp.gren = b(1) || b(5);
  gp.pause = b(9);
}
function inputDir() {
  let dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  let dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  if (!dx && !dy) { dx = touchUI.dir.x; dy = touchUI.dir.y; }
  if (!dx && !dy) { dx = gp.dx; dy = gp.dy; }
  return { dx, dy };
}

// ---------- hiscores (disk truth: "RANKING BEST SEVEN", long names) ----------
const DEFAULT_SCORES = [['NEIL', 100000], ['LIZZIE', 80000], ['STEVE', 50000],
  ['IAN', 40000], ['PAUL', 30000], ['WINCO', 20000], ['COMMANDO', 10000]];
let scoreMode = Settings.mode; // separate BEST SEVEN per mode
function loadScores() {
  try {
    const s = JSON.parse(localStorage.getItem('commandoHD.scores.' + scoreMode));
    if (Array.isArray(s) && s.length === 7) return s;
  } catch (e) {}
  return DEFAULT_SCORES.map(a => a.slice());
}
function saveScores(t) { try { localStorage.setItem('commandoHD.scores.' + scoreMode, JSON.stringify(t)); } catch (e) {} }

// Destructible props — placed over fuel drums and crate stacks that are painted
// into the plates. Shooting or blasting one detonates it: the painted object is
// covered by a wreck decal, its collision is lifted, nearby enemies die and the
// blast can chain to neighbouring props (and hurt Joe — they're live ordnance).
const DESTRUCTIBLE_DEFS = [
  { x: 86, y: 1668, r: 15, kind: 'fuel' },   // LZ burning drum stack
  { x: 240, y: 1663, r: 13, kind: 'fuel' },  // LZ barrels, east verge
  { x: 200, y: 1734, r: 15, kind: 'crate' }, // LZ crates + barrels, south east
  { x: 191, y: 1612, r: 14, kind: 'crate' }, // LZ crates beside the hut
  { x: 193, y: 1365, r: 14, kind: 'crate' }, // jungle ammunition crates
  { x: 57, y: 741, r: 20, kind: 'fuel' },    // trench supply dump
  { x: 217, y: 650, r: 18, kind: 'fuel' },   // trench burning truck
  { x: 227, y: 103, r: 16, kind: 'fuel' },   // fortress staff car
];
const BLAST_R = 30;                        // kill radius of a prop detonation

// ---------- world state ----------
// Areas are swappable data: each supplies its own dimensions, spawn table,
// prisoners and painted plate list. `A` points at the one being played.
const AREAS = window.AREAS || [window.AREA1];
let A = AREAS[0];
// arcade loop: past the last area the campaign restarts, harder each time
function areaData(n) { return AREAS[((Math.max(1, n) - 1) % AREAS.length + AREAS.length) % AREAS.length]; }
loadPlates(A);   // bind area 1's plates and masks at boot
const urlTitle = new URLSearchParams(location.search).has('title');
const urlMaskDebug = new URLSearchParams(location.search).has('mask');
const G = {
  // title | ranking | credits | intro | ready | play | dead | clear | gameover | entry | continue | settings
  state: (qa && !urlTitle) ? 'intro' : 'title',
  stateTimer: (qa && !urlTitle) ? 40 : 300,
  score: 0, top: loadScores()[0][1], lives: LIVES_START, grenades: 3, ammo: START_AMMO,
  area: 1, tally: 0, entry: null, lastEntry: null, paused: false, postGame: false,
  settingsSel: 0, settingsFrom: 'title', remap: null, cp: 1616, continues: 0,
  frame: 0, wt: 0,
  camY: A.height - VIEW_H,  // camera top in world coords
  joe: { x: A.spawn.x, y: A.spawn.y, face: { x: 0, y: -1 }, turn: 0, latency: 0, fireCd: 0, firePrev: false, grenCd: 0, grenPrev: false, invuln: 0, alive: true, walk: 0, walkDist: 0, moving: false, fireT: 0, throwT: 0, recoil: 0, duck: false, deathT: 0 },
  bullets: [], ebullets: [], lobs: [], nades: [], shells: [], pickups: [], enemies: [], corpses: [], fx: [], parts: [],
  pows: (A.pows || []).map(p => ({ ...p, freed: false, dead: false, t: 0 })), rescued: 0,
  spawned: new Set(), shake: 0, scorch: [], flashT: 0,
  props: DESTRUCTIBLE_DEFS.map(d => ({ ...d, dead: false, fuse: 0, burn: 0 })),
};
// painted fire locations (world coords, from the plates) that get live glow + smoke
const FIRES = [
  { x: 85, y: 1661, r: 22 },  // LZ burning drum
  { x: 234, y: 645, r: 32 },  // trench burning truck
];
// visual-only RNG — separate stream so gameplay determinism is untouched
let vseed = 0x9E3779B9;
function vrng() { vseed |= 0; vseed = vseed + 0x6D2B79F5 | 0; let t = Math.imul(vseed ^ vseed >>> 15, 1 | vseed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
function spawnPart(p) { if (G.parts.length > 130) G.parts.shift(); G.parts.push(p); }
function updateParticles() {
  // painted fires breathe: smoke puffs + embers while on screen
  for (const f of FIRES) {
    if (f.y < G.camY - 40 || f.y > G.camY + VIEW_H + 40) continue;
    if (G.frame % 7 === 0) spawnPart({ kind: 'smoke', x: f.x + (vrng() - 0.5) * 6, y: f.y - 4, vx: 0.06 + vrng() * 0.08, vy: -0.22 - vrng() * 0.12, t: 0, ttl: 80 + vrng() * 30, size: 2.5 + vrng() * 2 });
    if (G.frame % 11 === 0) spawnPart({ kind: 'ember', x: f.x + (vrng() - 0.5) * 5, y: f.y - 3, vx: (vrng() - 0.5) * 0.3, vy: -0.5 - vrng() * 0.4, t: 0, ttl: 22 + vrng() * 14, size: 0.8 });
  }
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i];
    p.x += p.vx; p.y += p.vy; p.t++;
    if (p.kind === 'smoke') { p.size += 0.06; p.vx += 0.004; }
    else if (p.kind === 'casing' || p.kind === 'chunk') { p.vy += 0.09; if (p.vy > 0 && p.y >= p.ground) { p.vy = 0; p.vx *= 0.6; } }
    else if (p.kind === 'spark') { p.vy += 0.03; }
    if (p.t >= p.ttl) G.parts.splice(i, 1);
  }
}
const CLEAR_BONUS = 500; // tally value — original ceremony still uncaptured; approximation
const OFFICER_BONUS = 1000; // bounty for dropping the fleeing garrison commander
const POW_CLEAR_BONUS = 300; // per prisoner brought out alive
const ENTRY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789. ';
// continue checkpoints (camY values): area start, mid-jungle, trench/bridge
const CHECKPOINTS = [1616, 1050, 500]; // Area 1; areas may override via data

// settings panel model
const SETTINGS_ITEMS = [
  { k: 'musicVol', label: 'MUSIC VOLUME', type: 'pct' },
  { k: 'sfxVol', label: 'SFX VOLUME', type: 'pct' },
  { k: 'shake', label: 'SCREEN SHAKE', type: 'pct' },
  { k: 'flash', label: 'FLASH FX', type: 'pct' },
  { k: 'autoFire', label: 'AUTO-FIRE (KEYS)', type: 'bool' },
  { k: 'leftHand', label: 'LEFT-HANDED TOUCH', type: 'bool' },
  { k: 'retro', label: 'RETRO FILTER', type: 'bool' },
  { k: 'scanlines', label: 'SCANLINES', type: 'bool' },
  { k: 'mode', label: 'GAME MODE', type: 'mode' },
  { k: 'track', label: 'MUSIC TRACK', type: 'track' },
  { k: 'fire', label: 'FIRE KEY', type: 'key' },
  { k: 'grenade', label: 'GRENADE KEY', type: 'key' },
  { k: 'pause', label: 'PAUSE KEY', type: 'key' },
  { label: 'BACK', type: 'back' },
];
function openSettings() {
  G.settingsFrom = (G.state === 'play' && G.paused) ? 'pause' : 'title';
  G.settingsSel = 0; G.remap = null;
  setState('settings', 0);
}
function closeSettings() {
  saveSettings();
  if (G.settingsFrom === 'pause') { G.state = 'play'; /* stays paused */ }
  else setState('title', 300);
}
function adjustSetting(item, dir, activate) {
  if (item.type === 'pct') {
    Settings[item.k] = Math.max(0, Math.min(1, Math.round((Settings[item.k] + dir * 0.1) * 10) / 10));
    applySettings();
    if (item.k === 'sfxVol' && dir && window.Sfx) Sfx.play('shot', { gain: 0.7 }); // audible preview
  } else if (item.type === 'bool') {
    if (dir || activate) { Settings[item.k] = !Settings[item.k]; applySettings(); }
  } else if (item.type === 'mode') {
    if (dir || activate) {
      Settings.mode = Settings.mode === 'normal' ? 'arcade' : 'normal';
      scoreMode = Settings.mode; G.top = loadScores()[0][1];
      applySettings();
    }
  } else if (item.type === 'track') {
    if ((dir || activate) && window.Music) Music.toggle();
  } else if (item.type === 'key') {
    if (activate) G.remap = item.k;
  } else if (item.type === 'back') {
    if (activate) closeSettings();
  }
}

// ui-edge tracker (attract navigation, name entry, pause — separate from the
// in-play fire logic which keeps its own measured one-shot semantics)
const uiPrev = { fire: false, up: false, down: false, left: false, right: false, pause: false, menu: false };
function uiEdges() {
  const now = {
    fire: !!(keys.fire || touchUI.fire || gp.fire), up: !!(keys.up || touchUI.dir.y < 0 || gp.dy < 0),
    down: !!(keys.down || touchUI.dir.y > 0 || gp.dy > 0), left: !!(keys.left || touchUI.dir.x < 0 || gp.dx < 0),
    right: !!(keys.right || touchUI.dir.x > 0 || gp.dx > 0), pause: !!(keys.pause || gp.pause), menu: !!keys.menu,
  };
  const e = {};
  for (const k in now) e[k] = now[k] && !uiPrev[k];
  return { now, e };
}

function cueFor(s) {
  if (s === 'clear') return 'clear';
  if (s === 'gameover') return 'gameover';
  if (s === 'entry') return 'hiscore';
  if (s === 'ranking') return G.postGame ? 'hiscore' : 'main';
  if (s === 'title' || s === 'credits' || s === 'intro') return 'main';
  return null;
}
function setState(s, t) {
  G.state = s; G.stateTimer = t;
  const cue = cueFor(s);
  if (cue && window.Music && Music.currentCue !== cue) Music.play(cue);
}
function resetWorld() {
  Object.assign(G, { camY: A.height - VIEW_H, bullets: [], ebullets: [], lobs: [], nades: [], shells: [], pickups: [], enemies: [], corpses: [], fx: [], parts: [],
    pows: (A.pows || []).map(p => ({ ...p, freed: false, dead: false, t: 0 })), spawned: new Set(), shake: 0, tally: 0, cp: CHECKPOINTS[0], lastWave: 0, scorch: [], flashT: 0, finale: null,
    props: DESTRUCTIBLE_DEFS.map(d => ({ ...d, dead: false, fuse: 0, burn: 0 })) });
  G.pows = (A.pows || []).map(p => ({ ...p, freed: false, dead: false, t: 0 }));
  Object.assign(G.joe, { x: A.spawn.x, y: A.spawn.y, alive: true, face: { x: 0, y: -1 }, turn: 0, latency: 0, fireCd: 0, grenCd: 0, invuln: 0, walk: 0, walkDist: 0 });
}
function startGame() {
  G.score = 0; G.lives = LIVES_START; G.grenades = 3; G.ammo = START_AMMO; G.area = 1; G.postGame = false; G.paused = false; G.continues = 0; G.rescued = 0;
  applyArea(1);
  resetWorld();
  setState('intro', 130);
}
function nextArea() {
  G.area++; G.rescued = 0; G.ammo = Math.max(G.ammo, START_AMMO);
  applyArea(G.area);
  resetWorld(); setState('intro', 130);
}
// point the engine at an area's data and art
function applyArea(n) {
  A = areaData(n);
  loadPlates(A);
  groundSlices = null;
  if (IMGS['tiles/sand'] && IMGS['tiles/grass']) bakeGround();
}
// continue (normal mode): resume from the last checkpoint reached, score kept
function continueGame() {
  G.lives = LIVES_START; G.grenades = 3; G.ammo = START_AMMO; G.continues++;
  G.rescued = 0; // the world (and its prisoners) reset with the continue
  const cp = G.cp;
  resetWorld();
  G.camY = cp; G.cp = cp;
  G.joe.y = Math.min(A.height - 30, cp + 174);
  G.joe.invuln = 110;
  setState('ready', 70);
  if (window.Music && Music.currentCue !== 'main') Music.play('main');
}
// difficulty ramp on area loop — placeholder until areas 2+ are measured
function diffMul() { return Math.min(1.9, 1 + (G.area - 1) * 0.1); }
// arcade-loop depth: 0 on the first circuit of the areas, +1 per full lap —
// deepens pressure beyond diffMul's speed/wave scaling (cap, cadence, nerve)
function loopN() { return ((Math.max(1, G.area) - 1) / AREAS.length) | 0; }
// positional stereo pan from a world/screen x
function panAt(x) { return Math.max(-1, Math.min(1, (x / VIEW_W - 0.5) * 1.3)); }

function finishEntry() {
  const name = (G.entry && G.entry.name.trim()) || 'JOE';
  const t = loadScores();
  t.push([name, G.score]);
  t.sort((a, b) => b[1] - a[1]);
  t.length = 7;
  saveScores(t);
  G.lastEntry = name; G.top = t[0][1]; G.entry = null;
  setState('ranking', 350);
}

function rectsAt(x, y, w, h) {
  for (const o of A.obstacles) {
    if (maskRange(o.y + o.h / 2)) continue; // plate regions collide via their mask
    if (x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y) return o;
  }
  // painted-plate collision: sample the walkability mask across the hitbox
  for (let sy = y; ; sy += 2) {
    const py = Math.min(sy, y + h);
    for (let sx = x; ; sx += 2) {
      const px = Math.min(sx, x + w);
      if (maskBlocked(px, py)) return { mask: true };
      if (px >= x + w) break;
    }
    if (py >= y + h) break;
  }
  return null;
}

function newEnemy(x, y, type, dir, mode) {
  return { x, y, type, hp: 1, t: 0, dir, mode: mode || (type === 'rifleman' || type === 'officer' ? 'traverse' : 'hold'),
    walk: 0, walkDist: 0, walkFrame: 0, fireT: 0, duckT: 0, coverCd: 0, barkT: 0,
    lean: 0, face: dir < 0 ? -1 : 1, stepped: 0,
    shotCd: 40 + ((x * 7 + y * 13) % 60), dodgeT: 0, dodgeCd: 0, dodgeX: 0, dodgeY: 0 };
}

function spawnEnemies() {
  if (G.calm) return;
  for (let i = 0; i < A.spawns.length; i++) {
    const s = A.spawns[i];
    if (G.spawned.has(i)) continue;
    if (s.y > G.camY - 40 && s.y < G.camY + VIEW_H + 40) {
      G.spawned.add(i);
      // placed soldiers start traversing from wherever they are
      G.enemies.push(newEnemy(s.x, s.y, s.type, s.x < VIEW_W / 2 ? 1 : -1));
    }
  }
}

// Edge waves — the disk's main pressure source: soldiers run in from the left
// and right margins on a fixed line and cross the screen.
function spawnEdgeWave() {
  if (G.calm || G.state !== 'play') return;
  if (G.enemies.length >= Math.min(9, 7 + loopN())) return;
  if (G.frame - (G.lastWave || 0) < WAVE_INTERVAL / diffMul()) return;
  G.lastWave = G.frame;
  // occasionally the wave is a motorcycle instead of infantry
  const moto = rng() < 0.18 && G.area >= 1;
  const count = moto ? 1 : 1 + (rng() < 0.45 ? 1 : 0);
  for (let i = 0; i < count; i++) {
    const fromLeft = rng() < 0.5;
    // enter on a line in the upper half of the view, ahead of the player
    const y = G.camY + 26 + rng() * (VIEW_H * 0.55);
    // the map edges are usually jungle wall — walk inward to the first open
    // column so a wave is never silently swallowed by painted cover
    let x = -1;
    for (let d2 = 0; d2 < 64; d2 += 3) {
      const cand = fromLeft ? 10 + d2 : A.width - 10 - d2;
      if (!maskBlocked(cand, y) && !rectsAt(cand - 4, y - 6, 8, 10)) { x = cand; break; }
    }
    if (x < 0) continue;
    G.enemies.push(newEnemy(x, y, moto ? 'moto' : 'rifleman', fromLeft ? 1 : -1, 'traverse'));
  }
}

// permanent-ish blast mark on the ground, fading out over ~28s
function addScorch(x, y, r) {
  if (G.scorch.length > 11) G.scorch.shift();
  G.scorch.push({ x, y, r, t: 0, ttl: 1400 });
}

// a killed soldier leaves a body playing one of several collapse sequences,
// and sometimes drops the supplies he was carrying
function dropCorpse(e) {
  const set = (((e.x * 31 + e.y * 17) | 0) & 1) ? 'rif-die2' : 'rif-die';
  // bodies keep the facing they died with instead of mirroring as Joe walks by
  G.corpses.push({ x: e.x, y: e.y, type: e.type, dieT: 0, set, face: e.face || 1 });
  if (G.corpses.length > 8) G.corpses.shift();
  const roll = ((e.x * 7 + e.y * 13 + G.frame) | 0) % 100;
  if (roll < PICKUP_DROP_CHANCE) {
    G.pickups.push({ x: e.x, y: e.y, kind: roll < PICKUP_DROP_CHANCE / 2 ? 'ammo' : 'grenade', t: 0 });
  }
}

// a destroyed vehicle explodes instead of leaving an infantry corpse
function destroyEnemy(e) {
  if (e.mode === 'flee') {
    // the fleeing garrison commander carries a bounty
    G.score += OFFICER_BONUS; if (G.score > G.top) G.top = G.score;
    G.fx.push({ kind: 'bonus', x: e.x, y: e.y - 8, t: 0 });
    if (G.finale) G.finale.officer = 'down';
  }
  if (e.type === 'moto') {
    G.fx.push({ kind: 'bigboom', x: e.x, y: e.y, t: 0 });
    addScorch(e.x, e.y, 11);
    G.shake = Math.max(G.shake, 8);
    G.flashT = Math.max(G.flashT, 3);
    for (let i = 0; i < 8; i++) spawnPart({ kind: 'spark', x: e.x, y: e.y, vx: (vrng() - 0.5) * 2.6, vy: -1.5 * vrng(), t: 0, ttl: 18 + vrng() * 14, size: 0.9 });
    for (let i = 0; i < 5; i++) spawnPart({ kind: 'chunk', x: e.x, y: e.y, vx: (vrng() - 0.5) * 2.2, vy: -1.2 - vrng() * 1.2, t: 0, ttl: 42 + vrng() * 20, size: 1 + vrng() * 0.8, ground: e.y + 2 + vrng() * 6 });
    if (window.Sfx) Sfx.play('explosion', { gain: 0.85, rate: 1.05, pan: panAt(e.x) });
  } else dropCorpse(e);
}

// blow a destructible prop: wreck decal, fireball, casualties, chain reaction
function blowProp(p, depth) {
  if (p.dead) return;
  p.dead = true; p.burn = 150;
  G.fx.push({ kind: 'bigboom', x: p.x, y: p.y, t: 0 });
  addScorch(p.x, p.y, p.r * 1.5);
  G.flashT = Math.max(G.flashT, p.kind === 'fuel' ? 5 : 4);
  for (let i = 0; i < 7; i++) spawnPart({ kind: 'chunk', x: p.x, y: p.y, vx: (vrng() - 0.5) * 2.6, vy: -1.4 - vrng() * 1.4, t: 0, ttl: 44 + vrng() * 22, size: 1 + vrng(), ground: p.y + 2 + vrng() * 7 });
  G.shake = Math.max(G.shake, p.kind === 'fuel' ? 16 : 10);
  for (let i = 0; i < (p.kind === 'fuel' ? 16 : 10); i++)
    spawnPart({ kind: 'spark', x: p.x, y: p.y, vx: (vrng() - 0.5) * 3, vy: -2 * vrng(), t: 0, ttl: 20 + vrng() * 18, size: 1 });
  for (let i = 0; i < 7; i++)
    spawnPart({ kind: 'smoke', x: p.x + (vrng() - 0.5) * 10, y: p.y - 2, vx: (vrng() - 0.5) * 0.25, vy: -0.32 - vrng() * 0.2, t: 0, ttl: 90 + vrng() * 40, size: 3.5 + vrng() * 2.5 });
  if (window.Sfx) Sfx.play('explosion', { gain: 1.0, rate: 0.78, pan: panAt(p.x) });
  // everything caught in the blast
  for (let j = G.enemies.length - 1; j >= 0; j--) {
    const e = G.enemies[j];
    if (Math.hypot(e.x - p.x, e.y - p.y) < BLAST_R) {
      destroyEnemy(e);
      G.enemies.splice(j, 1);
      G.score += KILL_POINTS; if (G.score > G.top) G.top = G.score;
    }
  }
  for (const w of G.pows) if (!w.freed && !w.dead && Math.hypot(w.x - p.x, w.y - p.y) < BLAST_R) { w.dead = true; w.t = 0; }
  if (G.joe.alive && Math.hypot(G.joe.x - p.x, G.joe.y - p.y) < BLAST_R * 0.7) killJoe();
  // chain to neighbours a beat later
  if ((depth || 0) < 3) {
    for (const q of G.props) {
      if (q.dead || q === p) continue;
      if (Math.hypot(q.x - p.x, q.y - p.y) < BLAST_R + q.r) { q.fuse = 8 + (depth || 0) * 4; q.fuseDepth = (depth || 0) + 1; }
    }
  }
}

function hitProp(x, y, slack) {
  for (const p of G.props) {
    if (p.dead || p.fuse) continue;
    if (Math.hypot(x - p.x, y - p.y) < p.r + (slack || 0)) { blowProp(p, 0); return true; }
  }
  return false;
}

// player grenade blast: radius kill, big fx, screen shake
function detonate(x, y) {
  for (const p of G.props) if (!p.dead && !p.fuse && Math.hypot(p.x - x, p.y - y) < p.r + 14) p.fuse = 4;
  G.fx.push({ kind: 'bigboom', x, y, t: 0 });
  addScorch(x, y, 13);
  G.shake = 10;
  G.flashT = Math.max(G.flashT, 4);
  for (let i = 0; i < 6; i++) spawnPart({ kind: 'chunk', x, y, vx: (vrng() - 0.5) * 2.2, vy: -1.2 - vrng() * 1.4, t: 0, ttl: 40 + vrng() * 22, size: 1 + vrng() * 0.8, ground: y + 2 + vrng() * 6 });
  for (let i = 0; i < 10; i++) spawnPart({ kind: 'spark', x, y, vx: (vrng() - 0.5) * 2.4, vy: -1.6 * vrng(), t: 0, ttl: 18 + vrng() * 14, size: 0.9 });
  for (let i = 0; i < 4; i++) spawnPart({ kind: 'smoke', x: x + (vrng() - 0.5) * 8, y: y - 2, vx: (vrng() - 0.5) * 0.2, vy: -0.3 - vrng() * 0.2, t: 0, ttl: 70 + vrng() * 30, size: 3 + vrng() * 2 });
  if (window.Sfx) Sfx.play('explosion', { gain: 1.0, rate: 0.9, pan: panAt(x) });
  for (let j = G.enemies.length - 1; j >= 0; j--) {
    const e = G.enemies[j];
    if (Math.hypot(e.x - x, e.y - y) < 26) {
      G.enemies.splice(j, 1);
      G.score += KILL_POINTS;
      G.fx.push({ kind: 'boom', x: e.x, y: e.y, t: 0 });
    }
  }
  if (G.score > G.top) G.top = G.score;
}

// arcade behavior on death: the field clears and Joe re-enters at the bottom
// of the current screen with brief spawn protection — without this, the enemy
// that killed you is still standing on the respawn spot and re-kills instantly
function respawnJoe() {
  G.enemies = []; G.lobs = []; G.nades = []; G.corpses = []; G.ebullets = []; G.shells = []; G.pickups = [];
  // an unfinished gate assault re-arms — the garrison reforms while Joe is down
  if (G.finale && G.finale.phase !== 'done') G.finale = null;
  const y = Math.min(A.height - 20, G.camY + VIEW_H - 26);
  let x = A.spawn.x;
  for (const dx of [0, 10, -10, 20, -20, 32, -32, 46, -46, 62, -62, 80, -80]) {
    const cand = Math.max(10, Math.min(A.width - 10, A.spawn.x + dx));
    if (!rectsAt(cand - 5, y - 8, 10, 12)) { x = cand; break; }
  }
  Object.assign(G.joe, { x, y, face: { x: 0, y: -1 }, turn: 0, latency: 0, fireCd: 0, grenCd: 0, invuln: 110, alive: true, deathT: 0, fireT: 0, throwT: 0, recoil: 0, duck: false, moving: false, walk: 0, walkDist: 0 });
}

function killJoe() {
  if (!G.joe.alive || G.joe.invuln > 0) return;
  G.joe.alive = false;
  G.joe.deathT = 0; G.joe.fireT = 0; G.joe.throwT = 0; G.joe.duck = false;
  G.fx.push({ kind: 'death', x: G.joe.x, y: G.joe.y, t: 0 });
  if (window.Sfx) Sfx.play('player-death');
  G.state = 'dead'; G.stateTimer = 90;
}

// Render interpolation: logic is a fixed 50Hz but the display is usually 60Hz,
// so drawing raw logic positions judders on a 5:6 cadence. Every tick snapshots
// where things were, and render() lerps by the leftover accumulator fraction.
function snapshotPrev() {
  const J = G.joe;
  J.px = J.x; J.py = J.y;
  G.pcamY = G.camY;
  for (const e of G.enemies) { e.px = e.x; e.py = e.y; }
  for (const b of G.bullets) { b.px = b.x; b.py = b.y; }
  for (const b of G.ebullets) { b.px = b.x; b.py = b.y; }
  for (const l of G.lobs) { l.px = l.x; l.py = l.y; l.pt = l.t; }
  for (const n of G.nades) { n.px = n.x; n.py = n.y; n.pt = n.t; }
  for (const sh of G.shells) { sh.pt = sh.t; }
  for (const p of G.parts) { p.px = p.x; p.py = p.y; }
}

// ---------- logic tick (50Hz) ----------
function tick() {
  snapshotPrev();
  G.frame++;
  const J = G.joe;
  const ed = uiEdges();
  const endTick = () => { for (const k in uiPrev) uiPrev[k] = ed.now[k]; };

  // settings panel (from title or pause)
  if (G.state === 'settings') {
    const n = SETTINGS_ITEMS.length;
    if (!G.remap) {
      if (ed.e.up) G.settingsSel = (G.settingsSel + n - 1) % n;
      if (ed.e.down) G.settingsSel = (G.settingsSel + 1) % n;
      const item = SETTINGS_ITEMS[G.settingsSel];
      if (ed.e.left) adjustSetting(item, -1, false);
      else if (ed.e.right) adjustSetting(item, 1, false);
      else if (ed.e.fire) adjustSetting(item, 0, true);
      if (ed.e.menu || ed.e.pause) closeSettings();
    }
    endTick(); return;
  }
  // continue countdown (normal mode only)
  if (G.state === 'continue') {
    if (ed.e.fire) { continueGame(); endTick(); return; }
    if (--G.stateTimer <= 0) setState('gameover', 200);
    endTick(); return;
  }

  // attract cycle (disk truth: title ↔ ranking ↔ credits, no gameplay demo)
  if (G.state === 'title' || G.state === 'ranking' || G.state === 'credits') {
    if (ed.e.menu && G.state === 'title') { openSettings(); endTick(); return; }
    if (ed.e.fire) { startGame(); endTick(); return; }
    if (--G.stateTimer <= 0) {
      if (G.state === 'title') setState('ranking', 300);
      else if (G.state === 'ranking') {
        if (G.postGame) { G.postGame = false; setState('title', 300); }
        else setState('credits', 250);
      } else setState('title', 300);
    }
    endTick(); return;
  }
  if (G.state === 'intro') {
    if (--G.stateTimer <= 0 || ed.e.fire) setState('ready', 70);
    endTick(); return;
  }
  if (G.state === 'clear') {
    // tally ceremony: area bonus plus a payout per prisoner rescued
    const target = CLEAR_BONUS + G.rescued * POW_CLEAR_BONUS;
    if (G.tally < target) { G.tally = Math.min(target, G.tally + 10); G.score += 10; if (G.score > G.top) G.top = G.score; }
    else if (--G.stateTimer <= 0) nextArea();
    endTick(); return;
  }
  if (G.state === 'gameover') {
    if (--G.stateTimer <= 0) {
      G.postGame = true;
      if (G.score > loadScores()[6][1]) { G.entry = { name: '', ci: 0 }; setState('entry', 1500); }
      else setState('ranking', 350);
    }
    endTick(); return;
  }
  if (G.state === 'entry') {
    const E = G.entry, N = ENTRY_CHARS.length + 1; // last slot = END
    if (ed.e.up) E.ci = (E.ci + N - 1) % N;
    if (ed.e.down) E.ci = (E.ci + 1) % N;
    if (ed.e.left && E.name.length) E.name = E.name.slice(0, -1);
    if (ed.e.fire) {
      if (E.ci === ENTRY_CHARS.length) finishEntry();
      else { E.name += ENTRY_CHARS[E.ci]; if (E.name.length >= 8) finishEntry(); }
    }
    if (G.entry && --G.stateTimer <= 0) finishEntry(); // 30s timeout
    endTick(); return;
  }

  if (G.state === 'ready') {
    if (--G.stateTimer <= 0) { G.state = 'play'; if (window.Sfx) Sfx.play('ready', { gain: 0.6 }); }
    endTick(); return;
  }
  if (G.state === 'dead') {
    if (--G.stateTimer <= 0) {
      if (--G.lives < 0) {
        // normal mode: offer a continue from the last checkpoint; arcade: original rules
        if (Settings.mode === 'normal') setState('continue', 500);
        else setState('gameover', 200);
      } else { J.alive = true; respawnJoe(); setState('ready', 70); }
      endTick(); return;
    }
    // world keeps animating below while the death plays out
  }
  if (G.state === 'play') {
    if (ed.e.pause) G.paused = !G.paused; // Space — pause key in the original
    if (G.paused && ed.e.menu) { openSettings(); endTick(); return; }
    if (G.paused) { endTick(); return; }
    // checkpoint tracking (used by continues in normal mode)
    for (const cp of CHECKPOINTS) if (G.camY <= cp && cp < G.cp) G.cp = cp;
  }
  G.wt++; // world ticks: advances only when the simulation below actually runs
  endTick();

  // pose timers tick regardless of state so animations finish cleanly
  if (J.fireT > 0) J.fireT--;
  if (J.throwT > 0) J.throwT--;
  if (J.recoil > 0) J.recoil--;
  if (!J.alive) J.deathT++;
  for (const c of G.corpses) c.dieT++;
  for (const e of G.enemies) {
    if (e.fireT > 0) e.fireT--;
    if (e.duckT > 0) e.duckT--;
  }

  // --- player ---
  if (J.alive && G.state === 'play') {
    if (J.invuln > 0) J.invuln--;
    const { dx, dy } = inputDir();
    const moving = dx || dy;
    J.moving = !!moving;
    // standing still with fire held reads as taking a knee behind cover
    J.duck = !moving && (keys.fire || touchUI.fire || gp.fire) && J.fireT > 0;
    if (moving) {
      // turn-reversal delay (measured): reversing horizontal facing costs TURN_DELAY frames
      const reversing = dx && J.face.x && Math.sign(dx) !== Math.sign(J.face.x);
      if (reversing && J.turn <= 0) J.turn = TURN_DELAY;
      if (J.turn > 0) { J.turn--; }
      else {
        if (J.latency > 0) J.latency--;
        else {
          const px0 = J.x, py0 = J.y;
          const nx = J.x + dx * SPEED_H;
          const ny = J.y + dy * SPEED_V;
          if (!rectsAt(nx - 5, J.y - 8, 10, 12)) J.x = Math.max(8, Math.min(A.width - 8, nx));
          if (!rectsAt(J.x - 5, ny - 8, 10, 12)) J.y = Math.max(G.camY + 8, Math.min(A.height - 8, ny));
          // walk cycle advances with distance actually covered, so it never
          // animates while Joe is pressed against terrain
          const moved = Math.hypot(J.x - px0, J.y - py0);
          J.walkDist += moved;
          while (J.walkDist >= WALK_STRIDE) {
            J.walkDist -= WALK_STRIDE;
            J.walk++;
            spawnPart({ kind: 'dust', x: J.x + (vrng() - 0.5) * 3, y: J.y + 2, vx: (vrng() - 0.5) * 0.15, vy: -0.06, t: 0, ttl: 14 + vrng() * 8, size: 0.9 });
          }
        }
      }
      if (dx || dy) J.face = { x: dx, y: dy || (dx ? 0 : -1) };
      if (!J.face.x && !J.face.y) J.face = { x: 0, y: -1 };
    } else { J.latency = START_LATENCY; J.turn = 0; J.moving = false; }

    // camera: scrolls north at SPEED_V when Joe crosses the scroll line
    const joeScreenY = J.y - G.camY;
    if (joeScreenY < SCROLL_LINE && G.camY > 0) {
      G.camY = Math.max(0, G.camY - SPEED_V);
    }

    // fire: one shot per press on keys; touch hold auto-fires at the same
    // measured min interval (identical cadence cap to perfect button mashing)
    const fire = keys.fire || touchUI.fire || gp.fire;
    if (J.fireCd > 0) J.fireCd--;
    const autoHold = touchUI.fire || (Settings.autoFire && (keys.fire || gp.fire));
    const fireWants = (fire && !J.firePrev) || autoHold;
    if (fireWants && J.fireCd === 0 && G.bullets.length < MAX_BULLETS && G.ammo > 0) {
      G.ammo--;
      const f = (J.face.x || J.face.y) ? J.face : { x: 0, y: -1 };
      const len = Math.hypot(f.x, f.y) || 1;
      G.bullets.push({ x: J.x, y: J.y - 6, vx: f.x / len * BULLET_SPEED, vy: f.y / len * BULLET_SPEED, life: 90 });
      J.fireCd = FIRE_MIN_INTERVAL;
      J.fireT = FIRE_POSE_FRAMES; J.recoil = 3;
      // muzzle flash + ejected casing (visual only)
      G.fx.push({ kind: 'muzzle', x: J.x + f.x / len * 7, y: J.y - 6 + f.y / len * 7, dx: f.x / len, dy: f.y / len, t: 0 });
      spawnPart({ kind: 'casing', x: J.x + 3, y: J.y - 5, vx: 0.35 + vrng() * 0.3, vy: -0.5 - vrng() * 0.3, t: 0, ttl: 55, size: 1, ground: J.y + 2 + vrng() * 3 });
      if (window.Sfx) Sfx.play('shot', { gain: 0.7, pan: panAt(J.x) });
    }
    J.firePrev = fire;

    // grenade: edge-triggered on key or button, thrown along facing with an arc
    const gren = keys.grenade || touchUI.gren || gp.gren;
    if (J.grenCd > 0) J.grenCd--;
    if (gren && !J.grenPrev && J.grenCd === 0 && G.grenades > 0 && G.nades.length < 2) {
      const f = (J.face.x || J.face.y) ? J.face : { x: 0, y: -1 };
      const len = Math.hypot(f.x, f.y) || 1;
      G.grenades--;
      G.nades.push({ x: J.x, y: J.y - 4, vx: f.x / len * 1.75, vy: f.y / len * 1.75, t: 0, ttl: 40 });
      J.grenCd = 25; J.throwT = THROW_POSE_FRAMES;
    }
    J.grenPrev = gren;
  }

  // --- bullets ---
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    b.x += b.vx; b.y += b.vy;
    // bullets stop on terrain, kicking up a dust puff
    if (hitProp(b.x, b.y)) { G.bullets.splice(i, 1); continue; }
    let hitPow = false;
    for (const w of G.pows) {
      if (w.freed || w.dead) continue;
      if (Math.abs(b.x - w.x) < 6 && Math.abs(b.y - w.y) < 9) {
        w.dead = true; w.t = 0; hitPow = true;
        G.fx.push({ kind: 'boom', x: w.x, y: w.y, t: 0 });
        if (window.Sfx) Sfx.play('player-death', { gain: 0.5, pan: panAt(w.x) });
        break;
      }
    }
    if (hitPow) { G.bullets.splice(i, 1); continue; }
    if (maskBlocked(b.x, b.y)) {
      // a round stopped by painted cover still sets off drums stacked against it
      if (!hitProp(b.x, b.y, 12))
        for (let k = 0; k < 3; k++) spawnPart({ kind: 'dust', x: b.x, y: b.y, vx: (vrng() - 0.5) * 0.5, vy: -0.15 - vrng() * 0.2, t: 0, ttl: 16 + vrng() * 10, size: 1 + vrng() });
      G.bullets.splice(i, 1); continue;
    }
    if (--b.life <= 0 || b.y < G.camY - 8 || b.x < 0 || b.x > A.width) { G.bullets.splice(i, 1); continue; }
    for (let j = G.enemies.length - 1; j >= 0; j--) {
      const e = G.enemies[j];
      if (Math.abs(b.x - e.x) < 7 && Math.abs(b.y - e.y) < 9) {
        // leave a body that plays out the collapse, then lingers
        G.fx.push({ kind: 'impact', x: b.x, y: b.y, dx: b.vx, dy: b.vy, t: 0 });
        destroyEnemy(e);
        G.enemies.splice(j, 1); G.bullets.splice(i, 1);
        G.score += KILL_POINTS; if (G.score > G.top) G.top = G.score;
        G.fx.push({ kind: 'boom', x: e.x, y: e.y, t: 0 });
        for (let k = 0; k < 5; k++) spawnPart({ kind: 'dust', x: e.x, y: e.y, vx: (vrng() - 0.5) * 0.8, vy: -0.2 - vrng() * 0.3, t: 0, ttl: 20 + vrng() * 12, size: 1.2 + vrng() });
        if (window.Sfx) Sfx.play('enemy-down', { gain: 0.8, pan: panAt(e.x) });
        break;
      }
    }
  }

  // --- enemy bullets ---
  for (let i = G.ebullets.length - 1; i >= 0; i--) {
    const b = G.ebullets[i];
    b.x += b.vx; b.y += b.vy;
    // enemy fire cooks off fuel drums too — their own barrage is a hazard
    if (hitProp(b.x, b.y)) { G.ebullets.splice(i, 1); continue; }
    if (maskBlocked(b.x, b.y)) {
      if (!hitProp(b.x, b.y, 10))
        for (let k = 0; k < 2; k++) spawnPart({ kind: 'dust', x: b.x, y: b.y, vx: (vrng() - 0.5) * 0.4, vy: -0.12, t: 0, ttl: 14, size: 0.9 });
      G.ebullets.splice(i, 1); continue;
    }
    if (--b.life <= 0 || b.y < G.camY - 20 || b.y > G.camY + VIEW_H + 20 || b.x < 0 || b.x > A.width) { G.ebullets.splice(i, 1); continue; }
    if (J.alive && G.state === 'play' && Math.abs(b.x - J.x) < 5 && Math.abs(b.y - J.y) < 7) {
      G.ebullets.splice(i, 1);
      killJoe();
    }
  }

  // --- mortar shells: telegraphed impact, then a blast ---
  for (let i = G.shells.length - 1; i >= 0; i--) {
    const sh = G.shells[i];
    sh.t++;
    if (sh.t >= sh.ttl) {
      G.fx.push({ kind: 'bigboom', x: sh.tx, y: sh.ty, t: 0 });
      addScorch(sh.tx, sh.ty, 11);
      G.shake = Math.max(G.shake, 12);
      G.flashT = Math.max(G.flashT, 4);
      for (let i = 0; i < 4; i++) spawnPart({ kind: 'chunk', x: sh.tx, y: sh.ty, vx: (vrng() - 0.5) * 2, vy: -1.1 - vrng(), t: 0, ttl: 38 + vrng() * 18, size: 1 + vrng() * 0.7, ground: sh.ty + 2 + vrng() * 6 });
      for (let k = 0; k < 9; k++) spawnPart({ kind: 'spark', x: sh.tx, y: sh.ty, vx: (vrng() - 0.5) * 2.4, vy: -1.4 * vrng(), t: 0, ttl: 18 + vrng() * 12, size: 0.9 });
      for (let k = 0; k < 3; k++) spawnPart({ kind: 'smoke', x: sh.tx + (vrng() - 0.5) * 8, y: sh.ty, vx: 0, vy: -0.28, t: 0, ttl: 70, size: 3 });
      for (const q of G.props) if (!q.dead && !q.fuse && Math.hypot(q.x - sh.tx, q.y - sh.ty) < q.r + 12) q.fuse = 4;
      if (G.joe.alive && G.state === 'play' && Math.hypot(G.joe.x - sh.tx, G.joe.y - sh.ty) < 15) killJoe();
      if (window.Sfx) Sfx.play('explosion', { gain: 0.9, pan: panAt(sh.tx) });
      G.shells.splice(i, 1);
    }
  }

  // --- prisoners of war ---
  for (const w of G.pows) {
    if (w.freed || w.dead) { w.t++; continue; }
    if (J.alive && G.state === 'play' && Math.abs(w.x - J.x) < 10 && Math.abs(w.y - J.y) < 11) {
      w.freed = true; w.t = 0;
      G.rescued++;
      G.score += POW_POINTS; if (G.score > G.top) G.top = G.score;
      G.fx.push({ kind: 'rescue', x: w.x, y: w.y, t: 0 });
      if (window.Sfx) Sfx.play('ready', { gain: 0.7, pan: panAt(w.x) });
    }
  }
  // a freed prisoner sprints south off the map
  for (const w of G.pows) {
    if (!w.freed || w.dead) continue;
    if (w.t < 150) w.y += 1.4;
  }

  // --- supply pickups ---
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const pu = G.pickups[i];
    pu.t++;
    if (pu.t > 900 || pu.y > G.camY + VIEW_H + 60 || pu.y < G.camY - 60) { G.pickups.splice(i, 1); continue; }
    if (J.alive && G.state === 'play' && Math.abs(pu.x - J.x) < 9 && Math.abs(pu.y - J.y) < 10) {
      if (pu.kind === 'ammo') G.ammo = Math.min(START_AMMO * 2, G.ammo + 45);
      else G.grenades = Math.min(9, G.grenades + 2);
      G.score += 50; if (G.score > G.top) G.top = G.score;
      G.pickups.splice(i, 1);
      if (window.Sfx) Sfx.play('ready', { gain: 0.5, rate: 1.5, pan: panAt(pu.x) });
    }
  }

  // --- enemies ---
  // Behaviour follows the it42 disk observation: TRAVERSE across the screen on
  // a fixed line, CHARGE once the player is close, LOB arcing grenades from a
  // held position, and TRENCH defenders pop up from cover.
  spawnEnemies();
  spawnEdgeWave();
  const live = J.alive && G.state === 'play';
  for (const e of G.enemies) {
    e.t++;
    const ox = e.x, oy = e.y;
    const dx = J.x - e.x, dy = J.y - e.y, d = Math.hypot(dx, dy) || 1;

    if (e.type === 'moto') {
      // races along its line; lethal to touch, and it ignores small cover
      const nx2 = e.x + e.dir * MOTO_SPEED * diffMul();
      if (rectsAt(nx2 - 5, e.y - 6, 10, 10)) {
        const ny2 = e.y + (dy > 0 ? 1.4 : -1.4);
        if (!rectsAt(e.x - 5, ny2 - 6, 10, 10)) e.y = ny2; else e.dir = -e.dir;
      } else e.x = nx2;
      // drift toward the player's line so it actually threatens
      if (Math.abs(dy) > 3 && e.t % 3 === 0) {
        const ny3 = e.y + Math.sign(dy) * 0.5;
        if (!rectsAt(e.x - 5, ny3 - 6, 10, 10)) e.y = ny3;
      }
      // lean into the drift (smoothed so the bike banks rather than snaps),
      // and kick up a dust plume off the rear wheel while moving
      e.lean += ((e.y - oy) * e.dir * 0.10 - e.lean) * 0.18;
      if (Math.abs(e.x - ox) > 0.5 && e.t % 2 === 0)
        spawnPart({ kind: 'dust', x: e.x - e.dir * 7, y: e.y + 3, vx: -e.dir * 0.15 + (vrng() - 0.5) * 0.1,
          vy: -0.08 - vrng() * 0.06, t: 0, ttl: 20 + vrng() * 10, size: 1.0 + vrng() * 0.7 });
      if (live && d < 9) killJoe();
    } else if (e.type === 'mortar') {
      // dug-in crew with a readable load ritual: lift the shell, drop it in,
      // THEN the tube fires — the round leaves when the animation says it does
      if (live && e.t % MORTAR_INTERVAL === 60 && d < 200) e.fireT = 22;
      if (e.fireT === 8 && live) {
        G.shells.push({ x: e.x, y: e.y, tx: J.x, ty: J.y, t: 0, ttl: MORTAR_FLIGHT });
        for (let k = 0; k < 3; k++)
          spawnPart({ kind: 'smoke', x: e.x - 4, y: e.y - 12, vx: (vrng() - 0.5) * 0.2,
            vy: -0.5 - vrng() * 0.3, t: 0, ttl: 36 + vrng() * 18, size: 1.5 + vrng() });
        if (window.Sfx) Sfx.play('shot', { gain: 0.4, rate: 0.6, pan: panAt(e.x) });
      }
    } else if (e.type === 'lobber' || e.type === 'trencher') {
      // dug-in throwers: hold position, arc a grenade at Joe, drop back down
      if (live && e.t % 150 === 24 && d < 150) {
        const spd = LOB_SPEED;
        G.lobs.push({ x: e.x, y: e.y, vx: dx / d * spd, vy: dy / d * spd, t: 0, ttl: Math.min(90, d / spd) });
        e.fireT = 18;
        if (e.type === 'trencher') e.duckT = 40; // pop up to throw, then hide
      }
      if (e.type === 'trencher') {
        // idle cycle in cover so they read as manning the trench
        if (e.duckT <= 0 && e.fireT <= 0 && e.t % 120 === 0) e.duckT = 44;
      } else {
        const sxDelta = (e.t % 100 < 50 ? 1 : -1) * e.dir * 0.4;
        if (!rectsAt(e.x + sxDelta - 4, e.y - 6, 8, 10)) e.x += sxDelta;
      }
    } else if (e.mode === 'flee') {
      // the garrison commander bolts for the treeline — no fight left in him,
      // no dodging either; he can be shot in the back for the bounty
      const nx2 = e.x + (e.fleeDir || 1) * 1.8;
      if (!rectsAt(nx2 - 4, e.y - 6, 8, 10)) e.x = nx2;
      else { const ny2 = e.y + 1.2; if (!rectsAt(e.x - 4, ny2 - 6, 8, 10)) e.y = ny2; }
      if (e.x < 10 || e.x > A.width - 10) e.gone = true;
    } else if (live) {
      const move = (vx, vy) => {
        const nx2 = e.x + vx;
        if (!rectsAt(nx2 - 4, e.y - 6, 8, 10)) e.x = nx2;
        const ny2 = e.y + vy;
        if (!rectsAt(e.x - 4, ny2 - 6, 8, 10)) e.y = ny2;
      };
      // DODGE overrides everything: sidestep out of the line of an incoming round
      if (e.dodgeT > 0) {
        e.dodgeT--;
        move(e.dodgeX * ENEMY_WALK * 1.5, e.dodgeY * ENEMY_WALK * 1.5);
      } else {
        // Dodging is a rare flinch, not a reflex. A soldier only reacts to a
        // round that would actually hit him, only if he has time to move, only
        // sometimes, and then not again for a good while — otherwise they
        // become impossible to shoot.
        if (e.dodgeCd > 0) e.dodgeCd--;
        else {
          for (const b of G.bullets) {
            const bx = b.x - e.x, by = b.y - e.y;
            const bs = Math.hypot(b.vx, b.vy) || 1;
            const ux = b.vx / bs, uy = b.vy / bs;
            const along = -(bx * ux + by * uy);          // distance until it arrives
            if (along < DODGE_MIN_LEAD || along > DODGE_MAX_LEAD) continue;
            const miss = Math.abs(bx * uy - by * ux);    // closest approach
            if (miss > DODGE_HIT_WIDTH) continue;        // it was going to miss anyway
            if (((e.t * 2654435761) >>> 11) % 100 >= Math.min(75, DODGE_CHANCE + loopN() * 8)) { e.dodgeCd = 12; break; } // nerve failed
            const side = (bx * -uy + by * ux) > 0 ? -1 : 1;
            e.dodgeX = side * -uy; e.dodgeY = side * ux;
            e.dodgeT = 11; e.dodgeCd = DODGE_COOLDOWN + ((e.t * 31) % 90);
            break;
          }
        }
        if (e.dodgeT <= 0) {
          // officers periodically stop, plant their feet and bellow an order —
          // a character beat that breaks up the mob's motion
          if (e.type === 'officer' && e.barkT <= 0 && e.fireT <= 0 && d < 180 && (e.t + 97) % 300 === 0) e.barkT = 26;
          if (e.barkT > 0) { e.barkT--; }
          else {
          if (e.mode === 'traverse') {
            // cross the screen on the entry line until the player is in reach
            if (d < ENGAGE_RANGE) e.mode = 'engage';
            else {
              const nx2 = e.x + e.dir * TRAVERSE_SPEED * diffMul();
              if (rectsAt(nx2 - 4, e.y - 6, 8, 10)) {
                const ny2 = e.y + (dy > 0 ? 1 : -1) * TRAVERSE_SPEED;
                if (!rectsAt(e.x - 4, ny2 - 6, 8, 10)) e.y = ny2; else e.dir = -e.dir;
              } else e.x = nx2;
            }
          }
          if (e.mode === 'engage') {
            // hold a firing distance: close if far, back off if crowded, and
            // strafe across so they never simply walk into the player
            const sp = ENEMY_WALK * diffMul();
            let vx = 0, vy = 0;
            if (d > HOLD_RANGE + 12) { vx = dx / d * sp; vy = dy / d * sp * 0.8; }
            else if (d < HOLD_RANGE - 14) { vx = -dx / d * sp; vy = -dy / d * sp * 0.8; }
            else {
              const sx = -dy / d, sy = dx / d;           // perpendicular strafe
              vx = sx * sp * 0.55 * e.dir; vy = sy * sp * 0.44 * e.dir;
              if (e.t % 110 === 0) e.dir = -e.dir;
            }
            move(vx, vy);
            // aimed shot with a little spread — they shoot, they don't ram
            if (e.shotCd > 0) e.shotCd--;
            else if (d < ENGAGE_RANGE && e.fireT <= 0) {
              e.fireT = 16;
              e.shotCd = Math.max(46, ENEMY_SHOT_CD - loopN() * 10) + ((e.t * 37) % 40);
              const spread = ((((e.t * 2654435761) >>> 20) % 100) / 100 - 0.5) * 0.22;
              const ca = Math.cos(spread), sa = Math.sin(spread);
              const ax = dx / d, ay = dy / d;
              G.ebullets.push({ x: e.x, y: e.y + 2, vx: (ax * ca - ay * sa) * ENEMY_BULLET_SPEED,
                vy: (ax * sa + ay * ca) * ENEMY_BULLET_SPEED, life: 150 });
              G.fx.push({ kind: 'muzzle', x: e.x + ax * 6, y: e.y + ay * 6, dx: ax, dy: ay, t: 0 });
              if (window.Sfx) Sfx.play('shot', { gain: 0.34, rate: 0.85, pan: panAt(e.x) });
            }
          }
          }
        }
      }
    }

    const stepped = Math.hypot(e.x - ox, e.y - oy);
    e.stepped = stepped;
    e.vx0 = ox; e.vy0 = oy; e.vdx = e.x - ox;
    e.walk = (e.walk || 0) + stepped;
    e.walkDist = (e.walkDist || 0) + stepped;
    while (e.walkDist >= WALK_STRIDE) { e.walkDist -= WALK_STRIDE; e.walkFrame = (e.walkFrame || 0) + 1; }
    if (e.coverCd > 0) e.coverCd--;
    e.x = Math.max(6, Math.min(A.width - 6, e.x));
  }
  // cull: off the sides for traversers, far from the camera for everyone;
  // a fleeing officer who makes the edge got away — the bounty is forfeit
  G.enemies = G.enemies.filter(e => {
    if (e.gone) {
      if (e.mode === 'flee' && G.finale && G.finale.officer === 'up') G.finale.officer = 'fled';
      return false;
    }
    return e.y < G.camY + VIEW_H + 60 && e.y > G.camY - 80
      && !(e.mode === 'traverse' && (e.x <= 7 || e.x >= A.width - 7) && e.t > 30);
  });
  G.corpses = G.corpses.filter(c => c.y < G.camY + VIEW_H + 80 && c.y > G.camY - 100);

  // --- lobs (grenade arcs) ---
  for (let i = G.lobs.length - 1; i >= 0; i--) {
    const l = G.lobs[i];
    l.x += l.vx; l.y += l.vy; l.t++;
    if (l.t >= l.ttl) {
      G.fx.push({ kind: 'boom', x: l.x, y: l.y, t: 0 });
      if (window.Sfx) Sfx.play('explosion', { gain: 0.9, pan: panAt(l.x) });
      if (J.alive && Math.abs(l.x - J.x) < 12 && Math.abs(l.y - J.y) < 12) killJoe();
      G.lobs.splice(i, 1);
    }
  }

  // --- player grenades (arc over everything, then blast) ---
  for (let i = G.nades.length - 1; i >= 0; i--) {
    const n = G.nades[i];
    n.x += n.vx; n.y += n.vy; n.t++;
    if (n.t >= n.ttl) { detonate(n.x, n.y); G.nades.splice(i, 1); }
  }
  if (G.shake > 0) G.shake--;
  if (G.flashT > 0) G.flashT--;
  for (let i = G.scorch.length - 1; i >= 0; i--) if (++G.scorch[i].t > G.scorch[i].ttl) G.scorch.splice(i, 1);

  // --- destructible props: fuses, chain reactions, burn-down ---
  for (const p of G.props) {
    if (p.fuse > 0 && !p.dead) { p.fuse--; if (p.fuse === 0) blowProp(p, p.fuseDepth || 1); }
    if (p.burn > 0) {
      p.burn--;
      if (G.frame % 5 === 0) spawnPart({ kind: 'smoke', x: p.x + (vrng() - 0.5) * 6, y: p.y - 2, vx: 0.05, vy: -0.24, t: 0, ttl: 70, size: 2.5 + vrng() * 1.5 });
    }
  }

  // --- fx + visual particles ---
  for (let i = G.fx.length - 1; i >= 0; i--) if (++G.fx[i].t > (G.fx[i].kind === 'bigboom' ? 30 : G.fx[i].kind === 'muzzle' ? 4 : G.fx[i].kind === 'impact' ? 5 : 24)) G.fx.splice(i, 1);
  updateParticles();

  // --- fortress finale: the garrison sallies out before the area can clear —
  // the arcade's signature end-of-area beat: the gate bursts, a last wave
  // pours out, and the commander makes a run for it (bounty if you drop him)
  const ex = A.exit || { y: 58, x0: 116, x1: 160 };
  const gateX = (ex.x0 + ex.x1) / 2;
  if (G.state === 'play' && J.alive && !G.calm && !G.finale && J.y > ex.y && J.y < ex.y + 64) {
    G.finale = { phase: 'burst', t: 0, toSpawn: Math.min(10, 7 + loopN() * 2), spawned: 0, officer: null };
    G.shake = Math.max(G.shake, 12); G.flashT = Math.max(G.flashT, 3);
    for (let k = 0; k < 14; k++)
      spawnPart({ kind: 'dust', x: gateX + (vrng() - 0.5) * 34, y: ex.y + vrng() * 8, vx: (vrng() - 0.5) * 0.9,
        vy: -0.25 - vrng() * 0.35, t: 0, ttl: 40 + vrng() * 24, size: 2 + vrng() * 2 });
    if (window.Sfx) Sfx.play('explosion', { gain: 0.9, rate: 0.7, pan: panAt(gateX) });
  }
  if (G.finale && G.state === 'play') {
    const F = G.finale; F.t++;
    if (F.phase === 'burst') {
      if (F.t % 5 === 0)
        spawnPart({ kind: 'dust', x: gateX + (vrng() - 0.5) * 30, y: ex.y + 4, vx: (vrng() - 0.5) * 0.5, vy: -0.3, t: 0, ttl: 30, size: 2.2 });
      if (F.t >= 26) { F.phase = 'wave'; F.t = 0; }
    } else if (F.phase === 'wave') {
      if (F.spawned < F.toSpawn && F.t % 13 === 1) {
        const e2 = newEnemy(gateX + ((F.spawned * 37) % 21) - 10, ex.y + 3, 'rifleman', (F.spawned & 1) ? 1 : -1, 'engage');
        e2.finale = true; e2.shotCd = 34 + ((F.spawned * 29) % 30);
        G.enemies.push(e2); F.spawned++;
        for (let k = 0; k < 3; k++)
          spawnPart({ kind: 'dust', x: e2.x, y: e2.y, vx: (vrng() - 0.5) * 0.5, vy: -0.2, t: 0, ttl: 18, size: 1.2 });
        if (F.spawned === ((F.toSpawn / 2) | 0) && !F.officer) {
          const o = newEnemy(gateX, ex.y + 6, 'officer', 1, 'flee');
          o.finale = true; o.fleeDir = J.x > gateX ? -1 : 1; // away from Joe's side
          G.enemies.push(o); F.officer = 'up';
        }
      }
      if (F.spawned >= F.toSpawn) F.phase = 'hold';
    } else if (F.phase === 'hold') {
      if (!G.enemies.some(e2 => e2.finale)) {
        F.phase = 'done';
        if (window.Sfx) Sfx.play('ready', { gain: 0.6, rate: 1.25 });
      }
    }
  }
  // area clear (enter the painted gateway passage) -> tally ceremony —
  // LOCKED while the garrison is still in the fight
  if (G.state === 'play' && J.alive && J.y < ex.y && J.x > ex.x0 && J.x < ex.x1) {
    if (!G.finale || G.finale.phase === 'done') setState('clear', 160);
  }
}

// ---------- render ----------
let LERP = 1;                              // 0..1 fraction between logic ticks
const IX = (o) => (o.px === undefined ? o.x : o.px + (o.x - o.px) * LERP);
const IY = (o) => (o.py === undefined ? o.y : o.py + (o.y - o.py) * LERP);
const IT = (o) => (o.pt === undefined ? o.t : o.pt + (o.t - o.pt) * LERP);
function render(alpha) {
  LERP = alpha === undefined ? 1 : alpha;
  const cy = G.pcamY === undefined ? G.camY : G.pcamY + (G.camY - G.pcamY) * LERP;

  // screen shake (frame-derived jitter so QA screenshots stay deterministic)
  ctx.save();
  if (G.shake > 0 && Settings.shake > 0) {
    const amp = G.shake * Settings.shake;
    ctx.translate(Math.sin(G.frame * 2.7) * amp * 0.35 * S, Math.cos(G.frame * 3.1) * amp * 0.28 * S);
  }

  // --- ground: pre-baked full-res slices, 1:1 blit (no scaling smudge) ---
  if (groundSlices) {
    const vy0 = cy * BAKE_S, vy1 = vy0 + VIEW_H * BAKE_S;
    for (const sl of groundSlices) {
      const a = Math.max(vy0, sl.y0), b = Math.min(vy1, sl.y0 + sl.h);
      if (a >= b) continue;
      ctx.drawImage(sl.canvas, 0, a - sl.y0, VIEW_W * BAKE_S, b - a, 0, (a - vy0) / BAKE_S * S, VIEW_W * S, (b - a) / BAKE_S * S);
    }
  } else { ctx.fillStyle = '#96794f'; ctx.fillRect(0, 0, VIEW_W * S, VIEW_H * S); }

  // painted plates, north to south — baked top-edge alpha ramps crossfade the seams
  for (const p of PLATES) {
    if (!p.img) continue;
    const sy = p.y0 - cy, ph = p.y1 - p.y0;
    if (sy + ph < 0 || sy > VIEW_H) continue;
    ctx.drawImage(p.img, 0, sy * S, VIEW_W * S, ph * S);
  }
  // ?qa=1&mask=1 — visualize blocked walkability cells
  if (qa && urlMaskDebug) {
    ctx.fillStyle = 'rgba(255,40,40,0.30)';
    for (const p of PLATES) {
      const mk = p.mask;
      if (!mk) continue;
      const my0 = Math.max(0, Math.floor((cy - mk.y0) / mk.cell));
      const my1 = Math.min(mk.h, Math.ceil((cy + VIEW_H - mk.y0) / mk.cell));
      for (let my = my0; my < my1; my++) for (let mx = 0; mx < mk.w; mx++) {
        if (!mk.grid[my * mk.w + mx]) continue;
        ctx.fillRect(mx * mk.cell * S, (mk.y0 + my * mk.cell - cy) * S, mk.cell * S, mk.cell * S);
      }
    }
  }

  // blast scorch marks, fading out slowly
  for (const sc of G.scorch) {
    const sy = sc.y - cy;
    if (sy < -40 || sy > VIEW_H + 40) continue;
    const a = Math.min(1, sc.t / 5) * Math.min(1, (sc.ttl - sc.t) / 300) * 0.5;
    const g3 = ctx.createRadialGradient(sc.x * S, sy * S, 0, sc.x * S, sy * S, sc.r * S);
    g3.addColorStop(0, `rgba(14,11,8,${a})`);
    g3.addColorStop(0.65, `rgba(22,18,12,${a * 0.55})`);
    g3.addColorStop(1, 'rgba(22,18,12,0)');
    ctx.fillStyle = g3;
    ctx.beginPath(); ctx.arc(sc.x * S, sy * S, sc.r * S, 0, 7); ctx.fill();
  }

  // wreck decals over destroyed props (drawn before set dressing/sprites)
  const wreckImg = IMGS['props/wreck'];
  for (const p of G.props) {
    if (!p.dead) continue;
    const sy = p.y - cy;
    if (sy < -40 || sy > VIEW_H + 40) continue;
    if (wreckImg) {
      const w = p.r * 2.9, h = w * (wreckImg.height / wreckImg.width);
      ctx.drawImage(wreckImg, (p.x - w / 2) * S, (p.y - h / 2) * S - cy * S, w * S, h * S);
    } else {
      ctx.fillStyle = 'rgba(20,16,12,0.7)';
      ctx.beginPath(); ctx.arc(p.x * S, sy * S, p.r * S, 0, 7); ctx.fill();
    }
  }

  // obstacles as painterly props (keyed by kind, fallback rects until loaded)
  const PROPS = { palm: 'props/palm', 'grass-knoll': 'props/boulder', water: 'props/pond', trench: 'props/trench' };
  let gateDrawn = false;
  for (const o of A.obstacles) {
    const sy = o.y - cy;
    if (sy + o.h < 0 || sy > VIEW_H) continue;
    if (o.kind === 'gate-wall') {
      if (!gateDrawn && IMGS['props/gate']) {
        const g = IMGS['props/gate'];
        const gw = A.width, gh = gw * (g.height / g.width);
        ctx.drawImage(g, 0, (o.y - cy + o.h - gh) * S, gw * S, gh * S);
        gateDrawn = true;
      } else if (!IMGS['props/gate'] && !gateDrawn) {
        ctx.fillStyle = '#6e6e6e'; ctx.fillRect(o.x * S, sy * S, o.w * S, o.h * S);
      }
      continue;
    }
    if (plateAt(o.y + o.h / 2)) continue; // set dressing is painted into the plate
    const propImg = IMGS[PROPS[o.kind]];
    if (propImg) {
      // palms/boulders overhang their collision box for canopy richness
      const over = o.kind === 'palm' ? 1.7 : o.kind === 'grass-knoll' ? 1.25 : 1.0;
      const w = o.w * over, h = o.h * over;
      const ox = o.x - (w - o.w) / 2, oy2 = o.y - (h - o.h) / 2;
      if (o.kind === 'palm') { // engine-drawn long shadow (golden-hour, from upper-left light)
        ctx.fillStyle = 'rgba(25,20,8,0.28)';
        ctx.beginPath();
        ctx.ellipse((o.x + o.w / 2 + w * 0.55) * S, (o.y + o.h / 2 + 4) * S, w * 0.62 * S, h * 0.2 * S, 0.12, 0, 7);
        ctx.fill();
      }
      ctx.drawImage(propImg, ox * S, oy2 * S, w * S, h * S);
    } else {
      ctx.fillStyle = o.kind === 'water' ? '#3a6ea5' : o.kind === 'palm' ? '#2e5c22'
        : o.kind === 'trench' ? '#5b4a30' : o.kind === 'bridge-rail' ? '#7d7458' : '#47632c';
      ctx.fillRect(o.x * S, sy * S, o.w * S, o.h * S);
    }
  }

  // shadows (painterly grounding for sprites)
  const drawShadow = (x, y, w) => {
    ctx.fillStyle = 'rgba(30,25,10,0.30)';
    ctx.beginPath(); ctx.ellipse(x * S, (y + 1) * S, w * S, 2.4 * S, 0, 0, 7); ctx.fill();
  };

  // enemy thrown grenades: tumbling olive stick-grenade with a ground shadow
  for (const l of G.lobs) {
    const lx = IX(l), ly = IY(l);
    const z = Math.sin(Math.PI * (IT(l) / l.ttl)) * 7;
    ctx.fillStyle = 'rgba(30,25,10,0.30)';
    ctx.beginPath(); ctx.ellipse(lx * S, (ly - cy + 1) * S, 2.2 * S, 1.1 * S, 0, 0, 7); ctx.fill();
    ctx.save();
    ctx.translate(lx * S, (ly - cy - z) * S);
    ctx.rotate(IT(l) * 0.34);
    ctx.fillStyle = '#4b5a2e';
    ctx.fillRect(-0.7 * S, -2.6 * S, 1.4 * S, 4 * S);   // handle
    ctx.fillStyle = '#6a7a44';
    ctx.beginPath(); ctx.ellipse(0, -3 * S, 1.5 * S, 1.5 * S, 0, 0, 7); ctx.fill(); // head
    ctx.restore();
  }
  // shell casings on the ground (under the sprites)
  for (const p of G.parts) {
    if (p.kind !== 'casing' && p.kind !== 'chunk') continue;
    const a = 1 - p.t / p.ttl;
    if (p.kind === 'chunk') {
      ctx.fillStyle = `rgba(52,42,30,${0.95 * a})`;
      const sz = p.size;
      ctx.fillRect((IX(p) - sz / 2) * S, (IY(p) - cy - sz / 2) * S, sz * S, sz * S);
    } else {
      ctx.fillStyle = `rgba(212,170,80,${0.9 * a})`;
      ctx.fillRect((IX(p) - 0.6) * S, (IY(p) - cy - 0.6) * S, 1.2 * S, 1.2 * S);
    }
  }

  // player grenades (olive, arcing)
  for (const n of G.nades) {
    const nx = IX(n), ny = IY(n);
    const z = Math.sin(Math.PI * (IT(n) / n.ttl)) * 8;
    drawShadow(nx, ny - cy, 2);
    ctx.fillStyle = '#4d6030';
    ctx.beginPath(); ctx.arc(nx * S, (ny - cy - z) * S, 2.4 * S, 0, 7); ctx.fill();
  }
  // enemy tracers: hotter red so incoming fire reads instantly against Joe's
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const b of G.ebullets) {
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const ux = b.vx / sp, uy = b.vy / sp, len = 4.5;
    const bx = IX(b), by = IY(b);
    ctx.strokeStyle = 'rgba(255,70,30,0.42)'; ctx.lineWidth = 2.4 * S;
    ctx.beginPath(); ctx.moveTo((bx - ux * len) * S, (by - cy - uy * len) * S); ctx.lineTo(bx * S, (by - cy) * S); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,190,120,0.95)'; ctx.lineWidth = 1 * S;
    ctx.beginPath(); ctx.moveTo((bx - ux * len) * S, (by - cy - uy * len) * S); ctx.lineTo(bx * S, (by - cy) * S); ctx.stroke();
  }
  ctx.restore();

  // bullets: hot tracer streaks along the flight vector, additive
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const b of G.bullets) {
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const ux = b.vx / sp, uy = b.vy / sp, len = 5.5;
    const bx = IX(b), by = IY(b);
    const hx = bx * S, hy = (by - cy) * S;
    const tx = (bx - ux * len) * S, ty = (by - cy - uy * len) * S;
    ctx.strokeStyle = 'rgba(255,150,50,0.40)'; ctx.lineWidth = 2.6 * S;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,225,150,0.95)'; ctx.lineWidth = 1.1 * S;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = 'rgba(255,245,215,1)';
    ctx.beginPath(); ctx.arc(hx, hy, 1.1 * S, 0, 7); ctx.fill();
  }
  ctx.restore();

  // enemies: every unit type now runs a full painted pose machine — walk views
  // picked from its own per-tick velocity, action sequences (fire, throw,
  // load-and-fire, bark), and continuous secondary motion (stride lean, recoil
  // kick, bank-into-the-drift) — so nobody on the field slides around frozen
  const ENEMY_FALLBACK = { officer: 'sprites/officer', lobber: 'sprites/lobber', mortar: 'props/obj-2' };
  const walkKey = (pfx, e) => {
    // face the way they are actually moving: side view when crossing, back
    // view when heading away, front view when closing on the player
    const vx = e.x - (e.vx0 !== undefined ? e.vx0 : e.x);
    const vy = e.y - (e.vy0 !== undefined ? e.vy0 : e.y);
    let view = 's';
    if (Math.abs(vx) > Math.abs(vy) * 1.2 && Math.abs(vx) > 0.05) view = 'e';
    else if (vy < -0.05) view = 'n';
    e.view = view;
    return `sprites/${pfx}-${view}-${(e.walkFrame || 0) & 3}`;
  };
  const drawEnemy = (e, ex, ey, corpse) => {
    let key, stride = false, kick = 0, preRot = 0;
    if (corpse || e.dieT !== undefined) {
      const t = e.dieT || 0;
      const fi = t < 8 ? 0 : t < 18 ? 1 : t < 30 ? 2 : 3;
      key = `sprites/${e.set || 'rif-die'}-${fi}`;
    } else if (e.type === 'moto') {
      key = `sprites/moto-${(e.walkFrame || 0) & 3}`;
      preRot = e.lean || 0; // banked into the drift, smoothed in the update
    } else if (e.type === 'mortar') {
      // load ritual: lift the shell (1), drop it in (2), the tube fires (3);
      // at rest the loader occasionally leans in to fuss with the elevation
      const fi = e.fireT > 15 ? 1 : e.fireT > 8 ? 2 : e.fireT > 0 ? 3 : ((e.t % 190) < 16 ? 2 : 0);
      key = `sprites/mortar-${fi}`;
    } else if (e.type === 'officer') {
      if (e.fireT > 0) { key = `sprites/off-act-${e.fireT > 9 ? 1 : 0}`; kick = Math.max(0, e.fireT - 12) * 0.35; }
      else if (e.barkT > 0) key = 'sprites/off-act-2'; // arm up, bellowing
      else { key = walkKey('off', e); stride = true; }
    } else if (e.type === 'lobber' || (e.type === 'trencher' && e.fireT > 0)) {
      // grenadiers: crouched walk plus a windup -> release -> recover throw;
      // a popped-up trencher borrows the throw so his grenade visibly leaves
      // a raised arm instead of materialising out of the trench
      if (e.fireT > 0) key = `sprites/lob-act-${e.fireT > 12 ? 1 : e.fireT > 5 ? 2 : 3}`;
      else if ((e.stepped || 0) > 0.04) { key = `sprites/lob-s-${(e.walkFrame || 0) & 3}`; stride = true; }
      else key = 'sprites/lob-act-0'; // crouched idle, grenade at the chest
    } else if (e.duckT > 0) {
      key = `sprites/rif-act-${e.duckT > 16 ? RIF_DUCK : RIF_POP}`;
    } else if (e.fireT > 0) {
      key = `sprites/rif-act-${RIF_FIRE}`;
      kick = Math.max(0, e.fireT - 12) * 0.35;
    } else {
      key = walkKey('rif', e);
      stride = true;
    }
    e._sprite = key;
    let img = IMGS[key];
    if (!img && /-[en]-/.test(key)) img = IMGS[key.replace(/-[en]-/, '-s-')];
    if (!img) img = IMGS[ENEMY_FALLBACK[e.type]] || IMGS['sprites/rifleman'];
    if (!img) {
      ctx.fillStyle = e.type === 'officer' ? '#4a7d3a' : '#8f8f9d';
      ctx.fillRect((ex - 4) * S, (ey - 8) * S, 8 * S, 12 * S);
      return;
    }
    // facing with hysteresis: engaged shooters face Joe (6px deadzone), side-on
    // walkers face their travel — nobody mirror-pops as Joe crosses their column
    let face = e.face || 1;
    if (!corpse && e.dieT === undefined) {
      if (e.type === 'moto') face = e.dir < 0 ? -1 : 1;
      else if (e.type === 'mortar') face = 1; // an emplacement does not swivel
      else if (e.fireT > 0 || e.barkT > 0 || e.mode === 'engage' || e.type === 'lobber' || e.type === 'trencher') {
        const ddx = G.joe.x - ex;
        if (Math.abs(ddx) > 6) face = ddx < 0 ? -1 : 1;
      } else if (e.view === 'e' && Math.abs(e.vdx || 0) > 0.03) {
        face = (e.vdx || 0) < 0 ? -1 : 1;
      }
      e.face = face;
    }
    let leanA = 0;
    if (stride && (e.stepped || 0) > 0.04)
      leanA = Math.sin(((e.walkFrame || 0) + (e.walkDist || 0) / WALK_STRIDE) * 1.57) * 0.03;
    drawShadow(ex, ey, corpse ? 6 : e.type === 'mortar' ? 7 : 4);
    const h = corpse ? ENEMY_H * 0.82 : e.type === 'moto' ? ENEMY_H * 1.25
      : e.type === 'mortar' ? ENEMY_H * 1.3 : e.type === 'officer' ? ENEMY_H + 1 : ENEMY_H;
    const w = h * (img.width / img.height);
    ctx.save();
    ctx.translate(ex * S, (ey + 4) * S);
    if (preRot) ctx.rotate(preRot); // screen-space bank, before the mirror
    ctx.scale(face, 1);
    if (leanA) ctx.rotate(leanA);
    if (kick) ctx.translate(0, kick * S);
    if (e.type === 'moto') ctx.translate(0, Math.sin((e.walk || 0) * 1.7) * 0.35 * S); // terrain judder
    ctx.drawImage(img, -w / 2 * S, -h * S, w * S, h * S);
    ctx.restore();
  };
  // prisoners: staked and waiting, then sprinting for the treeline once cut free
  for (const w of G.pows) {
    if (w.dead && w.t > 120) continue;
    const sy = w.y - cy;
    if (sy < -30 || sy > VIEW_H + 30) continue;
    const img = IMGS['props/obj-3'];
    drawShadow(w.x, sy, 3.5);
    ctx.save();
    if (w.dead) ctx.globalAlpha = Math.max(0, 1 - w.t / 120);
    if (img) {
      const h = w.freed ? HERO_H * 0.95 : HERO_H * 1.02, iw2 = h * (img.width / img.height);
      if (w.freed) ctx.translate(0, Math.sin(w.t * 0.4) * 0.6 * S); // running bob
      if (w.dead) { ctx.translate(w.x * S, (sy + 3) * S); ctx.rotate(1.4); ctx.translate(-w.x * S, -(sy + 3) * S); }
      ctx.drawImage(img, (w.x - iw2 / 2) * S, (sy - h + 4) * S, iw2 * S, h * S);
    } else { ctx.fillStyle = '#cbb08a'; ctx.fillRect((w.x - 3) * S, (sy - 12) * S, 6 * S, 12 * S); }
    ctx.restore();
    if (!w.freed && !w.dead && G.frame % 70 < 35) {
      ctx.fillStyle = '#e8d8b0'; ctx.font = `bold ${5 * S}px monospace`;
      ctx.textAlign = 'center'; ctx.fillText('!', w.x * S, (sy - 16) * S); ctx.textAlign = 'start';
    }
  }

  // supply pickups, bobbing so they read as collectable
  for (const pu of G.pickups) {
    const img = IMGS[pu.kind === 'ammo' ? 'props/obj-0' : 'props/obj-1'];
    const py2 = pu.y - cy + Math.sin(pu.t * 0.12) * 0.8;
    drawShadow(pu.x, pu.y - cy, 3);
    if (img) {
      const h = 11, w = h * (img.width / img.height);
      ctx.drawImage(img, (pu.x - w / 2) * S, (py2 - h) * S, w * S, h * S);
    } else { ctx.fillStyle = '#c8a24a'; ctx.fillRect((pu.x - 4) * S, (py2 - 6) * S, 8 * S, 6 * S); }
    if (pu.t % 60 < 30) { // glint
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,230,150,0.20)';
      ctx.beginPath(); ctx.arc(pu.x * S, (py2 - 4) * S, 7 * S, 0, 7); ctx.fill(); ctx.restore();
    }
  }

  // incoming mortar rounds: a growing target ring warns where it will land
  for (const sh of G.shells) {
    const k = IT(sh) / sh.ttl;
    const sy = sh.ty - cy;
    if (sy < -20 || sy > VIEW_H + 20) continue;
    ctx.strokeStyle = `rgba(255,90,50,${0.25 + 0.5 * k})`;
    ctx.lineWidth = 0.9 * S;
    ctx.beginPath(); ctx.arc(sh.tx * S, sy * S, (14 * (1 - k) + 4) * S, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(sh.tx * S, sy * S, 1.5 * S, 0, 7); ctx.stroke();
    // the shell itself arcing in
    const shx = sh.x + (sh.tx - sh.x) * k, shy = sh.y + (sh.ty - sh.y) * k;
    const z = Math.sin(Math.PI * k) * 26;
    ctx.fillStyle = 'rgba(30,25,10,0.28)';
    ctx.beginPath(); ctx.ellipse(shx * S, (shy - cy) * S, 2 * S, 1 * S, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#3c4a2a';
    ctx.beginPath(); ctx.arc(shx * S, (shy - cy - z) * S, 2.2 * S, 0, 7); ctx.fill();
  }

  for (const c of G.corpses) drawEnemy(c, c.x, c.y - cy, true);
  for (const e of G.enemies) drawEnemy(e, IX(e), IY(e) - cy, false);

  // joe: 8-way facing from three painted 4-frame run cycles (N/S/E, mirrored
  // for the west half) plus fire / crouch-fire / duck / throw poses and a
  // four-frame death collapse
  const J = G.joe;
  const joeVisible = J.alive ? (J.invuln > 0 ? G.frame % 6 < 4 : true) : true;
  if (joeVisible) {
    const fx = J.face.x, fy = J.face.y;
    let img = null, lean = 0;
    if (!J.alive) {
      // death collapse: frames 0-2 play out, frame 3 is the body on the ground
      const t = J.deathT || 0;
      const fi = t < 8 ? 0 : t < 18 ? 1 : t < 30 ? 2 : 3;
      img = IMGS[`sprites/hero-die-${fi}`];
    } else if (J.throwT > 0) {
      img = IMGS[`sprites/hero-act-${ACT_THROW}`];
    } else if (J.duck) {
      img = IMGS[`sprites/hero-act-${J.fireT > 0 ? ACT_CROUCH_FIRE : ACT_DUCK}`];
    } else if (J.fireT > 0) {
      img = IMGS[`sprites/hero-act-${ACT_FIRE}`];
    } else {
      const view = fx !== 0 ? 'e' : (fy > 0 ? 's' : 'n');
      const moving = J.moving;
      const frame = moving ? (J.walk & 3) : 0;
      img = IMGS[`sprites/hero-${view}-${frame}`];
      // continuous phase from distance covered — a frame-index sine snapped
      if (moving) lean = Math.sin((J.walk + J.walkDist / WALK_STRIDE) * 1.57) * 0.035;
    }
    if (!img) img = IMGS['sprites/hero'];
    if (img) {
      const jx = IX(J), jy = IY(J);
      drawShadow(jx, jy - cy, J.alive ? 4 : 6);
      const dead = !J.alive;
      const h = dead ? HERO_H * 0.82 : HERO_H, w = h * (img.width / img.height);
      ctx.save();
      const flip = fx < 0 ? -1 : 1;
      ctx.translate(jx * S, (jy - cy + 4) * S); ctx.scale(flip, 1);
      if (lean) ctx.rotate(lean);
      if (J.recoil > 0) ctx.translate(0, J.recoil * 0.5 * S); // kick back from the shot
      ctx.drawImage(img, -w / 2 * S, -h * S, w * S, h * S);
      ctx.restore();
    } else {
      drawShadow(IX(J), IY(J) - cy, 4);
      ctx.fillStyle = '#3b6fd4';
      ctx.fillRect((J.x - 4) * S, (J.y - cy - 8) * S, 8 * S, 12 * S);
    }
  }

  // fx
  for (const f of G.fx) {
    if (f.kind === 'muzzle') {
      // directional star flash: bright teardrop along the shot with cross spikes
      const a = (1 - f.t / 4) * (0.5 + 0.5 * Settings.flash);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.translate(f.x * S, (f.y - cy) * S);
      ctx.rotate(Math.atan2(f.dy === undefined ? -1 : f.dy, f.dx || 0));
      let mg = ctx.createRadialGradient(2 * S, 0, 0, 2 * S, 0, 7 * S);
      mg.addColorStop(0, `rgba(255,246,205,${a})`);
      mg.addColorStop(0.35, `rgba(255,180,70,${a * 0.7})`);
      mg.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.ellipse(2.6 * S, 0, 5.6 * S, 2.3 * S, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = `rgba(255,235,170,${a * 0.9})`;
      ctx.lineWidth = 0.8 * S; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(8.5 * S, 0);
      ctx.moveTo(1.6 * S, -2.6 * S); ctx.lineTo(1.6 * S, 2.6 * S);
      ctx.stroke();
      ctx.restore();
      continue;
    }
    if (f.kind === 'impact') {
      // hit confirm: three short sparks fanning on from the bullet vector
      const a = (1 - f.t / 5);
      const sp = Math.hypot(f.dx || 0, f.dy || -1) || 1;
      const ux = (f.dx || 0) / sp, uy = (f.dy === undefined ? -1 : f.dy) / sp;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,225,150,${a})`;
      ctx.lineWidth = 0.9 * S; ctx.lineCap = 'round';
      for (const ang of [-0.5, 0, 0.5]) {
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const rx = ux * ca - uy * sa, ry = ux * sa + uy * ca;
        const l0 = (1 + f.t * 0.8), l1 = l0 + 3.2;
        ctx.beginPath();
        ctx.moveTo((f.x + rx * l0) * S, (f.y - cy + ry * l0) * S);
        ctx.lineTo((f.x + rx * l1) * S, (f.y - cy + ry * l1) * S);
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }
    if (f.kind === 'bonus') {
      // bounty floater: "+1000" drifting up off the officer's body
      const a = 1 - f.t / 24;
      ctx.fillStyle = `rgba(255,210,87,${a})`;
      ctx.font = `bold ${7 * S}px monospace`; ctx.textAlign = 'center';
      ctx.fillText('+' + OFFICER_BONUS, f.x * S, (f.y - cy - f.t * 0.55) * S);
      ctx.textAlign = 'start';
      continue;
    }
    if (f.kind === 'rescue') {
      const a = 1 - f.t / 24;
      ctx.strokeStyle = `rgba(180,255,150,${a})`; ctx.lineWidth = 1.2 * S;
      ctx.beginPath(); ctx.arc(f.x * S, (f.y - cy) * S, (4 + f.t * 0.9) * S, 0, 7); ctx.stroke();
      continue;
    }
    if (f.kind === 'bigboom') {
      // staged: white-hot core -> shockwave ring -> rolling multi-blob fireball
      // -> smoke. Blob jitter is seeded from position + coarse time, so replays
      // and QA screenshots stay deterministic while the fire still roils.
      const T2 = f.t, a = 1 - T2 / 30;
      const fl = 0.5 + 0.5 * Settings.flash;
      const ex2 = f.x * S, ey2 = (f.y - cy) * S;
      ctx.fillStyle = `rgba(70,58,44,${a * 0.5})`;
      ctx.beginPath(); ctx.arc(ex2, ey2, (5 + T2 * 1.6) * S, 0, 7); ctx.fill();
      if (T2 < 14) {
        ctx.strokeStyle = `rgba(255,225,175,${(1 - T2 / 14) * 0.5 * fl})`;
        ctx.lineWidth = Math.max(1, 2.6 - T2 * 0.16) * S;
        ctx.beginPath(); ctx.arc(ex2, ey2, (3 + T2 * 2.5) * S, 0, 7); ctx.stroke();
      }
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      if (T2 < 4) {
        ctx.fillStyle = `rgba(255,252,235,${(1 - T2 / 4) * fl})`;
        ctx.beginPath(); ctx.arc(ex2, ey2, (5 + T2 * 3) * S, 0, 7); ctx.fill();
      }
      let hh = ((f.x * 73856093) ^ (f.y * 19349663) ^ ((T2 >> 1) * 83492791)) >>> 0;
      const jr = () => { hh = (hh * 1103515245 + 12345) >>> 0; return ((hh >>> 9) / 8388608) - 1; };
      for (let bi = 0; bi < 4; bi++) {
        const ox2 = jr() * (2 + T2 * 0.28) * S;
        const oy2 = jr() * (2 + T2 * 0.22) * S - T2 * 0.22 * S; // fire climbs
        const r = (2.2 + T2 * 0.55) * (0.72 + 0.28 * (((bi * 37 + T2) % 5) / 4)) * S;
        const g2 = ctx.createRadialGradient(ex2 + ox2, ey2 + oy2, 0, ex2 + ox2, ey2 + oy2, r);
        g2.addColorStop(0, `rgba(255,${215 - T2 * 5},95,${a * fl * 0.85})`);
        g2.addColorStop(0.6, `rgba(235,${115 - T2 * 2},45,${a * 0.5})`);
        g2.addColorStop(1, 'rgba(120,40,20,0)');
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(ex2 + ox2, ey2 + oy2, r, 0, 7); ctx.fill();
      }
      ctx.restore();
    } else {
      ctx.fillStyle = f.kind === 'boom' ? `rgba(255,${180 - f.t * 6},60,${1 - f.t / 24})` : `rgba(255,255,255,${1 - f.t / 24})`;
      ctx.beginPath(); ctx.arc(f.x * S, (f.y - cy) * S, (2 + f.t * 0.6) * S, 0, 7); ctx.fill();
    }
  }
  // fire glow (flicker, additive) + smoke/ember particles above everything
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const GLOWS = FIRES.concat(G.props.filter(p => p.burn > 0).map(p => ({ x: p.x, y: p.y, r: p.r * 1.8 })));
  for (const f of GLOWS) {
    const fy = f.y - cy;
    if (fy < -50 || fy > VIEW_H + 50) continue;
    const flick = 0.55 + 0.2 * Math.sin(G.frame * 0.31) + 0.15 * Math.sin(G.frame * 0.73 + 1.7);
    const a = flick * (0.35 + 0.45 * Settings.flash);
    const gl2 = ctx.createRadialGradient(f.x * S, fy * S, 0, f.x * S, fy * S, f.r * S);
    gl2.addColorStop(0, `rgba(255,170,60,${a * 0.5})`);
    gl2.addColorStop(0.5, `rgba(255,110,30,${a * 0.22})`);
    gl2.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = gl2;
    ctx.beginPath(); ctx.arc(f.x * S, fy * S, f.r * S, 0, 7); ctx.fill();
  }
  for (const p of G.parts) {
    if (p.kind === 'ember') {
      const a = 1 - p.t / p.ttl;
      ctx.fillStyle = `rgba(255,${160 + (p.t * 7) % 60},60,${a})`;
      ctx.fillRect((p.x - 0.5) * S, (p.y - cy - 0.5) * S, S, S);
    } else if (p.kind === 'spark') {
      const a = 1 - p.t / p.ttl;
      ctx.fillStyle = `rgba(255,210,120,${a})`;
      ctx.fillRect((p.x - 0.5) * S, (p.y - cy - 0.5) * S, S, S);
    }
  }
  ctx.restore();
  for (const p of G.parts) {
    if (p.kind === 'smoke') {
      const a = Math.min(0.34, (1 - p.t / p.ttl) * 0.4) * Math.min(1, p.t / 10);
      ctx.fillStyle = `rgba(38,36,32,${a})`;
      ctx.beginPath(); ctx.arc(p.x * S, (p.y - cy) * S, p.size * S, 0, 7); ctx.fill();
    } else if (p.kind === 'dust') {
      const a = (1 - p.t / p.ttl) * 0.42;
      ctx.fillStyle = `rgba(196,170,124,${a})`;
      ctx.beginPath(); ctx.arc(p.x * S, (p.y - cy) * S, (p.size + p.t * 0.06) * S, 0, 7); ctx.fill();
    }
  }

  ctx.restore(); // end screen-shake transform (HUD and overlays never shake)

  // brief warm frame-flash on big detonations (capped by the flash setting,
  // photosensitivity-safe: default 0.6 -> peak alpha ~0.08 for 5 frames)
  if (G.flashT > 0) {
    ctx.fillStyle = `rgba(255,220,170,${(G.flashT / 5) * 0.13 * Settings.flash})`;
    ctx.fillRect(0, 0, VIEW_W * S, VIEW_H * S);
  }

  // ---------- HUD + screen cards ----------
  const scrim = (a) => { ctx.fillStyle = `rgba(5,8,4,${a})`; ctx.fillRect(0, 0, VIEW_W * S, VIEW_H * S); };
  const textC = (str, y, size, color, bold) => {
    ctx.fillStyle = color; ctx.font = `${bold ? 'bold ' : ''}${size * S}px monospace`;
    ctx.textAlign = 'center'; ctx.fillText(str, VIEW_W / 2 * S, y * S); ctx.textAlign = 'start';
  };
  const blink = G.frame % 50 < 30;
  const hudOn = G.state === 'intro' || G.state === 'ready' || G.state === 'play' || G.state === 'dead' || G.state === 'clear';

  if (hudOn) {
    // reference-style framed panels: portrait+score, objective banner,
    // weapon/grenade card, circular minimap. Gameplay rules untouched.
    const panel = (px, py, pw, phh) => {
      ctx.fillStyle = 'rgba(8,10,6,0.72)'; ctx.fillRect(px * S, py * S, pw * S, phh * S);
      ctx.strokeStyle = 'rgba(212,178,90,0.55)'; ctx.lineWidth = 0.6 * S;
      ctx.strokeRect((px + 0.4) * S, (py + 0.4) * S, (pw - 0.8) * S, (phh - 0.8) * S);
    };
    // top-left: portrait, score, lives
    panel(2, 2, 96, 27);
    const por = IMGS['ui/portrait'];
    if (por) {
      ctx.drawImage(por, 4 * S, 4 * S, 23 * S, 23 * S);
      ctx.strokeStyle = 'rgba(212,178,90,0.8)'; ctx.lineWidth = 0.5 * S;
      ctx.strokeRect(4 * S, 4 * S, 23 * S, 23 * S);
    }
    ctx.fillStyle = '#d4b25a'; ctx.font = `bold ${5 * S}px monospace`;
    ctx.fillText('1P', 31 * S, 9 * S);
    ctx.fillStyle = '#fff'; ctx.font = `bold ${8 * S}px monospace`;
    ctx.fillText(String(G.score).padStart(7, '0'), 31 * S, 18 * S);
    for (let i = 0; i < Math.min(6, Math.max(0, G.lives)); i++) { ctx.fillStyle = '#7da05a'; ctx.fillRect((32 + i * 7) * S, 21 * S, 5 * S, 5 * S); }
    ctx.fillStyle = '#9a916f'; ctx.font = `${4.5 * S}px monospace`; ctx.fillText('×' + Math.max(0, G.lives), 78 * S, 26 * S);
    // top-right: objective banner + status line
    const obj = G.camY > 1265 ? 'REACH THE BRIDGE' : G.camY > 900 ? 'CROSS THE BRIDGE' : G.camY > 300 ? 'BREAK THE TRENCH LINE' : 'BREACH THE GATE';
    panel(VIEW_W - 112, 2, 110, 27);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#d4b25a'; ctx.font = `bold ${4.5 * S}px monospace`;
    ctx.fillText('OBJECTIVE ★', (VIEW_W - 6) * S, 9 * S);
    ctx.fillStyle = '#fff'; ctx.font = `bold ${5.5 * S}px monospace`;
    ctx.fillText(obj, (VIEW_W - 6) * S, 17 * S);
    const mmode = (window.Music && Music.mode) || 'original';
    ctx.fillStyle = '#9a916f'; ctx.font = `${4.5 * S}px monospace`;
    ctx.fillText(`POW ${G.rescued}/${G.pows.length} · TOP ${G.top} · ♪ ${mmode.toUpperCase()} [M]`, (VIEW_W - 6) * S, 25 * S);
    ctx.textAlign = 'start';
    // bottom-left: weapon card
    const wy = VIEW_H - 30;
    panel(2, wy, 76, 27);
    const rifle = IMGS['ui/rifle'];
    if (rifle) ctx.drawImage(rifle, 5 * S, (wy + 5) * S, 34 * S, 11 * S);
    ctx.fillStyle = '#9a916f'; ctx.font = `${4 * S}px monospace`; ctx.fillText('RIFLE', 6 * S, (wy + 23) * S);
    ctx.fillStyle = G.ammo <= 20 ? (G.frame % 30 < 15 ? '#ff6a4a' : '#c8a24a') : '#e8d8b0';
    ctx.font = `bold ${6 * S}px monospace`;
    ctx.fillText(String(G.ammo).padStart(3, '0'), 24 * S, (wy + 23) * S);
    for (let i = 0; i < Math.min(6, G.grenades); i++) {
      ctx.fillStyle = '#5d7a3a';
      ctx.beginPath(); ctx.ellipse((48 + i * 5) * S, (wy + 10) * S, 1.8 * S, 2.4 * S, 0, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#fff'; ctx.font = `bold ${5 * S}px monospace`; ctx.fillText('×' + G.grenades, 47 * S, (wy + 23) * S);
    ctx.fillStyle = '#9a916f'; ctx.font = `${4 * S}px monospace`;
    ctx.fillText('[' + Settings.keys.grenade.replace('Key', '') + ']', 63 * S, (wy + 23) * S);
    // circular minimap (moves up out of the fire zone once touch is in use)
    const mmx = VIEW_W - 26, mmy = touchUI.seen ? 82 : VIEW_H - 28, mr = 20;
    ctx.save();
    ctx.beginPath(); ctx.arc(mmx * S, mmy * S, mr * S, 0, 7); ctx.clip();
    ctx.fillStyle = 'rgba(12,16,8,0.82)'; ctx.fillRect((mmx - mr) * S, (mmy - mr) * S, mr * 2 * S, mr * 2 * S);
    const winH = 700, wy0 = G.camY + 112 - winH / 2;
    const mapX = (wx) => (mmx - mr) + wx / VIEW_W * mr * 2;
    const mapY = (wyy) => (mmy - mr) + (wyy - wy0) / winH * mr * 2;
    const rb0 = mapY(925), rb1 = mapY(1043);
    ctx.fillStyle = 'rgba(60,110,120,0.55)'; ctx.fillRect((mmx - mr) * S, rb0 * S, mr * 2 * S, Math.max(1, rb1 - rb0) * S);
    ctx.fillStyle = 'rgba(190,190,200,0.55)'; ctx.fillRect((mmx - mr) * S, mapY(58) * S, mr * 2 * S, 1.2 * S);
    ctx.strokeStyle = 'rgba(200,170,110,0.5)'; ctx.lineWidth = 1.4 * S;
    ctx.beginPath();
    const spine = [[137, 1840], [150, 1500], [128, 1265], [137, 1040], [126, 930], [137, 700], [150, 535], [150, 300], [137, 58]];
    let started = false;
    for (const [sx2, sy2] of spine) {
      const yy = mapY(sy2);
      if (yy < mmy - mr - 6 || yy > mmy + mr + 6) { started = false; continue; }
      if (!started) { ctx.moveTo(mapX(sx2) * S, yy * S); started = true; }
      else ctx.lineTo(mapX(sx2) * S, yy * S);
    }
    ctx.stroke();
    for (const e of G.enemies) { ctx.fillStyle = '#e04030'; ctx.beginPath(); ctx.arc(mapX(e.x) * S, mapY(e.y) * S, 1.1 * S, 0, 7); ctx.fill(); }
    const jx2 = mapX(G.joe.x), jy2 = mapY(G.joe.y);
    ctx.fillStyle = '#7de04a';
    ctx.beginPath(); ctx.moveTo(jx2 * S, (jy2 - 1.9) * S); ctx.lineTo((jx2 - 1.5) * S, (jy2 + 1.5) * S); ctx.lineTo((jx2 + 1.5) * S, (jy2 + 1.5) * S); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(212,178,90,0.6)'; ctx.lineWidth = 0.8 * S;
    ctx.beginPath(); ctx.arc(mmx * S, mmy * S, mr * S, 0, 7); ctx.stroke();
    ctx.fillStyle = '#d4b25a'; ctx.font = `bold ${4 * S}px monospace`; ctx.textAlign = 'center';
    ctx.fillText('N', mmx * S, (mmy - mr + 5.5) * S); ctx.textAlign = 'start';
  }

  if (G.state === 'title') {
    const ka = IMGS['ui/keyart.webp'];
    if (ka) {
      // cover-fit the painted key art, then darken so the lettering reads
      const sc = Math.max(VIEW_W / ka.width, VIEW_H / ka.height);
      const kw = ka.width * sc, kh = ka.height * sc;
      ctx.drawImage(ka, (VIEW_W - kw) / 2 * S, (VIEW_H - kh) / 2 * S, kw * S, kh * S);
      scrim(0.34);
      const grd = ctx.createLinearGradient(0, 0, 0, VIEW_H * 0.55 * S);
      grd.addColorStop(0, 'rgba(5,8,4,0.62)'); grd.addColorStop(1, 'rgba(5,8,4,0)');
      ctx.fillStyle = grd; ctx.fillRect(0, 0, VIEW_W * S, VIEW_H * 0.55 * S);
    } else scrim(0.62);
    textC('COMMANDO', 72, 30, '#e8d8b0', true);
    textC('HD', 95, 16, '#e8b34a', true);
    textC('A TRIBUTE TO THE CLASSIC', 110, 7, '#c9c0a6');
    // banner behind the call to action and credits so they read over the art
    ctx.fillStyle = 'rgba(5,8,4,0.55)';
    ctx.fillRect(0, 168 * S, VIEW_W * S, 14 * S);
    ctx.fillRect(0, 192 * S, VIEW_W * S, 22 * S);
    if (blink) textC('PRESS FIRE TO START', 178, 9, '#fff', true);
    textC('ORIGINAL © CAPCOM 1985 · AMIGA VERSION ELITE 1989', 201, 5, '#9a9280');
    textC('NON-COMMERCIAL FAN REMAKE — ALL-NEW ART & SOUND', 210, 5, '#9a9280');
    ctx.fillStyle = '#9ac'; ctx.font = `${5 * S}px monospace`;
    ctx.fillText('⚙ SETTINGS [ESC]', 6 * S, 10 * S);
  } else if (G.state === 'ranking') {
    scrim(0.8);
    textC('RANKING', 44, 14, '#e33', true);
    textC('BEST SEVEN', 60, 8, '#e8d8b0');
    textC(scoreMode.toUpperCase() + ' MODE', 70, 5, '#8a836e');
    const t = loadScores();
    ctx.font = `${7 * S}px monospace`;
    for (let i = 0; i < 7; i++) {
      const [nm, sc] = t[i];
      const hot = G.lastEntry && nm === G.lastEntry && sc === G.score;
      ctx.fillStyle = hot ? '#ffd257' : '#cfc8b0';
      ctx.textAlign = 'left'; ctx.fillText(`${i + 1}  ${nm}`, 62 * S, (84 + i * 15) * S);
      ctx.textAlign = 'right'; ctx.fillText(String(sc).padStart(6, ' '), 214 * S, (84 + i * 15) * S);
      ctx.textAlign = 'start';
    }
    if (!G.postGame && blink) textC('PRESS FIRE TO START', 208, 7, '#fff');
  } else if (G.state === 'credits') {
    scrim(0.85);
    textC('COMMANDO HD', 48, 14, '#e8d8b0', true);
    textC('A TRIBUTE TO THE CLASSIC', 63, 7, '#b8b09a');
    const lines = [
      'ORIGINAL GAME © CAPCOM 1985 (ARCADE)',
      'AMIGA VERSION — ELITE SYSTEMS 1989',
      'C64 MUSIC — ROB HUBBARD',
      'HIGH-SCORE THEME — MARTIN GALWAY',
      'MODERN SOUNDTRACK & SFX — ELEVENLABS',
      'ALL-NEW PAINTERLY ART',
    ];
    for (let i = 0; i < lines.length; i++) textC(lines[i], 96 + i * 14, 6, '#cfc8b0');
    textC('A NON-COMMERCIAL FAN REMAKE', 96 + lines.length * 14 + 6, 5.5, '#8a836e');
  } else if (G.state === 'intro') {
    scrim(0.55);
    textC('AREA ' + G.area, 102, 20, '#e8d8b0', true);
    if (G.area > AREAS.length) textC('LOOP ' + (Math.floor((G.area - 1) / AREAS.length) + 1), 88, 6, '#c8a24a');
    textC(A.title || 'LANDING ZONE — FORTRESS GATE', 124, 7, '#b8b09a');
  } else if (G.state === 'ready') {
    textC('PLAYER 1 READY', 110, 8, '#fff', true);
  } else if (G.state === 'clear') {
    scrim(0.35);
    textC('AREA ' + G.area + ' SECURED', 92, 14, '#e8d8b0', true);
    textC('BONUS ' + G.tally, 118, 10, '#ffd257', true);
    if (G.pows.length) textC(`PRISONERS RESCUED ${G.rescued}/${G.pows.length}`, 134, 6, '#b8e0a0');
    if (G.finale) textC(G.finale.officer === 'down' ? `ENEMY OFFICER ELIMINATED  +${OFFICER_BONUS}` : 'THE OFFICER GOT AWAY…', 148, 6,
      G.finale.officer === 'down' ? '#ffd257' : '#9a9280');
  } else if (G.state === 'gameover') {
    scrim(0.55);
    textC('GAME OVER', 108, 16, '#e33', true);
  } else if (G.state === 'entry') {
    scrim(0.8);
    const E = G.entry;
    textC('YOU MADE THE BEST SEVEN', 40, 9, '#ffd257', true);
    textC('ENTER YOUR NAME', 56, 7, '#b8b09a');
    textC(String(G.score).padStart(6, '0'), 78, 10, '#fff', true);
    const isEnd = E.ci === ENTRY_CHARS.length;
    const cur = isEnd ? '■' : ENTRY_CHARS[E.ci];
    const x0 = VIEW_W / 2 - 8 * 8;
    ctx.font = `bold ${11 * S}px monospace`;
    for (let i = 0; i < 8; i++) {
      let ch = E.name[i] || '';
      let col = '#e8d8b0';
      if (i === E.name.length) { ch = blink ? cur : ' '; col = '#ffd257'; }
      ctx.textAlign = 'center';
      if (ch && ch !== ' ') ctx.fillStyle = col, ctx.fillText(ch, (x0 + i * 16 + 8) * S, 112 * S);
      ctx.textAlign = 'start';
      ctx.fillStyle = i === E.name.length ? '#ffd257' : '#6a6350';
      ctx.fillRect((x0 + i * 16 + 1) * S, 116 * S, 14 * S, 1.2 * S);
    }
    textC('UP/DOWN LETTER · FIRE LOCK · LEFT ERASE', 156, 6, '#8a836e');
    textC('FIRE ON ■ = DONE', 168, 6, '#8a836e');
  } else if (G.state === 'continue') {
    scrim(0.6);
    textC('CONTINUE?', 80, 16, '#ffd257', true);
    textC(String(Math.max(0, Math.ceil(G.stateTimer / 50))), 114, 22, '#fff', true);
    if (blink) textC('PRESS FIRE — RESUME FROM CHECKPOINT', 148, 7, '#e8d8b0');
    textC('SCORE KEEPS · NORMAL MODE', 162, 5, '#8a836e');
  } else if (G.state === 'settings') {
    scrim(0.88);
    textC('SETTINGS', 28, 12, '#e8d8b0', true);
    ctx.font = `${6 * S}px monospace`;
    for (let i = 0; i < SETTINGS_ITEMS.length; i++) {
      const it = SETTINGS_ITEMS[i];
      const y = 46 + i * 11.5;
      const sel = i === G.settingsSel;
      ctx.fillStyle = sel ? '#ffd257' : '#cfc8b0';
      ctx.textAlign = 'left';
      ctx.fillText((sel ? '> ' : '  ') + it.label, 40 * S, y * S);
      let val = '';
      if (it.type === 'pct') val = Math.round(Settings[it.k] * 100) + '%';
      else if (it.type === 'bool') val = Settings[it.k] ? 'ON' : 'OFF';
      else if (it.type === 'mode') val = Settings.mode.toUpperCase();
      else if (it.type === 'track') val = ((window.Music && Music.mode) || 'original').toUpperCase();
      else if (it.type === 'key') val = (G.remap === it.k) ? 'PRESS KEY…' : Settings.keys[it.k];
      if (val) { ctx.textAlign = 'right'; ctx.fillText(val, 234 * S, y * S); }
      ctx.textAlign = 'start';
    }
    textC('ARROWS NAVIGATE/ADJUST · FIRE SELECT · ESC BACK', 212, 4.5, '#8a836e');
    textC('MODE CHANGE APPLIES TO YOUR NEXT GAME', 220, 4.5, '#8a836e');
  }
  if (G.paused && G.state === 'play') {
    scrim(0.3);
    textC('PAUSED', 104, 14, '#fff', true);
    textC('SPACE RESUME · ESC SETTINGS', 122, 6, '#b8b09a');
  }

  ctx.fillStyle = '#888'; ctx.font = `${4 * S}px monospace`;
  ctx.fillText('v0.24.0-finale', (VIEW_W - 54) * S, (VIEW_H - 3) * S);

  // touch overlays (only once touch is in use)
  if (touchUI.seen) {
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.3 * S;
    if (touchUI.stick) {
      const st = touchUI.stick;
      ctx.beginPath(); ctx.arc(st.ox * S, st.oy * S, 16 * S, 0, 7); ctx.stroke();
      const ndx = st.cx - st.ox, ndy = st.cy - st.oy, nd = Math.hypot(ndx, ndy) || 1, cl = Math.min(nd, 14);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc((st.ox + ndx / nd * cl) * S, (st.oy + ndy / nd * cl) * S, 7 * S, 0, 7); ctx.fill();
    }
    const fbx = Settings.leftHand ? VIEW_W - FIRE_BTN.x : FIRE_BTN.x;
    const gbx = Settings.leftHand ? VIEW_W - GREN_BTN.x : GREN_BTN.x;
    ctx.beginPath(); ctx.arc(fbx * S, FIRE_BTN.y * S, FIRE_BTN.r * S, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(gbx * S, GREN_BTN.y * S, GREN_BTN.r * S, 0, 7); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `${5 * S}px monospace`;
    ctx.fillText('FIRE', (fbx - 9) * S, (FIRE_BTN.y + 2) * S);
    ctx.fillText('G×' + G.grenades, (gbx - 8) * S, (GREN_BTN.y + 2) * S);
    ctx.globalAlpha = 1;
  }
}

// ---------- retro filter: true-lores downsample + 8-step palette + scanlines ----------
// (house rule: discrete palette steps only — continuous shading kills the look)
let retroCanvas = null, retroCtx = null;
function applyRetro() {
  if (!retroCanvas) {
    retroCanvas = document.createElement('canvas');
    retroCanvas.width = VIEW_W; retroCanvas.height = VIEW_H;
    retroCtx = retroCanvas.getContext('2d', { willReadFrequently: true });
  }
  retroCtx.imageSmoothingEnabled = true;
  retroCtx.drawImage(canvas, 0, 0, VIEW_W, VIEW_H);
  const img = retroCtx.getImageData(0, 0, VIEW_W, VIEW_H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = (d[i] >> 5) << 5;
    d[i + 1] = (d[i + 1] >> 5) << 5;
    d[i + 2] = (d[i + 2] >> 5) << 5;
  }
  retroCtx.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(retroCanvas, 0, 0, VIEW_W * S, VIEW_H * S);
  if (Settings.scanlines) {
    ctx.globalAlpha = 0.16; ctx.fillStyle = '#000';
    for (let y = S - 1; y < VIEW_H * S; y += S) ctx.fillRect(0, y, VIEW_W * S, 1);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
}

// ---------- main loop: fixed 50Hz logic, rAF render ----------
let acc = 0, last = performance.now(), frozen = false;
function loop(now) {
  requestAnimationFrame(loop);
  if (frozen) { render(); if (Settings.retro) applyRetro(); return; }
  pollGamepad();
  acc += Math.min(100, now - last); last = now;
  const stepMs = 1000 / LOGIC_HZ;
  while (acc >= stepMs) { tick(); acc -= stepMs; }
  render(acc / stepMs);
  if (Settings.retro) applyRetro();
}
requestAnimationFrame(loop);

// pause on background (mobile lifecycle): freeze logic, silence audio, and
// drop into the pause menu during play for a safe resume
document.addEventListener('visibilitychange', () => {
  last = performance.now();
  if (document.hidden) {
    frozen = true;
    if (G.state === 'play') G.paused = true;
    if (window.Music) Music.suspend();
    try { if (window.Sfx && Sfx.ctx) Sfx.ctx.suspend(); } catch (e) {}
  } else {
    frozen = qaFrozen;
    if (window.Music) Music.resume();
    try { if (window.Sfx && Sfx.ctx) Sfx.ctx.resume(); } catch (e) {}
  }
});
let qaFrozen = false;

// ---------- QA hooks (?qa=1) ----------
if (qa) {
  window.__qa = {
    state: () => ({ state: G.state, frame: G.frame, wt: G.wt, score: G.score, lives: G.lives, grenades: G.grenades, area: G.area, diff: diffMul(), loop: loopN(), finale: G.finale ? { phase: G.finale.phase, spawned: G.finale.spawned, officer: G.finale.officer } : null, paused: G.paused, mode: Settings.mode, cp: G.cp, continues: G.continues, sel: G.settingsSel, joe: { x: G.joe.x, y: G.joe.y, alive: G.joe.alive, invuln: G.joe.invuln }, camY: G.camY, enemies: G.enemies.length, esig: G.enemies.map(e => (e.x | 0) + ':' + (e.y | 0)).join(','), bullets: G.bullets.length, nades: G.nades.length, shake: G.shake, touch: { dir: touchUI.dir, fire: touchUI.fire, gren: touchUI.gren, stick: !!touchUI.stick } }),
    freeze: (on) => { qaFrozen = frozen = !!on; },
    step: (n = 1) => { for (let i = 0; i < n; i++) tick(); render(); return window.__qa.state(); },
    input: (k, on) => { keys[k] = !!on; },
    seed: (s) => { seed = s | 0; },
    kill: () => killJoe(),
    score: (n) => { G.score = n | 0; },
    lives: (n) => { G.lives = n | 0; },
    toState: (s, t) => { setState(s, t || 60); return G.state; },
    scores: () => loadScores(),
    warp: (y) => { const cy2 = Math.max(0, Math.min(A.height - VIEW_H, y | 0)); G.camY = cy2; G.joe.y = cy2 + 150; G.joe.x = 137; return cy2; },
    tp: (x, y) => { G.joe.x = x; G.joe.y = y; return { x: G.joe.x, y: G.joe.y }; },
    // deterministic feel measurement: empty the field and hold enemies off, so
    // homing AI can't perturb a speed/fire reading (the emulator study hit the
    // same self-inflicted-aggro trap)
    calm: () => { G.enemies.length = 0; G.lobs.length = 0; G.corpses.length = 0; G.ebullets.length = 0; G.shells.length = 0; G.spawned.add(-1); G.calm = true; return true; },
    uncalm: () => { G.calm = false; G.spawned.clear(); return true; },
    invuln: (n) => { G.joe.invuln = n | 0; return G.joe.invuln; },
    give: (kind) => { G.pickups.push({ x: G.joe.x, y: G.joe.y, kind, t: 0 }); return true; },
    spawnType: (type, x, y) => { G.enemies.push(newEnemy(x !== undefined ? x : G.joe.x + 60, y !== undefined ? y : G.joe.y - 40, type, -1, 'traverse')); return type; },
    setArea: (n) => { G.area = Math.max(1, n | 0); return { area: G.area, diff: diffMul(), loop: loopN() }; },
    // massacre everything except fleeing officers through the normal destroy
    // path — scenario cleanup that still exercises corpses/vehicle explosions
    wipe: () => { for (const e of G.enemies) if (e.mode !== 'flee') destroyEnemy(e); G.enemies = G.enemies.filter(e => e.mode === 'flee'); return G.enemies.length; },
    // what each character is actually rendering this frame — lets QA assert the
    // animation advances rather than just trusting that sprites exist
    anim: () => ({
      joeFrame: G.joe.moving ? (G.joe.walk & 3) : 0,
      joePose: !G.joe.alive ? 'dead' : G.joe.throwT > 0 ? 'throw'
        : G.joe.duck ? (G.joe.fireT > 0 ? 'crouchfire' : 'duck')
        : G.joe.fireT > 0 ? 'fire' : (G.joe.moving ? 'run' : 'idle'),
      joeDeathFrame: G.joe.alive ? -1 : (G.joe.deathT < 8 ? 0 : G.joe.deathT < 18 ? 1 : G.joe.deathT < 30 ? 2 : 3),
      enemyFrames: G.enemies.map(e => (e.walkFrame || 0) & 3),
      enemyPoses: G.enemies.map(e => e.duckT > 16 ? 'duck' : e.duckT > 0 ? 'pop' : e.fireT > 0 ? 'fire' : 'walk'),
      enemyModes: G.enemies.map(e => e.dodgeT > 0 ? 'dodge' : e.mode),
      ebullets: G.ebullets.length,
      enemyPos: G.enemies.map(e => [Math.round(e.x), Math.round(e.y)]),
      lobs: G.lobs.length,
      ammo: G.ammo, pickups: G.pickups.length, shells: G.shells.length,
      rescued: G.rescued, powsFree: G.pows.filter(w => w.freed).length, powsDead: G.pows.filter(w => w.dead).length,
      enemyTypes: G.enemies.map(e => e.type),
      enemySprites: G.enemies.map(e => e._sprite || ''),
      barks: G.enemies.filter(e => e.barkT > 0).length,
      corpseSets: G.corpses.map(c => c.set),
      propsAlive: G.props.filter(p => !p.dead).length,
      propsDead: G.props.filter(p => p.dead).length,
      corpses: G.corpses.length,
      scorch: G.scorch.length, flash: G.flashT,
    }),
    blocked: (x, y) => maskBlocked(x, y),
    plateNames: () => PLATES.map(p => p.name + (p.mask ? '+mask' : '-NOMASK')),
    settings: (patch) => {
      if (patch && typeof patch === 'object') {
        if (patch.keys) { Object.assign(Settings.keys, patch.keys); delete patch.keys; }
        Object.assign(Settings, patch);
        if (patch.mode) { scoreMode = Settings.mode; G.top = loadScores()[0][1]; }
        applySettings();
      }
      return JSON.parse(JSON.stringify(Settings));
    },
    music: async () => { ensureMusic(); await new Promise(r => setTimeout(r, 1500)); return { music: window.Music ? Music.state() : null, sfx: window.Sfx ? Sfx.state() : null }; },
  };
  console.log('[qa] hooks ready');
}
})();
