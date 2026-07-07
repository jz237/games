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

  const { TILE, PHYS, T, WEAPONS, WEAPON_ORDER, ENEMIES } = D;

  function rects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // ---- tilemap helpers ----------------------------------------------------
  function tileAt(level, tx, ty) {
    if (tx < 0 || tx >= level.cols || ty < 0 || ty >= level.rows) return T.SOLID;
    return level.tiles[ty * level.cols + tx];
  }
  function solidAtPx(level, px, py) {
    const t = tileAt(level, Math.floor(px / TILE), Math.floor(py / TILE));
    return t === T.SOLID;
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
        if (tileAt(level, tx, ty) === T.SOLID) {
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
        if (tileAt(level, tx, ty) === T.SOLID) {
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
  function createGame(level, carry) {
    carry = carry || {};
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

    const enemies = [];
    const pickups = [];
    for (const e of level.entities) {
      const px = e.tx * TILE, py = e.ty * TILE;
      if (ENEMIES[e.type]) {
        const cfg = ENEMIES[e.type];
        enemies.push({
          type: e.type, cfg, x: px, y: py, w: cfg.w, h: cfg.h,
          hp: cfg.hp, vx: 0, vy: 0, t: Math.random() * 3, facing: -1,
          onGround: false, homeX: px, homeY: py, fireT: cfg.fireEvery || 0,
          spawnT: cfg.spawnEvery || 0, alive: true, hitFlash: 0,
        });
      } else if (e.type.startsWith('pu_') || e.type === 'gem') {
        pickups.push({ type: e.type, x: px + 2, y: py + 2, w: 16, h: 16, t: 0, taken: false, baseY: py + 2 });
      }
    }

    return {
      level, player, enemies, pickups,
      pshots: [], eshots: [], mines: [], floats: [],
      cam: { x: 0, y: 0 }, time: level.timeLimit, freeze: 0,
      won: false, gameOver: false, events: [], frame: 0,
      shake: 0,
    };
  }

  function emit(s, type, x, y, extra) { s.events.push(Object.assign({ type, x, y }, extra)); }

  // ---- firing -------------------------------------------------------------
  function fireWeapon(s, input) {
    const p = s.player;
    const w = WEAPONS[p.weapon];
    const lvl = p.weapons[p.weapon];
    if (lvl <= 0) return;
    if (p.cooldown > 0) return;

    const muzzleX = p.x + p.w / 2 + p.facing * 12;
    const muzzleY = p.y + (p.crouch ? 16 : 11);

    if (p.weapon === 'beam') {
      p.cooldown = w.cooldown;
      // beam handled continuously in updateBeam; nothing to spawn here
      return;
    }
    if (p.weapon === 'spread') {
      p.cooldown = w.cooldown;
      const fan = w.fan[Math.min(lvl - 1, w.fan.length - 1)];
      for (const a of fan) {
        const ang = a * p.facing;
        s.pshots.push({
          x: muzzleX, y: muzzleY, w: 7, h: 4,
          vx: Math.cos(ang) * w.speed * p.facing, vy: Math.sin(ang) * w.speed,
          dmg: w.damage, life: 1.1, kind: 'spread',
        });
      }
      emit(s, 'muzzle', muzzleX, muzzleY, { color: w.color });
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
    // rotate with up/down
    if (input.up) p.beamAngle = clamp(p.beamAngle - w.rotateSpeed * dt, -w.sweepRange, w.sweepRange);
    if (input.down) p.beamAngle = clamp(p.beamAngle + w.rotateSpeed * dt, -w.sweepRange, w.sweepRange);
    p.beamActive = true;
    const lvl = p.weapons.beam;
    const ox = p.x + p.w / 2 + p.facing * 10;
    const oy = p.y + 11;
    const ang = p.beamAngle; // relative to horizontal; sign of x by facing
    const dx = Math.cos(ang) * p.facing, dy = Math.sin(ang);
    p.beam = { ox, oy, dx, dy, len: w.length, width: w.widthByLevel[lvl - 1] };
    // damage enemies sampled along the ray
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * w.length;
      const bx = ox + dx * t, by = oy + dy * t;
      if (solidAtPx(s.level, bx, by)) { p.beam.len = t; break; }
      for (const e of s.enemies) {
        if (!e.alive) continue;
        if (bx >= e.x && bx <= e.x + e.w && by >= e.y && by <= e.y + e.h) {
          e.hp -= w.damage * lvl * dt * 12; e.hitFlash = 0.08;
        }
      }
    }
    if ((s.frame % 3) === 0) emit(s, 'sfx', 0, 0, { name: 'beam' });
  }

  // ---- projectiles --------------------------------------------------------
  function updateShots(s, dt) {
    const lvl = s.level;
    for (const b of s.pshots) {
      b.life -= dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.kind === 'bounce') {
        b.vy += 900 * dt;
        if (solidAtPx(lvl, b.x, b.y + b.h)) { b.vy = -Math.abs(b.vy) * 0.86; b.bounces--; }
        if (solidAtPx(lvl, b.x + (b.vx > 0 ? b.w : 0), b.y)) { b.vx = -b.vx; b.bounces--; }
        if (b.bounces <= 0) b.life = 0;
      } else {
        if (solidAtPx(lvl, b.x + b.w / 2, b.y + b.h / 2)) { b.life = 0; emit(s, 'spark', b.x, b.y); }
      }
    }
    s.pshots = s.pshots.filter(b => b.life > 0);

    for (const b of s.eshots) {
      b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
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
          if (e.fireT <= 0 && Math.abs(e.x - p.x) < 320) {
            e.fireT = e.cfg.fireEvery;
            const a = Math.atan2(p.y + 12 - e.y, p.x - e.x);
            s.eshots.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, w: 6, h: 6,
              vx: Math.cos(a) * e.cfg.shotSpeed, vy: Math.sin(a) * e.cfg.shotSpeed, life: 3 });
            emit(s, 'sfx', 0, 0, { name: 'eshoot' });
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
        } else if (e.type === 'hopper') {
          e.vy += PHYS.gravity * dt;
          const info = moveBox(s.level, e, e.vx * dt, e.vy * dt);
          if (info.onGround) {
            e.vy = 0;
            if (e.t % 1.2 < dt * 2) { e.vy = -e.cfg.jump; e.vx = Math.sign(p.x - e.x) * e.cfg.speed; }
            else e.vx *= 0.8;
          }
          if (info.hitX) e.vx = -e.vx;
        } else if (e.type === 'spawner') {
          e.spawnT -= dt;
          if (e.spawnT <= 0 && Math.abs(e.x - p.x) < 360) {
            e.spawnT = e.cfg.spawnEvery;
            const fc = ENEMIES.flyer;
            s.enemies.push({ type: 'flyer', cfg: fc, x: e.x, y: e.y, w: fc.w, h: fc.h,
              hp: fc.hp, vx: 0, vy: 0, t: 0, facing: -1, onGround: false,
              homeX: e.x, homeY: e.y, fireT: 0, spawnT: 0, alive: true, hitFlash: 0 });
          }
        }
      }

      // player shot hits
      for (const b of s.pshots) {
        if (b.life <= 0) continue;
        if (rects(b, e)) { e.hp -= b.dmg; e.hitFlash = 0.08; if (b.kind !== 'bounce') b.life = 0;
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
      // touch damage to player
      if (rects(p, e) && p.invuln <= 0 && !p.morph) hurtPlayer(s, e.cfg.touch);
      else if (rects(p, e) && p.morph) { e.hp -= 4 * dt * 60 * dt; } // morph grinds enemies a bit
    }
    s.enemies = s.enemies.filter(e => e.alive || e.deathAnim);
  }

  function hurtPlayer(s, dmg) {
    const p = s.player;
    if (s.godMode) return;
    if (p.invuln > 0) return;
    p.energy -= dmg;
    p.invuln = 1.1;
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
    if (type === 'gem') { p.gems++; p.score += 25; if (p.gems % 50 === 0) p.lives++;
      emit(s, 'sfx', 0, 0, { name: 'gem' }); return; }
    emit(s, 'sfx', 0, 0, { name: 'power' });
    if (type === 'pu_weapon') {
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
    else if (type === 'pu_life') { p.lives++; s.floats.push({ x: p.x, y: p.y - 6, text: '1UP', life: 1.2, vy: -24 }); }
    else if (type === 'pu_bomb') { p.bombs++; }
    else if (type === 'pu_line') { p.lines++; }
  }

  // ---- morph mines & line -------------------------------------------------
  function updateMines(s, dt) {
    for (const m of s.mines) {
      m.life -= dt; m.vy += 600 * dt; m.y += m.vy * dt;
      if (solidAtPx(s.level, m.x, m.y + 4)) { m.vy = 0; }
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

    // morph toggle
    if (input.morphPressed && p.morphCooldown <= 0) {
      p.morph = !p.morph;
      p.morphCooldown = 0.25;
      p.h = p.morph ? 16 : 30;
      p.w = p.morph ? 16 : 14;
      if (p.morph) { p.y += 14; }
      emit(s, 'sfx', 0, 0, { name: 'morph' });
    }

    const wantBeamAim = (p.weapon === 'beam' && input.fire && !p.morph);

    // horizontal movement
    let move = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const accel = p.onGround ? PHYS.runAccel : PHYS.airAccel;
    const maxSpd = p.morph ? PHYS.morphSpeed : PHYS.runSpeed;
    if (move !== 0) {
      p.vx += move * accel * dt;
      p.vx = clamp(p.vx, -maxSpd, maxSpd);
      if (!wantBeamAim) p.facing = move;
    } else {
      const fr = PHYS.friction * dt;
      if (p.vx > 0) p.vx = Math.max(0, p.vx - fr);
      else if (p.vx < 0) p.vx = Math.min(0, p.vx + fr);
    }

    p.crouch = (input.down && p.onGround && !p.morph && !wantBeamAim);

    // jump (coyote + buffer + variable height)
    p._coyote = (p.onGround ? PHYS.coyote : Math.max(0, (p._coyote || 0) - dt));
    p._buf = input.jumpPressed ? PHYS.jumpBuffer : Math.max(0, (p._buf || 0) - dt);
    if (p._buf > 0 && p._coyote > 0 && !p.morph) {
      p.vy = -PHYS.jumpVel; p._coyote = 0; p._buf = 0; p.onGround = false;
      emit(s, 'sfx', 0, 0, { name: 'jump' });
    }
    if (!input.jump && p.vy < 0) p.vy *= Math.pow(PHYS.jumpCut, dt * 60 > 1 ? 1 : 1); // light cut
    if (input.jumpReleased && p.vy < 0) p.vy *= PHYS.jumpCut;

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

    // gravity
    p.vy += PHYS.gravity * dt;
    p.vy = Math.min(p.vy, PHYS.maxFall);

    // integrate + collide
    const prevBottom = p.y + p.h;
    const info = moveBox(s.level, p, p.vx * dt, p.vy * dt);
    if (info.hitX) p.vx = 0;
    if (info.hitY) { if (info.onGround) p.onGround = true; p.vy = 0; }
    p.onGround = info.onGround || (p.onGround && !info.hitY && p.vy >= 0 && onFloor(s.level, p));
    if (!info.onGround) p.onGround = onFloor(s.level, p);

    // one-way platforms: land on top only while descending; jumps/moves pass
    // through from below (so they never bonk a jump). Drop through with Down.
    if (!p.morph && p.vy >= 0 && !input.down && s.level.platforms) {
      const feet = p.y + p.h;
      for (const pl of s.level.platforms) {
        const plx = pl.x * TILE, ply = pl.y * TILE, plw = pl.w * TILE;
        if (p.x + p.w > plx + 2 && p.x < plx + plw - 2 && prevBottom <= ply + 3 && feet >= ply) {
          p.y = ply - p.h; p.vy = 0; p.onGround = true; break;
        }
      }
    }

    // spikes / fall out
    if (spikeOverlap(s.level, p) && p.invuln <= 0) hurtPlayer(s, 30);
    if (p.y > s.level.rows * TILE + 40) killPlayer(s);

    // morph rolling drops mines
    if (p.morph && input.firePressed) {
      s.mines.push({ x: p.x + p.w / 2, y: p.y + p.h, w: 8, h: 8, vy: 0, life: 4 });
    }

    // weapons
    if (input.fire && !p.morph) fireWeapon(s, input);
    updateBeam(s, input, dt);

    // weapon switch
    if (input.switchPressed) {
      const owned = WEAPON_ORDER.filter(w => p.weapons[w] > 0);
      if (owned.length > 1) {
        const i = owned.indexOf(p.weapon);
        p.weapon = owned[(i + 1) % owned.length];
      }
    }
    // smart bomb / freeze
    if (input.bombPressed && p.bombs > 0) {
      p.bombs--; s.freeze = 4; s.shake = 8;
      emit(s, 'flash', 0, 0); emit(s, 'sfx', 0, 0, { name: 'bomb' });
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
      if (rects(p, b) && p.invuln <= 0 && !p.morph) { b.life = 0; hurtPlayer(s, 12); }
    }

    // exit
    if (rects(p, s.level.exit)) s.won = true;
  }

  function onFloor(level, p) {
    const y = p.y + p.h + 1;
    return solidAtPx(level, p.x + 2, y) || solidAtPx(level, p.x + p.w - 2, y);
  }

  function respawn(s) {
    const p = s.player, ps = s.level.playerStart;
    p.dead = false; p.x = ps.x; p.y = ps.y; p.vx = 0; p.vy = 0;
    p.energy = p.maxEnergy; p.invuln = 2; p.morph = false; p.h = 30; p.w = 14;
    // rewind camera near spawn
    s.freeze = 0;
  }

  // ---- camera -------------------------------------------------------------
  function updateCamera(s, viewW, viewH) {
    const p = s.player;
    const targetX = p.x + p.w / 2 - viewW / 2 + p.facing * 40;
    const targetY = p.y + p.h / 2 - viewH / 2;
    s.cam.x += (targetX - s.cam.x) * 0.12;
    s.cam.y += (targetY - s.cam.y) * 0.10;
    s.cam.x = clamp(s.cam.x, 0, s.level.cols * TILE - viewW);
    s.cam.y = clamp(s.cam.y, 0, s.level.rows * TILE - viewH);
  }

  // ---- main step ----------------------------------------------------------
  function step(s, input, viewW, viewH) {
    const dt = D.DT;
    s.events.length = 0;
    s.frame++;
    if (s.gameOver || s.won) return s;
    if (s.freeze > 0) s.freeze -= dt;
    if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 22);
    s.time -= dt;
    if (s.time <= 0 && !s.player.dead) { s.time = 0; killPlayer(s); }

    updatePlayer(s, input, dt);
    updateBeamNoFire(s, input);
    updateShots(s, dt);
    updateEnemies(s, dt);
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
