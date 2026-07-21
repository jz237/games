/**
 * Per-driver keyboard layouts for original-style multiplayer championships.
 *
 * Each named driver retains five distinct driving keys across local and linked
 * fixtures. Global controls remain the fallback for drivers without a custom
 * entry. The model is portable and safe to synchronize between linked peers.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (root) root.SCR_DriverControls = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var SCHEMA = 'scr-driver-controls';
  var VERSION = 1;
  var STORAGE_KEY = 'scr-driver-controls-v1';
  var MAX_ENTRIES = 64;
  var MAX_NAME_LENGTH = 12;
  var ACTIONS = ['left', 'right', 'gas', 'brake', 'boost'];

  function fail(code, message) {
    var error = new Error(message);
    error.code = code;
    throw error;
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function isBindableCode(code) {
    if (typeof code !== 'string' || !code || /^F(?:[1-9]|1[0-2])$/.test(code)) return false;
    return [
      'Escape', 'Tab', 'CapsLock', 'ContextMenu', 'PrintScreen', 'Pause',
      'MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight',
      'AltLeft', 'AltRight'
    ].indexOf(code) === -1;
  }

  function normalizeName(value) {
    if (typeof value !== 'string') fail('INVALID_DRIVER_NAME', 'Driver name is invalid.');
    var name = value.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/^\s+|\s+$/g, '')
      .replace(/\s+/g, ' ').substring(0, MAX_NAME_LENGTH);
    if (!name) fail('INVALID_DRIVER_NAME', 'Driver name cannot be empty.');
    return name;
  }

  function keyForName(value) { return normalizeName(value).toUpperCase(); }

  function normalizeBindings(value) {
    var normalized = {};
    var used = {};
    if (!isObject(value)) fail('INVALID_BINDINGS', 'Driver controls are invalid.');
    for (var i = 0; i < ACTIONS.length; i += 1) {
      var action = ACTIONS[i];
      var code = value[action];
      if (!isBindableCode(code) || used[code]) {
        fail('INVALID_BINDINGS', 'Driver controls contain a reserved or duplicate key.');
      }
      used[code] = true;
      normalized[action] = code;
    }
    return normalized;
  }

  function cloneBindings(bindings) {
    var copy = {};
    for (var i = 0; i < ACTIONS.length; i += 1) copy[ACTIONS[i]] = bindings[ACTIONS[i]];
    return copy;
  }

  function create() {
    return { schema: SCHEMA, version: VERSION, entries: [] };
  }

  function canonical(model) {
    if (!isObject(model) || model.schema !== SCHEMA || model.version !== VERSION ||
        !Array.isArray(model.entries) || model.entries.length > MAX_ENTRIES) {
      fail('INVALID_DRIVER_CONTROLS', 'Per-driver control data is invalid.');
    }
    var normalized = create();
    var seen = {};
    for (var i = 0; i < model.entries.length; i += 1) {
      var entry = model.entries[i];
      if (!isObject(entry)) fail('INVALID_DRIVER_CONTROLS', 'Driver control entry is invalid.');
      var name = normalizeName(entry.name);
      var key = keyForName(name);
      if (seen[key]) fail('INVALID_DRIVER_CONTROLS', 'Driver control names must be unique.');
      seen[key] = true;
      normalized.entries.push({
        key: key,
        name: name,
        bindings: normalizeBindings(entry.bindings)
      });
    }
    return normalized;
  }

  function resolveStorage(storage) {
    if (storage === false || storage === null) return null;
    if (storage) return storage;
    try { return root && root.localStorage ? root.localStorage : null; }
    catch (error) { return null; }
  }

  function load(storage) {
    var target = resolveStorage(storage);
    if (!target || typeof target.getItem !== 'function') return create();
    try {
      var raw = target.getItem(STORAGE_KEY);
      return raw ? canonical(JSON.parse(raw)) : create();
    } catch (error) {
      return create();
    }
  }

  function save(model, storage) {
    var normalized = canonical(model);
    var target = resolveStorage(storage);
    if (target && typeof target.setItem === 'function') {
      try { target.setItem(STORAGE_KEY, JSON.stringify(normalized)); }
      catch (error) { /* Keep the valid in-memory model when storage is unavailable. */ }
    }
    return canonical(normalized);
  }

  function findIndex(model, name) {
    var key = keyForName(name);
    for (var i = 0; i < model.entries.length; i += 1) {
      if (model.entries[i].key === key) return i;
    }
    return -1;
  }

  function get(model, name, fallback) {
    var normalized = canonical(model);
    var index = findIndex(normalized, name);
    if (index >= 0) return cloneBindings(normalized.entries[index].bindings);
    return normalizeBindings(fallback);
  }

  function set(model, name, bindings) {
    var normalized = canonical(model);
    var normalizedName = normalizeName(name);
    var index = findIndex(normalized, normalizedName);
    var entry = {
      key: keyForName(normalizedName),
      name: normalizedName,
      bindings: normalizeBindings(bindings)
    };
    if (index >= 0) normalized.entries[index] = entry;
    else {
      if (normalized.entries.length >= MAX_ENTRIES) {
        fail('TOO_MANY_DRIVERS', 'Too many per-driver control layouts are stored.');
      }
      normalized.entries.push(entry);
    }
    model.schema = normalized.schema;
    model.version = normalized.version;
    model.entries = normalized.entries;
    return cloneBindings(entry.bindings);
  }

  function remove(model, name) {
    var normalized = canonical(model);
    var index = findIndex(normalized, name);
    if (index < 0) return false;
    normalized.entries.splice(index, 1);
    model.schema = normalized.schema;
    model.version = normalized.version;
    model.entries = normalized.entries;
    return true;
  }

  function list(model) {
    return canonical(model).entries.map(function (entry) {
      return { name: entry.name, bindings: cloneBindings(entry.bindings) };
    });
  }

  function serialize(model) { return JSON.stringify(canonical(model)); }
  function restore(value) {
    var parsed = value;
    if (typeof value === 'string') {
      try { parsed = JSON.parse(value); }
      catch (error) { fail('INVALID_DRIVER_CONTROLS', 'Per-driver controls are not valid JSON.'); }
    }
    return canonical(parsed);
  }

  function clear(storage) {
    var target = resolveStorage(storage);
    if (target && typeof target.removeItem === 'function') target.removeItem(STORAGE_KEY);
  }

  return {
    schema: SCHEMA,
    version: VERSION,
    storageKey: STORAGE_KEY,
    maxEntries: MAX_ENTRIES,
    create: create,
    validate: canonical,
    load: load,
    save: save,
    get: get,
    set: set,
    remove: remove,
    list: list,
    serialize: serialize,
    restore: restore,
    clear: clear
  };
}));
