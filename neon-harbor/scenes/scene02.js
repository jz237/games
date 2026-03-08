// Scene 02: The Fish Market — East end of the harbor
const Scene02 = {
  name: 'Fish Market',
  width: 2800,
  groundY: null,
  playerStart: { x: 80, y: 0 },

  get groundYCalc() { return window.innerHeight * 0.62; },

  layers: [
    // Far — hazy skyline with tall smokestacks
    {
      render(ctx, W, H, camX, time) {
        const offset = camX * 0.04;
        const baseY = H * 0.22;
        ctx.fillStyle = '#0e0820';
        const stacks = [
          [80, 160], [180, 130], [300, 190], [420, 110], [550, 170],
          [680, 140], [800, 200], [920, 100], [1050, 155]
        ];
        for (const [bx, bh] of stacks) {
          const sx = ((bx * 3 - offset) % (W + 500)) - 150;
          ctx.fillRect(sx, baseY + (200 - bh), 30, bh);
          // Smoke
          const smokeAlpha = 0.04 + 0.02 * Math.sin(time * 0.4 + bx);
          ctx.fillStyle = `rgba(120, 130, 160, ${smokeAlpha})`;
          for (let s = 0; s < 3; s++) {
            const drift = Math.sin(time * 0.6 + bx + s) * 15;
            ctx.beginPath();
            ctx.arc(sx + 15 + drift, baseY + (200 - bh) - 10 - s * 20, 12 + s * 5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = '#0e0820';
        }
      }
    },
    // Mid — market stall frames and hanging lanterns
    {
      render(ctx, W, H, camX, time) {
        const offset = camX * 0.2;
        const groundY = window.innerHeight * 0.62;
        // Stall poles
        ctx.strokeStyle = 'rgba(80, 60, 50, 0.7)';
        ctx.lineWidth = 3;
        for (let i = 0; i < 8; i++) {
          const px = (200 + i * 350 - offset);
          if (px < -50 || px > W + 50) continue;
          ctx.beginPath();
          ctx.moveTo(px, groundY);
          ctx.lineTo(px, groundY - 140);
          ctx.lineTo(px + 120, groundY - 140);
          ctx.lineTo(px + 120, groundY);
          ctx.stroke();
          // Tarp
          ctx.fillStyle = `rgba(${40 + i * 15}, 20, 40, 0.5)`;
          ctx.fillRect(px, groundY - 140, 120, 10);
          // Hanging lantern
          const lanternColor = i % 3 === 0 ? '#ff3090' : i % 3 === 1 ? '#ff8020' : '#a040ff';
          const pulse = 0.4 + 0.3 * Math.sin(time * 2 + i * 1.7);
          ctx.save();
          ctx.shadowColor = lanternColor;
          ctx.shadowBlur = 12;
          ctx.fillStyle = lanternColor;
          ctx.globalAlpha = pulse;
          ctx.beginPath();
          ctx.arc(px + 60, groundY - 125, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.lineWidth = 1;
      }
    },
    // Near — fish crates, ice boxes, nets
    {
      render(ctx, W, H, camX, time) {
        const offset = camX * 0.45;
        const groundY = window.innerHeight * 0.62;
        const crates = [
          { x: 250, w: 50, h: 30, color: '#1e2a35' },
          { x: 500, w: 35, h: 22, color: '#22303a' },
          { x: 780, w: 45, h: 35, color: '#1e2a35' },
          { x: 1050, w: 40, h: 28, color: '#283540' },
          { x: 1400, w: 55, h: 32, color: '#22303a' },
          { x: 1750, w: 38, h: 26, color: '#1e2a35' },
          { x: 2100, w: 48, h: 34, color: '#283540' },
          { x: 2400, w: 42, h: 30, color: '#22303a' },
        ];
        for (const c of crates) {
          const sx = c.x - offset;
          if (sx > -60 && sx < W + 60) {
            ctx.fillStyle = c.color;
            ctx.fillRect(sx, groundY - c.h, c.w, c.h);
            // Ice sheen
            ctx.fillStyle = `rgba(160, 220, 255, ${0.05 + 0.03 * Math.sin(time + c.x)})`;
            ctx.fillRect(sx + 3, groundY - c.h + 2, c.w - 6, 4);
          }
        }

        // Hanging nets
        ctx.strokeStyle = 'rgba(60, 80, 70, 0.3)';
        for (let n = 0; n < 4; n++) {
          const nx = 350 + n * 600 - offset;
          if (nx < -100 || nx > W + 100) continue;
          for (let j = 0; j < 5; j++) {
            ctx.beginPath();
            ctx.moveTo(nx + j * 15, groundY - 100);
            ctx.quadraticCurveTo(nx + j * 15 + 7, groundY - 70 + Math.sin(time + n + j) * 3, nx + j * 15 + 15, groundY - 100);
            ctx.stroke();
          }
        }
      }
    }
  ],

  interactions: [
    // Mara — key NPC
    {
      id: 'mara_fishmarket',
      type: 'dialogue',
      x: 800, y: window.innerHeight * 0.62 - 24,
      radius: 60,
      dialogue: [
        {
          speaker: 'Mara',
          text: 'Ah... you have the look. The look of someone who can hear the city breathing. Most people forgot how to listen.',
          choices: [
            { label: 'The dock worker mentioned you.', next: 1, flag: 'spoke_to_mara' },
            { label: 'I\'ve been collecting strange lights...', next: 2, flag: 'spoke_to_mara' },
            { label: 'Who are you?', next: 3 }
          ]
        },
        {
          speaker: 'Mara',
          text: 'Hah, that old worrier. He thinks the signs are broken. They\'re not broken — they\'re waking up. Every flicker is a fragment of something the city buried long ago.',
          choices: [
            { label: 'What did the city bury?', next: 4 },
            { label: 'How do you know all this?', next: 3 }
          ]
        },
        {
          speaker: 'Mara',
          text: 'Light signatures — yes! You can see them too. Most walk right past. Those fragments... they\'re pieces of the old Loom\'s output. Memories, frozen in photons.',
          choices: [
            { label: 'The Loom? Someone else mentioned that.', next: 4, flag: 'heard_loom' },
            { label: 'What happens if I collect enough?', next: 5 }
          ]
        },
        {
          speaker: 'Mara',
          text: 'I\'m Mara. I\'ve sold fish at this market for forty years. But more importantly, I\'ve watched the harbor change. I remember what it was before.',
          choices: [
            { label: 'Before what?', next: 4 },
          ]
        },
        {
          speaker: 'Mara',
          text: 'Before the Silence. One night, the city just... stopped remembering. The old songs, the stories, the reasons we built here. All gone. Only the Loom kept running, weaving memories into light nobody could read.',
          choices: [
            { label: 'Can the memories be restored?', next: 5 },
            { label: 'Why can I see them?', next: 6, reputation: { mara: 1 } }
          ]
        },
        {
          speaker: 'Mara',
          text: 'If someone gathers enough shards and signatures — sound and light — the Loom might be able to re-weave them. But you\'d need to find the Loom first. It\'s deep below the harbor.',
          choices: [
            { label: 'I\'ll find it.', flag: 'quest_loom', reputation: { mara: 2 } },
          ]
        },
        {
          speaker: 'Mara',
          text: 'That... is the question, isn\'t it? Maybe the city chose you. Or maybe you\'re just the first person to actually pay attention in a long, long time. Either way — keep collecting. Come back when you have more.',
          choices: []
        }
      ]
    },
    // Market vendor NPC
    {
      id: 'vendor_fish',
      type: 'dialogue',
      x: 1600, y: window.innerHeight * 0.62 - 24,
      radius: 60,
      dialogue: [
        {
          speaker: 'Fish Vendor',
          text: 'Fresh catch! Well... "fresh." Nothing\'s really fresh since the deep currents shifted. The bioluminescent ones taste different now. Like static.',
          choices: [
            { label: 'Static? In fish?', next: 1 },
            { label: 'Sounds unappetizing.', next: 2 }
          ]
        },
        {
          speaker: 'Fish Vendor',
          text: 'I know how it sounds. But bite into one and you\'ll hear it — a hum. Low, steady. Like machinery. Mara says the Loom is leaking into the water.',
          choices: [{ label: 'Interesting...', reputation: { market: 1 } }]
        },
        {
          speaker: 'Fish Vendor',
          text: 'Hey, I don\'t make the fish, I just sell \'em. Take it or leave it, stranger.',
          choices: []
        }
      ]
    },
    // Collectibles for Scene02
    {
      id: 'shard_market_chime',
      type: 'shard',
      name: 'Market Chime',
      x: 1200, y: window.innerHeight * 0.62 - 20,
      radius: 40
    },
    {
      id: 'shard_vendor_call',
      type: 'shard',
      name: 'Vendor\'s Call',
      x: 2200, y: window.innerHeight * 0.62 - 20,
      radius: 40
    },
    {
      id: 'sig_amber_market',
      type: 'signature',
      name: 'Market Amber',
      x: 400, y: window.innerHeight * 0.62 - 20,
      radius: 40
    },
    {
      id: 'sig_violet_lantern',
      type: 'signature',
      name: 'Lantern Violet',
      x: 1900, y: window.innerHeight * 0.62 - 20,
      radius: 40
    }
  ],

  exitZones: [
    { x: -20, width: 80, target: 'scene01', playerStartX: 2200 }, // back to docks
  ],

  renderObjects(ctx, W, H, camX, time, state) {
    const groundY = H * 0.62;
    this.groundY = groundY;

    // Update interaction Y positions on resize
    for (const obj of this.interactions) {
      if (obj.type === 'dialogue') obj.y = groundY - 24;
      else obj.y = groundY - 20;
    }

    // Neon signs
    const signs = [
      { x: 200, text: 'FRESH CATCH', color: '#ff8020', flicker: 0.7 },
      { x: 650, text: 'MARA\'S', color: '#a040ff', flicker: 1.1 },
      { x: 1100, text: 'ICE HOUSE', color: '#00d4ff', flicker: 0.9 },
      { x: 1550, text: 'DEEP FRY', color: '#ff3090', flicker: 1.3 },
      { x: 2000, text: 'NIGHT MARKET', color: '#40ff90', flicker: 0.5 },
      { x: 2500, text: '← DOCKS', color: '#00d4ff', flicker: 0.8 },
    ];

    for (const sign of signs) {
      const sx = sign.x - camX;
      if (sx < -150 || sx > W + 150) continue;
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
      ctx.globalAlpha = pulse * 0.8;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // NPCs
    const npcs = [
      { x: 800, label: 'Mara', headColor: '#c0a090', bodyColor: '#3a1848' },
      { x: 1600, label: 'Fish Vendor', headColor: '#b8a898', bodyColor: '#2a3040' },
    ];
    for (const npc of npcs) {
      const sx = npc.x - camX;
      if (sx < -50 || sx > W + 50) continue;
      const ny = groundY - 48;
      ctx.fillStyle = npc.bodyColor;
      ctx.fillRect(sx - 12, ny, 24, 48);
      ctx.fillStyle = npc.headColor;
      ctx.fillRect(sx - 7, ny - 14, 14, 14);
      // Mara has a distinctive purple glow
      if (npc.label === 'Mara') {
        ctx.save();
        ctx.shadowColor = '#a040ff';
        ctx.shadowBlur = 15;
        ctx.strokeStyle = `rgba(160, 64, 255, ${0.3 + 0.15 * Math.sin(time * 2)})`;
        ctx.strokeRect(sx - 14, ny - 16, 28, 66);
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(200, 200, 220, 0.3)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(npc.label, sx, ny - 20);
    }

    // Rain effect for fish market atmosphere
    ctx.fillStyle = 'rgba(100, 160, 255, 0.15)';
    for (let i = 0; i < 60; i++) {
      const rx = ((i * 4799 + time * 200) % W);
      const ry = ((i * 7127 + time * 400) % (groundY + 20));
      ctx.fillRect(rx, ry, 1, 6);
    }
  },

  onEnter(state) {
    state.location = 'fish_market';
  }
};
