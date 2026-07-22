/*
 * HD graphics mod for the Stunt Car Racer WASM engine — no engine changes.
 * Works by wrapping the WebGL context before source.js creates it:
 *   - forces MSAA on;
 *   - rewrites the engine's two 3D shaders at compile time (world-space varyings,
 *     value-noise terrain/asphalt texturing, derivative-based sun lighting, depth fog);
 *   - intercepts the engine's two scissored clear fills (sky / far ground) and
 *     draws a photo-sky quad and a ray-cast textured ground plane instead,
 *     using view/projection matrices captured from the engine's uniform uploads.
 * ?classic=1 disables everything.
 */
(function () {
  'use strict';
  if (/[?&]classic=1/.test(location.search)) return;

  // engine fill colors (from glClearColor), 0-255
  var SKY_KEY = '85,153,255';
  var GROUND_KEY = '119,119,85';

  // ── tiny 4x4 helpers (row-vector convention like the engine: pos * M) ──
  function mat4Mul(a, b) { // returns a*b for row-vector use: pos*(a*b) == (pos*a)*b
    var o = new Float32Array(16);
    for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) {
      var s = 0;
      for (var k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c];
      o[r * 4 + c] = s;
    }
    return o;
  }
  function mat4Inv(m) {
    var inv = new Float32Array(16), i;
    inv[0] = m[5]*m[10]*m[15]-m[5]*m[11]*m[14]-m[9]*m[6]*m[15]+m[9]*m[7]*m[14]+m[13]*m[6]*m[11]-m[13]*m[7]*m[10];
    inv[4] = -m[4]*m[10]*m[15]+m[4]*m[11]*m[14]+m[8]*m[6]*m[15]-m[8]*m[7]*m[14]-m[12]*m[6]*m[11]+m[12]*m[7]*m[10];
    inv[8] = m[4]*m[9]*m[15]-m[4]*m[11]*m[13]-m[8]*m[5]*m[15]+m[8]*m[7]*m[13]+m[12]*m[5]*m[11]-m[12]*m[7]*m[9];
    inv[12] = -m[4]*m[9]*m[14]+m[4]*m[10]*m[13]+m[8]*m[5]*m[14]-m[8]*m[6]*m[13]-m[12]*m[5]*m[10]+m[12]*m[6]*m[9];
    inv[1] = -m[1]*m[10]*m[15]+m[1]*m[11]*m[14]+m[9]*m[2]*m[15]-m[9]*m[3]*m[14]-m[13]*m[2]*m[11]+m[13]*m[3]*m[10];
    inv[5] = m[0]*m[10]*m[15]-m[0]*m[11]*m[14]-m[8]*m[2]*m[15]+m[8]*m[3]*m[14]+m[12]*m[2]*m[11]-m[12]*m[3]*m[10];
    inv[9] = -m[0]*m[9]*m[15]+m[0]*m[11]*m[13]+m[8]*m[1]*m[15]-m[8]*m[3]*m[13]-m[12]*m[1]*m[11]+m[12]*m[3]*m[9];
    inv[13] = m[0]*m[9]*m[14]-m[0]*m[10]*m[13]-m[8]*m[1]*m[14]+m[8]*m[2]*m[13]+m[12]*m[1]*m[10]-m[12]*m[2]*m[9];
    inv[2] = m[1]*m[6]*m[15]-m[1]*m[7]*m[14]-m[5]*m[2]*m[15]+m[5]*m[3]*m[14]+m[13]*m[2]*m[7]-m[13]*m[3]*m[6];
    inv[6] = -m[0]*m[6]*m[15]+m[0]*m[7]*m[14]+m[4]*m[2]*m[15]-m[4]*m[3]*m[14]-m[12]*m[2]*m[7]+m[12]*m[3]*m[6];
    inv[10] = m[0]*m[5]*m[15]-m[0]*m[7]*m[13]-m[4]*m[1]*m[15]+m[4]*m[3]*m[13]+m[12]*m[1]*m[7]-m[12]*m[3]*m[5];
    inv[14] = -m[0]*m[5]*m[14]+m[0]*m[6]*m[13]+m[4]*m[1]*m[14]-m[4]*m[2]*m[13]-m[12]*m[1]*m[6]+m[12]*m[2]*m[5];
    inv[3] = -m[1]*m[6]*m[11]+m[1]*m[7]*m[10]+m[5]*m[2]*m[11]-m[5]*m[3]*m[10]-m[9]*m[2]*m[7]+m[9]*m[3]*m[6];
    inv[7] = m[0]*m[6]*m[11]-m[0]*m[7]*m[10]-m[4]*m[2]*m[11]+m[4]*m[3]*m[10]+m[8]*m[2]*m[7]-m[8]*m[3]*m[6];
    inv[11] = -m[0]*m[5]*m[11]+m[0]*m[7]*m[9]+m[4]*m[1]*m[11]-m[4]*m[3]*m[9]-m[8]*m[1]*m[7]+m[8]*m[3]*m[5];
    inv[15] = m[0]*m[5]*m[10]-m[0]*m[6]*m[9]-m[4]*m[1]*m[10]+m[4]*m[2]*m[9]+m[8]*m[1]*m[6]-m[8]*m[2]*m[5];
    var det = m[0]*inv[0]+m[1]*inv[4]+m[2]*inv[8]+m[3]*inv[12];
    if (!det) return null;
    det = 1.0/det;
    for (i = 0; i < 16; i++) inv[i] *= det;
    return inv;
  }

  // ── shared GLSL: value noise + fbm ──
  var NOISE_GLSL = [
    'float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
    'float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);',
    '  return mix(mix(hash12(i), hash12(i+vec2(1.0,0.0)), u.x), mix(hash12(i+vec2(0.0,1.0)), hash12(i+vec2(1.0,1.0)), u.x), u.y); }',
    'float fbm(vec2 p){ float v = 0.0; float a = 0.5; for(int k=0;k<4;k++){ v += a*vnoise(p); p = p*2.03 + 17.7; a *= 0.5; } return v; }',
  ].join('\n');

  // terrain color recipe shared by the ground-fill quad and geometry shader.
  // takes world xz + base tone, returns scrubland color (dry grass, dirt patches, bushes).
  var TERRAIN_GLSL = [
    'vec3 scrubColor(vec2 xz){',
    '  float macro = fbm(xz * 0.011);',                       // large dune-scale patches
    '  float mid   = fbm(xz * 0.055 + 31.0);',                // grass clumps
    '  float fine  = fbm(xz * 0.55 + 7.0);',                  // gravel grain
    '  vec3 dirt   = vec3(0.585, 0.5, 0.385);',
    '  vec3 dry    = vec3(0.615, 0.58, 0.41);',
    '  vec3 green  = vec3(0.42, 0.5, 0.3);',
    '  vec3 c = mix(dirt, dry, smoothstep(0.25, 0.75, macro));',
    '  c = mix(c, green, smoothstep(0.5, 0.82, mid) * 0.65);',
    '  c *= 0.86 + 0.28 * fine;',
    '  float bush = smoothstep(0.78, 0.92, vnoise(xz * 0.42 + 91.0)) * smoothstep(0.35, 0.6, macro);',
    '  c = mix(c, vec3(0.23, 0.28, 0.16), bush * 0.85);',     // dark scrub bushes
    '  return c;',
    '}',
  ].join('\n');

  // 2D backdrop pipeline: discard the flat mountain/lake fills so the photo
  // mountains baked into sky.jpg show instead. Palette sampled from the engine's
  // Little Ramp backdrop; HUD lines (yellow/black) are untouched, whites only
  // above mid-screen. Other tracks may need palette additions — see ledger.
  function rewriteFragment2D(src) {
    return [
      'precision mediump float;',
      'uniform float windowHeight;',
      'varying lowp vec4 outputColor;',
      'bool near3(vec3 c, vec3 t){ return all(lessThan(abs(c - t), vec3(0.03))); }',
      'void main() {',
      '  vec3 c = outputColor.rgb;',
      '  bool mtn = near3(c, vec3(0.3333, 0.4667, 0.4667))',   // 85,119,119 teal
      '        || near3(c, vec3(0.2588, 0.3529, 0.0863))',      // 66,90,22 dark green
      '        || near3(c, vec3(0.6, 0.7333, 0.2))',            // 153,187,51 lime
      '        || near3(c, vec3(0.3333, 0.7333, 1.0));',        // 85,187,255 lake
      '  bool snow = near3(c, vec3(1.0)) && gl_FragCoord.y > windowHeight * 0.5;',
      '  if (mtn || snow) discard;',
      '  gl_FragColor = outputColor;',
      '}',
    ].join('\n');
  }

  // ── engine shader rewrites ──
  function rewriteVertex3D(src) {
    if (src.indexOf('projectionMatrix') < 0) return src;
    return src
      .replace('varying lowp vec4 outputColor;',
        'varying lowp vec4 outputColor;\nvarying vec3 vWorld;\nvarying float vDepth;')
      .replace('   outputColor = vColor;',
        '   vec4 wpos = homogenousPosition * worldMatrix;\n   vWorld = wpos.xyz;\n   vDepth = abs(transformedPosition.w);\n   outputColor = vColor;');
  }
  function rewriteFragment3D(src) {
    if (src.indexOf('textureWeight') < 0) return src;
    return [
      '#extension GL_OES_standard_derivatives : enable',
      '#ifdef GL_FRAGMENT_PRECISION_HIGH',
      'precision highp float;',
      '#else',
      'precision mediump float;',
      '#endif',
      'uniform float textureWeight;',
      'uniform sampler2D uSampler;',
      'uniform sampler2D uHdTexG;',
      'uniform sampler2D uHdTexA;',
      'uniform sampler2D uHdTexM;',
      'uniform sampler2D uHdTexR;',
      'uniform float uHdTexOn;',
      'uniform float uHdDebug;',
      'uniform vec3 uHdCam;',
      'uniform float uHdFog;',
      'uniform float uHdLight;',
      'varying lowp vec4 outputColor;',
      'varying lowp vec2 vTextureCoord;',
      'varying vec3 vWorld;',
      'varying float vDepth;',
      NOISE_GLSL,
      'float lum3(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }',
      'vec3 tri(sampler2D t, vec3 p, vec3 n, float sc){',
      '  vec3 an = abs(n) + vec3(1e-4); an /= (an.x + an.y + an.z);',
      '  return texture2D(t, p.zy * sc).rgb * an.x + texture2D(t, p.xz * sc).rgb * an.y + texture2D(t, p.xy * sc).rgb * an.z;',
      '}',
      'void main() {',
      '  vec4 base = (1.0 - textureWeight) * outputColor + textureWeight * texture2D(uSampler, vTextureCoord);',
      '  vec3 c = base.rgb;',
      '  float r = base.r, g = base.g, b = base.b;',
      '  float mono = max(max(r,g),b) - min(min(r,g),b);',
      '  vec3 fdx = dFdx(vWorld), fdy = dFdy(vWorld);',
      '  vec3 N = cross(fdx, fdy);',
      '  float nl = length(N);',
      '  vec3 Nn = (nl > 0.0001) ? N / nl : vec3(0.0, 1.0, 0.0);',
      '  if (Nn.y < 0.0) Nn = -Nn;',
      '  float fdist = distance(vWorld, uHdCam);',
      '  bool isGround = (abs(r-g) < 0.06) && (b < g - 0.08) && g > 0.3 && g < 0.62;',   // olive terrain -> grass
      '  bool isEarth  = r > g && g > b && (r - g) < 0.3 && (r - b) > 0.1 && r > 0.3 && r < 0.68 && g > 0.28;', // red-brown -> sand run-off
      '  bool isCream  = (abs(r-g) < 0.08) && (b < g - 0.06) && g >= 0.62;',            // pale deck tops
      '  bool isTrack  = (mono < 0.09) && r > 0.32 && r < 0.75;',                       // grey deck
      '  bool isRed    = r > 0.45 && g < 0.36 && b < 0.34 && (r - g) > 0.18;',          // red wall panels
      '  bool isWhite  = r > 0.82 && g > 0.8 && b > 0.78;',                             // white panels / snow
      '  bool isEdge   = isRed || isWhite;',
      '  bool isPale   = mono < 0.12 && b > r + 0.02 && lum3(c) > 0.55 && Nn.y > 0.5;',   // per-track pale terrain (Big Ramp)
      '  if (uHdDebug > 0.5) {',
      '    vec3 dc = vec3(1.0, 0.0, 0.0);',                    // red = unclassified
      '    if (isGround) dc = vec3(0.0, 1.0, 0.0);',           // green
      '    else if (isTrack) dc = vec3(0.5);',                 // grey
      '    else if (isCream) dc = vec3(1.0, 1.0, 0.0);',       // yellow
      '    else if (isEdge) dc = vec3(1.0, 0.0, 1.0);',        // magenta
      '    else if (mono > 0.1 && g > r && g > 0.25) dc = vec3(0.0, 0.0, 1.0);', // blue = rock
      '    if (textureWeight > 0.5) dc = mix(dc, vec3(0.0, 1.0, 1.0), 0.6);',    // cyan tint = engine-textured
      '    gl_FragColor = vec4(dc, 1.0); return;',
      '  }',
      '  if (uHdTexOn > 0.5) {',
      '    float macro = 0.88 + 0.24 * fbm(vWorld.xz * 0.0012);',                       // breaks tiling at range
    '    if (isGround || isPale) {',
      '      float lowland = 1.0 - smoothstep(60.0, 170.0, vWorld.y);',                 // elevated olive = deck surface
      '      vec3 gtex = tri(uHdTexG, vWorld, Nn, 1.0 / 1500.0) * vec3(1.08, 1.02, 0.88) * (1.12 + 0.4 * (g - 0.3));',
      '      vec3 atex = tri(uHdTexA, vWorld, Nn, 1.0 / 680.0) * (0.9 + 1.1 * lum3(c));',
      '      c = mix(atex, gtex, lowland) * macro;',
      '    } else if (isEarth) {',
      '      c = tri(uHdTexR, vWorld, Nn, 1.0 / 1100.0) * (0.72 + 0.5 * lum3(c)) * macro;', // sandy run-off
      '    } else if (isRed && Nn.y > 0.6) {',
      '      float seg = step(0.5, fract((vWorld.x + vWorld.z) / 1800.0));',            // ~900-unit kerb stones
      '      vec3 stone = tri(uHdTexM, vWorld, Nn, 1.0 / 520.0);',
      '      c = mix(vec3(0.78, 0.11, 0.09), vec3(0.93, 0.91, 0.87), seg) * (stone * 1.25);',
      '    } else if (isRed || (isWhite && fdist < 28000.0)) {',
      '      vec3 tex = tri(uHdTexM, vWorld, Nn, 1.0 / 520.0);',
      '      c = c * (tex * 1.3);',                                                     // concrete blocks, keeps red/white
      '      if (isRed) c *= vec3(1.45, 0.8, 0.75);',                                   // vivid painted red like the reference
      '    } else if ((isTrack || isCream) && vWorld.y > -20.0) {',
      '      vec3 tex = tri(uHdTexA, vWorld, Nn, 1.0 / 680.0);',
      '      c = tex * (0.9 + 1.1 * lum3(c)) * macro;',                                 // dark rich asphalt
      '    } else if (!isEdge && mono > 0.1 && g > r && g > 0.25) {',
      '      vec3 tex = tri(uHdTexG, vWorld, Nn, 1.0 / 1500.0) * vec3(1.08, 1.02, 0.88);',  // green geometry = grass (mountains are 2D)
      '      c = tex * (0.62 + 0.75 * lum3(c)) * macro;',
      '    }',
      '  }',
      '  float sun = clamp(dot(Nn, normalize(vec3(0.35, 0.8, 0.45))), 0.0, 1.0);',
      '  c *= mix(1.0, 0.8 + 0.28 * sun, uHdLight);',
      '  vec3 fogC = vec3(0.72, 0.78, 0.88);',
      '  float fog = smoothstep(45000.0, 95000.0, fdist) * 0.55 * uHdFog;',
      '  if (isEdge || isTrack) fog *= 0.45;',                                          // keep racing cues punchy
      '  c = mix(c, fogC, fog);',
      '  gl_FragColor = vec4(c, base.a);',
      '}',
    ].join('\n');
  }

  // ── my own programs: sky quad + ray-cast ground quad ──
  var QUAD_VS = [
    'attribute vec2 aPos;',
    'varying vec2 vUv;',
    'void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.9999, 1.0); }',
  ].join('\n');
  var SKY_FS = [
    'precision mediump float;',
    'varying vec2 vUv;',
    'uniform sampler2D uSky;',
    'uniform vec2 uSkyBand;',   // horizon Y, top Y in window px — maps image bottom onto the horizon
    'void main(){',
    '  float t = clamp((gl_FragCoord.y - uSkyBand.x) / max(1.0, uSkyBand.y - uSkyBand.x), 0.0, 1.0);',
    '  gl_FragColor = vec4(texture2D(uSky, vec2(vUv.x, 1.0 - t)).rgb, 1.0);',
    '}',
  ].join('\n');
  var GROUND_FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec2 vUv;',
    'uniform mat4 uInvVP;',      // inverse of (view*projection), row-vector convention
    'uniform float uGroundY;',
    'uniform vec3 uCamPos;',
    'uniform sampler2D uHdTexG;',
    'uniform float uHdTexOn;',
    NOISE_GLSL,
    TERRAIN_GLSL,
    'vec3 unproject(vec3 ndc){',
    '  vec4 t = vec4(ndc.x, -ndc.y, ndc.z, 1.0);',           // engine flips y; t = pos*(V*P)
    '  vec4 p = t * uInvVP;',
    '  return p.xyz / p.w;',
    '}',
    'void main(){',
    '  vec2 ndc = vUv * 2.0 - 1.0;',
    '  vec3 pNear = unproject(vec3(ndc, 0.2));',
    '  vec3 pFar  = unproject(vec3(ndc, 0.8));',
    '  vec3 dir = pFar - pNear;',
    '  float t = (uGroundY - pNear.y) / (abs(dir.y) < 1e-5 ? 1e-5 : dir.y);',
    '  vec3 fogC = vec3(0.44, 0.57, 0.40);',
    '  if (t < 0.0) { gl_FragColor = vec4(fogC, 1.0); return; }',
    '  vec3 hit = pNear + dir * t;',
    '  vec3 c;',
    '  float d = distance(hit.xz, uCamPos.xz);',
    '  if (uHdTexOn > 0.5) {',
    '    float macro = (0.82 + 0.42 * fbm(hit.xz * 0.0012)) * (0.9 + 0.24 * fbm(hit.xz * 0.00028));',
    '    float bias = -clamp(d / 9000.0, 0.0, 1.75);',                                  // fight mip flattening at range
    '    vec3 tNear = texture2D(uHdTexG, hit.xz / 1500.0, bias).rgb;',
    '    vec3 tFar  = texture2D(uHdTexG, hit.xz / 5000.0, bias * 0.5).rgb;',
    '    c = mix(tNear, tFar, smoothstep(8000.0, 30000.0, d)) * vec3(1.08, 1.02, 0.88) * macro * 1.14;',
    '  } else {',
    '    c = scrubColor(hit.xz);',
    '  }',
    '  c = mix(c, fogC, smoothstep(26000.0, 95000.0, d) * 0.8);',
    '  gl_FragColor = vec4(c, 1.0);',
    '}',
  ].join('\n');

  // billboard trees on the grass plain (drawn with the engine's clip convention
  // so they depth-compose with real geometry)
  var TREE_VS = [
    'attribute vec4 aTree;',    // xyz world base, w = species*100000 + height
    'attribute vec2 aCorner;',  // x -1..1, y 0..1
    'uniform mat4 uV;',
    'uniform mat4 uP;',
    'uniform vec3 uCamT;',
    'varying vec2 vUv;',
    'void main(){',
    '  float species = floor(aTree.w / 100000.0);',
    '  float h = aTree.w - species * 100000.0;',
    '  vec3 toCam = vec3(uCamT.x - aTree.x, 0.0, uCamT.z - aTree.z);',
    '  float tl = length(toCam);',
    '  vec3 right = tl > 60.0 ? vec3(-toCam.z / tl, 0.0, toCam.x / tl) : vec3(0.0, 0.0, 1.0);',   // face camera; overhead = any facing
    '  vec3 pos = aTree.xyz + right * (aCorner.x * h * 0.44) + vec3(0.0, aCorner.y * h, 0.0);',
    '  vec4 t = vec4(pos, 1.0) * uV * uP;',    // identical math to the engine vertex shader
    '  gl_Position = vec4(-t.x, t.y, -(2.0 * t.w - t.z), -t.w);',
    '  vUv = vec2((species + (aCorner.x * 0.5 + 0.5)) * 0.5, 1.0 - aCorner.y * 0.97);',
    '}',
  ].join('\n');
  var TREE_FS = [
    'precision mediump float;',
    'uniform sampler2D uTex;',
    'varying vec2 vUv;',
    'void main(){',
    '  vec4 c = texture2D(uTex, vUv);',
    '  if (c.a < 0.5) discard;',
    '  gl_FragColor = vec4(c.rgb * 0.96, 1.0);',
    '}',
  ].join('\n');

  function hash2i(x, z) {
    var n = x * 374761393 + z * 668265263;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) >>> 0) / 4294967295;
  }

  function buildTreeBuffer(gl) {
    var verts = [];
    var CELL = 16000, RANGE = 128000, EXCL = 18000;
    for (var cx = -RANGE; cx <= RANGE; cx += CELL) {
      for (var cz = -RANGE; cz <= RANGE; cz += CELL) {
        var h1 = hash2i(cx | 0, cz | 0);
        if (h1 > 0.55) continue;                                  // sparse
        var jx = (hash2i(cx + 1, cz) - 0.5) * CELL * 0.8;
        var jz = (hash2i(cx, cz + 1) - 0.5) * CELL * 0.8;
        var x = cx + jx, z = cz + jz;
        if (Math.abs(x) < EXCL && Math.abs(z) < EXCL) continue;   // clear of the start area
        var species = h1 < 0.28 ? 0 : 1;
        var height = 3200 + hash2i(cx + 2, cz + 3) * 2200;   // road is ~3k units wide; trees ~1-1.7 road-widths
        var w = species * 100000 + height;
        // two triangles, corners (-1,0)(1,0)(1,1) / (-1,0)(1,1)(-1,1)
        var quad = [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]];
        for (var q = 0; q < 6; q++) verts.push(x, 0, z, w, quad[q][0], quad[q][1]);
      }
    }
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return { buf: buf, count: verts.length / 6 };
  }

  function compile(gl, vsSrc, fsSrc) {
    function sh(type, src) {
      var s = gl.__origCreateShader.call(gl, type);
      gl.__origShaderSource.call(gl, s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('[hd-graphics] shader compile failed:', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }
    var v = sh(gl.VERTEX_SHADER, vsSrc), f = sh(gl.FRAGMENT_SHADER, fsSrc);
    if (!v || !f) return null;
    var p = gl.createProgram();
    gl.attachShader(p, v); gl.attachShader(p, f);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('[hd-graphics] link failed:', gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  // default sky: generated gradient + soft clouds (replaced by images/sky.jpg when it loads)
  function makeProceduralSky() {
    var cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 512;
    var g = cv.getContext('2d');
    var gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, '#2f6fd0');
    gr.addColorStop(0.55, '#7cabe8');
    gr.addColorStop(0.85, '#c9d9ee');
    gr.addColorStop(1, '#e8eef5');
    g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
    for (var i = 0; i < 90; i++) {
      var y = 90 + Math.pow(Math.random(), 1.6) * 360;
      var x = Math.random() * 1024;
      var rw = 40 + Math.random() * 130, rh = rw * (0.18 + Math.random() * 0.14);
      var a = 0.05 + Math.random() * 0.1;
      var rg = g.createRadialGradient(x, y, 0, x, y, rw);
      rg.addColorStop(0, 'rgba(255,255,255,' + a.toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.save(); g.translate(x, y); g.scale(1, rh / rw); g.beginPath();
      g.arc(0, 0, rw, 0, Math.PI * 2); g.fill(); g.restore();
    }
    return cv;
  }

  function setupOverlays(gl) {
    var st = gl.__hd = {
      quad: gl.createBuffer(),
      skyProg: compile(gl, QUAD_VS, SKY_FS),
      groundProg: compile(gl, QUAD_VS, GROUND_FS),
      skyTex: gl.createTexture(),
      view: null, proj: null,
      groundY: 0,
      enabled: true,
    };
    if (!st.skyProg || !st.groundProg) { st.enabled = false; return; }
    gl.bindBuffer(gl.ARRAY_BUFFER, st.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    st.skyU = gl.getUniformLocation(st.skyProg, 'uSky');
    st.skyBand = gl.getUniformLocation(st.skyProg, 'uSkyBand');
    st.gInvVP = gl.getUniformLocation(st.groundProg, 'uInvVP');
    st.gY = gl.getUniformLocation(st.groundProg, 'uGroundY');
    st.gCam = gl.getUniformLocation(st.groundProg, 'uCamPos');
    st.gTexG = gl.getUniformLocation(st.groundProg, 'uHdTexG');
    st.gTexOn = gl.getUniformLocation(st.groundProg, 'uHdTexOn');

    // trees: program + static buffer + sprite sheet on unit 5
    st.treeProg = compile(gl, TREE_VS, TREE_FS);
    if (st.treeProg) {
      gl.bindAttribLocation(st.treeProg, 0, 'aTree');
      gl.bindAttribLocation(st.treeProg, 1, 'aCorner');
      gl.linkProgram(st.treeProg);
      st.tV = gl.getUniformLocation(st.treeProg, 'uV');
      st.tP = gl.getUniformLocation(st.treeProg, 'uP');
      st.tCam = gl.getUniformLocation(st.treeProg, 'uCamT');
      st.tTex = gl.getUniformLocation(st.treeProg, 'uTex');
      st.trees = buildTreeBuffer(gl);
      st.treeTex = gl.createTexture();
      st.treeReady = false;
      var timg = new Image();
      timg.onload = function () {
        var prevA = gl.getParameter(gl.ACTIVE_TEXTURE);
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_2D, st.treeTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, timg);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.activeTexture(prevA);
        st.treeReady = true;
      };
      timg.onerror = function () { console.error('[hd-graphics] tree sheet failed'); };
      timg.src = 'images/tex-trees.png?v=hd3';
    }

    // world photo textures on units 1-4 (POT, mipmapped, mirrored repeat)
    st.worldTex = {};
    st.texReady = 0;
    var aniso = gl.getExtension('EXT_texture_filter_anisotropic') ||
                gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    var TEXES = [['g', 'images/tex-grass.jpg'], ['a', 'images/tex-asphalt2.jpg'],
                 ['m', 'images/tex-wall.jpg'], ['r', 'images/tex-sand.jpg']];
    TEXES.forEach(function (pair, i) {
      var tex = gl.createTexture();
      st.worldTex[pair[0]] = tex;
      var img2 = new Image();
      img2.onload = function () {
        var prevActive = gl.getParameter(gl.ACTIVE_TEXTURE);
        gl.activeTexture(gl.TEXTURE1 + i);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img2);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
        if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT,
          Math.min(16, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1));
        gl.activeTexture(prevActive);
        st.texReady++;
      };
      img2.onerror = function () { console.error('[hd-graphics] texture failed:', pair[1]); };
      img2.src = pair[1] + '?v=hd3';
    });
    // sky texture: procedural now, photo when available
    function upload(srcCanvasOrImg) {
      gl.bindTexture(gl.TEXTURE_2D, st.skyTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvasOrImg);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    upload(makeProceduralSky());
    var img = new Image();
    img.onload = function () { upload(img); };
    img.src = 'images/sky.jpg?v=hd4';
  }

  function drawQuad(gl, prog, bindUniforms) {
    var st = gl.__hd;
    // save state we touch
    var prevProg = gl.getParameter(gl.CURRENT_PROGRAM);
    var prevBuf = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    var prevDepthTest = gl.isEnabled(gl.DEPTH_TEST);
    var prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK);
    var prevBlend = gl.isEnabled(gl.BLEND);
    var prevCull = gl.isEnabled(gl.CULL_FACE);
    var prevTex = gl.getParameter(gl.TEXTURE_BINDING_2D);
    var prevActive = gl.getParameter(gl.ACTIVE_TEXTURE);
    var attr0 = gl.getVertexAttrib(0, gl.VERTEX_ATTRIB_ARRAY_ENABLED);
    var attr0Buf = gl.getVertexAttrib(0, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING);
    var attr0Size = gl.getVertexAttrib(0, gl.VERTEX_ATTRIB_ARRAY_SIZE);
    var attr0Type = gl.getVertexAttrib(0, gl.VERTEX_ATTRIB_ARRAY_TYPE);
    var attr0Norm = gl.getVertexAttrib(0, gl.VERTEX_ATTRIB_ARRAY_NORMALIZED);
    var attr0Stride = gl.getVertexAttrib(0, gl.VERTEX_ATTRIB_ARRAY_STRIDE);
    var attr0Off = gl.getVertexAttribOffset(0, gl.VERTEX_ATTRIB_ARRAY_POINTER);

    gl.useProgram(prog);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.bindBuffer(gl.ARRAY_BUFFER, st.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    bindUniforms();
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // restore
    gl.useProgram(prevProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, attr0Buf);
    if (attr0Buf) gl.vertexAttribPointer(0, attr0Size, attr0Type, attr0Norm, attr0Stride, attr0Off);
    gl.bindBuffer(gl.ARRAY_BUFFER, prevBuf);
    if (!attr0) gl.disableVertexAttribArray(0);
    if (prevDepthTest) gl.enable(gl.DEPTH_TEST);
    gl.depthMask(prevDepthMask);
    if (prevBlend) gl.enable(gl.BLEND);
    if (prevCull) gl.enable(gl.CULL_FACE);
    gl.activeTexture(prevActive);
    gl.bindTexture(gl.TEXTURE_2D, prevTex);
  }

  function drawSky(gl) {
    var st = gl.__hd;
    var sb = gl.isEnabled(gl.SCISSOR_TEST) ? gl.getParameter(gl.SCISSOR_BOX) : null;
    var vp = gl.getParameter(gl.VIEWPORT);
    var horizonY = sb ? sb[1] : 0;
    var topY = sb ? sb[1] + sb[3] : vp[3];
    drawQuad(gl, st.skyProg, function () {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, st.skyTex);
      gl.uniform1i(st.skyU, 0);
      if (st.skyBand) gl.uniform2f(st.skyBand, horizonY, topY);
    });
  }
  function drawGround(gl) {
    var st = gl.__hd;
    if (!st.view || !st.proj) return false;
    var vp = mat4Mul(st.view, st.proj);
    var inv = mat4Inv(vp);
    if (!inv) return false;
    var invView = mat4Inv(st.view);
    var cam = invView ? [invView[12], invView[13], invView[14]] : [0, 0, 0];
    st._vp = vp;
    st._camPos = cam;
    if (invView) {
      var rx = invView[0], rz = invView[2];
      var rl = Math.sqrt(rx * rx + rz * rz) || 1;
      st._camRight = [rx / rl, 0, rz / rl];   // xz-flattened so billboards stay upright
    }
    drawQuad(gl, st.groundProg, function () {
      gl.uniformMatrix4fv(st.gInvVP, false, inv);
      // camera-relative world: eye sits at y=0, so a plane AT 0 degenerates.
      // The offset below eye tunes where the background ground sits: smaller =
      // ground rises toward the track (elevated sections read anchored, not floating).
      var drop = st.groundDrop != null ? st.groundDrop : 250.0;
      gl.uniform1f(st.gY, st.groundY - drop);
      gl.uniform3f(st.gCam, cam[0], cam[1], cam[2]);
      // bind grass HERE: some tracks (Big Ramp) bind engine textures mid-frame,
      // stomping the frame-start unit-1 binding — never trust it at draw time
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, st.worldTex.g);
      if (st.gTexG) gl.uniform1i(st.gTexG, 1);
      if (st.gTexOn) gl.uniform1f(st.gTexOn, st.texReady >= 4 ? 1 : 0);
    });
    return true;
  }

  function drawTrees(gl) {
    var st = gl.__hd;
    if (!st.treeProg || !st.treeReady || !st.view || !st._camPos) return;
    var prevProg = gl.getParameter(gl.CURRENT_PROGRAM);
    var prevBuf = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    var prevDepthTest = gl.isEnabled(gl.DEPTH_TEST);
    var prevDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK);
    var prevDepthFunc = gl.getParameter(gl.DEPTH_FUNC);
    var prevBlend = gl.isEnabled(gl.BLEND);
    var prevCull = gl.isEnabled(gl.CULL_FACE);
    var prevScissor = gl.isEnabled(gl.SCISSOR_TEST);
    var prevActive = gl.getParameter(gl.ACTIVE_TEXTURE);
    var attrs = [0, 1].map(function (i) {
      return {
        en: gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_ENABLED),
        buf: gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING),
        size: gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_SIZE),
        type: gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_TYPE),
        norm: gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_NORMALIZED),
        stride: gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_STRIDE),
        off: gl.getVertexAttribOffset(i, gl.VERTEX_ATTRIB_ARRAY_POINTER),
      };
    });

    gl.useProgram(st.treeProg);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);   // probe: engine clears depth to 1, tests LESS
    gl.depthMask(true);
    if (prevScissor) gl.disable(gl.SCISSOR_TEST);   // crowns rise above the horizon split
    gl.bindBuffer(gl.ARRAY_BUFFER, st.trees.buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 16);
    gl.uniformMatrix4fv(st.tV, false, st.view);
    gl.uniformMatrix4fv(st.tP, false, st.proj);
    gl.uniform3f(st.tCam, st._camPos[0], st._camPos[1], st._camPos[2]);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, st.treeTex);
    gl.uniform1i(st.tTex, 5);
    gl.drawArrays(gl.TRIANGLES, 0, st.trees.count);

    for (var i = 0; i < 2; i++) {
      var s = attrs[i];
      gl.bindBuffer(gl.ARRAY_BUFFER, s.buf);
      if (s.buf) gl.vertexAttribPointer(i, s.size, s.type, s.norm, s.stride, s.off);
      if (!s.en) gl.disableVertexAttribArray(i);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, prevBuf);
    gl.useProgram(prevProg);
    if (!prevDepthTest) gl.disable(gl.DEPTH_TEST);
    gl.depthMask(prevDepthMask);
    gl.depthFunc(prevDepthFunc);
    if (prevBlend) gl.enable(gl.BLEND);
    if (prevCull) gl.enable(gl.CULL_FACE);
    if (prevScissor) gl.enable(gl.SCISSOR_TEST);
    gl.activeTexture(prevActive);
  }

  // ── context wrapping ──
  function wrap(gl) {
    gl.__origCreateShader = gl.createShader;
    gl.__origShaderSource = gl.shaderSource;
    var origShaderSource = gl.shaderSource.bind(gl);
    gl.shaderSource = function (sh, src) {
      try {
        if (src.indexOf('projectionMatrix') >= 0) src = rewriteVertex3D(src);
        else if (src.indexOf('textureWeight') >= 0) src = rewriteFragment3D(src);
        else if (src.indexOf('gl_FragColor = outputColor') >= 0) src = rewriteFragment2D(src);
      } catch (e) { console.error('[hd-graphics] rewrite failed', e); }
      return origShaderSource(sh, src);
    };

    // capture engine matrix uploads by uniform name
    var locNames = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
    var origGetLoc = gl.getUniformLocation.bind(gl);
    gl.getUniformLocation = function (p, name) {
      var loc = origGetLoc(p, name);
      if (loc && locNames) locNames.set(loc, name);
      return loc;
    };
    var currentProgram = null;
    var camLocs = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
    var origUseProgram = gl.useProgram.bind(gl);
    gl.useProgram = function (p) { currentProgram = p; return origUseProgram(p); };
    var origUM4 = gl.uniformMatrix4fv.bind(gl);
    gl.uniformMatrix4fv = function (loc, transpose, value) {
      var r = origUM4(loc, transpose, value);
      if (loc && locNames && gl.__hd) {
        var n = locNames.get(loc);
        if (n === 'viewMatrix') {
          gl.__hd.view = Array.from(value);
          // feed the camera position to our injected fog uniform on the engine's program
          if (currentProgram && camLocs) {
            var cl = camLocs.get(currentProgram);
            if (cl === undefined) {
              cl = {
                cam: origGetLoc(currentProgram, 'uHdCam'),
                fog: origGetLoc(currentProgram, 'uHdFog'),
                light: origGetLoc(currentProgram, 'uHdLight'),
                tg: origGetLoc(currentProgram, 'uHdTexG'),
                ta: origGetLoc(currentProgram, 'uHdTexA'),
                tm: origGetLoc(currentProgram, 'uHdTexM'),
                tr: origGetLoc(currentProgram, 'uHdTexR'),
                ton: origGetLoc(currentProgram, 'uHdTexOn'),
                dbg: origGetLoc(currentProgram, 'uHdDebug'),
              };
              camLocs.set(currentProgram, cl);
            }
            if (cl.cam) {
              var iv = mat4Inv(gl.__hd.view);
              if (iv) gl.uniform3f(cl.cam, iv[12], iv[13], iv[14]);
            }
            if (cl.fog) gl.uniform1f(cl.fog, gl.__hd.fogMul != null ? gl.__hd.fogMul : 1.0);
            if (cl.light) gl.uniform1f(cl.light, gl.__hd.lightMul != null ? gl.__hd.lightMul : 1.0);
            if (cl.tg) gl.uniform1i(cl.tg, 1);
            if (cl.ta) gl.uniform1i(cl.ta, 2);
            if (cl.tm) gl.uniform1i(cl.tm, 3);
            if (cl.tr) gl.uniform1i(cl.tr, 4);
            if (cl.ton) gl.uniform1f(cl.ton, gl.__hd.texReady >= 4 ? 1 : 0);
            if (cl.dbg) gl.uniform1f(cl.dbg, gl.__hd.debugMul != null ? gl.__hd.debugMul : 0.0);
            // re-assert our texture bindings once per frame (engine only uses unit 0)
            var wt = gl.__hd.worldTex;
            if (wt && gl.__hd.texReady >= 4) {
              var prevA = gl.getParameter(gl.ACTIVE_TEXTURE);
              gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, wt.g);
              gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, wt.a);
              gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, wt.m);
              gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, wt.r);
              gl.activeTexture(prevA);
            }
          }
        } else if (n === 'projectionMatrix') gl.__hd.proj = Array.from(value);
      }
      return r;
    };

    var pendingFill = null; // 'sky' | 'ground' | null
    var origClearColor = gl.clearColor.bind(gl);
    var lastClearLum = 0;
    gl.clearColor = function (r, g, b, a) {
      var key = Math.round(r * 255) + ',' + Math.round(g * 255) + ',' + Math.round(b * 255);
      pendingFill = (key === SKY_KEY) ? 'sky' : (key === GROUND_KEY) ? 'ground' : null;
      lastClearLum = 0.299 * r + 0.587 * g + 0.114 * b;
      return origClearColor(r, g, b, a);
    };
    var origClear = gl.clear.bind(gl);
    gl.clear = function (mask) {
      var st = gl.__hd;
      if (!st || !st.enabled || !(mask & gl.COLOR_BUFFER_BIT)) return origClear(mask);
      var fill = pendingFill;
      // tracks use per-track fill palettes — classify scissored clears by REGION,
      // not color: bottom band = ground fill, upper band = sky fill
      if (gl.isEnabled(gl.SCISSOR_TEST)) {
        var sb = gl.getParameter(gl.SCISSOR_BOX);
        var vpv = gl.getParameter(gl.VIEWPORT);
        if (sb[3] < vpv[3]) fill = (sb[1] <= 0) ? 'ground' : 'sky';
      } else if (!fill && st.view && st.proj && lastClearLum > 0.15) {
        fill = 'ground';   // per-track fullscreen base fill (e.g. Big Ramp pale) -> grass plain
      }
      if (!fill) return origClear(mask);
      var rest = mask & ~gl.COLOR_BUFFER_BIT;
      if (fill === 'sky') {
        if (rest) origClear(rest);
        drawSky(gl);
        return;
      }
      // ground
      if (rest) origClear(rest);
      var drew = false;
      try { drew = drawGround(gl); } catch (e) { drew = false; }
      if (!drew) return origClear(gl.COLOR_BUFFER_BIT); // fall back to the engine fill
      try { drawTrees(gl); } catch (e) { console.error('[hd-graphics] trees', e); }
    };

    setupOverlays(gl);
    window.__hdGraphics = { gl: gl, state: gl.__hd };
  }

  var origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (/^webgl$|^webgl2$|^experimental-webgl$/.test(type) && this.id === 'canvas') {
      if (attrs) attrs.antialias = true; else attrs = { antialias: true };
      var gl = origGetContext.call(this, type, attrs);
      if (gl && !gl.__hdWrapped) { gl.__hdWrapped = true; try { wrap(gl); } catch (e) { console.error('[hd-graphics] wrap failed', e); } }
      return gl;
    }
    return origGetContext.call(this, type, attrs);
  };
})();
