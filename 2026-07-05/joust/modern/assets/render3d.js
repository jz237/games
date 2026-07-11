// Joust MODERN 3D — renderer. Three.js scene driven by the SAME deterministic engine as the
// retro remake (../retro/assets/engine.js is authoritative; this file only draws).
// Engine coords: x 0..292 (wraps at ±302 span), y grows DOWN, feet-origin. Scene: 1 unit = 1 px.
'use strict';
(function () {

const DATA = window.JOUST_DATA;
const { WORLD, PLATFORMS, SPAWN_PADS } = DATA;
const T = window.THREE;

const HALF_W = WORLD.VIEW_W / 2;          // 146
const HALF_H = WORLD.VIEW_H / 2;          // 120
const SPAN = WORLD.WRAP_SPAN;             // 302
const X3 = ex => ex - HALF_W;
const Y3 = ey => HALF_H - ey;
const LAVA_Y = Y3(WORLD.LAVA_Y);          // -103

// deterministic hash noise for geometry jitter
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

// ─── palette ───
const COL = {
  rock: 0x7d746c, rockDark: 0x3a3432, rockTop: 0x958a7e, rockGlow: 0xff5a1a,
  lavaDeep: 0x36030b, sky: 0x070512, horizon: 0x54160a,
  p1Body: 0xf5c62e, p1Trim: 0xb8860b, p1Rider: 0x3878c0, p1Helm: 0xdfe8f5,
  p2Body: 0x9fc7e8, p2Trim: 0x4a7ea8, p2Rider: 0xc03878, p2Helm: 0xdfe8f5,
  bounder: 0xd23c28, hunter: 0x9aa0ac, shadow: 0x4a58d8,
  buzzard: 0x4c8a3f, beak: 0xff8a00, legs: 0xc47612,
  lance: 0xd8dde8, egg: 0xf2e7c8, ptero: 0x7ba05a,
};
const ENEMY_COL = { bounder: { body: 0x8a9c46, rider: 0xd23c28 }, hunter: { body: 0x8a9c46, rider: 0xb9bfc9 }, shadow: { body: 0x3c465a, rider: 0x5a6ae8 } };

// ═══ procedural bird (mount + rider), feet at origin, faces +x ═══
function birdView(kind, variant) {
  const g = new T.Group();
  const mats = {};
  const M = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.82, flatShading: true }, o));
  let bodyC = COL.p1Body, trimC = COL.p1Trim, riderC = COL.p1Rider, helmC = COL.p1Helm, emis = 0;
  if (kind === 'player' && variant === 1) { bodyC = COL.p2Body; trimC = COL.p2Trim; riderC = COL.p2Rider; }
  if (kind === 'enemy') { const e = ENEMY_COL[variant] || ENEMY_COL.bounder; bodyC = e.body; riderC = e.rider; trimC = 0x2e3620; helmC = 0x767c88; if (variant === 'shadow') emis = 0.55; }
  mats.body = M(bodyC); mats.trim = M(trimC); mats.beak = M(COL.beak);
  mats.rider = M(riderC, variant === 'shadow' ? { emissive: riderC, emissiveIntensity: emis } : {});
  mats.helm = M(helmC, { roughness: 0.35, metalness: 0.55 });
  mats.lance = M(COL.lance, { roughness: 0.3, metalness: 0.7 });
  mats.leg = M(0xc47612);

  // body
  const body = new T.Mesh(new T.IcosahedronGeometry(4.6, 1), mats.body);
  body.scale.set(1.35, 1, 0.92); body.position.set(0, 9.6, 0); g.add(body);
  // tail
  const tail = new T.Mesh(new T.ConeGeometry(2.3, 5.5, 5), mats.trim);
  tail.rotation.z = Math.PI / 2 + 0.5; tail.position.set(-6.2, 10.8, 0); g.add(tail);
  // neck + head
  const neckG = new T.Group(); neckG.position.set(3.4, 12.2, 0);
  const neck = new T.Mesh(new T.CylinderGeometry(1.1, 1.5, 5.4, 6), mats.body);
  neck.rotation.z = -0.42; neck.position.set(1.1, 2.2, 0); neckG.add(neck);
  const head = new T.Mesh(new T.IcosahedronGeometry(1.9, 1), mats.body); head.position.set(2.3, 4.7, 0); neckG.add(head);
  const beak = new T.Mesh(new T.ConeGeometry(0.9, 3.1, 5), mats.beak);
  beak.rotation.z = -Math.PI / 2; beak.position.set(4.5, 4.6, 0); neckG.add(beak);
  const eyeM = new T.MeshBasicMaterial({ color: 0x0a0d18 });
  const eye = new T.Mesh(new T.SphereGeometry(0.42, 6, 6), eyeM); eye.position.set(2.9, 5.2, 1.5); neckG.add(eye);
  g.add(neckG);
  // legs (hip-pivoted groups so they can run)
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new T.Group(); hip.position.set(0.4, 7.0, side * 2.0);
    const thigh = new T.Mesh(new T.CylinderGeometry(0.75, 0.6, 3.6, 5), mats.leg); thigh.position.y = -1.8; hip.add(thigh);
    const kneeG = new T.Group(); kneeG.position.y = -3.6; hip.add(kneeG);
    const shin = new T.Mesh(new T.CylinderGeometry(0.55, 0.45, 3.6, 5), mats.leg); shin.position.y = -1.7; kneeG.add(shin);
    const foot = new T.Mesh(new T.BoxGeometry(2.3, 0.6, 1.1), mats.beak); foot.position.set(0.7, -3.5, 0); kneeG.add(foot);
    g.add(hip); legs.push({ hip, knee: kneeG });
  }
  // wings — layered feather planes, shoulder pivot
  const wings = [];
  for (const side of [-1, 1]) {
    const sh = new T.Group(); sh.position.set(-0.5, 11.6, side * 3.1);
    const wg = new T.Group(); sh.add(wg);
    for (let i = 0; i < 3; i++) {
      const fw = 7.5 - i * 1.6, fl = 4.6 - i * 0.7;
      const f = new T.Mesh(new T.BoxGeometry(fw, 0.5, fl), i === 0 ? mats.body : mats.trim);
      f.position.set(-1 - i * 1.9, -i * 0.22, side * (fl / 2 + i * 0.5));
      wg.add(f);
    }
    g.add(sh); wings.push({ sh, wg, side });
  }
  // rider
  const rider = new T.Group(); rider.position.set(-0.8, 13.2, 0); rider.scale.setScalar(1.18);
  const torso = new T.Mesh(new T.CylinderGeometry(1.6, 2.0, 4.4, 6), mats.rider); torso.position.y = 2.0; rider.add(torso);
  const helm = new T.Mesh(new T.IcosahedronGeometry(1.55, 1), mats.helm); helm.position.y = 5.1; rider.add(helm);
  const crest = new T.Mesh(new T.BoxGeometry(2.6, 1.2, 0.4), mats.rider); crest.position.set(-0.4, 6.2, 0); rider.add(crest);
  const arm = new T.Mesh(new T.CylinderGeometry(0.55, 0.55, 3.4, 5), mats.rider);
  arm.rotation.z = -1.15; arm.position.set(1.8, 3.1, 0.9); rider.add(arm);
  const lanceG = new T.Group(); lanceG.position.set(3.2, 3.6, 0.9);
  const lance = new T.Mesh(new T.CylinderGeometry(0.34, 0.2, 15, 6), mats.lance);
  lance.rotation.z = -Math.PI / 2 + 0.06; lance.position.x = 5.6; lanceG.add(lance);
  const lTip = new T.Mesh(new T.ConeGeometry(0.55, 1.8, 6), mats.lance);
  lTip.rotation.z = -Math.PI / 2; lTip.position.set(13.4, 0.47, 0); lanceG.add(lTip);
  rider.add(lanceG);
  g.add(rider);

  return { group: g, legs, wings, neckG, rider, tail, state: { wingA: 0, runP: 0 } };
}

// ═══ pterodactyl — feet(ish) origin, faces +x ═══
function pteroView() {
  const g = new T.Group();
  const M = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.85, flatShading: true }, o));
  const bodyM = M(COL.ptero), memM = M(0x5c7a44, { side: T.DoubleSide }), jawM = M(0x8aa06a);
  const body = new T.Mesh(new T.IcosahedronGeometry(4.2, 1), bodyM); body.scale.set(1.7, 0.85, 0.8); body.position.y = 10; g.add(body);
  const neck = new T.Mesh(new T.CylinderGeometry(1.1, 1.7, 5.5, 6), bodyM); neck.rotation.z = -0.6; neck.position.set(6.2, 12.2, 0); g.add(neck);
  const headG = new T.Group(); headG.position.set(8.6, 14.2, 0);
  const skull = new T.Mesh(new T.IcosahedronGeometry(1.8, 1), bodyM); headG.add(skull);
  const crest = new T.Mesh(new T.ConeGeometry(0.9, 4.2, 5), jawM); crest.rotation.z = 2.4; crest.position.set(-2.2, 1.2, 0); headG.add(crest);
  const beakTop = new T.Mesh(new T.ConeGeometry(0.75, 5.4, 5), jawM); beakTop.rotation.z = -Math.PI / 2; beakTop.position.set(3.6, 0.4, 0); headG.add(beakTop);
  const jawG = new T.Group(); jawG.position.set(0.6, -0.6, 0);
  const beakBot = new T.Mesh(new T.ConeGeometry(0.6, 4.6, 5), jawM); beakBot.rotation.z = -Math.PI / 2; beakBot.position.set(2.8, 0, 0); jawG.add(beakBot);
  headG.add(jawG); g.add(headG);
  const tail = new T.Mesh(new T.ConeGeometry(1.3, 7, 5), bodyM); tail.rotation.z = Math.PI / 2 + 0.25; tail.position.set(-8.4, 9.4, 0); g.add(tail);
  const wings = [];
  for (const side of [-1, 1]) {
    const sh = new T.Group(); sh.position.set(0, 12.4, side * 2.6);
    const inner = new T.Mesh(new T.BoxGeometry(3.5, 0.5, 9), memM); inner.position.set(-0.8, 0, side * 4.5); sh.add(inner);
    const elbow = new T.Group(); elbow.position.set(0, 0, side * 9); sh.add(elbow);
    const outer = new T.Mesh(new T.BoxGeometry(2.6, 0.4, 10), memM); outer.position.set(-1.4, 0, side * 5); elbow.add(outer);
    const tip = new T.Mesh(new T.ConeGeometry(0.5, 3.4, 4), jawM); tip.rotation.x = side * Math.PI / 2; tip.position.set(-1.2, 0, side * 10.6); elbow.add(tip);
    g.add(sh); wings.push({ sh, elbow, side });
  }
  return { group: g, wings, headG, jawG, state: { ph: Math.random() * 6.28 } };
}

// ═══ egg / hatchling ═══
function eggView() {
  const g = new T.Group();
  const eggM = new T.MeshStandardMaterial({ color: COL.egg, roughness: 0.4, emissive: 0x332a10, emissiveIntensity: 0.4 });
  const egg = new T.Mesh(new T.SphereGeometry(3.1, 10, 8), eggM); egg.scale.y = 1.22; egg.position.y = 3.6; g.add(egg);
  // hatchling (hidden until walking)
  const hg = new T.Group(); hg.visible = false;
  const hm = new T.MeshStandardMaterial({ color: 0x8a9c46, roughness: 0.85, flatShading: true });
  const hb = new T.Mesh(new T.IcosahedronGeometry(2.2, 1), hm); hb.scale.set(1.25, 1, 0.9); hb.position.y = 4; hg.add(hb);
  const hh = new T.Mesh(new T.IcosahedronGeometry(1.1, 1), hm); hh.position.set(1.9, 6.3, 0); hg.add(hh);
  const hbk = new T.Mesh(new T.ConeGeometry(0.5, 1.6, 5), new T.MeshStandardMaterial({ color: COL.beak })); hbk.rotation.z = -Math.PI / 2; hbk.position.set(3.2, 6.2, 0); hg.add(hbk);
  const hl1 = new T.Mesh(new T.CylinderGeometry(0.35, 0.3, 3.4, 4), hm); hl1.position.set(0.5, 1.8, 0.9); hg.add(hl1);
  const hl2 = hl1.clone(); hl2.position.z = -0.9; hg.add(hl2);
  g.add(hg);
  return { group: g, egg, hatch: hg };
}

// ═══ lava troll — magma hand ═══
function trollView() {
  const g = new T.Group();
  const m = new T.MeshStandardMaterial({ color: 0x501005, roughness: 0.6, emissive: 0xff3c00, emissiveIntensity: 0.9, flatShading: true });
  const palm = new T.Mesh(new T.BoxGeometry(6.5, 7, 3.4), m); palm.position.y = 3; g.add(palm);
  const fingers = [];
  for (let i = 0; i < 4; i++) {
    const fg = new T.Group(); fg.position.set(-2.4 + i * 1.7, 6.4, 0);
    const f = new T.Mesh(new T.BoxGeometry(1.15, 4.6, 1.5), m); f.position.y = 2.1; fg.add(f);
    const f2 = new T.Mesh(new T.BoxGeometry(1.0, 2.8, 1.3), m); f2.position.y = 5.4; f2.rotation.x = 0.5; fg.add(f2);
    g.add(fg); fingers.push(fg);
  }
  const thumb = new T.Group(); thumb.position.set(3.6, 4, 0.6);
  const th = new T.Mesh(new T.BoxGeometry(1.3, 3.8, 1.4), m); th.position.y = 1.6; thumb.add(th);
  g.add(thumb); fingers.push(thumb);
  const wrist = new T.Mesh(new T.CylinderGeometry(2.6, 3.6, 8, 6), m); wrist.position.y = -4; g.add(wrist);
  const light = new T.PointLight(0xff4400, 14, 60, 2); light.position.set(0, 6, 6); g.add(light);
  return { group: g, fingers, light };
}

// scale a geometry's UVs into world units so a repeating texture tiles evenly
function scaleUV(geo, s) {
  const uv = geo.attributes.uv;
  if (!uv) return;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
  uv.needsUpdate = true;
}

// ═══ platform rock geometry ═══
function platformMesh(def, seed, rockTex) {
  const w = def.x2 - def.x1;
  const isBase = def.y >= 200;
  const depth = isBase ? 34 : 26;
  const hgt = isBase ? Y3(def.y) - (LAVA_Y - 16) : 14 + hash(seed) * 10; // base roots into lava
  const sh = new T.Shape();
  sh.moveTo(0, 0);
  sh.lineTo(w, 0);
  // right side tapers in, lumpy bottom, left side back up
  const bumps = Math.max(3, Math.round(w / 22));
  sh.lineTo(w - 2 - hash(seed + 1) * 5, -hgt * (0.45 + hash(seed + 2) * 0.3));
  for (let i = bumps; i >= 0; i--) {
    const bx = (i / bumps) * (w * 0.86) + w * 0.07;
    const by = -hgt * (0.72 + hash(seed + 3 + i) * 0.55);
    sh.quadraticCurveTo(bx + w * 0.04, by + 5, bx, by);
  }
  sh.lineTo(2 + hash(seed + 9) * 5, -hgt * (0.4 + hash(seed + 10) * 0.3));
  sh.closePath();
  const geo = new T.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 2.2, bevelSize: 2.4, bevelSegments: 1, curveSegments: 5 });
  geo.translate(0, 0, -depth / 2);
  // jitter non-top verts for rocky feel
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < -2.5) {
      pos.setX(i, pos.getX(i) + (hash(i * 3 + seed) - 0.5) * 2.6);
      pos.setY(i, y + (hash(i * 5 + seed) - 0.5) * 2.2);
      pos.setZ(i, pos.getZ(i) + (hash(i * 7 + seed) - 0.5) * 2.4);
    }
  }
  geo.computeVertexNormals();
  scaleUV(geo, 1 / 46);
  const mat = new T.MeshStandardMaterial({ color: isBase ? 0xb09a88 : 0xb8aca2, map: rockTex, roughness: 0.95, flatShading: true });
  const mesh = new T.Mesh(geo, mat);
  // walkable top lip — its own texture clone so the tiling matches its dimensions
  const lipTex = rockTex ? rockTex.clone() : null;
  if (lipTex) { lipTex.repeat.set((w + 3) / 46, (depth + 3) / 46); lipTex.needsUpdate = true; }
  const lip = new T.Mesh(new T.BoxGeometry(w + 3, 2.4, depth + 3),
    new T.MeshStandardMaterial({ color: 0xfff2e2, map: lipTex, roughness: 0.85, flatShading: true }));
  lip.position.set(w / 2, -0.1, 0);
  const grp = new T.Group(); grp.add(mesh); grp.add(lip);
  if (isBase) { // emissive cracks near the lava line
    const glow = new T.Mesh(new T.BoxGeometry(w * 0.96, 2, depth * 0.9),
      new T.MeshStandardMaterial({ color: 0x300a00, emissive: COL.rockGlow, emissiveIntensity: 0.55, roughness: 1 }));
    glow.position.set(w / 2, -(hgt - 4), 0); grp.add(glow);
  }
  grp.position.set(X3(def.x1), Y3(def.y) - 1.2, 0);
  return grp;
}

// ═══ particle pool ═══
const PMAX = 900;
function softDotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(16, 16, 1, 16, 16, 15);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  const t = new T.CanvasTexture(c); return t;
}
class Particles {
  constructor(scene) {
    this.geo = new T.BufferGeometry();
    this.pos = new Float32Array(PMAX * 3); this.col = new Float32Array(PMAX * 3);
    this.geo.setAttribute('position', new T.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new T.BufferAttribute(this.col, 3));
    this.mat = new T.PointsMaterial({ size: 3.4, map: softDotTexture(), vertexColors: true, transparent: true, opacity: 0.95, sizeAttenuation: true, depthWrite: false, blending: T.AdditiveBlending });
    this.pts = new T.Points(this.geo, this.mat); this.pts.frustumCulled = false;
    scene.add(this.pts);
    this.live = []; this.free = []; for (let i = PMAX - 1; i >= 0; i--) this.free.push(i);
    this._c = new T.Color();
  }
  spawn(x, y, z, opt) {
    if (!this.free.length) return;
    const i = this.free.pop();
    const a = Math.random() * Math.PI * 2, sp = (opt.sp || 1) * (0.4 + Math.random() * 0.9);
    this.live.push({
      i, x, y, z,
      vx: Math.cos(a) * sp, vy: (opt.up ? Math.abs(Math.sin(a)) : Math.sin(a)) * sp + (opt.vy || 0),
      vz: (Math.random() - 0.5) * sp * 0.8,
      g: opt.g != null ? opt.g : -0.05, t: 0, life: opt.life || 34, c: opt.c || 0xffaa33, fade: 1,
    });
  }
  burst(x, y, kind, opt) {
    opt = opt || {};
    const n = opt.n || 10, col = opt.col || '#ffaa33';
    const c = parseInt(col.replace('#', '0x'));
    for (let k = 0; k < n; k++) {
      if (kind === 'spark') this.spawn(x, y, 4, { sp: 1.6, up: opt.up, c, life: 26 + Math.random() * 14, g: -0.06 });
      else if (kind === 'feather') this.spawn(x, y, 3, { sp: 1.1, c, life: 44, g: -0.02 });
      else if (kind === 'ash') this.spawn(x, y, 3, { sp: 0.9, c: 0x999999, life: opt.life || 46, g: -0.015 });
      else if (kind === 'poof') this.spawn(x, y, 5, { sp: 2.3, c, life: 22 + Math.random() * 12, g: 0 });
      else if (kind === 'ember') this.spawn(x, y, (Math.random() - 0.5) * 60, { sp: 0.35, up: true, vy: 0.5 + Math.random() * 0.5, c: 0xff7722, life: 60, g: 0.004 });
    }
  }
  update() {
    const drop = [];
    for (const p of this.live) {
      p.t++;
      if (p.t >= p.life) { drop.push(p); this.pos[p.i * 3 + 1] = -9999; continue; }
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.z += p.vz;
      const f = 1 - p.t / p.life;
      this.pos[p.i * 3] = p.x; this.pos[p.i * 3 + 1] = p.y; this.pos[p.i * 3 + 2] = p.z;
      this._c.set(p.c).multiplyScalar(Math.max(0.05, f));
      this.col[p.i * 3] = this._c.r; this.col[p.i * 3 + 1] = this._c.g; this.col[p.i * 3 + 2] = this._c.b;
    }
    for (const p of drop) { this.live.splice(this.live.indexOf(p), 1); this.free.push(p.i); }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

// ═══ lava shader ═══
const LAVA_VS = `
varying vec2 vUv; varying float vDist;
uniform float uT;
void main(){ vUv=uv; vec3 p=position;
  p.z += sin(uv.x*38.0+uT*1.1)*0.9 + sin(uv.y*22.0-uT*0.8)*0.7;
  vec4 mv = modelViewMatrix*vec4(p,1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix*mv; }`;
const LAVA_FS = `
varying vec2 vUv; varying float vDist; uniform float uT;
float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<4;i++){ v+=a*n(p); p*=2.13; a*=0.5; } return v; }
void main(){
  vec2 uv = vUv*vec2(26.0,7.0);
  float f = fbm(uv + vec2(uT*0.14, uT*0.05));
  float r = fbm(uv*1.7 - vec2(uT*0.09, 0.0));
  float crack = smoothstep(0.48,0.58,abs(r-0.5)*2.0);
  vec3 deep = vec3(0.16,0.008,0.012);
  vec3 mid  = vec3(0.86,0.16,0.02);
  vec3 hot  = vec3(1.0,0.82,0.25);
  vec3 c = mix(deep, mid, smoothstep(0.32,0.72,f));
  c = mix(c, hot, (1.0-crack)*smoothstep(0.35,0.8,f)*0.9);
  c += hot * pow(max(0.0,f-0.78)*4.4, 2.0) * 0.6;
  // distance haze: cool the molten sea into the dark horizon so depth reads
  c = mix(c, vec3(0.14,0.03,0.015), smoothstep(340.0, 760.0, vDist));
  gl_FragColor = vec4(c,1.0);
}`;

// ═══ sky dome shader ═══
const SKY_VS = `varying vec3 vW; void main(){ vW=(modelMatrix*vec4(position,1.0)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const SKY_FS = `
varying vec3 vW;
void main(){
  float hgt = normalize(vW).y*0.5+0.5;
  vec3 top = vec3(0.016,0.012,0.05);
  vec3 mid = vec3(0.10,0.035,0.10);
  vec3 hor = vec3(0.34,0.10,0.05);
  vec3 c = mix(hor, mid, smoothstep(0.02,0.34,hgt));
  c = mix(c, top, smoothstep(0.3,0.75,hgt));
  gl_FragColor = vec4(c,1.0);
}`;

// ═══ Renderer3D ═══
class Renderer3D {
  constructor(canvas, hudCanvas) {
    this.canvas = canvas; this.hud = hudCanvas; this.hctx = hudCanvas.getContext('2d');
    this.gl = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.outputColorSpace = T.SRGBColorSpace;
    this.gl.toneMapping = T.ACESFilmicToneMapping; this.gl.toneMappingExposure = 1.12;
    this.scene = new T.Scene();
    this.scene.fog = new T.Fog(0x1a0808, 380, 900);
    this.camera = new T.PerspectiveCamera(42, 1, 10, 2000);
    this.time = 0; this.quality = 'high';
    this.shake = 0; this.swayX = 0; this.punchT = 0;
    this.floats = [];
    this._v3 = new T.Vector3();

    this.views = new Map();       // entity id → view
    this.platVisible = {};        // platform id → bool (burn detection)
    this.buildLights();
    this.buildSky();
    this.buildLava();
    this.buildPlatforms();
    this.particles = new Particles(this.scene);
    this.resize();
  }

  setQuality(q) {
    this.quality = q;
    const pr = q === 'high' ? Math.min(window.devicePixelRatio || 1, 2) : q === 'medium' ? 1.25 : 1;
    this.gl.setPixelRatio(pr);
    this.stars.visible = q !== 'low';
    this._resizeNow();
  }

  buildLights() {
    this.scene.add(new T.HemisphereLight(0x3a447e, 0x6a2408, 1.25));
    const key = new T.DirectionalLight(0xbcc8ff, 1.1); key.position.set(-120, 260, 210); this.scene.add(key);
    const fill = new T.DirectionalLight(0x9aa6cc, 0.62); fill.position.set(40, 60, 320); this.scene.add(fill);
    const warm = new T.DirectionalLight(0xff6a22, 0.75); warm.position.set(60, -180, 120); this.scene.add(warm);
    this.lavaLights = [];
    for (let i = 0; i < 3; i++) {
      const pl = new T.PointLight(0xff5512, 30, 260, 1.8);
      pl.position.set(-120 + i * 120, LAVA_Y + 14, 30);
      this.scene.add(pl); this.lavaLights.push(pl);
    }
  }

  buildSky() {
    const dome = new T.Mesh(new T.SphereGeometry(1200, 24, 16),
      new T.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, side: T.BackSide, fog: false, depthWrite: false }));
    this.scene.add(dome);
    // stars
    const N = 420, sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * 0.42 + 0.08, r = 1050;
      sp[i * 3] = Math.cos(a) * Math.cos(e) * r; sp[i * 3 + 1] = Math.sin(e) * r; sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp, 3));
    this.stars = new T.Points(sg, new T.PointsMaterial({ color: 0xcdd6ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false }));
    this.scene.add(this.stars);
    // moon + soft sprite halo (a halo sphere would show a hard rim)
    const moon = new T.Mesh(new T.SphereGeometry(30, 18, 14), new T.MeshBasicMaterial({ color: 0xf2e2c4, fog: false }));
    moon.position.set(290, 300, -860); this.scene.add(moon);
    const haloSp = new T.Sprite(new T.SpriteMaterial({ map: softDotTexture(), color: 0xf2e2c4, transparent: true, opacity: 0.32, fog: false, depthWrite: false }));
    haloSp.scale.set(150, 150, 1); haloSp.position.copy(moon.position); this.scene.add(haloSp);
    // horizon lava glow behind the ridges — vertical-gradient shader so there is no hard band
    const glowMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; void main(){ float a = pow(1.0-vUv.y, 2.6)*0.55; gl_FragColor = vec4(1.0,0.32,0.06, a); }`,
    });
    const hor = new T.Mesh(new T.PlaneGeometry(3200, 240), glowMat);
    hor.position.set(0, LAVA_Y + 92, -620); this.scene.add(hor);
    // distant volcanic ridges (2 parallax layers) rising clear of the molten sea
    for (const [z, h, c] of [[-660, 130, 0x1a1220], [-780, 190, 0x100a16]]) {
      const pts = []; pts.push(new T.Vector2(-1600, LAVA_Y - 80));
      let x = -1600;
      while (x < 1600) { x += 130 + hash(x + z) * 180; pts.push(new T.Vector2(x, LAVA_Y + 24 + hash(x * 2 + z) * h)); }
      pts.push(new T.Vector2(1600, LAVA_Y - 80));
      const sh = new T.Shape(pts);
      const m = new T.Mesh(new T.ShapeGeometry(sh), new T.MeshBasicMaterial({ color: c, fog: false }));
      m.position.z = z; this.scene.add(m);
    }
  }

  buildLava() {
    this.lavaMat = new T.ShaderMaterial({ vertexShader: LAVA_VS, fragmentShader: LAVA_FS, uniforms: { uT: { value: 0 } } });
    // an endless molten sea reaching the horizon ridges
    const lava = new T.Mesh(new T.PlaneGeometry(SPAN * 5, 830, 130, 42), this.lavaMat);
    lava.rotation.x = -Math.PI / 2; lava.position.set(0, LAVA_Y, -275);
    this.scene.add(lava);
  }

  buildPlatforms() {
    this.platGroups = {};
    const loader = new T.TextureLoader();
    this.rockTex = loader.load('assets/tex/rock.jpg');
    this.rockTex.wrapS = this.rockTex.wrapT = T.RepeatWrapping;
    this.rockTex.colorSpace = T.SRGBColorSpace;
    let seed = 7;
    for (const def of PLATFORMS) {
      const base = platformMesh(def, seed += 13, this.rockTex);
      const g = new T.Group();
      for (const off of [-SPAN, 0, SPAN]) { const c = base.clone(); c.position.x += off; g.add(c); }
      this.scene.add(g);
      this.platGroups[def.id] = g;
      this.platVisible[def.id] = true;
    }
    // spawn pad glow discs
    for (const p of SPAWN_PADS) {
      const d = new T.Mesh(new T.CircleGeometry(9, 20),
        new T.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.10, depthWrite: false }));
      d.rotation.x = -Math.PI / 2; d.position.set(X3(p.x), Y3(p.y) + 0.4, 0);
      this.scene.add(d);
    }
  }

  // ─── sizing ───
  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    if (w === this._lw && h === this._lh) return;
    this._lw = w; this._lh = h;
    this._resizeNow();
  }
  _resizeNow() {
    const w = this._lw || innerWidth, h = this._lh || innerHeight;
    this.gl.setSize(w, h, false);
    this.hud.width = w * (window.devicePixelRatio > 1.4 ? 1.5 : 1); this.hud.height = h * (window.devicePixelRatio > 1.4 ? 1.5 : 1);
    this.camera.aspect = w / h;
    // fit playfield: x ±(146+14), y −112..+96 (+ margin)
    const fov = this.camera.fov * Math.PI / 180;
    const needH = 116, needW = 165;
    const dH = needH / Math.tan(fov / 2);
    const dW = needW / (Math.tan(fov / 2) * this.camera.aspect);
    this.camDist = Math.max(dH, dW) + 20;
    this.camera.updateProjectionMatrix();
  }

  worldToScreen(ex, ey) {
    this._v3.set(X3(ex), Y3(ey), 0).project(this.camera);
    return { x: (this._v3.x * 0.5 + 0.5) * this.hud.width, y: (-this._v3.y * 0.5 + 0.5) * this.hud.height };
  }

  // ─── fx API (mirrors the retro renderer so the shell port is mechanical) ───
  shakeBy(n) { this.shake = Math.min(14, this.shake + n); if (n >= 5) this.punchT = 1; }
  addEffect(frames, ex, ey, sizeMul, dur) {
    const x = X3(ex), y = Y3(ey);
    this.particles.burst(x, y, 'poof', { n: Math.round(14 * (sizeMul || 1)), col: '#ffd9a0' });
    this.particles.burst(x, y, 'poof', { n: Math.round(8 * (sizeMul || 1)), col: '#ff8a3c' });
  }
  burst(kind, ex, ey, opts) { this.particles.burst(X3(ex), Y3(ey), kind, opts); }
  float(text, ex, ey, col, big) { this.floats.push({ text, ex, ey, col: col || '#fff', big: !!big, t: 0 }); }
  drawFloats(txt) {
    for (const f of this.floats) {
      const p = this.worldToScreen(f.ex, f.ey - f.t * 0.55);
      const a = f.t < 40 ? 1 : 1 - (f.t - 40) / 25;
      this.hctx.globalAlpha = Math.max(0, a);
      txt(f.text, p.x, p.y, Math.round(this.hud.height / (f.big ? 26 : 40)), f.col);
      this.hctx.globalAlpha = 1;
    }
  }
  updateFx() {
    for (const f of this.floats) f.t++;
    this.floats = this.floats.filter(f => f.t < 65);
    this.shake *= 0.88; if (this.shake < 0.05) this.shake = 0;
    this.punchT *= 0.9;
  }

  // ─── entity views ───
  getView(ent, kindKey, builder) {
    let v = this.views.get(ent.id);
    if (!v || v.kindKey !== kindKey) {
      if (v) { this.scene.remove(v.main.group); this.scene.remove(v.ghost.group); }
      const main = builder(), ghost = builder();
      this.scene.add(main.group); this.scene.add(ghost.group);
      v = { main, ghost, kindKey, seen: 0 };
      this.views.set(ent.id, v);
    }
    return v;
  }

  poseBird(bv, e, t, xOff, alive) {
    const g = bv.group;
    g.visible = alive !== false;
    if (!g.visible) return;
    g.position.set(X3(e.x) + xOff, Y3(e.y), 0);
    const camYaw = 0.30;
    g.rotation.y = e.face === 1 ? -camYaw : Math.PI + camYaw;
    g.rotation.z = Math.max(-0.3, Math.min(0.3, -(e.vx || 0) * 0.07 * (e.face || 1)));
    // wings
    const s = bv.state;
    const target = e.wingDown > 0 ? 1.05 : (e.onGround ? 0.12 : -0.38);
    s.wingA += (target - s.wingA) * 0.38;
    for (const w of bv.wings) w.wg.rotation.x = w.side * s.wingA;
    // legs
    if (e.onGround && Math.abs(e.vx) > 0.12) {
      s.runP += Math.abs(e.vx) * 0.32;
      let i = 0;
      for (const l of bv.legs) { const ph = s.runP + (i++ ? Math.PI : 0); l.hip.rotation.z = Math.sin(ph) * 0.7; l.knee.rotation.z = Math.max(0, -Math.sin(ph + 0.9)) * 0.9; }
    } else if (e.onGround) {
      for (const l of bv.legs) { l.hip.rotation.z += (0 - l.hip.rotation.z) * 0.3; l.knee.rotation.z += (0 - l.knee.rotation.z) * 0.3; }
    } else {
      for (const l of bv.legs) { l.hip.rotation.z += (0.85 - l.hip.rotation.z) * 0.2; l.knee.rotation.z += (1.15 - l.knee.rotation.z) * 0.2; }
    }
    // neck bobs on run, stretches in flight
    bv.neckG.rotation.z = e.onGround ? Math.sin(s.runP) * 0.08 : -0.12 + Math.min(0.3, Math.max(-0.3, e.vy * 0.05));
    // skid brace
    if (e.skid > 0) g.rotation.z = 0.22 * (e.face || 1);
    // materialize flicker
    if (e.materializing > 0) {
      g.visible = (Math.floor(t * 30) % 2) === 0;
      const k = 1 - e.materializing / 60;
      g.scale.set(1, 0.35 + 0.65 * k, 1);
    } else g.scale.set(1, 1, 1);
  }

  posePtero(pv, e, t, xOff) {
    const g = pv.group;
    g.visible = true;
    g.position.set(X3(e.x) + xOff, Y3(e.y), 0);
    const camYaw = 0.24;
    g.rotation.y = e.face === 1 ? -camYaw : Math.PI + camYaw;
    const s = pv.state; s.ph += 0.09;
    const a = Math.sin(s.ph) * 0.55;
    for (const w of pv.wings) { w.sh.rotation.x = w.side * a; w.elbow.rotation.x = w.side * a * 0.8; }
    pv.jawG.rotation.z = e.attack ? -0.55 : -0.06; // open beak on attack
    g.rotation.z = -(e.vy || 0) * 0.05;
  }

  // ─── main render ───
  render(snap, dtMs) {
    this.time += (dtMs || 16.6) / 1000;
    const t = this.time;
    this.lavaMat.uniforms.uT.value = t;
    // flicker lava lights + ambient embers
    let li = 0;
    for (const pl of this.lavaLights) pl.intensity = 26 + Math.sin(t * (3.1 + li) + li * 2.4) * 6 + hash((t * 6 | 0) + li++) * 5;
    if ((this._embT = (this._embT || 0) + 1) % 9 === 0 && this.quality !== 'low')
      this.particles.burst((Math.random() - 0.5) * 300, LAVA_Y + 2, 'ember', { n: 1 });
    this.particles.update();

    const seen = new Set();
    if (snap) {
      // platforms visibility + burn effect
      const act = new Set(snap.platforms.map(p => p.id));
      for (const id in this.platGroups) {
        const vis = act.has(id);
        if (this.platVisible[id] && !vis) {
          const def = PLATFORMS.find(p => p.id === id);
          const cx = (def.x1 + def.x2) / 2;
          this.particles.burst(X3(cx), Y3(def.y), 'poof', { n: 26, col: '#ff6a1a' });
          this.particles.burst(X3(cx), Y3(def.y), 'spark', { n: 18, col: '#ffd23a', up: true });
          this.shakeBy(6);
        }
        this.platVisible[id] = vis;
        this.platGroups[id].visible = vis;
      }
      // players
      for (const p of snap.players) {
        if (p.out) continue;
        seen.add(p.id);
        const v = this.getView(p, 'player' + p.pi, () => birdView('player', p.pi));
        this.poseBird(v.main, p, t, 0, p.alive);
        this._ghost(v, p, t, 'bird');
      }
      // enemies
      for (const e of snap.enemies) {
        if (!e.alive) continue;
        seen.add(e.id);
        const v = this.getView(e, 'enemy' + e.type, () => birdView('enemy', e.type));
        this.poseBird(v.main, e, t, 0, true);
        this._ghost(v, e, t, 'bird');
      }
      // pteros
      for (const p of snap.pteros) {
        if (!p.alive) continue;
        seen.add(p.id);
        const v = this.getView(p, 'ptero', () => pteroView());
        this.posePtero(v.main, p, t, 0);
        this._ghost(v, p, t, 'ptero');
      }
      // eggs
      for (const eg of snap.eggs) {
        if (eg.dead) continue;
        seen.add(eg.id);
        const v = this.getView(eg, 'egg', () => eggView());
        const g = v.main.group;
        g.visible = true;
        g.position.set(X3(eg.x), Y3(eg.y), 0);
        const isEgg = eg.state === 'egg' || eg.state === 'shake' || eg.state === 'hatching';
        v.main.egg.visible = isEgg;
        v.main.hatch.visible = !isEgg;
        if (eg.state === 'shake') g.rotation.z = Math.sin(t * 34) * 0.16; else g.rotation.z = 0;
        if (!isEgg) g.rotation.y = (eg.walkFace || 1) === 1 ? -0.3 : Math.PI + 0.3;
        this._ghostSimple(v, eg.x);
      }
      // trolls
      for (const tr of snap.trolls) {
        seen.add(tr.id);
        const v = this.getView(tr, 'troll', () => trollView());
        const g = v.main.group;
        g.visible = true;
        const pull = tr.bird && tr.bird.grabbed ? tr.bird.grabbed.pull : 0.02;
        const frac = Math.min(1, pull / (DATA.PHYS.TROLL_PULL_CAP || 5));
        g.position.set(X3(tr.bird ? tr.bird.x : tr.x), LAVA_Y + 2 + frac * 4, 2);
        for (const f of v.main.fingers) f.rotation.x = -0.2 - frac * 0.9;
        v.main.light.intensity = 10 + frac * 26;
        this._ghostSimple(v, tr.bird ? tr.bird.x : tr.x);
      }
    }
    // hide views for entities gone this frame
    for (const [id, v] of this.views) {
      if (!seen.has(id)) { v.main.group.visible = false; if (v.ghost) v.ghost.group.visible = false; }
    }

    // camera: sway toward players' centroid, shake, punch-in
    let cx = 0, n = 0;
    if (snap) for (const p of snap.players) if (!p.out && p.alive) { cx += X3(p.x); n++; }
    const targetSway = n ? Math.max(-14, Math.min(14, (cx / n) * 0.10)) : 0;
    this.swayX += (targetSway - this.swayX) * 0.03;
    const shx = (Math.random() - 0.5) * this.shake, shy = (Math.random() - 0.5) * this.shake;
    const dist = this.camDist * (1 - this.punchT * 0.045);
    this.camera.position.set(this.swayX + shx, 6 + shy, dist);
    this.camera.lookAt(this.swayX * 0.55, -6, 0);
    this.gl.render(this.scene, this.camera);
  }

  _ghost(v, e, t, kind) {
    // wrap ghost: duplicate near the seam so entities never pop at the edges
    const near = e.x < 30 ? SPAN : (e.x > WORLD.VIEW_W - 30 ? -SPAN : 0);
    if (near && v.main.group.visible) {
      v.ghost.group.visible = true;
      if (kind === 'bird') this.poseBird(v.ghost, e, t, near, true);
      else this.posePtero(v.ghost, e, t, near);
    } else if (v.ghost) v.ghost.group.visible = false;
  }
  _ghostSimple(v, ex) {
    const near = ex < 30 ? SPAN : (ex > WORLD.VIEW_W - 30 ? -SPAN : 0);
    if (near && v.main.group.visible) {
      v.ghost.group.visible = true;
      v.ghost.group.position.copy(v.main.group.position); v.ghost.group.position.x += near;
      v.ghost.group.rotation.copy(v.main.group.rotation);
      if (v.main.egg) { v.ghost.egg.visible = v.main.egg.visible; v.ghost.hatch.visible = v.main.hatch.visible; }
    } else if (v.ghost) v.ghost.group.visible = false;
  }

  clearViews() {
    for (const [, v] of this.views) { this.scene.remove(v.main.group); if (v.ghost) this.scene.remove(v.ghost.group); }
    this.views.clear();
  }
}

const API = { Renderer3D, X3, Y3 };
if (typeof window !== 'undefined') window.JOUST_RENDER3D = API;

})();
