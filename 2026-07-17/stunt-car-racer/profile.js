/*
 * Stunt Car Racer profile, championship-save, lap-record, and race-record storage.
 *
 * This module intentionally has no dependency on the game controller. It uses
 * localStorage when that API is usable and an in-memory store otherwise.
 * Every object crossing the public API is copied to keep persisted state from
 * being changed by reference.
 */
(function (root, factory) {
  'use strict';

  var api = factory(root);

  if (root) root.SCR_Profile = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var SCHEMA_VERSION = 2;
  var SAVE_FORMAT_VERSION = 1;
  var STORAGE_KEY = 'scr_profile';
  var PLAYER_NAME_LENGTH = 12;
  var SLOT_NAME_LENGTH = 24;
  var MAX_SAVE_SLOTS = 6;
  var MAX_SAVE_BYTES = 524288;
  var HALL_SCHEMA = 'scr-hall-of-fame';
  var HALL_VERSION = 1;
  var MAX_HALL_BYTES = 65536;
  var EMPTY_LAP = '--:--.--';

  var TRACK_NAMES = [
    'Little Ramp',
    'Stepping Stones',
    'Hump Back',
    'Big Ramp',
    'Ski Jump',
    'Draw Bridge',
    'High Jump',
    'Roller Coaster'
  ];

  function ProfileError(code, message) {
    this.name = 'SCRProfileError';
    this.code = code;
    this.message = message;
    if (Error.captureStackTrace) Error.captureStackTrace(this, ProfileError);
  }

  ProfileError.prototype = new Error();
  ProfileError.prototype.constructor = ProfileError;

  function fail(code, message) {
    throw new ProfileError(code, message);
  }

  function trimText(value) {
    return value.replace(/^\s+|\s+$/g, '');
  }

  function cleanText(value, maximumLength) {
    var text = value == null ? '' : String(value);
    text = text.replace(/[\x00-\x1f\x7f]/g, ' ');
    text = trimText(text.replace(/\s+/g, ' '));
    return text.substring(0, maximumLength);
  }

  function normalizePlayerName(value) {
    var name = cleanText(value, PLAYER_NAME_LENGTH);
    return name || 'PLAYER';
  }

  function normalizeSlotName(value) {
    var name = cleanText(value, SLOT_NAME_LENGTH);
    if (!name) fail('INVALID_SLOT_NAME', 'A championship save needs a name.');
    return name;
  }

  function slotKey(name) {
    return normalizeSlotName(name).toLowerCase();
  }

  function isPlainObject(value) {
    var tag;
    var prototype;

    if (!value || Object.prototype.toString.call(value) !== '[object Object]') return false;
    if (!Object.getPrototypeOf) return true;
    prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function validateJsonValue(value, ancestors, depth) {
    var i;
    var keys;
    var kind = typeof value;

    if (depth > 64) fail('INVALID_STATE', 'Championship state is nested too deeply.');
    if (value === null || kind === 'string' || kind === 'boolean') return;
    if (kind === 'number') {
      if (!isFinite(value)) fail('INVALID_STATE', 'Championship state contains a non-finite number.');
      return;
    }
    if (kind !== 'object') {
      fail('INVALID_STATE', 'Championship state must contain JSON-safe values only.');
    }

    for (i = 0; i < ancestors.length; i++) {
      if (ancestors[i] === value) fail('INVALID_STATE', 'Championship state contains a cycle.');
    }
    ancestors.push(value);

    if (Object.prototype.toString.call(value) === '[object Array]') {
      for (i = 0; i < value.length; i++) validateJsonValue(value[i], ancestors, depth + 1);
    } else {
      if (!isPlainObject(value)) {
        ancestors.pop();
        fail('INVALID_STATE', 'Championship state must use plain objects and arrays.');
      }
      keys = Object.keys(value);
      for (i = 0; i < keys.length; i++) {
        validateJsonValue(value[keys[i]], ancestors, depth + 1);
      }
    }

    ancestors.pop();
  }

  function cloneJson(value, enforceSizeLimit) {
    var json;

    validateJsonValue(value, [], 0);
    json = JSON.stringify(value);
    if (enforceSizeLimit && json.length > MAX_SAVE_BYTES) {
      fail('SAVE_TOO_LARGE', 'Championship state is too large to store safely.');
    }
    return JSON.parse(json);
  }

  function makeMemoryStorage() {
    var values = {};

    return {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
      },
      setItem: function (key, value) {
        values[key] = String(value);
      },
      removeItem: function (key) {
        delete values[key];
      }
    };
  }

  function hasStorageShape(storage) {
    return storage &&
      typeof storage.getItem === 'function' &&
      typeof storage.setItem === 'function' &&
      typeof storage.removeItem === 'function';
  }

  function usableBrowserStorage() {
    var candidate;
    var probe = '__scr_profile_probe__';

    try {
      candidate = root && root.localStorage;
      if (!hasStorageShape(candidate)) return null;
      candidate.setItem(probe, '1');
      candidate.removeItem(probe);
      return candidate;
    } catch (error) {
      return null;
    }
  }

  function selectStorage(options) {
    var browserStorage;

    if (options && options.storage === false) {
      return { storage: makeMemoryStorage(), type: 'memory' };
    }
    if (options && options.storage != null) {
      if (!hasStorageShape(options.storage)) {
        fail('INVALID_STORAGE', 'The supplied storage adapter is not compatible.');
      }
      return { storage: options.storage, type: 'custom' };
    }

    browserStorage = usableBrowserStorage();
    if (browserStorage) return { storage: browserStorage, type: 'localStorage' };
    return { storage: makeMemoryStorage(), type: 'memory' };
  }

  function emptyRecords() {
    var standard = [];
    var superLeague = [];
    var i;

    for (i = 0; i < TRACK_NAMES.length; i++) {
      standard.push(null);
      superLeague.push(null);
    }
    return { standard: standard, super: superLeague };
  }

  function defaultModel() {
    return {
      schemaVersion: SCHEMA_VERSION,
      playerName: 'PLAYER',
      championshipSaves: [],
      bestLaps: emptyRecords(),
      bestRaceTimes: emptyRecords()
    };
  }

  function validTimestamp(value) {
    return typeof value === 'number' && isFinite(value) && value >= 0;
  }

  function normalizeRecord(record) {
    if (!isPlainObject(record)) return null;
    if (typeof record.timeMs !== 'number' || !isFinite(record.timeMs) || record.timeMs <= 0) return null;
    return {
      timeMs: Math.round(record.timeMs),
      playerName: normalizePlayerName(record.playerName),
      recordedAt: validTimestamp(record.recordedAt) ? record.recordedAt : 0
    };
  }

  function validateHallRecord(record, label) {
    if (record === null) return null;
    if (!isPlainObject(record) || typeof record.timeMs !== 'number' ||
        !isFinite(record.timeMs) || record.timeMs <= 0 ||
        Math.floor(record.timeMs) !== record.timeMs ||
        typeof record.playerName !== 'string' || !validTimestamp(record.recordedAt)) {
      fail('INVALID_HALL_FILE', label + ' is not a valid Hall of Fame record.');
    }
    return {
      timeMs: record.timeMs,
      playerName: normalizePlayerName(record.playerName),
      recordedAt: record.recordedAt
    };
  }

  function validateHallRecordSet(records, label) {
    var normalized = emptyRecords();
    var league;
    var i;
    if (!isPlainObject(records)) {
      fail('INVALID_HALL_FILE', label + ' is missing.');
    }
    for (var leagueIndex = 0; leagueIndex < 2; leagueIndex += 1) {
      league = leagueIndex === 0 ? 'standard' : 'super';
      if (Object.prototype.toString.call(records[league]) !== '[object Array]' ||
          records[league].length !== TRACK_NAMES.length) {
        fail('INVALID_HALL_FILE', label + ' must contain all eight ' + league +
          ' league tracks.');
      }
      for (i = 0; i < TRACK_NAMES.length; i += 1) {
        normalized[league][i] = validateHallRecord(
          records[league][i], label + ' ' + league + ' track ' + (i + 1));
      }
    }
    return normalized;
  }

  function validateHallFile(candidate) {
    var normalized;
    if (!isPlainObject(candidate) || candidate.schema !== HALL_SCHEMA ||
        typeof candidate.version !== 'number' || !isFinite(candidate.version) ||
        Math.floor(candidate.version) !== candidate.version || candidate.version < 1) {
      fail('INVALID_HALL_FILE', 'Hall of Fame file data is invalid.');
    }
    if (candidate.version > HALL_VERSION) {
      fail('UNSUPPORTED_HALL_FILE', 'This Hall of Fame file was written by a newer version (' +
        candidate.version + ').');
    }
    if (!validTimestamp(candidate.exportedAt) || !isPlainObject(candidate.records)) {
      fail('INVALID_HALL_FILE', 'Hall of Fame file metadata is invalid.');
    }
    normalized = {
      schema: HALL_SCHEMA,
      version: HALL_VERSION,
      exportedAt: candidate.exportedAt,
      records: {
        bestLaps: validateHallRecordSet(candidate.records.bestLaps, 'Best laps'),
        bestRaceTimes: validateHallRecordSet(
          candidate.records.bestRaceTimes, 'Best race times')
      }
    };
    return cloneJson(normalized, false);
  }

  function normalizeLoadedModel(candidate) {
    var normalized = defaultModel();
    var records;
    var save;
    var state;
    var i;
    var j;
    var league;

    if (!isPlainObject(candidate)) return normalized;
    normalized.playerName = normalizePlayerName(candidate.playerName);

    if (Object.prototype.toString.call(candidate.championshipSaves) === '[object Array]') {
      for (i = 0; i < candidate.championshipSaves.length && normalized.championshipSaves.length < MAX_SAVE_SLOTS; i++) {
        save = candidate.championshipSaves[i];
        if (!isPlainObject(save) || !isPlainObject(save.state)) continue;
        try {
          state = cloneJson(save.state, true);
          normalized.championshipSaves.push({
            key: slotKey(save.name),
            name: normalizeSlotName(save.name),
            formatVersion: positiveInteger(save.formatVersion, SAVE_FORMAT_VERSION),
            stateVersion: positiveInteger(save.stateVersion, 1),
            revision: positiveInteger(save.revision, 1),
            savedAt: validTimestamp(save.savedAt) ? save.savedAt : 0,
            state: state
          });
        } catch (error) {
          /* Skip malformed save slots while preserving the rest of the profile. */
        }
      }
    }

    records = candidate.bestLaps;
    if (isPlainObject(records)) {
      for (j = 0; j < 2; j++) {
        league = j === 0 ? 'standard' : 'super';
        if (Object.prototype.toString.call(records[league]) !== '[object Array]') continue;
        for (i = 0; i < TRACK_NAMES.length; i++) {
          normalized.bestLaps[league][i] = normalizeRecord(records[league][i]);
        }
      }
    }

    // Version 1 profiles had lap records only. Missing race-time arrays remain
    // empty while the driver name, lap records, and championship saves migrate.
    records = candidate.bestRaceTimes;
    if (isPlainObject(records)) {
      for (j = 0; j < 2; j++) {
        league = j === 0 ? 'standard' : 'super';
        if (Object.prototype.toString.call(records[league]) !== '[object Array]') continue;
        for (i = 0; i < TRACK_NAMES.length; i++) {
          normalized.bestRaceTimes[league][i] = normalizeRecord(records[league][i]);
        }
      }
    }

    return normalized;
  }

  function positiveInteger(value, fallback) {
    if (typeof value !== 'number' || !isFinite(value) || value < 1 || Math.floor(value) !== value) {
      return fallback;
    }
    return value;
  }

  function parseTrack(track) {
    var wanted;
    var i;

    if (typeof track === 'number' && isFinite(track) && Math.floor(track) === track &&
        track >= 0 && track < TRACK_NAMES.length) return track;
    if (typeof track === 'string') {
      wanted = trimText(track).toLowerCase();
      for (i = 0; i < TRACK_NAMES.length; i++) {
        if (TRACK_NAMES[i].toLowerCase() === wanted) return i;
      }
    }
    fail('INVALID_TRACK', 'Track must be an index from 0 to 7 or a known track name.');
  }

  function parseLeague(league) {
    var value = String(league == null ? '' : league).toLowerCase();
    if (value === 'standard' || value === 'normal') return 'standard';
    if (value === 'super' || value === 'superleague' || value === 'super league') return 'super';
    fail('INVALID_LEAGUE', 'League must be "standard" or "super".');
  }

  function validateLapTime(milliseconds) {
    if (typeof milliseconds !== 'number' || !isFinite(milliseconds) ||
        milliseconds <= 0 || Math.floor(milliseconds) !== milliseconds) {
      fail('INVALID_LAP_TIME', 'Lap time must be a positive whole number of milliseconds.');
    }
    return milliseconds;
  }

  function validateRaceTime(milliseconds) {
    if (typeof milliseconds !== 'number' || !isFinite(milliseconds) ||
        milliseconds <= 0 || Math.floor(milliseconds) !== milliseconds) {
      fail('INVALID_RACE_TIME', 'Race time must be a positive whole number of milliseconds.');
    }
    return milliseconds;
  }

  function formatLap(milliseconds) {
    var totalSeconds;
    var minutes;
    var seconds;

    if (!milliseconds || milliseconds <= 0) return EMPTY_LAP;
    totalSeconds = milliseconds / 1000;
    minutes = Math.floor(totalSeconds / 60);
    seconds = totalSeconds - minutes * 60;
    return minutes + ':' + (seconds < 10 ? '0' : '') + seconds.toFixed(2);
  }

  function hallFileName(timestamp) {
    var date = new Date(validTimestamp(timestamp) ? timestamp : Date.now());
    var stamp = isFinite(date.getTime()) ? date.toISOString().replace(/[:.]/g, '-') : 'records';
    return 'StuntCarRacer-Hall-' + stamp + '.scrhall';
  }

  function createProfile(options) {
    var selected = selectStorage(options || {});
    var storage = selected.storage;
    var storageType = selected.type;
    var storageKey = options && options.storageKey ? String(options.storageKey) : STORAGE_KEY;
    var clock = options && typeof options.now === 'function' ? options.now : function () { return Date.now(); };
    var model = defaultModel();
    var unsupportedSchemaVersion = null;
    var raw;
    var parsed;

    try {
      raw = storage.getItem(storageKey);
      if (raw) {
        parsed = JSON.parse(raw);
        if (parsed && typeof parsed.schemaVersion === 'number' && parsed.schemaVersion > SCHEMA_VERSION) {
          unsupportedSchemaVersion = parsed.schemaVersion;
        } else {
          model = normalizeLoadedModel(parsed);
        }
      }
    } catch (error) {
      model = defaultModel();
    }

    function assertWritable() {
      if (unsupportedSchemaVersion != null) {
        fail(
          'UNSUPPORTED_SCHEMA',
          'This profile was written by a newer version (' + unsupportedSchemaVersion + ').'
        );
      }
    }

    function commit(nextModel) {
      var serialized;

      assertWritable();
      serialized = JSON.stringify(nextModel);
      try {
        storage.setItem(storageKey, serialized);
      } catch (error) {
        fail('STORAGE_WRITE_FAILED', 'The profile could not be saved.');
      }
      model = nextModel;
    }

    function copyModel() {
      return cloneJson(model, false);
    }

    function findSlotIndex(name) {
      var key = slotKey(name);
      var i;
      for (i = 0; i < model.championshipSaves.length; i++) {
        if (model.championshipSaves[i].key === key) return i;
      }
      return -1;
    }

    function slotMetadata(save) {
      return {
        name: save.name,
        formatVersion: save.formatVersion,
        stateVersion: save.stateVersion,
        revision: save.revision,
        savedAt: save.savedAt
      };
    }

    function getPlayerName() {
      return model.playerName;
    }

    function setPlayerName(name) {
      var normalized = normalizePlayerName(name);
      var next = copyModel();
      next.playerName = normalized;
      commit(next);
      return normalized;
    }

    function saveChampionship(name, state, optionsForSave) {
      var normalizedName = normalizeSlotName(name);
      var key = slotKey(normalizedName);
      var index = findSlotIndex(normalizedName);
      var next;
      var existing;
      var save;
      var stateVersion = positiveInteger(
        optionsForSave && optionsForSave.stateVersion,
        1
      );
      var savedAt = clock();

      if (!isPlainObject(state)) fail('INVALID_STATE', 'Championship state must be a plain object.');
      if (!validTimestamp(savedAt)) fail('INVALID_CLOCK', 'The profile clock returned an invalid timestamp.');
      if (index < 0 && model.championshipSaves.length >= MAX_SAVE_SLOTS) {
        fail('SAVE_SLOTS_FULL', 'All championship save slots are in use.');
      }

      existing = index >= 0 ? model.championshipSaves[index] : null;
      save = {
        key: key,
        name: normalizedName,
        formatVersion: SAVE_FORMAT_VERSION,
        stateVersion: stateVersion,
        revision: existing ? existing.revision + 1 : 1,
        savedAt: savedAt,
        state: cloneJson(state, true)
      };

      next = copyModel();
      if (index >= 0) next.championshipSaves[index] = save;
      else next.championshipSaves.push(save);
      commit(next);
      return slotMetadata(save);
    }

    function loadChampionship(name) {
      var index = findSlotIndex(name);
      var save;

      if (index < 0) return null;
      save = model.championshipSaves[index];
      return {
        name: save.name,
        formatVersion: save.formatVersion,
        stateVersion: save.stateVersion,
        revision: save.revision,
        savedAt: save.savedAt,
        state: cloneJson(save.state, false)
      };
    }

    function deleteChampionship(name) {
      var index = findSlotIndex(name);
      var next;

      if (index < 0) return false;
      next = copyModel();
      next.championshipSaves.splice(index, 1);
      commit(next);
      return true;
    }

    function listChampionships() {
      var list = [];
      var i;

      for (i = 0; i < model.championshipSaves.length; i++) {
        list.push(slotMetadata(model.championshipSaves[i]));
      }
      list.sort(function (left, right) {
        if (right.savedAt !== left.savedAt) return right.savedAt - left.savedAt;
        return left.name.toLowerCase() < right.name.toLowerCase() ? -1 : 1;
      });
      return cloneJson(list, false);
    }

    function recordBestLap(league, track, milliseconds, playerName) {
      var leagueKey = parseLeague(league);
      var trackIndex = parseTrack(track);
      var timeMs = validateLapTime(milliseconds);
      var current = model.bestLaps[leagueKey][trackIndex];
      var next;
      var record;

      if (current && current.timeMs <= timeMs) {
        return { updated: false, record: cloneJson(current, false) };
      }

      record = {
        timeMs: timeMs,
        playerName: playerName == null ? model.playerName : normalizePlayerName(playerName),
        recordedAt: clock()
      };
      if (!validTimestamp(record.recordedAt)) fail('INVALID_CLOCK', 'The profile clock returned an invalid timestamp.');

      next = copyModel();
      next.bestLaps[leagueKey][trackIndex] = record;
      commit(next);
      return { updated: true, record: cloneJson(record, false) };
    }

    function getBestLap(league, track) {
      var leagueKey = parseLeague(league);
      var trackIndex = parseTrack(track);
      var record = model.bestLaps[leagueKey][trackIndex];
      return record ? cloneJson(record, false) : null;
    }

    function listBestLaps(league) {
      var leagueKey = parseLeague(league);
      var list = [];
      var record;
      var i;

      for (i = 0; i < TRACK_NAMES.length; i++) {
        record = model.bestLaps[leagueKey][i];
        list.push({
          league: leagueKey,
          trackIndex: i,
          trackName: TRACK_NAMES[i],
          record: record ? cloneJson(record, false) : null
        });
      }
      return list;
    }

    function clearBestLap(league, track) {
      var leagueKey = parseLeague(league);
      var trackIndex = parseTrack(track);
      var next;

      if (!model.bestLaps[leagueKey][trackIndex]) return false;
      next = copyModel();
      next.bestLaps[leagueKey][trackIndex] = null;
      commit(next);
      return true;
    }

    function recordBestRaceTime(league, track, milliseconds, playerName) {
      var leagueKey = parseLeague(league);
      var trackIndex = parseTrack(track);
      var timeMs = validateRaceTime(milliseconds);
      var current = model.bestRaceTimes[leagueKey][trackIndex];
      var next;
      var record;

      if (current && current.timeMs <= timeMs) {
        return { updated: false, record: cloneJson(current, false) };
      }

      record = {
        timeMs: timeMs,
        playerName: playerName == null ? model.playerName : normalizePlayerName(playerName),
        recordedAt: clock()
      };
      if (!validTimestamp(record.recordedAt)) fail('INVALID_CLOCK', 'The profile clock returned an invalid timestamp.');

      next = copyModel();
      next.bestRaceTimes[leagueKey][trackIndex] = record;
      commit(next);
      return { updated: true, record: cloneJson(record, false) };
    }

    function getBestRaceTime(league, track) {
      var leagueKey = parseLeague(league);
      var trackIndex = parseTrack(track);
      var record = model.bestRaceTimes[leagueKey][trackIndex];
      return record ? cloneJson(record, false) : null;
    }

    function listBestRaceTimes(league) {
      var leagueKey = parseLeague(league);
      var list = [];
      var record;
      var i;

      for (i = 0; i < TRACK_NAMES.length; i++) {
        record = model.bestRaceTimes[leagueKey][i];
        list.push({
          league: leagueKey,
          trackIndex: i,
          trackName: TRACK_NAMES[i],
          record: record ? cloneJson(record, false) : null
        });
      }
      return list;
    }

    function clearBestRaceTime(league, track) {
      var leagueKey = parseLeague(league);
      var trackIndex = parseTrack(track);
      var next;

      if (!model.bestRaceTimes[leagueKey][trackIndex]) return false;
      next = copyModel();
      next.bestRaceTimes[leagueKey][trackIndex] = null;
      commit(next);
      return true;
    }

    function recordCell(record) {
      if (!record) {
        return {
          hasRecord: false,
          timeMs: null,
          formattedTime: EMPTY_LAP,
          playerName: '',
          recordedAt: null
        };
      }
      return {
        hasRecord: true,
        timeMs: record.timeMs,
        formattedTime: formatLap(record.timeMs),
        playerName: record.playerName,
        recordedAt: record.recordedAt
      };
    }

    function getHallOfFame() {
      var rows = [];
      var leaders = [];
      var standardLap;
      var superLap;
      var standardRace;
      var superRace;
      var i;

      for (i = 0; i < TRACK_NAMES.length; i++) {
        standardLap = model.bestLaps.standard[i];
        superLap = model.bestLaps.super[i];
        standardRace = model.bestRaceTimes.standard[i];
        superRace = model.bestRaceTimes.super[i];
        rows.push({
          trackIndex: i,
          trackName: TRACK_NAMES[i],
          // Keep the old lap-only keys for callers written against schema 1.
          standard: recordCell(standardLap),
          super: recordCell(superLap),
          standardLap: recordCell(standardLap),
          standardRace: recordCell(standardRace),
          superLap: recordCell(superLap),
          superRace: recordCell(superRace)
        });
        if (standardLap) {
          leaders.push({
            recordType: 'lap',
            league: 'standard',
            leagueLabel: 'Standard',
            trackIndex: i,
            trackName: TRACK_NAMES[i],
            timeMs: standardLap.timeMs,
            formattedTime: formatLap(standardLap.timeMs),
            playerName: standardLap.playerName,
            recordedAt: standardLap.recordedAt
          });
        }
        if (superLap) {
          leaders.push({
            recordType: 'lap',
            league: 'super',
            leagueLabel: 'Super',
            trackIndex: i,
            trackName: TRACK_NAMES[i],
            timeMs: superLap.timeMs,
            formattedTime: formatLap(superLap.timeMs),
            playerName: superLap.playerName,
            recordedAt: superLap.recordedAt
          });
        }
      }
      leaders.sort(function (left, right) {
        if (left.timeMs !== right.timeMs) return left.timeMs - right.timeMs;
        if (left.trackIndex !== right.trackIndex) return left.trackIndex - right.trackIndex;
        return left.league < right.league ? -1 : 1;
      });

      return {
        schemaVersion: SCHEMA_VERSION,
        title: 'Hall of Fame',
        playerName: model.playerName,
        columns: [
          { key: 'standardLap', label: 'Standard Lap' },
          { key: 'standardRace', label: 'Standard Race' },
          { key: 'superLap', label: 'Super Lap' },
          { key: 'superRace', label: 'Super Race' }
        ],
        rows: rows,
        leaders: leaders
      };
    }

    function exportHallOfFame() {
      var exportedAt = clock();
      if (!validTimestamp(exportedAt)) {
        fail('INVALID_CLOCK', 'The profile clock returned an invalid timestamp.');
      }
      return validateHallFile({
        schema: HALL_SCHEMA,
        version: HALL_VERSION,
        exportedAt: exportedAt,
        records: {
          bestLaps: model.bestLaps,
          bestRaceTimes: model.bestRaceTimes
        }
      });
    }

    function mergeHallOfFame(candidate) {
      var incoming = validateHallFile(candidate);
      var next = copyModel();
      var types = ['bestLaps', 'bestRaceTimes'];
      var leagues = ['standard', 'super'];
      var updatedCount = 0;
      var lapRecordsUpdated = 0;
      var raceRecordsUpdated = 0;
      var incomingRecordCount = 0;
      var type;
      var league;
      var record;
      var current;
      var i;
      var j;
      var track;
      assertWritable();
      for (i = 0; i < types.length; i += 1) {
        type = types[i];
        for (j = 0; j < leagues.length; j += 1) {
          league = leagues[j];
          for (track = 0; track < TRACK_NAMES.length; track += 1) {
            record = incoming.records[type][league][track];
            if (!record) continue;
            incomingRecordCount += 1;
            current = next[type][league][track];
            if (current && current.timeMs <= record.timeMs) continue;
            next[type][league][track] = cloneJson(record, false);
            updatedCount += 1;
            if (type === 'bestLaps') lapRecordsUpdated += 1;
            else raceRecordsUpdated += 1;
          }
        }
      }
      if (updatedCount > 0) commit(next);
      return {
        updatedCount: updatedCount,
        lapRecordsUpdated: lapRecordsUpdated,
        raceRecordsUpdated: raceRecordsUpdated,
        incomingRecordCount: incomingRecordCount,
        unchangedCount: incomingRecordCount - updatedCount
      };
    }

    function getTracks() {
      var tracks = [];
      var i;
      for (i = 0; i < TRACK_NAMES.length; i++) {
        tracks.push({ index: i, name: TRACK_NAMES[i] });
      }
      return tracks;
    }

    function getStatus() {
      return {
        schemaVersion: SCHEMA_VERSION,
        storageType: storageType,
        writable: unsupportedSchemaVersion == null,
        unsupportedSchemaVersion: unsupportedSchemaVersion,
        saveSlotCount: model.championshipSaves.length,
        maximumSaveSlots: MAX_SAVE_SLOTS
      };
    }

    function validateImport(candidate) {
      var normalized;
      if (!isPlainObject(candidate) || typeof candidate.schemaVersion !== 'number' ||
          !isFinite(candidate.schemaVersion) || Math.floor(candidate.schemaVersion) !== candidate.schemaVersion ||
          candidate.schemaVersion < 1) {
        fail('INVALID_IMPORT', 'Profile backup data is invalid.');
      }
      if (candidate.schemaVersion > SCHEMA_VERSION) {
        fail('UNSUPPORTED_SCHEMA', 'This profile was written by a newer version (' + candidate.schemaVersion + ').');
      }
      normalized = normalizeLoadedModel(candidate);
      return cloneJson(normalized, false);
    }

    function exportData() {
      return copyModel();
    }

    function importData(candidate) {
      var normalized = validateImport(candidate);
      commit(normalized);
      return copyModel();
    }

    function clearAll() {
      try {
        storage.removeItem(storageKey);
      } catch (error) {
        fail('STORAGE_WRITE_FAILED', 'The profile could not be cleared.');
      }
      model = defaultModel();
      unsupportedSchemaVersion = null;
      return true;
    }

    return {
      getPlayerName: getPlayerName,
      setPlayerName: setPlayerName,
      saveChampionship: saveChampionship,
      loadChampionship: loadChampionship,
      deleteChampionship: deleteChampionship,
      listChampionships: listChampionships,
      recordBestLap: recordBestLap,
      getBestLap: getBestLap,
      listBestLaps: listBestLaps,
      clearBestLap: clearBestLap,
      recordBestRaceTime: recordBestRaceTime,
      getBestRaceTime: getBestRaceTime,
      listBestRaceTimes: listBestRaceTimes,
      clearBestRaceTime: clearBestRaceTime,
      getHallOfFame: getHallOfFame,
      exportHallOfFame: exportHallOfFame,
      validateHallOfFame: validateHallFile,
      mergeHallOfFame: mergeHallOfFame,
      hallFileName: hallFileName,
      getTracks: getTracks,
      getStatus: getStatus,
      validateImport: validateImport,
      exportData: exportData,
      importData: importData,
      clearAll: clearAll,
      formatLap: formatLap
    };
  }

  var singleton = createProfile({});
  singleton.create = createProfile;
  singleton.Error = ProfileError;
  singleton.SCHEMA_VERSION = SCHEMA_VERSION;
  singleton.SAVE_FORMAT_VERSION = SAVE_FORMAT_VERSION;
  singleton.PLAYER_NAME_LENGTH = PLAYER_NAME_LENGTH;
  singleton.MAX_SAVE_SLOTS = MAX_SAVE_SLOTS;
  singleton.HALL_SCHEMA = HALL_SCHEMA;
  singleton.HALL_VERSION = HALL_VERSION;
  singleton.MAX_HALL_BYTES = MAX_HALL_BYTES;

  return singleton;
}));
