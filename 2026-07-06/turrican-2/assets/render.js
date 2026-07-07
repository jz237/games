/* Turrican II — Redux : render.js
 * Canvas rendering with enhanced procedural graphics + particle system.
 * Browser-only. Draws to an internal buffer then scales to the display canvas.
 */
(function (root, factory) {
  root.TRender = factory(root.TData);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  const { TILE, VIEW_W, VIEW_H, T } = D;

  function createRenderer(display) {
    const buf = document.createElement('canvas');
    buf.width = VIEW_W; buf.height = VIEW_H;
    const bx = buf.getContext('2d');
    const dx = display.getContext('2d');
    let level = null, pal = null, bgImg = null, tilePattern = null;
    const stars = [];
    const particles = [];
    let flash = 0;

    function loadBg(src) {
      const img = new Image();
      img.onload = () => { bgImg = img; };
      img.onerror = () => { bgImg = null; };
      img.src = src;
    }

    function setLevel(lv) {
      level = lv; pal = lv.palette;
      // parallax star/dust field
      stars.length = 0;
      for (let i = 0; i < 90; i++) stars.push({
        x: Math.random(), y: Math.random() * 0.75, z: 0.2 + Math.random() * 0.6,
        s: 0.5 + Math.random() * 1.8,
      });
      particles.length = 0;
      // try a world background image (optional, degrades gracefully)
      bgImg = null;
      loadBg(`assets/img/world${lv.world}-bg.jpg`);
    }

    // ---- particle spawns --------------------------------------------------
    function burst(x, y, n, color, spd, life, size) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = spd * (0.3 + Math.random() * 0.7);
        particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          life, max: life, color, size: size * (0.6 + Math.random() * 0.8), g: 40 });
      }
    }
    function consumeEvents(events) {
      for (const e of events) {
        if (e.type === 'explosion') {
          burst(e.x, e.y, 22, '#ffce54', 220, 0.55, 3.2);
          burst(e.x, e.y, 12, '#ff6b3b', 150, 0.7, 4);
          particles.push({ ring: true, x: e.x, y: e.y, r: 2, vr: 260, life: 0.4, max: 0.4, color: '#ffe9a8' });
        } else if (e.type === 'muzzle') {
          burst(e.x, e.y, 4, e.color || '#ffd23f', 120, 0.14, 2.4);
        } else if (e.type === 'spark') {
          burst(e.x, e.y, 5, '#bfefff', 140, 0.22, 1.8);
        } else if (e.type === 'flash') {
          flash = 1;
        } else if (e.type === 'line') {
          particles.push({ ring: true, x: e.x, y: e.y, r: 4, vr: 120, life: 0.3, max: 0.3, color: pal.accent });
        }
      }
    }

    function updateParticles(dt) {
      for (const p of particles) {
        if (p.ring) { p.r += p.vr * dt; p.life -= dt; continue; }
        p.vy += (p.g || 0) * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      }
      for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
      if (flash > 0) flash -= dt * 3;
    }

    // ---- background -------------------------------------------------------
    function drawBackground(cam) {
      const g = bx.createLinearGradient(0, 0, 0, VIEW_H);
      const sky = pal.sky;
      for (let i = 0; i < sky.length; i++) g.addColorStop(i / (sky.length - 1), sky[i]);
      bx.fillStyle = g; bx.fillRect(0, 0, VIEW_W, VIEW_H);

      // optional AI background, parallax slow
      if (bgImg) {
        const pw = VIEW_W * 1.4, ph = VIEW_H;
        const ox = -(cam.x * 0.15) % pw;
        bx.globalAlpha = 0.55;
        for (let x = ox - pw; x < VIEW_W; x += pw) bx.drawImage(bgImg, x, 0, pw, ph);
        bx.globalAlpha = 1;
      }

      // distant dust/stars
      bx.save();
      for (const st of stars) {
        const x = ((st.x * VIEW_W - cam.x * st.z * 0.3) % VIEW_W + VIEW_W) % VIEW_W;
        const y = st.y * VIEW_H;
        bx.globalAlpha = 0.5 * st.z;
        bx.fillStyle = '#ffffff';
        bx.fillRect(x, y, st.s, st.s);
      }
      bx.restore();

      // parallax silhouette ridgelines (procedural)
      drawRidge(cam.x * 0.25, VIEW_H * 0.62, 46, pal.far, 0.9);
      drawRidge(cam.x * 0.45, VIEW_H * 0.72, 60, pal.mid, 1.0);
      drawRidge(cam.x * 0.7, VIEW_H * 0.82, 80, pal.near, 1.0);
    }
    function drawRidge(scroll, baseY, amp, color, alpha) {
      bx.save(); bx.globalAlpha = alpha; bx.fillStyle = color;
      bx.beginPath(); bx.moveTo(0, VIEW_H);
      const step = 40;
      for (let x = -step; x <= VIEW_W + step; x += step) {
        const wx = x + (scroll % step);
        const n = Math.sin((x + scroll) * 0.01) * amp + Math.sin((x + scroll) * 0.031) * amp * 0.4;
        bx.lineTo(wx, baseY + n);
      }
      bx.lineTo(VIEW_W, VIEW_H); bx.closePath(); bx.fill(); bx.restore();
    }

    // ---- tiles ------------------------------------------------------------
    function drawTiles(cam) {
      const x0 = Math.max(0, Math.floor(cam.x / TILE));
      const x1 = Math.min(level.cols - 1, Math.ceil((cam.x + VIEW_W) / TILE));
      const y0 = Math.max(0, Math.floor(cam.y / TILE));
      const y1 = Math.min(level.rows - 1, Math.ceil((cam.y + VIEW_H) / TILE));
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const t = level.tiles[ty * level.cols + tx];
          if (t === T.EMPTY) continue;
          const sx = Math.round(tx * TILE - cam.x), sy = Math.round(ty * TILE - cam.y);
          if (t === T.SOLID) drawBlock(sx, sy, tx, ty);
          else if (t === T.SPIKE) drawSpike(sx, sy);
        }
      }
    }
    function drawBlock(sx, sy, tx, ty) {
      const open = (ddx, ddy) => level.tiles[(ty + ddy) * level.cols + (tx + ddx)] !== T.SOLID;
      // base
      bx.fillStyle = pal.block;
      bx.fillRect(sx, sy, TILE, TILE);
      // subtle inner texture
      bx.fillStyle = 'rgba(255,255,255,0.04)';
      bx.fillRect(sx + 2, sy + 2, TILE - 4, TILE - 4);
      // top highlight if exposed above
      if (ty === 0 || open(0, -1)) {
        bx.fillStyle = pal.blockTop;
        bx.fillRect(sx, sy, TILE, 3);
        bx.fillStyle = 'rgba(255,255,255,0.15)';
        bx.fillRect(sx, sy + 3, TILE, 1);
      }
      // left/right edges
      bx.fillStyle = pal.blockEdge;
      if (tx === 0 || open(-1, 0)) bx.fillRect(sx, sy, 2, TILE);
      if (open(1, 0)) bx.fillRect(sx + TILE - 2, sy, 2, TILE);
      if (open(0, 1)) bx.fillRect(sx, sy + TILE - 2, TILE, 2);
      // rivets
      bx.fillStyle = 'rgba(0,0,0,0.25)';
      bx.fillRect(sx + 3, sy + 3, 2, 2);
      bx.fillRect(sx + TILE - 5, sy + TILE - 5, 2, 2);
    }
    function drawSpike(sx, sy) {
      bx.fillStyle = pal.spike;
      for (let i = 0; i < 3; i++) {
        const x = sx + i * (TILE / 3);
        bx.beginPath(); bx.moveTo(x, sy + TILE);
        bx.lineTo(x + TILE / 6, sy + 3); bx.lineTo(x + TILE / 3, sy + TILE);
        bx.closePath(); bx.fill();
      }
      bx.fillStyle = 'rgba(255,255,255,0.4)';
      bx.fillRect(sx, sy + TILE - 2, TILE, 2);
    }

    // ---- exit -------------------------------------------------------------
    function drawExit(cam) {
      const e = level.exit; const sx = e.x - cam.x, sy = e.y - cam.y;
      const t = performance.now() / 400;
      bx.save();
      bx.shadowColor = pal.accent; bx.shadowBlur = 18;
      const g = bx.createLinearGradient(sx, sy, sx, sy + e.h);
      g.addColorStop(0, pal.accent); g.addColorStop(1, '#ffffff');
      bx.globalAlpha = 0.55 + Math.sin(t) * 0.25;
      bx.fillStyle = g;
      bx.fillRect(sx, sy, e.w, e.h);
      bx.restore();
      bx.fillStyle = '#fff'; bx.globalAlpha = 0.9;
      bx.font = 'bold 9px monospace'; bx.textAlign = 'center';
      bx.fillText('EXIT', sx + e.w / 2, sy - 4); bx.globalAlpha = 1;
    }

    // ---- entities ---------------------------------------------------------
    function drawPickups(list, cam) {
      const t = performance.now() / 200;
      for (const it of list) {
        const sx = it.x - cam.x, sy = it.y - cam.y;
        if (sx < -20 || sx > VIEW_W + 20) continue;
        bx.save(); bx.translate(sx + 8, sy + 8);
        if (it.type === 'gem') {
          bx.shadowColor = '#9be6ff'; bx.shadowBlur = 8;
          bx.rotate(t + it.baseY);
          bx.fillStyle = '#9be6ff';
          bx.beginPath(); bx.moveTo(0, -7); bx.lineTo(6, 0); bx.lineTo(0, 7); bx.lineTo(-6, 0); bx.closePath(); bx.fill();
          bx.fillStyle = '#ffffff'; bx.fillRect(-1, -3, 2, 6);
        } else {
          const map = { pu_weapon: ['#ffd23f', 'W'], pu_energy: ['#54e36b', 'E'], pu_life: ['#ff5d7a', '1UP'],
            pu_bomb: ['#8be9ff', 'B'], pu_line: ['#c6ff5d', 'L'] };
          const m = map[it.type] || ['#fff', '?'];
          bx.shadowColor = m[0]; bx.shadowBlur = 10;
          bx.fillStyle = 'rgba(0,0,0,0.5)'; roundRect(-9, -9, 18, 18, 4); bx.fill();
          bx.lineWidth = 2; bx.strokeStyle = m[0]; roundRect(-9, -9, 18, 18, 4); bx.stroke();
          bx.shadowBlur = 0; bx.fillStyle = m[0];
          bx.font = 'bold 8px monospace'; bx.textAlign = 'center'; bx.textBaseline = 'middle';
          bx.fillText(m[1], 0, 1);
        }
        bx.restore();
      }
    }

    function drawEnemies(list, cam, freeze) {
      for (const e of list) {
        if (!e.alive) continue;
        const sx = e.x - cam.x, sy = e.y - cam.y;
        if (sx < -40 || sx > VIEW_W + 40) continue;
        bx.save();
        if (freeze > 0) { bx.globalAlpha = 0.8; }
        if (e.hitFlash > 0) { bx.globalCompositeOperation = 'lighter'; }
        const cx = sx + e.w / 2, cy = sy + e.h / 2;
        if (e.type === 'turret') {
          bx.fillStyle = '#3b4a5a'; roundRect(sx, sy + 4, e.w, e.h - 4, 3); bx.fill();
          bx.fillStyle = '#ff5d3b'; bx.beginPath(); bx.arc(cx, cy, 4, 0, 7); bx.fill();
          bx.strokeStyle = '#9fb4c9'; bx.lineWidth = 3;
          bx.beginPath(); bx.moveTo(cx, cy); bx.lineTo(cx + e.facing * 10, cy + 6); bx.stroke();
        } else if (e.type === 'walker') {
          bx.fillStyle = '#a2434f'; roundRect(sx, sy, e.w, e.h, 4); bx.fill();
          bx.fillStyle = '#ffd23f'; bx.fillRect(cx + e.facing * 3, sy + 5, 4, 3);
          bx.fillStyle = '#2a1218'; bx.fillRect(sx + 3, sy + e.h - 3, 4, 3); bx.fillRect(sx + e.w - 7, sy + e.h - 3, 4, 3);
        } else if (e.type === 'flyer') {
          bx.fillStyle = '#7a3bd6'; bx.beginPath(); bx.ellipse(cx, cy, e.w / 2, e.h / 2, 0, 0, 7); bx.fill();
          bx.fillStyle = '#d6a3ff'; bx.beginPath(); bx.arc(cx, cy, 3, 0, 7); bx.fill();
          bx.strokeStyle = '#c08bff'; bx.lineWidth = 2;
          const wf = Math.sin(e.t * 18) * 5;
          bx.beginPath(); bx.moveTo(sx, cy); bx.lineTo(sx - 6, cy - wf); bx.moveTo(sx + e.w, cy); bx.lineTo(sx + e.w + 6, cy - wf); bx.stroke();
        } else if (e.type === 'hopper') {
          bx.fillStyle = '#c96b3b'; roundRect(sx, sy, e.w, e.h, 6); bx.fill();
          bx.fillStyle = '#fff'; bx.fillRect(cx - 5, sy + 6, 3, 3); bx.fillRect(cx + 2, sy + 6, 3, 3);
        } else if (e.type === 'spawner') {
          bx.shadowColor = '#ff3b6b'; bx.shadowBlur = 12;
          bx.fillStyle = '#5a2233'; bx.beginPath(); bx.arc(cx, cy, e.w / 2, 0, 7); bx.fill();
          bx.fillStyle = '#ff3b6b'; bx.beginPath(); bx.arc(cx, cy, 5 + Math.sin(e.t * 6) * 2, 0, 7); bx.fill();
        }
        if (e.hitFlash > 0) { bx.fillStyle = 'rgba(255,255,255,0.7)'; bx.fillRect(sx, sy, e.w, e.h); }
        bx.restore();
      }
    }

    function drawShots(s, cam) {
      // player shots
      for (const b of s.pshots) {
        const sx = b.x - cam.x, sy = b.y - cam.y;
        bx.save(); bx.shadowBlur = 8;
        if (b.kind === 'bounce') { bx.shadowColor = '#ff7ad9'; bx.fillStyle = '#ffb3ec';
          bx.beginPath(); bx.arc(sx + 4, sy + 4, 4, 0, 7); bx.fill(); }
        else { bx.shadowColor = '#ffd23f'; bx.fillStyle = '#fff6c0';
          bx.fillRect(sx, sy, b.w, b.h); }
        bx.restore();
      }
      // beam
      const p = s.player;
      if (p.beamActive && p.beam) drawBeam(p.beam, cam);
      // enemy shots
      for (const b of s.eshots) {
        const sx = b.x - cam.x, sy = b.y - cam.y;
        bx.save(); bx.shadowColor = '#ff5d3b'; bx.shadowBlur = 8;
        bx.fillStyle = '#ffa07a'; bx.beginPath(); bx.arc(sx, sy, 3.4, 0, 7); bx.fill(); bx.restore();
      }
      // mines
      for (const m of s.mines) {
        const sx = m.x - cam.x, sy = m.y - cam.y;
        bx.save(); bx.shadowColor = '#8be9ff'; bx.shadowBlur = 8; bx.fillStyle = '#cdf6ff';
        bx.beginPath(); bx.arc(sx, sy, 3, 0, 7); bx.fill(); bx.restore();
      }
    }
    function drawBeam(beam, cam) {
      const ox = beam.ox - cam.x, oy = beam.oy - cam.y;
      const ex = ox + beam.dx * beam.len, ey = oy + beam.dy * beam.len;
      bx.save();
      bx.shadowColor = '#6cf3ff'; bx.shadowBlur = 14;
      bx.strokeStyle = '#6cf3ff'; bx.lineWidth = beam.width; bx.lineCap = 'round';
      bx.globalAlpha = 0.5; bx.beginPath(); bx.moveTo(ox, oy); bx.lineTo(ex, ey); bx.stroke();
      // jagged inner bolt
      bx.globalAlpha = 1; bx.lineWidth = 2; bx.strokeStyle = '#eaffff';
      bx.beginPath(); bx.moveTo(ox, oy);
      const seg = 6;
      for (let i = 1; i <= seg; i++) {
        const t = i / seg;
        const jx = ox + (ex - ox) * t + (Math.random() - 0.5) * 6;
        const jy = oy + (ey - oy) * t + (Math.random() - 0.5) * 6;
        bx.lineTo(jx, jy);
      }
      bx.stroke(); bx.restore();
    }

    // ---- player -----------------------------------------------------------
    function drawPlayer(s, cam) {
      const p = s.player;
      if (p.dead && p.deathTimer < 1.2) return;
      const sx = Math.round(p.x - cam.x), sy = Math.round(p.y - cam.y);
      if (p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0) return;
      bx.save();
      const cx = sx + p.w / 2;
      if (p.morph) {
        // spinning gyro ball
        const t = performance.now() / 60;
        bx.translate(cx, sy + p.h / 2);
        bx.shadowColor = '#6cf3ff'; bx.shadowBlur = 14;
        bx.rotate(t);
        const grd = bx.createRadialGradient(0, 0, 1, 0, 0, 9);
        grd.addColorStop(0, '#eafcff'); grd.addColorStop(0.6, '#4aa8ff'); grd.addColorStop(1, '#123a8a');
        bx.fillStyle = grd; bx.beginPath(); bx.arc(0, 0, 9, 0, 7); bx.fill();
        bx.strokeStyle = '#bfefff'; bx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) { bx.rotate(Math.PI / 3);
          bx.beginPath(); bx.ellipse(0, 0, 9, 3.5, 0, 0, 7); bx.stroke(); }
        bx.restore();
        return;
      }
      const face = p.facing;
      const running = Math.abs(p.vx) > 20 && p.onGround;
      const t = performance.now() / 90;
      const legPhase = running ? Math.sin(t * 6) : 0;
      const bob = running ? Math.abs(Math.sin(t * 6)) * 1.2 : 0;
      const yy = sy + bob;
      bx.translate(cx, 0);
      bx.scale(face, 1);
      // legs
      bx.fillStyle = '#1b3f8f';
      bx.fillRect(-5, yy + 20 + legPhase, 4, 10 - legPhase);
      bx.fillRect(1, yy + 20 - legPhase, 4, 10 + legPhase);
      bx.fillStyle = '#0e2a66'; bx.fillRect(-6, yy + 29, 6, 3); bx.fillRect(0, yy + 29, 6, 3);
      // torso (armored)
      const g = bx.createLinearGradient(-7, yy + 8, 7, yy + 22);
      g.addColorStop(0, '#3a72e8'); g.addColorStop(0.5, '#2559c8'); g.addColorStop(1, '#16357e');
      bx.fillStyle = g; roundRect(-7, yy + 8, 14, 14, 3); bx.fill();
      // chest light
      bx.fillStyle = '#8be9ff'; bx.fillRect(-2, yy + 12, 4, 4);
      // shoulder
      bx.fillStyle = '#4a82ff'; roundRect(-8, yy + 8, 5, 6, 2); bx.fill();
      // gun arm
      bx.fillStyle = '#2a4fb0'; bx.fillRect(2, yy + 11, 9, 4);
      bx.fillStyle = '#cfe0ff'; bx.fillRect(9, yy + 10, 4, 6);
      // muzzle glow if firing
      // head/helmet
      const hg = bx.createLinearGradient(-5, yy, 5, yy + 8);
      hg.addColorStop(0, '#4a82ff'); hg.addColorStop(1, '#1b3f8f');
      bx.fillStyle = hg; roundRect(-5, yy, 10, 9, 3); bx.fill();
      // visor
      bx.fillStyle = '#8be9ff'; bx.shadowColor = '#8be9ff'; bx.shadowBlur = 6;
      bx.fillRect(0, yy + 3, 5, 3); bx.shadowBlur = 0;
      // rim light
      bx.strokeStyle = 'rgba(160,220,255,0.5)'; bx.lineWidth = 1;
      bx.beginPath(); bx.moveTo(-7, yy + 9); bx.lineTo(-7, yy + 21); bx.stroke();
      bx.restore();
    }

    // ---- floats / hud text ------------------------------------------------
    function drawFloats(s, cam) {
      for (const f of s.floats) {
        const sx = f.x - cam.x, sy = f.y - cam.y;
        if (f.line) {
          bx.save(); bx.strokeStyle = pal.accent; bx.lineWidth = 3; bx.shadowColor = pal.accent; bx.shadowBlur = 10;
          bx.globalAlpha = f.life * 2; bx.beginPath(); bx.moveTo(sx, sy - 40); bx.lineTo(sx, sy + 40); bx.stroke(); bx.restore();
          continue;
        }
        bx.save(); bx.globalAlpha = Math.min(1, f.life * 2);
        bx.fillStyle = '#fff'; bx.font = 'bold 9px monospace'; bx.textAlign = 'center';
        bx.fillText(f.text, sx, sy); bx.restore();
      }
    }

    function drawParticles(cam) {
      for (const p of particles) {
        if (p.ring) {
          bx.save(); bx.globalAlpha = Math.max(0, p.life / p.max); bx.strokeStyle = p.color;
          bx.lineWidth = 2; bx.beginPath(); bx.arc(p.x - cam.x, p.y - cam.y, p.r, 0, 7); bx.stroke(); bx.restore();
          continue;
        }
        const a = Math.max(0, p.life / p.max);
        bx.globalAlpha = a; bx.fillStyle = p.color;
        bx.fillRect(p.x - cam.x - p.size / 2, p.y - cam.y - p.size / 2, p.size, p.size);
      }
      bx.globalAlpha = 1;
    }

    // ---- HUD --------------------------------------------------------------
    function drawHUD(s) {
      const p = s.player;
      bx.save();
      // top bar backdrop
      bx.fillStyle = 'rgba(4,6,16,0.55)'; bx.fillRect(0, 0, VIEW_W, 26);
      bx.fillStyle = 'rgba(120,180,255,0.25)'; bx.fillRect(0, 26, VIEW_W, 1);
      // energy bar
      bx.fillStyle = '#12233a'; bx.fillRect(8, 7, 120, 10);
      const eg = bx.createLinearGradient(8, 0, 128, 0);
      eg.addColorStop(0, '#ff4b4b'); eg.addColorStop(0.5, '#ffd23f'); eg.addColorStop(1, '#54e36b');
      bx.fillStyle = eg; bx.fillRect(9, 8, Math.max(0, (p.energy / p.maxEnergy) * 118), 8);
      bx.strokeStyle = '#9fb4c9'; bx.lineWidth = 1; bx.strokeRect(8, 7, 120, 10);
      bx.fillStyle = '#cfe0ff'; bx.font = '7px monospace'; bx.textAlign = 'left'; bx.fillText('ENERGY', 10, 24);

      // lives
      bx.fillStyle = '#8be9ff'; bx.font = 'bold 10px monospace';
      bx.fillText('♥ ' + p.lives, 140, 16);
      // weapon indicator
      const wcol = { spread: '#ffd23f', beam: '#6cf3ff', bounce: '#ff7ad9' };
      bx.fillStyle = wcol[p.weapon]; bx.fillText(D.WEAPONS[p.weapon].name + ' ' + p.weapons[p.weapon], 185, 16);
      // bombs / lines (kept clear of the centered timer)
      bx.fillStyle = '#8be9ff'; bx.fillText('❄' + p.bombs, 360, 16);
      bx.fillStyle = '#c6ff5d'; bx.fillText('⌇' + p.lines, 392, 16);
      // gems
      bx.fillStyle = '#9be6ff'; bx.textAlign = 'right'; bx.fillText('◆ ' + p.gems, VIEW_W - 96, 16);
      // score
      bx.fillStyle = '#fff'; bx.fillText(String(p.score).padStart(7, '0'), VIEW_W - 8, 16);
      // timer
      const mm = Math.floor(s.time / 60), ss = Math.floor(s.time % 60);
      bx.fillStyle = s.time < 30 ? '#ff5d5d' : '#cfe0ff'; bx.textAlign = 'center';
      bx.fillText(mm + ':' + String(ss).padStart(2, '0'), VIEW_W / 2, 16);
      bx.restore();
    }

    function roundRect(x, y, w, h, r) {
      bx.beginPath();
      bx.moveTo(x + r, y); bx.arcTo(x + w, y, x + w, y + h, r);
      bx.arcTo(x + w, y + h, x, y + h, r); bx.arcTo(x, y + h, x, y, r);
      bx.arcTo(x, y, x + w, y, r); bx.closePath();
    }

    // ---- master render ----------------------------------------------------
    function render(s, dt) {
      consumeEvents(s.events);
      updateParticles(dt);
      const shake = s.shake > 0.2 ? s.shake : 0;
      const camx = s.cam.x + (shake ? (Math.random() - 0.5) * shake : 0);
      const camy = s.cam.y + (shake ? (Math.random() - 0.5) * shake : 0);
      const cam = { x: camx, y: camy };

      drawBackground(cam);
      drawTiles(cam);
      drawExit(cam);
      drawPickups(s.pickups, cam);
      drawEnemies(s.enemies, cam, s.freeze);
      drawShots(s, cam);
      drawPlayer(s, cam);
      drawParticles(cam);
      drawFloats(s, cam);

      if (s.freeze > 0) { bx.fillStyle = 'rgba(120,200,255,0.08)'; bx.fillRect(0, 0, VIEW_W, VIEW_H); }
      if (flash > 0) { bx.fillStyle = `rgba(255,255,255,${flash * 0.6})`; bx.fillRect(0, 0, VIEW_W, VIEW_H); }

      // vignette + scanlines
      const vg = bx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.3, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.8);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
      bx.fillStyle = vg; bx.fillRect(0, 0, VIEW_W, VIEW_H);

      drawHUD(s);

      // blit to display (scaled)
      dx.imageSmoothingEnabled = true;
      dx.clearRect(0, 0, display.width, display.height);
      dx.drawImage(buf, 0, 0, display.width, display.height);
      // scanlines on display
      dx.globalAlpha = 0.06; dx.fillStyle = '#000';
      for (let y = 0; y < display.height; y += 3) dx.fillRect(0, y, display.width, 1);
      dx.globalAlpha = 1;
    }

    return { setLevel, render, get buffer() { return buf; }, particles };
  }

  return { createRenderer };
});
