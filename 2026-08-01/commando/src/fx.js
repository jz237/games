// fx.js — particles, tracers, muzzle flashes, explosions, decals, telegraph
// rings, pooled lights and floating score text. Everything is pooled; nothing
// allocates per frame once the game is running.
import * as THREE from 'three';
import * as TX from './textures.js';
import { mulberry, clamp, smooth } from './util.js';

const rnd = Math.random;

class PointPool {
  // opts.linear: colours are linear (HDR allowed) even with normal blending;
  // opts.sharp: darker creases in the texture (rolling fireballs)
  constructor(scene, max, map, additive, opts = {}) {
    this.max = max; this.n = 0;
    this.p = []; // particle records
    const g = this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max); this.rot = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('prot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, scale: { value: 800 } },
      vertexShader: `
        attribute vec4 pcolor; attribute float psize; attribute float prot;
        uniform float scale; varying vec4 vC; varying float vR;
        void main(){ vC = pcolor; vR = prot;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        uniform sampler2D map; varying vec4 vC; varying float vR;
        void main(){
          vec2 c = gl_PointCoord - 0.5; float s = sin(vR), co = cos(vR);
          vec2 uv = vec2(c.x * co - c.y * s, c.x * s + c.y * co) + 0.5;
          vec4 t = texture2D(map, uv);
          ${opts.sharp ? 't.rgb *= t.rgb * 1.4;   // deeper folds between the billows' : ''}
          // smoke/dust colours are authored in sRGB; fire is authored in linear HDR
          vec3 col = ${additive || opts.linear ? 'vC.rgb' : 'pow(max(vC.rgb, 0.0), vec3(2.2))'};
          gl_FragColor = vec4(col * t.rgb, vC.a * t.a);
          if (gl_FragColor.a < 0.004) discard; }`,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = opts.order ?? (additive ? 3 : 2);
    scene.add(this.points);
  }
  // p: {x,y,z, vx,vy,vz, life, size, size1, r,g,b, a, a1, drag, grav, rot, spin, fadeIn}
  // optional: cm/tm + c1 colour ramp (start → cm at tm → c1), fo (alpha holds
  // then fades out from t = fo), wx/wz drift not slowed by drag (wind),
  // grav < 0 is buoyancy
  add(p) {
    if (this.p.length >= this.max) this.p.shift();
    p.age = 0; p.drag ??= 0; p.grav ??= 0; p.rot ??= rnd() * 6.28; p.spin ??= 0; p.a1 ??= 0; p.size1 ??= p.size;
    this.p.push(p);
  }
  update(dt, groundH) {
    const P = this.p;
    let w = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      const k = Math.pow(1 - clamp(p.drag, 0, 0.99), dt * 60);
      p.vx *= k; p.vy *= k; p.vz *= k; p.vy -= p.grav * dt;
      p.x += (p.vx + (p.wx || 0)) * dt; p.y += p.vy * dt; p.z += (p.vz + (p.wz || 0)) * dt;
      if (p.grav > 0 && groundH) { const gh = groundH(p.x, -p.z); if (p.y < gh + 0.03) { p.y = gh + 0.03; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; } }
      p.rot += p.spin * dt;
      P[w++] = p;
    }
    P.length = w;
    const n = Math.min(w, this.max);
    for (let i = 0; i < n; i++) {
      const p = P[i], t = p.age / p.life;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      const fade = p.fadeIn ? Math.min(1, t / p.fadeIn) : 1;
      let r = p.r, g = p.g, b = p.b;
      if (p.cm) {
        if (t < p.tm) { const k = t / p.tm; r += (p.cm[0] - r) * k; g += (p.cm[1] - g) * k; b += (p.cm[2] - b) * k; }
        else { const k = (t - p.tm) / (1 - p.tm); r = p.cm[0] + (p.c1[0] - p.cm[0]) * k; g = p.cm[1] + (p.c1[1] - p.cm[1]) * k; b = p.cm[2] + (p.c1[2] - p.cm[2]) * k; }
      } else if (p.c1) { r += (p.c1[0] - r) * t; g += (p.c1[1] - g) * t; b += (p.c1[2] - b) * t; }
      this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b;
      const al = p.fo !== undefined ? p.a * (1 - smooth(p.fo, 1, t)) : p.a + (p.a1 - p.a) * t;
      this.col[i * 4 + 3] = al * fade;
      if (p.heat) { const h = Math.max(0, 1 - t / p.heat); this.col[i * 4] = p.r + h * 3; this.col[i * 4 + 1] = p.g + h * 1.6; this.col[i * 4 + 2] = p.b + h * 0.4; }
      this.size[i] = p.size + (p.size1 - p.size) * Math.sqrt(t);
      this.rot[i] = p.rot;
    }
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'pcolor', 'psize', 'prot']) this.geo.attributes[k].needsUpdate = true;
  }
}

function tracerTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 16;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.75, 'rgba(255,255,255,.7)'); grad.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = grad;
  g.beginPath(); g.ellipse(32, 8, 32, 5, 0, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); return t;
}

export class FX {
  constructor(scene, camera, groundH, quality) {
    this.scene = scene; this.camera = camera; this.groundH = groundH; this.quality = quality;
    const dot = TX.softDot(), puff = TX.smokePuff();
    this.add = new PointPool(scene, 1400, dot, true);
    this.smoke = new PointPool(scene, 900, puff, false);
    // explosions: lumpy billows — fire in linear HDR that cools to soot, and
    // heavy smoke plumes that rise and drift downwind
    this.fire = new PointPool(scene, 800, TX.billowTexture(19), false, { linear: true, sharp: true, order: 2.6 });
    this.plume = new PointPool(scene, 700, TX.billowTexture(7), false, { order: 2.5 });
    this.burners = [];
    this.wind = [0.8, -0.35];
    // tracers
    this.maxTr = 160;
    const tg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.trMat = new THREE.MeshBasicMaterial({ map: tracerTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.tracers = new THREE.InstancedMesh(tg, this.trMat, this.maxTr);
    this.tracers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tracers.frustumCulled = false; this.tracers.renderOrder = 4; this.tracers.count = 0;
    this.tracers.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(this.tracers);
    // muzzle flash sprites
    this.flashMat = new THREE.SpriteMaterial({ map: TX.flashStar(), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(3, 2.4, 1.4) });
    this.flashes = [];
    for (let i = 0; i < 16; i++) { const s = new THREE.Sprite(this.flashMat); s.visible = false; s.renderOrder = 5; scene.add(s); this.flashes.push({ s, t: 0 }); }
    // pooled point lights (fixed count so shaders never recompile)
    this.lights = [];
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffb060, 0, 12, 1.6); l.castShadow = false; scene.add(l); this.lights.push({ l, t: 0, dur: 1, peak: 0 }); }
    // scorch decals
    this.maxScorch = 48;
    const sg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.scorch = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ map: TX.scorchTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), this.maxScorch);
    this.scorch.count = 0; this.scorch.frustumCulled = false; this.scorch.renderOrder = 1; this._scorchI = 0;
    scene.add(this.scorch);
    // telegraph rings & air-shadows
    this.ringTex = TX.ringTexture(); this.blobTex = TX.blobShadow();
    this.rings = [];
    for (let i = 0; i < 14; i++) {
      // drawn without a depth test so bumps in the ground can't hide part of a warning
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.ringTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false, color: new THREE.Color(2.2, 0.35, 0.2) }));
      m.visible = false; m.renderOrder = 2; scene.add(m); this.rings.push(m);
    }
    this.blobs = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, depthWrite: false }));
      m.visible = false; m.renderOrder = 1; scene.add(m); this.blobs.push(m);
    }
    // debris & brass
    this.maxDeb = 220;
    this.deb = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.1 }), this.maxDeb);
    this.deb.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.deb.castShadow = true; this.deb.frustumCulled = false; this.deb.count = 0;
    this.deb.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(this.deb);
    this.debris = [];
    // laser lines (sniper sights)
    this.lasers = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.05).translate(0.5, 0, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.1), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      m.visible = false; m.renderOrder = 5; scene.add(m); this.lasers.push(m);
    }
    // floating score text (DOM)
    this.texts = [];
    this.textLayer = document.createElement('div');
    this.textLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:2';
    document.body.appendChild(this.textLayer);
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._e = new THREE.Euler(); this._c = new THREE.Color();
    this.trList = [];
  }

  // ---------------------------------------------------------------- emitters
  muzzle(x, y, z, dirX, dirZ, big = false) {
    const f = this.flashes.find(f => f.t <= 0) || this.flashes[0];
    f.s.position.set(x + dirX * 0.12, y, z + dirZ * 0.12);
    const sc = (big ? 0.8 : 0.5) * (0.8 + rnd() * 0.4);
    f.s.scale.set(sc, sc, sc); f.s.material.rotation = rnd() * 6.28;
    f.s.visible = true; f.t = 0.045;
    this.light(x, y + 0.3, z, big ? 7 : 3.5, 0.06, 0xffc070);
    for (let i = 0; i < 3; i++) this.add.add({ x, y, z, vx: dirX * (4 + rnd() * 5) + (rnd() - 0.5) * 2, vy: rnd() * 1.5, vz: dirZ * (4 + rnd() * 5) + (rnd() - 0.5) * 2, life: 0.08 + rnd() * 0.06, size: 0.12, size1: 0.02, r: 3, g: 2, b: 0.8, a: 1, a1: 0, drag: 0.1 });
    this.smoke.add({ x: x + dirX * 0.3, y: y + 0.05, z: z + dirZ * 0.3, vx: dirX * 1.2, vy: 0.6, vz: dirZ * 1.2, life: 0.5, size: 0.25, size1: 0.8, r: 0.8, g: 0.78, b: 0.72, a: 0.25, a1: 0, drag: 0.08 });
  }
  brass(x, y, z, rx, rz) {
    this.debris.push({ x, y, z, vx: rx * (1.6 + rnd()) + (rnd() - 0.5), vy: 1.8 + rnd(), vz: rz * (1.6 + rnd()) + (rnd() - 0.5), s: [0.03, 0.03, 0.08], rx: 0, ry: rnd() * 6, spin: 20, life: 1.2 + rnd(), col: [0.9, 0.62, 0.22], bounce: 0.35 });
  }
  tracer(b) { this.trList.push(b); }
  light(x, y, z, peak, dur, color = 0xffb060) {
    let L = this.lights.find(l => l.t <= 0);
    if (!L) L = this.lights.reduce((a, b) => (a.t < b.t ? a : b));
    L.l.position.set(x, y, z); L.l.color.set(color); L.t = dur; L.dur = dur; L.peak = peak;
  }
  dust(x, y, z, n = 3, col = [0.72, 0.62, 0.48], spd = 1.2, size = 0.5) {
    for (let i = 0; i < n; i++) this.smoke.add({ x: x + (rnd() - 0.5) * 0.3, y: y + 0.1, z: z + (rnd() - 0.5) * 0.3, vx: (rnd() - 0.5) * spd, vy: 0.4 + rnd() * spd * 0.6, vz: (rnd() - 0.5) * spd, life: 0.6 + rnd() * 0.5, size, size1: size * 2.4, r: col[0], g: col[1], b: col[2], a: 0.45, a1: 0, drag: 0.06 });
  }
  impact(x, y, z, kind = 'dirt') {
    const col = kind === 'sand' ? [0.8, 0.72, 0.55] : kind === 'wood' ? [0.6, 0.48, 0.34] : kind === 'stone' ? [0.7, 0.68, 0.64] : kind === 'water' ? [0.75, 0.85, 0.9] : [0.62, 0.52, 0.4];
    this.dust(x, y, z, 2, col, 1.4, 0.3);
    for (let i = 0; i < 2; i++) this.add.add({ x, y: y + 0.1, z, vx: (rnd() - 0.5) * 6, vy: 1 + rnd() * 3, vz: (rnd() - 0.5) * 6, life: 0.12 + rnd() * 0.08, size: 0.06, size1: 0.02, r: 1.4, g: 1.0, b: 0.5, a: 1, a1: 0, grav: 9 });
    if (kind === 'water') for (let i = 0; i < 5; i++) this.smoke.add({ x, y, z, vx: (rnd() - 0.5) * 2, vy: 2 + rnd() * 2, vz: (rnd() - 0.5) * 2, life: 0.5, size: 0.15, size1: 0.3, r: 0.9, g: 0.95, b: 1, a: 0.7, a1: 0, grav: 9 });
  }
  hit(x, y, z, dirX, dirZ) {
    // soldier hit: cloth/dust puff and a few dark flecks thrown along the shot
    this.smoke.add({ x, y, z, vx: dirX * 1.5, vy: 0.5, vz: dirZ * 1.5, life: 0.45, size: 0.3, size1: 0.9, r: 0.45, g: 0.2, b: 0.16, a: 0.55, a1: 0, drag: 0.08 });
    for (let i = 0; i < 5; i++) this.debris.push({ x, y, z, vx: dirX * (2 + rnd() * 3) + (rnd() - 0.5) * 2, vy: 1 + rnd() * 2, vz: dirZ * (2 + rnd() * 3) + (rnd() - 0.5) * 2, s: [0.04, 0.04, 0.04], rx: 0, ry: 0, spin: 10, life: 0.6 + rnd() * 0.5, col: [0.28, 0.08, 0.06], bounce: 0.1 });
  }
  explosion(x, y, z, r = 3, opts = {}) {
    const big = r > 3.2, q = this.quality === 'high' ? 1 : 0.6, [wx, wz] = this.wind;
    // white flash
    this.add.add({ x, y: y + 0.8, z, vx: 0, vy: 0, vz: 0, life: 0.12, size: r * 2.2, size1: r * 2.9, r: 3, g: 2.3, b: 1.4, a: 1, a1: 0 });
    // fireball: billows burst out and up, white-hot → orange → soot
    const nf = Math.round((big ? 28 : 20) * q);
    for (let i = 0; i < nf; i++) {
      const a = rnd() * 6.28, sp = (0.25 + rnd()) * r * 1.5, core = rnd() < 0.35;
      this.fire.add({
        x: x + Math.cos(a) * 0.3, y: y + 0.4 + rnd() * 0.5, z: z + Math.sin(a) * 0.3,
        vx: Math.cos(a) * sp * (core ? 0.4 : 1), vy: 1.2 + rnd() * r * (core ? 1.4 : 0.8), vz: Math.sin(a) * sp * (core ? 0.4 : 1),
        life: 0.75 + rnd() * 0.8, size: 0.9 + rnd() * r * 0.3, size1: r * (0.75 + rnd() * 0.6),
        r: 3.6, g: 2.2, b: 0.8, cm: [1.9, 0.62, 0.12], tm: 0.12 + rnd() * 0.1, c1: [0.06, 0.052, 0.048],
        a: 0.97, fo: 0.55, drag: 0.07, grav: -1.4, spin: (rnd() - 0.5) * 1.6, wx: wx * 0.4, wz: wz * 0.4,
      });
    }
    // smoke column: dark plumes that keep rising and drift downwind for seconds
    const ns = Math.round((big ? 26 : 16) * q);
    for (let i = 0; i < ns; i++) {
      const a = rnd() * 6.28, s = rnd() * r * 0.5, k = rnd();
      this.plume.add({
        x: x + Math.cos(a) * s, y: y + 0.8 + rnd() * r * 0.5, z: z + Math.sin(a) * s,
        vx: Math.cos(a) * s * 0.8, vy: 1.1 + rnd() * 2.2, vz: Math.sin(a) * s * 0.8,
        life: 2.6 + rnd() * 3.2, size: r * (0.45 + rnd() * 0.3), size1: r * (1.5 + rnd() * 1.3),
        r: 0.22 + k * 0.07, g: 0.205 + k * 0.07, b: 0.19 + k * 0.07, c1: [0.44, 0.42, 0.4],
        a: 0.72, fo: 0.35, fadeIn: 0.1 + rnd() * 0.12, drag: 0.03, grav: -0.35, spin: (rnd() - 0.5) * 0.5, wx, wz,
      });
    }
    // sparks
    for (let i = 0; i < Math.round((big ? 36 : 24) * q); i++) {
      const a = rnd() * 6.28, s = 5 + rnd() * 10;
      this.add.add({ x, y: y + 0.4, z, vx: Math.cos(a) * s, vy: 3 + rnd() * 8, vz: Math.sin(a) * s, life: 0.4 + rnd() * 0.6, size: 0.09, size1: 0.03, r: 3, g: 1.8, b: 0.5, a: 1, a1: 0, grav: 14, drag: 0.02 });
    }
    // embers: glowing bits that rain down around the blast and smoulder
    for (let i = 0; i < Math.round((big ? 22 : 14) * q); i++) {
      const a = rnd() * 6.28, s = 1 + rnd() * r * 1.2;
      this.add.add({ x, y: y + 0.6, z, vx: Math.cos(a) * s, vy: 2 + rnd() * 5, vz: Math.sin(a) * s, life: 1.4 + rnd() * 2.2, size: 0.07 + rnd() * 0.05, size1: 0.04, r: 2.6, g: 0.9, b: 0.2, c1: [0.6, 0.1, 0.02], a: 1, fo: 0.6, grav: 9, drag: 0.03, spin: 0 });
    }
    // ground dust ring
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * 6.28;
      this.smoke.add({ x: x + Math.cos(a) * 0.6, y: y + 0.2, z: z + Math.sin(a) * 0.6, vx: Math.cos(a) * r * 2.4, vy: 0.3, vz: Math.sin(a) * r * 2.4, life: 0.9 + rnd() * 0.4, size: 0.8, size1: 2.4, r: 0.66, g: 0.58, b: 0.46, a: 0.5, a1: 0, drag: 0.1 });
    }
    // debris chunks; a few burn and trail smoke as they fly
    const dc = opts.debris || [0.35, 0.28, 0.2];
    for (let i = 0; i < (big ? 18 : 12); i++) {
      const a = rnd() * 6.28, s = 2 + rnd() * 6, sz = 0.06 + rnd() * 0.14, hot = i < (big ? 6 : 3) && q === 1;
      this.debris.push({ x, y: y + 0.3, z, vx: Math.cos(a) * s, vy: 4 + rnd() * 7 + (hot ? 3 : 0), vz: Math.sin(a) * s, s: [sz, sz * 0.7, sz * 1.2], rx: rnd() * 6, ry: rnd() * 6, spin: 8 + rnd() * 10, life: 1.4 + rnd() * 1.2, col: hot ? [0.12, 0.1, 0.08] : dc, bounce: 0.3, trail: hot, tt: 0 });
    }
    this.light(x, y + 1.2, z, big ? 90 : 55, 0.6, 0xff9a40);
    this.scorchAt(x, y, z, r * 1.05);
    this.ring(x, z, y, r * 0.8, 0.28, [0.9, 0.6, 0.35], 'shock');
  }
  // a wreck that keeps burning: flames licking up and a smoke plume
  burn(x, y, z, dur = 8, s = 1) {
    this.burners.push({ x, y, z, t: dur, dur, s, f: 0, m: 0 });
  }
  _updateBurners(dt) {
    const B = this.burners, [wx, wz] = this.wind, q = this.quality === 'high' ? 1 : 0.5;
    let w = 0;
    for (const b of B) {
      b.t -= dt; if (b.t <= 0) continue;
      const k = Math.min(1, b.t / (b.dur * 0.4));      // dies down at the end
      b.f -= dt; b.m -= dt;
      if (b.f <= 0) {
        b.f = 0.07 / (q * (0.4 + k * 0.6));
        this.fire.add({ x: b.x + (rnd() - 0.5) * b.s * 1.4, y: b.y, z: b.z + (rnd() - 0.5) * b.s * 1.4, vx: 0, vy: 1.4 + rnd() * 1.2, vz: 0,
          life: 0.5 + rnd() * 0.4, size: 0.5 * b.s * (0.6 + k * 0.4), size1: 1.1 * b.s * (0.6 + k * 0.4),
          r: 3.8, g: 1.9, b: 0.5, cm: [2.0, 0.6, 0.1], tm: 0.3, c1: [0.08, 0.07, 0.06], a: 0.95, fo: 0.5, drag: 0.04, grav: -1, spin: (rnd() - 0.5) * 2, wx: wx * 0.3, wz: wz * 0.3 });
      }
      if (b.m <= 0) {
        b.m = 0.22 / q;
        this.plume.add({ x: b.x + (rnd() - 0.5) * b.s, y: b.y + 0.8, z: b.z + (rnd() - 0.5) * b.s, vx: 0, vy: 1.2 + rnd(), vz: 0,
          life: 3 + rnd() * 2, size: 0.8 * b.s, size1: (2.6 + rnd()) * b.s, r: 0.15, g: 0.14, b: 0.13, c1: [0.34, 0.32, 0.3],
          a: 0.7 * (0.5 + k * 0.5), fo: 0.3, fadeIn: 0.15, drag: 0.02, grav: -0.3, spin: (rnd() - 0.5) * 0.4, wx, wz });
      }
      B[w++] = b;
    }
    B.length = w;
  }
  scorchAt(x, y, z, s) {
    const i = this._scorchI++ % this.maxScorch;
    this._e.set(0, rnd() * 6.28, 0); this._q.setFromEuler(this._e);
    this._m4.compose(this._v.set(x, y + 0.12, z), this._q, this._s.set(s, 1, s));
    this.scorch.setMatrixAt(i, this._m4);
    this.scorch.count = Math.min(this.maxScorch, Math.max(this.scorch.count, i + 1));
    this.scorch.instanceMatrix.needsUpdate = true;
  }
  // ground ring: telegraph (stays until cleared) or shockwave (expands)
  ring(x, z, y, r, dur, col, kind = 'tele') {
    const m = this.rings.find(m => !m.visible) || this.rings[0];
    m.visible = true; m.position.set(x, y + 0.06, z);
    m.userData = { t: 0, dur, r, kind };
    m.material.color.setRGB(col[0], col[1], col[2]);
    m.scale.set(r * 2, 1, r * 2);
    return m;
  }
  blob(x, z, y, r) {
    const m = this.blobs.find(m => !m.visible) || this.blobs[0];
    m.visible = true; m.position.set(x, y + 0.04, z); m.scale.set(r * 2, 1, r * 2);
    return m;
  }
  laser(i, x0, y0, z0, x1, y1, z1, alpha) {
    const m = this.lasers[i]; if (!m) return;
    if (alpha <= 0) { m.visible = false; return; }
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz);
    m.visible = true; m.position.set(x0, y0, z0);
    m.scale.set(L, 1, 1);
    m.rotation.set(0, 0, 0);
    m.lookAt(x1, y1, z1); m.rotateY(-Math.PI / 2);
    m.material.opacity = alpha;
  }
  text(x, y, z, str, cls = '') {
    const el = document.createElement('div');
    el.textContent = str;
    el.style.cssText = `position:absolute;left:0;top:0;font:18px 'Black Ops One',Impact,sans-serif;color:${cls === 'big' ? '#ffcf5a' : '#f6ecd0'};text-shadow:0 2px 4px rgba(0,0,0,.9);white-space:nowrap;will-change:transform`;
    if (cls === 'big') el.style.fontSize = '24px';
    this.textLayer.appendChild(el);
    this.texts.push({ el, x, y, z, t: 0 });
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    this._updateRain(dt);
    this._updateBurners(dt);
    this.add.update(dt, this.groundH ? (x, p) => this.groundH(x, p) : null);
    this.smoke.update(dt, null);
    this.fire.update(dt, null);
    this.plume.update(dt, null);
    // tracers from live bullets
    const tl = this.trList; let n = 0;
    for (const b of tl) {
      if (n >= this.maxTr) break;
      const sp = Math.hypot(b.vx, b.vp), len = b.enemy ? 0.7 : 1.5, wid = b.enemy ? 0.2 : 0.13;
      const ang = Math.atan2(b.vp, b.vx);
      this._e.set(0, ang, 0); this._q.setFromEuler(this._e);
      this._m4.compose(this._v.set(b.x - Math.cos(ang) * len * 0.5, b.y, -b.p + Math.sin(ang) * len * 0.5), this._q, this._s.set(len, 1, wid));
      this.tracers.setMatrixAt(n, this._m4);
      if (b.enemy) this._c.setRGB(3.2, 0.75, 0.25); else this._c.setRGB(2.1, 1.7, 0.9);
      this.tracers.setColorAt(n, this._c);
      n++;
    }
    this.tracers.count = n; this.tracers.instanceMatrix.needsUpdate = true; if (this.tracers.instanceColor) this.tracers.instanceColor.needsUpdate = true;
    tl.length = 0;
    // flashes
    for (const f of this.flashes) { if (f.t > 0) { f.t -= dt; if (f.t <= 0) f.s.visible = false; } }
    for (const L of this.lights) {
      if (L.t > 0) { L.t -= dt; const k = Math.max(0, L.t / L.dur); L.l.intensity = L.peak * k * k; } else L.l.intensity = 0;
    }
    // rings
    for (const m of this.rings) {
      if (!m.visible) continue;
      const u = m.userData; u.t += dt;
      if (u.kind === 'shock') {
        const k = u.t / u.dur; if (k >= 1) { m.visible = false; continue; }
        const s = u.r * 2 * (0.3 + k * 1.2); m.scale.set(s, 1, s); m.material.opacity = (1 - k) * (1 - k) * 0.7;
      } else if (u.kind === 'tele') {
        const pulse = 0.55 + 0.3 * Math.sin(u.t * 16);
        m.material.opacity = pulse;
        if (u.dur > 0 && u.t > u.dur) m.visible = false;
      }
      m.material.transparent = true;
    }
    // debris physics
    const D = this.debris; let w = 0;
    for (const d of D) {
      d.life -= dt; if (d.life <= 0) continue;
      d.vy -= 16 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.rx += d.spin * dt; d.ry += d.spin * 0.7 * dt;
      if (d.trail && (d.tt -= dt) <= 0 && d.life > 0.4) {
        d.tt = 0.03;
        this.fire.add({ x: d.x, y: d.y, z: d.z, vx: 0, vy: 0.3, vz: 0, life: 0.35, size: 0.3, size1: 0.6, r: 3.2, g: 1.4, b: 0.3, c1: [0.1, 0.09, 0.08], a: 0.9, fo: 0.4, spin: 1 });
        if (rnd() < 0.5) this.plume.add({ x: d.x, y: d.y, z: d.z, vx: 0, vy: 0.4, vz: 0, life: 1.2, size: 0.35, size1: 1.1, r: 0.2, g: 0.19, b: 0.18, a: 0.5, fo: 0.2, grav: -0.2, wx: this.wind[0], wz: this.wind[1] });
      }
      const gh = this.groundH(d.x, -d.z);
      if (d.y < gh + 0.02) { d.y = gh + 0.02; d.vy = -d.vy * d.bounce; d.vx *= 0.55; d.vz *= 0.55; d.spin *= 0.5; }
      D[w++] = d;
    }
    D.length = w;
    const nd = Math.min(w, this.maxDeb);
    for (let i = 0; i < nd; i++) {
      const d = D[D.length - 1 - i];
      this._e.set(d.rx, d.ry, 0); this._q.setFromEuler(this._e);
      const shrink = Math.min(1, d.life * 3);
      this._m4.compose(this._v.set(d.x, d.y, d.z), this._q, this._s.set(d.s[0] * shrink, d.s[1] * shrink, d.s[2] * shrink));
      this.deb.setMatrixAt(i, this._m4);
      this._c.setRGB(d.col[0], d.col[1], d.col[2], THREE.SRGBColorSpace); this.deb.setColorAt(i, this._c);
    }
    this.deb.count = nd; this.deb.instanceMatrix.needsUpdate = true; if (this.deb.instanceColor) this.deb.instanceColor.needsUpdate = true;
    // floating text
    const T = this.texts; let tw = 0;
    for (const t of T) {
      t.t += dt;
      if (t.t > 1.1) { t.el.remove(); continue; }
      this._v.set(t.x, t.y + t.t * 1.4, t.z).project(this.camera);
      const sx = (this._v.x * 0.5 + 0.5) * innerWidth, sy = (-this._v.y * 0.5 + 0.5) * innerHeight;
      t.el.style.transform = `translate(${sx}px,${sy}px) translate(-50%,-50%) scale(${1 + Math.max(0, 0.25 - t.t) * 2})`;
      t.el.style.opacity = String(Math.min(1, (1.1 - t.t) * 3));
      T[tw++] = t;
    }
    T.length = tw;
  }

  // ---------------------------------------------------------------- rain
  setRain(on) {
    this.rainOn = on;
    if (on && !this.rain) {
      const N = this.quality === 'high' ? 900 : 450;
      const g = new THREE.PlaneGeometry(0.035, 0.9).translate(0, 0.45, 0);
      const mat = new THREE.MeshBasicMaterial({ map: TX.rainStreak(), transparent: true, depthWrite: false, color: new THREE.Color(0.75, 0.8, 0.9), opacity: 0.55, side: THREE.DoubleSide });
      const im = this.rain = new THREE.InstancedMesh(g, mat, N);
      im.frustumCulled = false; im.renderOrder = 5;
      this.drops = [];
      for (let i = 0; i < N; i++) this.drops.push({ x: (rnd() - 0.5) * 46, y: rnd() * 16, z: (rnd() - 0.5) * 40 });
      this.scene.add(im);
      this.rainFocus = new THREE.Vector3();
    }
    if (this.rain) this.rain.visible = on;
  }
  _updateRain(dt) {
    if (!this.rainOn || !this.rain) return;
    const f = this.rainFocus, N = this.drops.length;
    // streaks face the camera around their vertical axis
    const cam = this.camera.position, yaw = Math.atan2(cam.x - f.x, cam.z - f.z);
    this._e.set(0.12, yaw, 0.1); this._q.setFromEuler(this._e);
    for (let i = 0; i < N; i++) {
      const d = this.drops[i];
      d.y -= 17 * dt; d.x += 1.8 * dt;
      let wx = f.x + d.x, wz = f.z + d.z;
      // ground height is sampled once per fall, not every frame
      if (d.gh === undefined) d.gh = this.groundH(wx, -wz);
      if (d.y < 0) {
        if (rnd() < 0.25) this.add.add({ x: wx, y: d.gh + 0.05, z: wz, vx: 0, vy: 0, vz: 0, life: 0.18, size: 0.18, size1: 0.35, r: 0.5, g: 0.55, b: 0.6, a: 0.5, a1: 0 });
        d.y = 12 + rnd() * 4; d.x = (rnd() - 0.5) * 46; d.z = (rnd() - 0.5) * 40;
        wx = f.x + d.x; wz = f.z + d.z; d.gh = this.groundH(wx, -wz);
      }
      this._m4.compose(this._v.set(wx, d.gh + d.y, wz), this._q, this._s.set(1, 1, 1));
      this.rain.setMatrixAt(i, this._m4);
    }
    this.rain.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.add.p.length = 0; this.smoke.p.length = 0; this.fire.p.length = 0; this.plume.p.length = 0; this.debris.length = 0; this.burners.length = 0;
    for (const m of this.rings) m.visible = false;
    for (const m of this.blobs) m.visible = false;
    for (const m of this.lasers) m.visible = false;
    for (const t of this.texts) t.el.remove(); this.texts.length = 0;
    this.scorch.count = 0; this._scorchI = 0;
  }
}
