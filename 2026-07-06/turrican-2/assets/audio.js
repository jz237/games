/* Turrican II — Redux : audio.js
 * Original WebAudio synth (SFX + looping music). No external/copyrighted audio.
 * Driving melodic-chiptune spirit; all melodies are original.
 */
(function (root, factory) { root.TAudio = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createAudio() {
    let ctx = null, master = null, musicGain = null, sfxGain = null;
    let musicOn = true, sfxOn = true, muted = false;
    let seq = null, seqTimer = null, curWorld = 1;

    function ensure() {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.32; musicGain.connect(master);
      sfxGain = ctx.createGain(); sfxGain.gain.value = 0.5; sfxGain.connect(master);
    }
    function resume() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); }

    // ---- one-shot synth voice --------------------------------------------
    function blip(freq, dur, type, vol, slideTo, dest, when) {
      if (!ctx || muted) return;
      const t0 = when != null ? when : ctx.currentTime;
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = type || 'square'; o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(dest || sfxGain); o.start(t0); o.stop(t0 + dur + 0.02);
    }
    function noise(dur, vol, filterFreq) {
      if (!ctx || muted) return;
      const n = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
      const g = ctx.createGain(); g.gain.value = vol || 0.3;
      src.connect(f); f.connect(g); g.connect(sfxGain); src.start();
    }

    // ---- SFX --------------------------------------------------------------
    const SFX = {
      shoot: () => blip(680, 0.08, 'square', 0.16, 340),
      eshoot: () => blip(300, 0.12, 'sawtooth', 0.14, 160),
      beam: () => blip(900 + Math.random() * 200, 0.05, 'sawtooth', 0.06, 700),
      jump: () => blip(320, 0.16, 'square', 0.2, 640),
      morph: () => { blip(200, 0.2, 'sawtooth', 0.2, 900); noise(0.15, 0.1, 2000); },
      explode: () => { noise(0.35, 0.4, 900); blip(120, 0.3, 'sawtooth', 0.2, 40); },
      hit: () => blip(160, 0.2, 'square', 0.25, 60),
      gem: () => blip(1200, 0.09, 'sine', 0.18, 1600),
      power: () => { blip(600, 0.1, 'square', 0.2, 900); setTimeout(() => blip(900, 0.12, 'square', 0.2, 1300), 90); },
      die: () => { blip(400, 0.6, 'sawtooth', 0.3, 60); noise(0.5, 0.3, 600); },
      bomb: () => { noise(0.6, 0.5, 1600); blip(80, 0.5, 'sawtooth', 0.3, 30); },
      line: () => blip(500, 0.25, 'sawtooth', 0.2, 1200),
      complete: () => [0, 1, 2, 3].forEach((i) => setTimeout(() => blip([523, 659, 784, 1047][i], 0.2, 'square', 0.22), i * 120)),
      gameover: () => [0, 1, 2].forEach((i) => setTimeout(() => blip([392, 330, 262][i], 0.4, 'sawtooth', 0.25), i * 220)),
      crate: () => { noise(0.14, 0.22, 2200); blip(360, 0.08, 'square', 0.14, 140); },
      flame: () => noise(0.3, 0.2, 900),
      splash: () => { noise(0.25, 0.3, 1400); blip(300, 0.15, 'sine', 0.12, 90); },
      land: () => { noise(0.12, 0.25, 480); blip(90, 0.1, 'sine', 0.18, 55); },
      tick: () => blip(1050, 0.07, 'square', 0.15, 900),
      checkpoint: () => [0, 1].forEach((i) => setTimeout(() => blip(700 + i * 260, 0.14, 'square', 0.2), i * 100)),
      hatch: () => { blip(900, 0.12, 'sine', 0.15, 300); noise(0.1, 0.15, 3000); },
      // boss suite
      warning: () => [0, 1, 2, 3].forEach((i) => setTimeout(() => blip(i % 2 ? 620 : 470, 0.22, 'sawtooth', 0.3), i * 240)),
      tele: () => blip(180, 0.3, 'sawtooth', 0.18, 420),
      stomp: () => { noise(0.3, 0.5, 500); blip(70, 0.35, 'sine', 0.4, 34); },
      dash: () => blip(240, 0.35, 'sawtooth', 0.22, 700),
      spawn: () => { blip(520, 0.2, 'square', 0.18, 260); noise(0.12, 0.12, 3000); },
      clink: () => blip(1500 + Math.random() * 500, 0.04, 'square', 0.08, 900),
      bosshit: () => { blip(300, 0.09, 'square', 0.22, 140); noise(0.06, 0.12, 2400); },
      coreopen: () => [0, 1].forEach((i) => setTimeout(() => blip(880 + i * 220, 0.14, 'sine', 0.2), i * 90)),
      phase: () => { noise(0.5, 0.45, 1100); blip(200, 0.5, 'sawtooth', 0.3, 60); },
      bossdie: () => { noise(0.9, 0.6, 700); [0, 1, 2, 3, 4].forEach((i) => setTimeout(() => { noise(0.4, 0.4, 900 - i * 120); blip(160 - i * 20, 0.35, 'sawtooth', 0.25, 40); }, i * 180)); },
      victory: () => [0, 1, 2, 3, 4, 5, 6].forEach((i) => setTimeout(() =>
        blip([392, 494, 587, 784, 587, 784, 988][i], i >= 5 ? 0.5 : 0.18, 'square', 0.22), i * 150)),
    };
    function play(name) { if (!sfxOn || muted) return; ensure(); const f = SFX[name]; if (f) f(); }

    // ---- MUSIC ---------------------------------------------------------
    // Original per-world compositions in the spirit of SPEC §6, played by a
    // WebAudio-clock lookahead scheduler (no setTimeout drift, survives
    // background-tab throttling far better).
    //
    // Pattern format: 16th-note steps. Numbers are semitone offsets from the
    // track root; null = rest. Drums: k kick, s snare, h hat, H open hat.
    function n(root, semi) { return root * Math.pow(2, semi / 12); }
    const TRACKS = {
      title: { // anthemic, heroic build
        bpm: 116, root: 196, bassType: 'triangle', leadType: 'square',
        bass: [0, null, 0, null, 5, null, 5, null, 7, null, 7, null, 5, null, 3, null],
        lead: [12, null, null, 7, 12, null, 14, null, 16, null, 14, 12, 14, null, null, null,
               12, null, null, 7, 12, null, 16, null, 19, null, null, 16, 14, 12, 14, null],
        pad: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [5, 9, 12]],
        drums: 'k.h.s.h.k.h.s.hh',
      },
      1: { // desert: adventurous, bright, propulsive
        bpm: 132, root: 220, bassType: 'triangle', leadType: 'square',
        bass: [0, 0, null, 0, null, 0, 3, null, 5, 5, null, 5, 7, null, 3, null],
        lead: [null, null, 12, null, 15, null, 12, null, 17, null, 15, null, 12, null, 10, null,
               null, null, 12, null, 15, null, 19, null, 17, null, 15, null, 12, 10, 12, null],
        pad: [[0, 3, 7], [0, 3, 7], [5, 8, 12], [7, 10, 14]],
        drums: 'k.h.s.h.k.hks.h.',
      },
      2: { // submerged: dark, echoey, mysterious
        bpm: 96, root: 174, bassType: 'sine', leadType: 'sine',
        bass: [0, null, null, null, null, null, 3, null, null, null, 2, null, null, null, null, null],
        lead: [12, null, null, null, 15, null, null, null, null, null, 14, null, null, null, 10, null,
               12, null, null, null, 17, null, null, null, 15, null, null, null, null, null, null, null],
        pad: [[0, 3, 7], [0, 2, 7], [-2, 3, 7], [0, 3, 8]],
        drums: 'k.......k...s...',
        echo: true,
      },
      3: { // corridor: relentless fast arpeggios
        bpm: 152, root: 262, bassType: 'sawtooth', leadType: 'square',
        bass: [0, 0, 0, 0, -2, -2, -2, -2, -4, -4, -4, -4, -2, -2, -2, -2],
        lead: [0, 4, 7, 12, 7, 4, 0, 4, 7, 12, 16, 12, 7, 4, 7, 12,
               -2, 2, 5, 10, 5, 2, -2, 2, 5, 10, 14, 10, 5, 2, 5, 10],
        pad: null,
        drums: 'k.hhs.hhk.hhs.hh',
      },
      4: { // factory: mechanical, metallic groove
        bpm: 120, root: 174, bassType: 'sawtooth', leadType: 'square',
        bass: [0, null, 0, 0, null, 0, null, 3, 0, null, 0, 0, null, 5, 3, null],
        lead: [null, null, null, null, 12, null, null, 10, null, null, 12, null, null, null, 15, null,
               null, null, null, null, 12, null, null, 10, null, null, 8, null, 10, null, null, null],
        pad: [[0, 2, 7], [0, 2, 7], [-4, 0, 5], [-2, 2, 7]],
        drums: 'kkh.s.hkk.hks.hH',
      },
      5: { // alien ship: eerie, sparse, heartbeat pulse
        bpm: 88, root: 165, bassType: 'sine', leadType: 'triangle',
        bass: [0, 0, null, null, null, null, null, null, 1, 1, null, null, null, null, null, null],
        lead: [null, null, null, null, 13, null, null, null, null, null, null, 12, null, null, null, null,
               null, null, 18, null, null, null, 17, null, null, null, null, null, 13, null, null, null],
        pad: [[0, 1, 7], [0, 1, 6], [0, 1, 7], [-1, 5, 6]],
        drums: 'kk..............',
        echo: true,
      },
      boss: { // urgent, minor, pounding
        bpm: 144, root: 185, bassType: 'sawtooth', leadType: 'sawtooth',
        bass: [0, 0, null, 0, 0, null, 1, null, 0, 0, null, 0, -2, null, 1, null],
        lead: [12, null, 13, null, 12, null, null, 8, null, null, 12, 13, null, 15, null, 13,
               12, null, 13, null, 16, null, null, 13, null, 12, null, 8, null, null, null, null],
        pad: [[0, 3, 6], [0, 3, 6], [-2, 1, 6], [1, 3, 8]],
        drums: 'k.k.s.k.k.kks.kh',
      },
    };

    let schedTimer = null, curTrack = null, stepIdx = 0, nextTime = 0;

    function playDrum(ch, t) {
      if (ch === 'k') {
        blip(120, 0.16, 'sine', 0.4, 38, musicGain, t);
      } else if (ch === 's') {
        const nb = noiseAt(0.12, 0.2, 2600, t);
        blip(220, 0.08, 'triangle', 0.12, 110, musicGain, t);
      } else if (ch === 'h') {
        noiseAt(0.04, 0.08, 7000, t);
      } else if (ch === 'H') {
        noiseAt(0.14, 0.08, 6500, t);
      }
    }
    function noiseAt(dur, vol, filterFreq, when) {
      if (!ctx || muted) return;
      const t0 = when != null ? when : ctx.currentTime;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = filterFreq > 4000 ? 'highpass' : 'lowpass';
      f.frequency.value = filterFreq;
      const g = ctx.createGain(); g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(musicGain); src.start(t0);
    }

    function scheduleStep(tr, i, t) {
      const b16 = i % 16;
      const stepDur = 60 / tr.bpm / 4;
      // bass
      const bnote = tr.bass[b16];
      if (bnote != null) blip(n(tr.root / 2, bnote), stepDur * 1.8, tr.bassType, 0.3, null, musicGain, t);
      // lead (32-step phrase)
      const lnote = tr.lead[i % tr.lead.length];
      if (lnote != null) {
        blip(n(tr.root, lnote), stepDur * 1.4, tr.leadType, 0.14, null, musicGain, t);
        if (tr.echo) blip(n(tr.root, lnote), stepDur * 1.2, tr.leadType, 0.05, null, musicGain, t + stepDur * 3);
      }
      // pad chord (once per bar)
      if (tr.pad && b16 === 0) {
        const chord = tr.pad[Math.floor(i / 16) % tr.pad.length];
        for (const c of chord) blip(n(tr.root, c), stepDur * 15, 'triangle', 0.045, null, musicGain, t);
      }
      // drums
      const ch = tr.drums[b16];
      if (ch && ch !== '.') playDrum(ch, t);
    }

    function startMusic(trackId) {
      ensure(); if (!ctx) return;
      curWorld = trackId || 1;
      stopMusic();
      if (!musicOn || muted) return;
      curTrack = TRACKS[trackId] || TRACKS[1];
      stepIdx = 0;
      nextTime = ctx.currentTime + 0.08;
      schedTimer = setInterval(() => {
        if (!ctx || !musicOn || muted || !curTrack) return;
        const stepDur = 60 / curTrack.bpm / 4;
        while (nextTime < ctx.currentTime + 0.18) {
          scheduleStep(curTrack, stepIdx, nextTime);
          nextTime += stepDur;
          stepIdx++;
        }
      }, 45);
    }
    function stopMusic() {
      if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
      if (seqTimer) { clearTimeout(seqTimer); seqTimer = null; }
      curTrack = null;
    }

    // duck music briefly under big impacts
    let musicBase = 0.32;
    function duck(amount, secs) {
      if (!ctx || !musicGain) return;
      const g = musicGain.gain;
      g.cancelScheduledValues(ctx.currentTime);
      g.setValueAtTime(Math.max(0.02, musicBase * amount), ctx.currentTime);
      g.setTargetAtTime(musicBase, ctx.currentTime + (secs || 0.25), 0.3);
    }

    // ---- VOICE (event pools with variants, no immediate repeats) ----------
    // Quality bar: every noticeable event gets its own pooled callouts.
    const VO_LINES = {
      start: ['Mission start. Move out, soldier.', 'Drop zone reached. Good hunting.'],
      clear: ['Sector cleared. Advance.', 'Objective complete. Well done.', 'Zone secure. Push forward.'],
      bosswarn: ['Warning! Massive hostile inbound.', 'Guardian signature detected. Stand your ground.', 'Big one coming. Weapons hot.'],
      bossdown: ['Target destroyed. Outstanding work.', 'Guardian eliminated. The route is open.', "Direct hit! It's down."],
      oneup: ['Extra life secured.', 'Reinforcements credited.'],
      lowenergy: ['Armor critical. Find energy, now!', 'Warning: energy reserves failing.'],
      lowtime: ["Clock's running out. Hurry!", 'Time critical. Move it, soldier.'],
      weapon: ['Firepower enhanced.', 'Weapon systems upgraded.', "Now you're packing heat."],
      death: ['Soldier down... get back up.', "You're hit! Recover and re-engage."],
      gameover: ['Mission failed. The Machine prevails... for now.', "We've lost contact. Landorin falls."],
      victory: ['The Machine is destroyed. Landorin is free. Magnificent work, soldier.'],
      shmup: ['Fighter systems online. Punch it!', "You've got the ship. Fly hard."],
      freeze: ['Cryo burst deployed.'],
    };
    let voiceOn = true, voiceVol = 0.9, lastVoiceAt = 0, curVoice = null, toastCb = null;
    const lastVoiceIdx = {};
    function playVoice(name, priority) {
      if (!voiceOn || muted) return;
      const lines = VO_LINES[name]; if (!lines) return;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (!priority && now - lastVoiceAt < 1600) return;
      if (priority && curVoice && !curVoice.paused) { try { curVoice.pause(); } catch (e) {} }
      else if (curVoice && !curVoice.paused && !priority) return;
      let i = Math.floor(Math.random() * lines.length);
      if (lines.length > 1 && i === lastVoiceIdx[name]) i = (i + 1) % lines.length;
      lastVoiceIdx[name] = i;
      lastVoiceAt = now;
      const a = new Audio(`assets/audio/vo-${name}-${i}.mp3`);
      a.volume = voiceVol;
      a.play().catch(() => {});
      curVoice = a;
      if (toastCb) toastCb(lines[i]);
    }
    function setVoice(on) { voiceOn = on; }
    function setVoiceLevel(v) { voiceVol = 0.9 * v; }
    function onVoiceToast(cb) { toastCb = cb; }

    function toggleMute() { muted = !muted; if (muted) stopMusic(); else startMusic(curWorld); return muted; }
    function setMusic(on) { musicOn = on; if (!on) stopMusic(); else startMusic(curWorld); }
    function setSfx(on) { sfxOn = on; }
    function setLevels(music, sfx) {
      ensure(); if (!ctx) return;
      musicBase = 0.32 * music;
      if (musicGain) musicGain.gain.value = musicBase;
      if (sfxGain) sfxGain.gain.value = 0.5 * sfx;
    }

    return { resume, play, startMusic, stopMusic, toggleMute, setMusic, setSfx, setLevels, duck,
      playVoice, setVoice, setVoiceLevel, onVoiceToast,
      get muted() { return muted; }, ensure };
  }

  return { createAudio };
});
