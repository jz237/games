/*
 * Portable Stunt Car Racer backup envelope.
 *
 * The original game moved championship and Hall-of-Fame state on a save disk.
 * Modern browsers use one checksummed JSON file containing every persisted mode.
 */
(function (root, factory) {
  'use strict';

  var api = factory();
  if (root) root.SCR_Backup = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FORMAT = 'stunt-car-racer-portable-backup';
  var VERSION = 1;
  var MAX_TEXT_BYTES = 6 * 1024 * 1024;

  function BackupError(code, message) {
    this.name = 'SCRBackupError';
    this.code = code;
    this.message = message;
    if (Error.captureStackTrace) Error.captureStackTrace(this, BackupError);
  }

  BackupError.prototype = new Error();
  BackupError.prototype.constructor = BackupError;

  function fail(code, message) {
    throw new BackupError(code, message);
  }

  function isPlainObject(value) {
    return !!value && Object.prototype.toString.call(value) === '[object Object]';
  }

  function cloneJson(value) {
    var serialized;
    try {
      serialized = JSON.stringify(value);
      if (typeof serialized !== 'string') fail('INVALID_DATA', 'Backup data must be JSON-compatible.');
      return JSON.parse(serialized);
    } catch (error) {
      if (error && error.name === 'SCRBackupError') throw error;
      fail('INVALID_DATA', 'Backup data must be JSON-compatible.');
    }
  }

  function checksumFor(data) {
    var text = JSON.stringify(data);
    var hash = 2166136261;
    var i;
    for (i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
  }

  function validateData(data) {
    if (!isPlainObject(data)) fail('INVALID_DATA', 'Backup data is missing.');
    if (!isPlainObject(data.progress)) fail('INVALID_DATA', 'Championship progress is missing.');
    if (!isPlainObject(data.profile)) fail('INVALID_DATA', 'Profile and Hall of Fame data are missing.');
    if (!isPlainObject(data.controls)) fail('INVALID_DATA', 'Control settings are missing.');
    if (data.hotseat !== null && !isPlainObject(data.hotseat)) {
      fail('INVALID_DATA', 'Local championship data is invalid.');
    }
    if (typeof data.linkChampionship !== 'undefined' &&
        data.linkChampionship !== null && !isPlainObject(data.linkChampionship)) {
      fail('INVALID_DATA', 'Linked championship data is invalid.');
    }
    if (typeof data.driverControls !== 'undefined' &&
        data.driverControls !== null && !isPlainObject(data.driverControls)) {
      fail('INVALID_DATA', 'Named-driver control data is invalid.');
    }
    return cloneJson(data);
  }

  function create(data, options) {
    var copied = validateData(data);
    var createdAt = options && options.createdAt;
    var appVersion = options && options.appVersion;
    if (typeof createdAt !== 'number' || !isFinite(createdAt) || createdAt < 0) createdAt = Date.now();
    return {
      format: FORMAT,
      version: VERSION,
      appVersion: appVersion == null ? '' : String(appVersion).substring(0, 32),
      createdAt: Math.round(createdAt),
      checksum: checksumFor(copied),
      data: copied
    };
  }

  function validateEnvelope(envelope) {
    var data;
    if (!isPlainObject(envelope)) fail('INVALID_FILE', 'This is not a Stunt Car Racer backup.');
    if (envelope.format !== FORMAT) fail('INVALID_FILE', 'This is not a Stunt Car Racer backup.');
    if (envelope.version !== VERSION) {
      fail('UNSUPPORTED_VERSION', 'This backup version is not supported.');
    }
    if (typeof envelope.createdAt !== 'number' || !isFinite(envelope.createdAt) || envelope.createdAt < 0) {
      fail('INVALID_FILE', 'The backup date is invalid.');
    }
    data = validateData(envelope.data);
    if (envelope.checksum !== checksumFor(data)) {
      fail('CHECKSUM_MISMATCH', 'The backup is damaged or incomplete.');
    }
    return {
      format: FORMAT,
      version: VERSION,
      appVersion: envelope.appVersion == null ? '' : String(envelope.appVersion).substring(0, 32),
      createdAt: Math.round(envelope.createdAt),
      checksum: envelope.checksum,
      data: data
    };
  }

  function serialize(envelope) {
    var normalized = validateEnvelope(envelope);
    var text = JSON.stringify(normalized, null, 2);
    if (text.length > MAX_TEXT_BYTES) fail('FILE_TOO_LARGE', 'The backup is too large to save safely.');
    return text;
  }

  function parse(text) {
    var parsed;
    if (typeof text !== 'string' || !text) fail('INVALID_FILE', 'The selected backup is empty.');
    if (text.length > MAX_TEXT_BYTES) fail('FILE_TOO_LARGE', 'The selected backup is too large.');
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      fail('INVALID_FILE', 'The selected backup is not valid JSON.');
    }
    return validateEnvelope(parsed);
  }

  function fileName(dateValue) {
    var date = dateValue instanceof Date ? dateValue : new Date(dateValue == null ? Date.now() : dateValue);
    var iso = isFinite(date.getTime()) ? date.toISOString().substring(0, 10) : 'undated';
    return 'Stunt-Car-Racer-backup-' + iso + '.scrbackup';
  }

  return {
    FORMAT: FORMAT,
    VERSION: VERSION,
    MAX_TEXT_BYTES: MAX_TEXT_BYTES,
    Error: BackupError,
    create: create,
    serialize: serialize,
    parse: parse,
    checksumFor: checksumFor,
    fileName: fileName
  };
}));
