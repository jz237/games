/**
 * Game flow controller for Stunt Car Racer.
 *
 * This file owns all UI (HTML overlay) and drives the game state machine.
 * It polls the C++ engine each frame via Module._jsXxx() exported functions
 * and calls into C++ to trigger state changes (select track, start race, etc.).
 *
 * Modes:
 *   MAIN_MENU  →  (Practise) TRACK_MENU → TRACK_PREVIEW → race → result → TRACK_MENU
 *              →  (Season)   schedule → TRACK_PREVIEW → race → results/standings
 *              →  (Two Players) WebRTC multiplayer via signaling server
 */

(function () {
  'use strict';

  // ── Game modes (must match C++ GameModeType enum) ───────────
  var TRACK_MENU       = 0;
  var TRACK_PREVIEW    = 1;
  var GAME_IN_PROGRESS = 2;
  var GAME_OVER        = 3;

  // ── Key bitmask constants (must match C++ KEY_P1_* defines) ─
  var KEY_LEFT         = 0x01;
  var KEY_RIGHT        = 0x02;
  var KEY_HASH         = 0x04;
  var KEY_BRAKE_BOOST  = 0x08;
  var KEY_ACCEL_BOOST  = 0x10;
  var KEY_ACCEL_ONLY   = 0x20;
  var KEY_BOOST_ONLY   = 0x40;

  // ══════════════════════════════════════════════════════════════
  //  TOURNAMENT DATA  (from original Amiga source)
  // ══════════════════════════════════════════════════════════════

  var OPPONENT_NAMES = [
    'Hot Rod', 'Whizz Kid', 'Bad Guy', 'The Dodger', 'Big Ed',
    'Max Boost', 'Dare Devil', 'High Flyer', 'Bully Boy',
    'Jumping Jack', 'Road Hog'
  ];

  var TRACK_NAMES = [
    'Little Ramp', 'Stepping Stones', 'Hump Back', 'Big Ramp',
    'Ski Jump', 'Draw Bridge', 'High Jump', 'Roller Coaster'
  ];

  // Base strength for computer vs computer outcomes (index 0 = strongest)
  var BASE_STRENGTH = [120, 110, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10];

  // Tracks per division: index 0 = Div 4 (lowest), index 3 = Div 1 (top)
  var DIVISION_TRACKS = [
    [0, 2],  // Div 4: Little Ramp, Hump Back
    [1, 3],  // Div 3: Stepping Stones, Big Ramp
    [6, 7],  // Div 2: High Jump, Roller Coaster
    [4, 5]   // Div 1: Ski Jump, Draw Bridge
  ];

  // Starting division assignments: index = driver ID (0–11), value = division (0=Div4, 3=Div1)
  // Human player is index 11
  var INITIAL_DIVISIONS = [3, 3, 3, 2, 2, 2, 1, 1, 1, 0, 0, 0];

  var HUMAN_PLAYER = 11;

  // Race pairing offsets within a 3-player division:
  // 6 races: each pair plays each track
  var PAIR_A     = [0, 0, 0, 0, 1, 1];
  var PAIR_B     = [1, 1, 2, 2, 2, 2];
  var RACE_TRACK = [0, 1, 0, 1, 0, 1];

  // ── State ──────────────────────────────────────────────────
  var trackIndex     = 0;
  var fading         = false;
  var raceEndTime    = 0;
  var isMobile       = false;
  var ready          = false;

  // UI mode (our own higher-level state on top of C++ GameMode)
  var UI_MAIN_MENU       = 'main_menu';
  var UI_PRACTISE_MENU   = 'practise_menu';
  var UI_PRACTISE_PREVIEW = 'practise_preview';
  var UI_PRACTISE_RACE   = 'practise_race';
  var UI_PRACTISE_RESULT = 'practise_result';
  var UI_SEASON_OVERVIEW = 'season_overview';
  var UI_SEASON_PRE_RACE = 'season_pre_race';
  var UI_SEASON_PREVIEW  = 'season_preview';
  var UI_SEASON_RACE     = 'season_race';
  var UI_SEASON_RESULT   = 'season_result';
  var UI_SEASON_STANDINGS = 'season_standings';
  var UI_MP_ROLE_SELECT  = 'mp_role_select';
  var UI_MP_HOST_LOBBY   = 'mp_host_lobby';
  var UI_MP_HOST_TRACK   = 'mp_host_track';
  var UI_MP_JOIN          = 'mp_join';
  var UI_MP_JOIN_LOBBY    = 'mp_join_lobby';
  var UI_MP_PREVIEW       = 'mp_preview';
  var UI_MP_RACE          = 'mp_race';
  var UI_MP_RESULT        = 'mp_result';
  var UI_CREDITS           = 'credits';
  var UI_CONTROLS          = 'controls';
  var UI_PROFILE           = 'profile';
  var UI_HALL_OF_FAME      = 'hall_of_fame';
  var UI_SAVE_LOAD         = 'save_load';
  var UI_HOTSEAT_SETUP     = 'hotseat_setup';
  var UI_HOTSEAT_PRE_RACE  = 'hotseat_pre_race';
  var UI_HOTSEAT_PREVIEW   = 'hotseat_preview';
  var UI_HOTSEAT_RACE      = 'hotseat_race';
  var UI_HOTSEAT_RESULT    = 'hotseat_result';
  var UI_HOTSEAT_STANDINGS = 'hotseat_standings';

  var uiMode = UI_MAIN_MENU;
  var skipRoundModifier = false;

  // Unified drive state for pointer, keyboard, and gamepad input.
  var touchDrive = { left: false, right: false, gas: false, brake: false, gasBoost: false, brakeBoost: false };
  var keyboardDrive = { left: false, right: false, gas: false, brake: false, boost: false };
  var gamepadDrive = { left: false, right: false, gas: false, brake: false, gasBoost: false, brakeBoost: false };
  var activeDriveTouches = {}; // track per-touch state for split buttons
  var driveAccelerationLatched = false;
  var driveBrakePulseUntil = 0;
  var racePaused = false;
  var pausedRaceMode = null;
  var gamepadPauseHeld = false;

  // The original game captured five user-defined driving keys. Keep those
  // bindings independent from profile/save data so they survive every mode.
  var controlsApi = window.SCR_Controls;
  var controlBindings = controlsApi.load();
  var driverControlsApi = window.SCR_DriverControls;
  var driverControlBook = driverControlsApi ? driverControlsApi.load() : null;
  var activeDriverControlName = null;
  var controlEditorContext = null;
  var capturingControlAction = null;
  var CONTROL_LABELS = {
    left: 'Steer Left',
    right: 'Steer Right',
    gas: 'Forward',
    brake: 'Brake / Reverse',
    boost: 'Boost'
  };

  function saveDriverControlBook() {
    if (!driverControlsApi || !driverControlBook) return;
    driverControlBook = driverControlsApi.save(driverControlBook);
  }

  function activateGlobalControls() {
    activeDriverControlName = null;
    controlBindings = controlsApi.load();
    releaseAllDriveInputs();
  }

  function activateNamedDriverControls(name) {
    if (!driverControlsApi || !driverControlBook || !name) {
      activateGlobalControls();
      return;
    }
    activeDriverControlName = name;
    controlBindings = controlsApi.validate(
      driverControlsApi.get(driverControlBook, name, controlsApi.load()));
    releaseAllDriveInputs();
  }

  function sameDriverName(left, right) {
    return typeof left === 'string' && typeof right === 'string' &&
      left.replace(/^\s+|\s+$/g, '').toUpperCase() ===
      right.replace(/^\s+|\s+$/g, '').toUpperCase();
  }

  function persistCurrentControlBindings() {
    controlBindings = controlsApi.validate(controlBindings);
    if (controlEditorContext && controlEditorContext.driverName && driverControlsApi) {
      driverControlsApi.set(
        driverControlBook, controlEditorContext.driverName, controlBindings);
      saveDriverControlBook();
      if (controlEditorContext.syncLinked && mpConnected &&
          typeof SCR_Multiplayer !== 'undefined') {
        SCR_Multiplayer.sendReliable({
          type: 'driver_controls',
          protocol: 2,
          driverName: controlEditorContext.driverName,
          bindings: controlsApi.validate(controlBindings)
        });
      }
    } else {
      controlBindings = controlsApi.save(undefined, controlBindings);
    }
    return controlBindings;
  }

  function showNamedDriverControls(name, returnHandler, syncLinked) {
    activateNamedDriverControls(name);
    controlEditorContext = {
      driverName: name,
      returnHandler: returnHandler,
      syncLinked: !!syncLinked
    };
    showControlsScreen();
  }

  function showGlobalControlsScreen() {
    controlEditorContext = null;
    activateGlobalControls();
    showControlsScreen();
  }

  // ── Multiplayer state ──────────────────────────────────────
  var signalingUrl = 'https://stuntcarracer.fly.dev';
  var mpConnected = false;
  var mpTrackIndex = 0;
  var mpSuperLeague = false;
  var mpOpponentFinished = false;
  var mpOpponentWrecked = false;
  var mpPlayerFinishedFirst = false;
  var mpPlayerNotified = false;
  var mpLocalReady = false;
  var mpRemoteReady = false;
  var mpRaceStarting = false;
  var mpRoundId = 0;
  var mpSeriesState = null;
  var mpCurrentFixture = null;
  var mpLocalDriverResult = null;
  var mpRemoteDriverResult = null;
  var mpFirstFinishedPlayerId = null;
  var mpResolvedSeriesResult = null;
  var mpSeriesExitScheduled = false;
  var mpRecordAnnouncements = null;

  // ── Season state ───────────────────────────────────────────
  var season = null;
  var humanDivision = 0;
  var superLeague = false;
  var damageHolePosition = 10;  // 10 = fully intact, 0 = all holes
  var profile = (typeof SCR_Profile !== 'undefined') ? SCR_Profile : null;
  var trackAccessApi = (typeof SCR_TrackAccess !== 'undefined') ? SCR_TrackAccess : null;
  var playerName = profile ? profile.getPlayerName() : 'PLAYER';
  var hotseat = (typeof SCR_Hotseat !== 'undefined') ? SCR_Hotseat : null;
  var linkChampionship = (typeof SCR_LinkChampionship !== 'undefined') ?
    SCR_LinkChampionship : null;
  var backupApi = (typeof SCR_Backup !== 'undefined') ? SCR_Backup : null;
  var hotseatState = null;
  var hotseatLastResult = null;
  var pendingBackupImport = null;
  if (hotseat) {
    try { hotseatState = hotseat.load(); } catch (e) { hotseatState = null; }
  }
  if (linkChampionship) {
    try { mpSeriesState = linkChampionship.load(); } catch (e) { mpSeriesState = null; }
  }

  // ── Damage hole/smash overlay state ─────────────────────────
  var prevDamageHolePosition = 10; // track changes to detect new smashes
  var smashTimers = [];            // array of 10 timeout IDs (null = no active smash)
  var DAMAGE_HOLE_X = [256, 240, 208, 192, 160, 144, 112, 96, 64, 48];

  // ── Boost flame overlay state ──────────────────────────────
  var boostFrameIndex = 0;
  var boostFrameTime = 0;

  // ── Wheel overlay state ────────────────────────────────────
  var wheelFrameNumber = 0;       // current rotation frame 0-2
  var wheelRotationAccum = 0;     // 16-bit accumulator; overflows trigger frame advance
  var wheelRotationSpeed = 0;     // 16-bit speed added each game frame

  // ── Dust cloud particle state ──────────────────────────────
  var DUST_COUNT = 16;
  var DUST_FRAME_SEQ = [3,6,7,2,1,5,0,4,0,5,1,2,7,6,2,7];
  var DUST_X_OFFSET  = [32,32,32,40,24,32,32,32]; // half-width centering per frame
  var DUST_W = [64,64,64,80,48,64,64,64]; // pixel width per frame
  var DUST_H = [34,31,38,36,28,34,34,36]; // pixel height per frame
  var dustParticles = [];   // {x, y, xVel, yVel}
  var dustFrameCounter = 0;
  var dustActive = false;   // was dust showing last frame?
  var dustLastTick = 0;     // timestamp of last particle update

  // ── Spark particle state ───────────────────────────────────
  var SPARK_COUNT = 24;
  var sparkParticles = [];  // {x, y, yVel, xVel, color}
  var sparkLastTick = 0;

  // ── Damage bar wavy path state (matches Amiga random walk) ─
  var damagePath = [];      // Y offsets (0-7) per damage pixel (0-239)
  var damageShade = [];     // true = going down (lighter shade)
  var damagePathY = 4;      // current random-walk Y position

  var currentDivisionAssignments = INITIAL_DIVISIONS.slice();
  var seasonStartDivisionAssignments = null; // division assignments snapshot at season start
  var seasonStartDamageHolePosition = null; // hole position snapshot at season start
  var seasonStartSuperLeague = null; // league snapshot used by the original Replay command

  var STORAGE_KEY = 'scr_progress';

  function progressSnapshot() {
    return {
      stateVersion: 3,
      playerName: playerName,
      humanDivision: humanDivision,
      superLeague: superLeague,
      damageHolePosition: damageHolePosition,
      currentDivisionAssignments: currentDivisionAssignments,
      season: season,
      seasonStartDivisionAssignments: seasonStartDivisionAssignments,
      seasonStartDamageHolePosition: seasonStartDamageHolePosition,
      seasonStartSuperLeague: seasonStartSuperLeague
    };
  }

  function portableObject(value) {
    return !!value && Object.prototype.toString.call(value) === '[object Object]';
  }

  function portableInteger(value, minimum, maximum) {
    return typeof value === 'number' && isFinite(value) && Math.floor(value) === value &&
      value >= minimum && value <= maximum;
  }

  function validateDivisionAssignments(assignments, label) {
    var counts = [0, 0, 0, 0];
    var copy;
    var i;
    if (Object.prototype.toString.call(assignments) !== '[object Array]' || assignments.length !== 12) {
      throw new Error(label + ' must contain all 12 drivers.');
    }
    copy = assignments.slice();
    for (i = 0; i < copy.length; i++) {
      if (!portableInteger(copy[i], 0, 3)) throw new Error(label + ' contains an invalid division.');
      counts[copy[i]] += 1;
    }
    for (i = 0; i < counts.length; i++) {
      if (counts[i] !== 3) throw new Error(label + ' must contain three drivers in every division.');
    }
    return copy;
  }

  function validateSeasonRaceForImport(race) {
    if (!portableObject(race) || !portableInteger(race.driverA, 0, 11) ||
        !portableInteger(race.driverB, 0, 11) || race.driverA === race.driverB ||
        !portableInteger(race.trackIndex, 0, 7) || typeof race.isHumanRace !== 'boolean' ||
        typeof race.played !== 'boolean' || !portableInteger(race.winnerDriver, -1, 11) ||
        !portableInteger(race.bestLapDriver, -1, 11)) {
      throw new Error('A saved racing-season event is invalid.');
    }
    ['playerBestLapMs', 'playerRaceTimeMs'].forEach(function (field) {
      if (race[field] != null && (typeof race[field] !== 'number' || !isFinite(race[field]) || race[field] < 0)) {
        throw new Error('A saved racing-season time is invalid.');
      }
    });
  }

  function validateSeasonForImport(savedSeason) {
    var d;
    var r;
    var i;
    var item;
    if (!portableObject(savedSeason)) throw new Error('Saved racing-season data is invalid.');
    validateDivisionAssignments(savedSeason.divAssign, 'Saved season divisions');
    if (savedSeason.humanDiv != null && !portableInteger(savedSeason.humanDiv, 0, 3)) {
      throw new Error('Saved player division is invalid.');
    }
    if (!portableInteger(savedSeason.currentRace, 0, 6)) throw new Error('Saved race progress is invalid.');
    if (savedSeason.divisionSchedules != null) {
      if (Object.prototype.toString.call(savedSeason.divisionSchedules) !== '[object Array]' ||
          savedSeason.divisionSchedules.length !== 4) throw new Error('Saved season schedule is invalid.');
      for (d = 0; d < 4; d++) {
        if (Object.prototype.toString.call(savedSeason.divisionSchedules[d]) !== '[object Array]' ||
            savedSeason.divisionSchedules[d].length !== 6) throw new Error('Saved division schedule is invalid.');
        for (r = 0; r < 6; r++) validateSeasonRaceForImport(savedSeason.divisionSchedules[d][r]);
      }
    }
    if (savedSeason.points != null) {
      if (Object.prototype.toString.call(savedSeason.points) !== '[object Array]' || savedSeason.points.length !== 12) {
        throw new Error('Saved championship points are invalid.');
      }
      for (i = 0; i < savedSeason.points.length; i++) {
        item = savedSeason.points[i];
        if (!portableObject(item) || !portableInteger(item.wins, 0, 100) ||
            !portableInteger(item.bestLaps, 0, 100)) throw new Error('Saved championship points are invalid.');
      }
    }
    if (savedSeason.tieBreakers != null) {
      if (Object.prototype.toString.call(savedSeason.tieBreakers) !== '[object Array]' ||
          savedSeason.tieBreakers.length !== 12) throw new Error('Saved season tie breakers are invalid.');
      for (i = 0; i < savedSeason.tieBreakers.length; i++) {
        if (typeof savedSeason.tieBreakers[i] !== 'number' || !isFinite(savedSeason.tieBreakers[i])) {
          throw new Error('Saved season tie breakers are invalid.');
        }
      }
    }
    if (savedSeason.roundStrengths != null) {
      if (Object.prototype.toString.call(savedSeason.roundStrengths) !== '[object Array]' ||
          savedSeason.roundStrengths.length !== 6) throw new Error('Saved opponent strengths are invalid.');
      for (r = 0; r < savedSeason.roundStrengths.length; r++) {
        item = savedSeason.roundStrengths[r];
        if (item === null) continue;
        if (Object.prototype.toString.call(item) !== '[object Array]' || item.length !== 12) {
          throw new Error('Saved opponent strengths are invalid.');
        }
        for (i = 0; i < item.length; i++) {
          if (typeof item[i] !== 'number' || !isFinite(item[i])) throw new Error('Saved opponent strengths are invalid.');
        }
      }
    }
  }

  function validateProgressImport(data) {
    var copy;
    var currentAssignments;
    if (!portableObject(data)) throw new Error('Championship progress is invalid.');
    try { copy = JSON.parse(JSON.stringify(data)); } catch (error) { throw new Error('Championship progress is not portable.'); }
    if (!portableInteger(copy.stateVersion, 1, 3)) throw new Error('Championship save version is not supported.');
    if (typeof copy.playerName !== 'string') throw new Error('Saved driver name is invalid.');
    if (!portableInteger(copy.humanDivision, 0, 3) || typeof copy.superLeague !== 'boolean' ||
        !portableInteger(copy.damageHolePosition, 0, 10)) throw new Error('Championship state is invalid.');
    currentAssignments = validateDivisionAssignments(copy.currentDivisionAssignments, 'Current divisions');
    if (currentAssignments[HUMAN_PLAYER] !== copy.humanDivision) throw new Error('Saved player division does not match the field.');
    copy.currentDivisionAssignments = currentAssignments;
    if (copy.season == null) copy.season = null;
    else validateSeasonForImport(copy.season);
    if (copy.seasonStartDivisionAssignments != null) {
      copy.seasonStartDivisionAssignments = validateDivisionAssignments(
        copy.seasonStartDivisionAssignments, 'Replay divisions'
      );
    } else copy.seasonStartDivisionAssignments = null;
    if (copy.seasonStartDamageHolePosition != null &&
        !portableInteger(copy.seasonStartDamageHolePosition, 0, 10)) throw new Error('Replay damage state is invalid.');
    if (copy.seasonStartDamageHolePosition == null) copy.seasonStartDamageHolePosition = null;
    if (copy.seasonStartSuperLeague != null && typeof copy.seasonStartSuperLeague !== 'boolean') {
      throw new Error('Replay league state is invalid.');
    }
    if (copy.seasonStartSuperLeague == null) copy.seasonStartSuperLeague = null;
    return copy;
  }

  function applyProgressData(data) {
    data = validateProgressImport(data);
    if (data.playerName != null && profile) {
      playerName = profile.setPlayerName(data.playerName);
    }
    if (data.humanDivision != null) humanDivision = data.humanDivision;
    if (data.superLeague != null) superLeague = !!data.superLeague;
    if (data.damageHolePosition != null) damageHolePosition = data.damageHolePosition;
    if (data.currentDivisionAssignments) currentDivisionAssignments = data.currentDivisionAssignments.slice();
    season = data.season || null;
    seasonStartDivisionAssignments = data.seasonStartDivisionAssignments ?
      data.seasonStartDivisionAssignments.slice() : null;
    seasonStartDamageHolePosition = data.seasonStartDamageHolePosition != null ?
      data.seasonStartDamageHolePosition : null;
    seasonStartSuperLeague = data.seasonStartSuperLeague != null ?
      !!data.seasonStartSuperLeague : (seasonStartDivisionAssignments ? superLeague : null);
    if (season) repairLoadedSeason();
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progressSnapshot()));
    } catch (e) { /* localStorage unavailable */ }
  }

  function loadProgress() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      applyProgressData(JSON.parse(raw));
    } catch (e) { /* ignore corrupt data */ }
  }

  function getChampionshipTrackAccess() {
    var states = [progressSnapshot()];
    if (profile && profile.listChampionships && profile.loadChampionship) {
      try {
        var saves = profile.listChampionships();
        for (var i = 0; i < saves.length; i += 1) {
          try {
            var loaded = profile.loadChampionship(saves[i].name);
            if (loaded && loaded.state) states.push(loaded.state);
          } catch (e) { /* ignore an unreadable named save */ }
        }
      } catch (e) { /* profile storage unavailable */ }
    }
    if (trackAccessApi) return trackAccessApi.fromProgressStates(states);
    return { standard: [true, false, false, false], super: [false, false, false, false] };
  }

  function isChampionshipDivisionUnlocked(access, useSuperLeague, divisionIndex) {
    if (trackAccessApi) {
      return trackAccessApi.isUnlocked(access, useSuperLeague, divisionIndex);
    }
    return !useSuperLeague && divisionIndex === 0;
  }

  function buildDivisionSchedule(players, divisionIndex) {
    var schedule = [];
    for (var r = 0; r < 6; r++) {
      var a = players[PAIR_A[r]];
      var b = players[PAIR_B[r]];
      schedule.push({
        driverA: a,
        driverB: b,
        trackIndex: DIVISION_TRACKS[divisionIndex][RACE_TRACK[r]],
        isHumanRace: (a === HUMAN_PLAYER || b === HUMAN_PLAYER),
        played: false,
        winnerDriver: -1,
        bestLapDriver: -1,
        playerBestLapMs: 0,
        playerRaceTimeMs: 0
      });
    }
    return schedule;
  }

  // Upgrade saves written by early desktop builds without discarding a season.
  function repairLoadedSeason() {
    if (!season.divisions) {
      season.divisions = [[], [], [], []];
      for (var i = 0; i < 12; i++) season.divisions[season.divAssign[i]].push(i);
    }
    if (season.humanDiv == null) season.humanDiv = season.divAssign[HUMAN_PLAYER];
    if (!season.divisionSchedules) {
      season.divisionSchedules = [];
      for (var d = 0; d < 4; d++) {
        season.divisionSchedules[d] = buildDivisionSchedule(season.divisions[d], d);
      }
      if (season.schedule) season.divisionSchedules[season.humanDiv] = season.schedule;
    }
    season.schedule = season.divisionSchedules[season.humanDiv];
    if (!season.roundStrengths) season.roundStrengths = [null, null, null, null, null, null];
    if (!season.tieBreakers) {
      season.tieBreakers = [];
      for (var t = 0; t < 12; t++) season.tieBreakers.push(Math.random());
    }
    if (!season.points) {
      season.points = [];
      for (var p = 0; p < 12; p++) season.points.push({ wins: 0, bestLaps: 0 });
    }
    if (season.currentRace == null || season.currentRace < 0) season.currentRace = 0;
    if (season.currentRace > 6) season.currentRace = 6;
  }

  function createNewSeason(divAssign) {
    // divAssign: array[12], index = driverID, value = division (0-3)
    var divisions = [[], [], [], []];
    for (var i = 0; i < 12; i++) {
      divisions[divAssign[i]].push(i);
    }

    var humanDiv = divAssign[HUMAN_PLAYER];

    // Resolve one pairing in every division for each of the six rounds.
    var divisionSchedules = [];
    for (var d = 0; d < 4; d++) {
      divisionSchedules[d] = buildDivisionSchedule(divisions[d], d);
    }

    // Points tracker
    var points = [];
    for (var i = 0; i < 12; i++) points.push({ wins: 0, bestLaps: 0 });
    var tieBreakers = [];
    for (var i = 0; i < 12; i++) tieBreakers.push(Math.random());

    return {
      divAssign: divAssign.slice(),
      divisions: divisions,
      humanDiv: humanDiv,
      divisionSchedules: divisionSchedules,
      schedule: divisionSchedules[humanDiv],
      roundStrengths: [null, null, null, null, null, null],
      tieBreakers: tieBreakers,
      currentRace: 0,
      points: points,
      endState: null
    };
  }

  function strengthsForRound(roundIndex) {
    var strengths = season.roundStrengths[roundIndex];
    if (!strengths) {
      strengths = [];
      for (var i = 0; i < 12; i++) {
        strengths.push(BASE_STRENGTH[i] + Math.floor(Math.random() * 64));
      }
      season.roundStrengths[roundIndex] = strengths;
    }
    return strengths;
  }

  function resolveComputerRace(race, strengths) {
    if (race.played) return;
    var sA = strengths[race.driverA];
    var sB = strengths[race.driverB];
    var winner, loser;
    if (sA > sB)       { winner = race.driverA; loser = race.driverB; }
    else if (sB > sA)  { winner = race.driverB; loser = race.driverA; }
    else               { // tie → coin flip
      if (Math.random() < 0.5) { winner = race.driverA; loser = race.driverB; }
      else                     { winner = race.driverB; loser = race.driverA; }
    }
    race.winnerDriver = winner;
    // Fastest lap is a separate outcome in the original simulation.
    race.bestLapDriver = (Math.random() < (160 / 256)) ? winner : loser;
    race.played = true;
    season.points[winner].wins++;
    season.points[race.bestLapDriver].bestLaps++;
  }

  function resolveComputerRacesForRound(roundIndex) {
    if (roundIndex < 0 || roundIndex >= 6) return;
    var strengths = strengthsForRound(roundIndex);
    var changed = false;
    for (var d = 0; d < 4; d++) {
      var race = season.divisionSchedules[d][roundIndex];
      if (!race.isHumanRace && !race.played) {
        resolveComputerRace(race, strengths);
        changed = true;
      }
    }
    if (changed) saveProgress();
  }

  function driverName(id) {
    if (id === HUMAN_PLAYER) return escapeHtml(playerName);
    return OPPONENT_NAMES[id];
  }

  function driverPortrait(id) {
    var portraitId = Math.max(0, Math.min(HUMAN_PLAYER, Number(id) || 0));
    return '<span class="driver-portrait driver-portrait-' + portraitId +
      '" aria-hidden="true"></span>';
  }

  function driverPoints(id) {
    var p = season.points[id];
    return p.wins * 2 + p.bestLaps;
  }

  function divStandings(divIdx) {
    var players = season.divisions[divIdx].slice();
    players.sort(function (a, b) {
      var pa = driverPoints(a), pb = driverPoints(b);
      if (pb !== pa) return pb - pa;
      var winDiff = season.points[b].wins - season.points[a].wins;
      if (winDiff !== 0) return winDiff;
      return season.tieBreakers[a] - season.tieBreakers[b];
    });
    return players;
  }

  function overallStandings() {
    var all = [];
    for (var d = 0; d < 4; d++) {
      var st = divStandings(d);
      for (var i = 0; i < st.length; i++) {
        all.push({ player: st[i], div: d, rank: i, pts: driverPoints(st[i]) });
      }
    }
    all.sort(function (a, b) {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.div !== a.div) return b.div - a.div;
      return a.rank - b.rank;
    });
    return all.map(function (e) { return e.player; });
  }

  function divLabel(idx) {
    var prefix = superLeague ? 'Super Division ' : 'Division ';
    return prefix + (4 - idx);
  }

  function fmtLap(ms) {
    if (!ms || ms <= 0) return '-';
    var s = ms / 1000, m = Math.floor(s / 60);
    return m + ':' + ((s - m * 60) < 10 ? '0' : '') + (s - m * 60).toFixed(2);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function recordBestLap(track, isSuper, milliseconds, recordName) {
    if (!profile || !milliseconds || milliseconds <= 0) return null;
    try {
      return profile.recordBestLap(isSuper ? 'super' : 'standard', track,
        Math.round(milliseconds), recordName || playerName);
    } catch (e) { return null; }
  }

  function recordBestRaceTime(track, isSuper, milliseconds, recordName) {
    if (!profile || !milliseconds || milliseconds <= 0 || !profile.recordBestRaceTime) return null;
    try {
      return profile.recordBestRaceTime(isSuper ? 'super' : 'standard', track,
        Math.round(milliseconds), recordName || playerName);
    } catch (e) { return null; }
  }

  // ── C++ API helpers ────────────────────────────────────────

  function getGameMode()       { return Module._jsGetGameMode(); }
  function getTrackID()        { return Module._jsGetTrackID(); }
  function getNumTracks()      { return Module._jsGetNumTracks(); }
  function isRaceFinished()    { return !!Module._jsIsRaceFinished(); }
  function isRaceWon()         { return !!Module._jsIsRaceWon(); }
  function isPlayerWrecked()   { return !!Module._jsIsPlayerWrecked(); }
  function getBoostReserve()   { return Module._jsGetBoostReserve(); }
  function getBoostMax()       { return Module._jsGetBoostMax(); }
  function getDamage()         { return Module._jsGetDamage(); }
  function isBoostActive()     { return !!Module._jsIsBoostActive(); }
  function getDamageHolePosition() { return Module._jsGetDamageHolePosition(); }
  function getLapNumber()      { return Module._jsGetLapNumber(); }
  function getPlayerBestLap()  { return Module._jsGetPlayerBestLap(); }
  function getOpponentBestLap(){ return Module._jsGetOpponentBestLap(); }
  function getPlayerRaceTime() { return Module._jsGetPlayerRaceTime(); }
  function getOpponentRaceTime(){ return Module._jsGetOpponentRaceTime(); }
  function getDisplaySpeed()   { return Module._jsGetDisplaySpeed(); }
  function getCurrentLapTime() { return Module._jsGetCurrentLapTime(); }
  function getDistanceToOpponent() { return Module._jsGetDistanceToOpponent(); }
  function setEnginePaused(paused) { return !!Module._jsSetPaused(paused ? 1 : 0); }
  function isEnginePaused()    { return !!Module._jsIsPaused(); }

  // Two-player C++ API
  function setTwoPlayerMode(on)      { Module._jsSetTwoPlayerMode(on ? 1 : 0); }
  function setTwoPlayerSide(side)    { Module._jsSetTwoPlayerSide(side); }
  function getPlayerRoadSection()    { return Module._jsGetPlayerRoadSection(); }
  function getPlayerDistIntoSection(){ return Module._jsGetPlayerDistanceIntoSection(); }
  function getPlayerRoadXPosition()  { return Module._jsGetPlayerRoadXPosition(); }
  function getPlayerZSpeed()         { return Module._jsGetPlayerZSpeed(); }
  function getPlayerDamage()         { return Module._jsGetPlayerDamage(); }
  function getPlayerWheelFL()        { return Module._jsGetPlayerWheelFL(); }
  function getPlayerWheelFR()        { return Module._jsGetPlayerWheelFR(); }
  function getPlayerWheelR()         { return Module._jsGetPlayerWheelR(); }
  function isPlayerWinning()    { return !!Module._jsIsPlayerWinning(); }
  function isCarOnChains()              { return !!Module._jsIsCarOnChains(); }
  function getChainCountdown()          { return Module._jsGetChainCountdown(); }
  function getChainFromLeft()           { return !!Module._jsGetChainSwingFromLeft(); }
  function isChainBoostHintVisible()    { return !!Module._jsIsChainBoostHintVisible(); }
  function isTouchingRoad()             { return !!Module._jsIsTouchingRoad(); }
  function getSparkFerocity()            { return Module._jsGetSparkFerocity(); }
  function getWheelDiffFL()             { return Module._jsGetWheelDiffFL(); }
  function getWheelDiffFR()             { return Module._jsGetWheelDiffFR(); }
  function setOpponentState(rs, dist, xPos, zSpd, wFL, wFR, wR) {
    Module._jsSetOpponentState(rs, dist, xPos, zSpd, wFL, wFR, wR);
  }

  function getTrackName() {
    var ptr = Module._jsGetTrackName();
    return ptr ? Module.UTF8ToString(ptr) : '';
  }

  function selectTrackForLeague(index, isSuper) {
    Module._jsSetSuperLeague(isSuper ? 1 : 0);
    Module._jsSelectTrack(index);
  }
  function selectTrack(index)  { selectTrackForLeague(index, superLeague); }
  function startPreview()      { Module._jsStartPreview(); }
  function cyclePreviewView(delta) { return Module._jsCyclePreviewView(delta); }
  function startGame(opp)      {
    // Reset drive inputs so we don't carry stale state from a previous race
    racePaused = false;
    pausedRaceMode = null;
    gamepadPauseHeld = false;
    driveAccelerationLatched = false;
    driveBrakePulseUntil = 0;
    touchDrive.left = touchDrive.right = touchDrive.gas = touchDrive.brake = touchDrive.gasBoost = touchDrive.brakeBoost = false;
    keyboardDrive.left = keyboardDrive.right = keyboardDrive.gas = keyboardDrive.brake = keyboardDrive.boost = false;
    gamepadDrive.left = gamepadDrive.right = gamepadDrive.gas = gamepadDrive.brake = gamepadDrive.gasBoost = gamepadDrive.brakeBoost = false;
    activeDriveTouches = {};
    setDriveInput(0);
    Module._jsSetDamageHolePosition(10);
    Module._jsStartGame(opp);
  }
  function goToMenu()          {
    racePaused = false;
    pausedRaceMode = null;
    gamepadPauseHeld = false;
    Module._jsGoToMenu();
  }
  function setGameOver()       { Module._jsSetGameOver(); }

  // Central exit point for leaving any race. Captures C++ state before
  // this is called, then: stop the race, fade to black, reset C++ to
  // menu state, tear down the HUD, and finally run the callback.
  function leaveRace(callback) {
    racePaused = false;
    pausedRaceMode = null;
    gamepadPauseHeld = false;
    setGameOver();
    fadeAndDo(function () {
      goToMenu();
      hideAllUI();
      callback();
    });
  }

  // Cheat mode (only available in CHEAT=1 builds)
  var cheatAvailable = false;
  function cheatWin()  { if (cheatAvailable) Module._jsCheatWin(); }
  function cheatLose() { if (cheatAvailable) Module._jsCheatLose(); }
  function setDriveInput(f)    { Module._touchSetDriveInput(f); }

  // ── Fade transition helper ─────────────────────────────────

  function fadeAndDo(callback) {
    if (fading) return;
    fading = true;
    var element = document.getElementById('fadeOverlay');
    element.style.opacity = '1';
    setTimeout(function () {
      callback();
      setTimeout(function () {
        element.style.opacity = '0';
        fading = false;
      }, 60);
    }, 350);
  }

  // ── Track navigation ───────────────────────────────────────

  function prevTrack() {
    trackIndex--;
    if (trackIndex < 0) trackIndex = getNumTracks() - 1;
    selectTrack(trackIndex);
  }

  function nextTrack() {
    trackIndex++;
    if (trackIndex >= getNumTracks()) trackIndex = 0;
    selectTrack(trackIndex);
  }

  // ══════════════════════════════════════════════════════════════
  //  UI CREATION
  // ══════════════════════════════════════════════════════════════

  function createUI() {
    isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) ||
      /(?:^|[?&])touchControls=1(?:&|$)/.test(window.location.search);

    // Fade overlay (styled via #fadeOverlay in game.css)
    var fade = document.createElement('div');
    fade.id = 'fadeOverlay';
    document.body.appendChild(fade);

    // Container for all game UI (styled via #gameUI in game.css)
    var container = document.createElement('div');
    container.id = 'gameUI';
    container.className = isMobile ? 'touch-input' : 'desktop-input';
    document.body.appendChild(container);

    // Helper: create a game button with the .game-button base class.
    // All positioning is handled by ID selectors in game.css.
    function element(id, text) {
      var d = document.createElement('div');
      d.id = id;
      d.className = 'game-button';
      if (text) d.textContent = text;
      container.appendChild(d);
      return d;
    }

    // ── Main Menu ──
    element('mm-title', 'STUNT CAR RACER');
    element('mm-practise', 'Practise');
    element('mm-season', 'Start the Racing Season');

    // ── Track Menu (practise) ──
    element('tc-prev', '\u25C0\uFE0E');
    element('tc-next', '\u25B6\uFE0E');
    element('tc-select', 'Select');
    element('tc-trackname', '');
    element('tc-backmain', 'Menu');

    // ── Track Preview (practise) ──
    element('tc-back', 'Back');
    var previewPrev = element('tc-view-prev', '\u25C0\uFE0E View');
    previewPrev.setAttribute('aria-label', 'Previous preview view');
    var previewNext = element('tc-view-next', 'View \u25B6\uFE0E');
    previewNext.setAttribute('aria-label', 'Next preview view');
    element('tc-start', 'Start');

    // ── In-Game driving controls (mobile only) ──
    element('tc-left', '\u25C0\uFE0E');
    element('tc-right', '\u25B6\uFE0E');
    var accelBtn = element('tc-accel');
    accelBtn.setAttribute('role', 'button');
    accelBtn.setAttribute('aria-label',
      'Forward. Tap once to keep accelerating. Left side adds boost.');
    accelBtn.innerHTML = '<span class="split-left"><small>BOOST</small><b>\uD83D\uDD25</b></span>' +
      '<span class="split-right"><small>FORWARD</small><b>\u25B2\uFE0E</b></span>';
    var brakeBtn = element('tc-brake');
    brakeBtn.setAttribute('role', 'button');
    brakeBtn.setAttribute('aria-label',
      'Brake or reverse. Tapping cancels forward acceleration. Left side adds boost.');
    brakeBtn.innerHTML = '<span class="split-left"><small>BOOST</small><b>\uD83D\uDD25</b></span>' +
      '<span class="split-right"><small>REVERSE</small><b>\u25BC\uFE0E</b></span>';

    // ── In-Game common ──
    var pauseButton = element('tc-menu', '\u2161');
    pauseButton.setAttribute('aria-label', 'Pause race');

    // ── Game Over / result label ──
    element('tc-gameover-label', '');
    element('tc-gameover', 'Menu');

    // ── Chain boost hint (shares game-button base) ──
    var boostHintEl = element('chain-boost-hint', 'Tap FORWARD to drop');

    // ── HUD: damage bar at top ──
    createHudBar('tc-hud-damage', '\u26A0\uFE0F');



    // ── HUD: info box (left side) ──
    createHudBox();

    // ── Cockpit overlay (race HUD: PNG frame + speed bar canvas + text fields) ──
    var cockpitDiv = document.createElement('div');
    cockpitDiv.id = 'cockpit-overlay';
    var cockpitImg = document.createElement('img');
    cockpitImg.id = 'cockpit-img';
    cockpitImg.src = 'images/cockpit.png';
    cockpitDiv.appendChild(cockpitImg);
    // Wheel images (behind the cockpit frame)
    var wheelSides = ['left', 'right'];
    for (var wi = 0; wi < wheelSides.length; wi++) {
      for (var wf = 0; wf < 3; wf++) {
        var wImg = document.createElement('img');
        wImg.className = 'cockpit-wheel';
        wImg.dataset.side = wheelSides[wi];
        wImg.dataset.frame = wf;
        wImg.src = 'images/wheels/' + wheelSides[wi] + '-wheel-' + wf + '.png';
        cockpitDiv.appendChild(wImg);
      }
    }
    // Boost flame overlay images (cycle while boosting)
    for (var bi = 1; bi <= 3; bi++) {
      var bImg = document.createElement('img');
      bImg.className = 'cockpit-boost-img';
      bImg.src = 'images/boost/boost-' + bi + '.png';
      bImg.style.display = 'none';
      cockpitDiv.appendChild(bImg);
    }
    // Flag and stopwatch indicator overlays
    var flagImg = document.createElement('img');
    flagImg.id = 'cockpit-flag';
    flagImg.className = 'cockpit-indicator';
    flagImg.src = 'images/indicators/flag-bright.png';
    flagImg.style.display = 'none';
    cockpitDiv.appendChild(flagImg);
    var swImg = document.createElement('img');
    swImg.id = 'cockpit-stopwatch';
    swImg.className = 'cockpit-indicator';
    swImg.src = 'images/indicators/stopwatch-bright.png';
    swImg.style.display = 'none';
    cockpitDiv.appendChild(swImg);
    // Dust cloud particle images
    for (var di = 0; di < DUST_COUNT; di++) {
      var dcImg = document.createElement('img');
      dcImg.className = 'dust-cloud';
      dcImg.dataset.idx = di;
      dcImg.src = 'images/dust/dust-cloud-0.png';
      dcImg.style.display = 'none';
      cockpitDiv.appendChild(dcImg);
      dustParticles.push({ x: 0, y: 210, xVel: 0, yVel: 0 });
    }
    // Spark particle elements
    for (var si = 0; si < SPARK_COUNT; si++) {
      var sp = document.createElement('div');
      sp.className = 'spark-particle';
      sp.dataset.idx = si;
      sp.style.display = 'none';
      cockpitDiv.appendChild(sp);
      sparkParticles.push({ x: 160, y: 200, yVel: 0, xVel: 0, color: '#fff', life: 0 });
    }
    // Damage hole/smash overlay images (10 slots, right to left)
    var holeDiv = document.createElement('div');
    holeDiv.id = 'damage-holes-overlay';
    for (var di = 0; di < 10; di++) {
      var dImg = document.createElement('img');
      dImg.className = 'cockpit-damage-hole';
      dImg.dataset.slot = di;
      dImg.src = 'images/indicators/hole.png';
      dImg.style.display = 'none';
      dImg.style.left = 'calc(' + DAMAGE_HOLE_X[di] + ' / 320 * 100%)';
      holeDiv.appendChild(dImg);
    }
    document.body.appendChild(holeDiv);
    var cockpitCvs = document.createElement('canvas');
    cockpitCvs.id = 'cockpit-canvas';
    cockpitCvs.width = 320;
    cockpitCvs.height = 200;
    cockpitCvs.setAttribute('role', 'meter');
    cockpitCvs.setAttribute('aria-label', 'Speed');
    cockpitCvs.setAttribute('aria-valuemin', '0');
    cockpitCvs.setAttribute('aria-valuemax', '240');
    cockpitCvs.setAttribute('aria-valuenow', '0');
    cockpitDiv.appendChild(cockpitCvs);
    ['cockpit-lap-boost', 'cockpit-distance', 'cockpit-laptime', 'cockpit-bestlap'].forEach(function (tid) {
      var t = document.createElement('div');
      t.id = tid;
      t.className = 'cockpit-text';
      cockpitDiv.appendChild(t);
    });
    document.body.appendChild(cockpitDiv);

    // ── Season overlay (styled via #season-overlay / #season-card in game.css) ──
    var overlay = document.createElement('div');
    overlay.id = 'season-overlay';
    var card = document.createElement('div');
    card.id = 'season-card';
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // ── Chain overlay image (shown during crane lifting) ──
    var chainClip = document.createElement('div');
    chainClip.id = 'chain-clip';
    var chainImg = document.createElement('img');
    chainImg.id = 'chain-img';
    chainImg.src = 'images/chains.png';
    chainClip.appendChild(chainImg);
    document.body.appendChild(chainClip);

    wireButtons();
    wireKeyboard();
  }

  function createHudBar(id, icon) {
    var container = document.getElementById('gameUI');
    var row = document.createElement('div');
    row.id = id;
    row.className = 'hud-bar';
    var iconEl = document.createElement('span');
    iconEl.textContent = icon;
    iconEl.className = 'hud-icon';
    var track = document.createElement('div');
    track.className = 'hud-track';
    var fill = document.createElement('div');
    fill.id = id + '-fill';
    fill.className = 'hud-fill';
    track.appendChild(fill);
    row.appendChild(iconEl);
    row.appendChild(track);
    container.appendChild(row);
  }

  function createHudBox() {
    var container = document.getElementById('gameUI');
    var box = document.createElement('div');
    box.id = 'tc-hud-box';
    if (isMobile) box.classList.add('hud-box-mobile');

    // Vertical speed bar
    var track = document.createElement('div');
    track.className = 'hud-speed-track';
    var fill = document.createElement('div');
    fill.id = 'hud-speed-fill';
    fill.className = 'hud-speed-fill';
    track.appendChild(fill);
    box.appendChild(track);

    // Text column
    var text = document.createElement('div');
    text.className = 'hud-text';
    var ids = ['hud-lap', 'hud-boost', 'hud-blank', 'hud-distance', 'hud-laptime', 'hud-bestlap'];
    for (var i = 0; i < ids.length; i++) {
      var row = document.createElement('div');
      row.className = 'hud-row';
      row.id = ids[i];
      row.textContent = '\u00A0'; // non-breaking space to reserve height
      text.appendChild(row);
    }
    text.appendChild(document.createElement('div')); // spacer
    box.appendChild(text);

    container.appendChild(box);
  }

  // ══════════════════════════════════════════════════════════════
  //  SEASON OVERLAY SCREENS
  // ══════════════════════════════════════════════════════════════

  function showOverlay(html, cardClass) {
    var card = document.getElementById('season-card');
    card.className = cardClass || '';
    card.innerHTML = html;
    document.getElementById('season-overlay').style.display = 'flex';
  }

  function hideOverlay() {
    document.getElementById('season-overlay').style.display = 'none';
  }

  function overlayBtn(id, label, handler) {
    var element = document.getElementById(id);
    if (!element) return;
    element.setAttribute('role', 'button');
    element.setAttribute('tabindex', '0');
    element.setAttribute('aria-label', label || element.textContent.trim());
    element.addEventListener('click', function (e) {
      e.preventDefault();
      handler();
    });
    element.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      element.click();
    });
  }

  // ── Season overview screen ──
  function showSeasonOverview() {
    uiMode = UI_SEASON_OVERVIEW;
    var h = '<div class="overlay-title">Season Overview</div>';
    h += '<div class="season-grid">';
    // Show divisions from highest (Div 1 = index 3) to lowest (Div 4 = index 0)
    for (var di = 3; di >= 0; di--) {
      var players = season.divisions[di];
      var tracks = DIVISION_TRACKS[di];
      var isHumanDiv = (di === season.humanDiv);
      h += '<div class="season-card' + (isHumanDiv ? ' season-card-active' : '') + '">';
      h += '<div class="season-label' + (isHumanDiv ? ' color-yellow' : '') + '">' + divLabel(di) + '</div>';
      // Players
      for (var p = 0; p < players.length; p++) {
        var pid = players[p];
        var isH = (pid === HUMAN_PLAYER);
        h += '<div class="season-player' + (isH ? ' season-player-human' : '') + '">' +
          driverPortrait(pid) + '<span class="season-player-name">' + driverName(pid) + '</span></div>';
      }
      // Spacer
      h += '<div class="season-spacer"></div>';
      // Tracks
      h += '<div class="season-tracks">';
      for (var t = 0; t < tracks.length; t++) {
        h += '<div class="season-track-name">' + TRACK_NAMES[tracks[t]] + '</div>';
      }
      h += '</div></div>';
    }
    h += '</div>';
    h += '<div id="s-btn-go" class="overlay-button" style="margin-top:2vh;">Continue</div>';
    showOverlay(h);
    overlayBtn('s-btn-go', 'GO', function () { showPreRace(); });
  }

  // ── Pre-race screen ──
  function showPreRace() {
    if (season.currentRace >= 6) {
      showStandings();
      return;
    }
    resolveComputerRacesForRound(season.currentRace);
    var race = season.schedule[season.currentRace];
    if (race.played) {
      showRaceResult(race);
      return;
    }
    uiMode = UI_SEASON_PRE_RACE;
    var h = '<div class="overlay-subtitle">' +
      divLabel(season.humanDiv) + ' \u2014 Race ' + (season.currentRace + 1) + ' of 6</div>';
    h += '<div class="overlay-track">' + TRACK_NAMES[race.trackIndex] + '</div>';
    h += '<div class="overlay-matchup">' +
      driverName(race.driverA) + ' <span class="overlay-matchup-vs">vs</span> ' +
      driverName(race.driverB) + '</div>';
    h += '<div id="s-btn-race" class="overlay-button">Race</div>';
    h += '<div id="s-btn-quit" class="overlay-button overlay-button-secondary">Pause Season</div>';
    showOverlay(h);

    overlayBtn('s-btn-race', 'RACE', beginSeasonRace);
    overlayBtn('s-btn-quit', 'PAUSE', pauseSeason);
  }

  function beginSeasonRace() {
    var race = season.schedule[season.currentRace];
    hideOverlay();
    fadeAndDo(function () {
      selectTrack(race.trackIndex);
      startPreview();
      uiMode = UI_SEASON_PREVIEW;
      showUIForMode();
    });
  }

  function startSeasonRaceFromPreview() {
    var race = season.schedule[season.currentRace];
    var oppId = (race.driverA === HUMAN_PLAYER) ? race.driverB : race.driverA;
    fadeAndDo(function () {
      startGame(oppId);
      Module._jsSetDamageHolePosition(damageHolePosition); // override the default 10 with season damage
      uiMode = UI_SEASON_RACE;
      showUIForMode();
    });
  }

  function simComputerRace() {
    var race = season.schedule[season.currentRace];
    resolveComputerRace(race, strengthsForRound(season.currentRace));
    saveProgress();
    showRaceResult(race);
  }

  function showRaceResult(race) {
    uiMode = UI_SEASON_RESULT;
    var h = '<div class="overlay-subtitle">' +
      'Race Result \u2014 ' + TRACK_NAMES[race.trackIndex] + '</div>';
    h += '<div class="overlay-result">' +
      driverName(race.driverA) + ' vs ' + driverName(race.driverB) + '</div>';
    h += '<div class="overlay-winner">' +
      'Winner: <b>' + driverName(race.winnerDriver) + '</b> (+2 pts)</div>';
    h += '<div class="overlay-fastest">' +
      'Fastest Lap: <b>' + driverName(race.bestLapDriver) + '</b> (+1 pt)</div>';
    if (race.playerBestLapMs > 0) {
      h += '<div class="overlay-detail">Your best lap: ' + fmtLap(race.playerBestLapMs) + '</div>';
    }
    if (race.playerRaceTimeMs > 0) {
      h += '<div class="overlay-detail">Your race time: ' + fmtLap(race.playerRaceTimeMs) + '</div>';
    }
    if (race.newLapRecord) {
      h += '<div class="overlay-result-small color-gold">NEW TRACK LAP RECORD</div>';
    }
    if (race.newRaceRecord) {
      h += '<div class="overlay-result-small color-gold">NEW TRACK RACE RECORD</div>';
    }
    h += '<div id="s-btn-cont" class="overlay-button">Continue</div>';
    var resultClass = race.playerWrecked ? 'race-wrecked-card' :
      (race.winnerDriver === HUMAN_PLAYER ? 'race-won-card' : 'race-lost-card');
    showOverlay(h, 'race-art-card ' + resultClass);
    overlayBtn('s-btn-cont', 'CONTINUE', advanceSeason);
  }

  function showPractiseResult(wrecked, bestLap, raceTime) {
    uiMode = UI_PRACTISE_RESULT;
    var h = '<div class="overlay-subtitle">Practise — ' + TRACK_NAMES[trackIndex] + '</div>';
    h += '<div class="overlay-result-large ' + (wrecked ? 'color-red' : 'color-green') + '">' +
      (wrecked ? 'WRECKED' : 'RUN COMPLETE') + '</div>';
    if (bestLap > 0) {
      h += '<div class="overlay-detail">Best lap: ' + fmtLap(bestLap) + '</div>';
    }
    if (raceTime > 0) {
      h += '<div class="overlay-detail">Race time: ' + fmtLap(raceTime) + '</div>';
    }
    h += '<div id="practise-btn-continue" class="overlay-button">Track Select</div>';
    showOverlay(h, 'race-art-card ' + (wrecked ? 'race-wrecked-card' : 'race-won-card'));
    overlayBtn('practise-btn-continue', 'TRACK SELECT', function () {
      hideOverlay();
      fadeAndDo(function () { goToMenu(); uiMode = UI_PRACTISE_MENU; showUIForMode(); });
    });
  }

  function advanceSeason() {
    season.currentRace++;
    saveProgress();
    if (season.currentRace >= 6) {
      showStandings();
    } else {
      showPreRace();
    }
  }

  function showStandings() {
    uiMode = UI_SEASON_STANDINGS;
    for (var round = 0; round < 6; round++) resolveComputerRacesForRound(round);
    var di = season.humanDiv;
    var st = divStandings(di);
    var top = st[0];
    var enteringSuperLeague;
    var superLeagueChampion;
    var fullyRepaired;

    if (!season.endState) {
      // Compute every division's promotion/relegation exactly once, then persist
      // it so closing on this screen cannot apply the changes a second time.
      var na = season.divAssign.slice();
      for (var d = 0; d < 3; d++) {
        var sH = divStandings(d), sA = divStandings(d + 1);
        na[sH[0]] = d + 1;
        na[sA[sA.length - 1]] = d;
      }

      var playerWonDivisionOne = (top === HUMAN_PLAYER && di === 3);
      enteringSuperLeague = playerWonDivisionOne && !superLeague;
      superLeagueChampion = playerWonDivisionOne && superLeague;

      if (enteringSuperLeague) {
        superLeague = true;
        na = INITIAL_DIVISIONS.slice();
      }
      humanDivision = na[HUMAN_PLAYER];

      // Original repair rule: a full repair in Division 4, on entry to the
      // Super League, or after winning the Super League; no partial repair.
      fullyRepaired = enteringSuperLeague || superLeagueChampion || humanDivision === 0;
      if (fullyRepaired) damageHolePosition = 10;
      currentDivisionAssignments = na;
      season.endState = {
        assignments: na.slice(),
        humanDivision: humanDivision,
        superLeague: superLeague,
        damageHolePosition: damageHolePosition,
        enteringSuperLeague: enteringSuperLeague,
        superLeagueChampion: superLeagueChampion,
        fullyRepaired: fullyRepaired
      };
      saveProgress();
    } else {
      var end = season.endState;
      currentDivisionAssignments = end.assignments.slice();
      humanDivision = end.humanDivision;
      superLeague = end.superLeague;
      damageHolePosition = end.damageHolePosition;
      enteringSuperLeague = end.enteringSuperLeague;
      superLeagueChampion = end.superLeagueChampion;
      fullyRepaired = end.fullyRepaired;
    }

    var h = '<div class="overlay-title">' + divLabel(di) + ' Standings</div>';
    h += '<table class="standings-table">';
    h += '<tr class="standings-header"><td></td><td>#</td>' +
      '<td>Driver</td>' +
      '<td class="standings-center">W</td>' +
      '<td class="standings-center">FL</td>' +
      '<td class="standings-center">Pts</td></tr>';

    for (var i = 0; i < st.length; i++) {
      var d = st[i], p = season.points[d], pts = p.wins * 2 + p.bestLaps;
      var isH = (d === HUMAN_PLAYER);
      var badge = '';
      if (i === 0 && di < 3)  badge = ' \u2B06\uFE0F';
      if (i === 0 && di === 3) badge = ' \uD83C\uDFC6';
      if (i === st.length - 1 && di > 0) badge = ' \u2B07\uFE0F';
      h += '<tr' + (isH ? ' class="color-yellow"' : '') + '>' +
        '<td class="standings-portrait">' + driverPortrait(d) + '</td>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + driverName(d) + badge + '</td>' +
        '<td class="standings-center">' + p.wins + '</td>' +
        '<td class="standings-center">' + p.bestLaps + '</td>' +
        '<td class="standings-center standings-bold">' + pts + '</td></tr>';
    }
    h += '</table>';

    var bot = st[st.length - 1];
    if (superLeagueChampion) {
      h += '<div class="overlay-result color-gold">' +
        '\uD83C\uDFC6 SUPER LEAGUE CHAMPION! \uD83C\uDFC6</div>';
      h += '<div class="overlay-detail">Excellent driving \u2014 well done!</div>';
    } else if (enteringSuperLeague) {
      h += '<div class="overlay-result color-gold">' +
        '\u2B06\uFE0F Promoted to the SUPER LEAGUE! \u2B06\uFE0F</div>';
      h += '<div class="overlay-detail">Back to Division 4 with faster cars and less boost!</div>';
    } else if (top === HUMAN_PLAYER) {
      h += '<div class="overlay-result-small color-green">' +
        '\u2B06\uFE0F Promoted to ' + divLabel(di + 1) + '!</div>';
    } else if (bot === HUMAN_PLAYER) {
      if (di === 0) h += '<div class="overlay-result-small color-orange">' +
        'Bottom of the league \u2014 try again!</div>';
      else h += '<div class="overlay-result-small color-red">' +
        '\u2B07\uFE0F Relegated to ' + divLabel(di - 1) + '</div>';
    } else {
      h += '<div class="overlay-info">' +
        'Staying in ' + divLabel(di) + '</div>';
    }

    // Show the original all-or-nothing repair result.
    if (fullyRepaired) {
      h += '<div class="overlay-detail">\uD83D\uDD27 Car fully repaired!</div>';
    } else {
      h += '<div class="overlay-detail">\uD83D\uDD27 No repairs</div>';
    }

    h += '<div id="s-btn-next" class="overlay-button">Finish Season</div>';
    showOverlay(h);
    overlayBtn('s-btn-next', 'FINISH', finishSeason);
  }

  function finishSeason() {
    season = null;
    // Keep the opening snapshot until another season starts. The Amiga Replay
    // command remained available after promotion/demotion so the last season
    // could be restored without loading a disk save.
    saveProgress();
    hideOverlay();
    goToMenu();
    uiMode = UI_MAIN_MENU;
    showUIForMode();
  }

  function finishSeasonRace() {
    var race = season.schedule[season.currentRace];
    var won = isRaceWon();
    var wrecked = isPlayerWrecked();
    var pBest = getPlayerBestLap();
    var oBest = getOpponentBestLap();
    var pRaceTime = getPlayerRaceTime();
    var opponent = (race.driverA === HUMAN_PLAYER) ? race.driverB : race.driverA;
    var lapRecord = recordBestLap(race.trackIndex, superLeague, pBest);
    var raceRecord = recordBestRaceTime(race.trackIndex, superLeague, pRaceTime);

    damageHolePosition = getDamageHolePosition();

    race.winnerDriver = wrecked ? opponent : (won ? HUMAN_PLAYER : opponent);
    // Retiring or wrecking forfeits both race and best-lap points.
    if (wrecked)
      race.bestLapDriver = opponent;
    else if (pBest > 0 && oBest > 0)
      race.bestLapDriver = (pBest <= oBest) ? HUMAN_PLAYER : opponent;
    else if (pBest > 0)
      race.bestLapDriver = HUMAN_PLAYER;
    else
      race.bestLapDriver = opponent;

    race.playerBestLapMs = pBest;
    race.playerRaceTimeMs = pRaceTime;
    race.playerWrecked = wrecked;
    race.playerWon = !wrecked && won;
    race.newLapRecord = !!(lapRecord && lapRecord.updated);
    race.newRaceRecord = !!(raceRecord && raceRecord.updated);
    race.played = true;
    season.points[race.winnerDriver].wins++;
    season.points[race.bestLapDriver].bestLaps++;
    saveProgress();

    leaveRace(function () { showRaceResult(race); });
  }

  function pauseSeason() {
    // Preserve season state — player can resume later
    hideOverlay();
    goToMenu();
    uiMode = UI_MAIN_MENU;
    showUIForMode();
  }

  // ══════════════════════════════════════════════════════════════
  //  MULTIPLAYER
  // ══════════════════════════════════════════════════════════════

  // ── Per-frame state exchange ───────────────────────────────
  // Packet: 7 × Int32 = 28 bytes
  //   [0] road section, [1] distance into section, [2] road X position,
  //   [3] z speed, [4] wheel FL, [5] wheel FR, [6] wheel R

  function mpSendState() {
    if (!SCR_Multiplayer.isConnected()) return;
    var buf = new ArrayBuffer(28);
    var view = new Int32Array(buf);
    view[0] = getPlayerRoadSection();
    view[1] = getPlayerDistIntoSection();
    view[2] = getPlayerRoadXPosition();
    view[3] = getPlayerZSpeed();
    view[4] = getPlayerWheelFL();
    view[5] = getPlayerWheelFR();
    view[6] = getPlayerWheelR();
    SCR_Multiplayer.send(buf);
  }

  function mpReceiveState(data) {
    if (!(data instanceof ArrayBuffer) || data.byteLength < 28) return;
    var view = new Int32Array(data);
    setOpponentState(view[0], view[1], view[2], view[3], view[4], view[5], view[6]);
  }

  function resetMpPreviewState() {
    mpLocalReady = false;
    mpRemoteReady = false;
    mpRaceStarting = false;
  }

  function resetMpRaceOutcome() {
    mpOpponentFinished = false;
    mpOpponentWrecked = false;
    mpPlayerFinishedFirst = false;
    mpPlayerNotified = false;
    mpLocalDriverResult = null;
    mpRemoteDriverResult = null;
    mpFirstFinishedPlayerId = null;
    mpResolvedSeriesResult = null;
    mpSeriesExitScheduled = false;
    mpRecordAnnouncements = null;
  }

  function fadeMpWhenReady(callback) {
    if (fading) {
      setTimeout(function () { fadeMpWhenReady(callback); }, 80);
      return;
    }
    fadeAndDo(callback);
  }

  function updateMpPreviewControls() {
    if (uiMode !== UI_MP_PREVIEW) return;
    var start = document.getElementById('tc-start');
    if (start) {
      start.textContent = mpLocalReady ? 'Ready \u2014 waiting' : 'Ready';
      start.style.opacity = mpLocalReady ? '0.65' : '1';
    }
    var back = document.getElementById('tc-back');
    if (back) back.textContent = 'Back';
  }

  function enterMpPreview() {
    selectTrackForLeague(mpTrackIndex, mpSuperLeague);
    setTwoPlayerMode(false);
    startPreview();
    uiMode = UI_MP_PREVIEW;
    showUIForMode();
    updateMpPreviewControls();
  }

  function startMpRace(side) {
    if (mpRaceStarting || uiMode !== UI_MP_PREVIEW) return;
    mpRaceStarting = true;
    fadeMpWhenReady(function () {
      setTwoPlayerMode(true);
      setTwoPlayerSide(side);
      startGame(-2);
      uiMode = UI_MP_RACE;
      resetMpRaceOutcome();
      mpRaceStarting = false;
      showUIForMode();
    });
  }

  function maybeStartMpRace() {
    if (!SCR_Multiplayer.isHost() || !mpLocalReady || !mpRemoteReady || mpRaceStarting) return;
    SCR_Multiplayer.sendReliable({
      type: 'start',
      round: mpRoundId,
      trackIndex: mpTrackIndex
    });
    startMpRace(0);
  }

  function readyMpPreview() {
    if (uiMode !== UI_MP_PREVIEW || mpLocalReady || !mpConnected) return;
    mpLocalReady = true;
    updateMpPreviewControls();
    SCR_Multiplayer.sendReliable({
      type: 'ready',
      round: mpRoundId,
      trackIndex: mpTrackIndex
    });
    maybeStartMpRace();
  }

  function saveMpSeriesState() {
    if (!linkChampionship || !mpSeriesState) return;
    try { linkChampionship.save(mpSeriesState); } catch (e) { /* storage unavailable */ }
  }

  function clearMpSeriesState() {
    if (linkChampionship) {
      try { linkChampionship.clear(); } catch (e) { /* storage unavailable */ }
    }
    mpSeriesState = null;
    mpCurrentFixture = null;
  }

  function mpSeriesPlayerName(playerId) {
    if (!mpSeriesState) return '';
    for (var i = 0; i < mpSeriesState.players.length; i++) {
      if (mpSeriesState.players[i].id === playerId) return mpSeriesState.players[i].name;
    }
    return '';
  }

  function sendMpSeriesState() {
    if (!mpConnected || !mpSeriesState || !linkChampionship) return;
    SCR_Multiplayer.sendReliable({
      type: 'series_state',
      protocol: 2,
      state: linkChampionship.serialize(mpSeriesState)
    });
  }

  function startMpSeriesPreview() {
    if (!mpSeriesState || mpSeriesState.complete) return;
    mpCurrentFixture = linkChampionship.getCurrentFixture(mpSeriesState);
    if (!mpCurrentFixture) return;
    mpTrackIndex = mpCurrentFixture.trackIndex;
    mpSuperLeague = !!mpCurrentFixture.superLeague;
    mpRoundId++;
    resetMpPreviewState();
    resetMpRaceOutcome();
    SCR_Multiplayer.sendReliable({
      type: 'preview',
      protocol: 2,
      round: mpRoundId,
      fixtureId: mpCurrentFixture.id,
      trackIndex: mpTrackIndex,
      superLeague: mpSuperLeague
    });
    hideOverlay();
    fadeMpWhenReady(enterMpPreview);
  }

  function showMpHostSeriesHome() {
    if (!linkChampionship) { showMpHostTrack(); return; }
    if (!mpSeriesState) { showMpSeriesSetup(); return; }
    uiMode = UI_MP_HOST_TRACK;
    var progress = linkChampionship.getProgress(mpSeriesState);
    var h = '<div class="overlay-title">Linked Drivers Championship</div>';
    h += '<div class="overlay-detail">' + progress.completedFixtures + ' of ' +
      progress.totalFixtures + ' fixtures complete</div>';
    h += '<div id="mp-series-resume" class="overlay-button">' +
      (mpSeriesState.complete ? 'View Final Standings' : 'Resume Championship') + '</div><br>';
    h += '<div id="mp-series-new" class="overlay-button">New Championship</div><br>';
    h += '<div id="mp-series-disconnect" class="overlay-button overlay-button-secondary">Disconnect</div>';
    showOverlay(h);
    overlayBtn('mp-series-resume', 'RESUME', function () {
      sendMpSeriesState();
      if (mpSeriesState.complete) showMpSeriesStandings();
      else showMpHostSeriesFixture();
    });
    overlayBtn('mp-series-new', 'NEW', showMpSeriesSetup);
    overlayBtn('mp-series-disconnect', 'DISCONNECT', function () {
      mpCleanup();
      uiMode = UI_MAIN_MENU;
      showMainMenu();
    });
  }

  function showMpSeriesSetup(message) {
    uiMode = UI_MP_HOST_TRACK;
    var availableTracks = getChampionshipTrackAccess();
    var h = '<div class="overlay-title">New Linked Championship</div>';
    if (message) h += '<div class="overlay-detail color-red">' + escapeHtml(message) + '</div>';
    h += '<div class="overlay-description">Enter 2-8 driver names. The two computers ' +
      'will show which driver takes each fixture.</div>';
    h += '<input id="mp-series-names" type="text" maxlength="110" ' +
      'class="multiplayer-signaling-input" value="' +
      escapeHtml(playerName + ', DRIVER 2') + '" />';
    for (var slot = 0; slot < linkChampionship.maxSeasons; slot++) {
      h += '<div class="overlay-label">Season ' + (slot + 1) + '</div>';
      h += '<select id="mp-series-season-' + slot + '" class="multiplayer-signaling-input">';
      if (slot > 0) h += '<option value="">None</option>';
      for (var leagueType = 0; leagueType < 2; leagueType++) {
        for (var division = 0; division < linkChampionship.divisionNames.length; division++) {
          if (!isChampionshipDivisionUnlocked(
              availableTracks, leagueType === 1, division)) continue;
          var tracks = linkChampionship.divisionTracks[division];
          var value = (leagueType ? 'super:' : 'standard:') + division;
          var label = (leagueType ? 'Super ' : '') + linkChampionship.divisionNames[division] +
            ' - ' + linkChampionship.trackNames[tracks[0]] + ' / ' +
            linkChampionship.trackNames[tracks[1]];
          h += '<option value="' + value + '"' +
            (slot === 0 && leagueType === 0 && division === 0 ? ' selected' : '') + '>' +
            escapeHtml(label) + '</option>';
        }
      }
      h += '</select>';
    }
    h += '<div class="overlay-description">Track choices are unlocked by current or ' +
      'named single-player saves, as in the original game.</div>';
    h += '<div class="overlay-description hotseat-rules">Each driver races twice per track ' +
      '(one fixture for exactly two drivers). Track bonus points are included.</div>';
    h += '<div id="mp-series-start" class="overlay-button">Start Championship</div><br>';
    h += '<div id="mp-series-setup-back" class="overlay-button overlay-button-secondary">Back</div>';
    showOverlay(h);
    overlayBtn('mp-series-start', 'START', function () {
      try {
        var raw = (document.getElementById('mp-series-names').value || '').split(',');
        var names = [];
        var seasons = [];
        for (var n = 0; n < raw.length; n++) {
          var name = raw[n].replace(/^\s+|\s+$/g, '');
          if (name) names.push(name);
        }
        for (var s = 0; s < linkChampionship.maxSeasons; s++) {
          var select = document.getElementById('mp-series-season-' + s);
          var selected = select ? select.value : '';
          if (!selected) continue;
          var parts = selected.split(':');
          seasons.push({ divisionIndex: parseInt(parts[1], 10),
            superLeague: parts[0] === 'super' });
        }
        mpSeriesState = linkChampionship.create({ players: names, seasons: seasons });
        saveMpSeriesState();
        sendMpSeriesState();
        showMpHostSeriesFixture();
      } catch (e) {
        showMpSeriesSetup(e && e.message ? e.message : 'Could not start championship');
      }
    });
    overlayBtn('mp-series-setup-back', 'BACK', showMpHostSeriesHome);
  }

  function showMpHostSeriesFixture() {
    if (!mpSeriesState) { showMpSeriesSetup(); return; }
    if (mpSeriesState.complete) { showMpSeriesStandings(); return; }
    uiMode = UI_MP_HOST_TRACK;
    mpCurrentFixture = linkChampionship.getCurrentFixture(mpSeriesState);
    var progress = linkChampionship.getProgress(mpSeriesState);
    var fixture = mpCurrentFixture;
    activateNamedDriverControls(fixture.hostPlayerName);
    mpTrackIndex = fixture.trackIndex;
    mpSuperLeague = !!fixture.superLeague;
    selectTrackForLeague(mpTrackIndex, mpSuperLeague);
    sendMpSeriesState();
    var h = '<div class="overlay-title">Linked Fixture</div>';
    h += '<div class="overlay-subtitle">Fixture ' + fixture.number + ' of ' +
      progress.totalFixtures + '</div>';
    h += '<div class="overlay-detail">Season ' + fixture.seasonNumber + ': ' +
      escapeHtml(fixture.seasonLabel) + ' - Track ' +
      (fixture.trackInSeasonIndex + 1) + ' of 2</div>';
    h += '<div class="overlay-track">' + escapeHtml(fixture.trackName) + '</div>';
    h += '<div class="overlay-matchup">' + escapeHtml(fixture.hostPlayerName) +
      ' <span class="overlay-matchup-vs">vs</span> ' +
      escapeHtml(fixture.guestPlayerName) + '</div>';
    h += '<div class="overlay-detail color-yellow">This computer: pass controls to <b>' +
      escapeHtml(fixture.hostPlayerName) + '</b></div>';
    h += '<div id="mp-series-preview" class="overlay-button">Preview Fixture</div><br>';
    h += '<div id="mp-series-driver-controls" class="overlay-button">Driver Controls</div><br>';
    h += '<div id="mp-series-standings" class="overlay-button">Standings</div><br>';
    if (mpSeriesState.players.length > 2) {
      h += '<div id="mp-series-skip-round" class="overlay-button overlay-button-secondary">' +
        'Skip Rest of Round</div><br>';
    }
    h += '<div id="mp-series-pause" class="overlay-button overlay-button-secondary">Save & Disconnect</div>';
    showOverlay(h);
    overlayBtn('mp-series-preview', 'PREVIEW', startMpSeriesPreview);
    overlayBtn('mp-series-driver-controls', 'DRIVER CONTROLS', function () {
      showNamedDriverControls(fixture.hostPlayerName, showMpHostSeriesFixture, true);
    });
    overlayBtn('mp-series-standings', 'STANDINGS', showMpSeriesStandings);
    overlayBtn('mp-series-skip-round', 'SKIP REST OF ROUND', showMpSkipRoundConfirm);
    overlayBtn('mp-series-pause', 'SAVE AND DISCONNECT', function () {
      SCR_Multiplayer.sendReliable({ type: 'quit' });
      mpCleanup();
      uiMode = UI_MAIN_MENU;
      showMainMenu();
    });
  }

  function showMpSeriesRoundEnd(summary) {
    var bonus = summary.roundBonus;
    var h = '<div class="overlay-title">End of Round</div>';
    h += '<div class="overlay-track">' + escapeHtml(bonus.trackName) + '</div>';
    h += '<div class="overlay-detail">' + summary.skippedCount +
      (summary.skippedCount === 1 ? ' fixture skipped' : ' fixtures skipped') + '</div>';
    var lapNames = bonus.lapWinners.map(function (p) { return p.name; });
    var raceNames = bonus.raceWinners.map(function (p) { return p.name; });
    h += '<div class="hotseat-bonus-card"><div class="overlay-subtitle">Track Bonus Points</div>';
    h += '<div class="overlay-detail">Fastest overall lap: <b>' +
      (lapNames.length ? escapeHtml(lapNames.join(', ')) + ' (+1)' : 'No qualifying time') +
      '</b>' + (bonus.lapTimeMs ? ' - ' + fmtLap(bonus.lapTimeMs) : '') + '</div>';
    h += '<div class="overlay-detail">Fastest overall race: <b>' +
      (raceNames.length ? escapeHtml(raceNames.join(', ')) + ' (+2)' : 'No qualifying time') +
      '</b>' + (bonus.raceTimeMs ? ' - ' + fmtLap(bonus.raceTimeMs) : '') + '</div></div>';
    if (SCR_Multiplayer.isHost()) {
      h += '<div id="mp-series-round-continue" class="overlay-button">' +
        (mpSeriesState.complete ? 'Final Standings' : 'Next Round') + '</div>';
    } else {
      h += '<div class="overlay-description">Waiting for the host to continue.</div>';
      h += '<div id="mp-series-round-disconnect" class="overlay-button overlay-button-secondary">Disconnect</div>';
    }
    showOverlay(h);
    overlayBtn('mp-series-round-continue', 'CONTINUE', function () {
      if (mpSeriesState.complete) showMpSeriesStandings();
      else showMpHostSeriesFixture();
    });
    overlayBtn('mp-series-round-disconnect', 'DISCONNECT', function () {
      SCR_Multiplayer.sendReliable({ type: 'quit' });
      mpCleanup();
      uiMode = UI_MAIN_MENU;
      showMainMenu();
    });
  }

  function showMpSkipRoundConfirm() {
    if (!mpSeriesState || mpSeriesState.complete || !SCR_Multiplayer.isHost() ||
        mpSeriesState.players.length === 2) return;
    var fixture = linkChampionship.getCurrentFixture(mpSeriesState);
    var progress = linkChampionship.getProgress(mpSeriesState);
    var remaining = progress.fixturesPerRound - progress.completedInRound;
    var h = '<div class="overlay-title">Skip Rest of Round?</div>';
    h += '<div class="overlay-track">' + escapeHtml(fixture.trackName) + '</div>';
    h += '<div class="overlay-description">The remaining ' + remaining +
      (remaining === 1 ? ' fixture' : ' fixtures') +
      ' will not award race points or record times. Completed fixtures still count.</div>';
    h += '<div id="mp-series-skip-confirm" class="overlay-button">Skip to Track Bonuses</div><br>';
    h += '<div id="mp-series-skip-back" class="overlay-button overlay-button-secondary">Back</div>';
    showOverlay(h);
    overlayBtn('mp-series-skip-confirm', 'SKIP TO TRACK BONUSES', function () {
      var summary = linkChampionship.skipCurrentRound(mpSeriesState);
      saveMpSeriesState();
      SCR_Multiplayer.sendReliable({
        type: 'series_round_skipped',
        protocol: 2,
        state: linkChampionship.serialize(mpSeriesState),
        roundIndex: summary.roundIndex,
        skippedCount: summary.skippedCount
      });
      showMpSeriesRoundEnd(summary);
    });
    overlayBtn('mp-series-skip-back', 'BACK', showMpHostSeriesFixture);
  }

  function showMpSeriesStandings() {
    if (!mpSeriesState) { showMpRoleSelect(); return; }
    uiMode = UI_MP_RESULT;
    var standings = linkChampionship.getStandings(mpSeriesState);
    var h = '<div class="overlay-title">' +
      (mpSeriesState.complete ? 'Final Linked Championship' : 'Linked Championship') + '</div>';
    if (mpSeriesState.complete && standings.length) {
      h += '<div class="overlay-result color-gold">\uD83C\uDFC6 ' +
        escapeHtml(standings[0].name) + ' WINS! \uD83C\uDFC6</div>';
    }
    h += '<table class="standings-table"><tr class="standings-header">' +
      '<td>#</td><td>Driver</td><td class="standings-center">W</td>' +
      '<td class="standings-center">FL</td><td class="standings-center">TB</td>' +
      '<td class="standings-center">Pts</td></tr>';
    for (var i = 0; i < standings.length; i++) {
      var row = standings[i];
      h += '<tr><td>' + row.rank + '</td><td>' + escapeHtml(row.name) + '</td>' +
        '<td class="standings-center">' + row.wins + '</td>' +
        '<td class="standings-center">' + row.fastestLaps + '</td>' +
        '<td class="standings-center">' + row.trackBonusPoints + '</td>' +
        '<td class="standings-center standings-bold">' + row.points + '</td></tr>';
    }
    h += '</table><div class="overlay-description hotseat-standings-key">' +
      'W = race wins - FL = race fastest laps - TB = track bonus points</div>';
    if (mpSeriesState.complete && SCR_Multiplayer.isHost()) {
      h += '<div id="mp-series-replay" class="overlay-button">Replay Championship</div><br>';
      h += '<div id="mp-series-finish" class="overlay-button overlay-button-secondary">Finish & Disconnect</div>';
    } else if (!mpSeriesState.complete && SCR_Multiplayer.isHost()) {
      h += '<div id="mp-series-next" class="overlay-button">Next Fixture</div><br>';
      h += '<div id="mp-series-save" class="overlay-button overlay-button-secondary">Save & Disconnect</div>';
    } else {
      h += '<div class="overlay-description">Waiting for the host to continue.</div>';
      h += '<div id="mp-series-guest-quit" class="overlay-button overlay-button-secondary">Disconnect</div>';
    }
    showOverlay(h);
    overlayBtn('mp-series-next', 'NEXT FIXTURE', showMpHostSeriesFixture);
    overlayBtn('mp-series-save', 'SAVE AND DISCONNECT', function () {
      SCR_Multiplayer.sendReliable({ type: 'quit' }); mpCleanup();
      uiMode = UI_MAIN_MENU; showMainMenu();
    });
    overlayBtn('mp-series-replay', 'REPLAY', function () {
      var names = mpSeriesState.players.map(function (p) { return p.name; });
      var seasons = mpSeriesState.seasons.map(function (s) {
        return { divisionIndex: s.divisionIndex, superLeague: s.superLeague };
      });
      mpSeriesState = linkChampionship.create({ players: names, seasons: seasons });
      saveMpSeriesState();
      sendMpSeriesState();
      showMpHostSeriesFixture();
    });
    overlayBtn('mp-series-finish', 'FINISH', function () {
      SCR_Multiplayer.sendReliable({ type: 'series_clear' });
      clearMpSeriesState();
      mpCleanup();
      uiMode = UI_MAIN_MENU;
      showMainMenu();
    });
    overlayBtn('mp-series-guest-quit', 'DISCONNECT', function () {
      SCR_Multiplayer.sendReliable({ type: 'quit' }); mpCleanup();
      uiMode = UI_MAIN_MENU; showMainMenu();
    });
  }

  function captureMpLocalSeriesResult() {
    if (!mpSeriesState || !mpCurrentFixture || mpLocalDriverResult) return;
    var localPlayerId = SCR_Multiplayer.isHost() ?
      mpCurrentFixture.hostPlayerId : mpCurrentFixture.guestPlayerId;
    mpLocalDriverResult = {
      playerId: localPlayerId,
      bestLapMs: getPlayerBestLap() > 0 ? Math.round(getPlayerBestLap()) : null,
      raceTimeMs: getPlayerRaceTime() > 0 ? Math.round(getPlayerRaceTime()) : null,
      wrecked: !!isPlayerWrecked()
    };
    if (!mpFirstFinishedPlayerId) mpFirstFinishedPlayerId = localPlayerId;
    SCR_Multiplayer.sendReliable({
      type: 'finished',
      protocol: 2,
      fixtureId: mpCurrentFixture.id,
      playerId: localPlayerId,
      bestLapMs: mpLocalDriverResult.bestLapMs,
      raceTimeMs: mpLocalDriverResult.raceTimeMs,
      wrecked: mpLocalDriverResult.wrecked
    });
    resolveMpSeriesFixtureIfReady();
  }

  function scheduleMpSeriesRaceExit() {
    if (mpSeriesExitScheduled) return;
    mpSeriesExitScheduled = true;
    setTimeout(function () {
      if (uiMode === UI_MP_RACE) finishMpRace();
    }, 900);
  }

  function retireMpSeriesDriver() {
    if (!mpSeriesState || !mpCurrentFixture || mpPlayerNotified) return;
    mpPlayerNotified = true;
    mpPlayerFinishedFirst = !mpOpponentFinished;
    var localPlayerId = SCR_Multiplayer.isHost() ?
      mpCurrentFixture.hostPlayerId : mpCurrentFixture.guestPlayerId;
    mpLocalDriverResult = {
      playerId: localPlayerId,
      bestLapMs: getPlayerBestLap() > 0 ? Math.round(getPlayerBestLap()) : null,
      raceTimeMs: null,
      wrecked: true
    };
    if (!mpFirstFinishedPlayerId) mpFirstFinishedPlayerId = localPlayerId;
    SCR_Multiplayer.sendReliable({
      type: 'finished',
      protocol: 2,
      fixtureId: mpCurrentFixture.id,
      playerId: localPlayerId,
      bestLapMs: mpLocalDriverResult.bestLapMs,
      raceTimeMs: null,
      wrecked: true,
      retired: true
    });
    resolveMpSeriesFixtureIfReady();
    setGameOver();
    scheduleMpSeriesRaceExit();
  }

  function receiveMpSeriesFinished(msg) {
    if (!mpSeriesState || !mpCurrentFixture) return;
    var expectedId = SCR_Multiplayer.isHost() ?
      mpCurrentFixture.guestPlayerId : mpCurrentFixture.hostPlayerId;
    if (msg.fixtureId && msg.fixtureId !== mpCurrentFixture.id) return;
    if (msg.playerId && msg.playerId !== expectedId) return;
    mpRemoteDriverResult = {
      playerId: expectedId,
      bestLapMs: typeof msg.bestLapMs === 'number' && msg.bestLapMs > 0 ?
        Math.round(msg.bestLapMs) : null,
      raceTimeMs: typeof msg.raceTimeMs === 'number' && msg.raceTimeMs > 0 ?
        Math.round(msg.raceTimeMs) : null,
      wrecked: !!msg.wrecked
    };
    if (!mpFirstFinishedPlayerId) mpFirstFinishedPlayerId = expectedId;
    if (msg.wrecked && uiMode === UI_MP_RACE && !mpPlayerNotified) {
      /* The other driver retired or wrecked; finish locally and award this
         driver the race without tearing down the championship connection. */
      mpPlayerNotified = true;
      mpPlayerFinishedFirst = false;
      captureMpLocalSeriesResult();
      setGameOver();
      scheduleMpSeriesRaceExit();
    }
    resolveMpSeriesFixtureIfReady();
  }

  function resolveMpSeriesFixtureIfReady() {
    if (!SCR_Multiplayer.isHost() || !mpSeriesState || !mpCurrentFixture ||
        !mpLocalDriverResult || !mpRemoteDriverResult || mpResolvedSeriesResult) return;
    var firstId = mpFirstFinishedPlayerId || mpCurrentFixture.hostPlayerId;
    var result = linkChampionship.resolveFixtureResult(mpCurrentFixture,
      mpLocalDriverResult, mpRemoteDriverResult, firstId);
    linkChampionship.recordResult(mpSeriesState, result);
    mpResolvedSeriesResult = result;
    saveMpSeriesState();
    SCR_Multiplayer.sendReliable({
      type: 'series_result',
      protocol: 2,
      fixtureId: mpCurrentFixture.id,
      state: linkChampionship.serialize(mpSeriesState)
    });
  }

  function receiveMpSeriesResult(msg) {
    if (SCR_Multiplayer.isHost() || !linkChampionship || !mpCurrentFixture ||
        msg.fixtureId !== mpCurrentFixture.id || typeof msg.state !== 'string') return;
    try {
      var restored = linkChampionship.restore(msg.state);
      if (!restored.results.length ||
          restored.results[restored.results.length - 1].fixtureId !== mpCurrentFixture.id) return;
      mpSeriesState = restored;
      mpResolvedSeriesResult = restored.results[restored.results.length - 1];
      saveMpSeriesState();
      if (uiMode === UI_MP_RESULT && document.getElementById('mp-series-sync-wait')) {
        renderMpSeriesRaceResult();
      }
    } catch (e) { /* invalid or out-of-order series update */ }
  }

  function showMpJoinWaiting() {
    uiMode = UI_MP_JOIN_LOBBY;
    var h = '<div class="overlay-title">Waiting</div>';
    if (mpSeriesState && !mpSeriesState.complete) {
      mpCurrentFixture = linkChampionship.getCurrentFixture(mpSeriesState);
      activateNamedDriverControls(mpCurrentFixture.guestPlayerName);
      var progress = linkChampionship.getProgress(mpSeriesState);
      h += '<div class="overlay-subtitle">Fixture ' + mpCurrentFixture.number + ' of ' +
        progress.totalFixtures + '</div>';
      h += '<div class="overlay-track">' + escapeHtml(mpCurrentFixture.trackName) + '</div>';
      h += '<div class="overlay-matchup">' + escapeHtml(mpCurrentFixture.hostPlayerName) +
        ' <span class="overlay-matchup-vs">vs</span> ' +
        escapeHtml(mpCurrentFixture.guestPlayerName) + '</div>';
      h += '<div class="overlay-detail color-yellow">This computer: pass controls to <b>' +
        escapeHtml(mpCurrentFixture.guestPlayerName) + '</b></div>';
      h += '<div id="mp-guest-driver-controls" class="overlay-button">Driver Controls</div>';
      h += '<div class="overlay-description">Waiting for the host to preview this fixture\u2026</div>';
    } else if (mpSeriesState && mpSeriesState.complete) {
      activateGlobalControls();
      h += '<div class="overlay-description">Championship complete.</div>';
      h += '<div id="mp-guest-standings" class="overlay-button">Final Standings</div>';
    } else {
      activateGlobalControls();
      h += '<div class="overlay-description">Waiting for the host to create or resume a championship\u2026</div>';
    }
    showOverlay(h);
    overlayBtn('mp-guest-driver-controls', 'DRIVER CONTROLS', function () {
      if (mpCurrentFixture) {
        showNamedDriverControls(
          mpCurrentFixture.guestPlayerName, showMpJoinWaiting, true);
      }
    });
    overlayBtn('mp-guest-standings', 'FINAL STANDINGS', showMpSeriesStandings);
  }

  function returnFromMpPreview(notifyPeer) {
    if (notifyPeer && mpConnected) {
      SCR_Multiplayer.sendReliable({ type: 'preview_cancel', round: mpRoundId });
    }
    resetMpPreviewState();
    fadeMpWhenReady(function () {
      setTwoPlayerMode(false);
      goToMenu();
      if (SCR_Multiplayer.isHost()) {
        if (mpSeriesState) showMpHostSeriesFixture();
        else showMpHostTrack(true);
      } else {
        showMpJoinWaiting();
      }
    });
  }

  function mpSetupCallbacks() {
    SCR_Multiplayer.onMessage = mpReceiveState;
    SCR_Multiplayer.onReliableMessage = function (msg) {
      if (msg.type === 'driver_controls' && driverControlsApi &&
          typeof msg.driverName === 'string') {
        try {
          var remoteBindings = controlsApi.validate(msg.bindings);
          driverControlsApi.set(driverControlBook, msg.driverName, remoteBindings);
          saveDriverControlBook();
          if (sameDriverName(activeDriverControlName, msg.driverName) &&
              !(controlEditorContext &&
                sameDriverName(controlEditorContext.driverName, msg.driverName))) {
            controlBindings = remoteBindings;
            releaseAllDriveInputs();
          }
        } catch (e) { /* ignore invalid peer control layouts */ }
      } else if (msg.type === 'series_state' && !SCR_Multiplayer.isHost() &&
          linkChampionship && typeof msg.state === 'string') {
        try {
          mpSeriesState = linkChampionship.restore(msg.state);
          saveMpSeriesState();
          if (mpSeriesState.complete) showMpSeriesStandings();
          else showMpJoinWaiting();
        } catch (e) { /* ignore invalid championship state */ }
      } else if (msg.type === 'series_round_skipped' && !SCR_Multiplayer.isHost() &&
          linkChampionship && typeof msg.state === 'string') {
        try {
          mpSeriesState = linkChampionship.restore(msg.state);
          saveMpSeriesState();
          showMpSeriesRoundEnd({
            roundIndex: msg.roundIndex,
            skippedCount: msg.skippedCount,
            roundBonus: linkChampionship.getRoundBonuses(mpSeriesState, msg.roundIndex),
            complete: mpSeriesState.complete
          });
        } catch (e) { /* ignore invalid authoritative skip state */ }
      } else if (msg.type === 'series_clear' && !SCR_Multiplayer.isHost()) {
        clearMpSeriesState();
        mpCleanup();
        uiMode = UI_MAIN_MENU;
        showMainMenu();
      } else if (msg.type === 'preview' && !SCR_Multiplayer.isHost()) {
        // Both peers run the animated preview and exchange ready messages
        // before either one starts racing.
        if (typeof msg.trackIndex !== 'number' || msg.trackIndex < 0 ||
            msg.trackIndex >= getNumTracks() || typeof msg.round !== 'number') return;
        if (mpSeriesState) {
          var expectedFixture = linkChampionship.getCurrentFixture(mpSeriesState);
          if (!expectedFixture || msg.fixtureId !== expectedFixture.id ||
              msg.trackIndex !== expectedFixture.trackIndex) return;
          mpCurrentFixture = expectedFixture;
        }
        mpTrackIndex = msg.trackIndex;
        mpSuperLeague = !!msg.superLeague;
        mpRoundId = msg.round;
        resetMpPreviewState();
        resetMpRaceOutcome();
        hideOverlay();
        fadeMpWhenReady(enterMpPreview);
      } else if (msg.type === 'ready' && SCR_Multiplayer.isHost()) {
        if (msg.round !== mpRoundId || msg.trackIndex !== mpTrackIndex) return;
        mpRemoteReady = true;
        updateMpPreviewControls();
        maybeStartMpRace();
      } else if (msg.type === 'start' && !SCR_Multiplayer.isHost()) {
        if (msg.round !== mpRoundId || msg.trackIndex !== mpTrackIndex) return;
        startMpRace(1);
      } else if (msg.type === 'preview_cancel') {
        if (msg.round !== mpRoundId || uiMode !== UI_MP_PREVIEW) return;
        returnFromMpPreview(false);
      } else if (msg.type === 'race_pause') {
        if ((uiMode !== UI_MP_RACE && pausedRaceMode !== UI_MP_RACE) ||
            msg.round !== mpRoundId ||
            typeof msg.paused !== 'boolean') return;
        if (msg.paused) pauseRace(false, true);
        else resumeRace(false);
      } else if (msg.type === 'finished') {
        mpOpponentFinished = true;
        mpOpponentWrecked = !!msg.wrecked;
        if (mpSeriesState) receiveMpSeriesFinished(msg);
        // If we haven't notified yet, opponent finished first — we did NOT finish first
        if (!mpPlayerNotified) mpPlayerFinishedFirst = false;
      } else if (msg.type === 'series_result') {
        receiveMpSeriesResult(msg);
      } else if (msg.type === 'quit') {
        // Opponent explicitly quit — trigger the same disconnect handling
        mpConnected = false;
        if (uiMode === UI_MP_RACE) {
          var lbl = document.getElementById('tc-gameover-label');
          if (lbl) { lbl.textContent = 'OPPONENT QUIT'; lbl.style.display = 'flex'; lbl.style.opacity = '1'; }
          setTimeout(function () {
            setGameOver();
            mpCleanup();
            goToMenu();
            uiMode = UI_MAIN_MENU;
            showUIForMode();
          }, 3000);
        } else {
          mpCleanup();
          goToMenu();
          uiMode = UI_MAIN_MENU;
          showUIForMode();
        }
      }
    };
    SCR_Multiplayer.onClose = function () {
      mpConnected = false;
      if (uiMode === UI_MP_RACE) {
        // Show "Opponent quit" message and end the race after a short delay
        var lbl = document.getElementById('tc-gameover-label');
        if (lbl) { lbl.textContent = 'OPPONENT QUIT'; lbl.style.display = 'flex'; lbl.style.opacity = '1'; }
        setTimeout(function () {
          setGameOver();
          mpCleanup();
          goToMenu();
          uiMode = UI_MAIN_MENU;
          showUIForMode();
        }, 3000);
      } else {
        // Back to main menu
        setTwoPlayerMode(false);
        goToMenu();
        uiMode = UI_MAIN_MENU;
        showUIForMode();
      }
    };
  }

  function mpCleanup() {
    if (racePaused && getGameMode() === GAME_IN_PROGRESS) setEnginePaused(false);
    racePaused = false;
    pausedRaceMode = null;
    gamepadPauseHeld = false;
    SCR_Multiplayer.cleanup();
    mpConnected = false;
    resetMpRaceOutcome();
    resetMpPreviewState();
    mpRoundId = 0;
    mpCurrentFixture = null;
    setTwoPlayerMode(false);
    Module._jsSetSuperLeague(superLeague ? 1 : 0);
  }

  // ── Multiplayer UI screens ─────────────────────────────────

  function showMpRoleSelect() {
    mpSuperLeague = superLeague;
    uiMode = UI_MP_ROLE_SELECT;
    var h = '<div class="overlay-title">Linked Drivers Championship</div>';
    h += '<div class="overlay-description">Connect two computers or phones. The host ' +
      'controls a persistent 2-8 driver fixture series.</div>';
    h += '<div class="overlay-subtitle" style="color:#ff6;margin-bottom:1vh;">\u26A0\uFE0E Works best on a local network</div>';
    h += '<div class="overlay-label">Signaling server</div>';
    h += '<input id="mp-sig-url" type="text" class="multiplayer-signaling-input" value="' +
      signalingUrl.replace(/"/g, '&quot;') + '" />';
    h += '<div id="mp-btn-host" class="overlay-button">Host Championship</div><br>';
    h += '<div id="mp-btn-join" class="overlay-button">Join Championship</div><br>';
    h += '<div id="mp-btn-back" class="overlay-button overlay-button-secondary">Back</div>';
    showOverlay(h);

    function saveSignalingUrl() {
      var inp = document.getElementById('mp-sig-url');
      if (inp) {
        signalingUrl = inp.value.replace(/\/+$/, '');
      }
    }

    overlayBtn('mp-btn-host', 'HOST', function () { saveSignalingUrl(); startHosting(); });
    overlayBtn('mp-btn-join', 'JOIN', function () { saveSignalingUrl(); showJoinScreen(); });
    overlayBtn('mp-btn-back', 'BACK', function () {
      hideOverlay();
      uiMode = UI_MAIN_MENU;
      showUIForMode();
    });
  }

  function startHosting() {
    uiMode = UI_MP_HOST_LOBBY;
    var h = '<div class="overlay-title">Hosting Game</div>';
    h += '<div class="overlay-description">Connecting to signaling server\u2026</div>';
    h += '<div id="mp-host-code" class="multiplayer-code-display"></div>';
    h += '<div id="mp-host-status" class="multiplayer-status">Setting up\u2026</div>';
    h += '<div id="mp-btn-cancel" class="overlay-button overlay-button-secondary">Cancel</div>';
    showOverlay(h);
    overlayBtn('mp-btn-cancel', 'CANCEL', function () {
      mpCleanup();
      hideOverlay();
      uiMode = UI_MAIN_MENU;
      showUIForMode();
    });

    mpSetupCallbacks();

    // Override onOpen to detect connection. mpSetupCallbacks() has already
    // installed the reliable-message callback; keep it in place.
    SCR_Multiplayer.onOpen = function () {
      mpConnected = true;
      // The master machine creates or resumes the linked championship.
      showMpHostSeriesHome();
    };

    SCR_Multiplayer.host(signalingUrl).then(function (code) {
      var codeEl = document.getElementById('mp-host-code');
      if (codeEl) codeEl.textContent = code;
      var statusEl = document.getElementById('mp-host-status');
      if (statusEl) statusEl.textContent = 'Share this code \u2014 waiting for opponent\u2026';
    }).catch(function (err) {
      var statusEl = document.getElementById('mp-host-status');
      if (statusEl) statusEl.textContent = 'Error: ' + err.message;
    });
  }

  function showMpHostTrack(keepSelection) {
    activateGlobalControls();
    uiMode = UI_MP_HOST_TRACK;
    if (!keepSelection) mpTrackIndex = 0;
    selectTrack(mpTrackIndex);
    hideOverlay();
    // Show track selection UI
    var h = '<div class="overlay-title">Select Track</div>';
    h += '<div class="overlay-subtitle" style="margin-bottom:2vh;">Opponent connected!</div>';
    h += '<div id="mp-track-name" class="overlay-result">' + TRACK_NAMES[mpTrackIndex] + '</div>';
    h += '<div style="display:flex;justify-content:center;gap:2vw;">';
    h += '<div id="mp-btn-prev" class="overlay-button">\u25C0\uFE0E</div>';
    h += '<div id="mp-btn-next" class="overlay-button">\u25B6\uFE0E</div>';
    h += '</div>';
    h += '<div id="mp-btn-go" class="overlay-button" style="margin-top:2vh;">Preview Track</div>';
    h += '<div id="mp-btn-cancel2" class="overlay-button overlay-button-secondary">Cancel</div>';
    showOverlay(h);
    overlayBtn('mp-btn-prev', 'PREV', function () {
      mpTrackIndex--;
      if (mpTrackIndex < 0) mpTrackIndex = getNumTracks() - 1;
      selectTrack(mpTrackIndex);
      var element = document.getElementById('mp-track-name');
      if (element) element.textContent = TRACK_NAMES[mpTrackIndex];
    });
    overlayBtn('mp-btn-next', 'NEXT', function () {
      mpTrackIndex++;
      if (mpTrackIndex >= getNumTracks()) mpTrackIndex = 0;
      selectTrack(mpTrackIndex);
      var element = document.getElementById('mp-track-name');
      if (element) element.textContent = TRACK_NAMES[mpTrackIndex];
    });
    overlayBtn('mp-btn-go', 'GO', function () {
      // Begin the original track preview on both peers. The race starts only
      // after each player has pressed Ready.
      mpRoundId++;
      resetMpPreviewState();
      SCR_Multiplayer.sendReliable({
        type: 'preview',
        round: mpRoundId,
        trackIndex: mpTrackIndex,
        superLeague: mpSuperLeague
      });
      hideOverlay();
      fadeMpWhenReady(enterMpPreview);
    });
    overlayBtn('mp-btn-cancel2', 'CANCEL', function () {
      mpCleanup();
      hideOverlay();
      uiMode = UI_MAIN_MENU;
      showUIForMode();
    });
  }

  function showJoinScreen() {
    uiMode = UI_MP_JOIN;
    var h = '<div class="overlay-title">Join Game</div>';
    h += '<div class="overlay-description">Enter the 4-letter code from the host</div>';
    h += '<input id="mp-code-input" type="text" maxlength="4" autocapitalize="characters" class="multiplayer-code-input" />';
    h += '<div id="mp-join-status" class="multiplayer-status"></div>';
    h += '<div id="mp-btn-connect" class="overlay-button">Connect</div>';
    h += '<div id="mp-btn-jback" class="overlay-button overlay-button-secondary">Back</div>';
    showOverlay(h);
    // Focus input
    setTimeout(function () {
      var inp = document.getElementById('mp-code-input');
      if (inp) inp.focus();
    }, 100);
    overlayBtn('mp-btn-connect', 'CONNECT', function () {
      var code = (document.getElementById('mp-code-input').value || '').toUpperCase().trim();
      if (code.length !== 4) {
        document.getElementById('mp-join-status').textContent = 'Code must be 4 characters';
        return;
      }
      joinGame(code);
    });
    overlayBtn('mp-btn-jback', 'BACK', function () {
      hideOverlay();
      showMpRoleSelect();
    });
    // Also allow Enter to connect
    var inp = document.getElementById('mp-code-input');
    if (inp) {
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var btn = document.getElementById('mp-btn-connect');
          if (btn) btn.click();
        }
      });
    }
  }

  function joinGame(code) {
    uiMode = UI_MP_JOIN_LOBBY;
    // The host is authoritative. Do not let a championship cached from a
    // previous room reject an older host's quick-race preview.
    mpSeriesState = null;
    mpCurrentFixture = null;
    var statusEl = document.getElementById('mp-join-status');
    if (statusEl) statusEl.textContent = 'Connecting\u2026';

    mpSetupCallbacks();

    SCR_Multiplayer.onOpen = function () {
      mpConnected = true;
      if (statusEl) statusEl.textContent = 'Connected! Waiting for host to select track\u2026';
      // Disable the Connect button and gray out the code input
      var btn = document.getElementById('mp-btn-connect');
      if (btn) { btn.style.opacity = '0.3'; btn.style.pointerEvents = 'none'; }
      var inp = document.getElementById('mp-code-input');
      if (inp) { inp.disabled = true; inp.style.opacity = '0.3'; }
    };

    SCR_Multiplayer.join(signalingUrl, code).then(function () {
      // Connected, waiting for track selection message via onReliableMessage
    }).catch(function (err) {
      if (statusEl) statusEl.textContent = 'Error: ' + err.message;
    });
  }

  function renderMpSeriesRaceResult() {
    uiMode = UI_MP_RESULT;
    if (!mpResolvedSeriesResult || !mpSeriesState || !mpCurrentFixture) {
      var waiting = '<div class="overlay-title">Synchronizing Result</div>' +
        '<div id="mp-series-sync-wait" class="overlay-description">Waiting for the host ' +
        'to verify both drivers\u2019 times\u2026</div>' +
        '<div id="mp-series-sync-quit" class="overlay-button overlay-button-secondary">Disconnect</div>';
      showOverlay(waiting);
      overlayBtn('mp-series-sync-quit', 'DISCONNECT', function () {
        SCR_Multiplayer.sendReliable({ type: 'quit' }); mpCleanup();
        uiMode = UI_MAIN_MENU; showMainMenu();
      });
      return;
    }
    var result = mpResolvedSeriesResult;
    var fixture = mpCurrentFixture;
    var localId = SCR_Multiplayer.isHost() ? fixture.hostPlayerId : fixture.guestPlayerId;
    var localResult = SCR_Multiplayer.isHost() ? result.host : result.guest;
    var won = result.winnerId === localId;
    var progress = linkChampionship.getProgress(mpSeriesState);
    var roundComplete = progress.complete || progress.completedInRound === 0;
    var bonus = roundComplete ?
      linkChampionship.getRoundBonuses(mpSeriesState, fixture.roundIndex) : null;
    var h = '<div class="overlay-title">Linked Race Result</div>';
    h += '<div class="overlay-track">' + escapeHtml(fixture.trackName) + '</div>';
    h += '<div class="overlay-winner">\uD83C\uDFC6 Winner: <b>' +
      escapeHtml(mpSeriesPlayerName(result.winnerId)) + '</b> (+2 pts)</div>';
    h += '<div class="overlay-fastest">Fastest Lap: <b>' +
      escapeHtml(mpSeriesPlayerName(result.fastestLapWinnerId)) + '</b> (+1 pt)</div>';
    if (localResult.bestLapMs) {
      h += '<div class="overlay-detail">' + escapeHtml(mpSeriesPlayerName(localId)) +
        ' best lap: ' + fmtLap(localResult.bestLapMs) + '</div>';
    }
    if (localResult.raceTimeMs) {
      h += '<div class="overlay-detail">Race time: ' + fmtLap(localResult.raceTimeMs) + '</div>';
    }
    if (mpRecordAnnouncements && mpRecordAnnouncements.newLapRecord) {
      h += '<div class="overlay-result-small color-gold">NEW TRACK LAP RECORD</div>';
    }
    if (mpRecordAnnouncements && mpRecordAnnouncements.newRaceRecord) {
      h += '<div class="overlay-result-small color-gold">NEW TRACK RACE RECORD</div>';
    }
    if (bonus && bonus.complete) {
      var lapNames = bonus.lapWinners.map(function (p) { return p.name; });
      var raceNames = bonus.raceWinners.map(function (p) { return p.name; });
      h += '<div class="hotseat-bonus-card"><div class="overlay-subtitle">Track Bonus Points</div>';
      h += '<div class="overlay-detail">Fastest overall lap: <b>' +
        (lapNames.length ? escapeHtml(lapNames.join(', ')) + ' (+1)' : 'No qualifying time') +
        '</b>' + (bonus.lapTimeMs ? ' - ' + fmtLap(bonus.lapTimeMs) : '') + '</div>';
      h += '<div class="overlay-detail">Fastest overall race: <b>' +
        (raceNames.length ? escapeHtml(raceNames.join(', ')) + ' (+2)' : 'No qualifying time') +
        '</b>' + (bonus.raceTimeMs ? ' - ' + fmtLap(bonus.raceTimeMs) : '') + '</div></div>';
    }
    h += '<div id="mp-series-result-continue" class="overlay-button">Continue</div>';
    showOverlay(h, 'race-art-card ' + (localResult.wrecked ? 'race-wrecked-card' :
      (won ? 'race-won-card' : 'race-lost-card')));
    overlayBtn('mp-series-result-continue', 'CONTINUE', function () {
      resetMpRaceOutcome();
      goToMenu();
      if (mpSeriesState.complete) showMpSeriesStandings();
      else if (SCR_Multiplayer.isHost()) showMpHostSeriesFixture();
      else showMpJoinWaiting();
    });
  }

  function finishMpSeriesRace() {
    captureMpLocalSeriesResult();
    if (SCR_Multiplayer.isHost() && !mpRemoteDriverResult) {
      /* A 30-second peer timeout counts as the absent driver retiring. */
      mpRemoteDriverResult = {
        playerId: mpCurrentFixture.guestPlayerId,
        bestLapMs: null,
        raceTimeMs: null,
        wrecked: true
      };
      if (!mpFirstFinishedPlayerId) mpFirstFinishedPlayerId = mpCurrentFixture.hostPlayerId;
      resolveMpSeriesFixtureIfReady();
    }
    leaveRace(renderMpSeriesRaceResult);
  }

  function finishMpRace() {
    // Capture C++ state before leaveRace resets it
    var wrecked = isPlayerWrecked();
    var won = !wrecked && (mpPlayerFinishedFirst || mpOpponentWrecked);
    var pBest = getPlayerBestLap();
    var pRaceTime = getPlayerRaceTime();
    var recordDriverName = mpSeriesState && mpCurrentFixture ?
      (SCR_Multiplayer.isHost() ? mpCurrentFixture.hostPlayerName :
        mpCurrentFixture.guestPlayerName) : playerName;
    var lapRecord = recordBestLap(mpTrackIndex, mpSuperLeague, pBest, recordDriverName);
    var raceRecord = recordBestRaceTime(
      mpTrackIndex, mpSuperLeague, pRaceTime, recordDriverName);
    mpRecordAnnouncements = {
      newLapRecord: !!(lapRecord && lapRecord.updated),
      newRaceRecord: !!(raceRecord && raceRecord.updated)
    };

    if (mpSeriesState && mpCurrentFixture) {
      finishMpSeriesRace();
      return;
    }

    var h = '<div class="overlay-title">Race Complete</div>';
    if (wrecked && mpOpponentWrecked) {
      h += '<div class="overlay-result-large color-orange">BOTH WRECKED</div>';
    } else if (wrecked) {
      h += '<div class="overlay-result-large color-red">WRECKED</div>';
    } else if (won) {
      h += '<div class="overlay-result-large color-green">\uD83C\uDFC6 YOU WIN!</div>';
    } else {
      h += '<div class="overlay-result-large color-orange">YOU LOSE</div>';
    }
    if (pBest > 0) {
      h += '<div class="overlay-info">Your best lap: ' + fmtLap(pBest) + '</div>';
    }
    if (pRaceTime > 0) {
      h += '<div class="overlay-info">Your race time: ' + fmtLap(pRaceTime) + '</div>';
    }
    if (mpRecordAnnouncements.newLapRecord) {
      h += '<div class="overlay-result-small color-gold">NEW TRACK LAP RECORD</div>';
    }
    if (mpRecordAnnouncements.newRaceRecord) {
      h += '<div class="overlay-result-small color-gold">NEW TRACK RACE RECORD</div>';
    }
    h += '<div id="mp-btn-again" class="overlay-button">Play Again</div>';
    h += '<div id="mp-btn-quit" class="overlay-button overlay-button-secondary">Quit</div>';

    leaveRace(function () {
      uiMode = UI_MP_RESULT;
      showOverlay(h);
      overlayBtn('mp-btn-again', 'AGAIN', function () {
        hideOverlay();
        mpOpponentFinished = false;
        mpOpponentWrecked = false;
        mpPlayerFinishedFirst = false;
        mpPlayerNotified = false;
        goToMenu();
        if (SCR_Multiplayer.isHost()) {
          showMpHostTrack();
        } else {
          showMpJoinWaiting();
        }
      });
      overlayBtn('mp-btn-quit', 'QUIT', function () {
        mpCleanup();
        goToMenu();
        uiMode = UI_MAIN_MENU;
        showUIForMode();
      });
    });
  }

  // ── Main menu screen ──
  function saveHotseatState() {
    if (!hotseat || !hotseatState) return;
    try { hotseat.save(hotseatState); } catch (e) { /* storage unavailable */ }
  }

  function showHotseatSetup(message, forceNew) {
    uiMode = UI_HOTSEAT_SETUP;
    if (hotseatState && !forceNew) {
      var progress = hotseat.getProgress(hotseatState);
      var h = '<div class="overlay-title">Local Drivers Championship</div>';
      h += '<div class="overlay-detail">' + progress.completedRaces + ' of ' +
        progress.totalRaces + ' races complete</div>';
      h += '<div id="hotseat-btn-resume" class="overlay-button">' +
        (hotseatState.complete ? 'View Final Standings' : 'Resume Championship') + '</div><br>';
      h += '<div id="hotseat-btn-new" class="overlay-button">New Championship</div><br>';
      h += '<div id="hotseat-btn-back" class="overlay-button overlay-button-secondary">Back</div>';
      showOverlay(h);
      overlayBtn('hotseat-btn-resume', 'RESUME', function () {
        if (hotseatState.complete) showHotseatStandings(); else showHotseatPreRace();
      });
      overlayBtn('hotseat-btn-new', 'NEW', function () { showHotseatSetup('', true); });
      overlayBtn('hotseat-btn-back', 'BACK', function () { uiMode = UI_MAIN_MENU; showMainMenu(); });
      return;
    }

    var availableTracks = getChampionshipTrackAccess();
    var h = '<div class="overlay-title">New Local Championship</div>';
    if (message) h += '<div class="overlay-detail color-red">' + escapeHtml(message) + '</div>';
    h += '<div class="overlay-description">Enter 2–8 driver names, separated by commas. ' +
      'Choose 1-4 seasons. Each season races both tracks of that division, with every ' +
      'player taking one turn per track.</div>';
    h += '<input id="hotseat-names" type="text" maxlength="110" class="multiplayer-signaling-input" value="' +
      escapeHtml(playerName + ', DRIVER 2') + '" />';
    for (var seasonSlot = 0; seasonSlot < hotseat.maxSeasons; seasonSlot++) {
      h += '<div class="overlay-label">Season ' + (seasonSlot + 1) + '</div>';
      h += '<select id="hotseat-season-' + seasonSlot + '" class="multiplayer-signaling-input">';
      if (seasonSlot > 0) h += '<option value="">None</option>';
      for (var leagueType = 0; leagueType < 2; leagueType++) {
        for (var division = 0; division < hotseat.divisionNames.length; division++) {
          if (!isChampionshipDivisionUnlocked(
              availableTracks, leagueType === 1, division)) continue;
          var seasonValue = (leagueType ? 'super:' : 'standard:') + division;
          var divisionTracks = hotseat.divisionTracks[division];
          var seasonText = (leagueType ? 'Super ' : '') + hotseat.divisionNames[division] +
            ' - ' + hotseat.trackNames[divisionTracks[0]] + ' / ' +
            hotseat.trackNames[divisionTracks[1]];
          h += '<option value="' + seasonValue + '"' +
            (seasonSlot === 0 && leagueType === 0 && division === 0 ? ' selected' : '') + '>' +
            escapeHtml(seasonText) + '</option>';
        }
      }
      h += '</select>';
    }
    h += '<div class="overlay-description">Track choices are unlocked by current or ' +
      'named single-player saves, as in the original game.</div>';
    h += '<div class="overlay-description hotseat-rules">Race: win 2 pts, fastest lap 1 pt. ' +
      'Track bonus: fastest overall lap 1 pt, fastest overall race 2 pts. Ties receive full points.</div>';
    h += '<div id="hotseat-btn-start" class="overlay-button">Start Championship</div><br>';
    h += '<div id="hotseat-btn-cancel" class="overlay-button overlay-button-secondary">Cancel</div>';
    showOverlay(h);
    overlayBtn('hotseat-btn-start', 'START', function () {
      try {
        var input = document.getElementById('hotseat-names');
        var rawNames = input ? input.value.split(',') : [];
        var names = [];
        for (var n = 0; n < rawNames.length; n++) {
          var cleaned = rawNames[n].replace(/^\s+|\s+$/g, '');
          if (cleaned) names.push(cleaned);
        }
        var seasons = [];
        for (var s = 0; s < hotseat.maxSeasons; s++) {
          var seasonSelect = document.getElementById('hotseat-season-' + s);
          var selectedSeason = seasonSelect ? seasonSelect.value : '';
          if (!selectedSeason) continue;
          var seasonParts = selectedSeason.split(':');
          seasons.push({
            superLeague: seasonParts[0] === 'super',
            divisionIndex: parseInt(seasonParts[1], 10)
          });
        }
        hotseatState = hotseat.create({ players: names, seasons: seasons });
        hotseatLastResult = null;
        saveHotseatState();
        showHotseatPreRace();
      } catch (e) {
        showHotseatSetup(e && e.message ? e.message : 'Could not start championship', true);
      }
    });
    overlayBtn('hotseat-btn-cancel', 'CANCEL', function () { uiMode = UI_MAIN_MENU; showMainMenu(); });
  }

  function showHotseatPreRace() {
    if (!hotseatState || hotseatState.complete) {
      showHotseatStandings();
      return;
    }
    uiMode = UI_HOTSEAT_PRE_RACE;
    var race = hotseat.getCurrentRace(hotseatState);
    activateNamedDriverControls(race.driverName);
    var progress = hotseat.getProgress(hotseatState);
    var h = '<div class="overlay-title">Pass the Controls</div>';
    h += '<div class="overlay-result color-yellow">' + escapeHtml(race.driverName) + '</div>';
    h += '<div class="overlay-subtitle">Race ' + race.number + ' of ' + progress.totalRaces + '</div>';
    if (!race.legacy) {
      h += '<div class="overlay-detail">Season ' + race.seasonNumber + ': ' +
        escapeHtml(race.seasonLabel) + ' - Track ' + (race.trackInSeasonIndex + 1) + ' of 2</div>';
    } else {
      h += '<div class="overlay-detail color-yellow">Legacy championship schedule</div>';
    }
    h += '<div class="overlay-track">' + escapeHtml(race.trackName) + '</div>';
    h += '<div class="overlay-matchup">' + escapeHtml(race.driverName) +
      ' <span class="overlay-matchup-vs">vs</span> ' + escapeHtml(race.opponentName) + '</div>';
    h += '<div id="hotseat-btn-race" class="overlay-button">Race</div><br>';
    h += '<div id="hotseat-btn-driver-controls" class="overlay-button">Driver Controls</div><br>';
    h += '<div id="hotseat-btn-standings" class="overlay-button">Standings</div><br>';
    if (!race.legacy) {
      h += '<div id="hotseat-btn-skip-round" class="overlay-button overlay-button-secondary">' +
        'Skip Rest of Round</div><br>';
    }
    h += '<div id="hotseat-btn-pause" class="overlay-button overlay-button-secondary">Pause Championship</div>';
    showOverlay(h);
    overlayBtn('hotseat-btn-race', 'RACE', startHotseatRace);
    overlayBtn('hotseat-btn-driver-controls', 'DRIVER CONTROLS', function () {
      showNamedDriverControls(race.driverName, showHotseatPreRace, false);
    });
    overlayBtn('hotseat-btn-standings', 'STANDINGS', showHotseatStandings);
    overlayBtn('hotseat-btn-skip-round', 'SKIP REST OF ROUND', showHotseatSkipRoundConfirm);
    overlayBtn('hotseat-btn-pause', 'PAUSE', function () { uiMode = UI_MAIN_MENU; showMainMenu(); });
  }

  function showHotseatRoundEnd(summary) {
    var bonus = summary.roundBonus;
    var h = '<div class="overlay-title">End of Round</div>';
    h += '<div class="overlay-track">' + escapeHtml(bonus.trackName) + '</div>';
    h += '<div class="overlay-detail">' + summary.skippedCount +
      (summary.skippedCount === 1 ? ' race skipped' : ' races skipped') + '</div>';
    var lapNames = bonus.lapWinners.map(function (p) { return p.name; });
    var raceNames = bonus.raceWinners.map(function (p) { return p.name; });
    h += '<div class="hotseat-bonus-card"><div class="overlay-subtitle">Track Bonus Points</div>';
    h += '<div class="overlay-detail">Fastest overall lap: <b>' +
      (lapNames.length ? escapeHtml(lapNames.join(', ')) + ' (+1)' : 'No qualifying time') +
      '</b>' + (bonus.lapTimeMs ? ' - ' + fmtLap(bonus.lapTimeMs) : '') + '</div>';
    h += '<div class="overlay-detail">Fastest overall race: <b>' +
      (raceNames.length ? escapeHtml(raceNames.join(', ')) + ' (+2)' : 'No qualifying time') +
      '</b>' + (bonus.raceTimeMs ? ' - ' + fmtLap(bonus.raceTimeMs) : '') + '</div></div>';
    h += '<div id="hotseat-btn-round-continue" class="overlay-button">' +
      (hotseatState.complete ? 'Final Standings' : 'Next Round') + '</div>';
    showOverlay(h);
    overlayBtn('hotseat-btn-round-continue', 'CONTINUE', function () {
      if (hotseatState.complete) showHotseatStandings();
      else showHotseatPreRace();
    });
  }

  function showHotseatSkipRoundConfirm() {
    if (!hotseatState || hotseatState.complete) return;
    var race = hotseat.getCurrentRace(hotseatState);
    if (!race || race.legacy) return;
    var progress = hotseat.getProgress(hotseatState);
    var remaining = progress.racesPerRound - progress.completedInRound;
    var h = '<div class="overlay-title">Skip Rest of Round?</div>';
    h += '<div class="overlay-track">' + escapeHtml(race.trackName) + '</div>';
    h += '<div class="overlay-description">The remaining ' + remaining +
      (remaining === 1 ? ' race' : ' races') +
      ' will not award race points or record times. Completed races still count.</div>';
    h += '<div id="hotseat-btn-skip-confirm" class="overlay-button">Skip to Track Bonuses</div><br>';
    h += '<div id="hotseat-btn-skip-back" class="overlay-button overlay-button-secondary">Back</div>';
    showOverlay(h);
    overlayBtn('hotseat-btn-skip-confirm', 'SKIP TO TRACK BONUSES', function () {
      var summary = hotseat.skipCurrentRound(hotseatState);
      hotseatLastResult = null;
      saveHotseatState();
      showHotseatRoundEnd(summary);
    });
    overlayBtn('hotseat-btn-skip-back', 'BACK', showHotseatPreRace);
  }

  function startHotseatRace() {
    var race = hotseat.getCurrentRace(hotseatState);
    hideOverlay();
    fadeAndDo(function () {
      selectTrackForLeague(race.trackIndex, !!race.superLeague);
      startPreview();
      uiMode = UI_HOTSEAT_PREVIEW;
      showUIForMode();
    });
  }

  function startHotseatRaceFromPreview() {
    var race = hotseat.getCurrentRace(hotseatState);
    fadeAndDo(function () {
      startGame(race.opponentIndex);
      uiMode = UI_HOTSEAT_RACE;
      showUIForMode();
    });
  }

  function finishHotseatRace(forfeit) {
    var race = hotseat.getCurrentRace(hotseatState);
    if (!race) return;
    var pBest = getPlayerBestLap();
    var oBest = getOpponentBestLap();
    var pRaceTime = getPlayerRaceTime();
    var oRaceTime = getOpponentRaceTime();
    var wrecked = isPlayerWrecked();
    var driverWon = !forfeit && !wrecked && isRaceWon();
    var driverFastest = !forfeit && !wrecked && pBest > 0 &&
      (oBest <= 0 || pBest <= oBest);
    var lapRecord = recordBestLap(race.trackIndex, !!race.superLeague, pBest, race.driverName);
    var raceRecord = recordBestRaceTime(
      race.trackIndex, !!race.superLeague, pRaceTime, race.driverName);
    var result = {
      raceId: race.id,
      winner: driverWon ? 'driver' : 'opponent',
      fastestLap: driverFastest ? 'driver' : 'opponent',
      driverBestLapMs: pBest > 0 ? Math.round(pBest) : null,
      opponentBestLapMs: oBest > 0 ? Math.round(oBest) : null,
      driverRaceTimeMs: pRaceTime > 0 ? Math.round(pRaceTime) : null,
      opponentRaceTimeMs: oRaceTime > 0 ? Math.round(oRaceTime) : null,
      driverWrecked: !!(forfeit || wrecked),
      opponentWrecked: false
    };
    hotseat.recordResult(hotseatState, result);
    var trackBonus = hotseat.getRoundBonuses(hotseatState, race.roundIndex);
    saveHotseatState();
    hotseatLastResult = {
      race: race,
      result: result,
      trackBonus: trackBonus,
      newLapRecord: !!(lapRecord && lapRecord.updated),
      newRaceRecord: !!(raceRecord && raceRecord.updated)
    };
    leaveRace(showHotseatResult);
  }

  function showHotseatResult() {
    uiMode = UI_HOTSEAT_RESULT;
    var item = hotseatLastResult;
    if (!item) { showHotseatPreRace(); return; }
    var h = '<div class="overlay-title">Race Result</div>';
    h += '<div class="overlay-track">' + escapeHtml(item.race.trackName) + '</div>';
    h += '<div class="overlay-winner">🏆 Winner: <b>' +
      escapeHtml(item.result.winner === 'driver' ? item.race.driverName : item.race.opponentName) + '</b> (+2 pts)</div>';
    h += '<div class="overlay-fastest">⏱️ Fastest Lap: <b>' +
      escapeHtml(item.result.fastestLap === 'driver' ? item.race.driverName : item.race.opponentName) + '</b> (+1 pt)</div>';
    if (item.result.driverBestLapMs) {
      h += '<div class="overlay-detail">' + escapeHtml(item.race.driverName) + ': ' +
        fmtLap(item.result.driverBestLapMs) + '</div>';
    }
    if (item.newLapRecord) {
      h += '<div class="overlay-result-small color-gold">NEW TRACK LAP RECORD</div>';
    }
    if (item.newRaceRecord) {
      h += '<div class="overlay-result-small color-gold">NEW TRACK RACE RECORD</div>';
    }
    if (item.trackBonus && item.trackBonus.supported && item.trackBonus.complete) {
      var lapBonusNames = [];
      var raceBonusNames = [];
      for (var lb = 0; lb < item.trackBonus.lapWinners.length; lb++) {
        lapBonusNames.push(item.trackBonus.lapWinners[lb].name);
      }
      for (var rb = 0; rb < item.trackBonus.raceWinners.length; rb++) {
        raceBonusNames.push(item.trackBonus.raceWinners[rb].name);
      }
      h += '<div class="hotseat-bonus-card"><div class="overlay-subtitle">Track Bonus Points</div>';
      h += '<div class="overlay-detail">Fastest overall lap: <b>' +
        (lapBonusNames.length ? escapeHtml(lapBonusNames.join(', ')) + ' (+1)' : 'No qualifying time') +
        '</b>' + (item.trackBonus.lapTimeMs ? ' - ' + fmtLap(item.trackBonus.lapTimeMs) : '') + '</div>';
      h += '<div class="overlay-detail">Fastest overall race: <b>' +
        (raceBonusNames.length ? escapeHtml(raceBonusNames.join(', ')) + ' (+2)' : 'No qualifying time') +
        '</b>' + (item.trackBonus.raceTimeMs ? ' - ' + fmtLap(item.trackBonus.raceTimeMs) : '') + '</div></div>';
    }
    h += '<div id="hotseat-btn-next-race" class="overlay-button">Continue</div>';
    var resultClass = item.result.driverWrecked ? 'race-wrecked-card' :
      (item.result.winner === 'driver' ? 'race-won-card' : 'race-lost-card');
    showOverlay(h, 'race-art-card ' + resultClass);
    overlayBtn('hotseat-btn-next-race', 'CONTINUE', function () {
      hotseatLastResult = null;
      if (hotseatState.complete) showHotseatStandings(); else showHotseatPreRace();
    });
  }

  function showHotseatStandings() {
    if (!hotseatState) { showHotseatSetup(); return; }
    uiMode = UI_HOTSEAT_STANDINGS;
    var standings = hotseat.getStandings(hotseatState);
    var h = '<div class="overlay-title">' +
      (hotseatState.complete ? 'Final Drivers Championship' : 'Drivers Championship') + '</div>';
    if (hotseatState.complete && standings.length) {
      h += '<div class="overlay-result color-gold">🏆 ' + escapeHtml(standings[0].name) + ' WINS! 🏆</div>';
    }
    h += '<table class="standings-table"><tr class="standings-header">' +
      '<td>#</td><td>Driver</td><td class="standings-center">W</td>' +
      '<td class="standings-center">FL</td><td class="standings-center">TB</td>' +
      '<td class="standings-center">Pts</td></tr>';
    for (var i = 0; i < standings.length; i++) {
      var row = standings[i];
      h += '<tr><td>' + row.rank + '</td><td>' + escapeHtml(row.name) + '</td>' +
        '<td class="standings-center">' + row.wins + '</td>' +
        '<td class="standings-center">' + row.fastestLaps + '</td>' +
        '<td class="standings-center">' + row.trackBonusPoints + '</td>' +
        '<td class="standings-center standings-bold">' + row.points + '</td></tr>';
    }
    h += '</table>';
    h += '<div class="overlay-description hotseat-standings-key">' +
      'W = race wins - FL = race fastest laps - TB = track bonus points</div>';
    if (!hotseatState.complete) h += '<div id="hotseat-btn-continue" class="overlay-button">Next Race</div><br>';
    h += '<div id="hotseat-btn-finish" class="overlay-button overlay-button-secondary">' +
      (hotseatState.complete ? 'Finish Championship' : 'Back') + '</div>';
    showOverlay(h);
    overlayBtn('hotseat-btn-continue', 'NEXT RACE', showHotseatPreRace);
    overlayBtn('hotseat-btn-finish', hotseatState.complete ? 'FINISH CHAMPIONSHIP' : 'BACK', function () {
      if (hotseatState.complete) {
        try { hotseat.clear(); } catch (e) {}
        hotseatState = null;
      }
      uiMode = UI_MAIN_MENU;
      showMainMenu();
    });
  }

  function showProfileScreen(message) {
    uiMode = UI_PROFILE;
    var h = '<div class="overlay-title">Player Profile</div>';
    if (message) h += '<div class="overlay-detail color-green">' + escapeHtml(message) + '</div>';
    h += '<div class="overlay-label">Driver name (maximum 12 characters)</div>';
    h += '<input id="profile-name" type="text" maxlength="12" class="multiplayer-signaling-input" value="' +
      escapeHtml(playerName) + '" />';
    h += '<div id="profile-btn-save" class="overlay-button">Save Driver Name</div><br>';
    h += '<div id="profile-btn-hall" class="overlay-button">Hall of Fame</div><br>';
    h += '<div id="profile-btn-back" class="overlay-button overlay-button-secondary">Back</div>';
    showOverlay(h);
    overlayBtn('profile-btn-save', 'SAVE NAME', function () {
      var input = document.getElementById('profile-name');
      if (profile && input) playerName = profile.setPlayerName(input.value);
      saveProgress();
      showProfileScreen('Driver name saved');
    });
    overlayBtn('profile-btn-hall', 'HALL OF FAME', showHallOfFame);
    overlayBtn('profile-btn-back', 'BACK', function () {
      uiMode = UI_MAIN_MENU;
      showMainMenu();
    });
    var nameInput = document.getElementById('profile-name');
    if (nameInput) nameInput.select();
  }

  function downloadHallOfFame() {
    var hallFile;
    var text;
    var blob;
    var url;
    var anchor;
    try {
      hallFile = profile.exportHallOfFame();
      text = JSON.stringify(hallFile, null, 2);
      blob = new Blob([text], { type: 'application/json' });
      url = URL.createObjectURL(blob);
      anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = profile.hallFileName(hallFile.exportedAt);
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      showHallOfFame('Hall of Fame file downloaded');
    } catch (error) {
      showHallOfFame(error && error.message ? error.message :
        'Could not export Hall of Fame', true);
    }
  }

  function processHallOfFameText(text) {
    try {
      var summary = profile.mergeHallOfFame(JSON.parse(String(text || '')));
      if (summary.updatedCount > 0) {
        showHallOfFame('Merged ' + summary.updatedCount + ' better record' +
          (summary.updatedCount === 1 ? '' : 's') + ' (' +
          summary.lapRecordsUpdated + ' lap, ' + summary.raceRecordsUpdated + ' race).');
      } else {
        showHallOfFame('No faster records were found in that Hall file.');
      }
    } catch (error) {
      showHallOfFame(error && error.message ? error.message :
        'Could not read Hall of Fame file', true);
    }
  }

  function readHallOfFameFile(file) {
    var reader;
    if (!file) return;
    if (file.size > profile.MAX_HALL_BYTES) {
      showHallOfFame('The selected Hall of Fame file is too large.', true);
      return;
    }
    if (typeof file.text === 'function') {
      file.text().then(processHallOfFameText).catch(function () {
        showHallOfFame('The selected Hall of Fame file could not be read.', true);
      });
      return;
    }
    reader = new FileReader();
    reader.onload = function () { processHallOfFameText(String(reader.result || '')); };
    reader.onerror = function () {
      showHallOfFame('The selected Hall of Fame file could not be read.', true);
    };
    reader.readAsText(file);
  }

  function showHallOfFame(message, isError) {
    uiMode = UI_HALL_OF_FAME;
    var hall = profile ? profile.getHallOfFame() : { rows: [] };
    var h = '<div class="overlay-title">Hall of Fame</div>';
    if (message) {
      h += '<div class="overlay-detail ' + (isError ? 'color-red' : 'color-green') + '">' +
        escapeHtml(message) + '</div>';
    }
    var leagueKeys = ['standard', 'super'];
    var leagueLabels = ['Standard League', 'Super League'];
    for (var leagueIndex = 0; leagueIndex < leagueKeys.length; leagueIndex++) {
      var leagueKey = leagueKeys[leagueIndex];
      h += '<div class="overlay-subtitle">' + leagueLabels[leagueIndex] + '</div>';
      h += '<table class="standings-table"><tr class="standings-header">' +
        '<td>Track</td><td class="standings-center">Best Lap</td>' +
        '<td class="standings-center">Race Time</td></tr>';
      for (var i = 0; i < hall.rows.length; i++) {
        var row = hall.rows[i];
        var lapRecord = row[leagueKey + 'Lap'] || row[leagueKey];
        var raceRecord = row[leagueKey + 'Race'];
        var lap = lapRecord && lapRecord.hasRecord ?
          escapeHtml(lapRecord.formattedTime + '  ' + lapRecord.playerName) : '--:--.--';
        var raceTime = raceRecord && raceRecord.hasRecord ?
          escapeHtml(raceRecord.formattedTime + '  ' + raceRecord.playerName) : '--:--.--';
        h += '<tr><td>' + escapeHtml(row.trackName) + '</td>' +
          '<td class="standings-center">' + lap + '</td>' +
          '<td class="standings-center">' + raceTime + '</td></tr>';
      }
      h += '</table>';
    }
    h += '<div class="portable-backup-section"><div class="overlay-subtitle">Hall File</div>';
    h += '<div class="overlay-detail">Export these records or merge another Hall file. ' +
      'Only faster incoming times are accepted; game progress is never replaced.</div>';
    h += '<div class="portable-backup-actions">';
    h += '<div id="hall-btn-export" class="overlay-button">Export Hall File</div>';
    h += '<div id="hall-btn-import" class="overlay-button">Import & Merge</div></div>';
    h += '<input id="hall-file-input" class="portable-file-input" type="file" ' +
      'accept=".scrhall,.json,application/json" /></div>';
    h += '<div id="hall-btn-back" class="overlay-button overlay-button-secondary">Back</div>';
    showOverlay(h);
    overlayBtn('hall-btn-export', 'EXPORT HALL FILE', downloadHallOfFame);
    overlayBtn('hall-btn-import', 'IMPORT AND MERGE HALL FILE', function () {
      var input = document.getElementById('hall-file-input');
      if (input) input.click();
    });
    overlayBtn('hall-btn-back', 'BACK', function () { showProfileScreen(); });
    var hallInput = document.getElementById('hall-file-input');
    if (hallInput) {
      hallInput.addEventListener('change', function () {
        readHallOfFameFile(hallInput.files && hallInput.files[0]);
      });
    }
  }

  function createPortableBackup() {
    var hotseatCopy = null;
    var linkedCopy = null;
    if (!backupApi || !profile || !profile.exportData) throw new Error('Portable backup is unavailable.');
    if (hotseat && hotseatState) hotseatCopy = hotseat.restore(hotseat.serialize(hotseatState));
    if (linkChampionship && mpSeriesState) {
      linkedCopy = linkChampionship.restore(linkChampionship.serialize(mpSeriesState));
    }
    return backupApi.create({
      progress: progressSnapshot(),
      profile: profile.exportData(),
      hotseat: hotseatCopy,
      linkChampionship: linkedCopy,
      controls: controlsApi.validate(controlsApi.load()),
      driverControls: driverControlsApi ?
        driverControlsApi.restore(driverControlsApi.serialize(driverControlBook)) : null
    }, { createdAt: Date.now(), appVersion: '1.3.42' });
  }

  function downloadPortableBackup() {
    var envelope;
    var text;
    var blob;
    var url;
    var anchor;
    try {
      envelope = createPortableBackup();
      text = backupApi.serialize(envelope);
      blob = new Blob([text], { type: 'application/json' });
      url = URL.createObjectURL(blob);
      anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = backupApi.fileName(envelope.createdAt);
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      showSaveLoad('Portable backup downloaded');
    } catch (error) {
      showSaveLoad(error && error.message ? error.message : 'Could not create portable backup', true);
    }
  }

  function preparePortableImport(envelope) {
    var data;
    if (!backupApi || !profile || !profile.validateImport) throw new Error('Portable restore is unavailable.');
    data = envelope.data;
    return {
      envelope: envelope,
      progress: validateProgressImport(data.progress),
      profile: profile.validateImport(data.profile),
      controls: controlsApi.validate(data.controls),
      driverControls: data.driverControls == null ? driverControlsApi.create() :
        driverControlsApi.restore(data.driverControls),
      hotseat: data.hotseat === null ? null : hotseat.restore(data.hotseat),
      linkChampionship: data.linkChampionship == null ? null :
        linkChampionship.restore(data.linkChampionship)
    };
  }

  function showPortableImportConfirm(prepared) {
    var saveCount = prepared.profile.championshipSaves.length;
    var created = new Date(prepared.envelope.createdAt);
    var h;
    pendingBackupImport = prepared;
    uiMode = UI_SAVE_LOAD;
    h = '<div class="overlay-title">Restore Portable Backup</div>';
    h += '<div class="overlay-description">This replaces the current local game data only after you confirm.</div>';
    h += '<div class="portable-backup-summary">';
    h += '<div><span>Driver</span><b>' + escapeHtml(prepared.profile.playerName) + '</b></div>';
    h += '<div><span>Named saves</span><b>' + saveCount + '</b></div>';
    h += '<div><span>Local championship</span><b>' + (prepared.hotseat ? 'Included' : 'None') + '</b></div>';
    h += '<div><span>Linked championship</span><b>' +
      (prepared.linkChampionship ? 'Included' : 'None') + '</b></div>';
    h += '<div><span>Named driver controls</span><b>' +
      driverControlsApi.list(prepared.driverControls).length + '</b></div>';
    h += '<div><span>Created</span><b>' + escapeHtml(isFinite(created.getTime()) ? created.toLocaleString() : 'Unknown') + '</b></div>';
    h += '</div>';
    h += '<div id="backup-confirm-restore" class="overlay-button">Restore Backup</div>';
    h += '<div id="backup-confirm-cancel" class="overlay-button overlay-button-secondary">Cancel</div>';
    showOverlay(h, 'portable-backup-card');
    overlayBtn('backup-confirm-restore', 'RESTORE BACKUP', restorePortableBackup);
    overlayBtn('backup-confirm-cancel', 'CANCEL', function () {
      pendingBackupImport = null;
      showSaveLoad();
    });
  }

  function restorePortableBackup() {
    var prepared = pendingBackupImport;
    var previous;
    if (!prepared) { showSaveLoad('No backup is waiting to be restored.', true); return; }
    previous = {
      progress: progressSnapshot(),
      profile: profile.exportData(),
      controls: controlsApi.validate(controlsApi.load()),
      driverControls: driverControlsApi.restore(driverControlsApi.serialize(driverControlBook)),
      hotseat: hotseatState ? hotseat.restore(hotseat.serialize(hotseatState)) : null,
      linkChampionship: mpSeriesState ?
        linkChampionship.restore(linkChampionship.serialize(mpSeriesState)) : null
    };
    try {
      profile.importData(prepared.profile);
      controlBindings = controlsApi.save(undefined, prepared.controls);
      driverControlBook = driverControlsApi.save(prepared.driverControls);
      if (prepared.hotseat) hotseat.save(prepared.hotseat);
      else hotseat.clear();
      hotseatState = prepared.hotseat;
      if (prepared.linkChampionship) linkChampionship.save(prepared.linkChampionship);
      else linkChampionship.clear();
      mpSeriesState = prepared.linkChampionship;
      applyProgressData(prepared.progress);
      saveProgress();
      selectTrack(0);
      goToMenu();
      pendingBackupImport = null;
      showSaveLoad('Portable backup restored');
    } catch (error) {
      try {
        profile.importData(previous.profile);
        controlBindings = controlsApi.save(undefined, previous.controls);
        driverControlBook = driverControlsApi.save(previous.driverControls);
        if (previous.hotseat) hotseat.save(previous.hotseat);
        else hotseat.clear();
        hotseatState = previous.hotseat;
        if (previous.linkChampionship) linkChampionship.save(previous.linkChampionship);
        else linkChampionship.clear();
        mpSeriesState = previous.linkChampionship;
        applyProgressData(previous.progress);
        saveProgress();
      } catch (rollbackError) { /* Preserve the original restore error for the UI. */ }
      pendingBackupImport = null;
      showSaveLoad(error && error.message ? error.message : 'Could not restore portable backup', true);
    }
  }

  function processPortableBackupText(text) {
    try {
      showPortableImportConfirm(preparePortableImport(backupApi.parse(text)));
    } catch (error) {
      showSaveLoad(error && error.message ? error.message : 'Could not read portable backup', true);
    }
  }

  function readPortableBackupFile(file) {
    var reader;
    if (!file) return;
    if (file.size > backupApi.MAX_TEXT_BYTES) {
      showSaveLoad('The selected backup is too large.', true);
      return;
    }
    if (typeof file.text === 'function') {
      file.text().then(processPortableBackupText).catch(function () {
        showSaveLoad('The selected backup could not be read.', true);
      });
      return;
    }
    reader = new FileReader();
    reader.onload = function () { processPortableBackupText(String(reader.result || '')); };
    reader.onerror = function () { showSaveLoad('The selected backup could not be read.', true); };
    reader.readAsText(file);
  }

  function showSaveLoad(message, isError) {
    uiMode = UI_SAVE_LOAD;
    pendingBackupImport = null;
    var saves = profile ? profile.listChampionships() : [];
    var defaultName = playerName + (superLeague ? ' Super' : ' Season');
    var h = '<div class="overlay-title">Load / Save Championship</div>';
    if (message) h += '<div class="overlay-detail ' + (isError ? 'color-red' : 'color-green') + '">' + escapeHtml(message) + '</div>';
    h += '<div class="overlay-label">Save name</div>';
    h += '<input id="save-name" type="text" maxlength="24" class="multiplayer-signaling-input" value="' +
      escapeHtml(defaultName) + '" />';
    h += '<div id="save-btn-current" class="overlay-button">Save Current Progress</div>';
    if (!saves.length) {
      h += '<div class="overlay-detail">No named saves yet. Automatic resume remains active.</div>';
    } else {
      h += '<table class="standings-table"><tr class="standings-header"><td>Save</td><td></td><td></td></tr>';
      for (var i = 0; i < saves.length; i++) {
        h += '<tr><td>' + escapeHtml(saves[i].name) + '</td>' +
          '<td><div id="save-load-' + i + '" class="overlay-button">Load</div></td>' +
          '<td><div id="save-delete-' + i + '" class="overlay-button overlay-button-secondary">Delete</div></td></tr>';
      }
      h += '</table>';
    }
    h += '<div class="portable-backup-section">';
    h += '<div class="overlay-subtitle">Portable Backup</div>';
    h += '<div class="overlay-detail">Moves current progress, Replay state, named saves, ' +
      'Hall of Fame, championships, global controls, and named-driver controls between devices.</div>';
    h += '<div class="portable-backup-actions">';
    h += '<div id="backup-btn-export" class="overlay-button">Export Backup</div>';
    h += '<div id="backup-btn-import" class="overlay-button">Import Backup</div>';
    h += '</div>';
    h += '<input id="backup-file-input" class="portable-file-input" type="file" accept=".scrbackup,.json,application/json" />';
    h += '</div>';
    h += '<div id="save-btn-back" class="overlay-button overlay-button-secondary">Back</div>';
    showOverlay(h);

    overlayBtn('save-btn-current', 'SAVE', function () {
      var input = document.getElementById('save-name');
      try {
        profile.saveChampionship(input ? input.value : defaultName, progressSnapshot(), { stateVersion: 3 });
        showSaveLoad('Championship saved');
      } catch (e) {
        showSaveLoad(e && e.message ? e.message : 'Could not save championship', true);
      }
    });
    for (var j = 0; j < saves.length; j++) {
      (function (saveInfo, index) {
        overlayBtn('save-load-' + index, 'LOAD', function () {
          try {
            var loaded = profile.loadChampionship(saveInfo.name);
            if (!loaded) throw new Error('Save not found');
            applyProgressData(loaded.state);
            saveProgress();
            selectTrack(0);
            goToMenu();
            uiMode = UI_MAIN_MENU;
            showMainMenu();
          } catch (e) {
            showSaveLoad(e && e.message ? e.message : 'Could not load championship', true);
          }
        });
        overlayBtn('save-delete-' + index, 'DELETE', function () {
          profile.deleteChampionship(saveInfo.name);
          showSaveLoad('Save deleted');
        });
      }(saves[j], j));
    }
    overlayBtn('backup-btn-export', 'EXPORT PORTABLE BACKUP', downloadPortableBackup);
    overlayBtn('backup-btn-import', 'IMPORT PORTABLE BACKUP', function () {
      var input = document.getElementById('backup-file-input');
      if (input) input.click();
    });
    var backupInput = document.getElementById('backup-file-input');
    if (backupInput) {
      backupInput.addEventListener('change', function () {
        var file = backupInput.files && backupInput.files[0];
        backupInput.value = '';
        readPortableBackupFile(file);
      });
    }
    overlayBtn('save-btn-back', 'BACK', function () {
      uiMode = UI_MAIN_MENU;
      showMainMenu();
    });
  }

  function showMainMenu() {
    controlEditorContext = null;
    activateGlobalControls();
    capturingControlAction = null;
    var h = '<div class="overlay-title-large">STUNT CAR RACER</div>';
    // Division subtitle — show race progress if mid-season
    var divisionText = divLabel(humanDivision);
    if (season) {
      divisionText += (season.currentRace >= 6) ? ', season complete' :
        ', race ' + (season.currentRace + 1) + ' of 6';
    }
    h += '<div class="overlay-subtitle main-menu-status">' +
      escapeHtml(playerName) + ' — ' + divisionText + '</div>';
    h += '<div class="main-menu-actions">';
    h += '<div id="mm-btn-practise" class="overlay-button">Practise</div>';
    var seasonLabel = season ?
      (season.currentRace >= 6 ? 'Review Season Standings' : 'Resume the Racing Season') :
      'Start the Racing Season';
    h += '<div id="mm-btn-season" class="overlay-button">' + seasonLabel + '</div>';
    h += '<div id="mm-btn-hotseat" class="overlay-button">Local Drivers Championship</div>';
    h += '<div id="mm-btn-twoplayer" class="overlay-button">Online Two Players</div>';
    h += '<div id="mm-btn-profile" class="overlay-button">Player / Records</div>';
    h += '<div id="mm-btn-saves" class="overlay-button">Load / Save</div>';
    h += '<div id="mm-btn-controls" class="overlay-button">Controls</div>';
    // Reset button — only show if there is progress to reset
    if (season || seasonStartDivisionAssignments || humanDivision > 0 || superLeague) {
      h += '<div id="mm-btn-reset" class="overlay-button overlay-button-secondary main-menu-reset">' +
        (seasonStartDivisionAssignments ? 'Replay / Reset' : 'Reset Progress') + '</div>';
    }
    h += '</div>';
    h += '<div id="mm-btn-credits" class="overlay-button credits-btn">?</div>';
    showOverlay(h, 'main-menu-card');
    overlayBtn('mm-btn-practise', 'PRACTISE', function () {
      hideOverlay();
      fadeAndDo(function () { uiMode = UI_PRACTISE_MENU; showUIForMode(); });
    });
    overlayBtn('mm-btn-season', 'SEASON', function () {
      hideOverlay();
      if (season) {
        // Resume existing season
        showPreRace();
      } else {
        fadeAndDo(function () {
          seasonStartDivisionAssignments = currentDivisionAssignments.slice();
          seasonStartDamageHolePosition = damageHolePosition;
          seasonStartSuperLeague = superLeague;
          season = createNewSeason(currentDivisionAssignments.slice());
          saveProgress();
          showSeasonOverview();
        });
      }
    });
    overlayBtn('mm-btn-twoplayer', 'TWO PLAYERS', function () {
      hideOverlay();
      showMpRoleSelect();
    });
    overlayBtn('mm-btn-hotseat', 'LOCAL CHAMPIONSHIP', function () {
      hideOverlay();
      showHotseatSetup();
    });
    overlayBtn('mm-btn-profile', 'PLAYER / RECORDS', function () {
      hideOverlay();
      showProfileScreen();
    });
    overlayBtn('mm-btn-saves', 'LOAD / SAVE', function () {
      hideOverlay();
      showSaveLoad();
    });
    overlayBtn('mm-btn-controls', 'CONTROLS', function () {
      showGlobalControlsScreen();
    });
    overlayBtn('mm-btn-reset', 'RESET', function () {
      showResetOptions();
    });
    overlayBtn('mm-btn-credits', 'CREDITS', function () {
      showCredits();
    });
  }

  function setControlStatus(message, isError) {
    var status = document.getElementById('controls-status');
    if (!status) return;
    status.textContent = message || 'Tap a control, then press its new key.';
    status.className = 'controls-status' + (isError ? ' controls-status-error' : '');
  }

  function beginControlCapture(action) {
    var previous;
    var button;
    if (capturingControlAction) {
      previous = document.getElementById('controls-key-' + capturingControlAction);
      if (previous) {
        previous.textContent = controlsApi.labelForCode(controlBindings[capturingControlAction]);
        previous.classList.remove('controls-key-capturing');
      }
    }
    capturingControlAction = action;
    releaseAllDriveInputs();
    button = document.getElementById('controls-key-' + action);
    if (button) {
      button.textContent = 'Press a key...';
      button.classList.add('controls-key-capturing');
    }
    setControlStatus('Press a key for ' + CONTROL_LABELS[action] + '. Escape cancels.', false);
  }

  function cancelControlCapture() {
    var action = capturingControlAction;
    var button;
    if (!action) return;
    capturingControlAction = null;
    button = document.getElementById('controls-key-' + action);
    if (button) {
      button.textContent = controlsApi.labelForCode(controlBindings[action]);
      button.classList.remove('controls-key-capturing');
      button.focus();
    }
    setControlStatus('Key change cancelled.', false);
  }

  function captureControlKey(e) {
    var action = capturingControlAction;
    var duplicateLabel;
    if (!action) return false;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') {
      cancelControlCapture();
      return true;
    }
    try {
      controlBindings = controlsApi.setBinding(controlBindings, action, e.code);
      controlBindings = persistCurrentControlBindings();
      capturingControlAction = null;
      showControlsScreen(CONTROL_LABELS[action] + ' is now ' + controlsApi.labelForCode(e.code) + '.');
    } catch (error) {
      if (error && error.code === 'DUPLICATE_BINDING') {
        duplicateLabel = CONTROL_LABELS[error.action] || error.action;
        setControlStatus(controlsApi.labelForCode(e.code) + ' is already used by ' + duplicateLabel + '.', true);
      } else {
        setControlStatus(error && error.message ? error.message : 'Choose a different key.', true);
      }
    }
    return true;
  }

  function showControlsScreen(message) {
    var h;
    var i;
    var action;
    var editingDriver = controlEditorContext && controlEditorContext.driverName;
    uiMode = UI_CONTROLS;
    capturingControlAction = null;
    h = '<div class="overlay-title">' +
      (editingDriver ? escapeHtml(editingDriver) + ' Controls' : 'Driving Controls') + '</div>';
    h += '<div class="overlay-description controls-description">Choose any of the five ' +
      'original-style driving controls to redefine it.' +
      (editingDriver ? ' This layout is restored whenever that driver races.' : '') + '</div>';
    h += '<div class="controls-grid">';
    for (i = 0; i < controlsApi.ACTIONS.length; i++) {
      action = controlsApi.ACTIONS[i];
      h += '<div class="controls-row">';
      h += '<div class="controls-action">' + CONTROL_LABELS[action] + '</div>';
      h += '<div id="controls-key-' + action + '" class="overlay-button controls-key">' +
        escapeHtml(controlsApi.labelForCode(controlBindings[action])) + '</div>';
      h += '</div>';
    }
    h += '</div>';
    h += '<div id="controls-status" class="controls-status" aria-live="polite">' +
      escapeHtml(message || 'Tap a control, then press its new key.') + '</div>';
    h += '<div class="controls-fallbacks">Tap Forward once to keep accelerating. ' +
      'Brake / Reverse cancels acceleration; release it to freewheel. Arrow keys always ' +
      'steer/drive, either Shift key always boosts, and touch/gamepad use the same latch.</div>';
    h += '<div class="controls-actions">';
    h += '<div id="controls-btn-reset" class="overlay-button overlay-button-secondary">Reset Defaults</div>';
    h += '<div id="controls-btn-back" class="overlay-button">Back</div>';
    h += '</div>';
    showOverlay(h, 'controls-card');
    controlsApi.ACTIONS.forEach(function (controlAction) {
      overlayBtn('controls-key-' + controlAction, 'CHANGE ' + CONTROL_LABELS[controlAction], function () {
        beginControlCapture(controlAction);
      });
    });
    overlayBtn('controls-btn-reset', 'RESET DEFAULT CONTROLS', function () {
      if (editingDriver) {
        controlBindings = controlsApi.defaultBindings();
        controlBindings = persistCurrentControlBindings();
      } else {
        controlBindings = controlsApi.reset();
      }
      releaseAllDriveInputs();
      showControlsScreen('Default WASD and Space controls restored' +
        (editingDriver ? ' for ' + editingDriver : '') + '.');
    });
    overlayBtn('controls-btn-back', 'BACK', function () {
      var context = controlEditorContext;
      controlEditorContext = null;
      if (context && typeof context.returnHandler === 'function') {
        context.returnHandler();
      } else {
        uiMode = UI_MAIN_MENU;
        showMainMenu();
      }
    });
  }

  function showResetOptions() {
    var hasProgressed = humanDivision > 0 || superLeague || damageHolePosition < 10;
    var canReplaySeason = !!seasonStartDivisionAssignments;
    var replayDivision = canReplaySeason ? seasonStartDivisionAssignments[HUMAN_PLAYER] : humanDivision;
    var h = '<div class="overlay-title">' + (canReplaySeason ? 'Replay / Reset' : 'Reset Progress') + '</div>';
    if (canReplaySeason) {
      h += '<div class="overlay-description">Replay restores everything to the start of the last racing season.</div>';
      h += '<div id="reset-btn-season" class="overlay-button">Replay Last Season</div>';
      h += '<div class="overlay-detail">Restart in ' + divLabel(replayDivision) + '</div><br>';
      h += '<div id="reset-btn-all" class="overlay-button">Reset Everything</div>';
      h += '<div class="overlay-detail">Go back to Division 4</div>';
    } else {
      h += '<div class="overlay-description">This will reset all progress' +
        (hasProgressed ? ' and return you to Division 4' : '') + '.</div>';
      h += '<div id="reset-btn-all" class="overlay-button">Reset</div>';
    }
    h += '<div id="reset-btn-cancel" class="overlay-button overlay-button-secondary" style="margin-top:2vh;">Cancel</div>';
    showOverlay(h);
    overlayBtn('reset-btn-season', 'REPLAY LAST SEASON', function () {
      // Original Replay: restore the exact opening league/division/damage state
      // and immediately create the replacement season.
      currentDivisionAssignments = seasonStartDivisionAssignments.slice();
      humanDivision = currentDivisionAssignments[HUMAN_PLAYER];
      superLeague = seasonStartSuperLeague != null ? seasonStartSuperLeague : superLeague;
      damageHolePosition = (seasonStartDamageHolePosition != null) ? seasonStartDamageHolePosition : 10;
      season = createNewSeason(currentDivisionAssignments.slice());
      saveProgress();
      showSeasonOverview();
    });
    overlayBtn('reset-btn-all', 'RESET ALL', function () {
      season = null;
      seasonStartDivisionAssignments = null;
      seasonStartDamageHolePosition = null;
      seasonStartSuperLeague = null;
      superLeague = false;
      humanDivision = 0;
      damageHolePosition = 10;
      currentDivisionAssignments = INITIAL_DIVISIONS.slice();
      saveProgress();
      showMainMenu();
    });
    overlayBtn('reset-btn-cancel', 'CANCEL', function () {
      showMainMenu();
    });
  }

  function showCredits() {
    uiMode = UI_CREDITS;
    var h = '<div class="credits-text">';
    h += '<h1>Original Game</h1>';
    h += '<h2>Program and Design</h2><p>Geoff Crammond</p>';
    h += '<h2>Additional Graphics</h2><p>John Cumming</p>';
    h += '<h1>Conversion of Amiga Source Code to Windows/DirectX</h1>';
    h += '<p>Andrew Copland</p>';
    h += '<h1>Smooth Framerate Patch</h1>';
    h += '<p>Tom Seddon</p>';
    h += '<h1>Web and Mobile Version, Two-Player Version, etc.</h1>';
    h += '<p>Ole Friis</p>';
    h += '<p class="credits-aside">(With a lot of assistance from Claude...)</p>';
    h += '<h1>Technology</h1>';
    h += '<p>This project is built using <a href="https://emscripten.org" target="_blank" rel="noopener">Emscripten</a>.</p>';
    h += '</div>';
    h += '<div id="credits-btn-back" class="overlay-button">Back</div>';
    showOverlay(h);
    overlayBtn('credits-btn-back', 'BACK', function () {
      showMainMenu();
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  BUTTON & KEYBOARD WIRING
  // ══════════════════════════════════════════════════════════════

  function sendLinkedPause(paused) {
    if (uiMode !== UI_MP_RACE && pausedRaceMode !== UI_MP_RACE) return;
    if (!mpConnected ||
        typeof SCR_Multiplayer === 'undefined') return;
    try {
      SCR_Multiplayer.sendReliable({
        type: 'race_pause',
        round: mpRoundId,
        paused: !!paused
      });
    } catch (e) { /* connection close handling owns recovery */ }
  }

  function pauseRace(notifyPeer, remoteRequest) {
    if (!isRaceMode() || racePaused || isRaceFinished()) return;
    pausedRaceMode = uiMode;
    releaseAllDriveInputs();
    racePaused = setEnginePaused(true);
    if (!racePaused) {
      pausedRaceMode = null;
      return;
    }
    if (notifyPeer) sendLinkedPause(true);

    showRacePauseMenu(remoteRequest);
  }

  function showRacePauseMenu(remoteRequest) {
    var raceMode = pausedRaceMode || uiMode;
    var pauseBindingLabels = [
      ['Left', 'left'],
      ['Right', 'right'],
      ['Forward', 'gas'],
      ['Brake', 'brake'],
      ['Boost', 'boost']
    ];
    var h = '<div class="overlay-title">RACE PAUSED</div>';
    if (remoteRequest) {
      h += '<div class="overlay-description">The other driver paused the linked race.</div>';
    } else {
      h += '<div class="overlay-description">Race movement, sound, and lap clocks are stopped.</div>';
    }
    h += '<div class="overlay-label pause-controls-owner">' +
      (activeDriverControlName ? 'Controls for ' + escapeHtml(activeDriverControlName) : 'Current driving keys') +
      '</div><div class="pause-controls-summary" role="group" aria-label="Current driving keys">';
    for (var bindingIndex = 0; bindingIndex < pauseBindingLabels.length; bindingIndex++) {
      var pauseBinding = pauseBindingLabels[bindingIndex];
      h += '<div class="pause-control-chip"><span>' + pauseBinding[0] + '</span><b>' +
        escapeHtml(controlsApi.labelForCode(controlBindings[pauseBinding[1]])) + '</b></div>';
    }
    h += '</div>';
    h += '<div id="race-pause-resume" class="overlay-button">Resume Race</div><br>';
    h += '<div id="race-pause-controls" class="overlay-button">Controls</div><br>';
    h += '<div id="race-pause-retire" class="overlay-button overlay-button-secondary">' +
      (raceMode === UI_PRACTISE_RACE ? 'Exit Run' : 'Retire Race') + '</div>';
    h += '<div class="overlay-detail">F1 opens Controls. O (original), P / Escape, or gamepad Start resumes.</div>';
    showOverlay(h, 'race-pause-card');
    overlayBtn('race-pause-resume', 'RESUME RACE', function () {
      resumeRace(true);
    });
    overlayBtn('race-pause-controls', 'CONTROLS', openPausedRaceControls);
    overlayBtn('race-pause-retire',
      raceMode === UI_PRACTISE_RACE ? 'EXIT RUN' : 'RETIRE RACE', function () {
        resumeRace(false);
        handleMenuDuringRace();
      });
  }

  function openPausedRaceControls() {
    if (!racePaused || !pausedRaceMode) return;
    var raceMode = pausedRaceMode;
    var driverName = activeDriverControlName;
    function returnToPause() {
      uiMode = raceMode;
      showRacePauseMenu(false);
    }
    if (driverName) {
      showNamedDriverControls(
        driverName, returnToPause, raceMode === UI_MP_RACE);
    } else {
      controlEditorContext = { returnHandler: returnToPause };
      showControlsScreen();
    }
  }

  function resumeRace(notifyPeer) {
    var raceMode = pausedRaceMode || (isRaceMode() ? uiMode : null);
    if (!raceMode) {
      racePaused = false;
      hideOverlay();
      return;
    }
    releaseAllDriveInputs();
    racePaused = setEnginePaused(false);
    if (notifyPeer) sendLinkedPause(false);
    pausedRaceMode = null;
    controlEditorContext = null;
    uiMode = raceMode;
    hideOverlay();
  }

  function handleMenuDuringRace() {
    if (uiMode === UI_MP_RACE) {
      if (mpSeriesState && mpCurrentFixture) {
        retireMpSeriesDriver();
        return;
      }
      if (SCR_Multiplayer.isConnected()) {
        try { SCR_Multiplayer.sendReliable({ type: 'quit' }); } catch(e) {}
      }
      mpCleanup();
      leaveRace(function () { uiMode = UI_MAIN_MENU; showUIForMode(); });
    } else if (uiMode === UI_SEASON_RACE) {
      // Record as a loss before leaveRace resets C++ state
      damageHolePosition = getDamageHolePosition();
      var race = season.schedule[season.currentRace];
      var opp = (race.driverA === HUMAN_PLAYER) ? race.driverB : race.driverA;
      race.winnerDriver = opp;
      race.bestLapDriver = opp;
      race.playerWrecked = false;
      race.playerWon = false;
      race.played = true;
      season.points[opp].wins++;
      season.points[opp].bestLaps++;
      saveProgress();
      leaveRace(function () { showRaceResult(race); });
    } else if (uiMode === UI_HOTSEAT_RACE) {
      finishHotseatRace(true);
    } else {
      leaveRace(function () { uiMode = UI_MAIN_MENU; showUIForMode(); });
    }
  }

  function addBtn(id, cb) {
    var btn = document.getElementById(id);
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    if (!btn.getAttribute('aria-label')) {
      btn.setAttribute('aria-label', btn.textContent.trim() || id);
    }
    function activate(e) {
      e.preventDefault();
      cb();
    }
    btn.addEventListener('click', activate);
    btn.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      btn.click();
    });
  }

  function rebuildTouchDrive() {
    touchDrive.left = touchDrive.right = touchDrive.gas = touchDrive.brake = false;
    touchDrive.gasBoost = touchDrive.brakeBoost = false;
    Object.keys(activeDriveTouches).forEach(function (contactId) {
      var field = activeDriveTouches[contactId];
      if (Object.prototype.hasOwnProperty.call(touchDrive, field)) touchDrive[field] = true;
    });
  }

  function beginDriveContact(contactId, field) {
    if (field === 'gas' || field === 'gasBoost') driveAccelerationLatched = true;
    if (field === 'brake' || field === 'brakeBoost') latchDriveBrakePulse();
    activeDriveTouches[contactId] = field;
    rebuildTouchDrive();
    updateDriveFlags();
  }

  function endDriveContact(contactId) {
    delete activeDriveTouches[contactId];
    rebuildTouchDrive();
    updateDriveFlags();
  }

  function setDriveButtonPressed(btn, pressed) {
    if (pressed) {
      btn.style.background = 'rgba(153,85,85,0.88)';
      btn.style.borderColor = 'rgba(255,255,221,1)';
    } else {
      btn.style.removeProperty('background');
      btn.style.removeProperty('border-color');
    }
  }

  function syncDriveButtonPressedStates() {
    var states = {
      'tc-left': touchDrive.left || keyboardDrive.left || gamepadDrive.left,
      'tc-right': touchDrive.right || keyboardDrive.right || gamepadDrive.right,
      // Keep Forward visibly active after a tap. This confirms that the command
      // is queued while the opening crane completes its safe sweep.
      'tc-accel': driveAccelerationLatched || touchDrive.gas || touchDrive.gasBoost ||
        keyboardDrive.gas || gamepadDrive.gas || gamepadDrive.gasBoost,
      'tc-brake': touchDrive.brake || touchDrive.brakeBoost || keyboardDrive.brake ||
        gamepadDrive.brake || gamepadDrive.brakeBoost
    };
    Object.keys(states).forEach(function (id) {
      var button = document.getElementById(id);
      if (button) setDriveButtonPressed(button, !!states[id]);
    });
  }

  function addDriveBtn(id, field) {
    var btn = document.getElementById(id);

    if (window.PointerEvent) {
      btn.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (btn.setPointerCapture) btn.setPointerCapture(e.pointerId);
        setDriveButtonPressed(btn, true);
        beginDriveContact('p' + e.pointerId, field);
      });
      function releasePointer(e) {
        e.preventDefault();
        var contactId = 'p' + e.pointerId;
        // Keep even an extremely quick tap down for one rendered frame so the
        // WebAssembly engine cannot miss it between pointerdown and pointerup.
        window.requestAnimationFrame(function () {
          endDriveContact(contactId);
          setDriveButtonPressed(btn, touchDrive[field]);
        });
      }
      btn.addEventListener('pointerup', releasePointer);
      btn.addEventListener('pointercancel', releasePointer);
      btn.addEventListener('lostpointercapture', releasePointer);
      return;
    }

    btn.addEventListener('touchstart', function (e) {
      e.preventDefault(); setDriveButtonPressed(btn, true);
      for (var i = 0; i < e.changedTouches.length; i++) {
        beginDriveContact('t' + e.changedTouches[i].identifier, field);
      }
    }, { passive: false });
    function releaseTouches(e) {
      e.preventDefault();
      var contactIds = [];
      for (var i = 0; i < e.changedTouches.length; i++) {
        contactIds.push('t' + e.changedTouches[i].identifier);
      }
      window.requestAnimationFrame(function () {
        for (var i = 0; i < contactIds.length; i++) endDriveContact(contactIds[i]);
        setDriveButtonPressed(btn, touchDrive[field]);
      });
    }
    btn.addEventListener('touchend', releaseTouches, { passive: false });
    btn.addEventListener('touchcancel', releaseTouches, { passive: false });
  }

  function addSplitDriveBtn(id, fieldLeft, fieldRight) {
    var btn = document.getElementById(id);
    function getField(contact) {
      var rect = btn.getBoundingClientRect();
      var x = contact.clientX - rect.left;
      return (x < rect.width / 2) ? fieldLeft : fieldRight;
    }

    if (window.PointerEvent) {
      btn.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (btn.setPointerCapture) btn.setPointerCapture(e.pointerId);
        setDriveButtonPressed(btn, true);
        beginDriveContact('p' + e.pointerId, getField(e));
      });
      function releasePointer(e) {
        e.preventDefault();
        var contactId = 'p' + e.pointerId;
        window.requestAnimationFrame(function () {
          endDriveContact(contactId);
          setDriveButtonPressed(btn, touchDrive[fieldLeft] || touchDrive[fieldRight]);
        });
      }
      btn.addEventListener('pointerup', releasePointer);
      btn.addEventListener('pointercancel', releasePointer);
      btn.addEventListener('lostpointercapture', releasePointer);
      return;
    }

    btn.addEventListener('touchstart', function (e) {
      e.preventDefault(); setDriveButtonPressed(btn, true);
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        beginDriveContact('t' + t.identifier, getField(t));
      }
    }, { passive: false });
    function releaseTouches(e) {
      e.preventDefault();
      var contactIds = [];
      for (var i = 0; i < e.changedTouches.length; i++) {
        contactIds.push('t' + e.changedTouches[i].identifier);
      }
      window.requestAnimationFrame(function () {
        for (var i = 0; i < contactIds.length; i++) endDriveContact(contactIds[i]);
        setDriveButtonPressed(btn, touchDrive[fieldLeft] || touchDrive[fieldRight]);
      });
    }
    btn.addEventListener('touchend', releaseTouches, { passive: false });
    btn.addEventListener('touchcancel', releaseTouches, { passive: false });
  }

  function releaseAllDriveInputs() {
    driveAccelerationLatched = false;
    driveBrakePulseUntil = 0;
    activeDriveTouches = {};
    touchDrive.left = touchDrive.right = touchDrive.gas = touchDrive.brake = false;
    touchDrive.gasBoost = touchDrive.brakeBoost = false;
    gamepadDrive.left = gamepadDrive.right = gamepadDrive.gas = gamepadDrive.brake = false;
    gamepadDrive.gasBoost = gamepadDrive.brakeBoost = false;
    keyboardDrive.left = keyboardDrive.right = keyboardDrive.gas = keyboardDrive.brake = keyboardDrive.boost = false;
    setDriveInput(0);
    ['tc-left', 'tc-right', 'tc-accel', 'tc-brake'].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) setDriveButtonPressed(btn, false);
    });
  }

  function updateDriveFlags() {
    var t = touchDrive, k = keyboardDrive, g = gamepadDrive, f = 0;
    var directGas = t.gas || k.gas || g.gas;
    var directBrake = t.brake || k.brake || g.brake;
    var brake = directBrake || Date.now() < driveBrakePulseUntil;
    var gasBoost = t.gasBoost || g.gasBoost || (k.gas && k.boost);
    var brakeBoost = t.brakeBoost || g.brakeBoost || (k.brake && k.boost);
    var gas = directGas || (driveAccelerationLatched && !brake && !brakeBoost);
    if (t.left || k.left || g.left) f |= KEY_LEFT;
    if (t.right || k.right || g.right) f |= KEY_RIGHT;
    if (gasBoost) f |= KEY_ACCEL_BOOST;
    else if (gas) f |= KEY_ACCEL_ONLY;
    if (brakeBoost) f |= KEY_BRAKE_BOOST;
    else if (brake) f |= KEY_HASH;
    if (k.boost && !directGas && !brake && !brakeBoost) f |= KEY_BOOST_ONLY;
    setDriveInput(f);
    syncDriveButtonPressedStates();
  }

  function latchDriveBrakePulse() {
    // A tap must reach the original engine long enough to cancel its internal
    // acceleration latch, even when pointerdown/up land between engine frames.
    driveAccelerationLatched = false;
    driveBrakePulseUntil = Math.max(driveBrakePulseUntil, Date.now() + 200);
    window.setTimeout(updateDriveFlags, 220);
  }

  function isRaceMode() {
    return uiMode === UI_PRACTISE_RACE || uiMode === UI_SEASON_RACE ||
      uiMode === UI_MP_RACE || uiMode === UI_HOTSEAT_RACE;
  }

  function setKeyboardDriveKey(e, pressed) {
    if (pressed && !isRaceMode()) return false;
    var field = controlsApi.fieldForCode(controlBindings, e.code);
    if (!field) return false;
    e.preventDefault();
    if (racePaused) {
      if (!pressed) keyboardDrive[field] = false;
      return true;
    }
    if (pressed) {
      if (field === 'gas') driveAccelerationLatched = true;
      if (field === 'brake') latchDriveBrakePulse();
      keyboardDrive[field] = true;
      updateDriveFlags();
    } else {
      // A synthetic or very fast physical keystroke may deliver keydown and
      // keyup in the same event loop. Defer release so one engine frame sees it.
      window.requestAnimationFrame(function () {
        keyboardDrive[field] = false;
        updateDriveFlags();
      });
    }
    return true;
  }

  function pollGamepad() {
    var inRace = isRaceMode();
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    var pad = null;
    for (var i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
    }
    var left = false, right = false, gas = false, brake = false, boost = false;
    var pausePressed = !!(pad && pad.buttons[9] && pad.buttons[9].pressed);
    if (inRace && pausePressed && !gamepadPauseHeld) {
      if (racePaused) resumeRace(true);
      else pauseRace(true, false);
    }
    gamepadPauseHeld = pausePressed;
    if (inRace && !racePaused && pad) {
      var axis = pad.axes && pad.axes.length ? pad.axes[0] : 0;
      left = axis < -0.25 || !!(pad.buttons[14] && pad.buttons[14].pressed);
      right = axis > 0.25 || !!(pad.buttons[15] && pad.buttons[15].pressed);
      gas = !!((pad.buttons[0] && pad.buttons[0].pressed) ||
        (pad.buttons[7] && (pad.buttons[7].pressed || pad.buttons[7].value > 0.2)));
      brake = !!((pad.buttons[1] && pad.buttons[1].pressed) ||
        (pad.buttons[6] && (pad.buttons[6].pressed || pad.buttons[6].value > 0.2)));
      boost = !!((pad.buttons[4] && pad.buttons[4].pressed) || (pad.buttons[5] && pad.buttons[5].pressed));
      if (brake && !gamepadDrive.brake) latchDriveBrakePulse();
      else if (gas) driveAccelerationLatched = true;
      if (boost && !gas && !brake) gas = true; // also releases the starting crane
    }
    if (gamepadDrive.left !== left || gamepadDrive.right !== right ||
        gamepadDrive.gas !== gas || gamepadDrive.brake !== brake ||
        gamepadDrive.gasBoost !== (gas && boost) || gamepadDrive.brakeBoost !== (brake && boost)) {
      gamepadDrive.left = left;
      gamepadDrive.right = right;
      gamepadDrive.gas = gas;
      gamepadDrive.brake = brake;
      gamepadDrive.gasBoost = gas && boost;
      gamepadDrive.brakeBoost = brake && boost;
      updateDriveFlags();
    }
  }

  function leaveTrackPreview() {
    var previewMode = uiMode;
    if (previewMode === UI_MP_PREVIEW) {
      returnFromMpPreview(true);
      return;
    }
    fadeAndDo(function () {
      goToMenu();
      if (previewMode === UI_PRACTISE_PREVIEW) {
        uiMode = UI_PRACTISE_MENU;
        showUIForMode();
      } else if (previewMode === UI_SEASON_PREVIEW) {
        hideAllUI();
        showPreRace();
      } else if (previewMode === UI_HOTSEAT_PREVIEW) {
        hideAllUI();
        showHotseatPreRace();
      }
    });
  }

  function startTrackPreviewRace() {
    if (uiMode === UI_PRACTISE_PREVIEW) {
      fadeAndDo(function () { startGame(-2); uiMode = UI_PRACTISE_RACE; showUIForMode(); });
    } else if (uiMode === UI_SEASON_PREVIEW) {
      startSeasonRaceFromPreview();
    } else if (uiMode === UI_HOTSEAT_PREVIEW) {
      startHotseatRaceFromPreview();
    } else if (uiMode === UI_MP_PREVIEW) {
      readyMpPreview();
    }
  }

  function wireButtons() {
    // Main Menu
    addBtn('mm-practise', function () {
      fadeAndDo(function () { uiMode = UI_PRACTISE_MENU; showUIForMode(); });
    });
    addBtn('mm-season', function () {
      fadeAndDo(function () {
        seasonStartDivisionAssignments = currentDivisionAssignments.slice();
        seasonStartDamageHolePosition = damageHolePosition;
        seasonStartSuperLeague = superLeague;
        season = createNewSeason(currentDivisionAssignments.slice());
        saveProgress();
        showPreRace();
      });
    });

    // Track Menu (practise)
    addBtn('tc-prev', prevTrack);
    addBtn('tc-next', nextTrack);
    addBtn('tc-select', function () {
      if (getTrackID() < 0) return;
      fadeAndDo(function () { startPreview(); uiMode = UI_PRACTISE_PREVIEW; showUIForMode(); });
    });
    addBtn('tc-backmain', function () {
      fadeAndDo(function () { goToMenu(); uiMode = UI_MAIN_MENU; showUIForMode(); });
    });

    // Track Preview (practise, season, and local championship)
    addBtn('tc-back', leaveTrackPreview);
    addBtn('tc-view-prev', function () { cyclePreviewView(-1); });
    addBtn('tc-view-next', function () { cyclePreviewView(1); });
    addBtn('tc-start', startTrackPreviewRace);

    // In-Game drive
    addDriveBtn('tc-left', 'left');
    addDriveBtn('tc-right', 'right');
    addSplitDriveBtn('tc-accel', 'gasBoost', 'gas');
    addSplitDriveBtn('tc-brake', 'brakeBoost', 'brake');
    window.addEventListener('blur', function () {
      skipRoundModifier = false;
      releaseAllDriveInputs();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        releaseAllDriveInputs();
        if (isRaceMode() && !racePaused) pauseRace(true, false);
      }
    });

    // The original P command paused before offering a safe way to retire.
    addBtn('tc-menu', function () { pauseRace(true, false); });


  }

  function wireKeyboard() {
    document.addEventListener('keydown', function (e) {
      // Don't intercept keys when typing in an input field
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // Restore the original P pause, with Escape as the modern safe-menu
      // equivalent. Stop propagation so the engine's legacy key callback does
      // not toggle a second time after this synchronized UI action.
      if (isRaceMode() &&
          (e.code === 'KeyP' || e.code === 'Pause' || e.key === 'Escape' ||
           e.key === 'Backspace')) {
        e.preventDefault();
        e.stopPropagation();
        if (racePaused) resumeRace(true);
        else pauseRace(true, false);
        return;
      }

      // The original pause prompt resumes on raw key $18 (O). Keep it as an
      // alias on the pause panel while retaining the modern toggle controls.
      if (racePaused && pausedRaceMode && uiMode === pausedRaceMode &&
          e.code === 'KeyO') {
        e.preventDefault();
        e.stopPropagation();
        resumeRace(true);
        return;
      }

      if (racePaused && pausedRaceMode && uiMode === pausedRaceMode &&
          e.code === 'F1') {
        e.preventDefault();
        e.stopPropagation();
        openPausedRaceControls();
        return;
      }

      if (e.code === 'F1') {
        e.preventDefault();
        skipRoundModifier = true;
        return;
      }

      if (captureControlKey(e)) return;

      if (setKeyboardDriveKey(e, true)) return;

      // Season overlay: Enter/Space → primary button, Escape → quit
      if (uiMode === UI_SEASON_OVERVIEW || uiMode === UI_SEASON_PRE_RACE || uiMode === UI_SEASON_RESULT || uiMode === UI_SEASON_STANDINGS) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          var btns = document.querySelectorAll('#season-card div[id^="s-btn-"]');
          if (btns.length > 0) btns[0].click();
          return;
        }
        if (e.key === 'Escape') { e.preventDefault(); pauseSeason(); return; }
      }

      // Multiplayer overlays: Escape → back/cancel
      if (uiMode === UI_MP_ROLE_SELECT || uiMode === UI_MP_HOST_LOBBY || uiMode === UI_MP_HOST_TRACK ||
          uiMode === UI_MP_JOIN || uiMode === UI_MP_JOIN_LOBBY || uiMode === UI_MP_RESULT) {
        if (e.key === 'Escape') {
          e.preventDefault();
          mpCleanup();
          hideOverlay();
          goToMenu();
          uiMode = UI_MAIN_MENU;
          showUIForMode();
          return;
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (skipRoundModifier) {
            var mpSkipButton = document.getElementById('mp-series-skip-round');
            if (mpSkipButton) { mpSkipButton.click(); return; }
          }
          var btns = document.querySelectorAll(
            '#season-card div[id^="mp-btn-"], #season-card div[id^="mp-series-"]');
          if (btns.length > 0) btns[0].click();
          return;
        }
        if (uiMode === UI_MP_HOST_TRACK) {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            var b = document.getElementById('mp-btn-prev');
            if (b) b.click();
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            var b = document.getElementById('mp-btn-next');
            if (b) b.click();
          }
        }
        return;
      }

      if (uiMode === UI_CREDITS) {
        if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault(); showMainMenu();
        }
        return;
      }

      if (uiMode === UI_CONTROLS) {
        if (e.key === 'Escape' || e.key === 'Backspace') {
          e.preventDefault();
          var controlsBack = document.getElementById('controls-btn-back');
          if (controlsBack) controlsBack.click();
          else { uiMode = UI_MAIN_MENU; showMainMenu(); }
        }
        return;
      }

      if (uiMode === UI_PROFILE || uiMode === UI_HALL_OF_FAME || uiMode === UI_SAVE_LOAD) {
        if (e.key === 'Escape' || e.key === 'Backspace') {
          e.preventDefault(); uiMode = UI_MAIN_MENU; showMainMenu();
        }
        return;
      }

      if (uiMode === UI_HOTSEAT_SETUP || uiMode === UI_HOTSEAT_PRE_RACE ||
          uiMode === UI_HOTSEAT_RESULT || uiMode === UI_HOTSEAT_STANDINGS) {
        if (e.key === 'Escape' || e.key === 'Backspace') {
          e.preventDefault(); uiMode = UI_MAIN_MENU; showMainMenu();
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (skipRoundModifier && uiMode === UI_HOTSEAT_PRE_RACE) {
            var hotseatSkipButton = document.getElementById('hotseat-btn-skip-round');
            if (hotseatSkipButton) { hotseatSkipButton.click(); return; }
          }
          var hotseatButtons = document.querySelectorAll('#season-card div[id^="hotseat-btn-"]');
          if (hotseatButtons.length) hotseatButtons[0].click();
        }
        return;
      }

      if (uiMode === UI_MAIN_MENU) {
        if (e.key === '1' || e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          var b = document.getElementById('mm-btn-practise');
          if (b) b.click();
        } else if (e.key === '2' || e.key === 's' || e.key === 'S' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          var b = document.getElementById('mm-btn-season');
          if (b) b.click();
        } else if (e.key === '3' || e.key === 'h' || e.key === 'H') {
          e.preventDefault();
          var b = document.getElementById('mm-btn-hotseat');
          if (b) b.click();
        } else if (e.key === '4' || e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          var b = document.getElementById('mm-btn-twoplayer');
          if (b) b.click();
        } else if (e.key === '5') {
          e.preventDefault();
          var b = document.getElementById('mm-btn-profile');
          if (b) b.click();
        } else if (e.key === '6') {
          e.preventDefault();
          var b = document.getElementById('mm-btn-saves');
          if (b) b.click();
        } else if (e.key === '7' || e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          var b = document.getElementById('mm-btn-controls');
          if (b) b.click();
        }
        return;
      }

      if (uiMode === UI_PRACTISE_MENU) {
        if (e.key === 'ArrowLeft')       { e.preventDefault(); prevTrack(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); nextTrack(); }
        else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (getTrackID() >= 0) fadeAndDo(function () { startPreview(); uiMode = UI_PRACTISE_PREVIEW; showUIForMode(); });
        } else if (e.key === 'Backspace' || e.key === 'Escape') {
          e.preventDefault(); fadeAndDo(function () { goToMenu(); uiMode = UI_MAIN_MENU; showUIForMode(); });
        }
        return;
      }

      if (uiMode === UI_PRACTISE_PREVIEW || uiMode === UI_SEASON_PREVIEW ||
          uiMode === UI_HOTSEAT_PREVIEW || uiMode === UI_MP_PREVIEW) {
        var previewControl = controlsApi.fieldForCode(controlBindings, e.code);
        if (previewControl === 'gas') {
          e.preventDefault(); cyclePreviewView(1);
        } else if (previewControl === 'brake') {
          e.preventDefault(); cyclePreviewView(-1);
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault(); startTrackPreviewRace();
        } else if (e.key === 'Backspace' || e.key === 'Escape') {
          e.preventDefault(); leaveTrackPreview();
        }
        return;
      }

      if (uiMode === UI_PRACTISE_RACE || uiMode === UI_SEASON_RACE ||
          uiMode === UI_MP_RACE || uiMode === UI_HOTSEAT_RACE) {
        if (e.key === 'Backspace') {
          e.preventDefault(); pauseRace(true, false);
        }
        if (cheatAvailable && (uiMode === UI_PRACTISE_RACE || uiMode === UI_SEASON_RACE || uiMode === UI_HOTSEAT_RACE)) {
          if (e.code === 'F9') { e.preventDefault(); cheatWin(); }
          if (e.code === 'F10') { e.preventDefault(); cheatLose(); }
        }
        return;
      }

      if (uiMode === UI_PRACTISE_RESULT) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Backspace' || e.key === 'Escape') {
          e.preventDefault();
          hideOverlay();
          fadeAndDo(function () { goToMenu(); uiMode = UI_PRACTISE_MENU; showUIForMode(); });
        }
        return;
      }
    });
    document.addEventListener('keyup', function (e) {
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'F1') {
        skipRoundModifier = false;
        e.preventDefault();
        return;
      }
      setKeyboardDriveKey(e, false);
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  UI VISIBILITY
  // ══════════════════════════════════════════════════════════════

  var ALL_ELS = [
    'mm-practise', 'mm-season', 'mm-title',
    'tc-prev', 'tc-next', 'tc-select', 'tc-trackname', 'tc-backmain',
    'tc-back', 'tc-view-prev', 'tc-view-next', 'tc-start',
    'tc-left', 'tc-right', 'tc-accel', 'tc-brake', 'tc-boost',
    'tc-menu', 'tc-hud-damage', 'tc-hud-box',
    'tc-gameover-label', 'tc-gameover',
    'chain-boost-hint'
  ];

  function hideAllUI() {
    for (var i = 0; i < ALL_ELS.length; i++) {
      var e = document.getElementById(ALL_ELS[i]);
      if (e) e.style.display = 'none';
    }
    var co = document.getElementById('cockpit-overlay');
    if (co) co.style.display = 'none';
    var dho = document.getElementById('damage-holes-overlay');
    if (dho) dho.style.display = 'none';
    var cvs = document.getElementById('canvas');
    if (cvs) cvs.classList.remove('race-mode');
    if (typeof window.syncGameViewport === 'function') window.syncGameViewport();
    hideOverlay();
  }

  function showEls(ids) {
    for (var i = 0; i < ids.length; i++) {
      var e = document.getElementById(ids[i]);
      if (e) e.style.display = 'flex';
    }
  }

  function showUIForMode() {
    hideAllUI();
    var previewStart = document.getElementById('tc-start');
    if (previewStart && uiMode !== UI_MP_PREVIEW) {
      previewStart.textContent = 'Start';
      previewStart.style.opacity = '1';
    }
    switch (uiMode) {
      case UI_MAIN_MENU:
        showMainMenu(); break;
      case UI_CONTROLS:
        showControlsScreen(); break;
      case UI_PRACTISE_MENU:
        showEls(['tc-prev', 'tc-next', 'tc-select', 'tc-trackname', 'tc-backmain']); break;
      case UI_PRACTISE_PREVIEW:
      case UI_SEASON_PREVIEW:
      case UI_HOTSEAT_PREVIEW:
        showEls(['tc-back', 'tc-view-prev', 'tc-view-next', 'tc-start']); break;
      case UI_MP_PREVIEW:
        showEls(['tc-back', 'tc-view-prev', 'tc-view-next', 'tc-start']);
        updateMpPreviewControls();
        break;
      case UI_PRACTISE_RACE:
      case UI_SEASON_RACE:
      case UI_MP_RACE:
      case UI_HOTSEAT_RACE:
        showEls(['tc-menu']);
        var co = document.getElementById('cockpit-overlay');
        if (co) co.style.display = 'block';
        var dho = document.getElementById('damage-holes-overlay');
        if (dho) dho.style.display = 'block';
        var cvs = document.getElementById('canvas');
        if (cvs) cvs.classList.add('race-mode');
        showEls(['tc-left', 'tc-right', 'tc-accel', 'tc-brake']);
        resetDamageHoleOverlays();
        resetDamagePath();
        break;
      // Season overlays managed by showOverlay()
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  CHAIN / CRANE OVERLAY
  // ══════════════════════════════════════════════════════════════

  // Scroll offset for the chain image when the car has been released.
  var chainScrollOffset = 0;
  var chainReleasing = false;

  function updateChainCanvas() {
    var clip = document.getElementById('chain-clip');
    if (!clip) return;

    var inRace = (uiMode === UI_PRACTISE_RACE || uiMode === UI_SEASON_RACE ||
      uiMode === UI_MP_RACE || uiMode === UI_HOTSEAT_RACE);
    var onChains = inRace && isCarOnChains();

    // Once car leaves chains, animate chains scrolling off upward
    if (!onChains && chainReleasing) {
      chainScrollOffset -= 4;
      if (chainScrollOffset <= -100) {
        chainReleasing = false;
        chainScrollOffset = 0;
        clip.style.display = 'none';
        return;
      }
    } else if (onChains) {
      chainReleasing = true;
      chainScrollOffset = 0;
    } else {
      clip.style.display = 'none';
      return;
    }

    clip.style.display = 'block';
    var img = document.getElementById('chain-img');
    img.style.top = chainScrollOffset + '%';

    // Show/hide "press boost to drop" hint
    var hint = document.getElementById('chain-boost-hint');
    if (hint) hint.style.display = isChainBoostHintVisible() ? 'flex' : 'none';
  }

  // ══════════════════════════════════════════════════════════════
  //  COCKPIT SPEED BAR
  // ══════════════════════════════════════════════════════════════

  // Original 7x8 Amiga cockpit glyphs. Keeping these on the same 320x200
  // pixel grid as cockpit.png avoids browser font substitution and blur.
  var COCKPIT_FONT = {
    ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    '-': [0x00, 0x00, 0x00, 0x7e, 0x00, 0x00, 0x00, 0x00],
    '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0x00],
    ':': [0x00, 0x00, 0x10, 0x00, 0x00, 0x10, 0x00, 0x00],
    '0': [0x00, 0x3c, 0x42, 0x42, 0x42, 0x42, 0x3c, 0x00],
    '1': [0x00, 0x10, 0x30, 0x10, 0x10, 0x10, 0x38, 0x00],
    '2': [0x00, 0x3c, 0x42, 0x0c, 0x30, 0x40, 0x7e, 0x00],
    '3': [0x00, 0x7e, 0x04, 0x0c, 0x02, 0x42, 0x3c, 0x00],
    '4': [0x00, 0x04, 0x0c, 0x14, 0x24, 0x7e, 0x04, 0x00],
    '5': [0x00, 0x7e, 0x40, 0x7c, 0x02, 0x02, 0x7c, 0x00],
    '6': [0x00, 0x3c, 0x40, 0x7c, 0x42, 0x42, 0x3c, 0x00],
    '7': [0x00, 0x7e, 0x04, 0x08, 0x10, 0x20, 0x20, 0x00],
    '8': [0x00, 0x3c, 0x42, 0x3c, 0x42, 0x42, 0x3c, 0x00],
    '9': [0x00, 0x3c, 0x42, 0x3c, 0x04, 0x08, 0x10, 0x00],
    'B': [0x00, 0x78, 0x44, 0x7c, 0x42, 0x42, 0x7c, 0x00],
    'L': [0x00, 0x20, 0x20, 0x20, 0x20, 0x20, 0x3e, 0x00]
  };

  function drawCockpitGlyph(ctx, glyph, x, y) {
    var rows = COCKPIT_FONT[glyph] || COCKPIT_FONT[' '];
    for (var row = 0; row < 8; row++) {
      for (var col = 0; col < 7; col++) {
        if (rows[row] & (0x80 >> col)) ctx.fillRect(x + col, y + row, 1, 1);
      }
    }
  }

  function drawCockpitTime(ctx, milliseconds, y) {
    if (!milliseconds || milliseconds <= 0) return;
    var totalSeconds = Math.floor(milliseconds / 1000);
    var minutes = Math.min(9, Math.floor(totalSeconds / 60));
    var seconds = totalSeconds % 60;
    var hundredths = Math.floor(milliseconds / 10) % 100;
    drawCockpitGlyph(ctx, String(minutes), 259, y);
    drawCockpitGlyph(ctx, ':', 265, y);
    drawCockpitGlyph(ctx, String(Math.floor(seconds / 10)), 270, y);
    drawCockpitGlyph(ctx, String(seconds % 10), 277, y);
    drawCockpitGlyph(ctx, '.', 283, y);
    drawCockpitGlyph(ctx, String(Math.floor(hundredths / 10)), 288, y);
    drawCockpitGlyph(ctx, String(hundredths % 10), 295, y);
  }

  function drawCockpitReadouts(ctx) {
    // HD dash v2 LCDs: left glass x6-69, right glass x256-317, rows y172/y182
    ctx.fillStyle = '#d6ecff';

    var lap = getLapNumber();
    if (lap >= 1) {
      drawCockpitGlyph(ctx, 'L', 10, 172);
      drawCockpitGlyph(ctx, String(Math.min(lap, 3)), 17, 172);
    }

    var boost = Math.max(0, Math.min(99, getBoostReserve()));
    drawCockpitGlyph(ctx, 'B', 32, 172);
    drawCockpitGlyph(ctx, String(Math.floor(boost / 10)), 39, 172);
    drawCockpitGlyph(ctx, String(boost % 10), 46, 172);

    if (uiMode !== UI_PRACTISE_RACE) {
      var rawDistance = getDistanceToOpponent();
      var distance = (rawDistance + (rawDistance >> 2)) >> 2;
      if (distance < 0) drawCockpitGlyph(ctx, '-', 9, 182);
      var digits = ('0000' + Math.min(9999, Math.abs(distance))).slice(-4);
      drawCockpitGlyph(ctx, digits.charAt(0), 16, 182);
      drawCockpitGlyph(ctx, digits.charAt(1), 23, 182);
      drawCockpitGlyph(ctx, digits.charAt(2), 30, 182);
      drawCockpitGlyph(ctx, digits.charAt(3), 37, 182);
    }

    if (lap >= 1) drawCockpitTime(ctx, getCurrentLapTime(), 172);
    drawCockpitTime(ctx, getPlayerBestLap(), 182);
  }

  function updateCockpitSpeedBar() {
    var cvs = document.getElementById('cockpit-canvas');
    if (!cvs) return;
    if (cvs.width !== 320) cvs.width = 320;
    if (cvs.height !== 200) cvs.height = 200;
    var ctx = cvs.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 320, 200);

    // ── Damage bar: wavy black line (Amiga random-walk) ──
    var dmg = Math.min(getDamage(), 240);
    if (dmg > 0) {
      extendDamagePathTo(dmg);

      var holePos = getDamageHolePosition();
      var numHoles = 10 - holePos;
      // Shade row first (behind the black line)
      for (var dx = 0; dx < dmg; dx++) {
        if (isDamagePixelInHole(40 + dx, numHoles)) continue;
        var py = damagePath[dx];
        if (py >= 2) {
          ctx.fillStyle = damageShade[dx] ? '#dd9999' : '#995555';
          ctx.fillRect(40 + dx, py + 42, 1, 1); // +44 HD offset: sit below the cage top bar
        }
      }

      // Black line: 2 rows at y and y-1
      ctx.fillStyle = '#000';
      for (var dx = 0; dx < dmg; dx++) {
        if (isDamagePixelInHole(40 + dx, numHoles)) continue;
        var py = damagePath[dx] + 44; // HD offset: below the cage top bar
        ctx.fillRect(40 + dx, py, 1, 1);
        ctx.fillRect(40 + dx, py - 1, 1, 1);
      }
    }

    // ── Holes: image-based overlays ──
    updateDamageHoleOverlays();

    // ── Speed bar ──
    var playerZSpeed = getPlayerZSpeed();
    var displaySpeed = Math.max(0, Math.min(240, getDisplaySpeed()));
    cvs.setAttribute('aria-valuenow', String(displaySpeed));
    cvs.setAttribute('data-player-z-speed', String(playerZSpeed));
    var speedDelta = Math.max(0, playerZSpeed - 0x1100);
    var speedBar = Math.floor((speedDelta * 0xb700) / 0x800000);
    if (speedBar >= 128) speedBar -= 128;
    speedBar = Math.max(0, Math.min(127, speedBar));
    if (speedBar > 0) {
      // HD dash v2: printed scale runs x101-245 in 320-space, origin at the 50 mark
      ctx.fillStyle = '#ffcc22';
      ctx.fillRect(101, 164, Math.round(speedBar * 144 / 127), 3);
    }

    drawCockpitReadouts(ctx);
  }

  // ══════════════════════════════════════════════════════════════
  //  DAMAGE HOLE / SMASH OVERLAYS
  // ══════════════════════════════════════════════════════════════

  function updateDamageHoleOverlays() {
    var holePos = getDamageHolePosition();
    var numHoles = 10 - holePos;

    // Detect new holes (holePos decreased since last check)
    if (holePos < prevDamageHolePosition) {
      // New holes appeared — show smash for each new slot
      for (var ni = 10 - prevDamageHolePosition; ni < numHoles; ni++) {
        showSmashAtSlot(ni);
      }
    } else if (holePos > prevDamageHolePosition) {
      // Holes were repaired — clear smash timers and hide repaired slots
      for (var ri = numHoles; ri < 10 - prevDamageHolePosition; ri++) {
        clearSmashTimer(ri);
        var rImg = document.querySelector('.cockpit-damage-hole[data-slot="' + ri + '"]');
        if (rImg) rImg.style.display = 'none';
      }
    }
    prevDamageHolePosition = holePos;

    // Show/hide each slot
    var slots = document.querySelectorAll('.cockpit-damage-hole');
    for (var si = 0; si < slots.length; si++) {
      var slot = parseInt(slots[si].dataset.slot, 10);
      if (slot < numHoles) {
        slots[si].style.display = 'block';
      } else {
        slots[si].style.display = 'none';
      }
    }
  }

  function showSmashAtSlot(slotIndex) {
    var img = document.querySelector('.cockpit-damage-hole[data-slot="' + slotIndex + '"]');
    if (!img) return;
    img.src = 'images/indicators/smash.png';
    img.style.display = 'block';
    clearSmashTimer(slotIndex);
    smashTimers[slotIndex] = setTimeout(function () {
      img.src = 'images/indicators/hole.png';
      smashTimers[slotIndex] = null;
    }, 1400);
  }

  function clearSmashTimer(slotIndex) {
    if (smashTimers[slotIndex]) {
      clearTimeout(smashTimers[slotIndex]);
      smashTimers[slotIndex] = null;
    }
  }

  // ── Wavy damage path helpers (Amiga random walk) ──────────

  function resetDamagePath() {
    damagePath = [];
    damageShade = [];
    damagePathY = 4;
  }

  function extendDamagePathTo(len) {
    while (damagePath.length < len) {
      var idx = damagePath.length;
      var y = damagePathY;
      var oldY = y;

      // Only update Y on even indices (every other pixel)
      if (idx % 2 === 0) {
        var r = Math.random();
        if (r >= 0.5) {
          // 50%: try to change direction
          if (r >= 0.75) {
            // 25% total: try increment (up)
            if (y < 5) {
              y++;
            } else {
              // Already high — 50% redirect to decrement, 50% no change
              if (Math.random() < 0.5) y--;
            }
          } else {
            // 25% total: try decrement (down)
            if (y >= 3) {
              y--;
            } else {
              // Already low — 50% redirect to increment, 50% no change
              if (Math.random() < 0.5) y++;
            }
          }
        }
      }

      damageShade.push(y > oldY);
      damagePathY = y;
      damagePath.push(y & 7);
    }
  }

  function isDamagePixelInHole(screenX, numHoles) {
    for (var hi = 0; hi < numHoles; hi++) {
      var holeLeft = DAMAGE_HOLE_X[hi];
      if (screenX >= holeLeft && screenX < holeLeft + 10) return true;
    }
    return false;
  }

  function resetDamageHoleOverlays() {
    // Reset all overlays to match current damageHolePosition
    var holePos = getDamageHolePosition();
    var numHoles = 10 - holePos;
    prevDamageHolePosition = holePos;
    for (var i = 0; i < 10; i++) {
      clearSmashTimer(i);
      var img = document.querySelector('.cockpit-damage-hole[data-slot="' + i + '"]');
      if (!img) continue;
      img.src = 'images/indicators/hole.png';
      img.style.display = (i < numHoles) ? 'block' : 'none';
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  WHEEL OVERLAYS
  // ══════════════════════════════════════════════════════════════

  // Convert a wheel height-difference value (from C++) to a screen Y
  // offset in the 320×200 coordinate space, replicating the Amiga's
  // update.wheel.positions formula using a sine approximation.
  function wheelDiffToY(diff) {
    // The Amiga uses a sine table around a resting Y of 119 and clamps the
    // final wheel destination to 101..135. This eased equivalent preserves
    // that range without letting hard bumps pull the tyres into the engine.
    var normalized = Math.max(-1, Math.min(1, diff / 0x1400));
    var eased = Math.sin(Math.abs(normalized) * Math.PI / 2);
    var y = normalized >= 0 ? 119 - eased * 18 : 119 + eased * 16;
    return Math.max(101, Math.min(135, Math.round(y)));
  }

  // ── Dust cloud particle system (matches Amiga draw.dust.clouds) ──────────
  function updateDustClouds() {
    var els = document.querySelectorAll('.dust-cloud');
    if (!els.length) return;

    var offMap = !!Module._jsIsOffMap();
    var onChains = isCarOnChains();
    var touching = isTouchingRoad();
    // Dust only when off-map AND touching ground AND not on chains
    var showDust = offMap && touching && !onChains;

    if (!showDust) {
      if (dustActive) {
        for (var i = 0; i < els.length; i++) els[i].style.display = 'none';
        dustActive = false;
      }
      return;
    }

    dustActive = true;

    // Throttle to ~12.5 fps to match Amiga frame rate
    var now = performance.now();
    var tick = now - dustLastTick >= 80;
    if (tick) dustLastTick = now;

    // Ferocity from z-speed (capped at 16, matches Amiga)
    var zs = Math.abs(getPlayerZSpeed()) >> 8;
    var ferocity = Math.min(zs, 16);

    if (tick) dustFrameCounter++;

    for (var i = 0; i < DUST_COUNT; i++) {
      var p = dustParticles[i];

      if (tick) {
        // Apply gravity (+2 per tick) and move
        p.yVel += 2;
        p.y += p.yVel;
        p.x += p.xVel;
      }

      // Reset particle if off-screen (Y >= 128 or out of X range)
      if (p.y >= 128 || p.x < 0 || p.x > 255) {
        // Random X: 0–255, random Y: 118–125
        p.x = Math.floor(Math.random() * 256);
        p.y = 118 + Math.floor(Math.random() * 8);
        // Y velocity: upward, based on ferocity + random
        p.yVel = -(Math.floor(ferocity / 2) + Math.floor(Math.random() * 8) + 1);
        // X velocity: derived from position
        p.xVel = Math.floor((p.y - 128) / 8);
      }

      // Only render if within viewport (y < 128, x 0–255)
      if (p.y < 0 || p.y >= 128 || p.x < 0 || p.x > 255) {
        els[i].style.display = 'none';
        continue;
      }

      // Frame selection from sequence table (matches Amiga draw.spark.sub)
      var seqIdx = (i + dustFrameCounter) & 0xf;
      var frame = DUST_FRAME_SEQ[seqIdx];

      // Screen position in 320×200 space
      var drawX = p.x - DUST_X_OFFSET[frame] + 32;
      var drawY = p.y + 16;

      els[i].src = 'images/dust/dust-cloud-' + frame + '.png';
      els[i].style.left = (drawX / 320 * 100) + '%';
      els[i].style.top = (drawY / 200 * 100) + '%';
      els[i].style.width = (DUST_W[frame] / 320 * 100) + '%';
      els[i].style.height = (DUST_H[frame] / 200 * 100) + '%';
      els[i].style.display = 'block';
    }
  }

  // ── Spark particle system (matches Amiga draw.sparks) ────────────────────
  function updateSparks() {
    var els = document.querySelectorAll('.spark-particle');
    if (!els.length) return;

    var ferocity = getSparkFerocity();

    // Throttle physics to ~12.5 fps (80ms) to match Amiga frame rate
    var now = performance.now();
    var tick = now - sparkLastTick >= 80;
    if (tick) sparkLastTick = now;

    // Visible area: x=32..287, y=16..143 in native 320×200 coords
    var VIEW_LEFT = 32, VIEW_RIGHT = 288, VIEW_TOP = 16, VIEW_BOTTOM = 144;
    var anyAlive = false;

    for (var i = 0; i < SPARK_COUNT; i++) {
      var p = sparkParticles[i];

      if (tick && p.life > 0) {
        p.yVel += 0.7;     // gentle gravity
        p.y += p.yVel;
        p.x += p.xVel;
        p.life--;
      }

      // Dead or out of bounds — try to respawn only when ferocity > 0
      if (p.life <= 0 || p.y >= VIEW_BOTTOM || p.y < VIEW_TOP ||
          p.x < VIEW_LEFT || p.x >= VIEW_RIGHT) {
        if (ferocity > 0 && tick && Math.random() < 0.3) {
          p.x = VIEW_LEFT + 32 + Math.floor(Math.random() * 128);
          p.y = VIEW_BOTTOM - 8 + Math.floor(Math.random() * 6);
          p.yVel = -(ferocity / 8 + Math.random() * 4 + 1);
          p.xVel = (Math.random() - 0.5) * 3;
          // Amiga palette: color 15 = white, color 3 = yellow
          p.color = Math.random() < 0.5 ? '#fff' : '#ff0';
          p.life = 8 + Math.floor(Math.random() * 12);
        } else {
          els[i].style.display = 'none';
          continue;
        }
      }

      anyAlive = true;
      els[i].style.left = (p.x / 320 * 100) + '%';
      els[i].style.top = (p.y / 200 * 100) + '%';
      els[i].style.backgroundColor = p.color;
      els[i].style.display = 'block';
    }
  }

  function updateWheels() {
    var wheels = document.querySelectorAll('.cockpit-wheel');
    if (!wheels.length) return;

    var zSpeed = getPlayerZSpeed();
    var absSpeed = Math.abs(zSpeed);

    // ── Update wheel rotation speed (matches set.wheel.rotation.speed) ──
    if (isTouchingRoad()) {
      if (absSpeed < 0x800) {
        wheelRotationSpeed = absSpeed * 8;
      } else {
        wheelRotationSpeed = absSpeed * 2 + 0x3000;
        if (wheelRotationSpeed > 0xFF00) wheelRotationSpeed = 0xFF00;
      }
    } else {
      // Amiga decays by 25% per game frame (~25fps); at browser ~60fps use
      // ~12% (>> 3) so the visual fade-out speed roughly matches.
      wheelRotationSpeed -= (wheelRotationSpeed >> 3);
      if (wheelRotationSpeed < 1) wheelRotationSpeed = 0;
    }

    // ── Advance rotation frame (matches update.wheel.rotation) ──
    wheelRotationAccum += wheelRotationSpeed;
    if (wheelRotationAccum >= 0x10000) {
      wheelRotationAccum -= 0x10000;
      if (zSpeed >= 0) {
        wheelFrameNumber = (wheelFrameNumber + 1) % 3;
      } else {
        wheelFrameNumber = (wheelFrameNumber + 2) % 3;  // decrement with wrap
      }
    }

    // ── Compute Y positions from suspension differences ──
    var diffFL = getWheelDiffFL();
    var diffFR = getWheelDiffFR();
    var leftY = wheelDiffToY(diffFL);
    var rightY = wheelDiffToY(diffFR);

    // Left wheel: right frame = 5 - frameNumber (Amiga convention)
    var leftFrame = (5 - wheelFrameNumber) % 3;
    var rightFrame = wheelFrameNumber;

    // ── Position and show/hide wheel images ──
    for (var i = 0; i < wheels.length; i++) {
      var w = wheels[i];
      var side = w.dataset.side;
      var frame = parseInt(w.dataset.frame, 10);

      if (side === 'left') {
        if (frame === leftFrame) {
          w.style.display = 'block';
          w.style.left = 'calc(12 / 320 * 100%)';
          w.style.top = 'calc(' + (leftY + 14) + ' / 200 * 100%)';
        } else {
          w.style.display = 'none';
        }
      } else {
        if (frame === rightFrame) {
          w.style.display = 'block';
          w.style.left = 'calc(264 / 320 * 100%)';
          w.style.top = 'calc(' + (rightY + 14) + ' / 200 * 100%)';
        } else {
          w.style.display = 'none';
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  PER-FRAME UPDATE
  // ══════════════════════════════════════════════════════════════

  function update() {
    if (!ready) { requestAnimationFrame(update); return; }

    pollGamepad();
    var cppMode = getGameMode();

    // Track name in practise menu
    if (uiMode === UI_PRACTISE_MENU) {
      var label = document.getElementById('tc-trackname');
      if (label) label.textContent = getTrackName();
    }

    // Race-finished detection
    if ((uiMode === UI_PRACTISE_RACE || uiMode === UI_SEASON_RACE ||
         uiMode === UI_MP_RACE || uiMode === UI_HOTSEAT_RACE) &&
        cppMode === GAME_IN_PROGRESS && isRaceFinished()) {

      // ── Multiplayer: notify opponent and determine winner ──
      if (uiMode === UI_MP_RACE && !mpPlayerNotified) {
        mpPlayerNotified = true;
        // If opponent hasn't notified us yet, we finished first
        mpPlayerFinishedFirst = !mpOpponentFinished;
        if (mpSeriesState && mpCurrentFixture) {
          captureMpLocalSeriesResult();
        } else if (SCR_Multiplayer.isConnected()) {
          SCR_Multiplayer.sendReliable({ type: 'finished', wrecked: isPlayerWrecked() });
        }
      }

      if (raceEndTime === 0) raceEndTime = Date.now();

      var lbl = document.getElementById('tc-gameover-label');
      if (lbl) {
        if (uiMode === UI_MP_RACE) {
          if (isPlayerWrecked()) {
            lbl.textContent = mpOpponentFinished ? 'WRECKED' : 'WRECKED \u2013 WAITING\u2026';
          } else {
            lbl.textContent = mpPlayerFinishedFirst ? 'RACE WON' : 'RACE LOST';
          }
        } else if (uiMode === UI_SEASON_RACE || uiMode === UI_HOTSEAT_RACE) {
          lbl.textContent = isPlayerWrecked() ? 'WRECKED' : (isRaceWon() ? 'RACE WON' : 'RACE LOST');
        } else {
          lbl.textContent = isPlayerWrecked() ? 'WRECKED' : 'RACE COMPLETE';
        }
        lbl.style.display = 'flex';
        lbl.style.opacity = (Math.floor(Date.now() / 500) % 2 === 0) ? '1' : '0.2';
      }

      // ── Determine when to exit the race ──
      // For MP: wait until both players have finished (or 30s safety timeout)
      var canExit = true;
      if (uiMode === UI_MP_RACE) {
        var elapsed = Date.now() - raceEndTime;
        canExit = (mpOpponentFinished && elapsed > 3000) || elapsed > 30000;
      }

      if (canExit && Date.now() - raceEndTime > 6000) {
        raceEndTime = 0;
        if (uiMode === UI_MP_RACE) {
          finishMpRace();
        } else if (uiMode === UI_SEASON_RACE) {
          finishSeasonRace();
        } else if (uiMode === UI_HOTSEAT_RACE) {
          finishHotseatRace(false);
        } else {
          var practiseWrecked = isPlayerWrecked();
          var practiseBestLap = getPlayerBestLap();
          var practiseRaceTime = getPlayerRaceTime();
          leaveRace(function () { showPractiseResult(practiseWrecked, practiseBestLap, practiseRaceTime); });
        }
      }
    }

    // ── Chain / crane overlay ──
    updateChainCanvas();

    // Cockpit overlay HUD (shown during active races only)
    if (uiMode === UI_PRACTISE_RACE || uiMode === UI_SEASON_RACE ||
        uiMode === UI_MP_RACE || uiMode === UI_HOTSEAT_RACE) {
      // Keep the 8:5 canvas and its high-DPI backing buffer synchronized.
      if (typeof window.syncGameViewport === 'function') window.syncGameViewport();
      var lap = getLapNumber();

      // Lap / boost
      var lapBoostEl = document.getElementById('cockpit-lap-boost');
      if (lapBoostEl) {
        var lapStr = lap >= 1 ? 'L' + Math.min(lap, 3) : 'L\u00A0';
        var boostStr = 'B' + String(getBoostReserve()).padStart(2, '\u00A0');
        lapBoostEl.textContent = lapStr + '\u00A0' + boostStr;
      }

      // Distance to opponent
      var distEl = document.getElementById('cockpit-distance');
      if (distEl) {
        if (uiMode === UI_PRACTISE_RACE) {
          distEl.textContent = '\u00A0';
        } else {
          var rawDist = getDistanceToOpponent();
          var sign = rawDist < 0 ? '-' : '';
          var absDist = Math.abs(rawDist);
          var digits = absDist > 9999 ? '9999' : ('0000' + absDist).slice(-4);
          distEl.textContent = sign + digits;
        }
      }

      // Current lap time
      var ltEl = document.getElementById('cockpit-laptime');
      if (ltEl) {
        var curMs = getCurrentLapTime();
        ltEl.textContent = (lap >= 1 && curMs > 0) ? fmtLap(curMs) : '\u00A0';
      }

      // Best lap time
      var blEl = document.getElementById('cockpit-bestlap');
      if (blEl) {
        var bestMs = getPlayerBestLap();
        blEl.textContent = bestMs > 0 ? fmtLap(bestMs) : '\u00A0';
      }

      // Speed bar on cockpit canvas
      updateCockpitSpeedBar();

      // Boost flame overlay
      var boostImgs = document.querySelectorAll('.cockpit-boost-img');
      if (isBoostActive()) {
        var now = performance.now();
        if (now - boostFrameTime >= 100) {
          boostFrameTime = now;
          boostFrameIndex = (boostFrameIndex + 1) % 3;
        }
        for (var bi = 0; bi < boostImgs.length; bi++) {
          boostImgs[bi].style.display = (bi === boostFrameIndex) ? 'block' : 'none';
        }
      } else {
        for (var bi = 0; bi < boostImgs.length; bi++) {
          boostImgs[bi].style.display = 'none';
        }
      }

      // Flag indicator (bright when player is winning)
      var flagEl = document.getElementById('cockpit-flag');
      if (flagEl) flagEl.style.display = (!Module._jsIsSoloMode() && isPlayerWinning()) ? 'block' : 'none';

      // Stopwatch indicator (bright when player has best lap)
      var swEl = document.getElementById('cockpit-stopwatch');
      if (swEl) {
        var pBest = getPlayerBestLap(), oBest = getOpponentBestLap();
        swEl.style.display = (!Module._jsIsSoloMode() && pBest > 0 && (oBest <= 0 || pBest <= oBest)) ? 'block' : 'none';
      }

      // Wheel overlays
      updateWheels();

      // Dust cloud particles
      updateDustClouds();

      // Spark particles
      updateSparks();
    }

    // ── Multiplayer per-frame state exchange ──
    if (uiMode === UI_MP_RACE && mpConnected) {
      mpSendState();
    }

    requestAnimationFrame(update);
  }

  // ══════════════════════════════════════════════════════════════
  //  BOOTSTRAP
  // ══════════════════════════════════════════════════════════════

  var booted = false;

  function boot() {
    if (booted) return;
    booted = true;
    loadProgress();
    cheatAvailable = (typeof Module._jsCheatWin === 'function');
    if (typeof window.syncGameViewport === 'function') window.syncGameViewport();
    // Push saved super league state to C++ and rebuild initial track
    selectTrack(0);
    createUI();
    ready = true;
    uiMode = UI_MAIN_MENU;
    showUIForMode();
    requestAnimationFrame(update);
  }

  if (typeof Module !== 'undefined' && (window.__scrRuntimeReady || Module.calledRun)) {
    boot();
  } else {
    var prev = (typeof Module !== 'undefined' && Module.onRuntimeInitialized) || null;
    Module.onRuntimeInitialized = function () {
      if (prev) prev();
      boot();
    };
  }
})();
