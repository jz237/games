// sfx.js — WebAudio sound effects (all-new ElevenLabs renders, vendored locally).
// Slight per-play pitch variance keeps rapid repeats from sounding mechanical.
(() => {
'use strict';

const FILES = ['shot', 'explosion', 'enemy-down', 'player-death', 'ready'];

const Sfx = {
  ctx: null, buffers: {}, ready: false, volume: 0.8,

  async init() {
    if (this.ready || this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    await Promise.all(FILES.map(async (name) => {
      try {
        const r = await fetch('assets/sfx/' + name + '.mp3');
        const buf = await this.ctx.decodeAudioData(await r.arrayBuffer());
        this.buffers[name] = buf;
      } catch (e) { console.warn('[sfx] failed', name, e); }
    }));
    this.ready = true;
  },

  // it126 DUCKING: an explosion is the loudest thing on the field, so the
  // small sounds under it (shots, casings, footfalls) briefly step aside
  // instead of turning the mix to mush.
  duckUntil: 0,
  play(name, { rate = 1, gain = 1, variance = 0.06, pan = 0, duckable = true } = {}) {
    const buf = this.buffers[name];
    if (!buf || !this.ctx) return;
    const now = (this.ctx.currentTime || 0);
    if (name === 'explosion') this.duckUntil = now + 0.42;
    else if (duckable && now < this.duckUntil) gain *= 0.45;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * variance);
    const g = this.ctx.createGain();
    g.gain.value = this.volume * gain;
    src.connect(g);
    // positional stereo: callers pass the sound's screen position as pan [-1,1]
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p); p.connect(this.ctx.destination);
    } else g.connect(this.ctx.destination);
    src.start();
  },

  // --- it130: two synthesised voices ---------------------------------------
  // Footfalls and casing tinks are SYNTHESISED rather than rendered to files.
  // Both are a shaped burst of noise, they fire far more often than any other
  // sound in the game, and a stride-locked footstep sample repeated three times
  // a second is exactly where sample reuse starts to sound mechanical — the
  // per-play randomisation here is the point, not a workaround. Costs no
  // download, and stays all-original by construction.
  noise(dur = 0.09) {
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);  // decaying hiss
    return buf;
  },
  out(node, pan) {
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(p); p.connect(this.ctx.destination);
    } else node.connect(this.ctx.destination);
  },
  // boot on dirt: a low, soft noise thud with a touch of grit
  step({ gain = 1, pan = 0 } = {}) {
    if (!this.ctx || this.ctx.state === 'closed') return;
    const now = this.ctx.currentTime;
    let g0 = this.volume * gain * 0.34;
    if (now < this.duckUntil) g0 *= 0.45;
    if (g0 <= 0.001) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise(0.085);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420 + Math.random() * 260;   // vary the surface, step to step
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(g0, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    src.connect(lp); lp.connect(g);
    this.out(g, pan);
    src.start(now);
  },
  // brass on stone: two detuned partials, very short
  tink({ gain = 1, pan = 0 } = {}) {
    if (!this.ctx || this.ctx.state === 'closed') return;
    const now = this.ctx.currentTime;
    let g0 = this.volume * gain * 0.12;
    if (now < this.duckUntil) g0 *= 0.45;
    if (g0 <= 0.001) return;
    const base = 2300 + Math.random() * 1500;
    for (const [mul, amp] of [[1, 1], [1.87, 0.55]]) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = base * mul;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(g0 * amp, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
      o.connect(g);
      this.out(g, pan);
      o.start(now); o.stop(now + 0.06);
    }
  },

  state() { return { ready: this.ready, loaded: Object.keys(this.buffers).length }; },
};

window.Sfx = Sfx;
})();
