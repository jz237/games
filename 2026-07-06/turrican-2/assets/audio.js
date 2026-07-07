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
    function blip(freq, dur, type, vol, slideTo, dest) {
      if (!ctx || muted) return;
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = type || 'square'; o.frequency.value = freq;
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(vol || 0.3, ctx.currentTime + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      o.connect(g); g.connect(dest || sfxGain); o.start(); o.stop(ctx.currentTime + dur + 0.02);
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
    };
    function play(name) { if (!sfxOn || muted) return; ensure(); const f = SFX[name]; if (f) f(); }

    // ---- MUSIC (original looping sequences per world) --------------------
    // Simple two-voice driving arpeggio + bass. Original note patterns.
    const SCALE = { 1: [0, 3, 5, 7, 10], 2: [0, 2, 3, 7, 8], 3: [0, 4, 7, 9, 11], 4: [0, 2, 5, 7, 9], 5: [0, 1, 5, 6, 8] };
    const ROOT = { 1: 220, 2: 196, 3: 262, 4: 174, 5: 165 };
    function midi(root, semi) { return root * Math.pow(2, semi / 12); }

    function startMusic(world) {
      ensure(); if (!ctx) return;
      curWorld = world || 1;
      stopMusic();
      if (!musicOn || muted) return;
      const scale = SCALE[curWorld] || SCALE[1];
      const root = ROOT[curWorld] || 220;
      let step = 0;
      const tempo = 0.14; // seconds per 8th note
      seq = () => {
        if (!ctx || !musicOn || muted) return;
        const beat = step % 16;
        // bass every 4 steps
        if (beat % 4 === 0) {
          const bn = midi(root / 2, scale[(Math.floor(step / 4)) % scale.length]);
          blip(bn, 0.28, 'triangle', 0.28, null, musicGain);
        }
        // arpeggio
        const an = midi(root, scale[step % scale.length] + (beat >= 8 ? 12 : 0));
        blip(an, 0.12, 'square', 0.13, null, musicGain);
        // sparkle lead accent
        if (beat === 6 || beat === 14) blip(midi(root * 2, scale[(step) % scale.length]), 0.1, 'sine', 0.09, null, musicGain);
        step++;
        seqTimer = setTimeout(seq, tempo * 1000);
      };
      seq();
    }
    function stopMusic() { if (seqTimer) { clearTimeout(seqTimer); seqTimer = null; } }

    function toggleMute() { muted = !muted; if (muted) stopMusic(); else startMusic(curWorld); return muted; }
    function setMusic(on) { musicOn = on; if (!on) stopMusic(); else startMusic(curWorld); }
    function setSfx(on) { sfxOn = on; }

    return { resume, play, startMusic, stopMusic, toggleMute, setMusic, setSfx,
      get muted() { return muted; }, ensure };
  }

  return { createAudio };
});
