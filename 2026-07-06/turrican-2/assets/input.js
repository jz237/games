/* Turrican II — Redux : input.js
 * Keyboard + touch + gamepad -> per-frame input with edge-triggered flags.
 */
(function (root, factory) { root.TInput = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createInput(target) {
    const keys = Object.create(null);
    const touch = Object.create(null);
    let tapped = Object.create(null); // keydowns latched until next frame() —
                                      // a tap released between frames still registers
    let prev = Object.create(null);
    let pad = null;

    const MAP = {
      left: ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      up: ['ArrowUp'],
      down: ['ArrowDown', 'KeyS'],
      jump: ['Space', 'KeyW', 'KeyK'],
      fire: ['KeyJ', 'KeyX', 'ControlLeft', 'ControlRight'],
      morph: ['ShiftLeft', 'ShiftRight', 'KeyM'],
      switch: ['KeyQ'],
      bomb: ['KeyC'],
      line: ['KeyV'],
      pause: ['KeyP', 'Escape'],
      mute: ['KeyN'],
      start: ['Enter', 'Space'],
    };

    function down(code) {
      for (const k in MAP) if (MAP[k].includes(code)) return true;
      return false;
    }
    const onKeyDown = (e) => {
      if (down(e.code)) e.preventDefault();
      if (!keys[e.code] && !e.repeat) tapped[e.code] = true;
      keys[e.code] = true;
    };
    const onKeyUp = (e) => { keys[e.code] = false; };
    // alt-tab / focus loss: release everything so keys never stick
    const onBlur = () => {
      for (const k in keys) keys[k] = false;
      for (const k in touch) touch[k] = false;
    };
    (target || window).addEventListener('keydown', onKeyDown);
    (target || window).addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', () => { if (document.hidden) onBlur(); });

    function held(action) {
      const codes = MAP[action] || [];
      for (const c of codes) if (keys[c]) return true;
      if (touch[action]) return true;
      return false;
    }
    function tappedAction(action) {
      const codes = MAP[action] || [];
      for (const c of codes) if (tapped[c]) return true;
      return false;
    }

    function pollPad() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      pad = null;
      for (const p of pads) if (p) { pad = p; break; }
    }
    function padHeld(action) {
      if (!pad) return false;
      const b = pad.buttons, ax = pad.axes;
      switch (action) {
        case 'left': return (ax[0] < -0.4) || (b[14] && b[14].pressed);
        case 'right': return (ax[0] > 0.4) || (b[15] && b[15].pressed);
        case 'up': return (ax[1] < -0.4) || (b[12] && b[12].pressed);
        case 'down': return (ax[1] > 0.4) || (b[13] && b[13].pressed);
        case 'jump': return b[0] && b[0].pressed;
        case 'fire': return b[2] && b[2].pressed;
        case 'morph': return b[1] && b[1].pressed;
        case 'switch': return b[3] && b[3].pressed;
        case 'bomb': return b[5] && b[5].pressed;
        case 'line': return b[4] && b[4].pressed;
        case 'start': return b[9] && b[9].pressed;
        case 'pause': return b[9] && b[9].pressed;
      }
      return false;
    }

    function frame() {
      pollPad();
      const cur = Object.create(null);
      const beamAiming = (window.__tBeamAim === true);
      for (const k in MAP) cur[k] = held(k) || padHeld(k);
      // Up should not jump; jump only via jump keys/pad. (Beam aim uses up/down.)
      const edge = (k) => (cur[k] && !prev[k]) || tappedAction(k);
      const inp = {
        left: cur.left, right: cur.right, up: cur.up, down: cur.down,
        jump: cur.jump, fire: cur.fire, morph: cur.morph,
        jumpPressed: edge('jump'),
        jumpReleased: !cur.jump && prev.jump,
        upPressed: edge('up'),
        downPressed: edge('down'),
        leftPressed: edge('left'),
        rightPressed: edge('right'),
        firePressed: edge('fire'),
        morphPressed: edge('morph'),
        switchPressed: edge('switch'),
        bombPressed: edge('bomb'),
        linePressed: edge('line'),
        pausePressed: edge('pause'),
        mutePressed: edge('mute'),
        startPressed: edge('start') || edge('jump'),
      };
      prev = cur;
      tapped = Object.create(null);
      return inp;
    }

    function setTouch(action, on) {
      if (on && !touch[action]) tapped[(MAP[action] || [])[0] || action] = true;
      touch[action] = on;
    }
    // gamepad haptics (best effort)
    function rumble(strength, ms) {
      if (!pad || !pad.vibrationActuator || !pad.vibrationActuator.playEffect) return;
      pad.vibrationActuator.playEffect('dual-rumble', {
        duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6,
      }).catch(() => {});
    }
    function destroy() {
      (target || window).removeEventListener('keydown', onKeyDown);
      (target || window).removeEventListener('keyup', onKeyUp);
    }

    return { frame, setTouch, rumble, destroy, MAP };
  }

  return { createInput };
});
