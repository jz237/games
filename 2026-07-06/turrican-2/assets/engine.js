/* Turrican II — Redux : engine.js
 * Pure, deterministic game logic (no rendering / audio). UMD for Node tests.
 * Fixed 60Hz tick via step(state, input). Emits cosmetic `events` for the
 * renderer to turn into particles/sound.
 */
(function (root, factory) {
  const D = (typeof module === 'object' && module.exports) ? require('./data.js') : root.TData;
  const mod = factory(D);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.TEngine = mod;
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  const { TILE, PHYS, T, WEAPONS, WEAPON_ORDER, ENEMIES, BOSSES } = D;

  function rects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // ---- tilemap helpers ----------------------------------------------------
  function tileAt(level, tx, ty) {
    // below the map is OPEN AIR so pit falls actually reach the kill plane
    // (sides and ceiling stay solid)
    if (ty >= level.rows) return T.EMPTY;
    if (tx < 0 || tx >= level.cols || ty < 0) return T.SOLID;
    return level.tiles[ty * level.cols + tx];
  }
  function isSolidTile(t) { return t === T.SOLID || t === T.CRATE; }
  function solidAtPx(level, px, py) {
    return isSolidTile(tileAt(level, Math.floor(px / TILE), Math.floor(py / TILE)));
  }
  function solidOverlap(level, box) {
    const x0 = Math.floor(box.x / TILE), x1 = Math.floor((box.x + box.w) / TILE);
    const y0 = Math.floor(box.y / TILE), y1 = Math.floor((box.y + box.h) / TILE);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        if (isSolidTile(tileAt(level, tx, ty))) return true;
    return false;
  }
  // shots vs tiles: crates shatter (score + explosion), solids just stop shots
  function crackAtPx(s, px, py) {
    const lvl = s.level;
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    const tid = tileAt(lvl, tx, ty);
    if (tid === T.CRATE) {
      if (tx >= 0 && tx < lvl.cols && ty >= 0 && ty < lvl.rows) lvl.tiles[ty * lvl.cols + tx] = T.EMPTY;
      s.player.score += 10;
      emit(s, 'explosion', tx * TILE + TILE / 2, ty * TILE + TILE / 2);
      emit(s, 'sfx', 0, 0, { name: 'crate' });
      return 'crate';
    }
    return tid === T.SOLID ? 'solid' : 'none';
  }
  function spikeOverlap(level, box) {
    const x0 = Math.floor(box.x / TILE), x1 = Math.floor((box.x + box.w) / TILE);
    const y0 = Math.floor(box.y / TILE), y1 = Math.floor((box.y + box.h) / TILE);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        if (tileAt(level, tx, ty) === T.SPIKE) return true;
    return false;
  }

  // Move an AABB by (dx,dy) resolving against SOLID tiles. Sub-steps large
  // moves so nothing tunnels through walls. Returns collision info.
  function moveBox(level, box, dx, dy) {
    const dist = Math.max(Math.abs(dx), Math.abs(dy));
    const maxStep = TILE * 0.9;
    if (dist > maxStep) {
      const n = Math.ceil(dist / maxStep);
      const sx = dx / n, sy = dy / n;
      const acc = { hitX: false, hitY: false, onGround: false, ceil: false };
      for (let i = 0; i < n; i++) {
        const info = moveBoxStep(level, box, sx, sy);
        acc.hitX = acc.hitX || info.hitX; acc.hitY = acc.hitY || info.hitY;
        acc.onGround = acc.onGround || info.onGround; acc.ceil = acc.ceil || info.ceil;
      }
      return acc;
    }
    return moveBoxStep(level, box, dx, dy);
  }
  function moveBoxStep(level, box, dx, dy) {
    const info = { hitX: false, hitY: false, onGround: false, ceil: false };
    // horizontal
    box.x += dx;
    if (dx !== 0) {
      const dir = dx > 0 ? 1 : -1;
      const edge = dir > 0 ? box.x + box.w : box.x;
      const tx = Math.floor(edge / TILE);
      const y0 = Math.floor(box.y / TILE), y1 = Math.floor((box.y + box.h - 0.01) / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        if (isSolidTile(tileAt(level, tx, ty))) {
          if (dir > 0) box.x = tx * TILE - box.w - 0.01;
          else box.x = (tx + 1) * TILE + 0.01;
          info.hitX = true;
          break;
        }
      }
    }
    // vertical
    box.y += dy;
    if (dy !== 0) {
      const dir = dy > 0 ? 1 : -1;
      const edge = dir > 0 ? box.y + box.h : box.y;
      const ty = Math.floor(edge / TILE);
      const x0 = Math.floor(box.x / TILE), x1 = Math.floor((box.x + box.w - 0.01) / TILE);
      for (let tx = x0; tx <= x1; tx++) {
        if (isSolidTile(tileAt(level, tx, ty))) {
          if (dir > 0) { box.y = ty * TILE - box.h - 0.01; info.onGround = true; }
          else { box.y = (ty + 1) * TILE + 0.01; info.ceil = true; }
          info.hitY = true;
          break;
        }
      }
    }
    return info;
  }

  // ---- game creation ------------------------------------------------------
  function createGame(level, carry, opts) {
    carry = carry || {};
    const diff = D.DIFFICULTY[(opts && opts.difficulty) || 'normal'] || D.DIFFICULTY.normal;
    const ps = level.playerStart;
    const player = {
      x: ps.x, y: ps.y, w: 14, h: 30, vx: 0, vy: 0,
      facing: 1, onGround: false, crouch: false,
      morph: false, morphCooldown: 0,
      energy: carry.energy != null ? carry.energy : 100, maxEnergy: 100,
      lives: carry.lives != null ? carry.lives : 3,
      score: carry.score || 0, gems: carry.gems || 0,
      weapons: carry.weapons || { spread: 1, beam: 0, bounce: 0 },
      weapon: carry.weapon || 'spread',
      cooldown: 0, invuln: 0, beamAngle: 0,
      bombs: carry.bombs != null ? carry.bombs : 2,
      lines: carry.lines != null ? carry.lines : 3,
      dead: false, deathTimer: 0,
    };
    if (level.type === 'shmup') { player.w = D.SHMUP.shipW; player.h = D.SHMUP.shipH; }

    const enemies = [];
    const pickups = [];
    for (const e of level.entities) {
      const px = e.tx * TILE, py = e.ty * TILE;
      if (ENEMIES[e.type]) {
        const en = makeEnemy(e.type, e.skin, px, py);
        en.hp = en.hp * diff.hp;
        enemies.push(en);
      } else if (e.type.startsWith('pu_') || e.type === 'gem') {
        pickups.push({ type: e.type, x: px + 2, y: py + 2, w: 16, h: 16, t: 0, taken: false, baseY: py + 2 });
      }
    }

    // boss (SPEC §4): spawned dormant; wakes when the player enters the arena
    let boss = null;
    if (level.bossSpawn) {
      const bs = level.bossSpawn;
      const cfg = BOSSES[bs.key];
      boss = {
        key: bs.key, cfg, name: cfg.name,
        x: bs.x, y: bs.y, w: cfg.w, h: cfg.h,
        homeX: bs.x, homeY: bs.y, groundY: bs.groundY,
        hp: cfg.hp * diff.hp, maxHp: cfg.hp * diff.hp,
        alive: true, awake: false, wakeX: bs.wakeX, wallCol: bs.wallCol,
        state: 'idle', stateT: 1.2, t: 0, ai: 0, open: false,
        vx: 0, vy: 0, hitFlash: 0, phase: 0, attack: null, attackT: 0,
        dying: false, deathT: 0,
      };
    }

    return {
      level, player, enemies, pickups,
      pshots: [], eshots: [], mines: [], floats: [],
      cam: { x: 0, y: 0 }, time: Math.round(level.timeLimit * diff.time), freeze: 0,
      won: false, gameOver: false, events: [], frame: 0,
      shake: 0, boss, bossDead: !boss,
      diffDmg: diff.dmg, diffHp: diff.hp,
      checkpoint: null,
    };
  }

  function emit(s, type, x, y, extra) { s.events.push(Object.assign({ type, x, y }, extra)); }

  function makeEnemy(type, skin, x, y) {
    const cfg = ENEMIES[type];
    return {
      type, skin: skin || null, cfg, x, y, w: cfg.w, h: cfg.h,
      hp: cfg.hp, vx: 0, vy: 0, t: Math.random() * 3, facing: -1,
      onGround: false, homeX: x, homeY: y, fireT: cfg.fireEvery || 0,
      spawnT: cfg.spawnEvery || 0, alive: true, hitFlash: 0,
    };
  }

  // ---- firing -------------------------------------------------------------
  function fireWeapon(s, input) {
    const p = s.player;
    const w = WEAPONS[p.weapon];
    const lvl = p.weapons[p.weapon];
    if (lvl <= 0) return;
    if (p.cooldown > 0) return;

    const muzzleX = p.x + p.w / 2 + p.facing * 12;
    const muzzleY = s.level.type === 'shmup' ? p.y + p.h / 2 : p.y + (p.crouch ? 16 : 11);

    if (p.weapon === 'beam') {
      p.cooldown = w.cooldown;
      // beam handled continuously in updateBeam; nothing to spawn here
      return;
    }
    if (p.weapon === 'spread') {
      p.cooldown = w.cooldown;
      // vertical aim: UP fires skyward; DOWN while airborne fires below
      let baseAng = null;
      if (input && input.up && s.level.type !== 'shmup') baseAng = -Math.PI / 2;
      else if (input && input.down && !p.onGround && s.level.type !== 'shmup') baseAng = Math.PI / 2;
      const mx = baseAng === null ? muzzleX : p.x + p.w / 2;
      const my = baseAng === null ? muzzleY : (baseAng < 0 ? p.y - 4 : p.y + p.h + 4);
      p.aimDir = baseAng === null ? 0 : (baseAng < 0 ? -1 : 1);
      const fan = w.fan[Math.min(lvl - 1, w.fan.length - 1)];
      for (const a of fan) {
        const ang = baseAng === null ? a * p.facing : baseAng + a;
        const fdir = baseAng === null ? p.facing : 1;
        s.pshots.push({
          x: mx, y: my, w: 7, h: 4,
          vx: Math.cos(ang) * w.speed * fdir, vy: Math.sin(ang) * w.speed,
          dmg: w.damage, life: 1.1, kind: 'spread',
        });
      }
      emit(s, 'muzzle', mx, my, { color: w.color });
      emit(s, 'sfx', 0, 0, { name: 'shoot' });
    } else if (p.weapon === 'bounce') {
      p.cooldown = w.cooldown;
      const count = w.countByLevel[Math.min(lvl - 1, 2)];
      const bounces = w.bouncesByLevel[Math.min(lvl - 1, 2)];
      for (let i = 0; i < count; i++) {
        s.pshots.push({
          x: muzzleX, y: muzzleY, w: 8, h: 8,
          vx: w.speed * p.facing, vy: -60 + i * 60,
          dmg: w.damage, life: 2.2, kind: 'bounce', bounces,
        });
      }
      emit(s, 'muzzle', muzzleX, muzzleY, { color: w.color });
      emit(s, 'sfx', 0, 0, { name: 'shoot' });
    }
  }

  function updateBeam(s, input, dt) {
    const p = s.player;
    if (p.weapon !== 'beam' || p.weapons.beam <= 0 || !input.fire || p.morph) {
      p.beamActive = false; return;
    }
    const w = WEAPONS.beam;
    // rotate with up/down (ship mode fires straight ahead; up/down steer the ship)
    if (s.level.type === 'shmup') p.beamAngle = 0;
    else {
      if (input.up) p.beamAngle = clamp(p.beamAngle - w.rotateSpeed * dt, -w.sweepRange, w.sweepRange);
      if (input.down) p.beamAngle = clamp(p.beamAngle + w.rotateSpeed * dt, -w.sweepRange, w.sweepRange);
    }
    p.beamActive = true;
    const lvl = p.weapons.beam;
    const ox = p.x + p.w / 2 + p.facing * 10;
    const oy = p.y + 11;
    const ang = p.beamAngle; // relative to horizontal; sign of x by facing
    const dx = Math.cos(ang) * p.facing, dy = Math.sin(ang);
    p.beam = { ox, oy, dx, dy, len: w.length, width: w.widthByLevel[lvl - 1] };
    // damage sampled along the ray — each target takes at most ONE tick per
    // frame so DPS doesn't scale with hitbox size
    const steps = 24;
    const beamTick = w.damage * lvl * dt * 12;
    const struck = new Set();
    let bossStruck = false;
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * w.length;
      const bx = ox + dx * t, by = oy + dy * t;
      const beamHit = crackAtPx(s, bx, by);
      if (beamHit !== 'none') { p.beam.len = t; break; }
      for (const e of s.enemies) {
        if (!e.alive || struck.has(e)) continue;
        if (bx >= e.x && bx <= e.x + e.w && by >= e.y && by <= e.y + e.h) {
          e.hp -= beamTick; e.hitFlash = 0.08; struck.add(e);
        }
      }
      const bb = s.boss;
      if (!bossStruck && bb && bb.alive && bb.awake && !bb.dying &&
          bx >= bb.x && bx <= bb.x + bb.w && by >= bb.y && by <= bb.y + bb.h) {
        bb.hp -= beamTick * (bb.open ? 1 : D.BOSS_GUARD); bb.hitFlash = 0.06; bossStruck = true;
      }
    }
    if ((s.frame % 3) === 0) emit(s, 'sfx', 0, 0, { name: 'beam' });
  }

  // ---- projectiles --------------------------------------------------------
  function updateShots(s, dt) {
    const lvl = s.level;
    for (const b of s.pshots) {
      b.life -= dt;
      if (b.hitT > 0) b.hitT -= dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.kind === 'bounce') {
        b.vy += 900 * dt;
        const floorHit = crackAtPx(s, b.x, b.y + b.h);
        if (floorHit === 'solid') { b.vy = -Math.abs(b.vy) * 0.86; b.bounces--; }
        const sideHit = crackAtPx(s, b.x + (b.vx > 0 ? b.w : 0), b.y);
        if (sideHit === 'solid') { b.vx = -b.vx; b.bounces--; }
        if (b.bounces <= 0) b.life = 0;
      } else {
        const hit = crackAtPx(s, b.x + b.w / 2, b.y + b.h / 2);
        if (hit !== 'none') { b.life = 0; if (hit === 'solid') emit(s, 'spark', b.x, b.y); }
      }
    }
    s.pshots = s.pshots.filter(b => b.life > 0);

    for (const b of s.eshots) {
      b.life -= dt;
      if (b.grav) b.vy += b.grav * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (solidAtPx(lvl, b.x, b.y)) b.life = 0;
    }
    s.eshots = s.eshots.filter(b => b.life > 0);
  }

  // ---- enemies ------------------------------------------------------------
  function updateEnemies(s, dt) {
    const p = s.player;
    for (const e of s.enemies) {
      if (!e.alive) continue;
      e.t += dt;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      const frozen = s.freeze > 0;

      if (!frozen) {
        if (e.type === 'turret') {
          e.fireT -= dt;
          // barrel tracks the player continuously (so the sprite aims honestly)
          e.aim = Math.atan2(p.y + 12 - e.y, p.x - e.x);
          const dist = Math.abs(e.x - p.x);
          if (e.fireT <= 0 && dist < 320) {
            if (D.LOB_SKINS.has(e.skin)) {
              // polyp / acid maw: lob a gravity arc toward the player
              e.fireT = e.cfg.fireEvery * 1.3;
              s.eshots.push({ x: e.x + e.w / 2, y: e.y, w: 7, h: 7,
                vx: clamp((p.x - e.x) * 0.9, -220, 220), vy: -250, grav: 560, life: 4, kind: 'lob' });
              emit(s, 'sfx', 0, 0, { name: 'eshoot' });
            } else if (e.skin === 'statue' && dist < 190) {
              // walker statue: short-range flame cone
              e.fireT = e.cfg.fireEvery * 1.4;
              const dir = Math.sign(p.x - e.x) || 1;
              for (let i = -1; i <= 1; i++) {
                s.eshots.push({ x: e.x + e.w / 2 + dir * 10, y: e.y + 6, w: 8, h: 8,
                  vx: dir * 190, vy: i * 55, life: 0.6, kind: 'flame' });
              }
              emit(s, 'sfx', 0, 0, { name: 'flame' });
            } else if (e.skin !== 'statue') {
              e.fireT = e.cfg.fireEvery;
              const a = e.aim;
              s.eshots.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, w: 6, h: 6,
                vx: Math.cos(a) * e.cfg.shotSpeed, vy: Math.sin(a) * e.cfg.shotSpeed, life: 3 });
              emit(s, 'sfx', 0, 0, { name: 'eshoot' });
            } else e.fireT = 0.2; // statue idles until the player is close
          }
        } else if (e.type === 'drifter') {
          // homing mine: floats toward the player, detonates on contact
          const dx2 = (p.x + p.w / 2) - (e.x + e.w / 2);
          const dy2 = (p.y + p.h / 2) - (e.y + e.h / 2);
          const d = Math.hypot(dx2, dy2) || 1;
          const sp = e.cfg.speed * (e.skin === 'seeker' ? 2.4 : 1);
          if (d < 320 && !p.dead) { e.x += (dx2 / d) * sp * dt; e.y += (dy2 / d) * sp * dt; }
          if (e.skin === 'bubblemine') e.y -= 14 * dt;          // bubbles rise
          e.y += Math.sin(e.t * 3) * 5 * dt;
        } else if (e.type === 'eel') {
          // sinuous swimmer: fast horizontal weave, flips at walls
          e.vx = e.facing * e.cfg.speed;
          const info = moveBox(s.level, e, e.vx * dt, 0);
          if (info.hitX) e.facing = -e.facing;
          e.y = e.homeY + Math.sin(e.t * e.cfg.freq) * e.cfg.amp;
        } else if (e.type === 'spinner') {
          // nuts-on-bolts crusher: orbits its anchor point
          e.x = e.homeX + Math.cos(e.t * e.cfg.spin) * e.cfg.radius;
          e.y = e.homeY + Math.sin(e.t * e.cfg.spin) * e.cfg.radius;
        } else if (e.type === 'egg') {
          // hatches a hugger when approached or damaged
          const near = Math.abs((e.x + e.w / 2) - (p.x + p.w / 2)) < e.cfg.hatchDist &&
                       Math.abs(e.y - p.y) < 80;
          if ((near || e.hp < e.cfg.hp) && !p.dead) {
            e.alive = false;
            emit(s, 'explosion', e.x + e.w / 2, e.y + e.h / 2);
            emit(s, 'sfx', 0, 0, { name: 'hatch' });
            const hug = makeEnemy('hugger', 'hugger', e.x, e.y + e.h - ENEMIES.hugger.h);
            hug.vy = -200; hug.t = 0;
            s.enemies.push(hug);
          }
        } else if (e.type === 'walker') {
          e.vx = e.facing * e.cfg.speed;
          e.vy += PHYS.gravity * dt;
          const info = moveBox(s.level, e, e.vx * dt, e.vy * dt);
          if (info.onGround) e.vy = 0;
          // turn at wall or ledge
          const aheadX = e.x + (e.facing > 0 ? e.w + 2 : -2);
          const footY = e.y + e.h + 2;
          if (info.hitX || !solidAtPx(s.level, aheadX, footY)) e.facing = -e.facing;
        } else if (e.type === 'flyer') {
          const dir = Math.sign(p.x - e.x) || 1;
          e.x += dir * e.cfg.speed * dt;
          e.y = e.homeY + Math.sin(e.t * e.cfg.freq) * e.cfg.amp;
        } else if (e.type === 'hopper' || e.type === 'hugger') {
          const cadence = e.type === 'hugger' ? 0.65 : 1.2;
          e.vy += PHYS.gravity * dt;
          const info = moveBox(s.level, e, e.vx * dt, e.vy * dt);
          if (info.onGround) {
            e.vy = 0;
            if (e.t % cadence < dt * 2) { e.vy = -e.cfg.jump; e.vx = Math.sign(p.x - e.x) * e.cfg.speed; }
            else e.vx *= 0.8;
          }
          if (info.hitX) e.vx = -e.vx;
        } else if (e.type === 'spawner') {
          e.spawnT -= dt;
          if (e.spawnT <= 0 && Math.abs(e.x - p.x) < 360) {
            e.spawnT = e.cfg.spawnEvery;
            // hive nodes birth huggers; factory hubs launch arc drones
            const kind = e.skin === 'hivenode' ? 'hugger' : 'flyer';
            const skin = e.skin === 'hivenode' ? 'hugger' : (e.skin === 'armhub' ? 'arcdrone' : null);
            const sp = makeEnemy(kind, skin, e.x, e.y);
            sp.t = 0; sp.hp *= (s.diffHp || 1);
            s.enemies.push(sp);
          }
        }
      }

      // player shot hits (bounce shots re-hit only after a short cooldown)
      for (const b of s.pshots) {
        if (b.life <= 0) continue;
        if (b.hitT > 0) continue;
        if (rects(b, e)) { e.hp -= b.dmg; e.hitFlash = 0.08;
          if (b.kind !== 'bounce') b.life = 0; else b.hitT = 0.3;
          emit(s, 'spark', b.x, b.y); }
      }
      // morph mines
      for (const m of s.mines) if (m.life > 0 && rects(m, e)) { e.hp -= 3; m.life = 0; emit(s, 'explosion', m.x, m.y); }

      if (e.hp <= 0) {
        e.alive = false;
        p.score += e.cfg.score;
        s.floats.push({ x: e.x, y: e.y, text: '+' + e.cfg.score, life: 0.9, vy: -30 });
        emit(s, 'explosion', e.x + e.w / 2, e.y + e.h / 2);
        emit(s, 'sfx', 0, 0, { name: 'explode' });
        s.shake = Math.min(6, s.shake + 3);
        continue;
      }
      // touch damage to player (mines detonate on contact — even on the wheel)
      if (rects(p, e) && p.invuln <= 0 && !p.morph) {
        hurtPlayer(s, e.cfg.touch, e.x + e.w / 2);
        if (e.cfg.boom) { e.alive = false; emit(s, 'explosion', e.x + e.w / 2, e.y + e.h / 2); emit(s, 'sfx', 0, 0, { name: 'explode' }); }
      } else if (rects(p, e) && p.morph) {
        if (e.cfg.boom) { e.alive = false; emit(s, 'explosion', e.x + e.w / 2, e.y + e.h / 2); emit(s, 'sfx', 0, 0, { name: 'explode' }); }
        else { e.hp -= 6 * dt; e.hitFlash = 0.06; } // morph grinds enemies
      }
    }
    s.enemies = s.enemies.filter(e => e.alive || e.deathAnim);
  }

  // ---- boss ----------------------------------------------------------------
  function bossAttacks(b) {
    return b.cfg.phases ? b.cfg.phases[Math.min(b.phase, b.cfg.phases.length - 1)].attacks : b.cfg.attacks;
  }
  function bossShoot(s, b, vx, vy, opts) {
    s.eshots.push(Object.assign({
      x: b.x + b.w / 2, y: b.y + b.h * 0.45, w: 8, h: 8, vx, vy, life: 3.5, boss: true,
    }, opts || {}));
  }
  function startBossAttack(s, b, atk) {
    const p = s.player;
    const dir = p.x + p.w / 2 < b.x + b.w / 2 ? -1 : 1;
    b.attack = atk; b.state = 'attack';
    if (atk.kind === 'shockwave') {
      b.attackT = 0.5;
      for (let i = 0; i < atk.count; i++) {
        const sp = atk.speed + i * 45;
        s.eshots.push({ x: b.x + b.w / 2 - 10, y: b.groundY - 10, w: 16, h: 10, vx: -sp, vy: 0, life: 2.6, boss: true, kind: 'wave' });
        s.eshots.push({ x: b.x + b.w / 2 - 6, y: b.groundY - 10, w: 16, h: 10, vx: sp, vy: 0, life: 2.6, boss: true, kind: 'wave' });
      }
      s.shake = Math.min(10, s.shake + 6);
      emit(s, 'sfx', 0, 0, { name: 'stomp' });
    } else if (atk.kind === 'lob') {
      b.attackT = 0.6;
      for (let i = 0; i < atk.count; i++) {
        const t = atk.count === 1 ? 0.5 : i / (atk.count - 1);
        const vx = dir * (atk.speed * 0.4 + t * atk.speed * 0.8);
        s.eshots.push({ x: b.x + b.w / 2, y: b.y + 8, w: 8, h: 8, vx, vy: -320 - t * 90, life: 4, boss: true, grav: 620, kind: 'lob' });
      }
      emit(s, 'sfx', 0, 0, { name: 'eshoot' });
    } else if (atk.kind === 'volley') {
      b.attackT = 0.6;
      const cx = b.x + b.w / 2, cy = b.y + b.h * 0.4;
      const base = Math.atan2((p.y + p.h / 2) - cy, (p.x + p.w / 2) - cx);
      for (let i = 0; i < atk.count; i++) {
        const off = atk.count === 1 ? 0 : (i / (atk.count - 1) - 0.5) * (atk.spread || 0.6);
        bossShoot(s, b, Math.cos(base + off) * atk.speed, Math.sin(base + off) * atk.speed + (atk.rise || 0), { kind: 'orb' });
      }
      emit(s, 'sfx', 0, 0, { name: 'eshoot' });
    } else if (atk.kind === 'dash') {
      b.attackT = 1.1;
      b.dashVx = dir * atk.speed;
      emit(s, 'sfx', 0, 0, { name: 'dash' });
    } else if (atk.kind === 'spawn') {
      b.attackT = 0.7;
      const kind = atk.minion || 'flyer';
      for (let i = 0; i < atk.count; i++) {
        const sp = makeEnemy(kind, kind === 'hugger' ? 'hugger' : null,
          b.x + b.w / 2 + (i ? 20 : -20) - ENEMIES[kind].w / 2, b.y + 10);
        sp.t = i * 0.7;
        s.enemies.push(sp);
      }
      emit(s, 'sfx', 0, 0, { name: 'spawn' });
    } else if (atk.kind === 'barrage') {
      b.attackT = atk.dur || 1.4;
      b.barrageLeft = atk.count; b.barrageTick = 0;
    } else if (atk.kind === 'beam') {
      // sweeping fan: fires bullets in a rotating arc from up-forward to down-forward
      b.attackT = 1.3;
      b.sweepLeft = atk.sweeps; b.sweepTick = 0; b.sweepDir = dir;
    } else {
      b.attackT = 0.4;
    }
  }
  function updateBoss(s, dt) {
    const b = s.boss;
    if (!b || !b.alive) return;
    const p = s.player;
    if (b.hitFlash > 0) b.hitFlash -= dt;

    // dormant until the player steps into the arena
    // (shmup: wake when the boss scrolls into view, since the ship may ride
    // the leading edge of the frame far ahead of the wake line)
    if (!b.awake) {
      const woken = s.level.type === 'shmup'
        ? (s.cam.x + D.VIEW_W > b.x - 60)
        : (p.x + p.w > b.wakeX);
      if (!p.dead && woken) {
        b.awake = true; b.state = 'idle'; b.stateT = 1.4;
        sealArena(s, true);
        emit(s, 'banner', 0, 0, { text: 'WARNING', sub: b.name });
        emit(s, 'sfx', 0, 0, { name: 'warning' });
        emit(s, 'music', 0, 0, { name: 'boss' });
        emit(s, 'voice', 0, 0, { name: 'bosswarn', pr: true });
      }
      return;
    }
    // player died: boss backs down (keeps damage), arena reopens
    if (p.dead && !b.dying) {
      b.awake = false; b.open = false; b.state = 'idle'; b.stateT = 1.2;
      b.x = b.homeX; b.y = b.homeY; b.attack = null;
      sealArena(s, false);
      return;
    }

    b.t += dt;

    // death sequence
    if (b.dying) {
      b.deathT -= dt;
      if ((s.frame % 9) === 0) {
        emit(s, 'explosion', b.x + Math.random() * b.w, b.y + Math.random() * b.h);
        emit(s, 'sfx', 0, 0, { name: 'explode' });
      }
      s.shake = Math.min(8, s.shake + 2 * dt * 60);
      if (b.deathT <= 0) {
        b.alive = false; s.bossDead = true;
        p.score += b.cfg.score;
        s.floats.push({ x: b.x, y: b.y, text: '+' + b.cfg.score, life: 1.4, vy: -26 });
        emit(s, 'explosion', b.x + b.w / 2, b.y + b.h / 2);
        emit(s, 'sfx', 0, 0, { name: 'bossdie' });
        emit(s, 'banner', 0, 0, { text: 'TARGET DESTROYED', sub: '' });
        emit(s, 'music', 0, 0, { name: 'world' });
        emit(s, 'voice', 0, 0, { name: 'bossdown', pr: true });
        sealArena(s, false);
        // reward drop
        s.pickups.push({ type: 'pu_energy', x: b.x + b.w / 2 - 20, y: b.groundY - 40, w: 16, h: 16, t: 0, taken: false, baseY: b.groundY - 40 });
        s.pickups.push({ type: 'pu_weapon', x: b.x + b.w / 2 + 8, y: b.groundY - 40, w: 16, h: 16, t: 0, taken: false, baseY: b.groundY - 40 });
        s.shake = 12;
      }
      return;
    }

    // phase shifts at 66% / 33%
    const frac = b.hp / b.maxHp;
    const wantPhase = frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2;
    if (wantPhase > b.phase) {
      b.phase = wantPhase;
      b.state = 'open'; b.stateT = 1.3; b.open = true; b.attack = null;
      emit(s, 'explosion', b.x + b.w / 2, b.y + b.h / 2);
      emit(s, 'sfx', 0, 0, { name: 'phase' });
      s.shake = Math.min(12, s.shake + 8);
    }

    const speedMult = 1 + b.phase * 0.3;
    const frozen = s.freeze > 0;
    // freeze-bomb synergy (SPEC §2.4 "heavy boss damage"): a frozen boss is
    // locked open — its core stays exposed for the whole freeze
    if (frozen) b.open = true;
    else if (b.state !== 'open') b.open = false;

    // hover bob / return home
    if (!frozen && b.state !== 'attack') {
      if (b.cfg.hover > 0) {
        b.y = b.homeY - b.cfg.hover * 0.5 + Math.sin(b.t * 2.2) * b.cfg.hover * 0.5;
      }
      // drift back toward home x
      b.x += (b.homeX - b.x) * Math.min(1, dt * 2);
    }

    if (!frozen) {
      b.stateT -= dt * (b.state === 'idle' ? speedMult : 1);
      if (b.state === 'idle' && b.stateT <= 0) {
        b.state = 'tele'; b.stateT = b.cfg.tele;
        emit(s, 'sfx', 0, 0, { name: 'tele' });
      } else if (b.state === 'tele' && b.stateT <= 0) {
        const list = bossAttacks(b);
        startBossAttack(s, b, list[b.ai % list.length]);
      } else if (b.state === 'attack') {
        const atk = b.attack || { kind: 'none' };
        b.attackT -= dt;
        if (atk.kind === 'dash') {
          b.x += b.dashVx * dt;
          const lo = (b.wallCol + 1) * TILE + 4, hi = (s.level.cols - 2) * TILE - b.w;
          if (b.x < lo) { b.x = lo; b.attackT = 0; }
          if (b.x > hi) { b.x = hi; b.attackT = 0; }
        } else if (atk.kind === 'barrage') {
          b.barrageTick -= dt;
          if (b.barrageLeft > 0 && b.barrageTick <= 0) {
            b.barrageTick = (atk.dur || 1.4) / atk.count;
            b.barrageLeft--;
            const a = Math.atan2((p.y + p.h / 2) - (b.y + b.h * 0.4), (p.x + p.w / 2) - (b.x + b.w / 2))
              + (Math.random() - 0.5) * 1.2;
            bossShoot(s, b, Math.cos(a) * atk.speed, Math.sin(a) * atk.speed, { kind: 'orb' });
            if ((b.barrageLeft % 3) === 0) emit(s, 'sfx', 0, 0, { name: 'eshoot' });
          }
        } else if (atk.kind === 'beam') {
          b.sweepTick -= dt;
          if (b.sweepLeft > 0 && b.sweepTick <= 0) {
            b.sweepTick = 1.3 / atk.sweeps;
            const i = atk.sweeps - b.sweepLeft; b.sweepLeft--;
            const ang = (-0.9 + (i / (atk.sweeps - 1)) * 1.5); // sweep top->down
            bossShoot(s, b, Math.cos(ang) * atk.speed * b.sweepDir, Math.sin(ang) * atk.speed, { kind: 'beam' });
          }
        }
        if (b.attackT <= 0) {
          b.ai++;
          if (b.ai % b.cfg.openEvery === 0) { b.state = 'open'; b.stateT = b.cfg.openDur; b.open = true;
            emit(s, 'sfx', 0, 0, { name: 'coreopen' }); }
          else { b.state = 'idle'; b.stateT = 0.9; }
          b.attack = null;
        }
      } else if (b.state === 'open' && b.stateT <= 0) {
        b.state = 'idle'; b.stateT = 0.9; b.open = false;
      }
    }

    // player shots vs boss (guarded body takes 15%, open core takes full)
    for (const sh of s.pshots) {
      if (sh.life <= 0 || sh.hitT > 0) continue;
      if (rects(sh, b)) {
        const mult = b.open ? 1 : D.BOSS_GUARD;
        b.hp -= sh.dmg * mult; b.hitFlash = 0.08;
        if (sh.kind !== 'bounce') sh.life = 0; else sh.hitT = 0.3;
        emit(s, b.open ? 'spark' : 'clinkfx', sh.x, sh.y);
        emit(s, 'sfx', 0, 0, { name: b.open ? 'bosshit' : 'clink' });
      }
    }
    // mines vs boss
    for (const m of s.mines) {
      if (m.life > 0 && rects(m, b)) {
        b.hp -= b.open ? 8 : 4; m.life = 0; b.hitFlash = 0.1;
        emit(s, 'explosion', m.x, m.y);
      }
    }
    // contact damage
    if (rects(p, b) && p.invuln <= 0 && !p.morph) hurtPlayer(s, b.cfg.touch, b.x + b.w / 2);

    if (b.hp <= 0 && !b.dying) {
      b.dying = true; b.deathT = 2.2; b.open = false;
      s.eshots.length = 0; // clear bullets for the victory moment
      emit(s, 'sfx', 0, 0, { name: 'phase' });
    }
  }
  // seal / reopen the arena with a wall of solid tiles behind the player
  function sealArena(s, on) {
    const b = s.boss; if (!b) return;
    const lv = s.level;
    const col = b.wallCol;
    if (on) {
      b.wallSaved = [];
      for (let ty = 0; ty < lv.rows; ty++) {
        const i = ty * lv.cols + col;
        if (lv.tiles[i] === T.EMPTY) { b.wallSaved.push(i); lv.tiles[i] = T.SOLID; }
      }
    } else if (b.wallSaved) {
      for (const i of b.wallSaved) lv.tiles[i] = T.EMPTY;
      b.wallSaved = null;
    }
  }

  function hurtPlayer(s, dmg, srcX) {
    const p = s.player;
    if (s.godMode) return;
    if (p.invuln > 0) return;
    const prevEnergy = p.energy;
    p.energy -= dmg * (s.diffDmg || 1);
    p.invuln = 1.1;
    if (p.energy > 0 && p.energy < 30 && prevEnergy >= 30) emit(s, 'voice', 0, 0, { name: 'lowenergy' });
    // knockback away from the damage source (SPEC §2.1) — platform mode only
    if (s.level.type !== 'shmup') {
      const away = srcX != null ? (p.x + p.w / 2 < srcX ? -1 : 1) : -p.facing;
      p.vx = away * 180;
      if (p.onGround) p.vy = Math.min(p.vy, -120);
    }
    s.hitstop = 0.06; // brief freeze sells the impact
    s.shake = Math.min(9, s.shake + 5);
    emit(s, 'sfx', 0, 0, { name: 'hit' });
    if (p.energy <= 0) killPlayer(s);
  }

  function killPlayer(s) {
    const p = s.player;
    if (s.godMode) return;
    if (p.dead) return;
    p.dead = true; p.deathTimer = 1.4; p.lives -= 1;
    emit(s, 'explosion', p.x + p.w / 2, p.y + p.h / 2);
    emit(s, 'sfx', 0, 0, { name: 'die' });
    if (p.lives > 0) emit(s, 'voice', 0, 0, { name: 'death' });
    s.shake = 10;
  }

  // ---- pickups ------------------------------------------------------------
  function updatePickups(s, dt) {
    const p = s.player;
    for (const it of s.pickups) {
      if (it.taken) continue;
      it.t += dt;
      it.y = it.baseY + Math.sin(it.t * 3) * 3;
      if (rects(p, it)) {
        it.taken = true;
        applyPickup(s, it.type);
      }
    }
    s.pickups = s.pickups.filter(it => !it.taken);
  }

  function applyPickup(s, type) {
    const p = s.player;
    if (type === 'gem') { p.gems++; p.score += 25;
      if (p.gems % 50 === 0) { p.lives++; emit(s, 'voice', 0, 0, { name: 'oneup' });
        s.floats.push({ x: p.x, y: p.y - 6, text: '1UP', life: 1.2, vy: -24 }); }
      emit(s, 'sfx', 0, 0, { name: 'gem' }); return; }
    emit(s, 'sfx', 0, 0, { name: 'power' });
    if (type === 'pu_weapon') {
      emit(s, 'voice', 0, 0, { name: 'weapon' });
      // grant next unowned weapon, else up current
      const cur = p.weapon;
      if (p.weapons[cur] < WEAPONS[cur].maxLevel) p.weapons[cur]++;
      else {
        const next = WEAPON_ORDER.find(w => p.weapons[w] === 0);
        if (next) { p.weapons[next] = 1; p.weapon = next; }
        else p.weapons[cur] = Math.min(WEAPONS[cur].maxLevel, p.weapons[cur] + 1);
      }
      s.floats.push({ x: p.x, y: p.y - 6, text: WEAPONS[p.weapon].name, life: 1.1, vy: -24 });
    } else if (type === 'pu_energy') { p.energy = Math.min(p.maxEnergy, p.energy + 40); }
    else if (type === 'pu_life') { p.lives++; emit(s, 'voice', 0, 0, { name: 'oneup' });
      s.floats.push({ x: p.x, y: p.y - 6, text: '1UP', life: 1.2, vy: -24 }); }
    else if (type === 'pu_bomb') { p.bombs++; }
    else if (type === 'pu_line') { p.lines++; }
  }

  // ---- morph mines & line -------------------------------------------------
  function updateMines(s, dt) {
    for (const m of s.mines) {
      m.life -= dt;
      // rest on the ground (snap to tile top) instead of slowly sinking
      if (solidAtPx(s.level, m.x, m.y + 4.5)) {
        m.vy = 0;
        m.y = Math.floor((m.y + 4.5) / TILE) * TILE - 4.5;
      } else {
        m.vy += 600 * dt; m.y += m.vy * dt;
      }
    }
    s.mines = s.mines.filter(m => m.life > 0);
  }

  // ---- player -------------------------------------------------------------
  function updatePlayer(s, input, dt) {
    const p = s.player;
    if (p.dead) {
      p.deathTimer -= dt;
      if (p.deathTimer <= 0) {
        if (p.lives <= 0) { s.gameOver = true; }
        else respawn(s);
      }
      return;
    }
    if (p.invuln > 0) p.invuln -= dt;
    if (p.morphCooldown > 0) p.morphCooldown -= dt;
    if (p.cooldown > 0) p.cooldown -= dt;

    if (s.level.type === 'shmup') {
      shipControl(s, input, dt);
    } else {
    // morph toggle (unmorph needs headroom — stay a wheel inside low gaps)
    if (input.morphPressed && p.morphCooldown <= 0) {
      if (p.morph) {
        const test = { x: p.x, y: p.y + p.h - 30, w: 14, h: 30 };
        if (!solidOverlap(s.level, test)) {
          p.morph = false; p.morphCooldown = 0.25;
          p.y = p.y + p.h - 30; p.h = 30; p.w = 14;
          emit(s, 'sfx', 0, 0, { name: 'morph' });
        }
      } else {
        p.morph = true; p.morphCooldown = 0.25;
        p.y = p.y + p.h - 16; p.h = 16; p.w = 16;
        emit(s, 'sfx', 0, 0, { name: 'morph' });
      }
    }

    const wantBeamAim = (p.weapon === 'beam' && input.fire && !p.morph);

    // horizontal movement
    let move = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const accel = p.onGround ? PHYS.runAccel : PHYS.airAccel;
    const maxSpd = p.morph ? PHYS.morphSpeed : (p.inWater ? PHYS.runSpeed * 0.7 : PHYS.runSpeed);
    if (move !== 0) {
      p.vx += move * accel * dt;
      p.vx = clamp(p.vx, -maxSpd, maxSpd);
      if (!wantBeamAim) p.facing = move;
    } else {
      // much lighter damping in the air so jump arcs survive stick release
      const fr = (p.onGround ? PHYS.friction : PHYS.friction * 0.22) * dt;
      if (p.vx > 0) p.vx = Math.max(0, p.vx - fr);
      else if (p.vx < 0) p.vx = Math.min(0, p.vx + fr);
    }

    // crouch: real hitbox shrink (and stand back up only with headroom)
    const wantCrouch = (input.down && p.onGround && !p.morph && !wantBeamAim);
    if (wantCrouch && !p.crouch) { p.crouch = true; p.y += 8; p.h = 22; }
    else if (!wantCrouch && p.crouch) {
      const test = { x: p.x, y: p.y - 8, w: p.w, h: 30 };
      if (!solidOverlap(s.level, test)) { p.crouch = false; p.y -= 8; p.h = 30; }
    }

    // water check (center of the body)
    const wasInWater = !!p.inWater;
    p.inWater = tileAt(s.level, Math.floor((p.x + p.w / 2) / TILE),
      Math.floor((p.y + p.h / 2) / TILE)) === T.WATER;
    if (p.inWater !== wasInWater) {
      emit(s, 'splash', p.x + p.w / 2, p.y + (p.inWater ? 0 : p.h));
      emit(s, 'sfx', 0, 0, { name: 'splash' });
      if (!p.inWater && p.vy < 0) { p.vy *= 1.15; p._coyote = PHYS.coyote; } // breach hop
    }

    // jump (coyote + buffer + variable height)
    p._coyote = (p.onGround ? PHYS.coyote : Math.max(0, (p._coyote || 0) - dt));
    p._buf = input.jumpPressed ? PHYS.jumpBuffer : Math.max(0, (p._buf || 0) - dt);
    if (p._buf > 0 && p._coyote > 0 && !p.morph && !p.inWater) {
      p.vy = -PHYS.jumpVel; p._coyote = 0; p._buf = 0; p.onGround = false;
      emit(s, 'sfx', 0, 0, { name: 'jump' });
    }
    // variable jump height: a single cut on release (SPEC §2.1 JUMP_CUT_MULT)
    if (input.jumpReleased && p.vy < 0 && !p.inWater) p.vy *= PHYS.jumpCut;

    // wind: open-sky gusts push while airborne (SPEC contextual modifiers)
    if (s.level.windX && !p.onGround && !p.inWater) {
      s.windPhase = Math.sin(s.frame * D.DT * 0.45);
      p.vx += s.windPhase * s.level.windX * dt;
    }
    // vertical wind-climb: the updraft column carries the player skyward
    const ud = s.level.updraft;
    if (ud && p.x + p.w / 2 > ud.x0 && p.x + p.w / 2 < ud.x1 && !p.onGround && !p.inWater) {
      p.vy -= 2400 * dt;
      if (p.vy < -290) p.vy = -290;
      if ((s.frame % 4) === 0) emit(s, 'updraft', p.x + p.w / 2, p.y + p.h);
    }

    // auto step-up: smoothly mount ledges up to ~1 tile without jumping (feel
    // + reliable traversal). A 2-tile wall stays a real wall (must jump).
    if (p.onGround && move !== 0 && !p.morph) {
      const aheadX = move > 0 ? p.x + p.w + 2 : p.x - 2;
      const footY = p.y + p.h - 3;
      const ledge = solidAtPx(s.level, aheadX, footY);
      const oneTall = !solidAtPx(s.level, aheadX, footY - TILE - 2);
      const headroom = !solidAtPx(s.level, p.x + 2, p.y - TILE - 2) &&
                       !solidAtPx(s.level, p.x + p.w - 2, p.y - TILE - 2);
      if (ledge && oneTall && headroom) p.y -= (TILE + 2);
    }

    // gravity / swim (SPEC §2.1: WATER_GRAVITY_MULT, all-directional swim)
    if (p.inWater && !p.morph) {
      p.vy += PHYS.gravity * 0.22 * dt;
      if (input.jump || input.up) p.vy -= 2100 * dt;
      if (input.down) p.vy += 900 * dt;
      p.vy = clamp(p.vy, -160, 175);
      if ((s.frame % 18) === 0) emit(s, 'bubble', p.x + p.w / 2, p.y + 6);
    } else if (p.inWater && p.morph) {
      p.vy += PHYS.gravity * 0.5 * dt;      // the wheel sinks
      p.vy = Math.min(p.vy, PHYS.maxFall * 0.5);
    } else {
      p.vy += PHYS.gravity * dt;
      p.vy = Math.min(p.vy, PHYS.maxFall);
    }

    // integrate + collide
    const prevBottom = p.y + p.h;
    const prevVy = p.vy;
    const wasOnGround = p.onGround;
    const info = moveBox(s.level, p, p.vx * dt, p.vy * dt);
    if (info.hitX) p.vx = 0;
    if (info.hitY) { if (info.onGround) p.onGround = true; p.vy = 0; }
    // heavy landing: dust + thud
    if (!wasOnGround && info.onGround && prevVy > 430) {
      emit(s, 'land', p.x + p.w / 2, p.y + p.h);
      emit(s, 'sfx', 0, 0, { name: 'land' });
    }
    p.onGround = info.onGround || (p.onGround && !info.hitY && p.vy >= 0 && onFloor(s.level, p));
    if (!info.onGround) p.onGround = onFloor(s.level, p);

    // one-way platforms: land on top only while descending; jumps/moves pass
    // through from below (so they never bonk a jump). Drop through with Down.
    if (!p.morph && p.vy >= 0 && !input.down && s.level.platforms) {
      const feet = p.y + p.h;
      for (const pl of s.level.platforms) {
        const plx = pl.x * TILE, ply = pl.y * TILE, plw = pl.w * TILE;
        if (p.x + p.w > plx + 2 && p.x < plx + plw - 2 && prevBottom <= ply + 3 && feet >= ply) {
          p.y = ply - p.h; p.vy = 0; p.onGround = true;
          if (pl.belt) p.x += pl.belt * 46 * dt;  // conveyor ledge (W4)
          break;
        }
      }
    }

    // spikes / fall out
    if (spikeOverlap(s.level, p) && p.invuln <= 0) hurtPlayer(s, 30);
    if (p.y > s.level.rows * TILE + 8) killPlayer(s);

    // morph rolling drops mines
    if (p.morph && input.firePressed) {
      s.mines.push({ x: p.x + p.w / 2, y: p.y + p.h, w: 8, h: 8, vy: 0, life: 4 });
    }
    } // end platform-mode movement

    // weapons
    if (input.fire && !p.morph) fireWeapon(s, input);
    else if (!input.fire) p.aimDir = 0;
    updateBeam(s, input, dt);

    // weapon switch
    if (input.switchPressed) {
      const owned = WEAPON_ORDER.filter(w => p.weapons[w] > 0);
      if (owned.length > 1) {
        const i = owned.indexOf(p.weapon);
        p.weapon = owned[(i + 1) % owned.length];
      }
    }
    // smart bomb / freeze (heavy boss damage per SPEC §2.4)
    if (input.bombPressed && p.bombs > 0) {
      p.bombs--; s.freeze = 4; s.shake = 8;
      if (s.boss && s.boss.alive && s.boss.awake && !s.boss.dying) {
        s.boss.hp -= s.boss.maxHp * 0.08; s.boss.hitFlash = 0.15;
      }
      emit(s, 'flash', 0, 0); emit(s, 'sfx', 0, 0, { name: 'bomb' });
      emit(s, 'voice', 0, 0, { name: 'freeze' });
    }
    // power line
    if (input.linePressed && p.lines > 0) {
      p.lines--;
      // vertical damaging line at player x
      const lx = p.x + p.w / 2;
      for (const e of s.enemies) if (e.alive && Math.abs((e.x + e.w / 2) - lx) < 22) e.hp -= 12;
      s.floats.push({ x: lx, y: p.y - 20, text: '', life: 0.4, vy: 0, line: true });
      emit(s, 'line', lx, p.y); emit(s, 'sfx', 0, 0, { name: 'line' });
    }

    // enemy shot hits player
    for (const b of s.eshots) {
      if (b.life <= 0) continue;
      if (rects(p, b) && p.invuln <= 0 && !p.morph) { b.life = 0; hurtPlayer(s, 12, b.x - b.vx); }
    }

    // checkpoint: first crossing arms it (respawn point + fanfare)
    const cp = s.level.checkpoint;
    if (cp && !s.checkpoint && p.x > cp.x && p.onGround) {
      s.checkpoint = cp;
      s.floats.push({ x: p.x, y: p.y - 14, text: 'CHECKPOINT', life: 1.4, vy: -20 });
      emit(s, 'sfx', 0, 0, { name: 'checkpoint' });
    }

    // exit (locked until the stage boss, if any, is destroyed)
    if (rects(p, s.level.exit) && s.bossDead) s.won = true;
  }

  function onFloor(level, p) {
    const y = p.y + p.h + 1;
    return solidAtPx(level, p.x + 2, y) || solidAtPx(level, p.x + p.w - 2, y);
  }

  // the corridor stops scrolling once a blockade boss fills the frame
  function shmupHalted(s) {
    const b = s.boss;
    return !!(b && b.alive && b.awake && s.cam.x >= b.wallCol * TILE - 30);
  }

  // ---- shmup ship control (World 3) ----------------------------------------
  function shipControl(s, input, dt) {
    const p = s.player;
    const S = D.SHMUP;
    p.morph = false; p.crouch = false; p.facing = 1; p.onGround = false;

    const mx = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const my = ((input.up || input.jump) ? -1 : 0) + (input.down ? 1 : 0);
    p.vx += mx * S.accel * dt;
    p.vy += my * S.accel * dt;
    if (!mx) p.vx -= Math.sign(p.vx) * Math.min(Math.abs(p.vx), S.friction * dt);
    if (!my) p.vy -= Math.sign(p.vy) * Math.min(Math.abs(p.vy), S.friction * dt);
    p.vx = clamp(p.vx, -S.maxSpeed, S.maxSpeed);
    p.vy = clamp(p.vy, -S.maxSpeed, S.maxSpeed);

    // the scroll carries the ship forward (so it holds its screen position);
    // pressing against terrain while the tunnel advances = crush damage
    const scrollVx = shmupHalted(s) ? 0 : s.level.scroll;
    const info = moveBox(s.level, p, (p.vx + scrollVx) * dt, p.vy * dt);
    if ((info.hitX || info.hitY) && p.invuln <= 0) hurtPlayer(s, S.wallDamage);
    if (info.hitX) p.vx = 0;
    if (info.hitY) p.vy = 0;

    // stay inside the scrolling frame (the camera drags the ship forward)
    const lo = s.cam.x + 8, hi = s.cam.x + D.VIEW_W - p.w - 8;
    if (p.x < lo) p.x = lo;
    if (p.x > hi) p.x = hi;
    p.y = clamp(p.y, 28, s.level.rows * TILE - p.h - 4);

    // crushed against terrain by the scroll: nudge to free air (and sting)
    if (solidOverlap(s.level, p)) {
      let freed = false;
      for (let dy = 1; dy <= 7 && !freed; dy++) {
        for (const dir of [-1, 1]) {
          const test = { x: p.x, y: p.y + dir * dy * TILE, w: p.w, h: p.h };
          if (test.y > 24 && test.y + test.h < s.level.rows * TILE && !solidOverlap(s.level, test)) {
            p.y = test.y; freed = true;
            if (p.invuln <= 0) hurtPlayer(s, S.wallDamage);
            break;
          }
        }
      }
      if (!freed) p.x += TILE * 0.5; // slide forward as a last resort
    }
  }

  function respawn(s) {
    const p = s.player, ps = s.level.playerStart;
    if (s.level.type === 'shmup') {
      // rejoin the flight where the camera is, in free air
      p.dead = false; p.vx = 0; p.vy = 0;
      p.x = s.cam.x + 60;
      const lv = s.level;
      const col = clamp(Math.floor((p.x + p.w / 2) / TILE), 0, lv.cols - 1);
      let topY = 0; while (topY < lv.rows && lv.tiles[topY * lv.cols + col] !== T.EMPTY) topY++;
      let botY = lv.rows - 1; while (botY >= 0 && lv.tiles[botY * lv.cols + col] !== T.EMPTY) botY--;
      p.y = topY <= botY ? ((topY + botY) / 2) * TILE : (lv.rows / 2) * TILE;
      p.energy = p.maxEnergy; p.invuln = 2.5; p.morph = false;
      s.freeze = 0;
      s.time = s.level.timeLimit; // fresh clock with the fresh life
      return;
    }
    const spawn = s.checkpoint || ps;
    p.dead = false; p.x = spawn.x; p.y = spawn.y; p.vx = 0; p.vy = 0;
    p.energy = p.maxEnergy; p.invuln = 2; p.morph = false; p.h = 30; p.w = 14; p.crouch = false;
    // rewind camera near spawn
    s.freeze = 0;
    s.time = s.level.timeLimit; // fresh clock with the fresh life
  }

  // ---- camera -------------------------------------------------------------
  function updateCamera(s, viewW, viewH) {
    const p = s.player;
    if (s.level.type === 'shmup') {
      // on-rails auto-scroll; the camera parks once a blockade boss fills the frame
      if (!shmupHalted(s) && !p.dead) s.cam.x += s.level.scroll * D.DT;
      s.cam.x = clamp(s.cam.x, 0, s.level.cols * TILE - viewW);
      const targetY = p.y + p.h / 2 - viewH / 2;
      s.cam.y += (targetY - s.cam.y) * 0.10;
      s.cam.y = clamp(s.cam.y, 0, s.level.rows * TILE - viewH);
      return;
    }
    // smoothed look-ahead (no snap on turn) + dead-zone so idle wiggles
    // don't swim the camera
    p._look = (p._look || 0) + (p.facing * 55 - (p._look || 0)) * Math.min(1, D.DT * 2.6);
    const targetX = p.x + p.w / 2 - viewW / 2 + p._look;
    const targetY = p.y + p.h / 2 - viewH / 2;
    const dxc = targetX - s.cam.x, dyc = targetY - s.cam.y;
    const DZX = 14, DZY = 26;
    if (Math.abs(dxc) > DZX) s.cam.x += (dxc - Math.sign(dxc) * DZX) * 0.12;
    if (Math.abs(dyc) > DZY) s.cam.y += (dyc - Math.sign(dyc) * DZY) * 0.09;
    s.cam.x = clamp(s.cam.x, 0, s.level.cols * TILE - viewW);
    s.cam.y = clamp(s.cam.y, 0, s.level.rows * TILE - viewH);
  }

  // ---- main step ----------------------------------------------------------
  function step(s, input, viewW, viewH) {
    const dt = D.DT;
    s.events.length = 0;
    s.frame++;
    if (s.gameOver || s.won) return s;
    if (s.hitstop > 0) { s.hitstop -= dt; return s; } // impact micro-freeze
    if (s.freeze > 0) s.freeze -= dt;
    if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 22);
    const secBefore = Math.ceil(s.time);
    s.time -= dt;
    const secAfter = Math.ceil(s.time);
    if (secAfter !== secBefore && secAfter <= 10 && secAfter > 0 && !s.player.dead) {
      emit(s, 'sfx', 0, 0, { name: 'tick' }); // low-time warning
    }
    if (secAfter === 20 && secBefore === 21 && !s.player.dead) emit(s, 'voice', 0, 0, { name: 'lowtime' });
    if (s.time <= 0 && !s.player.dead) { s.time = 0; killPlayer(s); }

    updatePlayer(s, input, dt);
    updateBeamNoFire(s, input);
    updateShots(s, dt);
    updateEnemies(s, dt);
    updateBoss(s, dt);
    updateMines(s, dt);
    updatePickups(s, dt);
    for (const f of s.floats) { f.life -= dt; f.y += (f.vy || 0) * dt; }
    s.floats = s.floats.filter(f => f.life > 0);
    updateCamera(s, viewW || D.VIEW_W, viewH || D.VIEW_H);
    return s;
  }
  // clear beam when not firing
  function updateBeamNoFire(s, input) {
    if (!(s.player.weapon === 'beam' && input.fire && !s.player.morph)) s.player.beamActive = false;
  }

  return {
    createGame, step, moveBox, rects, tileAt, solidAtPx,
    _internal: { fireWeapon, updateEnemies, hurtPlayer, applyPickup },
  };
});
