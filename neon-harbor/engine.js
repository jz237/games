// Neon Harbor — HTML5 Engine
// Handles: parallax rendering, player movement, water shader, scene/dialogue system, save/load

const NeonHarbor = (() => {
  let canvas, ctx, W, H;
  let keys = {};
  let time = 0;
  let currentScene = null;
  let dialogueActive = false;

  // Player state
  const player = {
    x: 200, y: 0, vx: 0, vy: 0,
    w: 24, h: 48, speed: 160, grounded: false,
    facing: 1, frame: 0, frameTime: 0
  };

  // Game state (persisted)
  const state = {
    lightSignatures: [],
    audioShards: [],
    reputation: {},
    location: 'docks',
    flags: {}
  };

  // Parallax layers
  let layers = [];

  // --- COLORS ---
  const NEON_CYAN = '#00d4ff';
  const NEON_PINK = '#ff3090';
  const NEON_ORANGE = '#ff8020';
  const DARK_WATER = '#051228';
  const SKY_TOP = '#05051a';
  const SKY_BOT = '#0a1030';

  // Scene registry for transitions
  const sceneRegistry = {};

  function registerScene(id, scene) {
    sceneRegistry[id] = scene;
  }

  // --- INIT ---
  function init(c) {
    canvas = c;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', e => {
      keys[e.key] = true;
      if (e.key === 'F5') { e.preventDefault(); saveGame(); showDialogue([{ speaker: 'System', text: 'Game saved.', choices: [] }]); }
      if (e.key === 'F9') { e.preventDefault(); loadGame(); showDialogue([{ speaker: 'System', text: 'Game loaded.', choices: [] }]); }
    });
    window.addEventListener('keyup', e => { keys[e.key] = false; });
    requestAnimationFrame(loop);
  }

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    // Fix interaction Y positions for current scene
    if (currentScene?.interactions) {
      const groundY = currentScene.groundYCalc ?? (H * 0.62);
      for (const obj of currentScene.interactions) {
        if (obj.type === 'dialogue') obj.y = groundY - 24;
        else obj.y = groundY - 20;
      }
    }
  }

  // --- SCENE LOADING ---
  function loadScene(scene) {
    currentScene = scene;
    player.x = scene.playerStart?.x ?? 200;
    player.y = scene.playerStart?.y ?? 0;
    layers = scene.layers || [];
    document.getElementById('location-label').textContent = scene.name || 'Unknown';
    if (scene.onEnter) scene.onEnter(state);
  }

  // --- MAIN LOOP ---
  let lastTime = 0;
  function loop(ts) {
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    time += dt;

    if (!dialogueActive) update(dt);
    render(dt);
    updateHUD();
    requestAnimationFrame(loop);
  }

  // --- UPDATE ---
  function update(dt) {
    // Horizontal movement
    player.vx = 0;
    if (keys['ArrowLeft'] || keys['a']) { player.vx = -player.speed; player.facing = -1; }
    if (keys['ArrowRight'] || keys['d']) { player.vx = player.speed; player.facing = 1; }

    // Gravity
    player.vy += 600 * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    // Ground (scene-defined or default)
    const groundY = currentScene?.groundY ?? (H * 0.65);
    if (player.y + player.h >= groundY) {
      player.y = groundY - player.h;
      player.vy = 0;
      player.grounded = true;
    }

    // Jump
    if ((keys['ArrowUp'] || keys['w'] || keys[' ']) && player.grounded) {
      player.vy = -320;
      player.grounded = false;
    }

    // Walk animation
    if (Math.abs(player.vx) > 0) {
      player.frameTime += dt;
      if (player.frameTime > 0.12) { player.frame = (player.frame + 1) % 4; player.frameTime = 0; }
    } else {
      player.frame = 0;
    }

    // Bounds
    const sceneW = currentScene?.width ?? 1600;
    player.x = Math.max(0, Math.min(sceneW - player.w, player.x));

    // Exit zones (scene transitions)
    checkExitZones();

    // Interact
    if (keys['e'] || keys['Enter']) {
      keys['e'] = false; keys['Enter'] = false;
      checkInteractions();
    }
  }

  function checkExitZones() {
    if (!currentScene?.exitZones) return;
    for (const zone of currentScene.exitZones) {
      if (player.x >= zone.x && player.x <= zone.x + zone.width) {
        const target = sceneRegistry[zone.target];
        if (target) {
          const startX = zone.playerStartX ?? target.playerStart?.x ?? 100;
          target.playerStart = { ...target.playerStart, x: startX };
          loadScene(target);
        }
        break;
      }
    }
  }

  // --- INTERACTIONS ---
  function checkInteractions() {
    if (!currentScene?.interactions) return;
    for (const obj of currentScene.interactions) {
      const dx = Math.abs((player.x + player.w/2) - obj.x);
      const dy = Math.abs((player.y + player.h/2) - obj.y);
      if (dx < (obj.radius ?? 50) && dy < (obj.radius ?? 60)) {
        if (obj.type === 'dialogue') showDialogue(obj.dialogue);
        if (obj.type === 'shard') collectShard(obj);
        if (obj.type === 'signature') collectSignature(obj);
        break;
      }
    }
  }

  function collectShard(obj) {
    if (state.audioShards.includes(obj.id)) return;
    state.audioShards.push(obj.id);
    showDialogue([{ speaker: 'System', text: `Audio Shard collected: "${obj.name}"`, choices: [] }]);
    obj._collected = true;
  }

  function collectSignature(obj) {
    if (state.lightSignatures.includes(obj.id)) return;
    state.lightSignatures.push(obj.id);
    showDialogue([{ speaker: 'System', text: `Light Signature collected: ${obj.name}`, choices: [] }]);
    obj._collected = true;
  }

  // --- DIALOGUE ---
  function showDialogue(nodes, idx = 0) {
    if (!nodes || idx >= nodes.length) { hideDialogue(); return; }
    dialogueActive = true;
    const node = nodes[idx];
    const box = document.getElementById('dialogue-box');
    box.style.display = 'block';
    document.getElementById('dlg-speaker').textContent = node.speaker || '';
    document.getElementById('dlg-text').textContent = node.text || '';
    const choicesEl = document.getElementById('dlg-choices');
    choicesEl.innerHTML = '';

    if (node.choices && node.choices.length > 0) {
      node.choices.forEach(ch => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.textContent = ch.label;
        btn.onclick = () => {
          if (ch.flag) state.flags[ch.flag] = true;
          if (ch.reputation) {
            for (const [k,v] of Object.entries(ch.reputation)) {
              state.reputation[k] = (state.reputation[k] || 0) + v;
            }
          }
          if (ch.next != null) showDialogue(nodes, ch.next);
          else hideDialogue();
        };
        choicesEl.appendChild(btn);
      });
    } else {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = '▸ Continue';
      btn.onclick = () => showDialogue(nodes, idx + 1);
      choicesEl.appendChild(btn);
    }
  }

  function hideDialogue() {
    dialogueActive = false;
    document.getElementById('dialogue-box').style.display = 'none';
  }

  // --- RENDER ---
  function render(dt) {
    const camX = Math.max(0, player.x - W/2 + player.w/2);

    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.6);
    skyGrad.addColorStop(0, SKY_TOP);
    skyGrad.addColorStop(1, SKY_BOT);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, H);

    // Stars
    drawStars();

    // Parallax layers
    for (const layer of layers) {
      layer.render(ctx, W, H, camX, time);
    }

    // Ground platform
    const groundY = currentScene?.groundY ?? (H * 0.65);
    drawDockGround(groundY, camX);

    // Water
    drawWater(groundY, camX);

    // Scene objects (signs, shards, etc.)
    if (currentScene?.renderObjects) currentScene.renderObjects(ctx, W, H, camX, time, state);

    // Player
    drawPlayer(camX, groundY);

    // Interaction hints
    drawInteractionHints(camX);

    // Vignette
    drawVignette();
  }

  function drawStars() {
    // Seeded pseudo-random stars
    for (let i = 0; i < 80; i++) {
      const sx = ((i * 7919 + 104729) % W);
      const sy = ((i * 6271 + 32749) % (H * 0.4));
      const brightness = 0.2 + 0.3 * Math.sin(time * 0.5 + i);
      ctx.fillStyle = `rgba(200, 220, 255, ${brightness})`;
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }
  }

  function drawDockGround(groundY, camX) {
    ctx.fillStyle = '#1a1420';
    ctx.fillRect(0, groundY, W, H - groundY);

    // Dock planks
    const plankW = 80;
    const startX = -(camX % plankW);
    ctx.strokeStyle = 'rgba(60, 40, 30, 0.5)';
    for (let x = startX; x < W; x += plankW) {
      ctx.strokeRect(x, groundY, plankW - 2, 12);
    }

    // Edge glow
    ctx.strokeStyle = `rgba(0, 200, 255, ${0.15 + 0.05 * Math.sin(time * 2)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(W, groundY);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  function drawWater(groundY, camX) {
    const waterTop = groundY + 12;
    const waterH = H - waterTop;

    // Base water
    const wGrad = ctx.createLinearGradient(0, waterTop, 0, H);
    wGrad.addColorStop(0, 'rgba(5, 18, 40, 0.9)');
    wGrad.addColorStop(1, 'rgba(2, 8, 20, 1)');
    ctx.fillStyle = wGrad;
    ctx.fillRect(0, waterTop, W, waterH);

    // Animated wave lines
    for (let row = 0; row < 6; row++) {
      const wy = waterTop + 15 + row * (waterH / 7);
      const alpha = 0.08 - row * 0.01;
      ctx.strokeStyle = `rgba(0, 180, 255, ${Math.max(0.02, alpha)})`;
      ctx.beginPath();
      for (let x = 0; x < W; x += 4) {
        const wave = Math.sin((x + camX * 0.3) * 0.02 + time * 1.5 + row) * (4 - row * 0.5)
                   + Math.sin((x + camX * 0.1) * 0.035 + time * 0.8) * 2;
        ctx.lineTo(x, wy + wave);
      }
      ctx.stroke();
    }

    // Neon reflections in water
    for (let i = 0; i < 5; i++) {
      const rx = ((i * 300 + 150) - camX * 0.5) % (W + 200);
      const color = i % 2 === 0 ? NEON_CYAN : NEON_PINK;
      const alpha = 0.06 + 0.03 * Math.sin(time * 1.2 + i);
      ctx.fillStyle = color.replace(')', `,${alpha})`).replace('rgb', 'rgba');
      const shimmerW = 3 + Math.sin(time + i) * 2;
      for (let y = waterTop + 10; y < H; y += 8) {
        const drift = Math.sin(y * 0.05 + time + i) * 6;
        ctx.globalAlpha = alpha * (1 - (y - waterTop) / waterH);
        ctx.fillRect(rx + drift, y, shimmerW, 4);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawPlayer(camX) {
    const sx = player.x - camX;
    const sy = player.y;
    const w = player.w;
    const h = player.h;

    ctx.save();
    ctx.translate(sx + w/2, sy + h/2);
    if (player.facing < 0) ctx.scale(-1, 1);

    // Body
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(-w/2, -h/2, w, h);

    // Jacket highlight
    ctx.fillStyle = NEON_CYAN;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(-w/2, -h/4, 3, h/2);
    ctx.globalAlpha = 1;

    // Head
    ctx.fillStyle = '#c8b8a8';
    ctx.fillRect(-6, -h/2 - 2, 12, 14);

    // Eye glow
    ctx.fillStyle = NEON_CYAN;
    ctx.fillRect(1, -h/2 + 4, 3, 2);

    // Walk bob
    if (Math.abs(player.vx) > 0) {
      const bob = Math.sin(player.frame * Math.PI / 2) * 2;
      ctx.translate(0, bob);
    }

    // Glow aura
    ctx.shadowColor = NEON_CYAN;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = `rgba(0, 212, 255, ${0.2 + 0.1 * Math.sin(time * 3)})`;
    ctx.strokeRect(-w/2 - 2, -h/2 - 4, w + 4, h + 6);
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  function drawInteractionHints(camX) {
    if (!currentScene?.interactions) return;
    for (const obj of currentScene.interactions) {
      if (obj._collected) continue;
      const dx = Math.abs((player.x + player.w/2) - obj.x);
      const dy = Math.abs((player.y + player.h/2) - obj.y);
      if (dx < (obj.radius ?? 50) && dy < (obj.radius ?? 60)) {
        const sx = obj.x - camX;
        const sy = obj.y - 60;
        ctx.fillStyle = `rgba(0, 212, 255, ${0.5 + 0.3 * Math.sin(time * 4)})`;
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('[E] Interact', sx, sy);
      }
    }
  }

  function drawVignette() {
    const grad = ctx.createRadialGradient(W/2, H/2, H * 0.3, W/2, H/2, H * 0.9);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  function updateHUD() {
    document.getElementById('shard-count').textContent =
      `Light Signatures: ${state.lightSignatures.length} | Audio Shards: ${state.audioShards.length}`;
  }

  // --- SAVE / LOAD ---
  function saveGame() {
    localStorage.setItem('neonharbor_save', JSON.stringify(state));
  }
  function loadGame() {
    const data = localStorage.getItem('neonharbor_save');
    if (data) Object.assign(state, JSON.parse(data));
  }

  return { init, loadScene, registerScene, player, state, showDialogue, saveGame, loadGame, time: () => time };
})();
