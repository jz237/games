/**
 * Computer Link championship model.
 *
 * The original link mode uses a different fixture structure from the local
 * pass-the-controls championship. Two machines host one driver each per
 * fixture. With 3-8 named drivers, every driver appears twice on each track;
 * the two-driver special case has one head-to-head fixture per track. Pairing
 * order is copied from TAB.58146 in the original source.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.SCR_LinkChampionship = api;
}(typeof window !== 'undefined' ? window :
  (typeof global !== 'undefined' ? global : this), function (root) {
  'use strict';

  var SCHEMA = 'scr-link-championship';
  var VERSION = 2;
  var PRIOR_VERSION = 1;
  var MIN_PLAYERS = 2;
  var MAX_PLAYERS = 8;
  var MAX_NAME_LENGTH = 12;
  var MIN_SEASONS = 1;
  var MAX_SEASONS = 4;
  var ROUNDS_PER_SEASON = 2;
  var WIN_POINTS = 2;
  var FASTEST_LAP_POINTS = 1;
  var TRACK_LAP_BONUS_POINTS = 1;
  var TRACK_RACE_BONUS_POINTS = 2;
  var STORAGE_KEY = 'scr_link_championship';
  var objectToString = Object.prototype.toString;

  var TRACK_NAMES = [
    'Little Ramp', 'Stepping Stones', 'Hump Back', 'Big Ramp',
    'Ski Jump', 'Draw Bridge', 'High Jump', 'Roller Coaster'
  ];
  var DIVISION_NAMES = ['Division 4', 'Division 3', 'Division 2', 'Division 1'];
  var DIVISION_TRACKS = [[0, 2], [1, 3], [6, 7], [4, 5]];
  var DEFAULT_SEASONS = [{ divisionIndex: 0, superLeague: false }];

  /* Original TAB.58146 pair order, indexed by player count. */
  var PAIRINGS = {
    2: [[0, 1]],
    3: [[0, 1], [0, 2], [1, 2]],
    4: [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [2, 1]],
    5: [[0, 1], [2, 3], [4, 0], [1, 2], [3, 4],
        [0, 2], [1, 3], [4, 2], [0, 3], [1, 4]],
    6: [[0, 1], [2, 3], [4, 5], [1, 2], [0, 5], [3, 4],
        [0, 2], [3, 5], [1, 4], [0, 3], [4, 2], [5, 1],
        [0, 4], [1, 3], [2, 5]],
    7: [[0, 1], [2, 3], [4, 5], [6, 0], [1, 2], [3, 4], [5, 6],
        [0, 2], [1, 4], [3, 5], [6, 2], [0, 4], [1, 5], [3, 6],
        [2, 4], [0, 5], [1, 3], [6, 4], [0, 3], [1, 6], [2, 5]],
    8: [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6],
        [5, 7], [0, 3], [1, 2], [4, 7], [5, 6], [0, 4], [3, 7],
        [1, 5], [2, 6], [0, 5], [1, 4], [2, 7], [3, 6], [0, 7],
        [1, 6], [2, 5], [3, 4], [0, 6], [1, 7], [2, 4], [3, 5]]
  };

  function fail(message) { throw new Error('SCR_LinkChampionship: ' + message); }
  function isArray(value) {
    return Array.isArray ? Array.isArray(value) :
      objectToString.call(value) === '[object Array]';
  }
  function isObject(value) {
    return value !== null && typeof value === 'object' && !isArray(value);
  }
  function isInteger(value) {
    return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
  }
  function trim(value) { return value.replace(/^\s+|\s+$/g, ''); }
  function copyArray(values) { return values.slice(0); }
  function copyDivisionTracks() {
    return DIVISION_TRACKS.map(function (tracks) { return copyArray(tracks); });
  }
  function copyPairings() {
    var copy = {};
    var count;
    for (count = MIN_PLAYERS; count <= MAX_PLAYERS; count += 1) {
      copy[count] = PAIRINGS[count].map(function (pair) { return copyArray(pair); });
    }
    return copy;
  }

  function normalizeName(value, index) {
    var name = isObject(value) && typeof value.name === 'string' ? value.name : value;
    if (typeof name !== 'string') fail('player ' + (index + 1) + ' must have a name');
    name = trim(name);
    if (!name) fail('player ' + (index + 1) + ' name cannot be empty');
    if (name.length > MAX_NAME_LENGTH) {
      fail('player ' + (index + 1) + ' name must be ' + MAX_NAME_LENGTH +
        ' characters or fewer');
    }
    return name;
  }

  function normalizePlayers(values) {
    var players = [];
    var i;
    if (!isArray(values) || values.length < MIN_PLAYERS || values.length > MAX_PLAYERS) {
      fail('championship requires 2 to 8 players');
    }
    for (i = 0; i < values.length; i += 1) {
      players.push({ id: 'p' + (i + 1), name: normalizeName(values[i], i), seed: i });
    }
    return players;
  }

  function normalizeSeason(value, index) {
    var divisionIndex;
    var superLeague = false;
    if (isInteger(value)) divisionIndex = value;
    else if (isObject(value)) {
      divisionIndex = value.divisionIndex;
      if (typeof value.superLeague !== 'undefined') {
        if (value.superLeague !== true && value.superLeague !== false) {
          fail('season ' + (index + 1) + ' superLeague must be true or false');
        }
        superLeague = value.superLeague;
      }
    } else fail('season ' + (index + 1) + ' is invalid');
    if (!isInteger(divisionIndex) || divisionIndex < 0 || divisionIndex > 3) {
      fail('season ' + (index + 1) + ' division must be an index from 0 to 3');
    }
    return { divisionIndex: divisionIndex, superLeague: superLeague };
  }

  function normalizeSeasons(values) {
    var source = values == null ? DEFAULT_SEASONS : values;
    var seasons = [];
    var i;
    if (!isArray(source) || source.length < MIN_SEASONS || source.length > MAX_SEASONS) {
      fail('championship requires 1 to 4 seasons');
    }
    for (i = 0; i < source.length; i += 1) seasons.push(normalizeSeason(source[i], i));
    return seasons;
  }

  function seasonLabel(season) {
    return (season.superLeague ? 'Super ' : '') + DIVISION_NAMES[season.divisionIndex];
  }

  function fixturesPerRoundForPlayerCount(playerCount) {
    return playerCount === 2 ? 1 : playerCount;
  }

  function totalRoundsFor(state) { return state.seasons.length * ROUNDS_PER_SEASON; }
  function totalFixturesFor(state) {
    return totalRoundsFor(state) * fixturesPerRoundForPlayerCount(state.players.length);
  }

  function buildScheduleUnsafe(state) {
    var schedule = [];
    var pairSequence = PAIRINGS[state.players.length];
    var perRound = fixturesPerRoundForPlayerCount(state.players.length);
    var pairCursor = 0;
    var fixtureIndex = 0;
    var seasonIndex;
    var trackInSeasonIndex;
    var roundIndex;
    var roundFixtureIndex;
    var pair;
    var season;
    var hostPlayer;
    var guestPlayer;
    var trackIndex;
    for (seasonIndex = 0; seasonIndex < state.seasons.length; seasonIndex += 1) {
      season = state.seasons[seasonIndex];
      for (trackInSeasonIndex = 0; trackInSeasonIndex < ROUNDS_PER_SEASON;
          trackInSeasonIndex += 1) {
        roundIndex = seasonIndex * ROUNDS_PER_SEASON + trackInSeasonIndex;
        trackIndex = DIVISION_TRACKS[season.divisionIndex][trackInSeasonIndex];
        for (roundFixtureIndex = 0; roundFixtureIndex < perRound; roundFixtureIndex += 1) {
          pair = pairSequence[pairCursor % pairSequence.length];
          pairCursor += 1;
          hostPlayer = state.players[pair[0]];
          guestPlayer = state.players[pair[1]];
          schedule.push({
            id: 'season-' + (seasonIndex + 1) + '-round-' +
              (trackInSeasonIndex + 1) + '-fixture-' + (roundFixtureIndex + 1),
            index: fixtureIndex,
            number: fixtureIndex + 1,
            seasonIndex: seasonIndex,
            seasonNumber: seasonIndex + 1,
            seasonLabel: seasonLabel(season),
            divisionIndex: season.divisionIndex,
            divisionNumber: 4 - season.divisionIndex,
            superLeague: season.superLeague,
            roundIndex: roundIndex,
            roundNumber: roundIndex + 1,
            trackInSeasonIndex: trackInSeasonIndex,
            trackIndex: trackIndex,
            trackName: TRACK_NAMES[trackIndex],
            roundFixtureIndex: roundFixtureIndex,
            roundFixtureNumber: roundFixtureIndex + 1,
            hostPlayerId: hostPlayer.id,
            hostPlayerName: hostPlayer.name,
            guestPlayerId: guestPlayer.id,
            guestPlayerName: guestPlayer.name,
            pairIndex: (pairCursor - 1) % pairSequence.length
          });
          fixtureIndex += 1;
        }
      }
    }
    return schedule;
  }

  function normalizeMilliseconds(value, label) {
    if (value == null) return null;
    if (!isInteger(value) || value < 0) fail(label + ' must be a non-negative whole number');
    return value;
  }

  function normalizeDriverResult(value, expectedId, label) {
    if (!isObject(value) || value.playerId !== expectedId) {
      fail(label + ' must identify ' + expectedId);
    }
    if (value.wrecked !== true && value.wrecked !== false) {
      fail(label + ' wrecked must be true or false');
    }
    return {
      playerId: expectedId,
      bestLapMs: normalizeMilliseconds(value.bestLapMs, label + ' bestLapMs'),
      raceTimeMs: normalizeMilliseconds(value.raceTimeMs, label + ' raceTimeMs'),
      wrecked: value.wrecked
    };
  }

  function normalizeAwardedPlayer(value, fixture, label) {
    if (value !== fixture.hostPlayerId && value !== fixture.guestPlayerId) {
      fail(label + ' must identify one of the fixture drivers');
    }
    return value;
  }

  function normalizeResult(value, fixture) {
    if (!isObject(value)) fail('fixture result must be an object');
    if (value.fixtureId && value.fixtureId !== fixture.id) {
      fail('result fixtureId does not match the current fixture');
    }
    if (value.skipped === true) {
      return {
        fixtureId: fixture.id,
        skipped: true,
        host: null,
        guest: null,
        winnerId: null,
        fastestLapWinnerId: null
      };
    }
    return {
      fixtureId: fixture.id,
      skipped: false,
      host: normalizeDriverResult(value.host, fixture.hostPlayerId, 'host result'),
      guest: normalizeDriverResult(value.guest, fixture.guestPlayerId, 'guest result'),
      winnerId: normalizeAwardedPlayer(value.winnerId, fixture, 'winnerId'),
      fastestLapWinnerId: normalizeAwardedPlayer(
        value.fastestLapWinnerId, fixture, 'fastestLapWinnerId')
    };
  }

  function resolveFixtureResult(fixture, hostValue, guestValue, firstFinishedPlayerId) {
    var host;
    var guest;
    var winnerId;
    var fastestLapWinnerId;
    if (!isObject(fixture) || !fixture.id || !fixture.hostPlayerId ||
        !fixture.guestPlayerId) fail('fixture is invalid');
    host = normalizeDriverResult(hostValue, fixture.hostPlayerId, 'host result');
    guest = normalizeDriverResult(guestValue, fixture.guestPlayerId, 'guest result');
    if (firstFinishedPlayerId !== fixture.hostPlayerId &&
        firstFinishedPlayerId !== fixture.guestPlayerId) {
      fail('firstFinishedPlayerId must identify one of the fixture drivers');
    }
    if (host.wrecked && !guest.wrecked) winnerId = fixture.guestPlayerId;
    else if (guest.wrecked && !host.wrecked) winnerId = fixture.hostPlayerId;
    else if (host.wrecked && guest.wrecked) {
      /* The first car wrecked loses, so award the other driver. */
      winnerId = firstFinishedPlayerId === fixture.hostPlayerId ?
        fixture.guestPlayerId : fixture.hostPlayerId;
    } else winnerId = firstFinishedPlayerId;

    if (host.wrecked || guest.wrecked) {
      /* Retiring/wrecking forfeits both the win and per-race best-lap point. */
      fastestLapWinnerId = winnerId;
    } else if (host.bestLapMs > 0 && guest.bestLapMs > 0) {
      fastestLapWinnerId = host.bestLapMs < guest.bestLapMs ? fixture.hostPlayerId :
        (guest.bestLapMs < host.bestLapMs ? fixture.guestPlayerId : firstFinishedPlayerId);
    } else if (host.bestLapMs > 0) fastestLapWinnerId = fixture.hostPlayerId;
    else if (guest.bestLapMs > 0) fastestLapWinnerId = fixture.guestPlayerId;
    else fastestLapWinnerId = winnerId;

    return normalizeResult({
      fixtureId: fixture.id,
      host: host,
      guest: guest,
      winnerId: winnerId,
      fastestLapWinnerId: fastestLapWinnerId
    }, fixture);
  }

  function assertState(state) {
    var schedule;
    var total;
    var player;
    var normalized;
    var i;
    if (!isObject(state)) fail('state must be an object');
    if (state.schema !== SCHEMA) fail('unrecognized save schema');
    if (state.version !== VERSION && state.version !== PRIOR_VERSION) {
      fail('unsupported save version ' + state.version);
    }
    if (!isArray(state.players) || state.players.length < MIN_PLAYERS ||
        state.players.length > MAX_PLAYERS) fail('saved player list is invalid');
    for (i = 0; i < state.players.length; i += 1) {
      player = state.players[i];
      if (!isObject(player) || player.id !== 'p' + (i + 1) || player.seed !== i ||
          normalizeName(player.name, i) !== player.name) {
        fail('saved player ' + (i + 1) + ' is invalid');
      }
    }
    normalizeSeasons(state.seasons);
    total = totalFixturesFor(state);
    if (!isInteger(state.nextFixtureIndex) || state.nextFixtureIndex < 0 ||
        state.nextFixtureIndex > total) fail('nextFixtureIndex is invalid');
    if (!isArray(state.results) || state.results.length !== state.nextFixtureIndex) {
      fail('results must be a contiguous completed-fixture list');
    }
    if (state.complete !== (state.nextFixtureIndex === total)) {
      fail('complete flag does not match fixture progress');
    }
    schedule = buildScheduleUnsafe(state);
    for (i = 0; i < state.results.length; i += 1) {
      if (!isObject(state.results[i]) || state.results[i].fixtureId !== schedule[i].id) {
        fail('saved result ' + (i + 1) + ' is out of sequence');
      }
      normalized = normalizeResult(state.results[i], schedule[i]);
      if (normalized.skipped !== (state.results[i].skipped === true) ||
          normalized.winnerId !== state.results[i].winnerId ||
          normalized.fastestLapWinnerId !== state.results[i].fastestLapWinnerId) {
        fail('saved result ' + (i + 1) + ' is invalid');
      }
    }
    return true;
  }

  function canonicalState(state) {
    var schedule;
    var players = [];
    var seasons = [];
    var results = [];
    var i;
    assertState(state);
    schedule = buildScheduleUnsafe(state);
    for (i = 0; i < state.players.length; i += 1) {
      players.push({ id: state.players[i].id, name: state.players[i].name,
        seed: state.players[i].seed });
    }
    for (i = 0; i < state.seasons.length; i += 1) {
      seasons.push(normalizeSeason(state.seasons[i], i));
    }
    for (i = 0; i < state.results.length; i += 1) {
      results.push(normalizeResult(state.results[i], schedule[i]));
    }
    return {
      schema: SCHEMA,
      version: VERSION,
      players: players,
      seasons: seasons,
      nextFixtureIndex: state.nextFixtureIndex,
      results: results,
      complete: state.complete
    };
  }

  function create(playerNames, options) {
    var playersInput = playerNames;
    var settings = options || {};
    if (isObject(playerNames) && !isArray(playerNames)) {
      settings = playerNames;
      playersInput = settings.players;
    }
    return {
      schema: SCHEMA,
      version: VERSION,
      players: normalizePlayers(playersInput),
      seasons: normalizeSeasons(settings.seasons),
      nextFixtureIndex: 0,
      results: [],
      complete: false
    };
  }

  function getSchedule(state) { assertState(state); return buildScheduleUnsafe(state); }
  function getCurrentFixture(state) {
    assertState(state);
    return state.complete ? null : buildScheduleUnsafe(state)[state.nextFixtureIndex];
  }
  function recordResult(state, value) {
    var fixture;
    assertState(state);
    if (state.complete) fail('championship is already complete');
    fixture = buildScheduleUnsafe(state)[state.nextFixtureIndex];
    state.results.push(normalizeResult(value, fixture));
    state.nextFixtureIndex += 1;
    state.complete = state.nextFixtureIndex === totalFixturesFor(state);
    return state;
  }

  function skipCurrentRound(state) {
    var schedule;
    var perRound;
    var roundIndex;
    var end;
    var fixture;
    var skippedCount = 0;
    assertState(state);
    if (state.complete) fail('championship is already complete');
    if (state.players.length === 2) {
      fail('the original two-driver link championship cannot skip a round');
    }
    schedule = buildScheduleUnsafe(state);
    perRound = fixturesPerRoundForPlayerCount(state.players.length);
    roundIndex = Math.floor(state.nextFixtureIndex / perRound);
    end = Math.min((roundIndex + 1) * perRound, schedule.length);
    while (state.nextFixtureIndex < end) {
      fixture = schedule[state.nextFixtureIndex];
      state.results.push(normalizeResult({
        fixtureId: fixture.id,
        skipped: true
      }, fixture));
      state.nextFixtureIndex += 1;
      skippedCount += 1;
    }
    state.complete = state.nextFixtureIndex === schedule.length;
    return {
      roundIndex: roundIndex,
      skippedCount: skippedCount,
      roundBonus: getRoundBonuses(state, roundIndex),
      complete: state.complete
    };
  }

  function minimumPositive(entries) {
    var minimum = null;
    var i;
    for (i = 0; i < entries.length; i += 1) {
      if (entries[i].value > 0 && (minimum === null || entries[i].value < minimum)) {
        minimum = entries[i].value;
      }
    }
    return minimum;
  }

  function getRoundBonuses(state, roundIndex) {
    var perRound;
    var totalRounds;
    var start;
    var end;
    var schedule;
    var byId = {};
    var lapEntries = [];
    var raceEntries = [];
    var lapMinimum;
    var raceMinimum;
    var fixture;
    var result;
    var driverResult;
    var player;
    var i;
    var side;
    assertState(state);
    totalRounds = totalRoundsFor(state);
    if (!isInteger(roundIndex) || roundIndex < 0 || roundIndex >= totalRounds) {
      fail('roundIndex must identify a championship round');
    }
    perRound = fixturesPerRoundForPlayerCount(state.players.length);
    start = roundIndex * perRound;
    end = start + perRound;
    schedule = buildScheduleUnsafe(state);
    for (i = 0; i < state.players.length; i += 1) {
      player = state.players[i];
      byId[player.id] = { playerId: player.id, name: player.name, seed: player.seed,
        bestLapMs: null, raceTimeMs: null };
    }
    if (state.nextFixtureIndex >= end) {
      for (i = start; i < end; i += 1) {
        fixture = schedule[i];
        result = state.results[i];
        if (result.skipped) continue;
        for (side = 0; side < 2; side += 1) {
          driverResult = side === 0 ? result.host : result.guest;
          player = byId[driverResult.playerId];
          if (driverResult.bestLapMs > 0 &&
              (player.bestLapMs === null || driverResult.bestLapMs < player.bestLapMs)) {
            player.bestLapMs = driverResult.bestLapMs;
          }
          if (driverResult.raceTimeMs > 0 &&
              (player.raceTimeMs === null || driverResult.raceTimeMs < player.raceTimeMs)) {
            player.raceTimeMs = driverResult.raceTimeMs;
          }
        }
      }
    }
    for (i = 0; i < state.players.length; i += 1) {
      player = byId[state.players[i].id];
      lapEntries.push({ playerId: player.playerId, name: player.name,
        seed: player.seed, value: player.bestLapMs || 0 });
      raceEntries.push({ playerId: player.playerId, name: player.name,
        seed: player.seed, value: player.raceTimeMs || 0 });
    }
    lapMinimum = minimumPositive(lapEntries);
    raceMinimum = minimumPositive(raceEntries);
    fixture = schedule[start];
    return {
      complete: state.nextFixtureIndex >= end,
      roundIndex: roundIndex,
      roundNumber: roundIndex + 1,
      seasonIndex: fixture.seasonIndex,
      seasonNumber: fixture.seasonNumber,
      seasonLabel: fixture.seasonLabel,
      trackIndex: fixture.trackIndex,
      trackName: fixture.trackName,
      lapTimeMs: lapMinimum,
      raceTimeMs: raceMinimum,
      lapWinners: lapMinimum === null ? [] : lapEntries.filter(function (entry) {
        return entry.value === lapMinimum;
      }),
      raceWinners: raceMinimum === null ? [] : raceEntries.filter(function (entry) {
        return entry.value === raceMinimum;
      })
    };
  }

  function getStandings(state) {
    var rows = [];
    var byId = {};
    var bonus;
    var result;
    var row;
    var i;
    var j;
    assertState(state);
    for (i = 0; i < state.players.length; i += 1) {
      row = { rank: 0, playerId: state.players[i].id, name: state.players[i].name,
        seed: state.players[i].seed, raced: 0, wins: 0, fastestLaps: 0,
        trackFastestLaps: 0, trackFastestRaces: 0, trackBonusPoints: 0, points: 0 };
      rows.push(row);
      byId[row.playerId] = row;
    }
    for (i = 0; i < state.results.length; i += 1) {
      result = state.results[i];
      if (result.skipped) continue;
      byId[result.host.playerId].raced += 1;
      byId[result.guest.playerId].raced += 1;
      byId[result.winnerId].wins += 1;
      byId[result.winnerId].points += WIN_POINTS;
      byId[result.fastestLapWinnerId].fastestLaps += 1;
      byId[result.fastestLapWinnerId].points += FASTEST_LAP_POINTS;
    }
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
    rows.sort(function (a, b) {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.seed - b.seed;
    });
    for (i = 0; i < rows.length; i += 1) rows[i].rank = i + 1;
    return rows;
  }

  function getProgress(state) {
    var perRound;
    var totalRounds;
    var roundIndex;
    assertState(state);
    perRound = fixturesPerRoundForPlayerCount(state.players.length);
    totalRounds = totalRoundsFor(state);
    roundIndex = state.complete ? totalRounds : Math.floor(state.nextFixtureIndex / perRound);
    return {
      completedFixtures: state.nextFixtureIndex,
      totalFixtures: totalFixturesFor(state),
      fixturesPerRound: perRound,
      roundIndex: roundIndex,
      roundNumber: state.complete ? totalRounds : roundIndex + 1,
      totalRounds: totalRounds,
      completedInRound: state.complete ? perRound : state.nextFixtureIndex % perRound,
      seasonCount: state.seasons.length,
      complete: state.complete
    };
  }

  function serialize(state) { return JSON.stringify(canonicalState(state)); }
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
        typeof value.setItem !== 'function') fail('a localStorage-compatible object is required');
    return value;
  }
  function save(state, storage, key) {
    var value = serialize(state);
    resolveStorage(storage).setItem(key || STORAGE_KEY, value);
    return value;
  }
  function load(storage, key) {
    var value = resolveStorage(storage).getItem(key || STORAGE_KEY);
    return value == null || value === '' ? null : restore(value);
  }
  function clear(storage, key) {
    var target = resolveStorage(storage);
    if (typeof target.removeItem !== 'function') fail('storage object does not support removeItem');
    target.removeItem(key || STORAGE_KEY);
  }

  return {
    schema: SCHEMA,
    version: VERSION,
    priorVersion: PRIOR_VERSION,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    maxNameLength: MAX_NAME_LENGTH,
    minSeasons: MIN_SEASONS,
    maxSeasons: MAX_SEASONS,
    roundsPerSeason: ROUNDS_PER_SEASON,
    winPoints: WIN_POINTS,
    fastestLapPoints: FASTEST_LAP_POINTS,
    trackLapBonusPoints: TRACK_LAP_BONUS_POINTS,
    trackRaceBonusPoints: TRACK_RACE_BONUS_POINTS,
    storageKey: STORAGE_KEY,
    trackNames: copyArray(TRACK_NAMES),
    divisionNames: copyArray(DIVISION_NAMES),
    divisionTracks: copyDivisionTracks(),
    pairings: copyPairings(),
    defaultSeasons: DEFAULT_SEASONS.map(function (season) {
      return { divisionIndex: season.divisionIndex, superLeague: season.superLeague };
    }),
    seasonLabel: seasonLabel,
    fixturesPerRoundForPlayerCount: fixturesPerRoundForPlayerCount,
    create: create,
    validate: assertState,
    getSchedule: getSchedule,
    getCurrentFixture: getCurrentFixture,
    resolveFixtureResult: resolveFixtureResult,
    recordResult: recordResult,
    skipCurrentRound: skipCurrentRound,
    getRoundBonuses: getRoundBonuses,
    getStandings: getStandings,
    getProgress: getProgress,
    serialize: serialize,
    restore: restore,
    save: save,
    load: load,
    clear: clear
  };
}));
