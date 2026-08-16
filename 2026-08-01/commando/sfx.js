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

  // ======================= it134: engines & ambience =======================
  // Continuous voices (engine loops, jungle bed) are SYNTHESISED and managed
  // here; the game describes what should be audible once per tick via mix(),
  // and this module owns node lifecycles, smoothing, ducking and volume. A
  // watchdog silences everything if mix() stops arriving (pause, menus, tab
  // hidden) so no callsite ever has to remember to turn a loop off.
  _voices: {}, _mixStamp: 0, _birdAt: 0,

  flatNoise() {
    if (this._flat) return this._flat;
    const n = this.ctx.sampleRate * 1.5;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this._flat = buf;
    return buf;
  },
  _mkVoice(kind) {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { g.connect(pan); pan.connect(ctx.destination); } else g.connect(ctx.destination);
    const parts = [];
    const osc = (type, freq) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.start(); parts.push(o); return o; };
    const noiseSrc = () => { const s = ctx.createBufferSource(); s.buffer = this.flatNoise(); s.loop = true; s.start(); parts.push(s); return s; };
    const lp = (f, q) => { const b = ctx.createBiquadFilter(); b.type = 'lowpass'; b.frequency.value = f; if (q) b.Q.value = q; return b; };
    const v = { g, pan, parts, base: 0 };
    if (kind === 'moto') {
      // small single: two detuned saws + a putter LFO on the throttle
      const o1 = osc('sawtooth', 82), o2 = osc('sawtooth', 84.5);
      const f = lp(850);
      const am = ctx.createGain(); am.gain.value = 1;
      const lfo = osc('sine', 13); const lg = ctx.createGain(); lg.gain.value = 0.35;
      lfo.connect(lg); lg.connect(am.gain);
      o1.connect(f); o2.connect(f); f.connect(am); am.connect(g);
      v.rate = (r) => { o1.frequency.value = 82 * r; o2.frequency.value = 84.5 * r; lfo.frequency.value = 11 + 5 * r; };
      v.base = 0.16;
    } else if (kind === 'truck') {
      const o1 = osc('sawtooth', 45), o2 = osc('sine', 30);
      const f = lp(280);
      o1.connect(f); o2.connect(f); f.connect(g);
      v.base = 0.17;
    } else if (kind === 'tank') {
      const o1 = osc('sawtooth', 30);
      const n = noiseSrc(); const nf = lp(130);
      o1.connect(nf); n.connect(nf); nf.connect(g);
      v.base = 0.2;
    } else if (kind === 'ambDay') {
      // insect shimmer: narrow noise band, slow swell
      const n = noiseSrc();
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4300; bp.Q.value = 2.2;
      const am = ctx.createGain(); am.gain.value = 0.8;
      const lfo = osc('sine', 0.13); const lg = ctx.createGain(); lg.gain.value = 0.25;
      lfo.connect(lg); lg.connect(am.gain);
      n.connect(bp); bp.connect(am); am.connect(g);
      v.base = 0.05;
    } else if (kind === 'ambNight') {
      // crickets: a high tone gated fast, in slow bursts
      const o = osc('sine', 4150);
      const gate = ctx.createGain(); gate.gain.value = 0;
      const l1 = osc('square', 23); const l1g = ctx.createGain(); l1g.gain.value = 0.5;
      l1.connect(l1g); l1g.connect(gate.gain);
      const burst = ctx.createGain(); burst.gain.value = 0.6;
      const l2 = osc('sine', 0.6); const l2g = ctx.createGain(); l2g.gain.value = 0.4;
      l2.connect(l2g); l2g.connect(burst.gain);
      o.connect(gate); gate.connect(burst); burst.connect(g);
      v.base = 0.035;
    } else if (kind === 'ambRain') {
      const n = noiseSrc(); const f = lp(1100);
      const am = ctx.createGain(); am.gain.value = 0.9;
      const lfo = osc('sine', 0.07); const lg = ctx.createGain(); lg.gain.value = 0.18;
      lfo.connect(lg); lg.connect(am.gain);
      n.connect(f); f.connect(am); am.connect(g);
      v.base = 0.1;
    }
    return v;
  },
  // spec: { engines: {moto:{gain,pan,rate}|null, truck:..., tank:...}, ambient: 'day'|'night'|'rain'|null }
  mix(spec) {
    if (!this.ctx || this.ctx.state === 'closed') return;
    this._mixStamp = performance.now();
    if (!this._watchdog) {
      this._watchdog = setInterval(() => {
        if (performance.now() - this._mixStamp > 400) {
          for (const v of Object.values(this._voices)) v.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
        }
      }, 250);
    }
    const now = this.ctx.currentTime;
    const duck = now < this.duckUntil ? 0.35 : 1;
    const want = {};
    for (const [kind, p] of Object.entries(spec.engines || {})) if (p) want[kind] = p;
    const amb = spec.ambient;
    if (amb === 'day') want.ambDay = { gain: 1 };
    else if (amb === 'night') want.ambNight = { gain: 1 };
    else if (amb === 'rain') want.ambRain = { gain: 1 };
    for (const kind of ['moto', 'truck', 'tank', 'ambDay', 'ambNight', 'ambRain']) {
      const p = want[kind];
      let v = this._voices[kind];
      if (p) {
        if (!v) v = this._voices[kind] = this._mkVoice(kind);
        const target = v.base * (p.gain !== undefined ? p.gain : 1) * this.volume * duck;
        v._target = target;
        v.g.gain.setTargetAtTime(target, now, 0.09);
        if (v.pan && p.pan !== undefined) v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, p.pan)), now, 0.12);
        if (v.rate && p.rate !== undefined) v.rate(p.rate);
      } else if (v) {
        v._target = 0;
        v.g.gain.setTargetAtTime(0, now, 0.08);
      }
    }
    // sparse birds over the day bed
    if (amb === 'day' && now > this._birdAt) {
      this._birdAt = now + 4 + Math.random() * 8;
      const o = this.ctx.createOscillator(); o.type = 'sine';
      const f0 = 2400 + Math.random() * 900;
      o.frequency.setValueAtTime(f0, now);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.72, now + 0.16);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.05 * this.volume * duck, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      o.connect(g); this.out(g, (Math.random() * 2 - 1) * 0.7);
      o.start(now); o.stop(now + 0.2);
    }
  },
  mixState() {
    // report the TARGET, not the smoothed instantaneous value: under a
    // suspended context (headless) currentTime is frozen, setTargetAtTime
    // never progresses, and the live value reads 0 no matter what the mix
    // asked for — asserting on it made qa-audio a coin flip.
    const on = {};
    for (const [k, v] of Object.entries(this._voices)) on[k] = +(v._target || 0).toFixed(4);
    return on;
  },

  // mortar tube: a deep pitch-dropping cough, nothing like a rifle crack
  thunk({ pan = 0 } = {}) {
    if (!this.ctx || this.ctx.state === 'closed') return;
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(72, now);
    o.frequency.exponentialRampToValueAtTime(44, now + 0.14);
    const g = this.ctx.createGain();
    let g0 = this.volume * 0.5; if (now < this.duckUntil) g0 *= 0.45;
    g.gain.setValueAtTime(g0, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    o.connect(g); this.out(g, pan);
    o.start(now); o.stop(now + 0.24);
    const s = this.ctx.createBufferSource(); s.buffer = this.noise(0.1);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(g0 * 0.5, now);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    s.connect(f); f.connect(ng); this.out(ng, pan);
    s.start(now);
  },
  // tank cannon: a sub thump under a filtered crack. Loud enough to duck the mix.
  boom({ pan = 0 } = {}) {
    if (!this.ctx || this.ctx.state === 'closed') return;
    const now = this.ctx.currentTime;
    this.duckUntil = Math.max(this.duckUntil, now + 0.38);
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(58, now);
    o.frequency.exponentialRampToValueAtTime(34, now + 0.4);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(this.volume * 0.85, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    o.connect(g); this.out(g, pan);
    o.start(now); o.stop(now + 0.52);
    const s = this.ctx.createBufferSource(); s.buffer = this.noise(0.35);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(this.volume * 0.6, now);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    s.connect(f); f.connect(ng); this.out(ng, pan);
    s.start(now);
  },

  state() { return { ready: this.ready, loaded: Object.keys(this.buffers).length }; },
};

window.Sfx = Sfx;
})();
