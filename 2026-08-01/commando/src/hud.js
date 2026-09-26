// hud.js — DOM overlay: score, hi-score, lives, health, grenades, objective,
// progress, banners and toasts. Only touches the DOM when a value changes.
const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = { hud: $('hud'), score: $('hud-score'), hi: $('hud-hi'), chain: $('hud-chain'), lives: $('hud-lives'), hp: $('hud-hp'), gren: $('hud-gren'), obj: $('hud-obj'), fill: $('hud-prog-fill'), joe: $('hud-prog-joe'), banner: $('banner'), big: $('banner-big'), small: $('banner-small'), toast: $('toast') };
    this.cache = {};
    this.bannerT = 0; this.toastT = 0;
  }
  show(on) { this.el.hud.classList.toggle('hidden', !on); }
  _set(k, v, fn) { if (this.cache[k] !== v) { this.cache[k] = v; fn(v); } }
  update(g, dt) {
    const E = this.el, J = g.joe;
    this._set('score', g.score, v => { E.score.textContent = String(v).padStart(7, '0'); });
    this._set('hi', g.hi, v => { E.hi.textContent = String(v).padStart(7, '0'); });
    const mult = 1 + Math.min(4, Math.floor(g.chain / 3));
    this._set('chain', g.chainT > 0 && mult > 1 ? mult : 0, v => { E.chain.textContent = v ? `CHAIN x${v}` : ''; E.chain.classList.toggle('on', !!v); });
    this._set('lives', g.lives, v => { E.lives.innerHTML = '<i></i>'.repeat(Math.max(0, Math.min(8, v))); });
    this._set('hp', J.alive ? J.hp : 0, v => { E.hp.innerHTML = [0, 1, 2].map(i => `<i class="${i < v ? '' : 'off'}"></i>`).join(''); });
    this._set('gren', J.grenades, v => { E.gren.innerHTML = `<small>GRENADES</small>${'●'.repeat(v)}<span style="opacity:.25">${'●'.repeat(Math.max(0, 9 - v))}</span>`; });
    const A = g.area;
    let obj = 'ADVANCE';
    for (const [p, text] of A.objectives || []) if (J.p >= p) obj = text;
    if (g.finale) obj = g.finale.phase === 'done' ? 'ENTER THE FORTRESS' : 'HOLD THE GATE';
    const total = A.pows.length + g.world.dyn.cages.reduce((n, c) => n + c.n, 0);
    this._set('obj', `${A.name}   ·   ${obj}   ·   POW ${g.rescued}/${total}`, v => { E.obj.textContent = v; });
    const prog = Math.max(0, Math.min(1, J.p / g.area.wallP));
    this._set('prog', Math.round(prog * 200), () => { E.fill.style.height = (prog * 100).toFixed(1) + '%'; E.joe.style.bottom = `calc(${(prog * 100).toFixed(1)}% - 1px)`; });
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) E.banner.classList.add('hidden'); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) E.toast.classList.remove('on'); }
  }
  banner(big, small = '', t = 2.5) {
    const E = this.el;
    E.big.textContent = big; E.small.textContent = small;
    E.banner.classList.remove('hidden'); this.bannerT = t;
  }
  hideBanner() { this.el.banner.classList.add('hidden'); this.bannerT = 0; }
  toast(msg, t = 1.8) { this.el.toast.textContent = msg; this.el.toast.classList.add('on'); this.toastT = t; }
}
