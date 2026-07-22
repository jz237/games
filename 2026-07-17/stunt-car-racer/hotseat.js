/**
 * Original-style local Drivers Championship logic for Stunt Car Racer.
 *
 * The original hot-seat championship is not the two-computer link schedule:
 *   - 2 to 8 named human drivers.
 *   - 1 to 4 seasons, each using both tracks of a league division.
 *   - Every driver races the computer pace car once on each track.
 *   - A race win is worth 2 points; the faster lap in that race is worth 1.
 *   - Once a track round is complete, the fastest overall human lap earns 1
 *     bonus point and the fastest overall human race time earns 2. Ties share
 *     the full bonus.
 *
 * Version 1 saves from the earlier implementation remain readable and can be
 * completed with their old schedule. Version 2 saves migrate in place; new
 * championships use version 3, which records deliberately skipped fixtures.
 *
 * Browser:   window.SCR_Hotseat
 * CommonJS:  var Hotseat = require('./hotseat.js');
 */
(function (root, factory) {
  'use strict';

  var api = factory(root);

  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.SCR_Hotseat = api;
  }
}(typeof window !== 'undefined' ? window :
  (typeof global !== 'undefined' ? global : this), function (root) {
  'use strict';

  var SCHEMA = 'scr-hotseat-championship';
  var VERSION = 3;
  var PRIOR_VERSION = 2;
  var LEGACY_VERSION = 1;
  var MIN_PLAYERS = 2;
  var MAX_PLAYERS = 8;
  var MAX_NAME_LENGTH = 12;
  var MIN_SEASONS = 1;
  var MAX_SEASONS = 4;
  var ROUNDS_PER_SEASON = 2;
  var LEGACY_ROUND_COUNT = 4;
  var LEGACY_HEATS_PER_ROUND = 2;
  var WIN_POINTS = 2;
  var FASTEST_LAP_POINTS = 1;
  var TRACK_LAP_BONUS_POINTS = 1;
  var TRACK_RACE_BONUS_POINTS = 2;
  var STORAGE_KEY = 'scr_hotseat_championship';

  var TRACK_NAMES = [
    'Little Ramp', 'Stepping Stones', 'Hump Back', 'Big Ramp',
    'Ski Jump', 'Draw Bridge', 'High Jump', 'Roller Coaster'
  ];
  var DIVISION_NAMES = ['Division 4', 'Division 3', 'Division 2', 'Division 1'];
  var DIVISION_TRACKS = [
    [0, 2], [1, 3], [6, 7], [4, 5]
  ];
  var OPPONENT_NAMES = ['Hot Rod', 'Whizz Kid'];
  var DEFAULT_SEASONS = [{ divisionIndex: 0, superLeague: false }];
  var LEGACY_DEFAULT_TRACKS = [0, 1, 2, 3];
  var objectToString = Object.prototype.toString;

  function fail(message) {
    throw new Error('SCR_Hotseat: ' + message);
  }

  function isArray(value) {
    return Array.isArray ? Array.isArray(value) :
      objectToString.call(value) === '[object Array]';
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !isArray(value);
  }

  function isInteger(value) {
    return typeof value === 'number' && isFinite(value) &&
      Math.floor(value) === value;
  }

  function trim(value) {
    return value.replace(/^\s+|\s+$/g, '');
  }

  function copyArray(values) {
    return values.slice(0);
  }

  function copyDivisionTracks() {
    var copy = [];
    var i;
    for (i = 0; i < DIVISION_TRACKS.length; i += 1) {
      copy.push(copyArray(DIVISION_TRACKS[i]));
    }
    return copy;
  }

  function copySeasons(values) {
    var copy = [];
    var i;
    for (i = 0; i < values.length; i += 1) {
      copy.push({
        divisionIndex: values[i].divisionIndex,
        superLeague: values[i].superLeague
      });
    }
    return copy;
  }

  function normalizeName(value, index) {
    var name;
    if (isObject(value) && typeof value.name === 'string') {
      name = value.name;
    } else if (typeof value === 'string') {
      name = value;
    } else {
      fail('player ' + (index + 1) + ' must have a name');
    }
    name = trim(name);
    if (!name) fail('player ' + (index + 1) + ' name cannot be empty');
    if (name.length > MAX_NAME_LENGTH) {
      fail('player ' + (index + 1) + ' name must be ' +
        MAX_NAME_LENGTH + ' characters or fewer');
    }
    return name;
  }

  function normalizePlayers(values) {
    var players = [];
    var i;
    if (!isArray(values)) fail('players must be an array of names');
    if (values.length < MIN_PLAYERS || values.length > MAX_PLAYERS) {
      fail('championship requires ' + MIN_PLAYERS + ' to ' +
        MAX_PLAYERS + ' players');
    }
    for (i = 0; i < values.length; i += 1) {
      players.push({ id: 'p' + (i + 1), name: normalizeName(values[i], i), seed: i });
    }
    return players;
  }

  function normalizeSeason(value, index) {
    var divisionIndex;
    var superLeague = false;
    if (isInteger(value)) {
      divisionIndex = value;
    } else if (isObject(value)) {
      divisionIndex = value.divisionIndex;
      if (typeof value.superLeague !== 'undefined') {
        if (value.superLeague !== true && value.superLeague !== false) {
          fail('season ' + (index + 1) + ' superLeague must be true or false');
        }
        superLeague = value.superLeague;
      }
    } else {
      fail('season ' + (index + 1) + ' is invalid');
    }
    if (!isInteger(divisionIndex) || divisionIndex < 0 ||
        divisionIndex >= DIVISION_TRACKS.length) {
      fail('season ' + (index + 1) + ' division must be an index from 0 to 3');
    }
    return { divisionIndex: divisionIndex, superLeague: superLeague };
  }

  function normalizeSeasons(values) {
    var source = values;
    var seasons = [];
    var i;
    if (typeof source === 'undefined' || source === null) {
      source = DEFAULT_SEASONS;
    }
    if (!isArray(source) || source.length < MIN_SEASONS ||
        source.length > MAX_SEASONS) {
      fail('championship requires ' + MIN_SEASONS + ' to ' +
        MAX_SEASONS + ' seasons');
    }
    for (i = 0; i < source.length; i += 1) {
      seasons.push(normalizeSeason(source[i], i));
    }
    return seasons;
  }

  function normalizeLegacyTracks(values) {
    var tracks = typeof values === 'undefined' || values === null ?
      copyArray(LEGACY_DEFAULT_TRACKS) : copyArray(values || []);
    var i;
    if (tracks.length !== LEGACY_ROUND_COUNT) {
      fail('legacy tracks must contain exactly 4 track indexes');
    }
    for (i = 0; i < tracks.length; i += 1) {
      if (!isInteger(tracks[i]) || tracks[i] < 0 || tracks[i] >= TRACK_NAMES.length) {
        fail('legacy track ' + (i + 1) + ' must be an index from 0 to 7');
      }
    }
    return tracks;
  }

  function seasonLabel(season) {
    return (season.superLeague ? 'Super ' : '') + DIVISION_NAMES[season.divisionIndex];
  }

  function totalRoundsFor(state) {
    return state.version === LEGACY_VERSION ? LEGACY_ROUND_COUNT :
      state.seasons.length * ROUNDS_PER_SEASON;
  }

  function racesPerRoundFor(state) {
    return state.players.length *
      (state.version === LEGACY_VERSION ? LEGACY_HEATS_PER_ROUND : 1);
  }

  function totalRacesFor(state) {
    return totalRoundsFor(state) * racesPerRoundFor(state);
  }

  function buildLegacyScheduleUnsafe(state) {
    var schedule = [];
    var roundIndex;
    var heatIndex;
    var turnIndex;
    var opponentIndex;
    var player;
    var index = 0;
    for (roundIndex = 0; roundIndex < LEGACY_ROUND_COUNT; roundIndex += 1) {
      for (heatIndex = 0; heatIndex < LEGACY_HEATS_PER_ROUND; heatIndex += 1) {
        opponentIndex = heatIndex === 0 ? 1 : 0;
        for (turnIndex = 0; turnIndex < state.players.length; turnIndex += 1) {
          player = state.players[turnIndex];
          schedule.push({
            id: 'round-' + (roundIndex + 1) + '-heat-' + (heatIndex + 1) +
              '-turn-' + (turnIndex + 1),
            index: index,
            number: index + 1,
            roundIndex: roundIndex,
            roundNumber: roundIndex + 1,
            heatIndex: heatIndex,
            heatNumber: heatIndex + 1,
            turnIndex: turnIndex,
            turnNumber: turnIndex + 1,
            trackIndex: state.tracks[roundIndex],
            trackName: TRACK_NAMES[state.tracks[roundIndex]],
            driverId: player.id,
            driverName: player.name,
            opponentId: 'cpu-' + opponentIndex,
            opponentIndex: opponentIndex,
            opponentName: OPPONENT_NAMES[opponentIndex],
            legacy: true,
            superLeague: false,
            seasonLabel: 'Legacy round ' + (roundIndex + 1)
          });
          index += 1;
        }
      }
    }
    return schedule;
  }

  function buildScheduleUnsafe(state) {
    var schedule = [];
    var seasonIndex;
    var trackInSeasonIndex;
    var turnIndex;
    var roundIndex;
    var trackIndex;
    var opponentIndex;
    var season;
    var player;
    var index = 0;
    if (state.version === LEGACY_VERSION) return buildLegacyScheduleUnsafe(state);

    for (seasonIndex = 0; seasonIndex < state.seasons.length; seasonIndex += 1) {
      season = state.seasons[seasonIndex];
      for (trackInSeasonIndex = 0; trackInSeasonIndex < ROUNDS_PER_SEASON;
          trackInSeasonIndex += 1) {
        roundIndex = seasonIndex * ROUNDS_PER_SEASON + trackInSeasonIndex;
        trackIndex = DIVISION_TRACKS[season.divisionIndex][trackInSeasonIndex];
        opponentIndex = trackInSeasonIndex === 0 ? 1 : 0;
        for (turnIndex = 0; turnIndex < state.players.length; turnIndex += 1) {
          player = state.players[turnIndex];
          schedule.push({
            id: 'season-' + (seasonIndex + 1) + '-round-' +
              (trackInSeasonIndex + 1) + '-turn-' + (turnIndex + 1),
            index: index,
            number: index + 1,
            seasonIndex: seasonIndex,
            seasonNumber: seasonIndex + 1,
            seasonLabel: seasonLabel(season),
            divisionIndex: season.divisionIndex,
            divisionNumber: 4 - season.divisionIndex,
            superLeague: season.superLeague,
            roundIndex: roundIndex,
            roundNumber: roundIndex + 1,
            trackInSeasonIndex: trackInSeasonIndex,
            turnIndex: turnIndex,
            turnNumber: turnIndex + 1,
            trackIndex: trackIndex,
            trackName: TRACK_NAMES[trackIndex],
            driverId: player.id,
            driverName: player.name,
            opponentId: 'cpu-' + opponentIndex,
            opponentIndex: opponentIndex,
            opponentName: OPPONENT_NAMES[opponentIndex],
            legacy: false
          });
          index += 1;
        }
      }
    }
    return schedule;
  }

  function normalizeSide(value, race, label) {
    if (value === 'driver' || value === race.driverId) return 'driver';
    if (value === 'opponent' || value === race.opponentId) return 'opponent';
    fail(label + ' must identify the current driver or opponent');
  }

  function normalizeMilliseconds(value, label) {
    if (typeof value === 'undefined' || value === null) return null;
    if (!isInteger(value) || value < 0) {
      fail(label + ' must be a non-negative whole number of milliseconds');
    }
    return value;
  }

  function normalizeBoolean(value, label) {
    if (typeof value === 'undefined' || value === null) return false;
    if (value !== true && value !== false) fail(label + ' must be true or false');
    return value;
  }

  function normalizeResult(value, race) {
    var winnerValue;
    var fastestValue;
    if (!isObject(value)) fail('race result must be an object');
    if (value.raceId && value.raceId !== race.id) {
      fail('result raceId does not match the current race');
    }
    if (value.driverId && value.driverId !== race.driverId) {
      fail('result driverId does not match the current driver');
    }
    if (value.skipped === true) {
      return {
        raceId: race.id,
        driverId: race.driverId,
        skipped: true,
        winner: null,
        fastestLap: null,
        driverBestLapMs: null,
        opponentBestLapMs: null,
        driverRaceTimeMs: null,
        opponentRaceTimeMs: null,
        driverWrecked: false,
        opponentWrecked: false
      };
    }
    winnerValue = typeof value.winner !== 'undefined' ? value.winner : value.winnerId;
    fastestValue = typeof value.fastestLap !== 'undefined' ?
      value.fastestLap : value.fastestLapId;
    return {
      raceId: race.id,
      driverId: race.driverId,
      skipped: false,
      winner: normalizeSide(winnerValue, race, 'winner'),
      fastestLap: normalizeSide(fastestValue, race, 'fastestLap'),
      driverBestLapMs: normalizeMilliseconds(value.driverBestLapMs, 'driverBestLapMs'),
      opponentBestLapMs: normalizeMilliseconds(value.opponentBestLapMs, 'opponentBestLapMs'),
      driverRaceTimeMs: normalizeMilliseconds(value.driverRaceTimeMs, 'driverRaceTimeMs'),
      opponentRaceTimeMs: normalizeMilliseconds(value.opponentRaceTimeMs, 'opponentRaceTimeMs'),
      driverWrecked: normalizeBoolean(value.driverWrecked, 'driverWrecked'),
      opponentWrecked: normalizeBoolean(value.opponentWrecked, 'opponentWrecked')
    };
  }

  function assertState(state) {
    var schedule;
    var i;
    var player;
    var normalized;
    var total;
    if (!isObject(state)) fail('state must be an object');
    if (state.schema !== SCHEMA) fail('unrecognized save schema');
    if (state.version !== VERSION && state.version !== PRIOR_VERSION &&
        state.version !== LEGACY_VERSION) {
      fail('unsupported save version ' + state.version);
    }
    if (!isArray(state.players) || state.players.length < MIN_PLAYERS ||
        state.players.length > MAX_PLAYERS) fail('saved player list is invalid');
    for (i = 0; i < state.players.length; i += 1) {
      player = state.players[i];
      if (!isObject(player) || player.id !== 'p' + (i + 1) ||
          player.seed !== i || normalizeName(player.name, i) !== player.name) {
        fail('saved player ' + (i + 1) + ' is invalid');
      }
    }
    if (state.version === LEGACY_VERSION) normalizeLegacyTracks(state.tracks);
    else normalizeSeasons(state.seasons);
    total = totalRacesFor(state);
    if (!isInteger(state.nextRaceIndex) || state.nextRaceIndex < 0 ||
        state.nextRaceIndex > total) fail('nextRaceIndex is invalid');
    if (!isArray(state.results) || state.results.length !== state.nextRaceIndex) {
      fail('results must be a contiguous completed-race list');
    }
    if (state.complete !== (state.nextRaceIndex === total)) {
      fail('complete flag does not match race progress');
    }
    schedule = buildScheduleUnsafe(state);
    for (i = 0; i < state.results.length; i += 1) {
      if (!isObject(state.results[i]) || state.results[i].raceId !== schedule[i].id ||
          state.results[i].driverId !== schedule[i].driverId) {
        fail('saved result ' + (i + 1) + ' is out of sequence');
      }
      normalized = normalizeResult(state.results[i], schedule[i]);
      if (normalized.skipped !== (state.results[i].skipped === true) ||
          normalized.winner !== state.results[i].winner ||
          normalized.fastestLap !== state.results[i].fastestLap) {
        fail('saved result ' + (i + 1) + ' is invalid');
      }
    }
    return true;
  }

  function canonicalState(state) {
    var players = [];
    var results = [];
    var schedule;
    var canonical;
    var i;
    assertState(state);
    schedule = buildScheduleUnsafe(state);
    for (i = 0; i < state.players.length; i += 1) {
      players.push({ id: state.players[i].id, name: state.players[i].name,
        seed: state.players[i].seed });
    }
    for (i = 0; i < state.results.length; i += 1) {
      results.push(normalizeResult(state.results[i], schedule[i]));
    }
    canonical = {
      schema: SCHEMA,
      version: state.version === LEGACY_VERSION ? LEGACY_VERSION : VERSION,
      players: players,
      nextRaceIndex: state.nextRaceIndex,
      results: results,
      complete: state.complete
    };
    if (state.version === LEGACY_VERSION) {
      canonical.tracks = normalizeLegacyTracks(state.tracks);
    } else {
      canonical.seasons = normalizeSeasons(state.seasons);
    }
    return canonical;
  }

  function create(playerNames, options) {
    var playersInput = playerNames;
    var settings = options || {};
    if (isObject(playerNames) && !isArray(playerNames)) {
      settings = playerNames;
      playersInput = settings.players;
    }
    if (typeof settings.tracks !== 'undefined') {
      fail('new championships select seasons, not individual tracks');
    }
    return {
      schema: SCHEMA,
      version: VERSION,
      players: normalizePlayers(playersInput),
      seasons: normalizeSeasons(settings.seasons),
      nextRaceIndex: 0,
      results: [],
      complete: false
    };
  }

  function getSchedule(state) {
    assertState(state);
    return buildScheduleUnsafe(state);
  }

  function getCurrentRace(state) {
    var schedule;
    assertState(state);
    if (state.complete) return null;
    schedule = buildScheduleUnsafe(state);
    return schedule[state.nextRaceIndex];
  }

  function recordResult(state, result) {
    var schedule;
    var normalized;
    assertState(state);
    if (state.complete) fail('championship is already complete');
    schedule = buildScheduleUnsafe(state);
    normalized = normalizeResult(result, schedule[state.nextRaceIndex]);
    state.results.push(normalized);
    state.nextRaceIndex += 1;
    state.complete = state.nextRaceIndex === schedule.length;
    return state;
  }

  function skipCurrentRound(state) {
    var schedule;
    var racesPerRound;
    var roundIndex;
    var end;
    var skippedCount = 0;
    var race;
    assertState(state);
    if (state.complete) fail('championship is already complete');
    schedule = buildScheduleUnsafe(state);
    racesPerRound = racesPerRoundFor(state);
    roundIndex = Math.floor(state.nextRaceIndex / racesPerRound);
    end = Math.min((roundIndex + 1) * racesPerRound, schedule.length);
    while (state.nextRaceIndex < end) {
      race = schedule[state.nextRaceIndex];
      state.results.push(normalizeResult({
        raceId: race.id,
        driverId: race.driverId,
        skipped: true
      }, race));
      state.nextRaceIndex += 1;
      skippedCount += 1;
    }
    state.complete = state.nextRaceIndex === schedule.length;
    return {
      roundIndex: roundIndex,
      skippedCount: skippedCount,
      roundBonus: getRoundBonuses(state, roundIndex),
      complete: state.complete
    };
  }

  function positiveMinimum(values) {
    var minimum = null;
    var i;
    for (i = 0; i < values.length; i += 1) {
      if (values[i].value > 0 && (minimum === null || values[i].value < minimum)) {
        minimum = values[i].value;
      }
    }
    return minimum;
  }

  function getRoundBonuses(state, roundIndex) {
    var schedule;
    var racesPerRound;
    var totalRounds;
    var start;
    var end;
    var lapTimes = [];
    var raceTimes = [];
    var lapMinimum;
    var raceMinimum;
    var lapWinners = [];
    var raceWinners = [];
    var race;
    var result;
    var i;
    assertState(state);
    totalRounds = totalRoundsFor(state);
    if (!isInteger(roundIndex) || roundIndex < 0 || roundIndex >= totalRounds) {
      fail('roundIndex must identify a championship round');
    }
    racesPerRound = racesPerRoundFor(state);
    start = roundIndex * racesPerRound;
    end = start + racesPerRound;
    schedule = buildScheduleUnsafe(state);
    if (state.version === LEGACY_VERSION) {
      return {
        supported: false,
        legacy: true,
        complete: state.nextRaceIndex >= end,
        roundIndex: roundIndex,
        roundNumber: roundIndex + 1,
        trackIndex: schedule[start].trackIndex,
        trackName: schedule[start].trackName,
        lapTimeMs: null,
        raceTimeMs: null,
        lapWinners: [],
        raceWinners: []
      };
    }
    if (state.nextRaceIndex >= end) {
      for (i = start; i < end; i += 1) {
        race = schedule[i];
        result = state.results[i];
        lapTimes.push({ playerId: race.driverId, name: race.driverName,
          seed: race.turnIndex, value: result.driverBestLapMs || 0 });
        raceTimes.push({ playerId: race.driverId, name: race.driverName,
          seed: race.turnIndex, value: result.driverRaceTimeMs || 0 });
      }
      lapMinimum = positiveMinimum(lapTimes);
      raceMinimum = positiveMinimum(raceTimes);
      for (i = 0; i < lapTimes.length; i += 1) {
        if (lapMinimum !== null && lapTimes[i].value === lapMinimum) {
          lapWinners.push(lapTimes[i]);
        }
        if (raceMinimum !== null && raceTimes[i].value === raceMinimum) {
          raceWinners.push(raceTimes[i]);
        }
      }
    } else {
      lapMinimum = null;
      raceMinimum = null;
    }
    race = schedule[start];
    return {
      supported: true,
      legacy: false,
      complete: state.nextRaceIndex >= end,
      roundIndex: roundIndex,
      roundNumber: roundIndex + 1,
      seasonIndex: race.seasonIndex,
      seasonNumber: race.seasonNumber,
      seasonLabel: race.seasonLabel,
      trackIndex: race.trackIndex,
      trackName: race.trackName,
      lapTimeMs: lapMinimum,
      raceTimeMs: raceMinimum,
      lapWinners: lapWinners,
      raceWinners: raceWinners
    };
  }

  function getStandings(state) {
    var rows = [];
    var byId = {};
    var schedule;
    var race;
    var result;
    var bonus;
    var row;
    var i;
    var j;
    assertState(state);
    schedule = buildScheduleUnsafe(state);
    for (i = 0; i < state.players.length; i += 1) {
      row = {
        rank: 0,
        playerId: state.players[i].id,
        name: state.players[i].name,
        seed: state.players[i].seed,
        raced: 0,
        wins: 0,
        fastestLaps: 0,
        trackFastestLaps: 0,
        trackFastestRaces: 0,
        trackBonusPoints: 0,
        points: 0
      };
      rows.push(row);
      byId[row.playerId] = row;
    }
    for (i = 0; i < state.results.length; i += 1) {
      race = schedule[i];
      result = state.results[i];
      if (result.skipped) continue;
      row = byId[race.driverId];
      row.raced += 1;
      if (result.winner === 'driver') {
        row.wins += 1;
        row.points += WIN_POINTS;
      }
      if (result.fastestLap === 'driver') {
        row.fastestLaps += 1;
        row.points += FASTEST_LAP_POINTS;
      }
    }
    if (state.version !== LEGACY_VERSION) {
      for (i = 0; i < totalRoundsFor(state); i += 1) {
        bonus = getRoundBonuses(state, i);
        if (!bonus.complete) continue;
        for (j = 0; j < bonus.lapWinners.length; j += 1) {
          row = byId[bonus.lapWinners[j].playerId];
          row.trackFastestLaps += 1;
          row.trackBonusPoints += TRACK_LAP_BONUS_POINTS;
          row.points += TRACK_LAP_BONUS_POINTS;
        }
        for (j = 0; j < bonus.raceWinners.length; j += 1) {
          row = byId[bonus.raceWinners[j].playerId];
          row.trackFastestRaces += 1;
          row.trackBonusPoints += TRACK_RACE_BONUS_POINTS;
          row.points += TRACK_RACE_BONUS_POINTS;
        }
      }
    }
    rows.sort(function (a, b) {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.seed - b.seed;
    });
    for (i = 0; i < rows.length; i += 1) rows[i].rank = i + 1;
    return rows;
  }

  function getProgress(state) {
    var total;
    var racesPerRound;
    var totalRounds;
    var roundIndex;
    var completedInRound;
    assertState(state);
    total = totalRacesFor(state);
    racesPerRound = racesPerRoundFor(state);
    totalRounds = totalRoundsFor(state);
    roundIndex = state.complete ? totalRounds :
      Math.floor(state.nextRaceIndex / racesPerRound);
    completedInRound = state.complete ? racesPerRound :
      state.nextRaceIndex % racesPerRound;
    return {
      completedRaces: state.nextRaceIndex,
      totalRaces: total,
      roundIndex: roundIndex,
      roundNumber: state.complete ? totalRounds : roundIndex + 1,
      totalRounds: totalRounds,
      completedInRound: completedInRound,
      racesPerRound: racesPerRound,
      seasonCount: state.version === LEGACY_VERSION ? null : state.seasons.length,
      legacy: state.version === LEGACY_VERSION,
      complete: state.complete
    };
  }

  function isComplete(state) {
    assertState(state);
    return state.complete;
  }

  function getChampion(state) {
    var standings;
    assertState(state);
    if (!state.complete) return null;
    standings = getStandings(state);
    return standings[0];
  }

  function serialize(state) {
    return JSON.stringify(canonicalState(state));
  }

  function restore(saved) {
    var parsed = saved;
    if (typeof saved === 'string') {
      try { parsed = JSON.parse(saved); }
      catch (error) { fail('save data is not valid JSON'); }
    }
    return canonicalState(parsed);
  }

  function resolveStorage(storage) {
    var value = storage;
    if (!value && root && root.localStorage) value = root.localStorage;
    if (!value || typeof value.getItem !== 'function' ||
        typeof value.setItem !== 'function') {
      fail('a localStorage-compatible object is required');
    }
    return value;
  }

  function save(state, storage, key) {
    var value = serialize(state);
    var target = resolveStorage(storage);
    target.setItem(key || STORAGE_KEY, value);
    return value;
  }

  function load(storage, key) {
    var target = resolveStorage(storage);
    var value = target.getItem(key || STORAGE_KEY);
    if (value === null || typeof value === 'undefined' || value === '') return null;
    return restore(value);
  }

  function clear(storage, key) {
    var target = resolveStorage(storage);
    if (typeof target.removeItem !== 'function') {
      fail('storage object does not support removeItem');
    }
    target.removeItem(key || STORAGE_KEY);
  }

  return {
    schema: SCHEMA,
    version: VERSION,
    priorVersion: PRIOR_VERSION,
    legacyVersion: LEGACY_VERSION,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    maxNameLength: MAX_NAME_LENGTH,
    minSeasons: MIN_SEASONS,
    maxSeasons: MAX_SEASONS,
    roundsPerSeason: ROUNDS_PER_SEASON,
    roundCount: LEGACY_ROUND_COUNT,
    heatsPerRound: LEGACY_HEATS_PER_ROUND,
    winPoints: WIN_POINTS,
    fastestLapPoints: FASTEST_LAP_POINTS,
    trackLapBonusPoints: TRACK_LAP_BONUS_POINTS,
    trackRaceBonusPoints: TRACK_RACE_BONUS_POINTS,
    storageKey: STORAGE_KEY,
    trackNames: copyArray(TRACK_NAMES),
    divisionNames: copyArray(DIVISION_NAMES),
    divisionTracks: copyDivisionTracks(),
    opponentNames: copyArray(OPPONENT_NAMES),
    defaultSeasons: copySeasons(DEFAULT_SEASONS),
    defaultTracks: copyArray(LEGACY_DEFAULT_TRACKS),
    seasonLabel: seasonLabel,
    create: create,
    validate: assertState,
    getSchedule: getSchedule,
    getCurrentRace: getCurrentRace,
    recordResult: recordResult,
    skipCurrentRound: skipCurrentRound,
    getRoundBonuses: getRoundBonuses,
    getStandings: getStandings,
    getProgress: getProgress,
    isComplete: isComplete,
    getChampion: getChampion,
    serialize: serialize,
    restore: restore,
    save: save,
    load: load,
    clear: clear
  };
}));
