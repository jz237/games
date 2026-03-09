// Neon Harbor — HTML5 Engine
// Handles: parallax rendering, player movement, water shader, scene/dialogue system, save/load, Loom UI, vignettes

const NeonHarbor = (() => {
  let canvas, ctx, W, H;
  let keys = {};
  let time = 0;
  let currentScene = null;
  let dialogueActive = false;
  let loomOpen = false;

  // Scene transition fade
  let fadeState = null; // { phase: 'out'|'in', elapsed: 0, duration: 0.5, targetScene, playerStartX }

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
    wovenMemories: [],
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

  // Ending state
  let endingTriggered = false;

  // Scene registry for transitions
  const sceneRegistry = {};

  function registerScene(id, scene) {
    sceneRegistry[id] = scene;
  }

  // --- VIGNETTE DEFINITIONS ---
  const vignetteDefinitions = [
    {
      shardId: 'shard_dock_ambient',
      signatureId: 'sig_cyan_dock',
      memoryName: 'The First Ships',
      dialogue: [
        { speaker: 'Memory', text: 'The harbor glows with warm copper light. Wooden ships creak against the first stone piers, their lanterns swaying in the salt wind.', choices: [] },
        { speaker: 'Memory', text: 'A woman stands at the water\'s edge, her voice rising in the old welcome song. Behind her, the foundations of a city are being laid — stone by stone, dream by dream.', choices: [] },
        { speaker: 'Memory', text: '"This will be a place of gathering," she says. "Where every current meets, every story finds harbor." The crowd cheers. The bells ring for the first time.', choices: [] },
        { speaker: 'The Loom', text: 'Memory woven: The First Ships. The harbor remembers its purpose.', choices: [] }
      ]
    },
    {
      shardId: 'shard_fog_horn',
      signatureId: 'sig_rose_dock',
      memoryName: 'The Last Festival',
      dialogue: [
        { speaker: 'Memory', text: 'Lanterns of every color line the docks. Music spills from every doorway — fiddles, drums, voices braided together in harmonies that make the water shimmer.', choices: [] },
        { speaker: 'Memory', text: 'Children run between the stalls, faces painted with constellations. Mara — young, laughing — dances with her father near the fish market, her dress trailing sparks of violet light.', choices: [] },
        { speaker: 'Memory', text: 'No one knows this is the last festival. At midnight, the fog horn sounds — not its usual call, but something deeper. The music falters. The lights begin to dim. The Silence is coming.', choices: [] },
        { speaker: 'The Loom', text: 'Memory woven: The Last Festival. The city remembers joy before loss.', choices: [] }
      ]
    },
    {
      shardId: 'shard_market_chime',
      signatureId: 'sig_amber_market',
      memoryName: 'Mara\'s Youth',
      dialogue: [
        { speaker: 'Memory', text: 'The fish market is alive with color. Young Mara tends her father\'s stall, sorting the morning catch by the amber glow of oil lanterns. The fish still shimmer gold.', choices: [] },
        { speaker: 'Memory', text: '"Every fish tells a story," her father says, holding up a silver specimen that catches the light. "This one swam through the deep current. See how it glows? The Loom touched it."', choices: [] },
        { speaker: 'Memory', text: 'Mara presses her ear to a shell and hears machinery — distant, rhythmic, warm. She doesn\'t know yet that she\'ll spend her life trying to hear that sound again.', choices: [] },
        { speaker: 'The Loom', text: 'Memory woven: Mara\'s Youth. The city remembers its keeper of stories.', choices: [] }
      ]
    },
    {
      shardId: 'shard_tunnel_drip',
      signatureId: 'sig_fungi_glow',
      memoryName: 'The Engineers\' Descent',
      dialogue: [
        { speaker: 'Memory', text: 'Torchlight flickers against wet stone. A line of engineers descends single-file into the tunnels, their tools wrapped in oilcloth, their faces set with determination.', choices: [] },
        { speaker: 'Memory', text: '"The frequency regulator is three levels down," says the lead engineer. "If we can reach it, we can retune the Loom." She doesn\'t mention that the last team never returned.', choices: [] },
        { speaker: 'Memory', text: 'The tunnel narrows. The bioluminescent fungi — once guides left by the Architect — flicker and die as they pass. Something in the deep doesn\'t want to be found.', choices: [] },
        { speaker: 'The Loom', text: 'Memory woven: The Engineers\' Descent. The city remembers those who tried.', choices: [] }
      ]
    },
    {
      shardId: 'shard_keeper_hum',
      signatureId: 'sig_deep_pulse',
      memoryName: 'The Keeper\'s Vigil',
      dialogue: [
        { speaker: 'Memory', text: 'Alone in the chamber, the Keeper tends the Loom. Her hands — old now, trembling — check each thread with practiced care. Most are dark. A few still glow.', choices: [] },
        { speaker: 'Memory', text: '"I promised Eira I would keep it alive," she whispers to no one. "Even if no one comes. Even if no one remembers why." She adjusts a thread. A faint hum responds.', choices: [] },
        { speaker: 'Memory', text: 'In the silence between the hums, she sings the old welcome song. Her voice is thin but steady. Somewhere in the dark, the Loom brightens — just barely — as if remembering the words.', choices: [] },
        { speaker: 'The Loom', text: 'Memory woven: The Keeper\'s Vigil. The city remembers faith in the dark.', choices: [] }
      ]
    },
    {
      shardId: 'shard_original_tone',
      signatureId: 'sig_loom_gold',
      memoryName: 'The Original Frequency',
      dialogue: [
        { speaker: 'Memory', text: 'Before words, before names, there was the tone. A single note that resonated through stone and water and air. The Architect heard it first — rising from the deep current like a song from the earth itself.', choices: [] },
        { speaker: 'Memory', text: 'She built the Loom to hold it. To amplify it. To let the whole harbor vibrate with its warmth. When the first thread caught the tone, the cobblestones began to glow gold.', choices: [] },
        { speaker: 'Memory', text: 'People touched the walls and felt peace. They touched each other and understood. The tone was connection itself — the frequency of shared memory. The harbor was alive.', choices: [] },
        { speaker: 'The Loom', text: 'Memory woven: The Original Frequency. The city remembers what it was built to be.', choices: [] }
      ]
    },
    {
      shardId: 'shard_silence_between',
      signatureId: 'sig_echo_violet',
      memoryName: 'The Third Frequency',
      dialogue: [
        { speaker: 'Memory', text: 'Between gold and blue, between remembering and forgetting, there is a third space. The Architect glimpsed it once — a violet shimmer at the edge of perception.', choices: [] },
        { speaker: 'Memory', text: '"What if we don\'t have to choose?" she wrote in her journal. "What if the Loom can hold both? Memory and release. Story and silence. What if the third frequency is acceptance?"', choices: [] },
        { speaker: 'Memory', text: 'She never finished the equation. The Silence came first. But the idea remains — embedded in the Loom\'s deepest threads, waiting for someone who carries both frequencies to find it.', choices: [] },
        { speaker: 'The Loom', text: 'Memory woven: The Third Frequency. The city remembers possibility.', choices: [] }
      ]
    },
    {
      shardId: 'shard_vendor_call',
      signatureId: 'sig_violet_lantern',
      memoryName: 'The Deep Current',
      dialogue: [
        { speaker: 'Memory', text: 'Beneath the harbor, the water flows through channels older than memory. Once, the current ran warm and golden — a river of light connecting the Loom to the surface.', choices: [] },
        { speaker: 'Memory', text: 'Something shifted in the deep. A frequency changed. The warm gold turned to cold blue, and with it, the stories unraveled. The current carried forgetting instead of memory.', choices: [] },
        { speaker: 'Memory', text: 'The engineers tried to fix it. One by one, they descended into the tunnels and didn\'t return. Only the Keeper remained, tending the silent Loom in the dark.', choices: [] },
        { speaker: 'The Loom', text: 'Memory woven: The Deep Current. The city remembers what changed beneath.', choices: [] }
      ]
    }
  ];

  // --- LOOM UI ---
  let loomOverlay = null;
  let selectedShard = null;
  let selectedSignature = null;

  function createLoomOverlay() {
    if (loomOverlay) return;
    loomOverlay = document.createElement('div');
    loomOverlay.id = 'loom-overlay';
    loomOverlay.innerHTML = `
      <style>
        #loom-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(5, 5, 20, 0.95);
          z-index: 100; display: none;
          font-family: 'Segoe UI', monospace;
          color: #c0d0e0;
          overflow-y: auto;
        }
        #loom-overlay.open { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 30px; }
        .loom-title {
          font-size: 36px; color: #00d4ff; text-transform: uppercase;
          letter-spacing: 8px; margin-bottom: 8px;
          text-shadow: 0 0 20px rgba(0, 212, 255, 0.5), 0 0 40px rgba(0, 212, 255, 0.2);
        }
        .loom-weave-anim {
          font-size: 14px; color: #a040ff; letter-spacing: 4px; margin-bottom: 24px;
          animation: weave-pulse 2s ease-in-out infinite;
        }
        @keyframes weave-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        .loom-panels { display: flex; gap: 40px; width: 100%; max-width: 900px; margin-bottom: 24px; }
        .loom-panel {
          flex: 1; background: rgba(10, 10, 30, 0.8);
          border: 1px solid rgba(100, 100, 200, 0.2); border-radius: 8px;
          padding: 16px;
        }
        .loom-panel h3 { font-size: 14px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 12px; }
        .panel-sigs h3 { color: #00d4ff; }
        .panel-shards h3 { color: #ff3090; }
        .loom-item {
          display: flex; align-items: center; gap: 8px; padding: 6px 10px;
          margin-bottom: 4px; border-radius: 4px; cursor: pointer;
          transition: background 0.2s;
        }
        .loom-item:hover { background: rgba(100, 100, 200, 0.15); }
        .loom-item.selected { background: rgba(100, 100, 200, 0.25); border: 1px solid rgba(100, 100, 200, 0.4); }
        .loom-item.woven { opacity: 0.4; cursor: default; }
        .loom-dot { width: 10px; height: 10px; border-radius: 50%; }
        .dot-cyan { background: #00d4ff; box-shadow: 0 0 8px #00d4ff; }
        .dot-pink { background: #ff3090; box-shadow: 0 0 8px #ff3090; }
        .loom-combos {
          width: 100%; max-width: 900px;
          background: rgba(10, 10, 30, 0.6); border: 1px solid rgba(100, 100, 200, 0.15);
          border-radius: 8px; padding: 16px;
        }
        .loom-combos h3 { font-size: 14px; color: #a040ff; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 12px; }
        .combo-item {
          display: flex; align-items: center; gap: 10px; padding: 6px 0;
          font-size: 13px; color: #8090a0;
        }
        .combo-item.available { color: #c0d0e0; }
        .combo-item.woven { color: #40ff80; }
        .combo-arrow { color: #a040ff; }
        .weave-btn {
          margin-top: 16px; padding: 12px 32px;
          background: rgba(160, 64, 255, 0.2); border: 1px solid #a040ff;
          color: #e0d0ff; font-size: 16px; cursor: pointer;
          border-radius: 6px; text-transform: uppercase; letter-spacing: 3px;
          transition: all 0.3s; display: none;
        }
        .weave-btn.visible { display: inline-block; }
        .weave-btn:hover { background: rgba(160, 64, 255, 0.4); box-shadow: 0 0 20px rgba(160, 64, 255, 0.3); }
        .woven-list { margin-top: 12px; }
        .woven-entry { color: #40ff80; font-size: 12px; padding: 2px 0; }
        .loom-close-hint { margin-top: 16px; font-size: 11px; color: rgba(200, 200, 220, 0.3); letter-spacing: 2px; }
      </style>
      <div class="loom-title">The Loom</div>
      <div class="loom-weave-anim">◈ ─ ─ ◈ ─ ─ ◈ weaving ◈ ─ ─ ◈ ─ ─ ◈</div>
      <div class="loom-panels">
        <div class="loom-panel panel-sigs"><h3>◈ Light Signatures</h3><div id="loom-sigs"></div></div>
        <div class="loom-panel panel-shards"><h3>♫ Audio Shards</h3><div id="loom-shards"></div></div>
      </div>
      <div class="loom-combos">
        <h3>Memory Combinations</h3>
        <div id="loom-combo-list"></div>
        <button class="weave-btn" id="weave-btn">Weave Memory</button>
      </div>
      <div class="woven-list" id="woven-list"></div>
      <div class="loom-close-hint">[ TAB / ESC to close ]</div>
    `;
    document.body.appendChild(loomOverlay);
  }

  function openLoom() {
    createLoomOverlay();
    loomOpen = true;
    dialogueActive = true;
    selectedShard = null;
    selectedSignature = null;
    loomOverlay.classList.add('open');
    renderLoomContent();
  }

  function closeLoom() {
    loomOpen = false;
    dialogueActive = false;
    if (loomOverlay) loomOverlay.classList.remove('open');
  }

  function renderLoomContent() {
    const sigsEl = document.getElementById('loom-sigs');
    const shardsEl = document.getElementById('loom-shards');
    const comboEl = document.getElementById('loom-combo-list');
    const wovenEl = document.getElementById('woven-list');
    const weaveBtn = document.getElementById('weave-btn');

    // Get names from all registered scenes
    const allInteractions = [];
    for (const sceneId in sceneRegistry) {
      const s = sceneRegistry[sceneId];
      if (s.interactions) allInteractions.push(...s.interactions);
    }

    // Light Signatures
    sigsEl.innerHTML = '';
    for (const sigId of state.lightSignatures) {
      const obj = allInteractions.find(i => i.id === sigId);
      const name = obj?.name || sigId;
      const isWoven = state.wovenMemories.some(m => vignetteDefinitions.find(v => v.memoryName === m)?.signatureId === sigId);
      const div = document.createElement('div');
      div.className = 'loom-item' + (selectedSignature === sigId ? ' selected' : '') + (isWoven ? ' woven' : '');
      div.innerHTML = `<span class="loom-dot dot-cyan"></span><span>${name}</span>`;
      if (!isWoven) div.onclick = () => { selectedSignature = sigId; renderLoomContent(); };
      sigsEl.appendChild(div);
    }

    // Audio Shards
    shardsEl.innerHTML = '';
    for (const shardId of state.audioShards) {
      const obj = allInteractions.find(i => i.id === shardId);
      const name = obj?.name || shardId;
      const isWoven = state.wovenMemories.some(m => vignetteDefinitions.find(v => v.memoryName === m)?.shardId === shardId);
      const div = document.createElement('div');
      div.className = 'loom-item' + (selectedShard === shardId ? ' selected' : '') + (isWoven ? ' woven' : '');
      div.innerHTML = `<span class="loom-dot dot-pink"></span><span>${name}</span>`;
      if (!isWoven) div.onclick = () => { selectedShard = shardId; renderLoomContent(); };
      shardsEl.appendChild(div);
    }

    // Combinations
    comboEl.innerHTML = '';
    for (const v of vignetteDefinitions) {
      const hasShard = state.audioShards.includes(v.shardId);
      const hasSig = state.lightSignatures.includes(v.signatureId);
      const isWoven = state.wovenMemories.includes(v.memoryName);
      const shardName = allInteractions.find(i => i.id === v.shardId)?.name || v.shardId;
      const sigName = allInteractions.find(i => i.id === v.signatureId)?.name || v.signatureId;

      const div = document.createElement('div');
      div.className = 'combo-item' + (hasShard && hasSig && !isWoven ? ' available' : '') + (isWoven ? ' woven' : '');
      div.innerHTML = `<span>${shardName}</span><span class="combo-arrow">+</span><span>${sigName}</span><span class="combo-arrow">→</span><span>${isWoven ? '✓ ' : ''}${v.memoryName}${!hasShard || !hasSig ? ' (missing pieces)' : ''}</span>`;
      comboEl.appendChild(div);
    }

    // Weave button
    const canWeave = selectedShard && selectedSignature &&
      vignetteDefinitions.find(v => v.shardId === selectedShard && v.signatureId === selectedSignature && !state.wovenMemories.includes(v.memoryName));
    weaveBtn.className = 'weave-btn' + (canWeave ? ' visible' : '');
    weaveBtn.onclick = () => { if (canWeave) weaveMemory(); };

    // Woven memories list
    wovenEl.innerHTML = '';
    if (state.wovenMemories.length > 0) {
      wovenEl.innerHTML = '<h3 style="color:#40ff80;font-size:12px;letter-spacing:2px;margin-bottom:6px">WOVEN MEMORIES</h3>';
      for (const m of state.wovenMemories) {
        wovenEl.innerHTML += `<div class="woven-entry">✓ ${m}</div>`;
      }
    }
  }

  function weaveMemory() {
    const vignette = vignetteDefinitions.find(v => v.shardId === selectedShard && v.signatureId === selectedSignature);
    if (!vignette || state.wovenMemories.includes(vignette.memoryName)) return;
    state.wovenMemories.push(vignette.memoryName);
    closeLoom();
    showDialogue(vignette.dialogue);
  }

  // --- INIT ---
  function init(c) {
    canvas = c;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', e => {
      keys[e.key] = true;
      if (e.key === 'Tab') {
        e.preventDefault();
        if (loomOpen) closeLoom();
        else if (!dialogueActive) openLoom();
      }
      if (e.key === 'Escape' && loomOpen) { e.preventDefault(); closeLoom(); }
      if (e.key === 'F5') { e.preventDefault(); saveGame(); showDialogue([{ speaker: 'System', text: 'Game saved.', choices: [] }]); }
      if (e.key === 'F9') { e.preventDefault(); loadGame(); showDialogue([{ speaker: 'System', text: 'Game loaded.', choices: [] }]); }
    });
    window.addEventListener('keyup', e => { keys[e.key] = false; });
    requestAnimationFrame(loop);
  }

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
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

  // Scene transition with fade
  function transitionToScene(targetId, playerStartX) {
    const target = sceneRegistry[targetId];
    if (!target) return;
    fadeState = { phase: 'out', elapsed: 0, duration: 0.5, targetScene: target, playerStartX };
    dialogueActive = true; // freeze player during fade
  }

  // --- MAIN LOOP ---
  let lastTime = 0;
  function loop(ts) {
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;
    time += dt;

    // Handle fade transition
    if (fadeState) {
      fadeState.elapsed += dt;
      if (fadeState.phase === 'out' && fadeState.elapsed >= fadeState.duration) {
        // Load the new scene at midpoint
        const target = fadeState.targetScene;
        target.playerStart = { ...target.playerStart, x: fadeState.playerStartX ?? target.playerStart?.x ?? 100 };
        loadScene(target);
        fadeState.phase = 'in';
        fadeState.elapsed = 0;
      } else if (fadeState.phase === 'in' && fadeState.elapsed >= fadeState.duration) {
        fadeState = null;
        dialogueActive = false;
      }
    }

    if (!dialogueActive) update(dt);
    render(dt);

    // Render fade overlay
    if (fadeState) {
      let alpha;
      if (fadeState.phase === 'out') {
        alpha = fadeState.elapsed / fadeState.duration;
      } else {
        alpha = 1 - (fadeState.elapsed / fadeState.duration);
      }
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, Math.max(0, alpha))})`;
      ctx.fillRect(0, 0, W, H);
      renderDissolveParticles();
    }

    updateHUD();
    requestAnimationFrame(loop);
  }

  // --- UPDATE ---
  function update(dt) {
    player.vx = 0;
    if (keys['ArrowLeft'] || keys['a']) { player.vx = -player.speed; player.facing = -1; }
    if (keys['ArrowRight'] || keys['d']) { player.vx = player.speed; player.facing = 1; }

    player.vy += 600 * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    const groundY = currentScene?.groundY ?? (H * 0.65);
    if (player.y + player.h >= groundY) {
      player.y = groundY - player.h;
      player.vy = 0;
      player.grounded = true;
    }

    if ((keys['ArrowUp'] || keys['w'] || keys[' ']) && player.grounded) {
      player.vy = -320;
      player.grounded = false;
    }

    if (Math.abs(player.vx) > 0) {
      player.frameTime += dt;
      if (player.frameTime > 0.12) { player.frame = (player.frame + 1) % 4; player.frameTime = 0; }
    } else {
      player.frame = 0;
    }

    const sceneW = currentScene?.width ?? 1600;
    player.x = Math.max(0, Math.min(sceneW - player.w, player.x));

    checkExitZones();

    if (keys['e'] || keys['Enter']) {
      keys['e'] = false; keys['Enter'] = false;
      checkInteractions();
    }
  }

  function checkExitZones() {
    if (!currentScene?.exitZones) return;
    for (const zone of currentScene.exitZones) {
      if (player.x >= zone.x && player.x <= zone.x + zone.width) {
        // Check memory requirement
        if (zone.requiresMemories) {
          const wovenCount = (state.wovenMemories || []).length;
          if (wovenCount < zone.requiresMemories) {
            showDialogue([{ speaker: 'The Loom', text: `The Loom requires more memories to awaken. You have woven ${wovenCount} of ${zone.requiresMemories} needed memories.`, choices: [] }]);
            player.x = zone.x - 10; // push player back
            return;
          }
        }
        const target = sceneRegistry[zone.target];
        if (target) {
          transitionToScene(zone.target, zone.playerStartX ?? target.playerStart?.x ?? 100);
        }
        break;
      }
    }
  }

  // --- ENDING SEQUENCES ---
  const restorationEnding = [
    { speaker: 'The Loom', text: 'All eight memories pulse within the threads. The Loom shudders — a deep, resonant vibration that shakes dust from the ceiling and sends ripples through every vein of light in the chamber walls.', choices: [] },
    { speaker: 'The Loom', text: 'Golden light erupts from the machine\'s core, flooding the chamber in waves. The cold blue that has haunted the harbor for so long retreats, dissolving like fog before the sun.', choices: [] },
    { speaker: 'The Architect', text: 'Eira\'s echo blazes bright — no longer translucent, but radiant. "The original frequency," she breathes. "You found every thread. You remembered what we forgot."', choices: [] },
    { speaker: 'The Loom', text: 'The warmth surges upward through the tunnels, through the fish market, through the docks. Above, the harbor glows gold for the first time in a century. The cobblestones hum with stories. The water shimmers with memory.', choices: [] },
    { speaker: 'The Loom', text: 'People will touch the walls and feel joy. They will hear the welcome song in the salt wind. The harbor remembers — and it will never forget again.', choices: [] },
    { speaker: 'The Loom', text: 'THE END — The Harbor Remembers', choices: [] }
  ];

  const thirdWayEnding = [
    { speaker: 'The Loom', text: 'All eight memories pulse within the threads — but something else pulses too. A violet shimmer, born from the space between remembering and forgetting. The third frequency awakens.', choices: [] },
    { speaker: 'The Loom', text: 'Gold and blue light spiral together, neither overtaking the other. Where they meet, violet blooms — a new color, a new resonance. The Loom doesn\'t restore. It transforms.', choices: [] },
    { speaker: 'The Architect', text: 'Eira\'s echo watches, eyes wide with wonder. "Neither gold nor blue," she whispers. "You found what I only theorized. The frequency of acceptance — holding memory and release in the same breath."', choices: [] },
    { speaker: 'The Loom', text: 'The violet frequency rises through the harbor like a tide. Not erasing the silence, not drowning it in memory — but weaving both into something that breathes. The city becomes a living palimpsest, past and present layered in light.', choices: [] },
    { speaker: 'The Loom', text: 'People will touch the walls and feel peace — not the ache of loss, not the weight of remembering, but the quiet grace of a story that continues. The harbor is neither restored nor forgotten. It is alive.', choices: [] },
    { speaker: 'The Loom', text: 'THE END — The Third Frequency', choices: [] }
  ];

  function checkEndingTrigger(obj) {
    if (endingTriggered) return false;
    if (obj.id !== 'the_loom_machine') return false;
    if (state.wovenMemories.length < 8) return false;
    endingTriggered = true;
    const isThirdWay = state.flags.questioned_restoration && state.flags.third_way;
    const endingNodes = isThirdWay ? thirdWayEnding : restorationEnding;
    showEndingDialogue(endingNodes, 0);
    return true;
  }

  function showEndingDialogue(nodes, idx) {
    if (idx >= nodes.length) { showCredits(); return; }
    dialogueActive = true;
    const node = nodes[idx];
    const box = document.getElementById('dialogue-box');
    box.style.display = 'block';
    document.getElementById('dlg-speaker').textContent = node.speaker || '';
    document.getElementById('dlg-text').textContent = node.text || '';
    const choicesEl = document.getElementById('dlg-choices');
    choicesEl.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = idx < nodes.length - 1 ? '▸ Continue' : '▸ . . .';
    btn.onclick = () => showEndingDialogue(nodes, idx + 1);
    choicesEl.appendChild(btn);
  }

  function showCredits() {
    hideDialogue();
    const overlay = document.createElement('div');
    overlay.id = 'credits-overlay';
    overlay.innerHTML = `
      <style>
        #credits-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.95); z-index: 200;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          font-family: 'Segoe UI', monospace; color: #c0d0e0;
          animation: credits-fade-in 2s ease-in;
        }
        @keyframes credits-fade-in { from { opacity: 0; } to { opacity: 1; } }
        .credits-title { font-size: 48px; color: #00d4ff; letter-spacing: 8px; margin-bottom: 24px;
          text-shadow: 0 0 30px rgba(0, 212, 255, 0.5); }
        .credits-message { font-size: 18px; color: #a0b0c0; max-width: 500px; text-align: center;
          line-height: 1.8; margin-bottom: 40px; }
        .credits-play-again { padding: 14px 40px; background: rgba(0, 180, 255, 0.15);
          border: 1px solid rgba(0, 180, 255, 0.4); color: #a0d8ff; font-size: 16px;
          cursor: pointer; border-radius: 6px; text-transform: uppercase; letter-spacing: 3px;
          transition: all 0.3s; }
        .credits-play-again:hover { background: rgba(0, 180, 255, 0.3); color: #fff;
          box-shadow: 0 0 20px rgba(0, 180, 255, 0.3); }
      </style>
      <div class="credits-title">NEON HARBOR</div>
      <div class="credits-message">
        Every city is built on stories. Some are remembered. Some are woven into the walls, the water, the light itself.
        <br><br>Thank you for listening.
      </div>
      <button class="credits-play-again" id="credits-play-again">Play Again</button>
    `;
    document.body.appendChild(overlay);
    document.getElementById('credits-play-again').onclick = () => {
      overlay.remove();
      // Reset state
      state.lightSignatures.length = 0;
      state.audioShards.length = 0;
      state.wovenMemories.length = 0;
      state.location = 'docks';
      Object.keys(state.reputation).forEach(k => delete state.reputation[k]);
      Object.keys(state.flags).forEach(k => delete state.flags[k]);
      endingTriggered = false;
      // Clear collected flags on all scene interactions
      for (const sceneId in sceneRegistry) {
        const s = sceneRegistry[sceneId];
        if (s.interactions) s.interactions.forEach(i => delete i._collected);
      }
      loadScene(sceneRegistry['scene01']);
    };
  }

  // --- INTERACTIONS ---
  function checkInteractions() {
    if (!currentScene?.interactions) return;
    for (const obj of currentScene.interactions) {
      const dx = Math.abs((player.x + player.w/2) - obj.x);
      const dy = Math.abs((player.y + player.h/2) - obj.y);
      if (dx < (obj.radius ?? 50) && dy < (obj.radius ?? 60)) {
        if (obj.type === 'dialogue') {
          if (checkEndingTrigger(obj)) break;
          showDialogue(obj.dialogue);
        }
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

  // --- AMBIENT PARTICLES ---
  const ambientParticles = { docks: [], tunnels: [] };
  function initAmbientParticles() {
    // Fireflies for docks
    for (let i = 0; i < 15; i++) {
      ambientParticles.docks.push({
        x: Math.random() * 2400, y: Math.random() * 0.5,
        vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 10,
        phase: Math.random() * Math.PI * 2
      });
    }
    // Spores for tunnels
    for (let i = 0; i < 20; i++) {
      ambientParticles.tunnels.push({
        x: Math.random() * 3000, y: Math.random() * 0.6 + 0.2,
        vx: (Math.random() - 0.5) * 8, vy: -5 - Math.random() * 10,
        phase: Math.random() * Math.PI * 2
      });
    }
  }
  initAmbientParticles();

  function renderAmbientParticles(camX) {
    const sceneName = currentScene?.name;
    if (sceneName === 'The Docks') {
      for (const p of ambientParticles.docks) {
        p.x += p.vx * 0.016;
        p.y += Math.sin(time * 0.5 + p.phase) * 0.0003;
        const sx = p.x - camX;
        const sy = H * (0.15 + p.y * 0.45) + Math.sin(time * 0.7 + p.phase) * 15;
        if (sx < -20 || sx > W + 20) continue;
        const alpha = 0.3 + 0.3 * Math.sin(time * 2 + p.phase);
        ctx.beginPath();
        ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 255, 100, ${alpha})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 255, 100, ${alpha * 0.15})`;
        ctx.fill();
        // Wrap around
        if (p.x > 2500) p.x -= 2500;
        if (p.x < -100) p.x += 2500;
      }
    } else if (sceneName === 'The Tunnels') {
      for (const p of ambientParticles.tunnels) {
        p.x += p.vx * 0.016 + Math.sin(time * 0.3 + p.phase) * 0.3;
        p.y += p.vy * 0.00005;
        const sx = p.x - camX;
        const sy = H * p.y;
        if (sx < -20 || sx > W + 20) continue;
        const alpha = 0.2 + 0.2 * Math.sin(time * 1.5 + p.phase);
        ctx.beginPath();
        ctx.arc(sx, sy, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(160, 80, 220, ${alpha})`;
        ctx.fill();
        // Wrap vertically
        if (p.y < 0.05) p.y = 0.8;
      }
    }
  }

  // --- TRANSITION DISSOLVE PARTICLES ---
  const dissolveParticles = [];
  for (let i = 0; i < 40; i++) {
    const angle = (i / 40) * Math.PI * 2 + Math.random() * 0.3;
    dissolveParticles.push({ angle, speed: 80 + Math.random() * 120, size: 2 + Math.random() * 3 });
  }

  function renderDissolveParticles() {
    if (!fadeState) return;
    const cx = W / 2, cy = H / 2;
    let progress;
    if (fadeState.phase === 'out') {
      progress = fadeState.elapsed / fadeState.duration;
    } else {
      progress = 1 - fadeState.elapsed / fadeState.duration;
    }
    const maxDist = Math.max(W, H) * 0.7;
    for (const p of dissolveParticles) {
      const dist = progress * maxDist * (p.speed / 200);
      const px = cx + Math.cos(p.angle) * dist;
      const py = cy + Math.sin(p.angle) * dist;
      const alpha = 0.6 * (1 - Math.abs(progress - 0.5) * 2);
      if (alpha <= 0) continue;
      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fill();
    }
  }

  // --- RENDER ---
  function render(dt) {
    const camX = Math.max(0, player.x - W/2 + player.w/2);

    // Sky gradient (scenes can override by not having sky)
    if (currentScene?.name !== 'The Tunnels') {
      const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.6);
      skyGrad.addColorStop(0, SKY_TOP);
      skyGrad.addColorStop(1, SKY_BOT);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, W, H);
      drawStars();
    }

    // Parallax layers
    for (const layer of layers) {
      layer.render(ctx, W, H, camX, time);
    }

    // Ambient particles (after layers, before scene objects)
    renderAmbientParticles(camX);

    // Ground platform (tunnels handle their own)
    if (currentScene?.name !== 'The Tunnels') {
      const groundY = currentScene?.groundY ?? (H * 0.65);
      drawDockGround(groundY, camX);
      drawWater(groundY, camX);
    }

    // Scene objects
    if (currentScene?.renderObjects) currentScene.renderObjects(ctx, W, H, camX, time, state);

    // Player
    drawPlayer(camX);

    // Interaction hints
    drawInteractionHints(camX);

    // Screen vignette (dark edges)
    drawScreenVignette();
  }

  function drawStars() {
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

    const plankW = 80;
    const startX = -(camX % plankW);
    ctx.strokeStyle = 'rgba(60, 40, 30, 0.5)';
    for (let x = startX; x < W; x += plankW) {
      ctx.strokeRect(x, groundY, plankW - 2, 12);
    }

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

    const wGrad = ctx.createLinearGradient(0, waterTop, 0, H);
    wGrad.addColorStop(0, 'rgba(5, 18, 40, 0.9)');
    wGrad.addColorStop(1, 'rgba(2, 8, 20, 1)');
    ctx.fillStyle = wGrad;
    ctx.fillRect(0, waterTop, W, waterH);

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

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(-w/2, -h/2, w, h);

    ctx.fillStyle = NEON_CYAN;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(-w/2, -h/4, 3, h/2);
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#c8b8a8';
    ctx.fillRect(-6, -h/2 - 2, 12, 14);

    ctx.fillStyle = NEON_CYAN;
    ctx.fillRect(1, -h/2 + 4, 3, 2);

    if (Math.abs(player.vx) > 0) {
      const bob = Math.sin(player.frame * Math.PI / 2) * 2;
      ctx.translate(0, bob);
    }

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

  function drawScreenVignette() {
    const grad = ctx.createRadialGradient(W/2, H/2, H * 0.3, W/2, H/2, H * 0.9);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  function updateHUD() {
    const wovenText = state.wovenMemories.length > 0 ? ` | Memories: ${state.wovenMemories.length}` : '';
    document.getElementById('shard-count').textContent =
      `Light Signatures: ${state.lightSignatures.length} | Audio Shards: ${state.audioShards.length}${wovenText}`;
  }

  // --- SAVE / LOAD ---
  function saveGame() {
    localStorage.setItem('neonharbor_save', JSON.stringify(state));
  }
  function loadGame() {
    const data = localStorage.getItem('neonharbor_save');
    if (data) Object.assign(state, JSON.parse(data));
  }

  return {
    init, loadScene, registerScene, player, state,
    showDialogue, saveGame, loadGame, checkEndingTrigger,
    time: () => time,
    get loomOpen() { return loomOpen; },
    get fadeState() { return fadeState; },
    get dialogueActive() { return dialogueActive; },
    get endingTriggered() { return endingTriggered; },
    set _endingTriggered(v) { endingTriggered = v; }
  };
})();
