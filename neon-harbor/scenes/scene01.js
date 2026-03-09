// Scene 01: The Docks — Opening scene
const Scene01 = {
  _id: 'scene01',
  name: 'The Docks',
  width: 2400,
  groundY: null, // set dynamically
  playerStart: { x: 100, y: 0 },

  get groundYCalc() { return window.innerHeight * 0.62; },

  layers: [
    // Far city skyline
    {
      render(ctx, W, H, camX, time) {
        const offset = camX * 0.05;
        const baseY = H * 0.25;
        ctx.fillStyle = '#0d0d25';
        // Buildings silhouette
        const buildings = [
          [60, 120], [100, 80], [140, 150], [200, 100], [250, 180],
          [320, 90], [370, 130], [430, 160], [500, 70], [560, 140],
          [640, 110], [710, 170], [780, 95], [850, 145], [940, 120]
        ];
        for (const [bx, bh] of buildings) {
          const sx = ((bx * 3 - offset) % (W + 400)) - 100;
          ctx.fillRect(sx, baseY + (180 - bh), 40, bh);
          // Window lights
          ctx.fillStyle = `rgba(255, 200, 100, ${0.15 + 0.1 * Math.sin(time * 0.3 + bx)})`;
          for (let wy = baseY + (180 - bh) + 10; wy < baseY + 170; wy += 18) {
            for (let wx = sx + 6; wx < sx + 36; wx += 12) {
              if (Math.sin(bx + wy + wx) > 0.2) ctx.fillRect(wx, wy, 4, 6);
            }
          }
          ctx.fillStyle = '#0d0d25';
        }
      }
    },
    // Mid-distance cranes and structures
    {
      render(ctx, W, H, camX, time) {
        const offset = camX * 0.15;
        ctx.strokeStyle = 'rgba(40, 50, 80, 0.6)';
        ctx.lineWidth = 2;
        // Cranes
        for (let i = 0; i < 3; i++) {
          const cx = (300 + i * 500 - offset) % (W + 300) - 100;
          const cy = H * 0.3;
          ctx.beginPath();
          ctx.moveTo(cx, cy + 200);
          ctx.lineTo(cx, cy);
          ctx.lineTo(cx + 80, cy);
          ctx.moveTo(cx + 80, cy);
          ctx.lineTo(cx + 75, cy + 30);
          ctx.stroke();
          // Blinking light
          if (Math.sin(time * 2 + i) > 0.7) {
            ctx.fillStyle = '#ff3030';
            ctx.beginPath();
            ctx.arc(cx, cy - 3, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.lineWidth = 1;
      }
    },
    // Near dock structures
    {
      render(ctx, W, H, camX, time) {
        const offset = camX * 0.4;
        const groundY = window.innerHeight * 0.62;

        // Crates and barrels
        const objects = [
          { x: 400, w: 40, h: 35, color: '#2a1f15' },
          { x: 420, w: 30, h: 25, color: '#1f1a12' },
          { x: 700, w: 50, h: 30, color: '#25201a' },
          { x: 1100, w: 35, h: 40, color: '#2a1f15' },
          { x: 1500, w: 45, h: 28, color: '#1f1a12' },
          { x: 1900, w: 38, h: 35, color: '#25201a' },
        ];
        for (const obj of objects) {
          const sx = obj.x - offset;
          if (sx > -60 && sx < W + 60) {
            ctx.fillStyle = obj.color;
            ctx.fillRect(sx, groundY - obj.h, obj.w, obj.h);
          }
        }
      }
    }
  ],

  interactions: [
    {
      id: 'dock_worker_1',
      type: 'dialogue',
      x: 500, y: window.innerHeight * 0.62 - 24,
      radius: 60,
      dialogue: [
        {
          speaker: 'Dock Worker',
          text: 'You\'re new around here, aren\'t you? The harbor hasn\'t seen a fresh face in months. Not since the lights started changing.',
          choices: [
            { label: 'What do you mean, "changing"?', next: 1 },
            { label: 'I\'m just passing through.', next: 2, reputation: { docks: -1 } }
          ]
        },
        {
          speaker: 'Dock Worker',
          text: 'The neon signs... they flicker different now. Patterns. Like they\'re trying to say something. Old Mara at the fish market — she says they\'re memories. Memories the city forgot.',
          choices: [
            { label: 'Where can I find Mara?', next: 3, flag: 'knows_mara' },
            { label: 'Sounds like faulty wiring to me.', next: 4, reputation: { docks: -1 } }
          ]
        },
        {
          speaker: 'Dock Worker',
          text: 'Passing through, sure. That\'s what the last one said too. Good luck with that.',
          choices: []
        },
        {
          speaker: 'Dock Worker',
          text: 'The fish market, east end of the docks. But she only talks after sundown — well, I guess it\'s always sundown now, isn\'t it? Go on, find her. She\'ll want to see you.',
          choices: []
        },
        {
          speaker: 'Dock Worker',
          text: 'Ha! That\'s what the engineers said before they disappeared. Your call, stranger.',
          choices: []
        }
      ]
    },
    {
      id: 'shard_dock_ambient',
      type: 'shard',
      name: 'Harbor Bells',
      x: 900, y: window.innerHeight * 0.62 - 20,
      radius: 40
    },
    {
      id: 'sig_cyan_dock',
      type: 'signature',
      name: 'Tidal Cyan',
      x: 1400, y: window.innerHeight * 0.62 - 20,
      radius: 40
    },
    {
      id: 'shard_fog_horn',
      type: 'shard',
      name: 'Fog Horn Echo',
      x: 2000, y: window.innerHeight * 0.62 - 20,
      radius: 40
    },
    {
      id: 'sig_rose_dock',
      type: 'signature',
      name: 'Docklight Rose',
      x: 600, y: window.innerHeight * 0.62 - 20,
      radius: 40
    },
    {
      id: 'dock_worker_2',
      type: 'dialogue',
      x: 1800, y: window.innerHeight * 0.62 - 24,
      radius: 60,
      dialogue: [
        {
          speaker: 'Old Fisherman',
          text: 'These waters used to glow different, you know. Warm. Like copper and honey. Now it\'s all cold blue. Something changed underneath.',
          choices: [
            { label: 'What\'s underneath?', next: 1 },
            { label: 'It\'s beautiful, though.', next: 2 }
          ]
        },
        {
          speaker: 'Old Fisherman',
          text: 'Nobody knows. The old tunnels run deep — older than the city. Some say there\'s a machine down there. A Loom, they call it. Weaves light and sound into... something.',
          choices: [{ label: 'A Loom...', flag: 'heard_loom' }]
        },
        {
          speaker: 'Old Fisherman',
          text: 'Beautiful? Sure. Like a storm is beautiful. Doesn\'t mean it won\'t drown you. Stay careful out here.',
          choices: []
        }
      ]
    }
  ],

  renderObjects(ctx, W, H, camX, time, state) {
    const groundY = H * 0.62;
    this.groundY = groundY;

    // Update interaction Y positions
    for (const obj of this.interactions) {
      if (obj.type === 'dialogue') obj.y = groundY - 24;
      else obj.y = groundY - 20;
    }

    // Neon signs
    const signs = [
      { x: 300, text: 'HARBOR', color: '#00d4ff', flicker: 0.8 },
      { x: 800, text: 'FISH', color: '#ff3090', flicker: 1.2 },
      { x: 1300, text: 'DEEP', color: '#ff8020', flicker: 0.6 },
      { x: 1700, text: 'LOOM', color: '#a040ff', flicker: 1.5 },
      { x: 2100, text: 'EXIT', color: '#40ff90', flicker: 0.9 },
    ];

    for (const sign of signs) {
      const sx = sign.x - camX;
      if (sx < -100 || sx > W + 100) continue;
      const sy = groundY - 120;
      const flicker = Math.sin(time * sign.flicker * 3) > -0.3 ? 1 : 0.1;

      ctx.save();
      ctx.globalAlpha = flicker;
      ctx.shadowColor = sign.color;
      ctx.shadowBlur = 20;
      ctx.fillStyle = sign.color;
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(sign.text, sx, sy);
      ctx.shadowBlur = 40;
      ctx.globalAlpha = flicker * 0.3;
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
      // Inner white
      ctx.globalAlpha = pulse * 0.8;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // NPCs (simple figures)
    const npcs = [
      { x: 500, label: 'Dock Worker' },
      { x: 1800, label: 'Old Fisherman' },
    ];
    for (const npc of npcs) {
      const sx = npc.x - camX;
      if (sx < -50 || sx > W + 50) continue;
      const ny = groundY - 48;
      // Body
      ctx.fillStyle = '#2a2040';
      ctx.fillRect(sx - 12, ny, 24, 48);
      // Head
      ctx.fillStyle = '#b8a898';
      ctx.fillRect(sx - 7, ny - 14, 14, 14);
      // Name
      ctx.fillStyle = 'rgba(200, 200, 220, 0.3)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(npc.label, sx, ny - 20);
    }
  },

  exitZones: [
    { x: 2300, width: 100, target: 'scene02', playerStartX: 80 }
  ],

  onEnter(state) {
    state.location = 'docks';
  }
};
