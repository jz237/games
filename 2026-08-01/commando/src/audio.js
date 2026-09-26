// audio.js — thin wrapper over the vendored Sfx / Music modules (shared with
// the current Commando HD build) with per-sound rate limiting and stereo pan
// from screen position.
export class Audio {
  constructor() {
    this.S = window.Sfx; this.M = window.Music;
    this.last = {};
    this.started = false;
    this.muted = false;
  }
  async unlock() {
    if (this.started) return;
    this.started = true;
    try { await this.S.init(); } catch (e) {}
    try { await this.M.init(); } catch (e) {}
  }
  _ok(name, gap) {
    const now = performance.now();
    if (this.last[name] && now - this.last[name] < gap) return false;
    this.last[name] = now; return true;
  }
  play(name, opts = {}, gap = 30) {
    if (this.muted || !this.S || !this.S.ready) return;
    if (!this._ok(name, gap)) return;
    this.S.play(name, opts);
  }
  step(pan) { if (this.S && this.S.ready && this._ok('step', 130)) try { this.S.step({ gain: 0.35, pan }); } catch (e) {} }
  tink(pan) { if (this.S && this.S.ready && this._ok('tink', 90)) try { this.S.tink({ gain: 0.25, pan }); } catch (e) {} }
  thunk(pan) { if (this.S && this.S.ready && this._ok('thunk', 60)) try { this.S.thunk({ pan }); } catch (e) {} }
  boom(pan) { if (this.S && this.S.ready && this._ok('boom', 60)) try { this.S.boom({ pan }); } catch (e) {} }
  music(cue) { try { if (this.M) this.M.play(cue); } catch (e) {} }
  stopMusic() { try { if (this.M) this.M.stop(); } catch (e) {} }
  toggleMusic() { try { return this.M.toggle(); } catch (e) { return 'original'; } }
  musicMode() { return this.M ? this.M.mode : 'original'; }
  suspend() { try { this.M && this.M.suspend(); this.S && this.S.ctx && this.S.ctx.suspend(); } catch (e) {} }
  resume() { try { this.M && this.M.resume(); this.S && this.S.ctx && this.S.ctx.resume(); } catch (e) {} }
}
