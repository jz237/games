// Scene 04: The Loom Chamber — The heart of the harbor's forgotten memory
const Scene04 = {
  name: 'The Loom Chamber',
  width: 2000,
  groundY: null,
  playerStart: { x: 100, y: 0 },

  get groundYCalc() { return window.innerHeight * 0.72; },

  layers: [
    // Far — vast dark cavern ceiling with stalactites
    {
      render(ctx, W, H, camX, time) {
        ctx.fillStyle = '#040408';
        ctx.fillRect(0, 0, W, H);

        // Stalactites from ceiling
        const offset = camX * 0.03;
        for (let i = 0; i < 25; i++) {
          const bx = ((i * 251 + 97) * 4 - offset) % (W + 300) - 100;
          const h = 30 + (i * 31) % 80;
          const w = 6 + (i * 7) % 12;
          const grad = ctx.createLinearGradient(bx, 0, bx, h);
          grad.addColorStop(0, '#1a1a2e');
          grad.addColorStop(1, 'rgba(26, 26, 46, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(bx - w/2, 0);
          ctx.lineTo(bx + w/2, 0);
          ctx.lineTo(bx, h);
          ctx.closePath();
          ctx.fill();
        }

        // Distant cavern glow — deep purple ambient
        const ambientGrad = ctx.createRadialGradient(W * 0.5, H * 0.5, 50, W * 0.5, H * 0.5, H);
        ambientGrad.addColorStop(0, 'rgba(80, 30, 120, 0.08)');
        ambientGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = ambientGrad;
        ctx.fillRect(0, 0, W, H);
      }
    },
    // Mid — chamber walls with ancient carvings and memory-light veins
    {
      render(ctx, W, H, camX, time) {
        const offset = camX * 0.15;
        const groundY = window.innerHeight * 0.72;

        // Stone wall segments
        ctx.fillStyle = '#0c0c18';
        for (let i = 0; i < 12; i++) {
          const bx = (i * 180 + 30 - offset) % (W + 400) - 100;
          const by = H * 0.05 + (i * 43) % (H * 0.2);
          ctx.fillRect(bx, by, 100 + (i * 17) % 50, 30 + (i * 11) % 20);
        }

        // Memory-light veins running through walls — glow based on woven memories
        const veins = [
          { x1: 100, y1: 0.08, x2: 250, y2: 0.35, color: '#00d4ff' },
          { x1: 400, y1: 0.05, x2: 500, y2: 0.40, color: '#a040ff' },
          { x1: 700, y1: 0.10, x2: 900, y2: 0.30, color: '#ff3090' },
          { x1: 1100, y1: 0.03, x2: 1200, y2: 0.38, color: '#40ff80' },
          { x1: 1500, y1: 0.07, x2: 1650, y2: 0.32, color: '#ffb020' },
        ];
        for (const v of veins) {
          const vx1 = v.x1 - offset;
          const vx2 = v.x2 - offset;
          const pulse = 0.15 + 0.1 * Math.sin(time * 1.5 + v.x1 * 0.01);
          ctx.strokeStyle = v.color;
          ctx.globalAlpha = pulse;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(vx1, H * v.y1);
          const cpx = (vx1 + vx2) / 2 + Math.sin(time * 0.5 + v.x1) * 15;
          const cpy = H * ((v.y1 + v.y2) / 2);
          ctx.quadraticCurveTo(cpx, cpy, vx2, H * v.y2);
          ctx.stroke();

          // Glow dots along the vein
          for (let t = 0; t < 1; t += 0.25) {
            const px = vx1 + (vx2 - vx1) * t;
            const py = H * v.y1 + (H * v.y2 - H * v.y1) * t;
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fillStyle = v.color;
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          ctx.lineWidth = 1;
        }
      }
    },
    // Near — floating dust particles and energy motes
    {
      render(ctx, W, H, camX, time) {
        const offset = camX * 0.4;
        // Floating particles
        for (let i = 0; i < 60; i++) {
          const baseX = ((i * 173 + 53) * 5) % 2200;
          const baseY = ((i * 271 + 31) * 3) % (window.innerHeight * 0.65);
          const px = baseX - offset + Math.sin(time * 0.3 + i * 0.7) * 20;
          const py = baseY + Math.sin(time * 0.5 + i * 1.1) * 15;

          const colors = ['#00d4ff', '#a040ff', '#ff3090', '#40ff80', '#ffb020'];
          const color = colors[i % colors.length];
          const alpha = 0.15 + 0.1 * Math.sin(time * 2 + i);
          const size = 1.5 + Math.sin(time + i) * 0.8;

          ctx.beginPath();
          ctx.arc(px, py, size, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.globalAlpha = alpha;
          ctx.fill();

          // Tiny trail
          ctx.globalAlpha = alpha * 0.3;
          ctx.beginPath();
          ctx.arc(px - 3, py + 2, size * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }
  ],

  interactions: [
    // The Loom Machine — central interactive NPC-like object
    {
      id: 'the_loom_machine',
      type: 'dialogue',
      x: 1000, y: 0,
      radius: 80,
      dialogue: [
        {
          speaker: 'The Loom',
          text: 'The ancient machine hums with frequencies older than the harbor itself. Its threads — once golden and warm — now pulse with fragmented light. Each woven memory strengthens the weave.',
          choices: [
            { label: 'Touch the threads', next: 1 },
            { label: 'Examine the base', next: 2 },
            { label: 'Step back', next: 6 }
          ]
        },
        {
          speaker: 'The Loom',
          text: 'The threads vibrate under your fingers. Images flash: ships arriving, music filling the streets, festivals of light. The harbor as it was. The Loom is trying to remember.',
          choices: [
            { label: 'Feed it a memory', next: 3 },
            { label: 'Listen to the resonance', next: 4 }
          ]
        },
        {
          speaker: 'The Loom',
          text: 'The base is carved with symbols from a forgotten language. Some glow faintly — the ones corresponding to memories you\'ve woven. The machine was built to hold the city\'s story.',
          choices: [
            { label: 'Trace the glowing symbols', next: 5 },
            { label: 'Step back', next: 6 }
          ]
        },
        {
          speaker: 'The Loom',
          text: 'As your woven memories flow into the threads, the Loom brightens. For a moment, the chamber fills with warm golden light — the color of the original frequency. The walls show glimpses of the harbor in its prime.',
          choices: [
            { label: 'Continue', next: 6 }
          ]
        },
        {
          speaker: 'The Loom',
          text: 'A deep, resonant tone fills the chamber. Not a sound exactly — more like the feeling of a sound. Your collected audio shards harmonize with the machine, creating a chord that shakes dust from the ceiling.',
          choices: [
            { label: 'Continue', next: 6 }
          ]
        },
        {
          speaker: 'The Loom',
          text: 'Under your fingertips, the symbols warm. Each one tells a piece of the story: the founding, the festivals, the silence, the forgetting. The Loom was not just a machine — it was the city\'s heart.',
          choices: [
            { label: 'Continue', next: 6 }
          ]
        },
        {
          speaker: 'The Loom',
          text: 'The Loom waits. Patient. Eternal. It has held this city\'s stories for centuries. Now it holds yours too.',
          choices: []
        }
      ]
    },
    // The Architect — ghost/echo NPC near the Loom
    {
      id: 'the_architect',
      type: 'dialogue',
      x: 600, y: 0,
      radius: 55,
      dialogue: [
        {
          speaker: 'The Architect',
          text: 'You can see through her. She flickers like a projection — an echo pressed into the chamber walls by the Loom itself. Her eyes are the color of old starlight.',
          choices: [
            { label: '"Who are you?"', next: 1 },
            { label: '"What happened here?"', next: 3 },
            { label: '"How do I restore the Loom?"', next: 5 }
          ]
        },
        {
          speaker: 'The Architect',
          text: '"I designed the frequency. The original tone that let the Loom weave memory into light. My name was Eira. Now I am... an echo of an echo."',
          choices: [
            { label: '"The frequency changed."', next: 2 },
            { label: '"Can you be restored?"', next: 4 }
          ]
        },
        {
          speaker: 'The Architect',
          text: '"Yes. Something in the deep current shifted. I don\'t know what — I was already fading when it happened. The warm gold became cold blue. Forgetting instead of remembering."',
          choices: [
            { label: '"I\'m trying to fix it."', next: 5 },
            { label: 'Nod silently', next: 6 }
          ]
        },
        {
          speaker: 'The Architect',
          text: '"The harbor was alive with memory. Every cobblestone, every wave held a story. People could touch a wall and feel the laughter of those who built it. That was the Loom\'s gift."',
          choices: [
            { label: '"And when it stopped?"', next: 4 },
            { label: '"I\'ve seen echoes of that."', next: 5 }
          ]
        },
        {
          speaker: 'The Architect',
          text: '"When it stopped, people forgot slowly. Not all at once — that would be merciful. They forgot the feeling of knowing. They forgot they ever remembered. The silence crept in like fog."',
          choices: [
            { label: '"How do I fix it?"', next: 5 },
            { label: 'Listen', next: 6 }
          ]
        },
        {
          speaker: 'The Architect',
          text: '"Weave the memories. All of them. When the Loom holds enough stories, it can reconstruct the original frequency. The warm gold will return, and with it — everything we lost."',
          choices: [
            { label: '"I will."', next: 6, reputation: { architect: 2 } },
            { label: '"What if the new frequency is better?"', next: 7, flag: 'questioned_restoration' }
          ]
        },
        {
          speaker: 'The Architect',
          text: 'She smiles — faint, warm, flickering. "Then the harbor is in good hands." Her form dims, then steadies. She\'ll be here. Waiting. Hoping.',
          choices: []
        },
        {
          speaker: 'The Architect',
          text: '"Better?" She pauses, genuinely considering. "Perhaps. The cold blue carries its own beauty. But a city without memory is a city without soul. Even beautiful forgetting is still forgetting."',
          choices: [
            { label: '"You\'re right. I\'ll restore it."', next: 6, reputation: { architect: 1 } },
            { label: '"Maybe there\'s a third way."', next: 8, flag: 'third_way' }
          ]
        },
        {
          speaker: 'The Architect',
          text: '"A third way..." She closes her eyes. When she opens them, they glow with a new light — neither gold nor blue, but violet. "If anyone could find it, perhaps it would be someone who carries both frequencies."',
          choices: []
        }
      ]
    },
    // Audio Shard: The Original Tone
    {
      id: 'shard_original_tone',
      type: 'shard',
      x: 400, y: 0,
      radius: 40,
      name: 'The Original Tone'
    },
    // Audio Shard: The Silence Between
    {
      id: 'shard_silence_between',
      type: 'shard',
      x: 1500, y: 0,
      radius: 40,
      name: 'The Silence Between'
    },
    // Light Signature: Loom Gold
    {
      id: 'sig_loom_gold',
      type: 'signature',
      x: 850, y: 0,
      radius: 40,
      name: 'Loom Gold'
    },
    // Light Signature: Echo Violet
    {
      id: 'sig_echo_violet',
      type: 'signature',
      x: 1300, y: 0,
      radius: 40,
      name: 'Echo Violet'
    }
  ],

  exitZones: [
    // Back to Tunnels
    { x: 0, width: 30, target: 'scene03', playerStartX: 2850 }
  ],

  // Render the Loom machine and chamber-specific visuals
  renderObjects(ctx, W, H, camX, time, state) {
    const groundY = window.innerHeight * 0.72;

    // The Loom Machine — central monolith
    const loomX = 1000 - camX;
    const loomW = 120;
    const loomH = 200;
    const loomY = groundY - loomH;

    // Base structure
    const baseGrad = ctx.createLinearGradient(loomX - loomW/2, loomY, loomX + loomW/2, loomY);
    baseGrad.addColorStop(0, '#1a1030');
    baseGrad.addColorStop(0.5, '#2a1850');
    baseGrad.addColorStop(1, '#1a1030');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(loomX - loomW/2, loomY, loomW, loomH);

    // Loom threads — vertical glowing lines
    const wovenCount = (state.wovenMemories || []).length;
    const threadColors = ['#00d4ff', '#ff3090', '#a040ff', '#40ff80', '#ffb020', '#ff8020'];
    for (let i = 0; i < 8; i++) {
      const tx = loomX - loomW/2 + 10 + i * (loomW - 20) / 7;
      const isActive = i < wovenCount * 2;
      const color = isActive ? threadColors[i % threadColors.length] : '#1a1a2e';
      const alpha = isActive ? (0.4 + 0.3 * Math.sin(time * 2 + i * 0.8)) : 0.05;

      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = isActive ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(tx, loomY + 10);
      // Wavy thread
      for (let y = loomY + 10; y < loomY + loomH - 10; y += 5) {
        const wave = isActive ? Math.sin(y * 0.05 + time * 3 + i) * 3 : 0;
        ctx.lineTo(tx + wave, y);
      }
      ctx.stroke();

      // Glow effect for active threads
      if (isActive) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        const glowY = loomY + 30 + Math.sin(time * 1.5 + i * 1.2) * 40;
        ctx.arc(tx, glowY, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;

    // Loom crown — ornate top
    ctx.fillStyle = '#2a1850';
    ctx.beginPath();
    ctx.moveTo(loomX - loomW/2 - 15, loomY);
    ctx.lineTo(loomX, loomY - 30);
    ctx.lineTo(loomX + loomW/2 + 15, loomY);
    ctx.closePath();
    ctx.fill();

    // Crown glow
    const crownAlpha = 0.3 + 0.2 * Math.sin(time * 1.2);
    const crownColor = wovenCount >= 4 ? '#ffd700' : '#a040ff';
    ctx.fillStyle = crownColor;
    ctx.globalAlpha = crownAlpha;
    ctx.beginPath();
    ctx.arc(loomX, loomY - 15, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = crownColor;
    ctx.shadowBlur = 30;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Symbol carvings at the base
    const symbols = ['◈', '◇', '△', '○', '☽', '✦'];
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i < symbols.length; i++) {
      const sx = loomX - 40 + i * 16;
      const sy = loomY + loomH - 15;
      const isLit = i < wovenCount;
      ctx.fillStyle = isLit ? '#ffd700' : '#1a1a2e';
      ctx.globalAlpha = isLit ? (0.6 + 0.3 * Math.sin(time * 1.5 + i)) : 0.15;
      ctx.fillText(symbols[i], sx, sy);
    }
    ctx.globalAlpha = 1;

    // The Architect echo — translucent figure
    const archX = 600 - camX;
    const archY = groundY - 56;
    const archAlpha = 0.25 + 0.1 * Math.sin(time * 0.8);
    ctx.globalAlpha = archAlpha;

    // Ghostly body
    ctx.fillStyle = '#c0b8ff';
    ctx.fillRect(archX - 8, archY, 16, 40);
    // Head
    ctx.beginPath();
    ctx.arc(archX, archY - 4, 8, 0, Math.PI * 2);
    ctx.fill();
    // Glow
    ctx.shadowColor = '#a080ff';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(archX, archY + 20, 15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Collectible glows
    for (const obj of Scene04.interactions) {
      if (obj._collected) continue;
      if (obj.type === 'shard' || obj.type === 'signature') {
        const ox = obj.x - camX;
        const oy = groundY - 20;
        const color = obj.type === 'shard' ? '#ff3090' : '#00d4ff';
        const pulseR = 8 + 3 * Math.sin(time * 3 + obj.x * 0.01);
        ctx.beginPath();
        ctx.arc(ox, oy, pulseR, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.15 + 0.1 * Math.sin(time * 2.5 + obj.x);
        ctx.fill();
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(ox, oy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Ground — ancient stone floor instead of dock planks
    ctx.fillStyle = '#0e0e18';
    ctx.fillRect(0, groundY, W, H - groundY);

    // Stone tile pattern
    const tileW = 60;
    const startX = -(camX % tileW);
    ctx.strokeStyle = 'rgba(40, 30, 60, 0.4)';
    for (let x = startX; x < W; x += tileW) {
      ctx.strokeRect(x, groundY, tileW - 1, 14);
    }

    // Edge glow on floor
    ctx.strokeStyle = `rgba(160, 64, 255, ${0.12 + 0.05 * Math.sin(time * 1.5)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(W, groundY);
    ctx.stroke();
    ctx.lineWidth = 1;

    // If all 4 memories are woven — show restoration shimmer
    if (wovenCount >= 4) {
      const shimmerAlpha = 0.03 + 0.02 * Math.sin(time * 0.5);
      const shimmerGrad = ctx.createRadialGradient(loomX, groundY - 100, 30, loomX, groundY - 100, 300);
      shimmerGrad.addColorStop(0, `rgba(255, 215, 0, ${shimmerAlpha * 3})`);
      shimmerGrad.addColorStop(0.5, `rgba(255, 180, 40, ${shimmerAlpha})`);
      shimmerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = shimmerGrad;
      ctx.fillRect(0, 0, W, H);
    }
  },

  onEnter(state) {
    // Set groundY dynamically
    Scene04.groundY = window.innerHeight * 0.72;
    // Update interaction Y positions
    for (const obj of Scene04.interactions) {
      if (obj.type === 'dialogue') obj.y = Scene04.groundY - 24;
      else obj.y = Scene04.groundY - 20;
    }
  }
};
