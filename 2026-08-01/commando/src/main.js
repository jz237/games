// main.js — boot, area loading, menus, attract demo, continues, fixed-step
// loop and test hooks.
import * as THREE from 'three';
import { Renderer } from './render.js';
import { World } from './world.js';
import { FX } from './fx.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { Bot } from './bot.js';
import { AREAS, AMBIENCE } from './levels.js';
import { Soldier } from './soldier.js';
import { tankGroup, motoGroup, militaryTruckGroup } from './models2.js';
import { loadAssets, describe } from './assets.js';

const qs = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const store = { get(k, d) { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

const coarse = matchMedia('(pointer: coarse)').matches;
let quality = qs.get('q') || store.get('commandoHD3d.quality', coarse ? 'low' : 'high');
const R = new Renderer($('gl'), quality);
let world = null;
const fx = new FX(R.scene, R.camera, (x, p) => world.h(x, p), quality);
const hud = new HUD();
const audio = new Audio();
const input = new Input($('gl'));
const game = new Game({ R, fx, hud, audio });
const bot = new Bot(game);

let mode = 'title';          // title | play | paused | loading | continue | demo
// WATCH DEMO: the autopilot plays the whole campaign from Area 1, with the
// HUD, banners and music a player gets; any key or tap hands back to the title
let demoStartedAt = 0, demoFinished = false;
let manual = qs.has('test'); // tests drive the clock themselves
let botOn = false;
let startArea = clampArea(+(qs.get('area') || store.get('commandoHD3d.startArea', 1)));
let demoArea = startArea;
let contT = 0;
$('quality-mode').textContent = quality.toUpperCase();
$('area-mode').textContent = 'AREA ' + startArea;

function clampArea(n) { return Math.min(AREAS.length, Math.max(1, n | 0 || 1)); }

// ------------------------------------------------------------------ area loading
// builds the world for area n (synchronously) and compiles its shaders
function buildArea(n) {
  const area = AREAS[n - 1], amb = AMBIENCE[area.ambience || 'day'];
  if (world) world.dispose();
  world = new World(area, R.scene, quality, amb);
  R.applyAmbience(amb);
  fx.setRain(!!amb.rain);
  game.areaNum = n;
  game.setWorld(world);
  prewarm();
}
// show the area card, build behind it, then hand back
function loadArea(n, then) {
  const area = AREAS[n - 1];
  $('load-big').textContent = area.name;
  $('load-small').textContent = area.title;
  $('loading').classList.remove('hidden');
  const prev = mode; mode = 'loading';
  const go = () => { buildArea(n); $('loading').classList.add('hidden'); mode = prev === 'loading' ? 'play' : prev; then && then(); };
  if (manual) go(); else setTimeout(go, 60);   // let the card paint first
}

// ------------------------------------------------------------------ menus
function menuButtons(screen) { return [...$(screen).querySelectorAll('.menu button')]; }
let sel = 0;
function highlight(screen) { menuButtons(screen).forEach((b, i) => b.classList.toggle('sel', i === sel)); }
function menuAct(act) {
  audio.unlock();
  switch (act) {
    case 'start': startGame(); break;
    case 'demo': startWatchDemo(); break;
    case 'area': startArea = startArea % AREAS.length + 1; store.set('commandoHD3d.startArea', startArea); $('area-mode').textContent = 'AREA ' + startArea; break;
    case 'controls': $('controls-help').classList.toggle('hidden'); break;
    case 'music': { const m = audio.toggleMusic(); $('music-mode').textContent = m === 'original' ? 'SID' : 'MODERN'; break; }
    case 'quality': {
      quality = quality === 'high' ? 'low' : 'high'; store.set('commandoHD3d.quality', quality);
      R.setQuality(quality); $('quality-mode').textContent = quality.toUpperCase(); break;
    }
    case 'resume': setPaused(false); break;
    case 'restart': setPaused(false); game.startArea(); break;
    case 'quit': setPaused(false); toTitle(); break;
  }
}
for (const scr of ['title', 'pause']) {
  menuButtons(scr).forEach((b, i) => {
    b.addEventListener('click', () => { sel = i; highlight(scr); menuAct(b.dataset.act); });
    b.addEventListener('mouseenter', () => { sel = i; highlight(scr); });
  });
}
addEventListener('keydown', (e) => {
  if (mode === 'demo') { e.preventDefault(); if (performance.now() - demoStartedAt > 400) exitDemo(); return; }
  if (mode === 'continue') { if (['Space', 'Enter', 'KeyJ', 'KeyZ'].includes(e.code)) { e.preventDefault(); doContinue(); } return; }
  const scr = mode === 'title' ? 'title' : mode === 'paused' ? 'pause' : null;
  if (!scr) return;
  const n = menuButtons(scr).length;
  if (e.code === 'ArrowDown' || e.code === 'KeyS') { sel = (sel + 1) % n; highlight(scr); e.preventDefault(); }
  if (e.code === 'ArrowUp' || e.code === 'KeyW') { sel = (sel + n - 1) % n; highlight(scr); e.preventDefault(); }
  if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); menuAct(menuButtons(scr)[sel].dataset.act); }
  if (mode === 'paused' && (e.code === 'Escape' || e.code === 'KeyP')) setPaused(false);
});
addEventListener('pointerdown', () => {
  if (mode === 'continue') doContinue();
  else if (mode === 'demo' && performance.now() - demoStartedAt > 400) exitDemo();   // not the tap that started it
});

function renderHiscores() { $('hiscores').innerHTML = `HI-SCORE <b>${String(game.hi).padStart(7, '0')}</b>`; }

function startDemo() {
  botOn = true; input.forced = null;
  const go = () => { game.newGame({ demo: true }); game.godMode = false; };
  if (game.areaNum !== demoArea || !world) loadArea(demoArea, go); else go();
}
function toTitle() {
  mode = 'title'; sel = 0; highlight('title');
  $('demo-tag').classList.add('hidden');
  $('title').classList.remove('hidden'); $('pause').classList.add('hidden');
  hud.show(false); hud.hideBanner(); $('touch').classList.add('hidden');
  renderHiscores();
  audio.stopMusic();
  demoArea = game.areaNum || startArea;
  startDemo();
}
function startWatchDemo() {
  audio.unlock().then(() => audio.music('main'));
  botOn = true; input.forced = null;
  $('title').classList.add('hidden');
  hud.show(true); hud.hideBanner();
  $('touch').classList.add('hidden');
  $('demo-tag').classList.remove('hidden');
  mode = 'demo'; demoStartedAt = performance.now(); demoFinished = false;
  const go = () => { game.newGame({ showcase: true }); game.godMode = false; };
  if (game.areaNum !== 1 || !world) loadArea(1, go); else go();
}
function exitDemo() {
  $('demo-tag').classList.add('hidden');
  botOn = false;
  toTitle();
}
function startGame() {
  audio.unlock().then(() => audio.music('main'));
  botOn = false;
  $('title').classList.add('hidden');
  hud.show(true);
  if (input.touch.on || coarse) $('touch').classList.remove('hidden');
  mode = 'play';
  const go = () => game.newGame({ demo: false });
  if (game.areaNum !== startArea || !world) loadArea(startArea, go); else go();
}
function setPaused(on) {
  if (on && mode === 'play') { mode = 'paused'; sel = 0; highlight('pause'); $('pause').classList.remove('hidden'); audio.suspend(); }
  else if (!on && mode === 'paused') { mode = 'play'; $('pause').classList.add('hidden'); audio.resume(); input.pressed.clear(); }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

function doContinue() {
  if (mode !== 'continue') return;
  mode = 'play'; hud.hideBanner();
  audio.music('main');
  game.continueGame();
}

// ------------------------------------------------------------------ game events → presentation
function handleEvents() {
  // take the batch first: handlers can start a new area, which emits its own events
  const evs = game.events.splice(0);
  for (const ev of evs) {
    const live = mode !== 'title';
    const A = game.area;
    switch (ev.type) {
      case 'intro': if (live) hud.banner(game.loop > 1 ? `${A.name} — LOOP ${game.loop}` : A.name, A.title, 2.4); break;
      case 'respawn': if (live) hud.toast('BACK IN THE FIGHT'); break;
      case 'finale': if (live) hud.toast('THE GATE IS OPENING', 2.2); break;
      case 'officer': if (live) hud.toast('OFFICER RUNNING — TAKE HIM DOWN', 2.4); break;
      case 'officer-escaped': if (live) hud.toast('THE OFFICER GOT AWAY'); break;
      case 'officer-down': if (live) hud.toast('OFFICER DOWN  +2000'); break;
      case 'gate-open': if (live) hud.toast('GATE CLEAR — GET INSIDE', 2.4); break;
      case 'extra-life': if (live) hud.toast('EXTRA LIFE'); break;
      case 'alarm': if (live) hud.toast('ALARM! SPOTTED BY THE SEARCHLIGHT', 2.2); break;
      case 'tank': if (live) hud.toast('TANK! GRENADES ONLY', 2.4); break;
      case 'tank-down': if (live) hud.toast('TANK DESTROYED  +3000'); break;
      case 'moto': if (live && game.motos.length === 1) hud.toast('MOTORCYCLE!', 1.2); break;
      case 'clear':
        if (live) {
          hud.banner(ev.last ? 'MISSION ACCOMPLISHED' : 'AREA CLEAR', `BONUS ${ev.bonus}\nPRISONERS RESCUED ${game.rescued}`, 5.5);
          if (mode === 'demo' && ev.last) demoFinished = true;
          audio.music('clear');
        }
        break;
      case 'area-done':
        if (mode === 'demo' && demoFinished) { exitDemo(); break; }   // mission accomplished — the demo is over
        nextArea(); break;
      case 'gameover':
        if (live) { hud.banner('GAME OVER', `SCORE ${game.score}`, 30); audio.music('gameover'); }
        break;
      case 'gameover-done':
        if (mode === 'title') { demoArea = demoArea % AREAS.length + 1; startDemo(); }
        else if (mode === 'demo') { hud.toast('DEMO CONTINUES', 1.6); audio.music('main'); game.continueGame(); }   // an arcade credit, never a stop
        else { mode = 'continue'; contT = 9.99; }
        break;
    }
  }

}
// on to the next area — after the last one the mission loops, harder
function nextArea() {
  const n = game.areaNum % AREAS.length + 1;
  if (n === 1) game.loop++;
  if (mode === 'title') demoArea = n;
  loadArea(n, () => game.startArea());
}

// ------------------------------------------------------------------ loop
const STEP = 1 / 60;
let acc = 0, last = performance.now(), t = 0;
const perf = { n: 0, sum: 0, checked: false };

function simStep() {
  if (mode === 'paused' || mode === 'loading' || !world) return;
  const raw = input.poll();
  if (mode === 'continue') {
    contT -= STEP;
    hud.banner('CONTINUE?', `${Math.ceil(contT)}\nPRESS FIRE`, 1);
    if (raw.fire) { doContinue(); return; }
    if (contT <= 0) { mode = 'play'; toTitle(); return; }
    game.update(STEP, null);
    handleEvents();
    return;
  }
  if (mode === 'play' && raw.pause) { setPaused(true); return; }
  const I = (mode === 'title' || botOn) ? bot.intent(STEP) : raw;
  game.update(STEP, I);
  handleEvents();
}

function frame(dt) {
  if (!world) return;
  t += dt;
  game.syncVisuals(dt);
  R.focus.set(game.camX, 0, -game.camP);
  if (fx.rainFocus) fx.rainFocus.copy(R.focus);
  world.update(t);
  fx.update(dt);
  R.update(dt, t);
  const J = game.joe;
  R.grade.uniforms.uHurt.value = Math.max(J.hurtFlash > 0 ? J.hurtFlash * 0.8 : 0, J.alive && J.hp === 1 ? 0.25 + Math.sin(t * 5) * 0.1 : 0);
  hud.update(game, dt);
  R.render();
}

let frames = 0, worst = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  frames++; worst = Math.max(worst, dt);
  if (manual) return;
  acc += dt;
  let n = 0;
  const t0 = performance.now();
  while (acc >= STEP && n < 5) { simStep(); acc -= STEP; n++; }
  if (n === 5) acc = 0;
  const t1 = performance.now();
  frame(dt);
  const t2 = performance.now();
  if (qs.has('prof') && (t2 - t0 > 30 || dt > 0.05)) console.log(`[slow] dt=${(dt * 1000) | 0} sim=${(t1 - t0).toFixed(1)} frame=${(t2 - t1).toFixed(1)} enemies=${game.enemies.length} corpses=${game.corpses.length}`);
  // one-time perf check: drop to LOW if the first seconds of play are heavy
  if (!perf.checked && mode === 'play') {
    perf.n++; perf.sum += dt;
    if (perf.n === 240) {
      perf.checked = true;
      if (perf.sum / perf.n > 0.024 && quality === 'high' && !qs.get('q')) { quality = 'low'; R.setQuality('low'); $('quality-mode').textContent = 'LOW'; hud.toast('QUALITY SET TO LOW FOR SMOOTHNESS'); }
    }
  }
}

// ------------------------------------------------------------------ shader pre-warm
// compile every shader this area can use up front, so the first soldier,
// truck, tank or blast never hitches. The scene is drawn into the composer's
// render target (linear, no tone mapping), so compile against that target.
function prewarm() {
  const warm = [], men = [], z0 = -world.area.spawn.p - 4;
  ['joe', 'rifle', 'lobber', 'officer', 'pow'].forEach((k, i) => { const s = new Soldier(k); s.obj.position.set(-4 + i * 2, 0, z0); s.a.dead = i === 1 ? 0.5 : 0; s.pose(0.016); R.scene.add(s.obj); men.push(s); });
  for (const [mk, x] of [[militaryTruckGroup, 6], [tankGroup, -8], [motoGroup, 9]]) { const v = mk(); v.position.set(x, 0, z0); R.scene.add(v); warm.push(v); }
  const nade = new THREE.Mesh(game.nadeGeo, game.nadeMat); nade.position.set(0, 1, z0); R.scene.add(nade); warm.push(nade);
  const shell = new THREE.Mesh(game.shellGeo, game.shellMat); shell.position.set(1, 1, z0); R.scene.add(shell); warm.push(shell);
  for (const k of ['gren', 'med']) { const m = new THREE.Mesh(game.pickupGeo[k], game.pickupMat[k]); m.position.set(2, 0.3, z0); R.scene.add(m); warm.push(m); }
  fx.explosion(0, 0, z0, 3); fx.muzzle(0, 1, z0, 0, 1); fx.ring(0, z0, 0, 2, 1, [1, 0.2, 0.1]); fx.blob(0, z0, 0, 0.3); fx.dust(0, 0, z0, 3);
  fx.trList.push({ x: 0, p: -z0, y: 1, vx: 0, vp: 30 }, { x: 1, p: -z0, y: 1, vx: 0, vp: 30, enemy: true });
  fx.laser(0, 0, 3, z0, 2, 1, z0, 0.8);
  fx.update(0.016);
  R.focus.set(0, 0, -world.area.spawn.p); R.update(0.016, 0);
  const rt = R.composer.renderTarget1;
  R.r.setRenderTarget(rt);
  try { R.r.compile(R.scene, R.camera); } catch (e) {}
  R.r.setRenderTarget(null);
  R.render();
  // one render of the whole area from far above with an area-sized shadow
  // frustum, so every shadow-pass variant is built now, not mid-fight
  const cam = R.camera, sc = R.sun.shadow.camera, mid = -world.area.length / 2;
  const save = { l: sc.left, r: sc.right, t: sc.top, b: sc.bottom, far: cam.far };
  Object.assign(sc, { left: -60, right: 60, top: 160, bottom: -160, far: 400 }); sc.updateProjectionMatrix();
  R.sun.target.position.set(0, 0, mid); R.sun.position.set(R.sunDir.x * 150, R.sunDir.y * 150, mid + R.sunDir.z * 150);
  cam.far = 2000; cam.position.set(0, 700, mid + 1); cam.lookAt(0, 0, mid); cam.updateProjectionMatrix();
  R.r.setRenderTarget(rt); R.r.render(R.scene, cam); R.r.setRenderTarget(null);
  Object.assign(sc, { left: save.l, right: save.r, top: save.t, bottom: save.b, far: 140 }); sc.updateProjectionMatrix();
  cam.far = save.far; cam.updateProjectionMatrix();
  for (const o of warm) R.scene.remove(o);
  for (const s of men) s.dispose();
  fx.clear();
}

// ------------------------------------------------------------------ boot
$('load-small').textContent = 'LOADING MODELS…';
try {
  await loadAssets((f) => { $('load-small').textContent = `LOADING MODELS ${Math.round(f * 100)}%`; });
} catch (e) {
  $('load-small').textContent = 'COULD NOT LOAD THE GAME MODELS — PLEASE RELOAD';
  throw e;
}
buildArea(startArea);
$('loading').classList.add('hidden');
toTitle();
if (qs.has('play')) startGame();
requestAnimationFrame((n) => { last = n; loop(n); });

// ------------------------------------------------------------------ test hooks
window.__cmd = {
  assets: describe,
  game, R, fx, autopilot: bot,
  get world() { return world; },
  manual(on = true) { manual = on; },
  step(n = 1, render = true) { for (let i = 0; i < n; i++) simStep(); if (render) frame(STEP * n); return game.snapshot(); },
  // advance n sim steps, rendering every `every` steps (cheap long runs)
  run(n, every = 30) { for (let i = 0; i < n; i++) { simStep(); if (i % every === every - 1) frame(STEP * every); } frame(STEP); return game.snapshot(); },
  start(opts = {}) {
    if (opts.area) { startArea = clampArea(opts.area); }
    startGame(); botOn = !!opts.bot; game.godMode = !!opts.god; return game.snapshot();
  },
  area(n) { buildArea(clampArea(n)); game.startArea(); return game.snapshot(); },
  bot(on = true) { botOn = on; },
  watchDemo() { startWatchDemo(); return mode; },
  demoState: () => ({ mode, demoFinished, area: game.areaNum, loop: game.loop, continues: game.continues, lives: game.lives, score: game.score, rescued: game.rescued, tally: game.deathTally || {} }),
  god(on = true) { game.godMode = on; },
  input(I) { input.forced = I; },
  state: () => game.snapshot(),
  mode: () => mode,
  warp(p, x = 0) {
    const J = game.joe; J.p = p; J.x = x; J.px = x; J.pp = p;
    game.camP = p + R.offJoe; game.prevCamP = game.camP;
    // skip the encounters we jumped past
    game.area.encounters.forEach((e, i) => { if (e.at < game.viewTop() - 2) game.encDone.add(i); });
    return game.snapshot();
  },
  frames: (reset) => { const r = { frames, worst }; if (reset) { frames = 0; worst = 0; } return r; },
  info: () => ({ calls: R.r.info.render.calls, tris: R.r.info.render.triangles, geos: R.r.info.memory.geometries, tex: R.r.info.memory.textures, progs: R.r.info.programs.length, quality }),
};
