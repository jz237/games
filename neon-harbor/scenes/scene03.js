// Scene 03: The Tunnels — Underground passage to the Loom Chamber
const Scene03 = {
  name: 'The Tunnels',
  width: 3000,
  groundY: null,
  playerStart: { x: 100, y: 0 },

  get groundYCalc() { return window.innerHeight * 0.68; },

  layers: [
    // Far — deep stone wall texture
    {
      render(ctx, W, H, camX, time) {
        // Dark stone background instead of sky
        ctx.fillStyle = '#0a0a0e';
        ctx.fillRect(0, 0, W, H);

        // Distant stone texture
        const offset = camX * 0.05;
        ctx.fillStyle = '#0e0e14';
        for (let i = 0; i < 30; i++) {
          const bx = ((i * 317 + 71) * 3 - offset) % (W + 200) - 100;
          const by = (i * 419 + 53) % (H * 0.5) + H * 0.1;
          const bw = 40 + (i * 13) % 60;
          const bh = 20 + (i * 7) % 30;
          ctx.fillRect(bx, by, bw, bh);
        }
      }
    },
    // Mid — stone walls with cracks and bioluminescent fungi
    {
      render(ctx, W, H, camX, time) {
        const offset = camX * 0.2;
        const groundY = window.innerHeight * 0.68;

        // Ceiling (dark top area to imply low ceiling)
        const ceilingGrad = ctx.createLinearGradient(0, 0, 0, H * 0.25);
        ceilingGrad.addColorStop(0, 'rgba(5, 5, 8, 1)');
        ceilingGrad.addColorStop(1, 'rgba(5, 5, 8, 0)');
        ctx.fillStyle = ceilingGrad;
        ctx.fillRect(0, 0, W, H * 0.25);

        // Stone wall blocks
        ctx.fillStyle = '#12111a';
        for (let i = 0; i < 20; i++) {
          const bx = (i * 200 + 50 - offset) % (W + 300) - 100;
          const by = H * 0.08 + (i * 37) % (H * 0.15);
          ctx.fillRect(bx, by, 80 + (i * 11) % 40, 25 + (i * 7) % 15);
        }

        // Bioluminescent fungi on walls
        const fungiSpots = [
          { x: 200, y: 0.15, color: '#30ff80', size: 6 },
          { x: 500, y: 0.12, color: '#a040ff', size: 8 },
          { x: 850, y: 0.18, color: '#30ff80', size: 5 },
          { x: 1100, y: 0.10, color: '#a040ff', size: 7 },
          { x: 1400, y: 0.20, color: '#30ff80', size: 9 },
          { x: 1700, y: 0.14, color: '#a040ff', size: 6 },
          { x: 2000, y: 0.16, color: '#30ff80', size: 7 },
          { x: 2300, y: 0.11, color: '#a040ff', size: 8 },
          { x: 2600, y: 0.19, color: '#30ff80', size: 5 },
          // Floor-level fungi
          { x: 350, y: 0.64, color: '#30ff80', size: 4 },
          { x: 700, y: 0.65, color: '#a040ff', size: 5 },
          { x: 1250, y: 0.63, color: '#30ff80', size: 6 },
          { x: 1850, y: 0.66, color: '#a040ff', size: 4 },
          { x: 2450, y: 0.64, color: '#30ff80', size: 5 },
        ];
        for (const f of fungiSpots) {
          const fx = f.x - offset;
          if (fx < -30 || fx > W + 30) continue;
          const fy = H * f.y;
          const pulse = 0.3 + 0.25 * Math.sin(time * 1.5 + f.x * 0.01);
          ctx.save();
          ctx.globalAlpha = pulse;
          ctx.shadowColor = f.color;
          ctx.shadowBlur = 18;
          ctx.fillStyle = f.color;
          ctx.beginPath();
          ctx.arc(fx, fy, f.size, 0, Math.PI * 2);
          ctx.fill();
          // Glow halo
          ctx.globalAlpha = pulse * 0.15;
          ctx.beginPath();
          ctx.arc(fx, fy, f.size * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    },
    // Near — stalactites, rubble, dripping water
    {
      render(ctx, W, H, camX, time) {
        const offset = camX * 0.45;
        const groundY = window.innerHeight * 0.68;

        // Stalactites from ceiling
        ctx.fillStyle = '#16141e';
        const stalactites = [150, 400, 650, 950, 1200, 1500, 1800, 2100, 2400, 2700];
        for (const sx of stalactites) {
          const x = sx - offset;
          if (x < -40 || x > W + 40) continue;
          const h = 30 + (sx * 13) % 50;
          ctx.beginPath();
          ctx.moveTo(x - 8, 0);
          ctx.lineTo(x + 8, 0);
          ctx.lineTo(x + 2, h);
          ctx.lineTo(x - 2, h);
          ctx.closePath();
          ctx.fill();
        }

        // Rubble on ground
        ctx.fillStyle = '#1a1822';
        const rubble = [300, 600, 900, 1350, 1650, 2050, 2350, 2650];
        for (const rx of rubble) {
          const x = rx - offset;
          if (x < -40 || x > W + 40) continue;
          const w = 20 + (rx * 7) % 30;
          const h = 8 + (rx * 3) % 12;
          ctx.fillRect(x, groundY - h, w, h);
        }

        // Dripping water particles
        for (let i = 0; i < 8; i++) {
          const dx = ((i * 379 + 100) - offset * 0.3) % W;
          const dripCycle = (time * 0.8 + i * 1.3) % 2;
          if (dripCycle < 1.5) {
            const dy = dripCycle / 1.5 * groundY;
            ctx.fillStyle = `rgba(100, 180, 255, ${0.4 - dripCycle * 0.2})`;
            ctx.fillRect(dx, dy, 2, 5);
          } else {
            // Splash
            const splashAlpha = 1 - (dripCycle - 1.5) / 0.5;
            ctx.fillStyle = `rgba(100, 180, 255, ${splashAlpha * 0.3})`;
            ctx.beginPath();
            ctx.arc(dx, groundY, 4 + (dripCycle - 1.5) * 10, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  ],

  interactions: [
    // Tunnel Dweller NPC
    {
      id: 'tunnel_dweller',
      type: 'dialogue',
      x: 600, y: window.innerHeight * 0.68 - 24,
      radius: 60,
      dialogue: [
        {
          speaker: 'Tunnel Dweller',
          text: 'Turn back. You don\'t want to go deeper. The things down here... they remember too much.',
          choices: [
            { label: 'What do they remember?', next: 1 },
            { label: 'I\'m not afraid.', next: 2 }
          ]
        },
        {
          speaker: 'Tunnel Dweller',
          text: 'Everything the surface forgot. The old songs. The reasons we came here. The thing that sleeps beneath the harbor. You don\'t want to wake it.',
          choices: [
            { label: 'The Loom?', next: 3, flag: 'dweller_loom' },
            { label: 'What sleeps beneath?', next: 3 }
          ]
        },
        {
          speaker: 'Tunnel Dweller',
          text: 'Brave or foolish — same thing down here. Keep your light close. The fungi will guide you if you let them.',
          choices: [{ label: 'Thanks for the warning.' }]
        },
        {
          speaker: 'Tunnel Dweller',
          text: 'The Loom doesn\'t sleep, exactly. It... waits. It needs memories to weave — real memories, not the hollow echoes. If you\'ve been collecting shards and signatures... it knows.',
          choices: [
            { label: 'How do I reach it?', next: 4, reputation: { tunnels: 1 } },
          ]
        },
        {
          speaker: 'Tunnel Dweller',
          text: 'Follow the fungi. The purple ones point deeper. The green ones point to air. When they both glow at once... you\'re close.',
          choices: []
        }
      ]
    },
    // The Keeper NPC
    {
      id: 'the_keeper',
      type: 'dialogue',
      x: 2200, y: window.innerHeight * 0.68 - 24,
      radius: 60,
      dialogue: [
        {
          speaker: 'The Keeper',
          text: 'So. Another thread finds its way to the pattern. I am the Keeper — I tend the Loom while the city forgets.',
          choices: [
            { label: 'What is the Loom, really?', next: 1 },
            { label: 'Mara sent me.', next: 2, flag: 'keeper_met' }
          ]
        },
        {
          speaker: 'The Keeper',
          text: 'The Loom is the city\'s memory — a machine older than the harbor itself. It wove sound and light into stories, histories, identity. When the Silence came, it stopped. But it didn\'t die.',
          choices: [
            { label: 'Can I restart it?', next: 3 },
            { label: 'What caused the Silence?', next: 4, flag: 'knows_silence' }
          ]
        },
        {
          speaker: 'The Keeper',
          text: 'Ah, Mara. She remembers more than most. She was here when it happened, you know. The last one to hear the Loom\'s final song.',
          choices: [
            { label: 'What happened?', next: 4, flag: 'knows_silence' },
            { label: 'Can the Loom be restored?', next: 3 }
          ]
        },
        {
          speaker: 'The Keeper',
          text: 'Not restart — re-weave. You need the raw threads: shards of sound, signatures of light. Combine them in the Loom and it remembers. Enough memories, and the Loom awakens fully.',
          choices: [
            { label: 'How many memories?', next: 5 },
          ]
        },
        {
          speaker: 'The Keeper',
          text: 'Something in the deep current shifted. The water carried a frequency that unraveled the weave. All at once, the city\'s stories came undone. People woke up not knowing why they were here.',
          choices: [
            { label: 'That\'s terrifying.', next: 5 }
          ]
        },
        {
          speaker: 'The Keeper',
          text: 'Four woven memories to pass through to the Loom Chamber. That is the threshold. The Loom must feel that someone cares enough to gather what was lost.',
          choices: [{ label: 'I\'ll gather them.', flag: 'keeper_quest', reputation: { keeper: 2 } }]
        }
      ]
    },
    // Collectibles
    {
      id: 'shard_tunnel_drip',
      type: 'shard',
      name: 'Tunnel Drip',
      x: 1000, y: window.innerHeight * 0.68 - 20,
      radius: 40
    },
    {
      id: 'shard_keeper_hum',
      type: 'shard',
      name: 'Keeper's Hum',
      x: 1800, y: window.innerHeight * 0.68 - 20,
      radius: 40
    },
    {
      id: 'sig_fungi_glow',
      type: 'signature',
      name: 'Fungi Glow',
      x: 1400, y: window.innerHeight * 0.68 - 20,
      radius: 40
    },
    {
      id: 'sig_deep_pulse',
      type: 'signature',
      name: 'Deep Pulse',
      x: 2500, y: window.innerHeight * 0.68 - 20,
      radius: 40
    }
  ],

  exitZones: [
    { x: -20, width: 80, target: 'scene02', playerStartX: 2600 },
    // Loom Chamber exit — blocked until 4+ woven memories
    { x: 2920, width: 80, target: 'scene04', playerStartX: 100, requiresMemories: 4 }
  ],

  renderObjects(ctx, W, H, camX, time, state) {
    const groundY = H * 0.68;
    this.groundY = groundY;

    for (const obj of this.interactions) {
      if (obj.type === 'dialogue') obj.y = groundY - 24;
      else obj.y = groundY - 20;
    }

    // Stone ground (darker, rougher than docks)
    ctx.fillStyle = '#100e18';
    ctx.fillRect(0, groundY, W, H - groundY);

    // Stone texture lines
    ctx.strokeStyle = 'rgba(40, 35, 50, 0.4)';
    const plankW = 60;
    const startX = -(camX % plankW);
    for (let x = startX; x < W; x += plankW) {
      ctx.strokeRect(x, groundY, plankW - 2, 10);
    }

    // Ground edge — dim purple glow instead of cyan
    ctx.strokeStyle = `rgba(120, 60, 200, ${0.1 + 0.05 * Math.sin(time * 1.5)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(W, groundY);
    ctx.stroke();
    ctx.lineWidth = 1;

    // Neon signs (dim, underground)
    const signs = [
      { x: 400, text: 'DANGER', color: '#ff3030', flicker: 2.0 },
      { x: 1000, text: 'DEEPER', color: '#a040ff', flicker: 1.5 },
      { x: 1600, text: '◈ ◈ ◈', color: '#30ff80', flicker: 0.8 },
      { x: 2200, text: 'THE LOOM', color: '#00d4ff', flicker: 0.6 },
      { x: 2800, text: '→', color: '#ff8020', flicker: 1.2 },
    ];
    for (const sign of signs) {
      const sx = sign.x - camX;
      if (sx < -100 || sx > W + 100) continue;
      const sy = groundY - 100;
      const flicker = Math.sin(time * sign.flicker * 3) > -0.1 ? 1 : 0.05;
      ctx.save();
      ctx.globalAlpha = flicker * 0.7; // dimmer underground
      ctx.shadowColor = sign.color;
      ctx.shadowBlur = 15;
      ctx.fillStyle = sign.color;
      ctx.font = 'bold 22px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(sign.text, sx, sy);
      ctx.restore();
    }

    // Collectible indicators
    for (const obj of this.interactions) {
      if (obj._collected) continue;
      if (obj.type !== 'shard' && obj.type !== 'signature') continue;
      const sx = obj.x - camX;
      if (sx < -50 || sx > W + 50) continue;
      const sy = groundY - 35;
      const glow = obj.type === 'shard' ? '#ff3090' : '#00d4ff';
      const pulse = 0.4 + 0.3 * Math.sin(time * 3 + obj.x);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.shadowColor = glow;
      ctx.shadowBlur = 15;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = pulse * 0.8;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // NPCs
    const npcs = [
      { x: 600, label: 'Tunnel Dweller', headColor: '#a09888', bodyColor: '#1a2020' },
      { x: 2200, label: 'The Keeper', headColor: '#c0b8d0', bodyColor: '#201838' },
    ];
    for (const npc of npcs) {
      const sx = npc.x - camX;
      if (sx < -50 || sx > W + 50) continue;
      const ny = groundY - 48;
      ctx.fillStyle = npc.bodyColor;
      ctx.fillRect(sx - 12, ny, 24, 48);
      ctx.fillStyle = npc.headColor;
      ctx.fillRect(sx - 7, ny - 14, 14, 14);
      // The Keeper has a cyan+purple glow
      if (npc.label === 'The Keeper') {
        ctx.save();
        ctx.shadowColor = '#00d4ff';
        ctx.shadowBlur = 20;
        ctx.strokeStyle = `rgba(0, 200, 255, ${0.25 + 0.15 * Math.sin(time * 1.8)})`;
        ctx.strokeRect(sx - 14, ny - 16, 28, 66);
        ctx.shadowColor = '#a040ff';
        ctx.strokeStyle = `rgba(160, 64, 255, ${0.2 + 0.1 * Math.sin(time * 2.2)})`;
        ctx.strokeRect(sx - 16, ny - 18, 32, 70);
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(200, 200, 220, 0.3)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(npc.label, sx, ny - 20);
    }

    // Blocked door indicator at right edge
    const doorX = 2900 - camX;
    if (doorX > -50 && doorX < W + 50) {
      const wovenCount = (state.wovenMemories || []).length;
      const unlocked = wovenCount >= 4;
      ctx.save();
      // Door frame
      ctx.fillStyle = unlocked ? '#0a2020' : '#1a0a0a';
      ctx.fillRect(doorX - 20, groundY - 80, 40, 80);
      // Glow
      const doorColor = unlocked ? '#00d4ff' : '#ff3030';
      ctx.shadowColor = doorColor;
      ctx.shadowBlur = 15;
      ctx.strokeStyle = doorColor;
      ctx.strokeRect(doorX - 20, groundY - 80, 40, 80);
      // Label
      ctx.fillStyle = doorColor;
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.globalAlpha = 0.6 + 0.2 * Math.sin(time * 2);
      ctx.fillText(unlocked ? 'ENTER' : 'LOCKED', doorX, groundY - 85);
      ctx.restore();
    }
  },

  onEnter(state) {
    state.location = 'tunnels';
  }
};
