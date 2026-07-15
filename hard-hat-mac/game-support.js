(function (global) {
  'use strict';

  const textEncoder = typeof TextEncoder === 'function' ? new TextEncoder() : null;

  function hash32(value) {
    const bytes = textEncoder ? textEncoder.encode(String(value)) : Array.from(String(value), c => c.charCodeAt(0) & 255);
    let hash = 0x811c9dc5;
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  function utcDayKey(date = new Date()) {
    return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, '0'), String(date.getUTCDate()).padStart(2, '0')].join('-');
  }

  function dailySeed(date = new Date()) {
    return hash32('hard-hat-mac:' + utcDayKey(date)) || 0x48484d32;
  }

  function clampInteger(value, min, max) {
    value = Math.floor(Number(value));
    return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
  }

  function replayChecksum(replay) {
    if (!replay) return '00000000';
    const summary = JSON.stringify({
      seed: replay.seed >>> 0,
      mode: replay.mode || 'standard',
      difficulty: replay.difficulty || 'standard',
      score: clampInteger(replay.score, 0, 10000000),
      frames: Array.isArray(replay.frames) ? replay.frames : [],
      ghost: Array.isArray(replay.ghost) ? replay.ghost : [],
    });
    return hash32(summary).toString(16).padStart(8, '0');
  }

  function validateScorePayload(payload) {
    if (!payload || typeof payload !== 'object') return { ok: false, reason: 'Missing score payload.' };
    const initials = String(payload.initials || '').toUpperCase();
    const score = Number(payload.score);
    const proof = payload.proof || {};
    if (!/^[A-Z0-9 ]{3}$/.test(initials)) return { ok: false, reason: 'Initials must contain three letters or numbers.' };
    if (!Number.isSafeInteger(score) || score <= 0 || score > 10000000) return { ok: false, reason: 'Score is outside the accepted range.' };
    if (!Number.isSafeInteger(proof.seed) || proof.seed < 0 || proof.seed > 0xffffffff) return { ok: false, reason: 'Run seed is invalid.' };
    if (!['standard', 'foreman'].includes(proof.difficulty)) return { ok: false, reason: 'Practice scores are local only.' };
    if (!['random', 'daily'].includes(proof.mode)) return { ok: false, reason: 'Run mode is invalid.' };
    if (!Number.isFinite(proof.elapsedSeconds) || proof.elapsedSeconds < 5 || proof.elapsedSeconds > 21600) return { ok: false, reason: 'Run duration is invalid.' };
    if (!/^[0-9a-f]{8}$/.test(String(proof.checksum || ''))) return { ok: false, reason: 'Run checksum is invalid.' };
    const generousCeiling = 25000 + proof.elapsedSeconds * (proof.difficulty === 'foreman' ? 3200 : 2600);
    if (score > generousCeiling) return { ok: false, reason: 'Score exceeds the run-time safety ceiling.' };
    return { ok: true, payload: { ...payload, initials, score } };
  }

  function qualityProfile(requested = 'auto', samples = {}) {
    if (['low', 'medium', 'high'].includes(requested)) return requested;
    const memory = Number(global.navigator?.deviceMemory || 4);
    const cores = Number(global.navigator?.hardwareConcurrency || 4);
    const fps = Number(samples.fps || 60);
    if (fps < 43 || memory <= 2 || cores <= 2) return 'low';
    if (fps < 54 || memory <= 4 || cores <= 4) return 'medium';
    return 'high';
  }

  function dprCap(profile) {
    return profile === 'low' ? 1.25 : profile === 'medium' ? 1.75 : 2.4;
  }

  function sanitizeResume(value) {
    if (!value || value.version !== 1) return null;
    const required = ['seed', 'score', 'lives', 'round', 'level', 'bonusTimer'];
    if (required.some(key => !Number.isFinite(Number(value[key])))) return null;
    if (value.level < 1 || value.level > 4 || value.round < 1 || value.round > 99 || value.lives < 1 || value.lives > 5) return null;
    if (!['random', 'daily'].includes(value.mode || 'random')) return null;
    if (!['practice', 'standard', 'foreman'].includes(value.difficulty || 'standard')) return null;
    const allowedItemStates = new Set(['available', 'carried', 'collected', 'delivered']);
    const itemState = Object.create(null);
    for (const [key, state] of Object.entries(value.itemState && typeof value.itemState === 'object' ? value.itemState : {}).slice(0, 64)) {
      if (key.length <= 32 && allowedItemStates.has(state)) itemState[key] = state;
    }
    const safeProgress = entry => ({
      filled: !!entry?.filled,
      riveted: !!entry?.riveted,
      jackP: Math.max(0, Math.min(1, Number(entry?.jackP) || 0)),
    });
    return {
      ...value,
      seed: value.seed >>> 0,
      mode: value.mode || 'random',
      difficulty: value.difficulty || 'standard',
      score: clampInteger(value.score, 0, 10000000),
      lives: clampInteger(value.lives, 1, 5),
      round: clampInteger(value.round, 1, 99),
      level: clampInteger(value.level, 1, 4),
      nextLifeAt: clampInteger(value.nextLifeAt || 10000, 10000, 10000000),
      elapsed: Math.max(0, Math.min(21600, Number(value.elapsed) || 0)),
      bonusTimer: Math.max(1, Math.min(600, Number(value.bonusTimer))),
      itemState,
      holes: Array.isArray(value.holes) ? value.holes.slice(0, 8).map(safeProgress) : [],
      sockets: Array.isArray(value.sockets) ? value.sockets.slice(0, 8).map(entry => ({ ...safeProgress(entry), id: String(entry?.id || '').slice(0, 32) })) : [],
    };
  }

  function registerPWA(callbacks = {}) {
    const state = { installPrompt: null, registered: false };
    global.addEventListener?.('beforeinstallprompt', event => {
      event.preventDefault();
      state.installPrompt = event;
      callbacks.onInstallAvailable?.(true);
    });
    global.addEventListener?.('appinstalled', () => {
      state.installPrompt = null;
      callbacks.onInstallAvailable?.(false);
      callbacks.onInstalled?.();
    });
    if ('serviceWorker' in global.navigator && global.location?.protocol !== 'file:') {
      global.navigator.serviceWorker.register('./sw.js', { scope: './' })
        .then(() => { state.registered = true; callbacks.onRegistered?.(); })
        .catch(error => callbacks.onError?.(error));
    }
    return {
      state,
      async install() {
        if (!state.installPrompt) return false;
        await state.installPrompt.prompt();
        const result = await state.installPrompt.userChoice;
        state.installPrompt = null;
        callbacks.onInstallAvailable?.(false);
        return result?.outcome === 'accepted';
      },
    };
  }

  global.HHMSupport = Object.freeze({
    hash32,
    utcDayKey,
    dailySeed,
    replayChecksum,
    validateScorePayload,
    qualityProfile,
    dprCap,
    sanitizeResume,
    registerPWA,
  });
})(window);
