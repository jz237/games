/* Turrican II — Redux : game.js
 * Main loop, state machine, stage progression, menus, touch, QA hooks.
 */
(function () {
  'use strict';
  const D = window.TData, E = window.TEngine, R = window.TRender, A = window.TAudio, I = window.TInput;

  const display = document.getElementById('game');
  const DW = 960, DH = 540;
  display.width = DW; display.height = DH;
  const dx = display.getContext('2d');

  const renderer = R.createRenderer(display);
  const audio = A.createAudio();
  const input = I.createInput(window);

  // stage plan: worlds x stages (all use the platform engine for now; the
  // shoot-'em-up flight world is flagged for a future dedicated mode).
  const STAGES_PER_WORLD = [2, 2, 3, 2, 2]; // faithful blueprint: 5 worlds / 11 stages
  const PLAN = [];
  for (let w = 0; w < STAGES_PER_WORLD.length; w++)
    for (let s = 0; s < STAGES_PER_WORLD[w]; s++) PLAN.push({ world: w, stage: s });

  let mode = 'title';        // title | playing | paused | stageclear | gameover | win
  let state = null;          // engine state
  let planIdx = 0;
  let carry = null;
  let acc = 0, last = 0;
  let uiT = 0;
  let stageClearT = 0;

  function newRun() {
    planIdx = 0;
    carry = { lives: 3, score: 0, gems: 0, weapons: { spread: 1, beam: 0, bounce: 0 }, weapon: 'spread', bombs: 2, lines: 3 };
    loadStage();
  }
  function loadStage() {
    const p = PLAN[planIdx];
    const level = D.buildLevel(p.world, p.stage);
    if (carry) carry.energy = 100;
    state = E.createGame(level, carry);
    renderer.setLevel(level);
    audio.startMusic(level.world);
    mode = 'playing';
    window.__tState = state;
  }
  function nextStage() {
    // carry stats forward
    const p = state.player;
    carry = { lives: p.lives, score: p.score, gems: p.gems, weapons: p.weapons,
      weapon: p.weapon, bombs: p.bombs, lines: p.lines, energy: 100 };
    planIdx++;
    if (planIdx >= PLAN.length) { mode = 'win'; audio.stopMusic(); audio.play('complete'); return; }
    mode = 'stageclear'; stageClearT = 2.2; audio.play('complete');
  }

  // ---- main loop ----------------------------------------------------------
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!last) last = ts;
    let dt = (ts - last) / 1000; last = ts; if (dt > 0.1) dt = 0.1;
    uiT += dt;

    const inp = input.frame();
    // global keys
    if (inp.mutePressed) audio.toggleMute();

    if (mode === 'title') {
      if (inp.startPressed) { audio.resume(); newRun(); }
      drawTitle();
      return;
    }
    if (mode === 'gameover' || mode === 'win') {
      if (inp.startPressed) { mode = 'title'; }
      renderer.render(state, 0);
      if (mode === 'gameover') drawGameOver(); else drawWin();
      return;
    }
    if (mode === 'stageclear') {
      stageClearT -= dt;
      renderer.render(state, dt);
      drawStageClear();
      if (stageClearT <= 0) loadStage();
      return;
    }
    if (mode === 'paused') {
      if (inp.pausePressed) { mode = 'playing'; }
      renderer.render(state, 0);
      drawPaused();
      return;
    }

    // playing
    if (inp.pausePressed) { mode = 'paused'; return; }
    window.__tBeamAim = (state.player.weapon === 'beam' && inp.fire);

    acc += dt;
    let steps = 0;
    while (acc >= D.DT && steps < 5) {
      E.step(state, inp, D.VIEW_W, D.VIEW_H);
      acc -= D.DT; steps++;
      // consume sfx events
      for (const ev of state.events) if (ev.type === 'sfx') audio.play(ev.name);
      if (state.won) { nextStage(); break; }
      if (state.gameOver) { mode = 'gameover'; audio.stopMusic(); audio.play('gameover'); break; }
    }
    if (mode === 'playing') renderer.render(state, dt);
  }

  // ---- menu / overlay drawing --------------------------------------------
  function centerText(txt, x, y, size, color, weight) {
    dx.fillStyle = color; dx.textAlign = 'center'; dx.textBaseline = 'middle';
    dx.font = `${weight || 'bold'} ${size}px "Trebuchet MS", system-ui, sans-serif`;
    dx.fillText(txt, x, y);
  }
  function bgPanel() {
    const g = dx.createLinearGradient(0, 0, 0, DH);
    g.addColorStop(0, '#0a0620'); g.addColorStop(0.5, '#1b0f3a'); g.addColorStop(1, '#050310');
    dx.fillStyle = g; dx.fillRect(0, 0, DW, DH);
  }
  function drawTitle() {
    bgPanel();
    // animated scanline grid
    dx.strokeStyle = 'rgba(120,90,255,0.10)'; dx.lineWidth = 1;
    for (let y = (uiT * 40) % 40; y < DH; y += 40) { dx.beginPath(); dx.moveTo(0, y); dx.lineTo(DW, y); dx.stroke(); }
    // title
    dx.save();
    const glow = 12 + Math.sin(uiT * 2) * 6;
    dx.shadowColor = '#ff5d3b'; dx.shadowBlur = glow;
    centerText('TURRICAN II', DW / 2, DH / 2 - 96, 74, '#ffd23f', '900');
    dx.shadowColor = '#6cf3ff'; dx.shadowBlur = 8;
    centerText('THE FINAL FIGHT', DW / 2, DH / 2 - 44, 30, '#6cf3ff', 'bold');
    dx.restore();
    centerText('— enhanced browser tribute —', DW / 2, DH / 2 - 10, 14, 'rgba(200,210,255,0.6)', 'normal');
    if (Math.floor(uiT * 2) % 2 === 0)
      centerText('PRESS ENTER / SPACE TO START', DW / 2, DH / 2 + 54, 20, '#ffffff', 'bold');
    centerText('MOVE ←→  ·  JUMP SPACE  ·  FIRE J/X  ·  MORPH SHIFT  ·  AIM BEAM ↑↓', DW / 2, DH / 2 + 104, 13, 'rgba(200,210,255,0.7)', 'normal');
    centerText('SWITCH WEAPON Q  ·  FREEZE C  ·  POWER-LINE V  ·  PAUSE P  ·  MUTE N', DW / 2, DH / 2 + 126, 13, 'rgba(200,210,255,0.7)', 'normal');
    centerText('v' + D.VERSION, DW - 40, DH - 20, 12, 'rgba(255,255,255,0.4)', 'normal');
  }
  function overlayDim() { dx.fillStyle = 'rgba(4,4,16,0.6)'; dx.fillRect(0, 0, DW, DH); }
  function drawPaused() { overlayDim(); centerText('PAUSED', DW / 2, DH / 2, 48, '#ffd23f', '900');
    centerText('press P to resume', DW / 2, DH / 2 + 44, 16, '#cfe0ff', 'normal'); }
  function drawStageClear() {
    overlayDim();
    const p = PLAN[planIdx];
    centerText('STAGE CLEAR', DW / 2, DH / 2 - 30, 46, '#54e36b', '900');
    centerText('SCORE ' + state.player.score, DW / 2, DH / 2 + 20, 20, '#fff', 'bold');
  }
  function drawGameOver() {
    overlayDim(); dx.save(); dx.shadowColor = '#ff3b6b'; dx.shadowBlur = 14;
    centerText('GAME OVER', DW / 2, DH / 2 - 20, 56, '#ff5d7a', '900'); dx.restore();
    centerText('SCORE ' + (state ? state.player.score : 0), DW / 2, DH / 2 + 34, 22, '#fff', 'bold');
    centerText('press ENTER to return to title', DW / 2, DH / 2 + 76, 15, '#cfe0ff', 'normal');
  }
  function drawWin() {
    bgPanel(); dx.save(); dx.shadowColor = '#ffd23f'; dx.shadowBlur = 18;
    centerText('THE MACHINE IS DESTROYED', DW / 2, DH / 2 - 40, 40, '#ffd23f', '900'); dx.restore();
    centerText('FINAL SCORE ' + (state ? state.player.score : 0), DW / 2, DH / 2 + 20, 26, '#6cf3ff', 'bold');
    centerText('press ENTER for the title', DW / 2, DH / 2 + 70, 15, '#cfe0ff', 'normal');
  }

  // ---- touch controls -----------------------------------------------------
  function wireTouch() {
    const bind = (id, action) => {
      const el = document.getElementById(id); if (!el) return;
      const on = (e) => { e.preventDefault(); input.setTouch(action, true); el.classList.add('down'); };
      const off = (e) => { e.preventDefault(); input.setTouch(action, false); el.classList.remove('down'); };
      el.addEventListener('touchstart', on, { passive: false });
      el.addEventListener('touchend', off, { passive: false });
      el.addEventListener('touchcancel', off, { passive: false });
      el.addEventListener('mousedown', on); el.addEventListener('mouseup', off); el.addEventListener('mouseleave', off);
    };
    bind('t-left', 'left'); bind('t-right', 'right'); bind('t-up', 'up'); bind('t-down', 'down');
    bind('t-jump', 'jump'); bind('t-fire', 'fire'); bind('t-morph', 'morph'); bind('t-switch', 'switch');
    // show touch UI on touch devices
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      const tc = document.getElementById('touch'); if (tc) tc.style.display = 'flex';
    }
  }
  wireTouch();

  // ---- QA hooks (headless testing) ---------------------------------------
  window.__turrican = {
    get mode() { return mode; },
    get state() { return state; },
    start() { audio.resume(); newRun(); },
    goToStage(i) { planIdx = i; loadStage(); },
    step(n, inp) { for (let k = 0; k < (n || 1); k++) E.step(state, inp || {}, D.VIEW_W, D.VIEW_H); return snap(); },
    snapshot: snap, plan: PLAN, D,
    setInput(o) { window.__forceInput = o; },
  };
  function snap() {
    if (!state) return { mode };
    const p = state.player;
    return { mode, world: state.level.world, stage: PLAN[planIdx] ? PLAN[planIdx].stage : -1,
      x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.onGround, energy: p.energy, lives: p.lives,
      score: p.score, gems: p.gems, weapon: p.weapon, weaponLevel: p.weapons[p.weapon],
      morph: p.morph, enemies: state.enemies.filter(e => e.alive).length, won: state.won, gameOver: state.gameOver };
  }

  requestAnimationFrame(loop);
  console.log('[Turrican II Redux] v' + D.VERSION + ' booted');
})();
