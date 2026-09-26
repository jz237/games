// render.js — renderer, post chain, lights and the camera rig.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { clamp, lerp } from './util.js';

const PITCH = 56 * Math.PI / 180;     // camera looks down 56° below horizontal
const FOV = 30;

// final grade: gentle split-tone (cool shadows, warm highlights) + vignette,
// a whisper of lens fringing toward the edges and animated film grain —
// applied in linear light before the ACES output transform
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uVig: { value: 0.32 }, uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(1, 0.9, 0.7) }, uHurt: { value: 0 },
    uShadow: { value: new THREE.Vector3(0.93, 0.98, 1.07) }, uHi: { value: new THREE.Vector3(1.05, 1.0, 0.92) }, uSat: { value: 1.08 },
    uTime: { value: 0 }, uGrain: { value: 0.05 }, uCA: { value: 0.0022 }, uRes: { value: new THREE.Vector2(1280, 720) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uVig; uniform float uFlash; uniform vec3 uFlashCol; uniform float uHurt;
    uniform vec3 uShadow; uniform vec3 uHi; uniform float uSat;
    uniform float uTime; uniform float uGrain; uniform float uCA; uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 off = (vUv - 0.5) * uCA;
      vec4 c = texture2D(tDiffuse, vUv);
      c.r = texture2D(tDiffuse, vUv + off).r;
      c.b = texture2D(tDiffuse, vUv - off).b;
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb *= mix(uShadow, uHi, smoothstep(0.02, 0.6, l));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      vec2 q = vUv - 0.5; q.x *= 1.25;
      float v = 1.0 - uVig * smoothstep(0.25, 0.85, length(q));
      c.rgb *= v;
      c.rgb += uFlashCol * uFlash;
      float edge = smoothstep(0.35, 0.8, length(vUv - 0.5));
      c.rgb = mix(c.rgb, c.rgb * vec3(1.4, 0.35, 0.3), uHurt * edge);
      // grain: strongest in the shadows and mid-tones, like film stock
      float gr = hash(floor(vUv * uRes) + fract(uTime * 7.31) * 413.7) - 0.5;
      c.rgb *= 1.0 + gr * uGrain * (1.0 - smoothstep(0.35, 1.3, l));
      gl_FragColor = c;
    }`,
};

export class Renderer {
  constructor(canvas, quality) {
    this.canvas = canvas;
    this.quality = quality;       // 'high' | 'low'
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = this.scene = new THREE.Scene();
    this.fogColor = new THREE.Color('#b9b39a');
    scene.background = this.fogColor.clone();
    scene.fog = new THREE.Fog(this.fogColor, 55, 140);

    const cam = this.camera = new THREE.PerspectiveCamera(FOV, 1, 1, 400);
    this.focus = new THREE.Vector3();      // ground point at screen centre
    this.shake = 0; this.shakeT = 0; this.kick = new THREE.Vector2();

    // sky environment: a painted gradient baked to a PMREM, so water, helmets,
    // barrels and wet mud pick up a believable sky reflection (rebaked per area)
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {
        uSun: { value: new THREE.Vector3(-0.62, 0.72, 0.3).normalize() },
        uZen: { value: new THREE.Vector3(0.26, 0.42, 0.72) }, uHor: { value: new THREE.Vector3(0.95, 0.82, 0.62) },
        uGnd: { value: new THREE.Vector3(0.22, 0.18, 0.12) }, uGlow: { value: new THREE.Vector3(1.6, 1.2, 0.7) },
      },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vD; uniform vec3 uSun, uZen, uHor, uGnd, uGlow;
        void main(){ float y = vD.y;
          vec3 c = y > 0.0 ? mix(uHor, uZen, pow(y, 0.55)) : mix(uHor * 0.6, uGnd, pow(-y, 0.4));
          c += uGlow * pow(max(dot(vD, uSun), 0.0), 64.0);
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.skyScene = new THREE.Scene();
    this.skyScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.skyMat));
    this.pmrem = new THREE.PMREMGenerator(r);
    this.envRT = null;
    // lighting: late-afternoon sun from the west-south-west, sky/ground fill
    this.hemi = new THREE.HemisphereLight(0xc4d8ee, 0x6a5840, 0.95);
    scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xffe0b0, 3.1);
    this.sunDir = new THREE.Vector3(-0.62, 0.72, 0.3).normalize();
    sun.castShadow = true;
    const S = 30;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 140 });
    sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
    sun.shadow.bias = -0.00035; sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 3;
    scene.add(sun); scene.add(sun.target);

    // the player's own light at night (always present; intensity 0 by day, so
    // the light count never changes and shaders never recompile mid-area)
    this.joeLight = new THREE.PointLight(0xffd9a8, 0, 13, 1.2);
    scene.add(this.joeLight);

    this.composer = null;
    this.buildPost();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  // lighting, sky, fog and grade for an area (see levels.js AMBIENCE)
  applyAmbience(a) {
    this.amb = a;
    this.sunDir.set(...a.sunDir).normalize();
    this.sun.color.set(a.sunColor); this.sun.intensity = a.sun;
    this.hemi.color.set(a.hemiSky); this.hemi.groundColor.set(a.hemiGround); this.hemi.intensity = a.hemi;
    this.fogColor.set(a.fog); this.scene.background.set(a.fog);
    this.scene.fog.color.set(a.fog); this.scene.fog.near = a.fogNear; this.scene.fog.far = a.fogFar;
    this.r.toneMappingExposure = a.exposure;
    const u = this.skyMat.uniforms;
    u.uSun.value.copy(this.sunDir); u.uZen.value.set(...a.sky.zen); u.uHor.value.set(...a.sky.hor); u.uGnd.value.set(...a.sky.gnd); u.uGlow.value.set(...a.sky.glow);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.skyScene, 0.02);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = a.env;
    const g = this.grade.uniforms;
    g.uShadow.value.set(...a.grade.shadow); g.uHi.value.set(...a.grade.hi); g.uSat.value = a.grade.sat; g.uVig.value = a.grade.vig;
    this.bloom.strength = a.bloom;
    this.joeLight.intensity = 0;
  }

  buildPost() {
    const r = this.r;
    const comp = this.composer = new EffectComposer(r);
    comp.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.35, 0.9);
    this.bloom.enabled = this.quality === 'high';
    comp.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    comp.addPass(this.grade);
    comp.addPass(new OutputPass());
    // the scene renders without MSAA; FXAA smooths rifles, wire and roof edges
    this.fxaa = new ShaderPass(FXAAShader);
    this.fxaa.enabled = this.quality === 'high';
    comp.addPass(this.fxaa);
  }

  setQuality(q) {
    this.quality = q;
    this.bloom.enabled = q === 'high';
    this.fxaa.enabled = q === 'high';
    this.grade.uniforms.uGrain.value = q === 'high' ? 0.05 : 0.035;
    const n = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== n) {
      this.sun.shadow.mapSize.set(n, n);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.resize();
  }

  resize() {
    // a page opened in a hidden tab can report a 0×0 window; never let that
    // poison the camera maths (it recalibrates on the next real resize)
    const w = Math.max(1, innerWidth || 1280), h = Math.max(1, innerHeight || 720);
    const dprCap = this.quality === 'high' ? 2 : 1.25;
    this.dpr = Math.min(devicePixelRatio || 1, dprCap);
    this.r.setPixelRatio(this.dpr);
    this.r.setSize(w, h, false);
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.fxaa.uniforms.resolution.value.set(1 / (w * this.dpr), 1 / (h * this.dpr));
    this.grade.uniforms.uRes.value.set(w * this.dpr, h * this.dpr);
    this.camera.aspect = w / h;
    this.portrait = h > w * 1.05;
    // ground width to show at the focus point: wide on landscape, tighter on
    // portrait (where the camera also tracks Joe sideways)
    this.viewWidth = this.portrait ? clamp(12 + (w / h - 0.46) * 14, 12, 16) : clamp(23.5 + (w / h - 1.33) * 4, 23.5, 30);
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV) / 2) * this.camera.aspect);
    this.dist = this.viewWidth / (2 * Math.tan(hfov / 2));
    this.camera.updateProjectionMatrix();
    this._calib();
  }

  // ground-plane z offsets (relative to the focus) of screen rows, used for
  // keeping Joe at a fixed height on screen and for spawning off the top edge
  _calib() {
    const saveF = this.focus.clone();
    this.focus.set(0, 0, 0); this._place(0, 0);
    this.camera.updateMatrixWorld();
    const rowZ = (ndcY) => this.groundAtNdc(0, ndcY).z;
    this.offJoe = rowZ(-0.28);          // Joe sits ~64% down the screen
    this.offTop = rowZ(1.0);
    this.offBottom = rowZ(-1.0);
    this.halfWidthTop = Math.abs(this.groundAtNdc(1, 1).x);
    this.halfWidthBottom = Math.abs(this.groundAtNdc(1, -1).x);
    this.focus.copy(saveF);
  }

  groundAtNdc(nx, ny, planeY = 0) {
    const v = new THREE.Vector3(nx, ny, 0.5).unproject(this.camera);
    const o = this.camera.position, d = v.sub(o).normalize();
    const t = (planeY - o.y) / d.y;
    return new THREE.Vector3(o.x + d.x * t, planeY, o.z + d.z * t);
  }

  _place(sx, sz) {
    const cam = this.camera, f = this.focus;
    cam.position.set(f.x + sx, f.y + Math.sin(PITCH) * this.dist, f.z + Math.cos(PITCH) * this.dist + sz);
    cam.lookAt(f.x + sx, f.y, f.z + sz);
  }

  update(dt, t) {
    this.grade.uniforms.uTime.value = t;
    // screen shake: decaying jitter + directional kick
    this.shake = Math.max(0, this.shake - dt * 2.8);
    this.kick.multiplyScalar(Math.pow(0.0005, dt));
    const s = this.shake * this.shake;
    const sx = (Math.sin(t * 71) + Math.sin(t * 37.3)) * 0.5 * s * 0.9 + this.kick.x;
    const sz = (Math.cos(t * 63) + Math.sin(t * 29.1)) * 0.5 * s * 0.9 + this.kick.y;
    this._place(sx, sz);
    // shadow frustum follows the focus, snapped to texels to stop shimmer
    const S = this.sun.shadow.camera.right, texel = (2 * S) / this.sun.shadow.mapSize.x;
    const fx = Math.round(this.focus.x / texel) * texel, fz = Math.round((this.focus.z - 4) / texel) * texel;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + this.sunDir.x * 70, this.sunDir.y * 70, fz + this.sunDir.z * 70);
  }

  addShake(a, dirX = 0, dirZ = 0) {
    this.shake = Math.min(1.2, Math.max(this.shake, a));
    this.kick.x += dirX; this.kick.y += dirZ;
  }

  render() { this.composer.render(); }
}
