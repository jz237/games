// Stunt Car Racer remake — engine bootstrap (backlog item 1).
// Valley terrain + sun shadows + flat test ribbon + placeholder drivable car.
import * as THREE from './vendor/three.module.min.js';

const qs = new URLSearchParams(location.search);
const canvas = document.getElementById('scene');
const menuEl = document.getElementById('menu');
const hudEl = document.getElementById('hud');
const hintEl = document.getElementById('hint');

// ---------- deterministic terrain ----------
function hash2(ix, iz) {
  const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function smooth(t) { return t * t * (3 - 2 * t); }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
function sstep(e0, e1, t) { return smooth(clamp01((t - e0) / (e1 - e0))); }
// World height of the valley floor. Flat corridor around the ribbon, hills beyond.
function terrainH(x, z) {
  const n = vnoise(x / 340 + 7.3, z / 340 + 2.1) * 0.65
          + vnoise(x / 120 + 3.7, z / 120 + 9.4) * 0.35;
  const hills = (n - 0.42) * 90;
  const corridor = sstep(70, 380, Math.abs(x));
  const rim = sstep(1400, 2600, Math.hypot(x, z)) * 160; // valley walls rise far out
  return hills * corridor + rim;
}

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;

const scene = new THREE.Scene();
const FOG_COLOR = 0xcfe0ef;
scene.fog = new THREE.Fog(FOG_COLOR, 900, 5200);

const camera = new THREE.PerspectiveCamera(68, 1, 0.3, 9000);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- lights ----------
const sun = new THREE.DirectionalLight(0xfff3e0, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 800;
sun.shadow.camera.far = 2600;
const SH = 140; // shadow ortho half-size, follows the car (tight window = crisp contact shadows)
sun.shadow.camera.left = -SH; sun.shadow.camera.right = SH;
sun.shadow.camera.top = SH; sun.shadow.camera.bottom = -SH;
// depth bias scales by the (far-near) range — even -0.0004 here is ~1.5 world units,
// enough to erase the low car body's contact shadow entirely. Acne is handled by normalBias.
sun.shadow.bias = 0;
sun.shadow.normalBias = 0.5;
sun.shadow.camera.updateProjectionMatrix(); // frustum bounds changed above — required

scene.add(sun);
scene.add(sun.target);
const hemi = new THREE.HemisphereLight(0xbdd7f2, 0x4a5d38, 0.85);
scene.add(hemi);

// ---------- textures ----------
const texLoader = new THREE.TextureLoader();
function loadTex(url, repX, repY) {
  const t = texLoader.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repX, repY);
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
const grassTex = loadTex('images/tex-grass.jpg', 300, 300);
const asphaltTex = loadTex('images/tex-asphalt2.jpg', 2, 60);
const wallTex = loadTex('images/tex-wall.jpg', 4, 1); // per-segment boxes: ~4 block tiles each

// ---------- sky dome + mountain ring ----------
(function buildSky() {
  const cnv = document.createElement('canvas');
  cnv.width = 4; cnv.height = 256;
  const g = cnv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#2f6fd0');
  grad.addColorStop(0.45, '#5b93de');
  grad.addColorStop(0.8, '#a9c8ea');
  grad.addColorStop(1.0, '#dbe7f2');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(cnv);
  t.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(7200, 32, 18),
    new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  dome.renderOrder = -3;
  scene.add(dome);

  const img = new Image();
  img.onload = () => {
    const mc = document.createElement('canvas');
    mc.width = 1024; mc.height = 256;
    const m = mc.getContext('2d');
    // bottom band of the photo sky holds the mountain range
    m.drawImage(img, 0, img.height * 0.74, img.width, img.height * 0.26, 0, 0, 1024, 256);
    m.globalCompositeOperation = 'destination-out';
    const fade = m.createLinearGradient(0, 0, 0, 120);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    m.fillStyle = fade; m.fillRect(0, 0, 1024, 120);
    const mt = new THREE.CanvasTexture(mc);
    mt.colorSpace = THREE.SRGBColorSpace;
    mt.wrapS = THREE.MirroredRepeatWrapping; // hides the non-tileable strip's seams
    mt.repeat.set(3, 1);
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(6300, 6300, 2400, 72, 1, true),
      new THREE.MeshBasicMaterial({ map: mt, side: THREE.BackSide, transparent: true, fog: false, depthWrite: false })
    );
    ring.position.y = 850;
    ring.renderOrder = -2;
    scene.add(ring);
  };
  img.src = 'images/sky.jpg';
})();

// ---------- terrain mesh ----------
(function buildTerrain() {
  const SIZE = 6400, SEG = 160;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainH(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1.0, metalness: 0.0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
})();

// ---------- trees (billboards from the existing 2-column sheet) ----------
const treeBillboards = [];
(function buildTrees() {
  const sheet = texLoader.load('images/tex-trees.png');
  sheet.colorSpace = THREE.SRGBColorSpace;
  function speciesGeo(u0, u1) {
    const g = new THREE.PlaneGeometry(1, 1);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, u0 + uv.getX(i) * (u1 - u0));
    return g;
  }
  const geos = [speciesGeo(0, 0.5), speciesGeo(0.5, 1)];
  const mat = new THREE.MeshStandardMaterial({
    map: sheet, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1.0, metalness: 0.0
  });
  for (let i = 0; i < 140; i++) {
    const r1 = hash2(i, 17), r2 = hash2(i, 53), r3 = hash2(i, 91), r4 = hash2(i, 133);
    const side = r1 > 0.5 ? 1 : -1;
    const x = side * (130 + r2 * 750);
    const z = (r3 - 0.5) * 3200;
    const h = 17 + r4 * 16;
    const m = new THREE.Mesh(geos[i % 2], mat);
    m.scale.set(h * 0.78, h, 1);
    m.position.set(x, terrainH(x, z) + h * 0.5 - 0.4, z);
    scene.add(m);
    treeBillboards.push(m);
  }
})();

// ---------- test ribbon (flat deck + red/white walls) ----------
const DECK = { halfW: 7, topY: 1.2, halfL: 420 };
(function buildRibbon() {
  const deckMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.95, metalness: 0.0 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(DECK.halfW * 2, DECK.topY, DECK.halfL * 2), deckMat);
  deck.position.y = DECK.topY / 2;
  deck.castShadow = true;
  deck.receiveShadow = true;
  scene.add(deck);
  // alternating red/white block segments, like the reference photo
  const wallMatW = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, metalness: 0.0 });
  const wallMatR = new THREE.MeshStandardMaterial({ map: wallTex, color: 0xc23a32, roughness: 0.9, metalness: 0.0 });
  const WSEG = 30, nSeg = Math.ceil((DECK.halfL * 2) / WSEG);
  const wallGeo = new THREE.BoxGeometry(0.9, 2.6, WSEG);
  for (const side of [-1, 1]) {
    for (let i = 0; i < nSeg; i++) {
      const wall = new THREE.Mesh(wallGeo, i % 2 ? wallMatR : wallMatW);
      wall.position.set(side * (DECK.halfW + 0.45), DECK.topY + 1.3 - 0.15, -DECK.halfL + WSEG * (i + 0.5));
      wall.castShadow = true;
      wall.receiveShadow = true;
      scene.add(wall);
    }
  }
  // start gantry posts, just to have something vertical to drive past
  const postMat = new THREE.MeshStandardMaterial({ color: 0x8a919c, roughness: 0.6, metalness: 0.5 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9, 0.8), postMat);
    post.position.set(side * (DECK.halfW + 2.2), 4.5, -DECK.halfL + 60);
    post.castShadow = true;
    scene.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(DECK.halfW * 2 + 6, 0.8, 0.8), postMat);
  beam.position.set(0, 9, -DECK.halfL + 60);
  beam.castShadow = true;
  scene.add(beam);
})();

// ---------- placeholder car ----------
const car = new THREE.Group();
(function buildCar() {
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x9fb6c8, roughness: 0.45, metalness: 0.35 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.8, metalness: 0.1 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.0, 1.15, 6.6), bodyMat);
  body.position.y = 1.05;
  body.castShadow = true;
  car.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 2.2), bodyMat);
  nose.position.set(0, 0.85, -4.2);
  nose.castShadow = true;
  car.add(nose);
  const wheelGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.85, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-2.2, -2.3], [2.2, -2.3], [-2.2, 2.4], [2.2, 2.4]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.position.set(x, 1.0, z);
    w.castShadow = true;
    car.add(w);
  }
  scene.add(car);
})();

// ---------- placeholder drive model (fixed-step 60 Hz) ----------
const state = {
  x: 0, y: DECK.topY, z: DECK.halfL - 60,
  heading: Math.PI, // -z is "forward" down the ribbon
  speed: 0, vy: 0, airborne: false, driving: false, chase: false,
};
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyC' && state.driving) state.chase = !state.chase;
  if (e.code === 'Escape' && state.driving) showMenu();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function groundAt(x, z) {
  if (Math.abs(x) <= DECK.halfW && Math.abs(z) <= DECK.halfL) return DECK.topY;
  return terrainH(x, z);
}

const VMAX = 92, ACCEL = 34, BRAKE = 62, DRAG = 0.35, GRAV = 32;
function step(dt) {
  const fwd = keys['KeyW'] || keys['ArrowUp'];
  const brk = keys['KeyS'] || keys['ArrowDown'];
  const left = keys['KeyA'] || keys['ArrowLeft'];
  const right = keys['KeyD'] || keys['ArrowRight'];
  if (!state.airborne) {
    if (fwd) state.speed += ACCEL * (1 - state.speed / VMAX) * dt;
    if (brk) state.speed -= BRAKE * dt;
    state.speed -= DRAG * state.speed * dt * (fwd ? 0.35 : 1);
    if (state.speed < 0) state.speed = 0;
    const steer = (left ? 1 : 0) - (right ? 1 : 0);
    const grip = Math.min(1, state.speed / 14);
    state.heading += steer * 1.55 * grip * dt;
  }
  state.x += Math.sin(state.heading) * state.speed * dt;
  state.z += Math.cos(state.heading) * state.speed * dt;
  const g = groundAt(state.x, state.z);
  if (state.airborne) {
    state.vy -= GRAV * dt;
    state.y += state.vy * dt;
    if (state.y <= g) { state.y = g; state.vy = 0; state.airborne = false; }
  } else {
    if (state.y - g > 1.5) { state.airborne = true; state.vy = 0; }
    else state.y = g;
  }
  // soft wall keep-in while on the deck
  if (Math.abs(state.z) < DECK.halfL && state.y >= DECK.topY - 0.01) {
    const lim = DECK.halfW - 2.0;
    if (state.x > lim) { state.x = lim; state.speed *= (1 - 1.4 * dt); }
    if (state.x < -lim) { state.x = -lim; state.speed *= (1 - 1.4 * dt); }
  }
}

// ---------- camera + per-frame ----------
const camTarget = new THREE.Vector3();
function updateVisuals(dt) {
  car.position.set(state.x, state.y, state.z);
  car.rotation.set(0, state.heading + Math.PI, 0);
  const steerRoll = ((keys['KeyA'] || keys['ArrowLeft']) ? 1 : 0) - ((keys['KeyD'] || keys['ArrowRight']) ? 1 : 0);
  car.rotation.z += steerRoll * 0.04 * Math.min(1, state.speed / 30);

  const sin = Math.sin(state.heading), cos = Math.cos(state.heading);
  if (state.chase) {
    camera.position.set(state.x - sin * 16, state.y + 6.5, state.z - cos * 16);
    camTarget.set(state.x + sin * 10, state.y + 2.0, state.z + cos * 10);
  } else {
    camera.position.set(state.x - sin * 1.2, state.y + 2.6, state.z - cos * 1.2);
    camTarget.set(state.x + sin * 30, state.y + 1.4, state.z + cos * 30);
  }
  camera.lookAt(camTarget);

  // sun follows the car so the shadow window stays crisp; ~30° elevation for long shadows
  sun.position.set(state.x + 1250, 820, state.z - 700);
  sun.target.position.set(state.x, 0, state.z);

  for (const t of treeBillboards) {
    t.rotation.y = Math.atan2(camera.position.x - t.position.x, camera.position.z - t.position.z);
  }
  hudEl.textContent = Math.round(state.speed * 1.6) + ' mph';
}

// ---------- loop ----------
let last = performance.now(), acc = 0, frames = 0, fpsT = 0, fps = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;
  if (state.driving) {
    acc += dt;
    while (acc >= 1 / 60) { step(1 / 60); acc -= 1 / 60; }
  }
  updateVisuals(dt);
  renderer.render(scene, camera);
  frames++;
  fpsT += dt;
  if (fpsT >= 1) { fps = frames / fpsT; frames = 0; fpsT = 0; }
}
requestAnimationFrame(frame);

// ---------- menu flow ----------
function startDrive() {
  menuEl.style.display = 'none';
  hudEl.style.display = 'block';
  hintEl.style.display = 'block';
  state.driving = true;
}
function showMenu() {
  menuEl.style.display = 'flex';
  hudEl.style.display = 'none';
  hintEl.style.display = 'none';
  state.driving = false;
  state.speed = 0;
}
document.getElementById('btn-drive').addEventListener('click', startDrive);
if (qs.get('drive') === '1') startDrive();

// QA hook for the headless rig
window.__remake = {
  ready: true,
  state,
  fps: () => fps,
  version: 1,
  __t: { renderer, scene, sun, hemi, camera, THREE },
};
