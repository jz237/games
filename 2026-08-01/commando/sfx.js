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

  play(name, { rate = 1, gain = 1, variance = 0.06, pan = 0 } = {}) {
    const buf = this.buffers[name];
    if (!buf || !this.ctx) return;
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

  state() { return { ready: this.ready, loaded: Object.keys(this.buffers).length }; },
};

window.Sfx = Sfx;
})();
