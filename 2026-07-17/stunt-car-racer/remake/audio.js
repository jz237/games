// Remake audio: reuses the ElevenLabs pack via a compact Web Audio mixer
// driven by window.__remake.state. QA: window.__remakeAudio.levels()
const FILES = {
  idle: 'audio/engine-idle.mp3', high: 'audio/engine-high.mp3', boost: 'audio/boost.mp3',
  air: 'audio/air.mp3', land: 'audio/land.mp3', crash: 'audio/crash.mp3',
  music: 'audio/music.mp3',
};
let ctx = null;
const bufs = {}, gains = {}, srcs = {};
let started = false, wasAir = false, airSince = 0, lastCrash = 0;

async function boot() {
  if (started) return;
  started = true;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  await Promise.all(Object.entries(FILES).map(async ([k, url]) => {
    const r = await fetch(url);
    bufs[k] = await ctx.decodeAudioData(await r.arrayBuffer());
  }));
  for (const k of ['idle', 'high', 'air', 'music', 'boost']) {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(ctx.destination);
    const s = ctx.createBufferSource();
    s.buffer = bufs[k]; s.loop = true;
    s.connect(g); s.start();
    gains[k] = g; srcs[k] = s;
  }
  requestAnimationFrame(tick);
}
function shot(k, vol) {
  if (!ctx || !bufs[k]) return;
  const g = ctx.createGain(); g.gain.value = vol; g.connect(ctx.destination);
  const s = ctx.createBufferSource(); s.buffer = bufs[k]; s.connect(g); s.start();
}
function tick() {
  requestAnimationFrame(tick);
  const R = window.__remake;
  if (!R || !ctx) return;
  const st = R.state;
  const VMAX = 92 * 181 / 48;
  const v = Math.min(1, st.speed / VMAX);
  const driving = st.driving;
  gains.music.gain.value = driving ? 0 : 0.45;
  const eng = driving ? 1 : 0;
  gains.idle.gain.value = eng * (1 - v) * 0.55;
  gains.high.gain.value = eng * v * 0.4;
  const rate = 0.7 + 0.85 * v;
  srcs.idle.playbackRate.value = rate;
  srcs.high.playbackRate.value = rate;
  gains.air.gain.value = driving && st.airborne ? 0.6 : 0;
  gains.boost.gain.value = driving && st.boosting ? 0.65 : 0;
  const now = performance.now() / 1000;
  if (st.airborne && !wasAir) airSince = now;
  if (!st.airborne && wasAir && now - airSince > 0.4 && driving) shot('land', 0.7);
  wasAir = st.airborne;
  if (driving && st.grind && now - lastCrash > 1.2 && st.speed > 40) {
    lastCrash = now; shot('crash', 0.5);
  }
}
window.addEventListener('pointerdown', boot, { once: true });
window.addEventListener('keydown', boot, { once: true });
window.__remakeAudio = {
  levels: () => ctx ? {
    music: gains.music.gain.value, idle: gains.idle.gain.value,
    high: gains.high.gain.value, air: gains.air.gain.value,
    rate: srcs.idle.playbackRate.value, ctx: ctx.state,
  } : null,
};
