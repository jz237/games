/* Turrican II — Redux (faithful tribute) : data.js
 * Constants, palettes, weapon/enemy configs, and deterministic level builders.
 * All content is ORIGINAL homage art/data — no copyrighted ROM assets.
 * UMD: usable in Node (headless tests) and the browser.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- core geometry / timing --------------------------------------------
  const TILE = 20;            // px per tile (internal buffer)
  const VIEW_W = 640;         // internal render width
  const VIEW_H = 360;         // internal render height
  const FPS = 60;
  const DT = 1 / FPS;

  // ---- physics feel (px / s) ---------------------------------------------
  const PHYS = {
    gravity: 1750,
    jumpVel: 560,           // initial upward jump speed
    jumpCut: 0.42,          // velocity retained when jump released early
    maxFall: 760,
    runAccel: 2600,
    runSpeed: 205,
    airAccel: 1800,
    friction: 2400,
    morphSpeed: 300,        // rolling speed while morphed
    coyote: 0.09,           // grace time after leaving ground
    jumpBuffer: 0.10,       // press-early buffer
  };

  // ---- tile ids -----------------------------------------------------------
  const T = { EMPTY: 0, SOLID: 1, SPIKE: 2, PLATFORM: 3, DECO: 4, WATER: 5 };
  const SOLID_TILES = new Set([T.SOLID]);

  // ---- weapons ------------------------------------------------------------
  // Three primary guns like the original: spread (multiple), beam (rotatable
  // lightning), and bounce. Each has upgrade levels collected via power-ups.
  const WEAPONS = {
    spread: {
      id: 'spread', name: 'MULTIPLE', color: '#ffd23f',
      maxLevel: 3, cooldown: 0.11, speed: 460, damage: 1,
      // fan of bullets per level
      fan: [[0], [-0.14, 0, 0.14], [-0.26, -0.1, 0, 0.1, 0.26]],
    },
    beam: {
      id: 'beam', name: 'BEAM', color: '#6cf3ff',
      maxLevel: 3, cooldown: 0.02, damage: 0.6, length: 240,
      // beam sweeps within +/- range around facing; up/down rotate it
      sweepRange: 1.35,     // radians each way from horizontal
      rotateSpeed: 2.6,     // rad/s while adjusting
      widthByLevel: [6, 10, 15],
    },
    bounce: {
      id: 'bounce', name: 'BOUNCE', color: '#ff7ad9',
      maxLevel: 3, cooldown: 0.16, speed: 360, damage: 1,
      bouncesByLevel: [2, 4, 6],
      countByLevel: [1, 2, 3],
    },
  };
  const WEAPON_ORDER = ['spread', 'beam', 'bounce'];

  // ---- enemies ------------------------------------------------------------
  const ENEMIES = {
    turret: { hp: 3, w: 20, h: 20, touch: 12, score: 150, fireEvery: 1.6, shotSpeed: 200 },
    walker: { hp: 2, w: 20, h: 22, touch: 14, score: 120, speed: 55 },
    flyer:  { hp: 2, w: 22, h: 16, touch: 12, score: 160, speed: 95, amp: 42, freq: 2.2 },
    hopper: { hp: 3, w: 22, h: 22, touch: 16, score: 200, jump: 430, speed: 70 },
    spawner:{ hp: 8, w: 28, h: 28, touch: 16, score: 400, spawnEvery: 2.4 },
  };

  // ---- worlds (theme + palette + generator params) ------------------------
  // Faithful in spirit to Turrican II's progression: outdoor "freedom"
  // landscape -> machine interior -> a shoot-'em-up flight -> organic caverns
  // -> the final fortress. Enhanced original palettes.
  // Faithful to the researched blueprint (SPEC.md §1): 5 worlds / 11 stages
  // (2/2/3/2/2). World 3 (Corridor) is an on-rails shmup — rendered with the
  // platform engine for now; a dedicated shmup mode is a planned enhancement.
  const WORLDS = [
    {
      id: 1, name: 'DESERT', subtitle: 'LANDORIN SURFACE', type: 'platform',
      theme: 'Outdoor rocky desert surface — open sky, powerful winds, waterfalls.',
      palette: {
        sky: ['#0d1a3a', '#2A4C8A', '#4f83bd', '#6FA8DC'],
        far: '#3a4d72', mid: '#5a6d8f', near: '#6b4a2a',
        block: '#8A5A2B', blockTop: '#D9A566', blockEdge: '#4A2F14',
        accent: '#3FAE5A', spike: '#C0C0C0', water: '#2a6f97',
        fog: 'rgba(217,165,102,0.10)',
      },
      gen: { seed: 20260706, cols: 240, floor: 15, roughness: 3, pits: 7, plats: 46 },
    },
    {
      id: 2, name: 'SUBMERGED DUNGEON', type: 'platform',
      theme: 'Underground caverns and an underwater lake; ends on a wind-climb.',
      palette: {
        sky: ['#04141c', '#0E2E3E', '#13455c', '#1B5E7A'],
        far: '#0d2833', mid: '#1a4150', near: '#2C3A45',
        block: '#455A64', blockTop: '#7CF9E6', blockEdge: '#1c2830',
        accent: '#39D0C8', spike: '#B23A48', water: '#1B5E7A',
        fog: 'rgba(57,208,200,0.10)',
      },
      gen: { seed: 22026, cols: 260, floor: 14, roughness: 4, pits: 9, plats: 52 },
    },
    {
      id: 3, name: 'CORRIDOR', subtitle: 'SHMUP INTERLUDE', type: 'shmup',
      theme: 'High-velocity mechanical tunnel blaster (on-rails shoot-em-up).',
      palette: {
        sky: ['#05060F', '#0a0c1e', '#141838', '#241d4a'],
        far: '#12142a', mid: '#3A3F5C', near: '#5C6486',
        block: '#5C6486', blockTop: '#8892C4', blockEdge: '#20233a',
        accent: '#FFD23F', spike: '#E040FB', water: '#241d4a',
        fog: 'rgba(255,107,53,0.10)',
      },
      gen: { seed: 33033, cols: 300, floor: 17, roughness: 2, pits: 0, plats: 30 },
    },
    {
      id: 4, name: 'WALKER FACTORY', type: 'platform',
      theme: 'Industrial machine interior — fire-breathing statues, crush hazards.',
      palette: {
        sky: ['#0a0a0d', '#1A1A1D', '#252529', '#33333a'],
        far: '#1c1c22', mid: '#3E3E46', near: '#57575F',
        block: '#57575F', blockTop: '#F2C037', blockEdge: '#1a1a1d',
        accent: '#FF4D2E', spike: '#FFB347', water: '#2EC4E0',
        fog: 'rgba(255,77,46,0.10)',
      },
      gen: { seed: 44044, cols: 280, floor: 14, roughness: 5, pits: 10, plats: 58 },
    },
    {
      id: 5, name: 'ALIEN SHIP', type: 'platform',
      theme: 'Giger-esque biomechanical world — eggs, huggers, bone set pieces.',
      palette: {
        sky: ['#0a0710', '#1B1420', '#2E2233', '#463349'],
        far: '#1b1420', mid: '#2e2233', near: '#463349',
        block: '#463349', blockTop: '#B23A5A', blockEdge: '#170f1a',
        accent: '#8FD14F', spike: '#D9C7B0', water: '#7A2E3B',
        fog: 'rgba(143,209,79,0.10)',
      },
      gen: { seed: 55055, cols: 300, floor: 13, roughness: 4, pits: 11, plats: 60, boss: true },
    },
  ];

  // ---- deterministic RNG (mulberry32) ------------------------------------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- level builder ------------------------------------------------------
  // Builds a scrolling maze-ish level from generator params. Deterministic.
  function buildLevel(worldIndex, stageIndex) {
    const world = WORLDS[worldIndex % WORLDS.length];
    const g = world.gen;
    const rnd = mulberry32((g.seed + stageIndex * 7919) >>> 0);
    const cols = g.cols;
    const rows = 22;
    const tiles = new Uint8Array(cols * rows);
    const idx = (x, y) => y * cols + x;
    const set = (x, y, v) => { if (x >= 0 && x < cols && y >= 0 && y < rows) tiles[idx(x, y)] = v; };
    const get = (x, y) => (x < 0 || x >= cols || y < 0 || y >= rows) ? T.SOLID : tiles[idx(x, y)];

    // rolling ground height per column
    let h = g.floor;
    const groundH = new Array(cols);
    const pitCols = new Set();
    // choose pit locations
    for (let p = 0; p < g.pits; p++) {
      const start = 12 + Math.floor(rnd() * (cols - 24));
      const width = 2 + Math.floor(rnd() * 4);
      for (let w = 0; w < width; w++) pitCols.add(start + w);
    }
    for (let x = 0; x < cols; x++) {
      if (x % 4 === 0) h += Math.round((rnd() - 0.5) * g.roughness);
      h = Math.max(9, Math.min(rows - 3, h));
      groundH[x] = h;
      const isPit = pitCols.has(x) && x > 8 && x < cols - 8;
      if (!isPit) {
        for (let y = h; y < rows; y++) set(x, y, T.SOLID);
      } else {
        // spikes at the bottom of some pits
        if (rnd() < 0.5) set(x, rows - 1, T.SPIKE);
      }
    }

    // ceiling in interior worlds
    if (world.type === 'platform' && worldIndex >= 1) {
      for (let x = 0; x < cols; x++) {
        const ch = 1 + (rnd() < 0.3 ? 1 : 0);
        for (let y = 0; y < ch; y++) set(x, y, T.SOLID);
      }
    }

    // floating platforms
    const platforms = [];
    for (let p = 0; p < g.plats; p++) {
      const px = 10 + Math.floor(rnd() * (cols - 20));
      const py = 5 + Math.floor(rnd() * (rows - 10));
      const pw = 2 + Math.floor(rnd() * 5);
      // avoid overwriting the ground column tops
      let ok = true;
      for (let w = 0; w < pw; w++) if (py >= groundH[Math.min(cols - 1, px + w)] - 1) ok = false;
      if (!ok) continue;
      for (let w = 0; w < pw; w++) set(px + w, py, T.SOLID);
      platforms.push({ x: px, y: py, w: pw });
    }

    // ---- entities ---------------------------------------------------------
    const entities = [];
    const surfaceY = (x) => {
      for (let y = 0; y < rows; y++) if (get(x, y) === T.SOLID) return y;
      return rows - 1;
    };
    const addOnSurface = (x, type) => {
      const sy = surfaceY(x);
      entities.push({ type, tx: x, ty: sy - 1 });
    };

    // enemies on platforms + ground
    const enemyTypes = worldIndex >= 3
      ? ['turret', 'flyer', 'hopper', 'spawner']
      : ['turret', 'walker', 'flyer', 'hopper'];
    const enemyCount = 14 + worldIndex * 3;
    for (let e = 0; e < enemyCount; e++) {
      const x = 14 + Math.floor(rnd() * (cols - 24));
      const type = enemyTypes[Math.floor(rnd() * enemyTypes.length)];
      if (type === 'flyer') {
        entities.push({ type, tx: x, ty: 3 + Math.floor(rnd() * 8) });
      } else {
        addOnSurface(x, type);
      }
    }

    // gems: arcs + clusters
    const gemArcs = 10 + worldIndex * 2;
    for (let a = 0; a < gemArcs; a++) {
      const bx = 8 + Math.floor(rnd() * (cols - 16));
      const by = 4 + Math.floor(rnd() * (rows - 8));
      const n = 3 + Math.floor(rnd() * 4);
      for (let i = 0; i < n; i++) {
        const gx = bx + i;
        const gy = by - Math.round(Math.sin((i / (n - 1)) * Math.PI) * 2);
        if (get(gx, gy) === T.EMPTY) entities.push({ type: 'gem', tx: gx, ty: gy });
      }
    }

    // power-ups (weapon / life / energy / bomb / line)
    const powers = ['pu_weapon', 'pu_weapon', 'pu_energy', 'pu_bomb', 'pu_line', 'pu_life'];
    const puCount = 5 + worldIndex;
    for (let p = 0; p < puCount; p++) {
      const x = 16 + Math.floor(rnd() * (cols - 30));
      const kind = powers[Math.floor(rnd() * powers.length)];
      const sy = surfaceY(x);
      entities.push({ type: kind, tx: x, ty: sy - 1 });
    }

    // player start (left) and exit (right)
    const startX = 3;
    const startSurf = surfaceY(startX);
    const playerStart = { x: startX * TILE + 2, y: (startSurf - 2) * TILE };
    const exitX = cols - 4;
    const exitSurf = surfaceY(exitX);
    const exit = { x: exitX * TILE, y: (exitSurf - 3) * TILE, w: TILE * 2, h: TILE * 3 };

    return {
      world: world.id, worldIndex, stageIndex, name: world.name, type: world.type,
      theme: world.theme, palette: world.palette, boss: !!g.boss,
      cols, rows, tile: TILE, tiles, entities, playerStart, exit,
      timeLimit: 300,
    };
  }

  return {
    TILE, VIEW_W, VIEW_H, FPS, DT, PHYS, T, SOLID_TILES,
    WEAPONS, WEAPON_ORDER, ENEMIES, WORLDS,
    mulberry32, buildLevel,
    VERSION: '0.1.0',
  };
});
