// Joust remake — audio: plays the ORIGINAL Joust sound effects, rendered by emulating the
// Williams sound board (6800 + MC1408 DAC running the real VSNDRM4 sound ROM). See SPEC.md §12.
// Samples live in assets/audio/ (vendored, CSP-clean). Falls back to synth if they fail to load.
// Arcade Joust has NO in-game music (Newcomer's design); an original title theme plays on menus only.
'use strict';
(function () {
const AC = window.AudioContext || window.webkitAudioContext;
const VER = (window.__V || window.JOUST_AUDIO_VER || '2.0.2'); // single source: window.__V (index.html)

// ROM SOUND-TABLE priorities (higher wins preemption)
const PRIO = {
  flap: 10, walk: 8, thud: 18, cthud: 12, skid: 10, skidEnd: 10,
  eggCollect: 45, eggHatch: 45, eggDrop: 30, enemyDie: 40, playerDie: 80,
  ptero: 65, pteroDie: 66, troll: 50, lava: 60, spawn: 40, spawnP: 70,
  mount: 45, bounty: 50, cliff: 67, extraMan: 100, bait: 55, start: 200,
  bounce: 20, waveClear: 90, materialized: 40,
};
// game event/name → rendered sample (some alternate between two)
const MAP = {
  flap: ['flap_down', 'flap_up'], walk: ['run1', 'run2'], thud: 'thud', cthud: 'cliff_thud',
  skid: 'skid', skidEnd: 'skid_end', eggDrop: 'thud', eggCollect: 'egg', eggHatch: 'egg_hatch',
  eggLand: 'thud', enemyDie: 'die', playerDie: 'die', ptero: 'ptero_intro', pteroDie: 'die',
  troll: 'troll', lava: 'lava', spawn: 'transporter_enemy', materialized: 'transporter_player',
  mount: 'mount', bounty: 'bounty', cliff: 'cliff', extraMan: 'extra_man', bait: 'ptero_scream',
  bounce: 'thud', waveClear: 'game_start', start: 'game_start', credit: 'credit',
};

class AudioSys {
  constructor() {
    this.ac = null; this.sfxGain = null; this.musGain = null;
    this.sfxVol = 0.7; this.musVol = 0.5; this.ready = false;
    this.buffers = {}; this.voices = []; this.music = null; this.noiseBuf = null;
    this._alt = {}; this.loaded = false;
  }
  init() {
    if (this.ac) return;
    this.ac = new AC();
    this.sfxGain = this.ac.createGain(); this.sfxGain.gain.value = this.sfxVol; this.sfxGain.connect(this.ac.destination);
    this.musGain = this.ac.createGain(); this.musGain.gain.value = this.musVol; this.musGain.connect(this.ac.destination);
    const n = this.ac.sampleRate * 0.5, nb = this.ac.createBuffer(1, n, this.ac.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb; this.ready = true;
    this.loadSamples();
  }
  async loadSamples() {
    if (this.loaded) return; this.loaded = true;
    // base + theme are overridable so the modern 3D edition can reuse this system from its own dir
    const BASE = (typeof window !== 'undefined' && window.__JOUST_AUDIO_BASE) || 'assets/audio/';
    const THEME = (typeof window !== 'undefined' && window.__JOUST_THEME) || (BASE + 'title-theme.ogg');
    try {
      const q = '?v=' + VER;
      const man = await (await fetch(BASE + 'manifest.json' + q)).json();
      await Promise.all(man.samples.map(async s => {
        try { const ab = await (await fetch(BASE + s.file + q)).arrayBuffer(); this.buffers[s.name] = await this.ac.decodeAudioData(ab); } catch (e) {}
      }));
      // original title/menu theme (menus only; gameplay stays SFX-only)
      try { const ab = await (await fetch(THEME + q)).arrayBuffer(); this.titleBuf = await this.ac.decodeAudioData(ab); if (this._wantMusic) this.startMusic(); } catch (e) {}
    } catch (e) { /* keep synth fallback */ }
  }
  resume() { if (this.ac && this.ac.state === 'suspended') this.ac.resume(); }
  setSfx(v) { this.sfxVol = v; if (this.sfxGain) this.sfxGain.gain.value = v; }
  setMus(v) { this.musVol = v; if (this.musGain) this.musGain.gain.value = v; }
  now() { return this.ac.currentTime; }

  play(name) {
    if (!this.ready) return;
    this.resume();
    const t = this.now(), prio = PRIO[name] || 10;
    this.voices = this.voices.filter(v => v.until > t);
    if (this.voices.length >= 6) { const lo = this.voices.reduce((a, b) => b.prio < a.prio ? b : a, this.voices[0]); if (prio <= lo.prio) return; }
    let dur = 0.2;
    let samp = MAP[name];
    if (Array.isArray(samp)) { const k = (this._alt[name] = (this._alt[name] || 0) + 1) & 1; samp = samp[k]; }
    const buf = samp && this.buffers[samp];
    if (buf) {
      const src = this.ac.createBufferSource(); src.buffer = buf;
      const g = this.ac.createGain(); g.gain.value = 1; src.connect(g); g.connect(this.sfxGain); src.start(t); dur = buf.duration;
    } else { dur = this._synth(name, t) || 0.2; }  // fallback
    this.voices.push({ name, prio, until: t + Math.min(dur, 2.2) });
  }

  // minimal synth fallback (only used if a sample is missing)
  osc(type, f, t0, dur, gain, slideTo) { const o = this.ac.createOscillator(), g = this.ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t0); if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.connect(g); g.connect(this.sfxGain); o.start(t0); o.stop(t0 + dur + 0.02); }
  noise(t0, dur, gain, freq, q, slideTo) { const s = this.ac.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; const f = this.ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(freq || 900, t0); if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, slideTo), t0 + dur); f.Q.value = q || 1; const g = this.ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); s.connect(f); f.connect(g); g.connect(this.sfxGain); s.start(t0); s.stop(t0 + dur + 0.02); }
  _synth(name, t) {
    switch (name) {
      case 'flap': this.noise(t, 0.09, 0.25, 480, 0.9, 1100); return 0.09;
      case 'walk': this.noise(t, 0.045, 0.14, 320, 1.2); return 0.05;
      case 'thud': case 'cthud': case 'bounce': case 'eggLand': case 'eggDrop': this.noise(t, 0.08, 0.3, 260, 1); this.osc('sine', 120, t, 0.09, 0.18, 60); return 0.1;
      case 'skid': this.noise(t, 0.22, 0.2, 900, 3, 300); return 0.22;
      case 'eggCollect': this.osc('square', 700, t, 0.06, 0.16, 900); this.osc('square', 1200, t + 0.06, 0.1, 0.18, 1800); return 0.18;
      case 'eggHatch': this.osc('square', 900, t, 0.14, 0.16, 300); return 0.14;
      case 'enemyDie': case 'pteroDie': this.osc('sawtooth', 520, t, 0.18, 0.22, 90); this.noise(t, 0.16, 0.16, 500, 1, 120); return 0.2;
      case 'playerDie': this.osc('sawtooth', 440, t, 0.5, 0.28, 60); this.noise(t, 0.4, 0.14, 400, 1, 80); return 0.5;
      case 'ptero': case 'bait': for (let i = 0; i < 3; i++) this.osc('sawtooth', 300 + i * 40, t, 1.0, 0.1, 1400); return 1.0;
      case 'troll': this.osc('sawtooth', 90, t, 0.4, 0.24, 55); return 0.4;
      case 'lava': this.noise(t, 0.6, 0.2, 320, 1, 120); return 0.6;
      case 'spawn': case 'materialized': this.osc('sine', 300, t, 0.4, 0.16, 1400); return 0.4;
      case 'mount': this.osc('square', 500, t, 0.1, 0.14, 800); return 0.1;
      case 'bounty': for (let i = 0; i < 3; i++) this.osc('square', [660, 880, 1320][i], t + i * 0.09, 0.12, 0.18); return 0.4;
      case 'cliff': this.noise(t, 0.5, 0.3, 300, 1, 80); return 0.5;
      case 'extraMan': for (let i = 0; i < 4; i++) this.osc('square', [523, 659, 784, 1047][i], t + i * 0.08, 0.14, 0.2); return 0.5;
      case 'waveClear': case 'start': for (let i = 0; i < 3; i++) this.osc('square', [392, 523, 784][i], t + i * 0.1, 0.18, 0.2); return 0.4;
      default: return 0.12;
    }
  }

  // ─── original title theme (menus only) — plays the generated loop if loaded, else synth ───
  startMusic() {
    if (!this.ready) return; this._wantMusic = true; this.resume();
    if (this.titleSrc) return;                     // already playing the theme
    if (this.titleBuf) {                           // generated ElevenLabs loop
      // the synth fallback may already be running (the theme decodes async) — silence it first
      if (this.music) { this.music.stop = true; clearTimeout(this._mt); this.music = null; }
      const src = this.ac.createBufferSource(); src.buffer = this.titleBuf; src.loop = true;
      src.connect(this.musGain); src.start(); this.titleSrc = src; return;
    }
    if (this.music) return;
    const bpm = 132, beat = 60 / bpm, step = beat / 2;
    const N = { A2: 110, C3: 130.8, D3: 146.8, E3: 164.8, F3: 174.6, G3: 196, A3: 220, C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, G4: 392, A4: 440, B4: 493.9, C5: 523.3, E5: 659.3 };
    const lead = ['A4','C5','E5','C5','B4','G4','A4','_','E4','G4','A4','B4','C5','_','A4','_','F4','A4','C5','A4','G4','E4','F4','_','D4','F4','A4','G4','E4','_','A4','_'];
    const bass = ['A2','A2','E3','E3','F3','F3','C3','C3','D3','D3','A2','A2','E3','E3','E3','E3','F3','F3','C3','C3','G3','G3','C3','C3','D3','D3','E3','E3','A2','A2','A2','A2'];
    this.music = { i: 0, next: this.now() + 0.1, N, lead, bass, step, stop: false }; this._musicLoop();
  }
  _musicLoop() {
    if (!this.music || this.music.stop) return; const m = this.music, t = this.now();
    while (m.next < t + 0.2) {
      const st = m.i % m.lead.length, T = m.next, ln = m.lead[st], bn = m.bass[st];
      if (ln && ln !== '_') { this._note('square', m.N[ln], T, m.step * 0.9, 0.12); this._note('triangle', m.N[ln] * 2, T, m.step * 0.5, 0.05); }
      if (bn && bn !== '_') this._note('sawtooth', m.N[bn], T, m.step * 0.95, 0.14, true);
      if (st % 2 === 0) { const h = this.ac.createBufferSource(); h.buffer = this.noiseBuf; const g = this.ac.createGain(); const fl = this.ac.createBiquadFilter(); fl.type = 'highpass'; fl.frequency.value = 6000; g.gain.setValueAtTime(0.05, T); g.gain.exponentialRampToValueAtTime(0.0001, T + 0.05); h.connect(fl); fl.connect(g); g.connect(this.musGain); h.start(T); h.stop(T + 0.06); }
      m.next += m.step; m.i++;
    }
    this._mt = setTimeout(() => this._musicLoop(), 60);
  }
  _note(type, f, t, dur, gain, bass) { const o = this.ac.createOscillator(), g = this.ac.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); if (bass) { const fl = this.ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 400; o.connect(fl); fl.connect(g); } else o.connect(g); g.connect(this.musGain); o.start(t); o.stop(t + dur + 0.02); }
  stopMusic() { this._wantMusic = false; if (this.titleSrc) { try { this.titleSrc.stop(); } catch (e) {} this.titleSrc = null; } if (this.music) { this.music.stop = true; clearTimeout(this._mt); this.music = null; } }
}

window.JOUST_AUDIO = { AudioSys };
})();
