// input.js — keyboard, mouse, gamepad and twin-stick touch folded into one
// per-frame intent: move vector, aim (vector or ground point), fire, grenade.
import { clamp } from './util.js';

const KEYS = {
  up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  fire: ['Space', 'KeyJ', 'KeyZ'], gren: ['KeyK', 'KeyX', 'ShiftLeft', 'ShiftRight'], pause: ['KeyP', 'Escape'],
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, active: false, lastMove: -1e9, fire: false, gren: false };
    this.touch = { on: false, move: null, aim: null, gren: false };
    this.padIdx = -1; this.padPrev = {};
    this.source = 'keys';
    this.forced = null;  // bot / test override
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.down.add(e.code); this.pressed.add(e.code); this.source = 'keys';
      if (this.mouse.active && !this.mouse.fire && [...KEYS.up, ...KEYS.down, ...KEYS.left, ...KEYS.right].includes(e.code) && performance.now() - this.mouse.lastMove > 1500) this.mouse.active = false;
    });
    addEventListener('keyup', (e) => { this.down.delete(e.code); });
    addEventListener('blur', () => { this.down.clear(); this.mouse.fire = false; });
    canvas.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.active = true; this.mouse.lastMove = performance.now(); this.source = 'mouse'; });
    canvas.addEventListener('mousedown', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.active = true; this.mouse.lastMove = performance.now();
      if (e.button === 0) this.mouse.fire = true;
      if (e.button === 2) { this.mouse.gren = true; this.pressed.add('MouseGren'); }
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.fire = false; if (e.button === 2) this.mouse.gren = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this._bindTouch();
  }

  _bindTouch() {
    const layer = document.getElementById('touch');
    const sl = document.getElementById('stick-l'), sr = document.getElementById('stick-r');
    const gb = document.getElementById('btn-gren'), pb = document.getElementById('btn-pause');
    const T = this.touch;
    const knob = (el, dx, dy) => { el.firstElementChild.style.transform = `translate(${dx}px,${dy}px)`; };
    const place = (el, x, y) => { el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.bottom = 'auto'; el.style.right = 'auto'; el.style.margin = '-66px'; };
    const onStart = (e) => {
      if (e.target === gb || e.target === pb) return;
      T.on = true; this.source = 'touch'; layer.classList.remove('hidden');
      for (const t of e.changedTouches) {
        const right = t.clientX > innerWidth * 0.5;
        const s = { id: t.identifier, ox: t.clientX, oy: t.clientY, dx: 0, dy: 0 };
        if (right && !T.aim) { T.aim = s; place(sr, t.clientX, t.clientY); }
        else if (!right && !T.move) { T.move = s; place(sl, t.clientX, t.clientY); }
      }
      e.preventDefault();
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) for (const s of [T.move, T.aim]) {
        if (!s || s.id !== t.identifier) continue;
        let dx = t.clientX - s.ox, dy = t.clientY - s.oy; const L = Math.hypot(dx, dy), R = 56;
        if (L > R) { // drag the stick base along so it never runs out of travel
          s.ox += dx * (1 - R / L); s.oy += dy * (1 - R / L);
          dx = t.clientX - s.ox; dy = t.clientY - s.oy;
          place(s === T.move ? sl : sr, s.ox, s.oy);
        }
        s.dx = dx / R; s.dy = dy / R;
        knob(s === T.move ? sl : sr, dx, dy);
      }
      e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (T.move && T.move.id === t.identifier) { T.move = null; knob(sl, 0, 0); }
        if (T.aim && T.aim.id === t.identifier) { T.aim = null; knob(sr, 0, 0); }
      }
    };
    this.canvas.addEventListener('touchstart', onStart, { passive: false });
    addEventListener('touchmove', onMove, { passive: false });
    addEventListener('touchend', onEnd); addEventListener('touchcancel', onEnd);
    gb.addEventListener('touchstart', (e) => { this.pressed.add('TouchGren'); e.preventDefault(); e.stopPropagation(); }, { passive: false });
    pb.addEventListener('touchstart', (e) => { this.pressed.add('KeyP'); e.preventDefault(); e.stopPropagation(); }, { passive: false });
  }

  _key(name) { return KEYS[name].some(k => this.down.has(k)); }
  _pressedKey(name) { return KEYS[name].some(k => this.pressed.has(k)); }

  // produce this frame's intent
  poll() {
    if (this.forced) { const f = this.forced; this.pressed.clear(); return f; }
    const I = { mx: 0, mp: 0, aimX: 0, aimP: 0, aimGround: null, fire: false, gren: false, pause: false, strafe: false, src: this.source };
    // keyboard
    I.mx = (this._key('right') ? 1 : 0) - (this._key('left') ? 1 : 0);
    I.mp = (this._key('up') ? 1 : 0) - (this._key('down') ? 1 : 0);
    const keyFire = this._key('fire');
    I.fire = keyFire; I.strafe = keyFire;
    I.gren = this._pressedKey('gren') || this.pressed.has('MouseGren') || this.pressed.has('TouchGren');
    I.pause = this._pressedKey('pause');
    // mouse aims at a ground point
    if (this.mouse.active) { I.aimGround = { sx: this.mouse.x, sy: this.mouse.y }; if (this.mouse.fire) I.fire = true; }
    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const ax = gp.axes, bt = (i) => gp.buttons[i] && gp.buttons[i].pressed;
      const lx = Math.abs(ax[0]) > 0.2 ? ax[0] : 0, ly = Math.abs(ax[1]) > 0.2 ? ax[1] : 0;
      const rx = ax[2] || 0, ry = ax[3] || 0;
      let used = false;
      if (lx || ly) { I.mx = lx; I.mp = -ly; used = true; }
      if (bt(12)) { I.mp = 1; used = true; } if (bt(13)) { I.mp = -1; used = true; } if (bt(14)) { I.mx = -1; used = true; } if (bt(15)) { I.mx = 1; used = true; }
      if (Math.hypot(rx, ry) > 0.35) { I.aimX = rx; I.aimP = -ry; I.fire = true; I.aimGround = null; used = true; }
      if (bt(0) || bt(7)) { I.fire = true; I.strafe = true; used = true; }
      const g = bt(1) || bt(5) || bt(6), prevG = this.padPrev[gp.index + 'g'];
      if (g && !prevG) I.gren = true;
      this.padPrev[gp.index + 'g'] = g;
      const st = bt(9), prevS = this.padPrev[gp.index + 's'];
      if (st && !prevS) I.pause = true;
      this.padPrev[gp.index + 's'] = st;
      if (used) { this.source = 'pad'; this.mouse.active = false; }
    }
    // touch sticks
    const T = this.touch;
    if (T.move) { I.mx = clamp(T.move.dx, -1, 1); I.mp = clamp(-T.move.dy, -1, 1); }
    if (T.aim) {
      const L = Math.hypot(T.aim.dx, T.aim.dy);
      if (L > 0.25) { I.aimX = T.aim.dx; I.aimP = -T.aim.dy; }
      I.fire = true; I.aimGround = null;
    }
    const ml = Math.hypot(I.mx, I.mp); if (ml > 1) { I.mx /= ml; I.mp /= ml; }
    this.pressed.clear();
    return I;
  }
  anyPressed() { const r = this.pressed.size > 0; return r; }
}
