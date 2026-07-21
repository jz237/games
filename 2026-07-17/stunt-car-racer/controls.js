/*
 * Persistent, original-style keyboard redefinition for Stunt Car Racer.
 *
 * The Amiga game captured five distinct driving keys and rejected duplicates.
 * This module keeps that model while exposing a small browser/CommonJS API so
 * the input rules can be tested without loading the WebAssembly game.
 */
(function (root, factory) {
  'use strict';

  var api = factory(root);
  if (root) root.SCR_Controls = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var VERSION = 1;
  var STORAGE_KEY = 'scr-key-bindings-v1';
  var ACTIONS = ['left', 'right', 'gas', 'brake', 'boost'];
  var DEFAULT_BINDINGS = {
    left: 'KeyA',
    right: 'KeyD',
    gas: 'KeyW',
    brake: 'KeyS',
    boost: 'Space'
  };
  var FALLBACKS = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'gas',
    ArrowDown: 'brake',
    ShiftLeft: 'boost',
    ShiftRight: 'boost'
  };

  function clone(bindings) {
    var copy = {};
    ACTIONS.forEach(function (action) { copy[action] = bindings[action]; });
    return copy;
  }

  function defaultBindings() {
    return clone(DEFAULT_BINDINGS);
  }

  function isBindableCode(code) {
    if (typeof code !== 'string' || !code) return false;
    if (/^F(?:[1-9]|1[0-2])$/.test(code)) return false;
    return [
      'Escape', 'Tab', 'CapsLock', 'ContextMenu', 'PrintScreen', 'Pause',
      'MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight',
      'AltLeft', 'AltRight'
    ].indexOf(code) === -1;
  }

  function normalize(value) {
    var normalized = {};
    var used = {};
    var i;
    var action;
    var code;

    if (!value || Object.prototype.toString.call(value) !== '[object Object]') return null;
    for (i = 0; i < ACTIONS.length; i++) {
      action = ACTIONS[i];
      code = value[action];
      if (!isBindableCode(code) || used[code]) return null;
      used[code] = true;
      normalized[action] = code;
    }
    return normalized;
  }

  function resolveStorage(storage) {
    if (storage === false || storage === null) return null;
    if (storage) return storage;
    try { return root && root.localStorage ? root.localStorage : null; } catch (e) { return null; }
  }

  function readStorage(storage) {
    if (!storage) return null;
    if (typeof storage.getItem === 'function') return storage.getItem(STORAGE_KEY);
    if (typeof storage.read === 'function') return storage.read(STORAGE_KEY);
    return null;
  }

  function writeStorage(storage, value) {
    if (!storage) return;
    if (typeof storage.setItem === 'function') storage.setItem(STORAGE_KEY, value);
    else if (typeof storage.write === 'function') storage.write(STORAGE_KEY, value);
  }

  function load(storage) {
    var parsed;
    var normalized;
    try {
      parsed = JSON.parse(readStorage(resolveStorage(storage)) || 'null');
      if (!parsed || parsed.version !== VERSION) return defaultBindings();
      normalized = normalize(parsed.bindings);
      return normalized || defaultBindings();
    } catch (e) {
      return defaultBindings();
    }
  }

  function save(storage, bindings) {
    var normalized = validate(bindings);
    try {
      writeStorage(resolveStorage(storage), JSON.stringify({
        version: VERSION,
        bindings: normalized
      }));
    } catch (e) {
      // The controls remain active for this session when private storage is unavailable.
    }
    return clone(normalized);
  }

  function validate(bindings) {
    var normalized = normalize(bindings);
    var error;
    if (!normalized) {
      error = new Error('Invalid or duplicate control bindings.');
      error.code = 'INVALID_BINDINGS';
      throw error;
    }
    return clone(normalized);
  }

  function setBinding(bindings, action, code) {
    var next = normalize(bindings);
    var i;
    var other;
    var error;
    if (ACTIONS.indexOf(action) === -1) throw new Error('Unknown control action.');
    if (!isBindableCode(code)) {
      error = new Error('That key is reserved by the browser or game.');
      error.code = 'RESERVED_KEY';
      throw error;
    }
    if (!next) next = defaultBindings();
    for (i = 0; i < ACTIONS.length; i++) {
      other = ACTIONS[i];
      if (other !== action && next[other] === code) {
        error = new Error('That key is already assigned.');
        error.code = 'DUPLICATE_BINDING';
        error.action = other;
        throw error;
      }
    }
    next[action] = code;
    return next;
  }

  function primaryActionForCode(bindings, code) {
    var normalized = normalize(bindings) || defaultBindings();
    var i;
    for (i = 0; i < ACTIONS.length; i++) {
      if (normalized[ACTIONS[i]] === code) return ACTIONS[i];
    }
    return null;
  }

  function fieldForCode(bindings, code) {
    return primaryActionForCode(bindings, code) || FALLBACKS[code] || null;
  }

  function labelForCode(code) {
    var labels = {
      Space: 'Space', Enter: 'Enter', Backspace: 'Backspace', Delete: 'Delete',
      Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'Page Up', PageDown: 'Page Down',
      ArrowLeft: 'Left Arrow', ArrowRight: 'Right Arrow',
      ArrowUp: 'Up Arrow', ArrowDown: 'Down Arrow',
      ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift',
      Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
      Backslash: '\\', Semicolon: ';', Quote: "'", Backquote: '`',
      Comma: ',', Period: '.', Slash: '/'
    };
    if (labels[code]) return labels[code];
    if (/^Key[A-Z]$/.test(code)) return code.substring(3);
    if (/^Digit[0-9]$/.test(code)) return code.substring(5);
    if (/^Numpad[0-9]$/.test(code)) return 'Numpad ' + code.substring(6);
    if (/^Numpad/.test(code)) return code.replace(/^Numpad/, 'Numpad ');
    return code ? code.replace(/([a-z])([A-Z])/g, '$1 $2') : 'Unassigned';
  }

  function reset(storage) {
    return save(storage, defaultBindings());
  }

  return {
    VERSION: VERSION,
    STORAGE_KEY: STORAGE_KEY,
    ACTIONS: ACTIONS.slice(),
    FALLBACKS: Object.assign({}, FALLBACKS),
    defaultBindings: defaultBindings,
    isBindableCode: isBindableCode,
    validate: validate,
    load: load,
    save: save,
    setBinding: setBinding,
    primaryActionForCode: primaryActionForCode,
    fieldForCode: fieldForCode,
    labelForCode: labelForCode,
    reset: reset
  };
}));
