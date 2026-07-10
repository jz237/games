// Joust remake — renderer: blits the ORIGINAL Joust sprite bitmaps (assets/sprites.js, decoded
// from the ROM) over a black sky with rocky platforms + lava. See SPEC.md §13.
'use strict';
(function () {
const DATA = window.JOUST_DATA;
const SPR = window.JOUST_SPRITES || {};
const { WORLD, mountXOffset } = DATA;
const WRAP = WORLD.WRAP_SPAN;

// original ROM palette (SYSTEM.ASM COLOR1) for platforms & lava
const PAL = {
  rockMd: '#924900',    // color 8 (brown)
  rockDk: '#492400',    // color 14 (dark brown)
};

class Renderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.spr = {}; this.particles = []; this.floats = []; this.crt = false; this.time = 0;
    this.shake = 0; this.effects = []; this.burns = []; this.prevPlats = null;   // juice: shake, death sprites, platform burns
    this.buildSprites();
  }
  // Decode the original indexed-pixel sprite without Scale2x or recolouring.
  mkCanvas(w, h, bytes) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); const img = g.createImageData(w, h);
    img.data.set(bytes); g.putImageData(img, 0, 0); c._ww = w; c._wh = h; return c;
  }
  b64bytes(d) { const bin = atob(d); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  buildSprites() {
    for (const [name, s] of Object.entries(SPR)) {
      const bytes = this.b64bytes(s.d);
      this.spr[name] = this.mkCanvas(s.w, s.h, bytes);
    }
  }
  get(name) { return this.spr[name]; }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this._lw === w && this._lh === h && this._ldpr === dpr) return; // only rebuild on real change
    this._lw = w; this._lh = h; this._ldpr = dpr;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    const sc = Math.min(this.canvas.width / WORLD.DISPLAY_W, this.canvas.height / WORLD.VIEW_H);
    this.scale = sc; this.scaleY = sc; this.scaleX = sc * WORLD.PIXEL_ASPECT;
    this.ox = (this.canvas.width - WORLD.VIEW_W * this.scaleX) / 2;
    this.oy = (this.canvas.height - WORLD.VIEW_H * this.scaleY) / 2;
    this.ctx.imageSmoothingEnabled = false;
  }
  sx(x) { return this.ox + x * this.scaleX; }
  sy(y) { return this.oy + y * this.scaleY; }

  burst(kind, x, y, opts) {
    opts = opts || {}; const n = opts.n || 8; const col = opts.col || '#ffdb00';
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, sp = 0.4 + Math.random() * 1.6; this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.up ? 1 : 0), life: opts.life || 30, max: opts.life || 30, col, size: opts.size || 1.5, grav: opts.grav != null ? opts.grav : 0.06 }); }
  }
  float(text, x, y, col, big) { this.floats.push({ text, x, y, life: big ? 90 : 60, col: col || '#fff', big: !!big }); }
  shakeBy(amt) { this.shake = Math.max(this.shake, amt); }
  // a short sprite-frame animation at (x,y): frames = ['FL1','FL2','FL3'], sizeMul scales it
  addEffect(frames, x, y, sizeMul, dur) { this.effects.push({ frames, x, y, sizeMul: sizeMul || 1, t: 0, dur: dur || 18 }); }
  updateFx(frames) {
    const k = frames == null ? 1 : frames;
    this.time += k;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - 0.5 * k);
    for (const p of this.particles) { p.x += p.vx * k; p.y += p.vy * k; p.vy += p.grav * k; p.life -= k; }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const f of this.floats) { f.y -= 0.4 * k; f.life -= k; }
    this.floats = this.floats.filter(f => f.life > 0);
    for (const e of this.effects) e.t += k;
    this.effects = this.effects.filter(e => e.t < e.dur);
    for (const b of this.burns) b.t += k;
    this.burns = this.burns.filter(b => b.t < b.dur);
  }

  // blit sprite `name` with bottom-center anchored at native (nx, ny); wrap-duplicated
  blit(name, nx, ny, ax) {
    const s = this.spr[name]; if (!s) return;
    const ww = s._ww, wh = s._wh, w = ww * this.scaleX, h = wh * this.scaleY;
    const bx = nx - (ax != null ? ax : ww / 2), by = ny - wh;
    for (const off of [0, -WRAP, WRAP]) {
      const scr = this.sx(bx + off);
      if (scr > -w - 2 && scr < this.canvas.width + 2) this.ctx.drawImage(s, Math.round(scr), Math.round(this.sy(by)), Math.round(w), Math.round(h));
    }
  }

  // Blit with a ROM-style top offset from the entity's anchor instead of bottom-aligning frames.
  blitTop(name, nx, topY) {
    const s = this.spr[name]; if (!s) return;
    const w = s._ww * this.scaleX, h = s._wh * this.scaleY, left = nx - s._ww / 2;
    for (const off of [0, -WRAP, WRAP]) {
      const x = this.sx(left + off);
      if (x > -w - 2 && x < this.canvas.width + 2) this.ctx.drawImage(s, Math.round(x), Math.round(this.sy(topY)), Math.round(w), Math.round(h));
    }
  }

  blitWorld(name, left, top) {
    const s = this.spr[name]; if (!s) return;
    const w = s._ww * this.scaleX, h = s._wh * this.scaleY;
    for (const off of [0, -WRAP, WRAP]) {
      const x = this.sx(left + off);
      if (x > -w - 2 && x < this.canvas.width + 2) this.ctx.drawImage(s, Math.round(x), Math.round(this.sy(top)), Math.round(w), Math.round(h));
    }
  }

  // draw a sprite as a small HUD icon of pixel-height h, centered at screen (cx), bottom at by
  drawSpriteIcon(name, cx, by, h) {
    const s = this.spr[name]; if (!s) return;
    const w = h * (s._ww / s._wh) * WORLD.PIXEL_ASPECT;
    this.ctx.drawImage(s, Math.round(cx - w / 2), Math.round(by - h), Math.round(w), Math.round(h));
  }

  // detect platforms that vanished since last frame (bridge burns wave 3, cliffs erode) → burn fx
  detectBurns(plats) {
    if (this.prevPlats) {
      for (const op of this.prevPlats) {
        if (!plats.some(p => p.id === op.id)) {
          this.burns.push({ x1: op.x1, x2: op.x2, y: op.y, bridge: op.bridge, t: 0, dur: 70 });
          this.shakeBy(6);
          for (let i = 0; i < 24; i++) this.burst('fire', op.x1 + (op.x2 - op.x1) * Math.random(), op.y + 4, { n: 1, col: ['#ff3b1a', '#ff8a00', '#ffd21a'][i % 3], up: true, life: 40, grav: -0.02, size: 2 });
        }
      }
    }
    this.prevPlats = plats.map(p => ({ id: p.id, x1: p.x1, x2: p.x2, y: p.y, bridge: !!p.bridge }));
  }

  render(snap) {
    const ctx = this.ctx, sc = this.scale;
    this.gameFrame = snap ? (snap.animFrame || 0) : this.time;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.beginPath(); ctx.rect(this.ox, this.oy, WORLD.VIEW_W * this.scaleX, WORLD.VIEW_H * this.scaleY); ctx.clip();
    // screen shake
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake * sc, (Math.random() - 0.5) * this.shake * sc);
    ctx.fillStyle = '#000'; ctx.fillRect(this.ox - 20, this.oy - 20, WORLD.VIEW_W * this.scaleX + 40, WORLD.VIEW_H * this.scaleY + 40);
    this.drawLava(snap && snap.info);
    if (snap) { this.detectBurns(snap.platforms); this.drawBurns(); this.drawPlatforms(snap.platforms); this.drawEntities(snap); }
    this.drawEffects();
    this.drawParticles();
    ctx.restore();
    if (this.crt) this.drawCRT();
  }

  // fading rock ghost of a burned platform (drawn behind the live platforms)
  drawBurns() {
    const ctx = this.ctx, sc = this.scale;
    for (const b of this.burns) {
      const k = 1 - b.t / b.dur; ctx.globalAlpha = k * 0.8;
      const x1 = this.sx(b.x1), w = (b.x2 - b.x1) * this.scaleX, top = this.sy(b.y) + b.t * (b.bridge ? 0.08 : 0.3) * sc;
      const g = ctx.createLinearGradient(0, top, 0, top + 10 * sc); g.addColorStop(0, PAL.rockMd); g.addColorStop(1, PAL.rockDk);
      ctx.fillStyle = g; ctx.fillRect(x1, top, w, (b.bridge ? 3 : 9) * sc);
      ctx.fillStyle = '#ff6a1a'; ctx.globalAlpha = k * 0.5; ctx.fillRect(x1, top, w, 2 * sc);
    }
    ctx.globalAlpha = 1;
  }

  drawEffects() {
    for (const e of this.effects) {
      const fi = Math.min(e.frames.length - 1, Math.floor(e.t / e.dur * e.frames.length));
      const s = this.spr[e.frames[fi]]; if (!s) continue;
      const w = s._ww * e.sizeMul * this.scaleX, h = s._wh * e.sizeMul * this.scaleY;
      this.ctx.globalAlpha = 1 - Math.max(0, (e.t / e.dur - 0.6) / 0.4);
      this.ctx.drawImage(s, Math.round(this.sx(e.x) - w / 2), Math.round(this.sy(e.y) - h / 2), Math.round(w), Math.round(h));
    }
    this.ctx.globalAlpha = 1;
  }

  drawLava(info) {
    const ctx = this.ctx, top = info && info.bridgeGone ? 217 : 227;
    ctx.fillStyle = '#f82400'; ctx.fillRect(this.ox, this.sy(top), WORLD.VIEW_W * this.scaleX, (WORLD.VIEW_H - top) * this.scaleY);
    ctx.fillStyle = '#a81800'; ctx.fillRect(this.ox, this.sy(top + 4), WORLD.VIEW_W * this.scaleX, (WORLD.VIEW_H - top - 4) * this.scaleY);
    ctx.fillStyle = '#f87000';
    for (let x = 0; x < WORLD.VIEW_W; x += 8) {
      const yy = top + (((x >> 3) + (this.time >> 3)) & 1);
      ctx.fillRect(this.sx(x), this.sy(yy), 5 * this.scaleX, this.scaleY);
    }
    if (info && info.bridgeGone) {
      const fr = ['FLAME1', 'FLAME2', 'FLAME3', 'FLAME2'][(this.time >> 3) % 4];
      for (const x of [18, 38, 252, 274]) this.blit(fr, x, top + 3, undefined);
    }
  }

  drawPlatforms(plats) {
    const ctx = this.ctx;
    for (const p of plats || []) {
      if (p.bridge) {
        const left = this.sx(p.x1), width = (p.x2 - p.x1) * this.scaleX;
        ctx.fillStyle = '#f87000'; ctx.fillRect(left, this.sy(p.y), width, this.scaleY);
        ctx.fillStyle = '#885000'; ctx.fillRect(left, this.sy(p.y + 1), width, 2 * this.scaleY);
        ctx.fillStyle = '#502000';
        for (let x = p.x1 + 3; x < p.x2; x += 9) ctx.fillRect(this.sx(x), this.sy(p.y + 2), 3 * this.scaleX, this.scaleY);
        continue;
      }
      if (p.id === 'base') {
        this.blitWorld('CSRC5FULL', 48, 204);
      } else if (p.sprite) this.blitWorld(p.sprite, p.drawX, p.y);
    }
  }

  drawPlatformsLegacy(plats) {
    const ctx = this.ctx, sc = this.scale;
    const rnd = (n) => ((n >>> 0) % 1000) / 1000;
    for (const p of plats || []) {
      const isBase = p.y > 200;
      for (const off of [0, -WRAP, WRAP]) {
        const x1 = this.sx(p.x1 + off), x2 = this.sx(p.x2 + off);
        if (x2 < this.ox - 2 || x1 > this.ox + WORLD.VIEW_W * sc + 2) continue;
        const w = x2 - x1, top = this.sy(p.y), gT = 3 * sc;
        const bodyH = (isBase ? (WORLD.FLOOR - p.y - 4) : 9) * sc;
        const bTop = top + gT, bBot = bTop + bodyH;
        // ── organic rocky body with a lumpy/knobbly bottom edge (not comb-teeth) ──
        ctx.beginPath();
        ctx.moveTo(x1, bTop); ctx.lineTo(x2, bTop); ctx.lineTo(x2, bBot - 1 * sc);
        const step = 8 * sc;   // gentle rounded lumps (cobbled-stone look, not stalactites)
        for (let px = x2; px > x1; px -= step) {
          const s = rnd(((px | 0) * 2654435761));
          const bump = (0.6 + s * 1.6) * sc;
          ctx.quadraticCurveTo(px - step / 2, bBot + bump, Math.max(x1, px - step), bBot - (s < 0.5 ? 0.4 : 1.2) * sc);
        }
        ctx.lineTo(x1, bTop); ctx.closePath();
        const g = ctx.createLinearGradient(0, bTop, 0, bBot);
        g.addColorStop(0, PAL.rockLt); g.addColorStop(0.35, PAL.rockMd); g.addColorStop(1, PAL.rockDk);
        ctx.fillStyle = g; ctx.fill();
        // mottled rock texture (clipped to the body)
        ctx.save(); ctx.clip();
        for (let ry = bTop; ry < bBot + 4 * sc; ry += 3 * sc) for (let rx = x1; rx < x2; rx += 4 * sc) {
          const seed = (((rx | 0) * 73856093) ^ ((ry | 0) * 19349663)) >>> 0, s = seed % 100;
          if (s < 20) { ctx.fillStyle = PAL.rockDk; ctx.fillRect(rx + (seed % 2) * sc, ry, 2.2 * sc, 2.2 * sc); }
          else if (s < 30) { ctx.fillStyle = PAL.rockLt; ctx.fillRect(rx, ry, 1.6 * sc, 1.6 * sc); }
          else if (s === 44) { ctx.fillStyle = PAL.rockHi; ctx.globalAlpha = 0.5; ctx.fillRect(rx, ry, 1.6 * sc, 1.6 * sc); ctx.globalAlpha = 1; }
        }
        ctx.restore();
        // ── base roots reaching down into the lava (wide, rounded stump-roots) ──
        if (isBase) {
          for (let rx = x1 + 12 * sc; rx < x2 - 6 * sc; rx += 22 * sc) {
            const s = rnd(((rx | 0) * 2246822519)), rw = (7 + s * 4) * sc, rh = (4 + s * 5) * sc;
            const rg = ctx.createLinearGradient(0, bBot, 0, bBot + rh);
            rg.addColorStop(0, PAL.rockMd); rg.addColorStop(1, PAL.rockDk);
            ctx.fillStyle = rg; ctx.beginPath();
            ctx.moveTo(rx - rw / 2, bBot - 2 * sc);
            ctx.quadraticCurveTo(rx, bBot + rh * 1.4, rx + rw / 2, bBot - 2 * sc);
            ctx.closePath(); ctx.fill();
          }
        }
        // ── grey landing top + lit edge + shadow ──
        ctx.fillStyle = PAL.rockTop; ctx.fillRect(x1, top, w, gT);
        ctx.fillStyle = PAL.rockTopLit; ctx.fillRect(x1, top, w, 1 * sc);
        ctx.fillStyle = PAL.rockDk; ctx.fillRect(x1, bTop - 0.5 * sc, w, 0.7 * sc);
      }
    }
  }

  birdFrame(prefix, b) {
    const f = b.face > 0 ? 'R' : 'L';
    if (!b.onGround) return prefix + (b.wingDown > 0 || b.flapHeld ? 'FLY1' : 'FLY3') + f;
    if (b.skid > 0) return prefix + 'RUNS' + f;
    if (b.runTier > 0) return prefix + 'RUN' + (1 + ((this.gameFrame >> 2) % 4)) + f;
    return prefix + 'RUN4' + f;
  }

  // transporter materialization beam (a bright pulsing column down to the bird)
  drawBeam(x, y) {
    const ctx = this.ctx, top = WORLD.CEIL, w = 6 * this.scaleX;
    const bright = ((this.time >> 1) & 1) === 0;
    for (const off of [0, -WRAP, WRAP]) {
      const cx = this.sx(x + off); if (cx < -w || cx > this.canvas.width + w) continue;
      ctx.fillStyle = bright ? '#9292aa' : '#364955';
      ctx.fillRect(cx - w / 2, this.sy(top), 2 * this.scaleX, (y - top) * this.scaleY);
      ctx.fillRect(cx + w / 2 - this.scaleX, this.sy(top), this.scaleX, (y - top) * this.scaleY);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(cx, this.sy(top), this.scaleX, (y - top) * this.scaleY);
    }
  }

  drawMountedBird(b, prefix, riderNo) {
    const mount = this.birdFrame(prefix, b), f = b.face > 0 ? 'R' : 'L';
    const wingsDown = b.wingDown > 0 || !!b.flapHeld;
    let mountTop;
    if (prefix === 'B') mountTop = b.onGround ? (b.skid > 0 ? -12 : -13) : (wingsDown ? -14 : -19);
    else mountTop = b.onGround && b.skid > 0 ? (prefix === 'S' ? -18 : -17) : -19;
    const riderTop = b.skid > 0 ? -17 : -19;
    // The original display list writes the rider and mount as separate DMA blocks.
    const rider = 'PLY' + riderNo + f, rs = this.spr[rider], ms = this.spr[mount];
    if (!rs || !ms) return;
    const riderDx = b.face > 0 ? 4 : 0, mountDx = mountXOffset(prefix, mount, b.face);
    const left = Math.min(riderDx, mountDx), right = Math.max(riderDx + rs._ww, mountDx + ms._ww);
    const origin = b.x - (left + right) / 2;
    this.blitWorld(rider, origin + riderDx, b.y + riderTop);
    this.blitWorld(mount, origin + mountDx, b.y + mountTop);
  }

  drawEntities(snap) {
    // trolls (behind) — GRAB frame ramps with the pull so the hand visibly grips harder
    for (const t of snap.trolls) {
      const g = t.bird.grabbed, frac = g ? Math.min(1, Math.max(0, (g.pull - 0.016) / (5 - 0.016))) : 0;
      this.blit('GRAB' + (1 + Math.min(5, Math.round(frac * 5))), t.bird.x, WORLD.FLOOR + 6, undefined);
    }
    // transporter spawn beams for materializing birds
    for (const b of [...snap.enemies, ...snap.players]) {
      if (b.materializing > 0) this.drawBeam(b.x, b.y);
    }
    // eggs
    for (const egg of snap.eggs) {
      let nm = 'EGGUP';
      if (egg.state === 'shake' || egg.state === 'hatching') nm = ['EGGB1', 'EGGB2', 'EGGB3'][(this.time >> 2) % 3];
      if (egg.state === 'walking' || egg.state === 'mounting') {
        const rn = egg.origin === 'shadow' ? 5 : egg.origin === 'hunter' ? 4 : 3;
        this.blitTop('PLY' + rn + 'S', egg.x, egg.y - 11);
      } else this.blit(nm, egg.x, egg.y + 1, undefined);
    }
    // Green buzzard + separately coloured rider/lance (PLY3/4/5).
    for (const e of snap.enemies) {
      if (!e.alive) continue;
      if (e.materializing > 0 && ((this.time >> 1) & 1)) continue;
      this.drawMountedBird(e, 'B', e.type === 'bounder' ? 3 : e.type === 'hunter' ? 4 : 5);
    }
    // pterodactyls
    for (const pt of snap.pteros) {
      if (!pt.alive) continue;
      const f = pt.face > 0 ? 'R' : 'L';
      const fr = pt.attack > 0 ? 'PT3' : ['PT1', 'PT2', 'PT1'][(this.time >> 2) % 3];
      this.blit(fr + f, pt.x, pt.y + 8, undefined);
    }
    // players (P1 ostrich, P2 stork)
    for (const p of snap.players) {
      if (p.out || !p.alive) continue;
      if ((p.materializing > 0 || p.safe) && ((this.time >> 1) & 1)) continue;
      this.drawMountedBird(p, p.pi === 1 ? 'S' : 'O', p.pi + 1);
    }
  }

  drawParticles() {
    const ctx = this.ctx, sc = this.scale;
    for (const p of this.particles) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.col; const s = p.size * sc; const x = this.sx(p.x) - s / 2, y = this.sy(p.y) - s / 2; ctx.fillRect(x, y, s, s); }
    ctx.globalAlpha = 1;
  }
  drawFloats(font) {
    const ctx = this.ctx, sc = this.scale;
    for (const f of this.floats) { ctx.globalAlpha = Math.min(1, f.life / 30); font(f.text, this.sx(f.x), this.sy(f.y), Math.round((f.big ? 12 : 7) * sc), f.col, 'center'); }
    ctx.globalAlpha = 1;
  }
  drawCRT() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    if (!this._crtC || this._crtC.height !== H) { this._crtC = document.createElement('canvas'); this._crtC.width = 4; this._crtC.height = H; const g = this._crtC.getContext('2d'); for (let y = 0; y < H; y += 3) { g.fillStyle = 'rgba(0,0,0,.30)'; g.fillRect(0, y, 4, 1); } }
    ctx.globalAlpha = 1; ctx.drawImage(this._crtC, 0, 0, W, H);
    const vg = ctx.createRadialGradient(W / 2, H / 2, H / 3, W / 2, H / 2, H * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
}

window.JOUST_RENDER = { Renderer, PAL };
})();
