/*
 * HD audio layer for Stunt Car Racer — ElevenLabs sound pack driven by the
 * engine's Module._jsXxx state bridge. The WASM engine's own audio output is
 * routed through a controllable bus (muted while HD audio is on) by wrapping
 * AudioContext before source.js loads. ?classic=1 disables everything;
 * the 🔊 button (persisted in localStorage) switches HD audio <-> original.
 */
(function () {
  'use strict';
  if (/[?&]classic=1/.test(location.search)) return;

  var V = '143';
  var LS_KEY = 'scr-hd-audio';
  var hdOn = localStorage.getItem(LS_KEY) !== 'off';

  // ── route every non-HD AudioContext's output through a bus gain ──
  var busMap = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
  var origConnect = AudioNode.prototype.connect;
  function wrapCtor(Name) {
    var Orig = window[Name];
    if (!Orig) return;
    function Wrapped(opts) {
      var ctx = opts !== undefined ? new Orig(opts) : new Orig();
      if (!window.__hdAudioCreating && busMap) {
        try {
          var bus = ctx.createGain();
          bus.__hdIsBus = true;
          bus.gain.value = hdOn ? 0 : 1;
          origConnect.call(bus, ctx.destination);
          busMap.set(ctx, bus);
          engineCtxs.push(ctx);
        } catch (e) { /* leave untouched */ }
      }
      return ctx;
    }
    Wrapped.prototype = Orig.prototype;
    window[Name] = Wrapped;
  }
  var engineCtxs = [];
  AudioNode.prototype.connect = function (target) {
    if (busMap && target && !this.__hdIsBus && this.context &&
        target === this.context.destination && busMap.has(this.context)) {
      return origConnect.call(this, busMap.get(this.context));
    }
    return origConnect.apply(this, arguments);
  };
  wrapCtor('AudioContext');
  wrapCtor('webkitAudioContext');

  function setEngineBus(v) {
    for (var i = 0; i < engineCtxs.length; i++) {
      var bus = busMap.get(engineCtxs[i]);
      if (bus) bus.gain.value = v;
    }
  }

  // ── HD mixer ──
  var ctx = null, master = null, buffers = {}, chans = {}, ready = false;
  var FILES = ['engine-idle', 'engine-high', 'boost', 'air', 'crash', 'wreck', 'land', 'fanfare', 'lost', 'music'];

  function makeCtx() {
    window.__hdAudioCreating = true;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    finally { window.__hdAudioCreating = false; }
    master = ctx.createGain();
    master.gain.value = hdOn ? 1 : 0;
    master.connect(ctx.destination);
  }

  function load(name) {
    return fetch('audio/' + name + '.mp3?v=' + V)
      .then(function (r) { if (!r.ok) throw new Error(name + ' ' + r.status); return r.arrayBuffer(); })
      .then(function (ab) { return ctx.decodeAudioData(ab); })
      .then(function (buf) { buffers[name] = buf; });
  }

  function loopChan(name, gain0) {
    var g = ctx.createGain();
    g.gain.value = gain0;
    g.connect(master);
    var src = ctx.createBufferSource();
    src.buffer = buffers[name];
    src.loop = true;
    src.connect(g);
    src.start();
    return { g: g, src: src };
  }

  function oneShot(name, vol) {
    if (!ready || !buffers[name] || ctx.state !== 'running') return;
    var g = ctx.createGain();
    g.gain.value = vol == null ? 1 : vol;
    g.connect(master);
    var src = ctx.createBufferSource();
    src.buffer = buffers[name];
    src.connect(g);
    src.onended = function () { try { g.disconnect(); } catch (e) {} };
    src.start();
  }

  function startLoops() {
    chans.idle = loopChan('engine-idle', 0);
    chans.high = loopChan('engine-high', 0);
    chans.boost = loopChan('boost', 0);
    chans.air = loopChan('air', 0);
    chans.music = loopChan('music', 0);
  }

  // ── state polling ──
  var M = null;
  function api(fn) {
    try { return M['_js' + fn](); } catch (e) { return 0; }
  }
  var prev = { damage: 0, wrecked: false, finished: false, airborne: false, airSince: 0, crashAt: 0, resultPlayed: false };

  function racingNow() {
    var el = document.getElementById('cockpit-overlay');
    return !!(el && (el.offsetWidth || el.offsetHeight));
  }

  function set(g, v, t) {
    g.gain.setTargetAtTime(v, ctx.currentTime, t || 0.08);
  }

  function tick() {
    if (!ready || !ctx || ctx.state !== 'running') return;
    if (!M && window.Module && window.__scrRuntimeReady) M = window.Module;
    var racing = racingNow();
    var paused = M ? !!api('IsPaused') : false;
    var wrecked = M ? !!api('IsPlayerWrecked') : false;
    var speed = M ? Math.max(0, Math.min(240, api('GetDisplaySpeed'))) : 0;
    var sn = speed / 240;
    var boostOn = M ? !!api('IsBoostActive') : false;
    var touching = M ? !!api('IsTouchingRoad') : true;
    var now = performance.now();

    // music: menus + chooser, fades out for racing
    set(chans.music.g, (!racing && !paused) ? 0.5 : 0, 0.35);

    if (racing && !paused && !wrecked) {
      var drive = Math.min(1, sn * 1.9);
      set(chans.idle.g, 0.5 * (1 - drive) + 0.06, 0.1);
      set(chans.high.g, 0.62 * drive, 0.1);
      chans.high.src.playbackRate.setTargetAtTime(0.7 + 0.85 * sn, ctx.currentTime, 0.1);
      chans.idle.src.playbackRate.setTargetAtTime(0.95 + 0.25 * sn, ctx.currentTime, 0.1);
      set(chans.boost.g, boostOn ? 0.7 : 0, boostOn ? 0.05 : 0.15);

      var airborne = !touching && speed > 20;
      if (airborne && !prev.airborne) prev.airSince = now;
      if (!airborne && prev.airborne && now - prev.airSince > 380) oneShot('land', Math.min(1, 0.35 + sn));
      prev.airborne = airborne;
      set(chans.air.g, airborne ? 0.28 + 0.5 * sn : 0, 0.12);

      var damage = M ? api('GetDamage') : 0;
      if (damage > prev.damage + 2 && now - prev.crashAt > 350) {
        prev.crashAt = now;
        oneShot('crash', Math.min(1, 0.45 + (damage - prev.damage) * 0.04));
      }
      prev.damage = damage;
    } else {
      set(chans.idle.g, 0, 0.2);
      set(chans.high.g, 0, 0.2);
      set(chans.boost.g, 0, 0.1);
      set(chans.air.g, 0, 0.1);
      if (!racing) prev.damage = M ? api('GetDamage') : 0;
    }

    if (wrecked && !prev.wrecked) oneShot('wreck', 0.9);
    prev.wrecked = wrecked;

    var finished = M ? !!api('IsRaceFinished') : false;
    if (finished && !prev.finished && racing && !prev.resultPlayed) {
      prev.resultPlayed = true;
      oneShot(api('IsRaceWon') ? 'fanfare' : 'lost', 0.8);
    }
    if (!finished) prev.resultPlayed = false;
    prev.finished = finished;
  }

  // ── boot ──
  makeCtx();
  Promise.all(FILES.map(load)).then(function () {
    startLoops();
    ready = true;
  }).catch(function (e) { console.error('[hd-audio] load failed', e); });

  function unlock() {
    if (ctx && ctx.state !== 'running') ctx.resume();
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('keydown', unlock, true);
    document.removeEventListener('touchstart', unlock, true);
  }
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
  document.addEventListener('touchstart', unlock, true);
  setInterval(tick, 66);

  // ── toggle button ──
  function addButton() {
    var b = document.createElement('div');
    b.id = 'hd-audio-btn';
    b.textContent = hdOn ? '🔊 HD' : '🔇';
    b.setAttribute('role', 'button');
    b.setAttribute('aria-label', 'Toggle HD audio');
    b.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:200;padding:8px 12px;' +
      'background:rgba(10,14,22,.62);border:1px solid rgba(255,255,255,.3);border-radius:10px;' +
      'color:#f4f7fb;font:600 13px system-ui,sans-serif;cursor:pointer;user-select:none;' +
      '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);opacity:.8;';
    b.addEventListener('click', function () {
      hdOn = !hdOn;
      localStorage.setItem(LS_KEY, hdOn ? 'on' : 'off');
      b.textContent = hdOn ? '🔊 HD' : '🔇';
      if (master) master.gain.value = hdOn ? 1 : 0;
      setEngineBus(hdOn ? 0 : 1);
      if (ctx && ctx.state !== 'running') ctx.resume();
    });
    document.body.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton);
  else addButton();

  // QA hook
  window.__hdAudio = {
    get ctx() { return ctx; },
    get enabled() { return hdOn; },
    get ready() { return ready; },
    levels: function () {
      if (!ready) return null;
      return {
        music: chans.music.g.gain.value,
        idle: chans.idle.g.gain.value,
        high: chans.high.g.gain.value,
        highRate: chans.high.src.playbackRate.value,
        boost: chans.boost.g.gain.value,
        air: chans.air.g.gain.value,
        master: master.gain.value,
        state: ctx.state,
        engineCtxs: engineCtxs.length,
      };
    },
  };
})();
