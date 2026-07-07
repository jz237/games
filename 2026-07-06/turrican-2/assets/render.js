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
    let banner = null; // { text, sub, t }

    function loadBg(src) {
      const img = new Image();
      img.onload = () => { bgImg = img; };
      img.onerror = () => { bgImg = null; };
      img.src = src;
    }

    let tileAtlas = null;
    function setLevel(lv) {
      level = lv; pal = lv.palette;
      // parallax star/dust field
      stars.length = 0;
      for (let i = 0; i < 90; i++) stars.push({
        x: Math.random(), y: Math.random() * 0.75, z: 0.2 + Math.random() * 0.6,
        s: 0.5 + Math.random() * 1.8,
      });
      particles.length = 0;
      tileAtlas = buildTileAtlas(lv.world);
      // try a world background image (optional, degrades gracefully)
      bgImg = null;
      loadBg(`assets/img/world${lv.world}-bg.jpg`);
    }

    // pre-render 4 base + 4 top-capped tile variants per world (crisp identity
    // per SPEC §5, and much cheaper than per-tile detail drawing)
    function buildTileAtlas(worldId) {
      const c = document.createElement('canvas');
      c.width = TILE * 4; c.height = TILE * 2;
      const g = c.getContext('2d');
      const rnd = D.mulberry32(worldId * 7919 + 13);
      for (let v = 0; v < 4; v++) {
        for (let row = 0; row < 2; row++) {
          const x0 = v * TILE, y0 = row * TILE;
          g.fillStyle = pal.block; g.fillRect(x0, y0, TILE, TILE);
          if (worldId === 1) {          // sandstone strata
            for (let i = 0; i < 3; i++) {
              const sy2 = 3 + Math.floor(rnd() * (TILE - 6));
              g.fillStyle = rnd() < 0.5 ? 'rgba(181,121,60,0.55)' : 'rgba(74,47,20,0.4)';
              g.fillRect(x0 + 1, y0 + sy2, TILE - 2, 2);
            }
            for (let i = 0; i < 4; i++) {
              g.fillStyle = 'rgba(74,47,20,0.5)';
              g.fillRect(x0 + Math.floor(rnd() * (TILE - 2)), y0 + Math.floor(rnd() * (TILE - 2)), 2, 2);
            }
          } else if (worldId === 2) {   // mossy cave stone
            g.strokeStyle = 'rgba(28,40,48,0.8)'; g.lineWidth = 1.5;
            g.beginPath();
            g.moveTo(x0 + rnd() * TILE, y0);
            g.lineTo(x0 + rnd() * TILE, y0 + TILE * 0.5 + rnd() * 8);
            g.lineTo(x0 + rnd() * TILE, y0 + TILE); g.stroke();
            for (let i = 0; i < 3; i++) {
              g.fillStyle = rnd() < 0.6 ? 'rgba(57,208,200,0.35)' : 'rgba(124,249,230,0.28)';
              g.fillRect(x0 + Math.floor(rnd() * (TILE - 3)), y0 + Math.floor(rnd() * (TILE - 3)), 2, 2);
            }
          } else if (worldId === 3) {   // hull panel
            g.strokeStyle = 'rgba(32,35,58,0.9)'; g.lineWidth = 1;
            g.strokeRect(x0 + 1.5, y0 + 1.5, TILE - 3, TILE - 3);
            g.fillStyle = 'rgba(136,146,196,0.5)';
            g.fillRect(x0 + 2, y0 + 2, 2, 2); g.fillRect(x0 + TILE - 4, y0 + 2, 2, 2);
            g.fillRect(x0 + 2, y0 + TILE - 4, 2, 2); g.fillRect(x0 + TILE - 4, y0 + TILE - 4, 2, 2);
            if (v === 2) { g.fillStyle = 'rgba(20,22,40,0.8)'; // vent slits
              for (let i = 0; i < 3; i++) g.fillRect(x0 + 5, y0 + 6 + i * 3, TILE - 10, 1); }
          } else if (worldId === 4) {   // industrial plate
            g.strokeStyle = 'rgba(26,26,29,0.9)'; g.lineWidth = 1;
            g.strokeRect(x0 + 0.5, y0 + 0.5, TILE - 1, TILE - 1);
            g.fillStyle = 'rgba(242,192,55,0.4)';
            g.fillRect(x0 + 3, y0 + 3, 2, 2); g.fillRect(x0 + TILE - 5, y0 + TILE - 5, 2, 2);
            if (v === 1) { g.strokeStyle = 'rgba(122,122,133,0.6)'; // diagonal brace
              g.beginPath(); g.moveTo(x0 + 2, y0 + TILE - 2); g.lineTo(x0 + TILE - 2, y0 + 2); g.stroke(); }
          } else {                      // alien chitin
            g.fillStyle = 'rgba(46,34,51,0.8)';
            g.beginPath(); g.ellipse(x0 + rnd() * TILE, y0 + rnd() * TILE, 4 + rnd() * 4, 3 + rnd() * 3, rnd() * 3, 0, 7); g.fill();
            if (v === 3) { g.strokeStyle = 'rgba(143,209,79,0.4)'; g.lineWidth = 1; // glowing vein
              g.beginPath(); g.moveTo(x0, y0 + rnd() * TILE);
              g.quadraticCurveTo(x0 + TILE / 2, y0 + rnd() * TILE, x0 + TILE, y0 + rnd() * TILE); g.stroke(); }
          }
          // top cap for row 1
          if (row === 1) {
            if (worldId === 4) {        // hazard-striped ledges
              for (let i = -1; i < 6; i++) {
                g.fillStyle = i % 2 ? '#F2C037' : '#1A1A1D';
                g.beginPath();
                g.moveTo(x0 + i * 5, y0 + 4); g.lineTo(x0 + i * 5 + 4, y0);
                g.lineTo(x0 + i * 5 + 8, y0); g.lineTo(x0 + i * 5 + 4, y0 + 4);
                g.closePath(); g.fill();
              }
              g.save(); g.beginPath(); g.rect(x0, y0, TILE, 4); g.clip(); g.restore();
            } else {
              g.fillStyle = pal.blockTop; g.fillRect(x0, y0, TILE, 3);
              g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(x0, y0 + 3, TILE, 1);
            }
          }
        }
      }
      return c;
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
        } else if (e.type === 'banner') {
          banner = { text: e.text, sub: e.sub || '', t: 2.6, max: 2.6 };
        } else if (e.type === 'clinkfx') {
          burst(e.x, e.y, 3, '#aab4c4', 90, 0.15, 1.5);
        } else if (e.type === 'splash') {
          burst(e.x, e.y, 10, '#bfefff', 130, 0.4, 2);
          particles.push({ ring: true, x: e.x, y: e.y, r: 3, vr: 90, life: 0.3, max: 0.3, color: '#7cf9e6' });
        } else if (e.type === 'land') {
          for (let i = 0; i < 7; i++) particles.push({
            x: e.x + (Math.random() - 0.5) * 12, y: e.y - 1,
            vx: (Math.random() - 0.5) * 90, vy: -20 - Math.random() * 40,
            life: 0.35, max: 0.35, color: 'rgba(200,190,170,0.7)', size: 2.2, g: 160 });
        } else if (e.type === 'bubble') {
          particles.push({ x: e.x + (Math.random() - 0.5) * 6, y: e.y, vx: (Math.random() - 0.5) * 10,
            vy: -30 - Math.random() * 25, life: 0.9, max: 0.9, color: 'rgba(190,240,255,0.8)', size: 2, g: -25 });
        } else if (e.type === 'updraft') {
          particles.push({ x: e.x + (Math.random() - 0.5) * 26, y: e.y, vx: 0,
            vy: -160 - Math.random() * 120, life: 0.55, max: 0.55, color: 'rgba(160,230,230,0.6)', size: 2, g: 0 });
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
      if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }
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

      // per-world parallax silhouettes
      drawWorldParallax(cam);
    }

    function drawWorldParallax(cam) {
      const w = level.world;
      if (w === 1) {                       // desert: flat-topped mesas
        drawMesa(cam.x * 0.22, VIEW_H * 0.58, 42, pal.far, 0.9);
        drawMesa(cam.x * 0.42, VIEW_H * 0.70, 52, pal.mid, 1);
        drawRidge(cam.x * 0.68, VIEW_H * 0.84, 42, pal.near, 1);
      } else if (w === 2) {                // caverns: stalactites + mounds
        drawStalactites(cam.x * 0.3, pal.far, 0.9);
        drawRidge(cam.x * 0.45, VIEW_H * 0.74, 58, pal.mid, 1);
        drawRidge(cam.x * 0.7, VIEW_H * 0.85, 66, pal.near, 1);
      } else if (w === 3) {                // corridor: girder trusses, no hills
        drawTruss(cam.x * 0.35, VIEW_H * 0.24, pal.mid, 0.5);
        drawTruss(cam.x * 0.55, VIEW_H * 0.78, pal.near, 0.6);
      } else if (w === 4) {                // factory: machine skyline
        drawSkyline(cam.x * 0.22, VIEW_H * 0.66, pal.far, 0.9);
        drawSkyline(cam.x * 0.45, VIEW_H * 0.78, pal.mid, 1);
      } else {                             // alien ship: ribcage arches
        drawArches(cam.x * 0.25, pal.far, 0.8);
        drawRidge(cam.x * 0.5, VIEW_H * 0.78, 54, pal.mid, 0.95);
        drawRidge(cam.x * 0.72, VIEW_H * 0.88, 60, pal.near, 1);
      }
    }
    function drawMesa(scroll, baseY, amp, color, alpha) {
      bx.save(); bx.globalAlpha = alpha; bx.fillStyle = color;
      bx.beginPath(); bx.moveTo(-2, VIEW_H);
      const step = 8;
      for (let x = -step; x <= VIEW_W + step; x += step) {
        const wcoord = x + scroll;
        // quantized noise -> plateaus with sheer cliff sides
        const n = Math.sin(wcoord * 0.006) + Math.sin(wcoord * 0.0023) * 0.7;
        const q = Math.round(n * 1.6) / 1.6;
        bx.lineTo(x, baseY - q * amp);
      }
      bx.lineTo(VIEW_W + 2, VIEW_H); bx.closePath(); bx.fill(); bx.restore();
    }
    function drawStalactites(scroll, color, alpha) {
      bx.save(); bx.globalAlpha = alpha; bx.fillStyle = color;
      const step = 26;
      const off = -(scroll % step);
      for (let x = off - step; x <= VIEW_W + step; x += step) {
        const wcoord = x + scroll;
        const len = 30 + Math.abs(Math.sin(wcoord * 0.021)) * 95;
        bx.beginPath();
        bx.moveTo(x - 12, 0); bx.lineTo(x + 12, 0); bx.lineTo(x, len);
        bx.closePath(); bx.fill();
      }
      bx.restore();
    }
    function drawTruss(scroll, y, color, alpha) {
      bx.save(); bx.globalAlpha = alpha; bx.strokeStyle = color; bx.lineWidth = 4;
      bx.beginPath(); bx.moveTo(0, y); bx.lineTo(VIEW_W, y); bx.stroke();
      bx.lineWidth = 2;
      const step = 46;
      const off = -(scroll % step);
      for (let x = off - step; x <= VIEW_W + step; x += step) {
        bx.beginPath(); bx.moveTo(x, y); bx.lineTo(x + step / 2, y - 22); bx.lineTo(x + step, y); bx.stroke();
        bx.beginPath(); bx.moveTo(x, y); bx.lineTo(x + step / 2, y + 22); bx.lineTo(x + step, y); bx.stroke();
      }
      bx.restore();
    }
    function drawSkyline(scroll, baseY, color, alpha) {
      bx.save(); bx.globalAlpha = alpha; bx.fillStyle = color;
      const step = 34;
      const off = -(scroll % step);
      bx.beginPath(); bx.moveTo(-2, VIEW_H);
      for (let x = off - step; x <= VIEW_W + step; x += step) {
        const wcoord = Math.round((x + scroll) / step);
        const h = 20 + ((wcoord * 2654435761 >>> 0) % 90);
        bx.lineTo(x, baseY - h); bx.lineTo(x + step, baseY - h);
      }
      bx.lineTo(VIEW_W + 2, VIEW_H); bx.closePath(); bx.fill();
      // blinking hazard lights on the tallest stacks
      const t = performance.now() / 1000;
      for (let x = off - step; x <= VIEW_W + step; x += step) {
        const wcoord = Math.round((x + scroll) / step);
        const h = 20 + ((wcoord * 2654435761 >>> 0) % 90);
        if (h > 84 && Math.sin(t * 2 + wcoord) > 0.4) {
          bx.fillStyle = 'rgba(255,77,46,0.8)'; bx.fillRect(x + step / 2 - 1, baseY - h - 4, 3, 3);
        }
      }
      bx.restore();
    }
    function drawArches(scroll, color, alpha) {
      bx.save(); bx.globalAlpha = alpha; bx.strokeStyle = color; bx.lineWidth = 14;
      const step = 150;
      const off = -(scroll % step);
      for (let x = off - step; x <= VIEW_W + step; x += step) {
        bx.beginPath();
        bx.ellipse(x, VIEW_H * 0.95, 62, VIEW_H * 0.72, 0, Math.PI, 0);
        bx.stroke();
      }
      bx.restore();
    }
    function drawRidge(scroll, baseY, amp, color, alpha) {
      // sample the noise field in world space at fixed screen columns — the
      // silhouette then scrolls left as the camera moves right (no swimming)
      bx.save(); bx.globalAlpha = alpha; bx.fillStyle = color;
      bx.beginPath(); bx.moveTo(-2, VIEW_H);
      const step = 16;
      for (let x = -step; x <= VIEW_W + step; x += step) {
        const w = x + scroll;
        const n = Math.sin(w * 0.01) * amp + Math.sin(w * 0.031) * amp * 0.4;
        bx.lineTo(x, baseY + n);
      }
      bx.lineTo(VIEW_W + 2, VIEW_H); bx.closePath(); bx.fill(); bx.restore();
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
          else if (t === T.CRATE) drawCrate(sx, sy);
          else if (t === T.WATER) drawWater(sx, sy, tx, ty);
        }
      }
    }
    function drawBlock(sx, sy, tx, ty) {
      const open = (ddx, ddy) => level.tiles[(ty + ddy) * level.cols + (tx + ddx)] !== T.SOLID;
      const topExposed = ty === 0 || open(0, -1);
      const v = (tx * 7 + ty * 13) & 3;
      bx.drawImage(tileAtlas, v * TILE, topExposed ? TILE : 0, TILE, TILE, sx, sy, TILE, TILE);
      // exposed side/bottom edges
      bx.fillStyle = pal.blockEdge;
      if (tx === 0 || open(-1, 0)) bx.fillRect(sx, sy, 2, TILE);
      if (open(1, 0)) bx.fillRect(sx + TILE - 2, sy, 2, TILE);
      if (open(0, 1)) bx.fillRect(sx, sy + TILE - 2, TILE, 2);
    }
    function drawWater(sx, sy, tx, ty) {
      const surface = level.tiles[(ty - 1) * level.cols + tx] === T.EMPTY || ty === 0;
      bx.fillStyle = 'rgba(27,94,122,0.5)';
      bx.fillRect(sx, sy, TILE, TILE);
      // caustic shimmer
      const t = performance.now() / 1000;
      const sh = Math.sin(t * 2 + tx * 0.9 + ty * 1.3);
      if (sh > 0.55) {
        bx.fillStyle = 'rgba(124,249,230,0.08)';
        bx.fillRect(sx + 2, sy + 4, TILE - 4, 3);
      }
      if (surface) {
        const wob = Math.sin(t * 3 + tx * 1.1) * 2;
        bx.fillStyle = 'rgba(124,249,230,0.55)';
        bx.fillRect(sx, sy + 1 + wob, TILE, 2);
        bx.fillStyle = 'rgba(255,255,255,0.18)';
        bx.fillRect(sx, sy + wob, TILE, 1);
      }
    }
    function drawCrate(sx, sy) {
      // destructible barrier crate: dark panel, accent frame, X brace
      bx.fillStyle = '#1a1626'; bx.fillRect(sx, sy, TILE, TILE);
      bx.strokeStyle = pal.accent; bx.lineWidth = 2; bx.globalAlpha = 0.9;
      bx.strokeRect(sx + 1.5, sy + 1.5, TILE - 3, TILE - 3);
      bx.beginPath(); bx.moveTo(sx + 3, sy + 3); bx.lineTo(sx + TILE - 3, sy + TILE - 3);
      bx.moveTo(sx + TILE - 3, sy + 3); bx.lineTo(sx + 3, sy + TILE - 3); bx.stroke();
      bx.globalAlpha = 1;
      bx.fillStyle = 'rgba(255,255,255,0.12)'; bx.fillRect(sx + 2, sy + 2, TILE - 4, 2);
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

    // ---- one-way platforms -----------------------------------------------
    function drawPlatforms(cam) {
      if (!level.platforms) return;
      const t = performance.now() / 1000;
      for (const pl of level.platforms) {
        const sx = Math.round(pl.x * TILE - cam.x), sy = Math.round(pl.y * TILE - cam.y);
        const w = pl.w * TILE;
        if (sx + w < 0 || sx > VIEW_W) continue;
        // slim metallic ledge with a lit top edge + support struts
        bx.fillStyle = pal.blockEdge; bx.fillRect(sx, sy + 3, w, 6);
        bx.fillStyle = pal.block; bx.fillRect(sx, sy + 2, w, 4);
        bx.fillStyle = pal.blockTop; bx.fillRect(sx, sy, w, 3);
        bx.fillStyle = 'rgba(255,255,255,0.18)'; bx.fillRect(sx, sy, w, 1);
        if (pl.belt) {
          // conveyor: scrolling chevrons show the drag direction
          bx.save(); bx.beginPath(); bx.rect(sx + 1, sy, w - 2, 8); bx.clip();
          bx.strokeStyle = '#F2C037'; bx.lineWidth = 2; bx.globalAlpha = 0.85;
          const off = ((t * 26 * pl.belt) % 12 + 12) % 12;
          for (let i = -12; i < w + 12; i += 12) {
            const x0 = sx + i + off;
            bx.beginPath();
            bx.moveTo(x0 - 3 * pl.belt, sy + 1); bx.lineTo(x0 + 3 * pl.belt, sy + 4);
            bx.lineTo(x0 - 3 * pl.belt, sy + 7); bx.stroke();
          }
          bx.restore();
        } else {
          bx.fillStyle = pal.accent; bx.globalAlpha = 0.5;
          for (let i = 4; i < w; i += 10) bx.fillRect(sx + i, sy + 8, 2, 2);
          bx.globalAlpha = 1;
        }
      }
    }

    // ---- world decor (waterfalls) ------------------------------------------
    function drawDecors(cam) {
      if (!level.decors || !level.decors.length) return;
      const t = performance.now() / 1000;
      for (const d of level.decors) {
        if (d.type !== 'waterfall') continue;
        const sx = d.tx * TILE - cam.x;
        if (sx < -30 || sx > VIEW_W + 30) continue;
        const y0 = d.topTy * TILE - cam.y, y1 = d.botTy * TILE - cam.y;
        const h = y1 - y0;
        if (h <= 0) continue;
        bx.save();
        // falling sheets
        const g = bx.createLinearGradient(0, y0, 0, y1);
        g.addColorStop(0, 'rgba(180,225,255,0.55)'); g.addColorStop(1, 'rgba(120,190,240,0.25)');
        bx.fillStyle = g;
        bx.fillRect(sx + 2, y0, TILE - 6, h);
        // animated streaks
        bx.fillStyle = 'rgba(255,255,255,0.5)';
        for (let i = 0; i < 4; i++) {
          const yy = ((t * 140 + i * h / 4) % h);
          bx.fillRect(sx + 3 + (i % 3) * 4, y0 + yy, 2, 8);
        }
        // foam at the base
        const foam = 2 + Math.sin(t * 9 + d.tx) * 1.2;
        bx.fillStyle = 'rgba(220,240,255,0.65)';
        bx.beginPath(); bx.ellipse(sx + TILE / 2, y1, 9, foam + 2, 0, 0, 7); bx.fill();
        if (Math.random() < 0.25) particles.push({
          x: d.tx * TILE + TILE / 2 + (Math.random() - 0.5) * 12, y: d.botTy * TILE - 2,
          vx: (Math.random() - 0.5) * 50, vy: -30 - Math.random() * 40,
          life: 0.4, max: 0.4, color: 'rgba(200,235,255,0.7)', size: 1.8, g: 220 });
        bx.restore();
      }
    }

    // ---- checkpoint beacon --------------------------------------------------
    function drawCheckpoint(cam, s) {
      const cp = level.checkpoint;
      if (!cp) return;
      const sx = cp.x - cam.x, sy = cp.y - cam.y;
      if (sx < -30 || sx > VIEW_W + 30) return;
      const armed = !!s.checkpoint;
      const t = performance.now() / 1000;
      bx.save();
      // post
      bx.fillStyle = 'rgba(150,160,180,0.9)';
      bx.fillRect(sx, sy + 6, 3, 36);
      // beacon head
      const col = armed ? '#54e36b' : 'rgba(160,170,190,0.7)';
      bx.shadowColor = col; bx.shadowBlur = armed ? 12 : 4;
      bx.fillStyle = col;
      bx.beginPath(); bx.arc(sx + 1.5, sy + 4, armed ? 5 + Math.sin(t * 6) * 1.2 : 4, 0, 7); bx.fill();
      bx.restore();
    }

    // ---- exit -------------------------------------------------------------
    function drawExit(cam, s) {
      const e = level.exit; const sx = e.x - cam.x, sy = e.y - cam.y;
      const t = performance.now() / 400;
      const locked = s && !s.bossDead;
      bx.save();
      if (locked) {
        // dark, barred portal until the boss falls
        bx.fillStyle = 'rgba(30,20,40,0.8)'; bx.fillRect(sx, sy, e.w, e.h);
        bx.strokeStyle = '#ff3b6b'; bx.lineWidth = 2; bx.globalAlpha = 0.7;
        for (let i = 1; i < 4; i++) { bx.beginPath(); bx.moveTo(sx, sy + (e.h / 4) * i); bx.lineTo(sx + e.w, sy + (e.h / 4) * i); bx.stroke(); }
        bx.restore();
        bx.fillStyle = '#ff5d7a'; bx.globalAlpha = 0.85;
        bx.font = 'bold 9px monospace'; bx.textAlign = 'center';
        bx.fillText('LOCKED', sx + e.w / 2, sy - 4); bx.globalAlpha = 1;
        return;
      }
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

    // per-skin palettes: [body, accent, detail]
    const SKIN_COLORS = {
      scarab: ['#8a5a2b', '#d9a566', '#3fae5a'], rockmite: ['#7a4a26', '#b5793c', '#ffd23f'],
      cliffpod: ['#6b543a', '#d9a566', '#ff5d3b'], wasp: ['#c9a02b', '#2a2418', '#ffd23f'],
      windmine: ['#8b8f9a', '#c0c0c0', '#ff5d3b'],
      crab: ['#2c5a64', '#39d0c8', '#b23a48'], eel: ['#1b6e7a', '#7cf9e6', '#eaffff'],
      polyp: ['#2c4a52', '#39d0c8', '#b23a48'], sentry: ['#255a6e', '#7cf9e6', '#39d0c8'],
      bubblemine: ['#3a7a8a', '#bfefff', '#ff5d5d'],
      walltur: ['#3a3f5c', '#8892c4', '#ffd23f'], interceptor: ['#4a5170', '#8892c4', '#ff6b35'],
      seeker: ['#5c3040', '#e040fb', '#ff6b35'],
      statue: ['#33333a', '#57575f', '#ff4d2e'], beltdrone: ['#45454d', '#7a7a85', '#2ec4e0'],
      boltspin: ['#57575f', '#f2c037', '#1a1a1d'], arcdrone: ['#3e3e46', '#2ec4e0', '#f2c037'],
      armhub: ['#2e2e35', '#f2c037', '#ff4d2e'],
      hugger: ['#d9c7b0', '#b8a68f', '#7a2e3b'], leaper: ['#2e2233', '#463349', '#8fd14f'],
      eggpod: ['#d9c7b0', '#efe3d0', '#8fd14f'], acidmaw: ['#5a2e3b', '#b23a5a', '#8fd14f'],
      hivenode: ['#3b2433', '#b23a5a', '#8fd14f'],
    };
    function skinCols(e, defs) { return SKIN_COLORS[e.skin] || defs; }

    function drawEnemies(list, cam, freeze) {
      const t = performance.now() / 1000;
      for (const e of list) {
        if (!e.alive) continue;
        const sx = e.x - cam.x, sy = e.y - cam.y;
        if (sx < -40 || sx > VIEW_W + 40) continue;
        bx.save();
        if (freeze > 0) { bx.globalAlpha = 0.8; }
        if (e.hitFlash > 0) { bx.globalCompositeOperation = 'lighter'; }
        const cx = sx + e.w / 2, cy = sy + e.h / 2;

        if (e.type === 'turret') {
          const [body, acc, det] = skinCols(e, ['#3b4a5a', '#9fb4c9', '#ff5d3b']);
          if (e.skin === 'polyp' || e.skin === 'acidmaw') {
            // organic stalk + pulsing bulb
            bx.fillStyle = body; bx.fillRect(cx - 4, sy + 8, 8, e.h - 8);
            const pu = 6 + Math.sin(e.t * 4) * 1.5;
            bx.shadowColor = det; bx.shadowBlur = 8;
            bx.fillStyle = acc; bx.beginPath(); bx.arc(cx, sy + 7, pu, 0, 7); bx.fill();
            bx.shadowBlur = 0; bx.fillStyle = det;
            bx.beginPath(); bx.arc(cx, sy + 7, 2.5, 0, 7); bx.fill();
          } else if (e.skin === 'statue') {
            // fire-breathing walker statue: stone idol, glowing mouth
            bx.fillStyle = body; roundRect(sx, sy + 2, e.w, e.h - 2, 3); bx.fill();
            bx.fillStyle = acc; bx.fillRect(sx + 3, sy + 2, e.w - 6, 4);
            const glow = 0.5 + Math.sin(e.t * 5) * 0.4;
            bx.shadowColor = det; bx.shadowBlur = 10 * glow;
            bx.fillStyle = det; bx.fillRect(cx - 5, cy - 1, 10, 5);
            bx.shadowBlur = 0;
            bx.fillStyle = '#1a1a1d'; bx.fillRect(cx - 6, sy + 8, 4, 3); bx.fillRect(cx + 2, sy + 8, 4, 3);
          } else {
            bx.fillStyle = body; roundRect(sx, sy + 4, e.w, e.h - 4, 3); bx.fill();
            bx.fillStyle = det; bx.beginPath(); bx.arc(cx, cy, 4, 0, 7); bx.fill();
            bx.strokeStyle = acc; bx.lineWidth = 3;
            const aim = e.aim != null ? e.aim : 0;
            bx.beginPath(); bx.moveTo(cx, cy);
            bx.lineTo(cx + Math.cos(aim) * 11, cy + Math.sin(aim) * 11); bx.stroke();
          }
        } else if (e.type === 'walker') {
          const [body, acc, det] = skinCols(e, ['#a2434f', '#ffd23f', '#2a1218']);
          bx.fillStyle = body; roundRect(sx, sy + 4, e.w, e.h - 4, 5); bx.fill();
          if (e.skin === 'scarab') {
            // domed shell with a split line
            bx.fillStyle = acc; bx.beginPath(); bx.ellipse(cx, sy + 7, e.w / 2 - 1, 6, 0, Math.PI, 0); bx.fill();
            bx.strokeStyle = det; bx.lineWidth = 1.5;
            bx.beginPath(); bx.moveTo(cx, sy + 1); bx.lineTo(cx, sy + 10); bx.stroke();
          } else if (e.skin === 'crab') {
            // claws
            bx.fillStyle = acc;
            bx.beginPath(); bx.arc(sx - 2, cy, 4, 0, 7); bx.fill();
            bx.beginPath(); bx.arc(sx + e.w + 2, cy, 4, 0, 7); bx.fill();
            bx.fillStyle = det; bx.fillRect(cx - 5, sy + 7, 3, 3); bx.fillRect(cx + 2, sy + 7, 3, 3);
          } else if (e.skin === 'beltdrone') {
            bx.fillStyle = det; bx.fillRect(sx + 2, sy + 2, e.w - 4, 3); // scanner visor
            bx.strokeStyle = acc; bx.lineWidth = 1;
            bx.beginPath(); bx.moveTo(cx, sy + 2); bx.lineTo(cx, sy - 5); bx.stroke(); // antenna
            bx.fillStyle = acc; bx.beginPath(); bx.arc(cx, sy - 6, 2, 0, 7); bx.fill();
          } else {
            bx.fillStyle = acc; bx.fillRect(cx + e.facing * 3, sy + 7, 4, 3);
          }
          // legs / wheels
          const walkPh = Math.sin(e.t * 12) * 2;
          bx.fillStyle = '#1c1218';
          bx.fillRect(sx + 3 + walkPh, sy + e.h - 3, 4, 3);
          bx.fillRect(sx + e.w - 7 - walkPh, sy + e.h - 3, 4, 3);
        } else if (e.type === 'flyer') {
          const [body, acc, det] = skinCols(e, ['#7a3bd6', '#d6a3ff', '#c08bff']);
          if (e.skin === 'interceptor') {
            // dart shape + engine flame
            bx.fillStyle = body;
            bx.beginPath(); bx.moveTo(sx, cy); bx.lineTo(sx + e.w, sy); bx.lineTo(sx + e.w * 0.7, cy); bx.lineTo(sx + e.w, sy + e.h); bx.closePath(); bx.fill();
            bx.fillStyle = det; bx.fillRect(sx + e.w - 3, cy - 2, 5 + Math.sin(e.t * 30) * 2, 4);
          } else if (e.skin === 'wasp') {
            bx.fillStyle = body; bx.beginPath(); bx.ellipse(cx, cy, e.w / 2, e.h / 2, 0, 0, 7); bx.fill();
            bx.fillStyle = acc; // stripes
            for (let i = 0; i < 3; i++) bx.fillRect(sx + 3 + i * 6, sy + 2, 3, e.h - 4);
            const wf = Math.sin(e.t * 22) * 6;
            bx.strokeStyle = 'rgba(255,255,255,0.7)'; bx.lineWidth = 2;
            bx.beginPath(); bx.moveTo(cx - 3, sy); bx.lineTo(cx - 9, sy - 6 - wf); bx.moveTo(cx + 3, sy); bx.lineTo(cx + 9, sy - 6 - wf); bx.stroke();
          } else {
            bx.fillStyle = body; bx.beginPath(); bx.ellipse(cx, cy, e.w / 2, e.h / 2, 0, 0, 7); bx.fill();
            bx.fillStyle = acc; bx.beginPath(); bx.arc(cx, cy, 3, 0, 7); bx.fill();
            bx.strokeStyle = det; bx.lineWidth = 2;
            const wf = Math.sin(e.t * 18) * 5;
            bx.beginPath(); bx.moveTo(sx, cy); bx.lineTo(sx - 6, cy - wf); bx.moveTo(sx + e.w, cy); bx.lineTo(sx + e.w + 6, cy - wf); bx.stroke();
            if (e.skin === 'arcdrone' && Math.floor(e.t * 8) % 2 === 0) {
              bx.strokeStyle = det; bx.lineWidth = 1.5;
              bx.beginPath(); bx.moveTo(cx - 6, cy + 6); bx.lineTo(cx - 2, cy + 10); bx.lineTo(cx + 3, cy + 7); bx.lineTo(cx + 7, cy + 12); bx.stroke();
            }
          }
        } else if (e.type === 'hopper' || e.type === 'hugger') {
          const [body, acc, det] = skinCols(e, ['#c96b3b', '#e8935d', '#ffffff']);
          bx.fillStyle = body; roundRect(sx, sy, e.w, e.h, 6); bx.fill();
          if (e.skin === 'hugger') {
            // splayed finger-legs
            bx.strokeStyle = acc; bx.lineWidth = 2;
            for (let i = 0; i < 4; i++) {
              const lx = sx + 2 + i * 4;
              bx.beginPath(); bx.moveTo(lx, sy + e.h - 2); bx.lineTo(lx - 2, sy + e.h + 4); bx.stroke();
            }
            bx.fillStyle = det; bx.beginPath(); bx.arc(cx, cy, 2, 0, 7); bx.fill();
          } else if (e.skin === 'leaper') {
            bx.fillStyle = acc; // long haunches
            bx.beginPath(); bx.moveTo(sx, sy + e.h); bx.lineTo(sx - 4, sy + e.h - 10); bx.lineTo(sx + 4, sy + e.h - 6); bx.closePath(); bx.fill();
            bx.beginPath(); bx.moveTo(sx + e.w, sy + e.h); bx.lineTo(sx + e.w + 4, sy + e.h - 10); bx.lineTo(sx + e.w - 4, sy + e.h - 6); bx.closePath(); bx.fill();
            bx.shadowColor = det; bx.shadowBlur = 6;
            bx.fillStyle = det; bx.fillRect(cx - 5, sy + 6, 3, 3); bx.fillRect(cx + 2, sy + 6, 3, 3);
            bx.shadowBlur = 0;
          } else if (e.skin === 'rockmite') {
            bx.strokeStyle = '#4a2f14'; bx.lineWidth = 1.5; // cracked shell
            bx.beginPath(); bx.moveTo(sx + 4, sy + 4); bx.lineTo(cx, cy); bx.lineTo(sx + e.w - 4, sy + 6); bx.stroke();
            bx.fillStyle = acc; bx.fillRect(cx - 5, sy + 6, 3, 3); bx.fillRect(cx + 2, sy + 6, 3, 3);
          } else {
            bx.fillStyle = '#fff'; bx.fillRect(cx - 5, sy + 6, 3, 3); bx.fillRect(cx + 2, sy + 6, 3, 3);
          }
        } else if (e.type === 'drifter') {
          const [body, acc, det] = skinCols(e, ['#8b8f9a', '#c0c0c0', '#ff5d3b']);
          if (e.skin === 'bubblemine') {
            bx.globalAlpha *= 0.85;
            bx.strokeStyle = acc; bx.lineWidth = 1.5;
            bx.beginPath(); bx.arc(cx, cy, e.w / 2, 0, 7); bx.stroke();
            bx.fillStyle = 'rgba(191,239,255,0.15)'; bx.beginPath(); bx.arc(cx, cy, e.w / 2, 0, 7); bx.fill();
            const pu = 2.5 + Math.sin(e.t * 6) * 1;
            bx.shadowColor = det; bx.shadowBlur = 8;
            bx.fillStyle = det; bx.beginPath(); bx.arc(cx, cy, pu, 0, 7); bx.fill();
          } else if (e.skin === 'seeker') {
            bx.fillStyle = body;
            bx.beginPath(); bx.moveTo(sx, cy); bx.lineTo(sx + e.w, cy - 4); bx.lineTo(sx + e.w, cy + 4); bx.closePath(); bx.fill();
            bx.shadowColor = det; bx.shadowBlur = 8;
            bx.fillStyle = det; bx.fillRect(sx + e.w - 2, cy - 2, 5 + Math.sin(e.t * 40) * 2, 4);
            bx.shadowBlur = 0;
            bx.fillStyle = acc; bx.beginPath(); bx.arc(sx + 4, cy, 2, 0, 7); bx.fill();
          } else {
            // spiked mine
            bx.fillStyle = body; bx.beginPath(); bx.arc(cx, cy, e.w / 2 - 2, 0, 7); bx.fill();
            bx.strokeStyle = acc; bx.lineWidth = 2;
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * Math.PI * 2 + e.t;
              bx.beginPath(); bx.moveTo(cx + Math.cos(a) * 5, cy + Math.sin(a) * 5);
              bx.lineTo(cx + Math.cos(a) * (e.w / 2 + 2), cy + Math.sin(a) * (e.w / 2 + 2)); bx.stroke();
            }
            const bl = Math.floor(e.t * 4) % 2 === 0;
            bx.fillStyle = bl ? det : '#5a2222'; bx.beginPath(); bx.arc(cx, cy, 2.5, 0, 7); bx.fill();
          }
        } else if (e.type === 'eel') {
          const [body, acc, det] = skinCols(e, ['#1b6e7a', '#7cf9e6', '#eaffff']);
          bx.fillStyle = body;
          bx.beginPath();
          const seg = 5;
          for (let i = 0; i <= seg; i++) {
            const ex = e.facing > 0 ? sx + (i / seg) * e.w : sx + e.w - (i / seg) * e.w;
            const ey = cy + Math.sin(e.t * 8 - i * 0.9) * 4;
            if (i === 0) bx.moveTo(ex, ey); else bx.lineTo(ex, ey);
          }
          bx.lineWidth = e.h - 2; bx.strokeStyle = body; bx.lineCap = 'round'; bx.stroke();
          bx.fillStyle = acc; // dorsal shimmer
          bx.globalAlpha *= 0.6; bx.lineWidth = 2; bx.strokeStyle = acc; bx.stroke(); bx.globalAlpha = 1;
          const hx = e.facing > 0 ? sx + e.w - 3 : sx + 3;
          bx.fillStyle = det; bx.beginPath(); bx.arc(hx, cy + Math.sin(e.t * 8) * 4 - 2, 2, 0, 7); bx.fill();
        } else if (e.type === 'spinner') {
          const [body, acc, det] = skinCols(e, ['#57575f', '#f2c037', '#1a1a1d']);
          // anchor bolt + arm + spinning hex nut
          const ax = e.homeX + e.w / 2 - cam.x, ay = e.homeY + e.h / 2 - cam.y;
          bx.strokeStyle = 'rgba(120,120,130,0.6)'; bx.lineWidth = 2;
          bx.beginPath(); bx.moveTo(ax, ay); bx.lineTo(cx, cy); bx.stroke();
          bx.fillStyle = '#3a3a40'; bx.beginPath(); bx.arc(ax, ay, 3, 0, 7); bx.fill();
          bx.translate(cx, cy); bx.rotate(e.t * 6);
          bx.fillStyle = body;
          bx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const r = e.w / 2 + 1;
            if (i === 0) bx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else bx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          bx.closePath(); bx.fill();
          bx.strokeStyle = acc; bx.lineWidth = 2; bx.stroke();
          bx.fillStyle = det; bx.beginPath(); bx.arc(0, 0, 4, 0, 7); bx.fill();
          bx.rotate(-e.t * 6); bx.translate(-cx, -cy);
        } else if (e.type === 'egg') {
          const [body, acc, det] = skinCols(e, ['#d9c7b0', '#efe3d0', '#8fd14f']);
          bx.fillStyle = body;
          bx.beginPath(); bx.ellipse(cx, cy + 2, e.w / 2, e.h / 2, 0, 0, 7); bx.fill();
          bx.fillStyle = acc;
          bx.beginPath(); bx.ellipse(cx - 2, cy - 2, e.w / 3, e.h / 3, -0.4, 0, 7); bx.fill();
          // pulsing seam glow — it's about to be trouble
          const pu = 0.4 + Math.sin(e.t * 3) * 0.3;
          bx.strokeStyle = det; bx.globalAlpha *= (0.4 + pu * 0.6); bx.lineWidth = 1.5;
          bx.shadowColor = det; bx.shadowBlur = 6;
          bx.beginPath(); bx.moveTo(cx - 4, sy + 4); bx.lineTo(cx + 1, sy + 9); bx.lineTo(cx - 2, sy + 14); bx.stroke();
        } else if (e.type === 'spawner') {
          const [body, acc, det] = skinCols(e, ['#5a2233', '#ff3b6b', '#ff3b6b']);
          bx.shadowColor = det; bx.shadowBlur = 12;
          bx.fillStyle = body; bx.beginPath(); bx.arc(cx, cy, e.w / 2, 0, 7); bx.fill();
          if (e.skin === 'armhub') {
            bx.shadowBlur = 0; bx.strokeStyle = acc; bx.lineWidth = 3;
            for (let i = 0; i < 3; i++) {
              const a = e.t * 1.5 + (i / 3) * Math.PI * 2;
              bx.beginPath(); bx.moveTo(cx, cy); bx.lineTo(cx + Math.cos(a) * (e.w / 2 + 5), cy + Math.sin(a) * (e.w / 2 + 5)); bx.stroke();
            }
          }
          bx.fillStyle = acc; bx.beginPath(); bx.arc(cx, cy, 5 + Math.sin(e.t * 6) * 2, 0, 7); bx.fill();
        }
        if (e.hitFlash > 0) { bx.fillStyle = 'rgba(255,255,255,0.7)'; bx.fillRect(sx, sy, e.w, e.h); }
        bx.restore();
      }
    }

    // ---- boss ---------------------------------------------------------------
    function drawBoss(s, cam) {
      const b = s.boss;
      if (!b || !b.alive) return;
      const sx = Math.round(b.x - cam.x), sy = Math.round(b.y - cam.y);
      if (sx + b.w < -60 || sx > VIEW_W + 60) return;
      const t = performance.now() / 1000;
      const cx = sx + b.w / 2, cy = sy + b.h / 2;
      bx.save();
      if (b.dying && Math.floor(t * 24) % 3 === 0) bx.globalAlpha = 0.6;
      // telegraph flare: whole body glows before an attack
      if (b.state === 'tele') { bx.shadowColor = '#ff4d2e'; bx.shadowBlur = 18 + Math.sin(t * 30) * 8; }

      if (b.key === 'warden') {           // rocky guardian mech
        bx.fillStyle = '#6b4a2a'; roundRect(sx + 6, sy + 40, b.w - 12, b.h - 40, 8); bx.fill();  // hips
        bx.fillStyle = '#8A5A2B'; roundRect(sx, sy + 12, b.w, 36, 10); bx.fill();                // torso
        bx.fillStyle = '#B5793C'; roundRect(sx - 6, sy + 10, 20, 18, 6); bx.fill();              // L shoulder
        roundRect(sx + b.w - 14, sy + 10, 20, 18, 6); bx.fill();                                  // R shoulder
        bx.fillStyle = '#D9A566'; roundRect(sx + b.w / 2 - 10, sy, 20, 14, 4); bx.fill();        // head
        bx.fillStyle = '#2a1a0a'; bx.fillRect(sx + b.w / 2 - 6, sy + 4, 12, 4);                  // visor slit
        bx.fillStyle = '#4A2F14';                                                                 // legs
        bx.fillRect(sx + 10, sy + b.h - 16, 14, 16); bx.fillRect(sx + b.w - 24, sy + b.h - 16, 14, 16);
      } else if (b.key === 'maw') {       // cavern leviathan
        bx.fillStyle = '#1a4150';
        bx.beginPath(); bx.ellipse(cx, cy + 6, b.w / 2, b.h / 2 - 6, 0, 0, 7); bx.fill();        // body
        const jaw = (b.state === 'attack' || b.state === 'tele') ? 14 : 5 + Math.sin(t * 3) * 2;
        bx.fillStyle = '#2C5A6E';
        bx.beginPath(); bx.moveTo(sx, cy - 8); bx.lineTo(sx + 30, cy - 20 - jaw); bx.lineTo(sx + 34, cy - 2); bx.closePath(); bx.fill();
        bx.beginPath(); bx.moveTo(sx, cy - 2); bx.lineTo(sx + 30, cy + 14 + jaw); bx.lineTo(sx + 34, cy + 2); bx.closePath(); bx.fill();
        bx.fillStyle = '#7CF9E6';                                                                 // fins
        bx.beginPath(); bx.moveTo(sx + b.w - 8, cy - 24); bx.lineTo(sx + b.w + 14, cy); bx.lineTo(sx + b.w - 8, cy + 20); bx.closePath(); bx.fill();
        bx.fillStyle = '#eaffff'; bx.beginPath(); bx.arc(sx + 40, cy - 12, 4, 0, 7); bx.fill();  // eye
      } else if (b.key === 'gunship') {   // corridor blockade platform
        bx.fillStyle = '#3A3F5C'; roundRect(sx, sy + 14, b.w, b.h - 28, 10); bx.fill();          // hull
        bx.fillStyle = '#5C6486'; roundRect(sx + 8, sy, b.w - 16, 20, 6); bx.fill();             // upper deck
        bx.fillStyle = '#8892C4';                                                                 // gun pods
        roundRect(sx - 6, sy + 22, 16, 14, 4); bx.fill(); roundRect(sx - 6, sy + 42, 16, 14, 4); bx.fill();
        const th = 6 + Math.sin(t * 20) * 3;                                                      // thrusters
        bx.fillStyle = '#FF6B35'; bx.fillRect(sx + b.w - 4, sy + 20, th, 8); bx.fillRect(sx + b.w - 4, sy + b.h - 30, th, 8);
      } else if (b.key === 'colossus') {  // walker mecha
        bx.fillStyle = '#3E3E46'; roundRect(sx + 4, sy, b.w - 8, 44, 8); bx.fill();              // torso
        // hazard stripes
        bx.save(); bx.beginPath(); bx.rect(sx + 8, sy + 30, b.w - 16, 10); bx.clip();
        for (let i = -1; i < 8; i++) { bx.fillStyle = i % 2 ? '#F2C037' : '#1A1A1D';
          bx.beginPath(); bx.moveTo(sx + i * 12, sy + 40); bx.lineTo(sx + i * 12 + 10, sy + 30);
          bx.lineTo(sx + i * 12 + 20, sy + 30); bx.lineTo(sx + i * 12 + 10, sy + 40); bx.closePath(); bx.fill(); }
        bx.restore();
        bx.fillStyle = '#2EC4E0'; bx.fillRect(sx + b.w / 2 - 12, sy + 8, 24, 8);                 // cockpit visor
        bx.fillStyle = '#57575F';                                                                 // legs w/ joints
        bx.fillRect(sx + 10, sy + 44, 16, b.h - 44); bx.fillRect(sx + b.w - 26, sy + 44, 16, b.h - 44);
        bx.fillStyle = '#FFB347'; bx.beginPath(); bx.arc(sx + 18, sy + 56, 5, 0, 7); bx.fill();
        bx.beginPath(); bx.arc(sx + b.w - 18, sy + 56, 5, 0, 7); bx.fill();
      } else if (b.key === 'queen') {     // alien hive queen
        bx.fillStyle = '#2E2233';
        bx.beginPath(); bx.ellipse(cx, cy + 10, b.w / 2, b.h / 2 - 10, 0, 0, 7); bx.fill();      // abdomen
        bx.fillStyle = '#463349';
        bx.beginPath(); bx.ellipse(cx, sy + 18, b.w / 3, 18, 0, 0, 7); bx.fill();                // thorax
        bx.fillStyle = '#B23A5A';                                                                 // crest
        bx.beginPath(); bx.moveTo(cx - 8, sy + 8); bx.lineTo(cx - 30, sy - 12); bx.lineTo(cx - 2, sy + 2); bx.closePath(); bx.fill();
        bx.beginPath(); bx.moveTo(cx + 8, sy + 8); bx.lineTo(cx + 30, sy - 12); bx.lineTo(cx + 2, sy + 2); bx.closePath(); bx.fill();
        for (let i = 0; i < 3; i++) {                                                             // egg sacs pulse
          const pu = 3 + Math.sin(t * 3 + i) * 2;
          bx.fillStyle = 'rgba(143,209,79,0.8)';
          bx.beginPath(); bx.arc(sx + 16 + i * 20, cy + 16, pu + 3, 0, 7); bx.fill();
        }
      } else if (b.key === 'machine') {   // THE MACHINE — final boss
        bx.fillStyle = '#14101c'; roundRect(sx, sy, b.w, b.h, 6); bx.fill();                     // monolith
        // armor plates (crack as phases advance)
        bx.fillStyle = '#2E2A3a';
        const plates = 3 - b.phase;
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
          if ((i + j * 4) % 4 < plates + 1) roundRect(sx + 4 + i * (b.w - 8) / 4 + 1, sy + 4 + j * (b.h - 8) / 4 + 1,
            (b.w - 8) / 4 - 2, (b.h - 8) / 4 - 2, 3), bx.fill();
        }
        if (b.phase >= 1) { bx.strokeStyle = '#ff3b6b'; bx.lineWidth = 1.5;                       // damage cracks
          bx.beginPath(); bx.moveTo(sx + 12, sy + 10); bx.lineTo(sx + 30, sy + 38); bx.lineTo(sx + 20, sy + 60); bx.stroke(); }
        if (b.phase >= 2) { bx.strokeStyle = '#ff3b6b';
          bx.beginPath(); bx.moveTo(sx + b.w - 12, sy + 14); bx.lineTo(sx + b.w - 34, sy + 44); bx.lineTo(sx + b.w - 18, sy + 70); bx.stroke(); }
        // cable tendrils
        bx.strokeStyle = '#463349'; bx.lineWidth = 4;
        for (let i = 0; i < 3; i++) { const wob = Math.sin(t * 2 + i * 2) * 6;
          bx.beginPath(); bx.moveTo(sx + 10 + i * 30, sy + b.h);
          bx.quadraticCurveTo(sx + 10 + i * 30 + wob, sy + b.h + 18, sx + 10 + i * 30 - wob, sy + b.h + 34); bx.stroke(); }
      }

      // weakpoint core: dim while guarded, blazing while open
      const coreR = b.open ? 9 + Math.sin(t * 12) * 2.5 : 5;
      bx.shadowColor = b.open ? '#ff5d3b' : 'rgba(255,93,59,0.4)';
      bx.shadowBlur = b.open ? 22 : 6;
      bx.fillStyle = b.open ? '#ffdf6b' : '#8a3b30';
      bx.beginPath(); bx.arc(cx, cy, coreR, 0, 7); bx.fill();
      if (b.open) { bx.fillStyle = '#fff'; bx.beginPath(); bx.arc(cx, cy, coreR * 0.4, 0, 7); bx.fill(); }

      if (b.hitFlash > 0) {
        bx.globalCompositeOperation = 'lighter';
        bx.fillStyle = 'rgba(255,255,255,0.55)'; roundRect(sx, sy, b.w, b.h, 8); bx.fill();
      }
      bx.restore();
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
      // enemy shots (boss projectiles get distinct, readable looks)
      for (const b of s.eshots) {
        const sx = b.x - cam.x, sy = b.y - cam.y;
        bx.save();
        if (b.kind === 'wave') {
          bx.shadowColor = '#ffb347'; bx.shadowBlur = 10; bx.fillStyle = '#ffce54';
          bx.beginPath(); bx.moveTo(sx, sy + b.h);
          bx.quadraticCurveTo(sx + b.w / 2, sy - 8, sx + b.w, sy + b.h);
          bx.closePath(); bx.fill();
          bx.fillStyle = 'rgba(255,255,255,0.7)'; bx.fillRect(sx + b.w / 2 - 2, sy - 2, 4, 4);
        } else if (b.kind === 'lob') {
          bx.shadowColor = '#8fd14f'; bx.shadowBlur = 9; bx.fillStyle = '#b9f06a';
          bx.beginPath(); bx.arc(sx + 4, sy + 4, 4.5, 0, 7); bx.fill();
        } else if (b.kind === 'beam') {
          bx.shadowColor = '#e040fb'; bx.shadowBlur = 12; bx.fillStyle = '#f48fff';
          bx.fillRect(sx - 5, sy - 2, 12, 5);
        } else if (b.kind === 'flame') {
          const fl = 3 + Math.random() * 3;
          bx.shadowColor = '#ff6b35'; bx.shadowBlur = 10;
          bx.fillStyle = Math.random() < 0.5 ? '#ffb347' : '#ff6b35';
          bx.beginPath(); bx.arc(sx + 4, sy + 4, fl, 0, 7); bx.fill();
        } else if (b.kind === 'orb') {
          bx.shadowColor = '#ff3b6b'; bx.shadowBlur = 10; bx.fillStyle = '#ff8fa5';
          bx.beginPath(); bx.arc(sx + 4, sy + 4, 4.4, 0, 7); bx.fill();
          bx.fillStyle = '#fff'; bx.beginPath(); bx.arc(sx + 4, sy + 4, 1.8, 0, 7); bx.fill();
        } else {
          bx.shadowColor = '#ff5d3b'; bx.shadowBlur = 8;
          bx.fillStyle = '#ffa07a'; bx.beginPath(); bx.arc(sx, sy, 3.4, 0, 7); bx.fill();
        }
        bx.restore();
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
      if (s.level.type === 'shmup') {
        // the stolen fighter: sleek wedge + canopy + animated thruster
        const tt = performance.now() / 1000;
        const flame = 7 + Math.sin(tt * 40) * 3 + Math.abs(p.vx) * 0.01;
        bx.shadowColor = '#ff8a3b'; bx.shadowBlur = 10;
        const fg = bx.createLinearGradient(sx - flame, 0, sx, 0);
        fg.addColorStop(0, 'rgba(255,210,63,0)'); fg.addColorStop(1, '#ff8a3b');
        bx.fillStyle = fg;
        bx.beginPath(); bx.moveTo(sx, sy + 4); bx.lineTo(sx - flame, sy + p.h / 2);
        bx.lineTo(sx, sy + p.h - 4); bx.closePath(); bx.fill();
        bx.shadowColor = '#6cf3ff'; bx.shadowBlur = 8;
        const hull = bx.createLinearGradient(sx, sy, sx, sy + p.h);
        hull.addColorStop(0, '#4a82ff'); hull.addColorStop(0.55, '#2559c8'); hull.addColorStop(1, '#16357e');
        bx.fillStyle = hull;
        bx.beginPath(); bx.moveTo(sx + p.w, sy + p.h / 2);       // nose
        bx.lineTo(sx + p.w * 0.45, sy); bx.lineTo(sx, sy + 3);   // top
        bx.lineTo(sx, sy + p.h - 3); bx.lineTo(sx + p.w * 0.45, sy + p.h); // bottom
        bx.closePath(); bx.fill();
        bx.shadowBlur = 0;
        bx.fillStyle = '#8be9ff';                                 // canopy
        bx.beginPath(); bx.ellipse(sx + p.w * 0.55, sy + p.h / 2, 5, 3, 0, 0, 7); bx.fill();
        bx.fillStyle = '#cfe0ff'; bx.fillRect(sx + p.w * 0.2, sy + 1, 6, 2); // fin lights
        bx.fillRect(sx + p.w * 0.2, sy + p.h - 3, 6, 2);
        // engine sparkle trail
        if (Math.random() < 0.7) particles.push({ x: p.x - 2, y: p.y + p.h / 2 + (Math.random() - 0.5) * 6,
          vx: -60 - Math.random() * 60, vy: (Math.random() - 0.5) * 20, life: 0.35, max: 0.35,
          color: Math.random() < 0.5 ? '#ff8a3b' : '#ffd23f', size: 2, g: 0 });
        bx.restore();
        return;
      }
      if (p.morph) {
        // roll trail
        if (Math.abs(p.vx) > 60 && Math.random() < 0.5) particles.push({
          x: p.x + p.w / 2 - Math.sign(p.vx) * 8, y: p.y + p.h - 2,
          vx: -p.vx * 0.15, vy: -10 - Math.random() * 20,
          life: 0.3, max: 0.3, color: 'rgba(108,243,255,0.5)', size: 2, g: 30 });
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
      const airborne = !p.onGround && !p.inWater;
      const swimming = !!p.inWater;
      const t = performance.now() / 90;
      const runPh = running ? Math.sin(t * 6) : 0;
      const bob = running ? Math.abs(Math.sin(t * 6)) * 1.2 : 0;
      // crouch: whole pose compresses (hitbox is 22 tall, sprite matches)
      const squat = p.crouch ? 8 : 0;
      const yy = sy + bob - (p.crouch ? 0 : 0);
      bx.translate(cx, 0);
      bx.scale(face, 1);

      // ---- legs by state ----
      bx.fillStyle = '#1b3f8f';
      if (airborne) {
        if (p.vy < 0) { // jump tuck
          bx.fillRect(-5, yy + 18, 4, 7); bx.fillRect(1, yy + 16, 4, 8);
          bx.fillStyle = '#0e2a66'; bx.fillRect(-6, yy + 24, 6, 3); bx.fillRect(0, yy + 23, 6, 3);
        } else { // fall: legs trail
          bx.fillRect(-6, yy + 19, 4, 9); bx.fillRect(2, yy + 17, 4, 10);
          bx.fillStyle = '#0e2a66'; bx.fillRect(-7, yy + 27, 6, 3); bx.fillRect(1, yy + 26, 6, 3);
        }
      } else if (swimming) { // frog-kick wave
        const k = Math.sin(t * 3) * 3;
        bx.fillRect(-5, yy + 19 + k, 4, 9); bx.fillRect(1, yy + 19 - k, 4, 9);
        bx.fillStyle = '#0e2a66'; bx.fillRect(-6, yy + 27 + k, 6, 3); bx.fillRect(0, yy + 27 - k, 6, 3);
      } else if (p.crouch) {
        bx.fillRect(-6, yy + 12, 5, 7); bx.fillRect(1, yy + 12, 5, 7);
        bx.fillStyle = '#0e2a66'; bx.fillRect(-7, yy + 18, 7, 3); bx.fillRect(1, yy + 18, 7, 3);
      } else { // stand / run cycle
        bx.fillRect(-5, yy + 20 + runPh * 1.6, 4, 10 - runPh * 1.6);
        bx.fillRect(1, yy + 20 - runPh * 1.6, 4, 10 + runPh * 1.6);
        bx.fillStyle = '#0e2a66';
        bx.fillRect(-6 + runPh * 2, yy + 29, 6, 3);
        bx.fillRect(0 - runPh * 2, yy + 29, 6, 3);
      }

      const torsoY = yy + (p.crouch ? 2 : 8) - squat * 0;
      // ---- torso (armored, two-tone) ----
      const g = bx.createLinearGradient(-7, torsoY, 7, torsoY + 14);
      g.addColorStop(0, '#3a72e8'); g.addColorStop(0.5, '#2559c8'); g.addColorStop(1, '#16357e');
      bx.fillStyle = g; roundRect(-7, torsoY, 14, p.crouch ? 12 : 14, 3); bx.fill();
      // backpack thruster block
      bx.fillStyle = '#16357e'; roundRect(-10, torsoY + 2, 4, 8, 2); bx.fill();
      bx.fillStyle = '#8be9ff'; bx.fillRect(-9, torsoY + 4, 2, 2);
      // chest core
      bx.fillStyle = '#8be9ff'; bx.shadowColor = '#8be9ff'; bx.shadowBlur = 5;
      bx.fillRect(-2, torsoY + 4, 4, 4); bx.shadowBlur = 0;
      // shoulder plate (pumps while running)
      bx.fillStyle = '#4a82ff'; roundRect(-8 + runPh, torsoY, 6, 7, 2); bx.fill();

      // ---- gun arm: horizontal or aimed up ----
      const aimUp = p.aimDir === -1 && !p.crouch;
      if (aimUp) {
        bx.fillStyle = '#2a4fb0'; bx.fillRect(1, torsoY - 6, 4, 10);
        bx.fillStyle = '#cfe0ff'; bx.fillRect(0, torsoY - 10, 6, 5);
      } else {
        bx.fillStyle = '#2a4fb0'; bx.fillRect(2, torsoY + 3, 9, 4);
        bx.fillStyle = '#cfe0ff'; bx.fillRect(9, torsoY + 2, 4, 6);
      }
      // muzzle flash right after a shot
      const w = D.WEAPONS[p.weapon];
      if (p.cooldown > (w.cooldown || 0.1) * 0.55 && p.weapon !== 'beam') {
        const fx = aimUp ? 3 : 15, fy = aimUp ? torsoY - 14 : torsoY + 4;
        bx.save();
        bx.shadowColor = '#ffd23f'; bx.shadowBlur = 12;
        bx.fillStyle = '#fff6c0';
        bx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + t;
          bx.moveTo(fx, fy);
          bx.lineTo(fx + Math.cos(a) * 6, fy + Math.sin(a) * 6);
        }
        bx.lineWidth = 2; bx.strokeStyle = '#fff6c0'; bx.stroke();
        bx.beginPath(); bx.arc(fx, fy, 2.5, 0, 7); bx.fill();
        bx.restore();
      }

      // ---- head + visor ----
      const headY = torsoY - 8;
      const hg = bx.createLinearGradient(-5, headY, 5, headY + 8);
      hg.addColorStop(0, '#4a82ff'); hg.addColorStop(1, '#1b3f8f');
      bx.fillStyle = hg; roundRect(-5, headY, 10, 9, 3); bx.fill();
      bx.fillStyle = '#f2c037'; bx.fillRect(-5, headY + 1, 2, 7); // crest stripe
      bx.fillStyle = '#8be9ff'; bx.shadowColor = '#8be9ff'; bx.shadowBlur = 6;
      bx.fillRect(0, headY + 3, 5, 3); bx.shadowBlur = 0;
      // rim light
      bx.strokeStyle = 'rgba(160,220,255,0.5)'; bx.lineWidth = 1;
      bx.beginPath(); bx.moveTo(-7, torsoY + 1); bx.lineTo(-7, torsoY + 13); bx.stroke();
      bx.restore();

      // swim bubbles / run dust live in the particle system via engine events
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
        if (p.streak) {
          bx.fillRect(p.x - cam.x, p.y - cam.y, p.streak, p.size);
        } else {
          bx.fillRect(p.x - cam.x - p.size / 2, p.y - cam.y - p.size / 2, p.size, p.size);
        }
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

      // boss HP bar (bottom center) while the fight is live
      const b = s.boss;
      if (b && b.alive && b.awake && !b.dying) {
        const bw = 280, bxx = VIEW_W / 2 - bw / 2, byy = VIEW_H - 26;
        bx.fillStyle = 'rgba(4,6,16,0.65)'; bx.fillRect(bxx - 6, byy - 14, bw + 12, 32);
        bx.fillStyle = '#ff5d7a'; bx.font = 'bold 9px monospace'; bx.textAlign = 'center';
        bx.fillText(b.name, VIEW_W / 2, byy - 4);
        bx.fillStyle = '#3a1020'; bx.fillRect(bxx, byy, bw, 9);
        const hg = bx.createLinearGradient(bxx, 0, bxx + bw, 0);
        hg.addColorStop(0, '#ff3b6b'); hg.addColorStop(1, '#ff8a5d');
        bx.fillStyle = hg; bx.fillRect(bxx + 1, byy + 1, Math.max(0, (b.hp / b.maxHp) * (bw - 2)), 7);
        bx.strokeStyle = '#9fb4c9'; bx.lineWidth = 1; bx.strokeRect(bxx, byy, bw, 9);
        // phase pips
        for (let i = 0; i < 3; i++) {
          bx.fillStyle = i <= b.phase ? '#ffd23f' : 'rgba(255,255,255,0.2)';
          bx.fillRect(bxx + bw + 8, byy + 6 - i * 5, 4, 3);
        }
        // open-window hint
        if (b.open) { bx.fillStyle = '#ffdf6b'; bx.fillText('CORE EXPOSED!', VIEW_W / 2, byy + 20); }
      }
      bx.restore();
    }

    // ---- warning / boss banner ---------------------------------------------
    function drawBanner() {
      if (!banner) return;
      const a = Math.min(1, banner.t / 0.4, (banner.max - banner.t) / 0.25);
      const warn = banner.text === 'WARNING';
      bx.save();
      bx.globalAlpha = Math.max(0, a) * (warn ? (Math.floor(banner.t * 6) % 2 ? 1 : 0.55) : 1);
      bx.fillStyle = 'rgba(4,2,10,0.55)';
      bx.fillRect(0, VIEW_H / 2 - 44, VIEW_W, 78);
      bx.fillStyle = warn ? '#ff3b3b' : '#54e36b';
      bx.shadowColor = bx.fillStyle; bx.shadowBlur = 18;
      bx.font = '900 30px monospace'; bx.textAlign = 'center'; bx.textBaseline = 'middle';
      bx.fillText(banner.text, VIEW_W / 2, VIEW_H / 2 - 12);
      if (banner.sub) {
        bx.shadowBlur = 8; bx.fillStyle = '#ffdf6b'; bx.font = 'bold 14px monospace';
        bx.fillText(banner.sub, VIEW_W / 2, VIEW_H / 2 + 18);
      }
      bx.restore();
    }

    function roundRect(x, y, w, h, r) {
      bx.beginPath();
      bx.moveTo(x + r, y); bx.arcTo(x + w, y, x + w, y + h, r);
      bx.arcTo(x + w, y + h, x, y + h, r); bx.arcTo(x, y + h, x, y, r);
      bx.arcTo(x, y, x + w, y, r); bx.closePath();
    }

    // ---- per-world ambient particles ---------------------------------------
    function spawnAmbient(s) {
      const w = level.world;
      const cx0 = s.cam.x, cy0 = s.cam.y;
      if (w === 1 && Math.random() < 0.25) {          // wind-blown dust motes
        const dir = Math.sign(s.windPhase || 1) || 1;
        particles.push({ x: cx0 + Math.random() * VIEW_W, y: cy0 + Math.random() * VIEW_H,
          vx: dir * (30 + Math.random() * 60), vy: (Math.random() - 0.3) * 14,
          life: 1.4, max: 1.4, color: 'rgba(217,165,102,0.4)', size: 1.6, g: 0 });
      } else if (w === 2 && Math.random() < 0.2) {    // bioluminescent plankton
        particles.push({ x: cx0 + Math.random() * VIEW_W, y: cy0 + Math.random() * VIEW_H,
          vx: (Math.random() - 0.5) * 8, vy: -6 - Math.random() * 10,
          life: 2.2, max: 2.2, color: 'rgba(124,249,230,0.5)', size: 1.5, g: 0 });
      } else if (w === 3 && Math.random() < 0.6) {    // velocity streaks
        particles.push({ x: cx0 + VIEW_W + 10, y: cy0 + Math.random() * VIEW_H,
          vx: -420 - Math.random() * 260, vy: 0,
          life: 0.8, max: 0.8, color: 'rgba(136,146,196,0.35)', size: 1.4, g: 0, streak: 14 });
      } else if (w === 4) {                            // sparks + steam
        if (Math.random() < 0.05) burst(cx0 + Math.random() * VIEW_W, cy0 + VIEW_H * (0.55 + Math.random() * 0.4),
          5, '#ffb347', 120, 0.5, 1.8);
        if (Math.random() < 0.08) particles.push({ x: cx0 + Math.random() * VIEW_W, y: cy0 + VIEW_H * (0.6 + Math.random() * 0.35),
          vx: (Math.random() - 0.5) * 6, vy: -28 - Math.random() * 20,
          life: 1.6, max: 1.6, color: 'rgba(160,160,170,0.25)', size: 5, g: -6 });
      } else if (w === 5 && Math.random() < 0.18) {   // drifting spores
        particles.push({ x: cx0 + Math.random() * VIEW_W, y: cy0 + Math.random() * VIEW_H,
          vx: (Math.random() - 0.5) * 16, vy: (Math.random() - 0.4) * 12,
          life: 2.4, max: 2.4, color: 'rgba(143,209,79,0.45)', size: 1.6, g: 0 });
      }
    }

    // ---- master render ----------------------------------------------------
    function render(s, dt) {
      consumeEvents(s.events);
      s.events.length = 0; // never re-consume on paused / end-screen frames
      spawnAmbient(s);
      updateParticles(dt);
      const shake = s.shake > 0.2 ? s.shake : 0;
      const camx = s.cam.x + (shake ? (Math.random() - 0.5) * shake : 0);
      const camy = s.cam.y + (shake ? (Math.random() - 0.5) * shake : 0);
      const cam = { x: camx, y: camy };

      drawBackground(cam);
      // gusting wind streaks (direction follows the engine's wind phase)
      if (level.windX && s.windPhase) {
        const t = performance.now() / 1000;
        bx.save(); bx.strokeStyle = 'rgba(230,240,255,0.14)'; bx.lineWidth = 1;
        const dir = Math.sign(s.windPhase) || 1;
        const mag = Math.abs(s.windPhase);
        for (let i = 0; i < 10; i++) {
          const wy = ((i * 137 + t * 26) % VIEW_H);
          const wx = ((i * 271 + t * (120 + mag * 160) * dir) % (VIEW_W + 80)) - 40;
          const len = 14 + mag * 22;
          bx.globalAlpha = 0.1 + mag * 0.14;
          bx.beginPath(); bx.moveTo(wx, wy); bx.lineTo(wx + len * dir, wy + 2); bx.stroke();
        }
        bx.restore();
      }
      drawTiles(cam);
      drawDecors(cam);
      // updraft column shimmer
      if (level.updraft) {
        const u = level.updraft;
        const sx0 = u.x0 - cam.x, sx1 = u.x1 - cam.x;
        if (sx1 > 0 && sx0 < VIEW_W) {
          const g2 = bx.createLinearGradient(0, VIEW_H, 0, 0);
          g2.addColorStop(0, 'rgba(124,249,230,0.10)'); g2.addColorStop(1, 'rgba(124,249,230,0)');
          bx.fillStyle = g2;
          bx.fillRect(Math.max(0, sx0), 0, Math.min(VIEW_W, sx1) - Math.max(0, sx0), VIEW_H);
        }
      }
      drawPlatforms(cam);
      drawCheckpoint(cam, s);
      drawExit(cam, s);
      drawPickups(s.pickups, cam);
      drawEnemies(s.enemies, cam, s.freeze);
      drawBoss(s, cam);
      drawShots(s, cam);
      drawPlayer(s, cam);
      drawParticles(cam);
      drawFloats(s, cam);

      if (s.freeze > 0) { bx.fillStyle = 'rgba(120,200,255,0.08)'; bx.fillRect(0, 0, VIEW_W, VIEW_H); }
      if (flash > 0) { bx.fillStyle = `rgba(255,255,255,${flash * 0.6})`; bx.fillRect(0, 0, VIEW_W, VIEW_H); }
      // alien ship: heartbeat-synced pulsing glow (SPEC §5)
      if (level.world === 5) {
        const hb = Math.pow(Math.max(0, Math.sin(performance.now() / 1000 * 3.2)), 14) * 0.09;
        if (hb > 0.005) { bx.fillStyle = `rgba(178,58,90,${hb.toFixed(3)})`; bx.fillRect(0, 0, VIEW_W, VIEW_H); }
      }

      // vignette + scanlines
      const vg = bx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.3, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.8);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
      bx.fillStyle = vg; bx.fillRect(0, 0, VIEW_W, VIEW_H);

      drawHUD(s);
      drawBanner();

      // blit to display (scaled; display context is DPR-transformed to 960x540)
      const LW = 960, LH = 540;
      dx.imageSmoothingEnabled = true;
      dx.clearRect(0, 0, LW, LH);
      dx.drawImage(buf, 0, 0, LW, LH);
      // scanlines on display (CRT toggle)
      if (crt) {
        dx.globalAlpha = 0.06; dx.fillStyle = '#000';
        for (let y = 0; y < LH; y += 3) dx.fillRect(0, y, LW, 1);
        dx.globalAlpha = 1;
      }
    }

    let crt = true;
    function setCRT(on) { crt = on; }

    return { setLevel, render, setCRT, get buffer() { return buf; }, particles };
  }

  return { createRenderer };
});
