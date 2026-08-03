// music.js — dual-soundtrack system. Original = the C64 Commando SID from the
// site's C64 section played via the same vendored WebSid engine (faithful to how
// it sounds there). Modern = ElevenLabs track (slot wired; asset lands with the
// slice). Mode persisted in localStorage; toggle switches live.
(() => {
'use strict';

// subtune map from the parity study (it16): 0 = main theme (loops), 2-9/11-18 =
// self-ending jingles (clear/gameover picks pending audition). The hiscore cue
// is Galway's dedicated High-Score SID — the other Commando asset from the
// site's C64 section.
// clear = tune 2 (loudest+longest jingle: victory fanfare profile);
// gameover = tune 18 (quietest, darkest, shortest: somber sting) — both picked
// from measured duration/loudness/spectral stats of the 19 recordings (it29).
const CUES = {
  main: { file: 'assets/music/Commando.sid', track: 0 },
  hiscore: { file: 'assets/music/Commando_High-Score.sid', track: 0 },
  clear: { file: 'assets/music/Commando.sid', track: 2 },
  gameover: { file: 'assets/music/Commando.sid', track: 18 },
};
const LS_KEY = 'commandoHD.music';

const Music = {
  mode: localStorage.getItem(LS_KEY) || 'original',
  ready: false, initializing: false, current: null, currentCue: null,
  volume: 0.55,
  modernBuffers: {}, // cue -> AudioBuffer (ElevenLabs assets, loaded when present)
  _modernSrc: null, _modernCtx: null, _modernGain: null,

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    try { if (this.player && this.player.setVolume) this.player.setVolume(this.volume); } catch (e) {}
    try { if (this._modernGain) this._modernGain.gain.value = this.volume; } catch (e) {}
  },

  async init() {
    if (this.ready || this.initializing) return;
    this.initializing = true;
    try {
      if (typeof SIDBackendAdapter === 'undefined' || typeof ScriptNodePlayer === 'undefined') {
        console.warn('[music] websid not loaded'); this.initializing = false; return;
      }
      window.__musicBackend = new SIDBackendAdapter(undefined, undefined, undefined);
      await ScriptNodePlayer.initialize(window.__musicBackend, () => { Music._onTrackEnd(); }, [], true);
      this.player = ScriptNodePlayer.getInstance ? ScriptNodePlayer.getInstance() : null;
      if (this.player && this.player.setVolume) this.player.setVolume(this.volume);
      this.ready = true;
      this._loadModern(); // fire-and-forget: modern buffers decode in background
      if (this.currentCue) this.play(this.currentCue); // replay queued cue
    } catch (e) { console.warn('[music] init failed', e); }
    this.initializing = false;
  },

  async _loadModern() {
    const map = { main: 'modern-main', clear: 'modern-clear', gameover: 'modern-gameover' };
    if (!this._modernCtx) this._modernCtx = new (window.AudioContext || window.webkitAudioContext)();
    for (const [cue, file] of Object.entries(map)) {
      try {
        const r = await fetch('assets/music/modern/' + file + '.mp3');
        this.modernBuffers[cue] = await this._modernCtx.decodeAudioData(await r.arrayBuffer());
      } catch (e) { console.warn('[music] modern load failed', file, e); }
    }
    if (this.mode === 'modern' && this.currentCue) this._playModern(this.currentCue);
  },

  async play(cue) {
    this.currentCue = cue;
    if (this.mode === 'modern') { this._playModern(cue); return; }
    if (!this.ready) return; // will start after init
    const c = CUES[cue] || CUES.main;
    try {
      await ScriptNodePlayer.loadMusicFromURL(c.file,
        { track: c.track, timeout: -1, traceSID: false }, () => {}, () => {});
      this.current = cue;
    } catch (e) { console.warn('[music] play failed', cue, e); }
  },

  stop() {
    this.currentCue = null; this.current = null;
    try { if (this.player && this.player.pause) this.player.pause(); } catch (e) {}
    this._stopModern();
  },

  toggle() {
    this.mode = this.mode === 'original' ? 'modern' : 'original';
    localStorage.setItem(LS_KEY, this.mode);
    this.stop();
    if (this.currentCue !== null || true) this.play(this.currentCue || 'main');
    return this.mode;
  },

  _onTrackEnd() {
    // jingles end themselves; loop the main theme cues explicitly
    if (this.current === 'main' || this.current === 'hiscore') this.play(this.current);
  },

  _playModern(cue) {
    this._stopModern();
    const buf = this.modernBuffers[cue] || (cue === 'hiscore' ? this.modernBuffers.main : null);
    if (!buf) return; // modern track not delivered yet — silent slot
    if (!this._modernCtx) this._modernCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (!this._modernGain) { this._modernGain = this._modernCtx.createGain(); this._modernGain.gain.value = this.volume; this._modernGain.connect(this._modernCtx.destination); }
    const src = this._modernCtx.createBufferSource();
    src.buffer = buf; src.loop = (cue === 'main' || cue === 'hiscore');
    src.connect(this._modernGain);
    src.start();
    this._modernSrc = src; this.current = cue;
  },
  _stopModern() { try { if (this._modernSrc) this._modernSrc.stop(); } catch (e) {} this._modernSrc = null; },

  // mobile lifecycle: silence everything while the tab is hidden, resume after
  suspend() {
    try { if (this.player && this.player.pause) this.player.pause(); } catch (e) {}
    try { if (this._modernCtx) this._modernCtx.suspend(); } catch (e) {}
  },
  resume() {
    try { if (this.mode === 'original' && this.player && this.player.resume) this.player.resume(); } catch (e) {}
    try { if (this._modernCtx) this._modernCtx.resume(); } catch (e) {}
  },

  state() { return { mode: this.mode, ready: this.ready, cue: this.currentCue, playing: this.current }; },
};

window.Music = Music;
})();
