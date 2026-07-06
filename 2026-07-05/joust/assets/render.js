// Joust remake — renderer: procedural HD sprite atlas + scene drawing + particles + CRT.
// Draws the engine snapshot (native 292x240 Joust units) scaled to the canvas.
'use strict';
(function () {
const DATA = window.JOUST_DATA;
const { WORLD } = DATA;
const WRAP = WORLD.WRAP_SPAN;

const PAL = {
  starA: '#8899ff', starB: '#ffffff', starC: '#ffcc66',
  lavaA: '#ff3b00', lavaB: '#ff8a00', lavaC: '#ffd21a', lavaDark: '#7a1500',
  rockA: '#6b4a2a', rockB: '#8a6238', rockC: '#a67c46', rockTop: '#d7b06a', rockLit: '#f0d79a',
  rockShadow: '#3a2716',
  ostrich: '#ffe14d', ostrichDark: '#c9a51f', // P1 mount body (yellow)
  stork: '#7fd4ff', storkDark: '#2f8fc4',      // P2 mount body
  knightY: '#ffd23a', knightB: '#3a6bff',
  lanceMetal: '#e8e8f0', lanceWood: '#b06a2a',
  bounder: '#ff3b3b', bounderD: '#a01414',
  hunter: '#c9c9d6', hunterD: '#6f6f82',
  shadow: '#4a6bff', shadowD: '#1f2f9a',
  rider: '#f0e6c0', riderD: '#a08a4a',
  egg: '#f3ead0', eggShade: '#c9b98a', eggSpot: '#b89a5a',
  ptero: '#39c06a', pteroD: '#1c6e3a', pteroBeak: '#ffcc33', pteroWing: '#2a9455',
  troll: '#8a5a3a', trollD: '#4a2a18', trollClaw: '#d8c8a0',
  feather: '#ffe14d',
};

// ─── sprite atlas ───
const atlas = new Map();
function spr(key, natW, natH, painter, ss) {
  let c = atlas.get(key);
  if (!c) {
    ss = ss || 4;
    c = document.createElement('canvas');
    c.width = Math.round(natW * ss); c.height = Math.round(natH * ss);
    c._nw = natW; c._nh = natH; c._ss = ss;
    const g = c.getContext('2d');
    g.save(); g.scale(ss, ss); painter(g, natW, natH); g.restore();
    atlas.set(key, c);
  }
  return c;
}

// tiny helpers (native-space drawing)
function px(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); }
function ell(g, x, y, rx, ry, col) { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); }

// wings: 0 = up (spread), 1 = mid, 2 = down (flap)
function drawWing(g, x, y, face, frame, col, colD) {
  g.save(); g.translate(x, y); g.scale(face, 1);
  g.fillStyle = col; g.strokeStyle = colD; g.lineWidth = 0.6;
  g.beginPath();
  if (frame === 2) { g.moveTo(0, 0); g.quadraticCurveTo(-6, 6, -11, 9); g.quadraticCurveTo(-6, 3, 0, 3); }
  else if (frame === 1) { g.moveTo(0, 0); g.quadraticCurveTo(-8, 1, -13, 0); g.quadraticCurveTo(-7, 2, 0, 3); }
  else { g.moveTo(0, 0); g.quadraticCurveTo(-7, -6, -12, -9); g.quadraticCurveTo(-6, -2, 0, 3); }
  g.closePath(); g.fill(); g.stroke();
  g.restore();
}

// mount + knight (players). bodyCol = mount color, knightCol = armor
function paintMount(g, face, wingFrame, mountCol, mountD, knightCol, isStork) {
  g.save(); g.translate(11, 11);
  g.scale(face, 1);
  // legs
  g.strokeStyle = mountD; g.lineWidth = 1.1; g.beginPath();
  g.moveTo(-1, 8); g.lineTo(-2, 12); g.moveTo(2, 8); g.lineTo(3, 12); g.stroke();
  g.fillStyle = mountD; g.fillRect(-3.2, 11.6, 3, 1); g.fillRect(1.8, 11.6, 3, 1);
  // body (ostrich round / stork slim)
  ell(g, 0, 4, isStork ? 5 : 6, isStork ? 4.5 : 5.5, mountCol);
  ell(g, -1.5, 3, 2.5, 2, '#ffffff33');
  // neck + head
  g.strokeStyle = mountCol; g.lineWidth = isStork ? 2.2 : 2.8; g.beginPath();
  g.moveTo(3, 1); g.quadraticCurveTo(8, -3, 9, -7); g.stroke();
  g.fillStyle = mountCol; g.beginPath(); g.ellipse(9.5, -8, 2.2, 2, 0, 0, 7); g.fill();
  g.fillStyle = '#111'; g.fillRect(10, -8.6, 1, 1); // eye
  g.fillStyle = isStork ? '#ff8a00' : '#ff6a00'; // beak
  g.beginPath(); g.moveTo(11, -8); g.lineTo(15, -7.4); g.lineTo(11, -6.6); g.closePath(); g.fill();
  // wing
  drawWing(g, -1, 2, 1, wingFrame, mountCol, mountD);
  // knight on top
  g.fillStyle = knightCol; g.fillRect(-2.5, -6, 5, 6); // torso/armor
  g.fillStyle = '#ffffff55'; g.fillRect(-2.5, -6, 5, 1.4);
  g.fillStyle = knightCol; g.beginPath(); g.ellipse(0, -8, 2.4, 2.4, 0, 0, 7); g.fill(); // helmet
  g.fillStyle = '#111'; g.fillRect(0.5, -8.4, 2, 1); // visor slit
  // plume
  g.fillStyle = '#ff3b6b'; g.beginPath(); g.moveTo(-1.5, -10); g.quadraticCurveTo(-4, -13, -2, -14); g.quadraticCurveTo(-0.5, -12, -1.5, -10); g.fill();
  // lance (points in facing direction, held forward)
  g.strokeStyle = PAL.lanceWood; g.lineWidth = 1.2; g.beginPath(); g.moveTo(1, -7); g.lineTo(15, -10.5); g.stroke();
  g.strokeStyle = PAL.lanceMetal; g.lineWidth = 1.2; g.beginPath(); g.moveTo(14, -10.2); g.lineTo(18, -11.2); g.stroke();
  g.restore();
}

// enemy buzzard + rider
function paintBuzzard(g, face, wingFrame, col, colD) {
  g.save(); g.translate(11, 11); g.scale(face, 1);
  g.strokeStyle = colD; g.lineWidth = 1.1; g.beginPath();
  g.moveTo(-1, 8); g.lineTo(-2, 12); g.moveTo(2, 8); g.lineTo(3, 12); g.stroke();
  ell(g, 0, 4, 6, 5, col);
  ell(g, -1.5, 3, 2.5, 2, '#ffffff30');
  g.strokeStyle = col; g.lineWidth = 2.6; g.beginPath();
  g.moveTo(3, 1); g.quadraticCurveTo(8, -2, 9, -6); g.stroke();
  g.fillStyle = col; g.beginPath(); g.ellipse(9.5, -7, 2.3, 2, 0, 0, 7); g.fill();
  g.fillStyle = '#111'; g.fillRect(10, -7.6, 1, 1);
  g.fillStyle = '#ffcc33'; g.beginPath(); g.moveTo(11, -7); g.lineTo(16, -6); g.lineTo(11, -5); g.closePath(); g.fill();
  drawWing(g, -1, 2, wingFrame, col, colD);
  // rider (knight)
  g.fillStyle = PAL.rider; g.fillRect(-2.3, -5.5, 4.6, 5.5);
  g.fillStyle = col; g.beginPath(); g.ellipse(0, -7.5, 2.2, 2.2, 0, 0, 7); g.fill();
  g.fillStyle = '#111'; g.fillRect(0.5, -7.9, 1.8, 0.9);
  g.strokeStyle = PAL.lanceWood; g.lineWidth = 1.1; g.beginPath(); g.moveTo(1, -6.5); g.lineTo(15, -9.5); g.stroke();
  g.strokeStyle = PAL.lanceMetal; g.lineWidth = 1.1; g.beginPath(); g.moveTo(14, -9.3); g.lineTo(18, -10.2); g.stroke();
  g.restore();
}

function paintPtero(g, face, frame, attack) {
  g.save(); g.translate(15, 12); g.scale(face, 1);
  const col = PAL.ptero, colD = PAL.pteroD;
  // wings (big)
  g.fillStyle = PAL.pteroWing; g.strokeStyle = colD; g.lineWidth = 0.7;
  const wy = frame === 0 ? -8 : (frame === 1 ? -1 : 7);
  g.beginPath(); g.moveTo(-2, 0); g.quadraticCurveTo(-12, wy, -18, wy + 2); g.quadraticCurveTo(-9, 2, -2, 3); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(2, 0); g.quadraticCurveTo(10, wy, 15, wy + 2); g.quadraticCurveTo(8, 2, 2, 3); g.closePath(); g.fill(); g.stroke();
  // body
  ell(g, 0, 3, 5, 4, col);
  // head + crest
  g.fillStyle = col; g.beginPath(); g.ellipse(7, -3, 3, 2.6, 0, 0, 7); g.fill();
  g.fillStyle = colD; g.beginPath(); g.moveTo(5, -5); g.lineTo(2, -9); g.lineTo(7, -5); g.closePath(); g.fill(); // crest
  g.fillStyle = '#fff'; g.fillRect(7.5, -4, 1.4, 1.4); g.fillStyle = '#c00'; g.fillRect(7.9, -3.7, 0.8, 0.8); // eye
  // beak (open when attacking)
  g.fillStyle = PAL.pteroBeak;
  if (attack) { g.beginPath(); g.moveTo(9, -4); g.lineTo(17, -6); g.lineTo(10, -2.5); g.closePath(); g.fill(); g.beginPath(); g.moveTo(9, -1.5); g.lineTo(16, 1); g.lineTo(10, -0.5); g.closePath(); g.fill(); }
  else { g.beginPath(); g.moveTo(9, -3); g.lineTo(17, -2); g.lineTo(9, -1); g.closePath(); g.fill(); }
  g.restore();
}

function paintEgg(g, state, anim) {
  g.save(); g.translate(6, 7);
  const wob = (state === 'shake' || state === 'hatching') ? Math.sin(anim * 0.9) * 1.2 : 0;
  g.translate(wob, 0);
  g.fillStyle = PAL.egg; g.beginPath(); g.ellipse(0, 0, 4.2, 5.4, 0, 0, 7); g.fill();
  g.fillStyle = PAL.eggShade; g.beginPath(); g.ellipse(1.2, 1.2, 2.6, 3.4, 0, 0, 7); g.fill();
  g.fillStyle = '#ffffffaa'; g.beginPath(); g.ellipse(-1.4, -1.8, 1.2, 1.8, 0, 0, 7); g.fill();
  g.fillStyle = PAL.eggSpot; g.fillRect(-2, 1, 1, 1); g.fillRect(1, -2, 1, 1);
  if (state === 'hatching') { g.strokeStyle = PAL.eggShade; g.lineWidth = 0.5; g.beginPath(); g.moveTo(-4, 0); g.lineTo(-1, -1); g.lineTo(1, 1); g.lineTo(4, 0); g.stroke(); }
  g.restore();
}

function paintRiderStand(g, face) {
  g.save(); g.translate(6, 8); g.scale(face, 1);
  g.fillStyle = PAL.rider; g.fillRect(-2, -6, 4, 6);
  g.fillStyle = PAL.riderD; g.fillRect(-2, 3, 1.6, 3); g.fillRect(0.4, 3, 1.6, 3);
  g.fillStyle = '#888'; g.beginPath(); g.ellipse(0, -7, 2, 2, 0, 0, 7); g.fill();
  g.restore();
}

function paintTroll(g, frame) {
  g.save(); g.translate(9, 12);
  g.fillStyle = PAL.troll; // forearm
  g.fillRect(-3, frame * -1, 6, 14);
  g.fillStyle = PAL.trollD; g.fillRect(-3, frame * -1, 1.5, 14);
  // hand/claws
  g.fillStyle = PAL.troll; g.beginPath(); g.ellipse(0, frame * -1, 5, 3.5, 0, 0, 7); g.fill();
  g.strokeStyle = PAL.trollClaw; g.lineWidth = 1; g.beginPath();
  g.moveTo(-4, frame * -1 - 1); g.lineTo(-6, frame * -1 - 4);
  g.moveTo(0, frame * -1 - 2); g.lineTo(0, frame * -1 - 5);
  g.moveTo(4, frame * -1 - 1); g.lineTo(6, frame * -1 - 4); g.stroke();
  g.restore();
}

// ─── Renderer ───
class Renderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.stars = []; this.particles = []; this.floats = [];
    this.crt = false; this.time = 0;
    this.rng = 0x2545F491;
    for (let i = 0; i < 90; i++) {
      const r = this._rnd();
      this.stars.push({ x: r * WORLD.VIEW_W, y: this._rnd() * (WORLD.FLOOR - WORLD.CEIL) + WORLD.CEIL, ph: this._rnd() * 6.28, s: this._rnd() < 0.15 ? 2 : 1, c: this._rnd() < 0.3 ? PAL.starC : (this._rnd() < 0.5 ? PAL.starA : PAL.starB) });
    }
  }
  _rnd() { let x = this.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.rng = x >>> 0; return (this.rng % 100000) / 100000; }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    const sc = Math.min(this.canvas.width / WORLD.VIEW_W, this.canvas.height / WORLD.VIEW_H);
    this.scale = sc;
    this.ox = (this.canvas.width - WORLD.VIEW_W * sc) / 2;
    this.oy = (this.canvas.height - WORLD.VIEW_H * sc) / 2;
  }
  sx(x) { return this.ox + x * this.scale; }
  sy(y) { return this.oy + y * this.scale; }

  burst(kind, x, y, opts) {
    opts = opts || {};
    const n = opts.n || 8;
    let col = opts.col || PAL.feather;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = 0.4 + Math.random() * 1.6;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.up ? 1 : 0), life: opts.life || 30, max: opts.life || 30, col, size: opts.size || 1.4, grav: opts.grav != null ? opts.grav : 0.06 });
    }
  }
  float(text, x, y, col) { this.floats.push({ text, x, y, life: 60, col: col || '#fff' }); }

  updateFx() {
    this.time++;
    for (const p of this.particles) { p.x += p.vx; p.y += p.vy; p.vy += p.grav; p.life--; }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const f of this.floats) { f.y -= 0.4; f.life--; }
    this.floats = this.floats.filter(f => f.life > 0);
  }

  // draw sprite centered at native (nx feet-ish). anchor is native offset of sprite origin.
  blit(canvasSpr, nx, ny, ax, ay) {
    const sc = this.scale, s = canvasSpr;
    const w = s._nw * sc, h = s._nh * sc;
    this.drawWrapped(s, nx - ax, ny - ay, w, h);
  }
  drawWrapped(s, nx, ny, w, h) {
    const ctx = this.ctx;
    for (const off of [0, -WRAP, WRAP]) {
      const scr = this.sx(nx + off);
      if (scr > -w - 2 && scr < this.canvas.width + 2) ctx.drawImage(s, scr, this.sy(ny), w, h);
    }
  }

  render(snap) {
    const ctx = this.ctx, sc = this.scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // clip to playfield
    ctx.save();
    ctx.beginPath(); ctx.rect(this.ox, this.oy, WORLD.VIEW_W * sc, WORLD.VIEW_H * sc); ctx.clip();
    // background gradient (night)
    const bg = ctx.createLinearGradient(0, this.oy, 0, this.oy + WORLD.VIEW_H * sc);
    bg.addColorStop(0, '#050716'); bg.addColorStop(0.7, '#0a0a20'); bg.addColorStop(1, '#1a0a10');
    ctx.fillStyle = bg; ctx.fillRect(this.ox, this.oy, WORLD.VIEW_W * sc, WORLD.VIEW_H * sc);
    // stars
    for (const st of this.stars) {
      const tw = 0.5 + 0.5 * Math.sin(this.time * 0.05 + st.ph);
      ctx.globalAlpha = 0.3 + 0.7 * tw; ctx.fillStyle = st.c;
      ctx.fillRect(this.sx(st.x), this.sy(st.y), st.s * sc, st.s * sc);
    }
    ctx.globalAlpha = 1;
    this.drawLava();
    if (snap) { this.drawPlatforms(snap.platforms); this.drawEntities(snap); }
    this.drawParticles();
    ctx.restore();
    if (this.crt) this.drawCRT();
  }

  drawLava() {
    const ctx = this.ctx, sc = this.scale, y = this.sy(WORLD.LAVA_Y);
    const grad = ctx.createLinearGradient(0, y, 0, this.sy(WORLD.VIEW_H));
    grad.addColorStop(0, PAL.lavaC); grad.addColorStop(0.25, PAL.lavaB); grad.addColorStop(0.7, PAL.lavaA); grad.addColorStop(1, PAL.lavaDark);
    ctx.fillStyle = grad; ctx.fillRect(this.ox, y, WORLD.VIEW_W * sc, (WORLD.VIEW_H - WORLD.LAVA_Y) * sc);
    // molten surface glow blobs
    for (let i = 0; i < 10; i++) {
      const bx = ((i * 41 + this.time * 0.6) % WORLD.VIEW_W);
      const gy = WORLD.LAVA_Y + 2 + Math.sin(this.time * 0.08 + i) * 1.5;
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(this.time * 0.1 + i * 2);
      ctx.fillStyle = PAL.lavaC;
      ctx.beginPath(); ctx.ellipse(this.sx(bx), this.sy(gy), 6 * sc, 1.6 * sc, 0, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawPlatforms(plats) {
    const ctx = this.ctx, sc = this.scale;
    for (const p of plats || []) {
      for (const off of [0, -WRAP, WRAP]) {
        const x1 = this.sx(p.x1 + off), x2 = this.sx(p.x2 + off);
        if (x2 < this.ox - 2 || x1 > this.ox + WORLD.VIEW_W * sc + 2) continue;
        const w = x2 - x1, top = this.sy(p.y), depth = (WORLD.FLOOR - p.y) * sc;
        const h = Math.min(depth, (p.y > 200 ? (WORLD.FLOOR - p.y) : 10) * sc);
        // rock body
        const g = ctx.createLinearGradient(0, top, 0, top + h);
        g.addColorStop(0, PAL.rockB); g.addColorStop(1, PAL.rockShadow);
        ctx.fillStyle = g; ctx.fillRect(x1, top, w, h);
        // lit top edge
        ctx.fillStyle = PAL.rockTop; ctx.fillRect(x1, top, w, 1.6 * sc);
        ctx.fillStyle = PAL.rockLit; ctx.fillRect(x1, top, w, 0.7 * sc);
        // rocky texture
        ctx.fillStyle = PAL.rockA;
        for (let rx = 0; rx < w; rx += 6 * sc) { const rh = (2 + ((rx * 13) % 5)) * sc; ctx.fillRect(x1 + rx, top + 2 * sc, 2 * sc, rh); }
        ctx.fillStyle = PAL.rockC;
        for (let rx = 3 * sc; rx < w; rx += 9 * sc) ctx.fillRect(x1 + rx, top + 3 * sc, 1.5 * sc, 2 * sc);
      }
    }
  }

  drawEntities(snap) {
    const wf = (b) => b.onGround ? 1 : (b.wingDown > 0 ? 2 : ((this.time >> 3) & 1 ? 0 : 1));
    // trolls (behind birds)
    for (const t of snap.trolls) {
      const s = spr('troll' + (((this.time >> 2) & 1)), 18, 24, (g) => paintTroll(g, ((this.time >> 2) & 1)));
      this.blit(s, t.bird.x, WORLD.FLOOR, 9, 20);
    }
    // eggs
    for (const egg of snap.eggs) {
      if (egg.state === 'walking') { const s = spr('rider' + (egg.walkFace > 0 ? 'R' : 'L'), 12, 16, (g) => paintRiderStand(g, egg.walkFace || 1)); this.blit(s, egg.x, egg.y, 6, 15); }
      else if (egg.state === 'mounting') { const s = spr('rider' + (egg.walkFace > 0 ? 'R' : 'L'), 12, 16, (g) => paintRiderStand(g, egg.walkFace || 1)); this.blit(s, egg.x, egg.y, 6, 15); const e2 = spr('egg_egg', 12, 14, (g) => paintEgg(g, 'egg', 0)); }
      else { const st = egg.state === 'hatching' ? 'hatching' : (egg.state === 'shake' ? 'shake' : 'egg'); const key = 'egg_' + st + (st !== 'egg' ? (this.time >> 2 & 3) : ''); const s = spr(key, 12, 14, (g) => paintEgg(g, st, this.time)); this.blit(s, egg.x, egg.y, 6, 12); }
    }
    // enemies
    for (const e of snap.enemies) {
      if (!e.alive) continue;
      if (e.materializing > 0 && ((this.time >> 1) & 1)) continue; // flicker while materializing
      const col = e.type === 'bounder' ? PAL.bounder : e.type === 'hunter' ? PAL.hunter : PAL.shadow;
      const colD = e.type === 'bounder' ? PAL.bounderD : e.type === 'hunter' ? PAL.hunterD : PAL.shadowD;
      const fr = wf(e), f = e.face > 0 ? 1 : -1;
      const s = spr(`buz_${e.type}_${f}_${fr}`, 22, 24, (g) => paintBuzzard(g, f, fr, col, colD));
      this.blit(s, e.x, e.y, 11, 22);
    }
    // pterodactyls
    for (const pt of snap.pteros) {
      if (!pt.alive) continue;
      const fr = (this.time >> 2) % 3, f = pt.face > 0 ? 1 : -1;
      const s = spr(`pte_${f}_${fr}_${pt.attack > 0 ? 1 : 0}`, 34, 24, (g) => paintPtero(g, f, fr, pt.attack > 0));
      this.blit(s, pt.x, pt.y, 15, 14);
    }
    // players
    for (const p of snap.players) {
      if (p.out || !p.alive) continue;
      if (p.materializing > 0 && ((this.time >> 1) & 1)) continue;
      const fr = wf(p), f = p.face > 0 ? 1 : -1, stork = p.pi === 1;
      const mc = stork ? PAL.stork : PAL.ostrich, md = stork ? PAL.storkDark : PAL.ostrichDark, kc = stork ? PAL.knightB : PAL.knightY;
      const s = spr(`ply_${p.pi}_${f}_${fr}`, 22, 26, (g) => paintMount(g, f, fr, mc, md, kc, stork));
      this.blit(s, p.x, p.y, 11, 24);
    }
  }

  drawParticles() {
    const ctx = this.ctx, sc = this.scale;
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.col;
      this.drawWrapped2(this.sx(p.x), this.sy(p.y), p.size * sc);
    }
    ctx.globalAlpha = 1;
  }
  drawWrapped2(x, y, s) { this.ctx.fillRect(x - s / 2, y - s / 2, s, s); }

  drawFloats(font) {
    const ctx = this.ctx, sc = this.scale;
    for (const f of this.floats) {
      ctx.globalAlpha = Math.min(1, f.life / 30);
      font(f.text, this.sx(f.x), this.sy(f.y), Math.round(6 * sc), f.col, 'center');
    }
    ctx.globalAlpha = 1;
  }

  drawCRT() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    if (!this._crtC || this._crtC.height !== H) {
      this._crtC = document.createElement('canvas'); this._crtC.width = 4; this._crtC.height = H;
      const g = this._crtC.getContext('2d');
      for (let y = 0; y < H; y += 3) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, y, 4, 1); }
    }
    ctx.globalAlpha = 1; ctx.drawImage(this._crtC, 0, 0, W, H);
    const vg = ctx.createRadialGradient(W / 2, H / 2, H / 3, W / 2, H / 2, H * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
}

window.JOUST_RENDER = { Renderer, PAL, spr, paintMount, paintBuzzard, paintPtero };
})();
