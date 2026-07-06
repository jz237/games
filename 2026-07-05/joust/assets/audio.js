// Joust remake — audio: procedural WebAudio SFX (matches the arcade's DAC-synth families
// and the ROM SOUND TABLE priorities) + an original self-contained title theme.
// Arcade Joust had NO in-game music by design (SFX-only); music is title/menu only. See SPEC.md §12.
'use strict';
(function () {
const AC = window.AudioContext || window.webkitAudioContext;

// ROM SOUND TABLE priorities (higher wins preemption)
const PRIO = {
  flap: 10, walk: 8, thud: 18, cthud: 12, skid: 10, skidEnd: 10,
  eggCollect: 45, eggHatch: 45, eggDrop: 30, enemyDie: 40, playerDie: 80,
  ptero: 65, pteroDie: 66, troll: 50, lava: 60, spawn: 40, spawnP: 70,
  mount: 45, bounty: 50, cliff: 67, extraMan: 100, bait: 55, start: 200,
  bounce: 20, waveClear: 90, materialized: 40,
};

class AudioSys {
  constructor() {
    this.ac = null; this.sfxGain = null; this.musGain = null;
    this.sfxVol = 0.7; this.musVol = 0.5; this.ready = false;
    this.noiseBuf = null; this.voices = []; this.music = null;
  }
  init() {
    if (this.ac) return;
    this.ac = new AC();
    this.sfxGain = this.ac.createGain(); this.sfxGain.gain.value = this.sfxVol; this.sfxGain.connect(this.ac.destination);
    this.musGain = this.ac.createGain(); this.musGain.gain.value = this.musVol; this.musGain.connect(this.ac.destination);
    // white-noise buffer
    const n = this.ac.sampleRate * 0.5, b = this.ac.createBuffer(1, n, this.ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = b; this.ready = true;
  }
  resume() { if (this.ac && this.ac.state === 'suspended') this.ac.resume(); }
  setSfx(v) { this.sfxVol = v; if (this.sfxGain) this.sfxGain.gain.value = v; }
  setMus(v) { this.musVol = v; if (this.musGain) this.musGain.gain.value = v; }

  // ─── low-level ───
  now() { return this.ac.currentTime; }
  osc(type, f, t0, dur, gain, slideTo, dest) {
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || this.sfxGain); o.start(t0); o.stop(t0 + dur + 0.02);
    return o;
  }
  noise(t0, dur, gain, filtType, freq, q, slideTo) {
    const s = this.ac.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = this.ac.createBiquadFilter(); f.type = filtType || 'bandpass'; f.frequency.setValueAtTime(freq || 900, t0);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, slideTo), t0 + dur);
    f.Q.value = q || 1;
    const g = this.ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxGain); s.start(t0); s.stop(t0 + dur + 0.02);
    return s;
  }

  // priority-limited dispatch
  play(name) {
    if (!this.ready) return;
    this.resume();
    const t = this.now(), prio = PRIO[name] || 10;
    // prune expired voices
    this.voices = this.voices.filter(v => v.until > t);
    if (this.voices.length >= 6) {
      // drop lowest-priority active if new sound is higher
      let lowest = this.voices.reduce((a, b) => b.prio < a.prio ? b : a, this.voices[0]);
      if (prio <= lowest.prio) return; // new sound loses
    }
    const dur = this._synth(name, t);
    this.voices.push({ name, prio, until: t + (dur || 0.2) });
  }

  _synth(name, t) {
    const A = this;
    switch (name) {
      case 'flap': A.noise(t, 0.09, 0.25, 'bandpass', 480, 0.9, 1100); return 0.09;
      case 'walk': A.noise(t, 0.045, 0.14, 'bandpass', 320, 1.2); return 0.05;
      case 'thud': A.noise(t, 0.08, 0.35, 'lowpass', 260, 1); A.osc('sine', 120, t, 0.09, 0.18, 60); return 0.1;
      case 'cthud': A.noise(t, 0.12, 0.3, 'lowpass', 200, 1, 90); return 0.12;
      case 'skid': A.noise(t, 0.22, 0.2, 'bandpass', 900, 3, 300); return 0.22;
      case 'skidEnd': A.noise(t, 0.08, 0.14, 'bandpass', 400, 2); return 0.08;
      case 'eggDrop': A.osc('square', 700, t, 0.1, 0.12, 400); return 0.1;
      case 'eggCollect': A.osc('square', 700, t, 0.06, 0.16, 900); A.osc('square', 1050, t + 0.05, 0.09, 0.18, 1500); A.osc('square', 1500, t + 0.12, 0.1, 0.16, 2000); return 0.24;
      case 'eggHatch': A.osc('square', 900, t, 0.14, 0.16, 300); A.noise(t, 0.14, 0.12, 'bandpass', 700, 1); return 0.14;
      case 'enemyDie': A.osc('sawtooth', 520, t, 0.18, 0.22, 90); A.noise(t, 0.16, 0.16, 'bandpass', 500, 1, 120); return 0.2;
      case 'playerDie': A.osc('sawtooth', 440, t, 0.5, 0.28, 60); A.osc('square', 300, t, 0.5, 0.14, 50); A.noise(t, 0.4, 0.14, 'lowpass', 400, 1, 80); return 0.5;
      case 'ptero': { // Walsh-style harsh swept scream
        for (let i = 0; i < 3; i++) { A.osc('sawtooth', 300 + i * 40, t, 1.2, 0.10, 1400 + i * 200); }
        A.noise(t, 1.2, 0.10, 'bandpass', 1200, 2, 2600); return 1.2;
      }
      case 'pteroDie': A.osc('square', 1400, t, 0.05, 0.2, 1600); A.osc('square', 1200, t + 0.06, 0.05, 0.2, 1400); A.osc('square', 1000, t + 0.12, 0.05, 0.2, 1200); A.osc('sawtooth', 500, t + 0.2, 0.35, 0.22, 80); return 0.5;
      case 'troll': A.osc('sawtooth', 90, t, 0.4, 0.24, 55); A.noise(t, 0.4, 0.12, 'lowpass', 180, 1); return 0.4;
      case 'lava': A.noise(t, 0.6, 0.2, 'lowpass', 320, 1, 120); A.osc('sawtooth', 140, t, 0.6, 0.18, 50); return 0.6;
      case 'spawn': A.osc('sine', 300, t, 0.35, 0.16, 1400); return 0.35;
      case 'spawnP': A.osc('sine', 260, t, 0.5, 0.2, 1600); A.osc('triangle', 520, t, 0.5, 0.1, 1800); return 0.5;
      case 'materialized': A.osc('triangle', 900, t, 0.12, 0.14, 1600); return 0.12;
      case 'mount': A.osc('square', 500, t, 0.1, 0.14, 800); return 0.1;
      case 'bounty': for (let i = 0; i < 3; i++) A.osc('square', [660, 880, 1320][i], t + i * 0.09, 0.12, 0.18); return 0.4;
      case 'cliff': A.noise(t, 0.5, 0.3, 'lowpass', 300, 1, 80); A.osc('sawtooth', 80, t, 0.5, 0.2, 45); return 0.5;
      case 'extraMan': for (let i = 0; i < 4; i++) A.osc('square', [523, 659, 784, 1047][i], t + i * 0.08, 0.14, 0.2); return 0.5;
      case 'bait': A.osc('square', 1200, t, 0.08, 0.16, 700); A.osc('square', 900, t + 0.1, 0.08, 0.16, 1300); return 0.2;
      case 'bounce': A.osc('triangle', 800, t, 0.06, 0.2, 500); A.osc('triangle', 1100, t, 0.05, 0.14); return 0.08;
      case 'waveClear': for (let i = 0; i < 5; i++) A.osc('square', [523, 659, 784, 1047, 1319][i], t + i * 0.08, 0.16, 0.16); return 0.5;
      case 'start': for (let i = 0; i < 3; i++) A.osc('square', [392, 523, 784][i], t + i * 0.1, 0.18, 0.2); return 0.4;
      default: return 0.1;
    }
  }

  // ─── original title theme (self-contained chiptune loop, medieval/heroic) ───
  startMusic() {
    if (!this.ready || this.music) return;
    this.resume();
    const bpm = 132, beat = 60 / bpm, step = beat / 2; // 8th notes
    // A natural-minor heroic loop (2 bars x 4 phrases)
    const N = { A2: 110, C3: 130.8, D3: 146.8, E3: 164.8, F3: 174.6, G3: 196, A3: 220, C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, G4: 392, A4: 440, B4: 493.9, C5: 523.3, E5: 659.3 };
    const lead = ['A4','C5','E5','C5','B4','G4','A4','_','E4','G4','A4','B4','C5','_','A4','_',
                  'F4','A4','C5','A4','G4','E4','F4','_','D4','F4','A4','G4','E4','_','A4','_'];
    const bass = ['A2','A2','E3','E3','F3','F3','C3','C3','D3','D3','A2','A2','E3','E3','E3','E3',
                  'F3','F3','C3','C3','G3','G3','C3','C3','D3','D3','E3','E3','A2','A2','A2','A2'];
    this.music = { i: 0, next: this.now() + 0.1, N, lead, bass, step, stop: false };
    this._musicLoop();
  }
  _musicLoop() {
    if (!this.music || this.music.stop) return;
    const m = this.music, t = this.now();
    while (m.next < t + 0.2) {
      const st = m.i % m.lead.length, T = m.next;
      const ln = m.lead[st], bn = m.bass[st];
      if (ln && ln !== '_') { const f = m.N[ln]; this._note('square', f, T, m.step * 0.9, 0.12); this._note('triangle', f * 2, T, m.step * 0.5, 0.05); }
      if (bn && bn !== '_') this._note('sawtooth', m.N[bn], T, m.step * 0.95, 0.14, true);
      // hats
      if (st % 2 === 0) { const h = this.ac.createBufferSource(); h.buffer = this.noiseBuf; const g = this.ac.createGain(); const fl = this.ac.createBiquadFilter(); fl.type = 'highpass'; fl.frequency.value = 6000; g.gain.setValueAtTime(0.05, T); g.gain.exponentialRampToValueAtTime(0.0001, T + 0.05); h.connect(fl); fl.connect(g); g.connect(this.musGain); h.start(T); h.stop(T + 0.06); }
      m.next += m.step; m.i++;
    }
    this._mt = setTimeout(() => this._musicLoop(), 60);
  }
  _note(type, f, t, dur, gain, bass) {
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (bass) { const fl = this.ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 400; o.connect(fl); fl.connect(g); }
    else o.connect(g);
    g.connect(this.musGain); o.start(t); o.stop(t + dur + 0.02);
  }
  stopMusic() { if (this.music) { this.music.stop = true; clearTimeout(this._mt); this.music = null; } }
}

window.JOUST_AUDIO = { AudioSys };
})();
