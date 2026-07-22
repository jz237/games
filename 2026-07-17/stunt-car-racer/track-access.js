/**
 * Original multiplayer track-access rules.
 *
 * Division 4 of the standard league is always available. Higher standard
 * divisions become available when a current or named single-player save has
 * reached them. Reaching the Super League proves access to every standard
 * division and unlocks Super League divisions up to that save's position.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.SCR_TrackAccess = api;
}(typeof window !== 'undefined' ? window :
  (typeof global !== 'undefined' ? global : this), function () {
  'use strict';

  var DIVISION_COUNT = 4;

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function validDivision(value) {
    return typeof value === 'number' && isFinite(value) &&
      Math.floor(value) === value && value >= 0 && value < DIVISION_COUNT;
  }

  function emptyAccess() {
    return {
      standard: [true, false, false, false],
      super: [false, false, false, false]
    };
  }

  function unlockThrough(values, divisionIndex) {
    for (var division = 0; division <= divisionIndex; division += 1) {
      values[division] = true;
    }
  }

  function fromProgressStates(states) {
    var access = emptyAccess();
    var source = Array.isArray(states) ? states : [];
    for (var i = 0; i < source.length; i += 1) {
      var state = source[i];
      if (!isObject(state) || !validDivision(state.humanDivision) ||
          (state.superLeague !== true && state.superLeague !== false)) continue;
      if (state.superLeague) {
        unlockThrough(access.standard, DIVISION_COUNT - 1);
        unlockThrough(access.super, state.humanDivision);
      } else {
        unlockThrough(access.standard, state.humanDivision);
      }
    }
    return access;
  }

  function isUnlocked(access, superLeague, divisionIndex) {
    if (!isObject(access) || !validDivision(divisionIndex)) return false;
    var values = superLeague ? access.super : access.standard;
    return Array.isArray(values) && values.length === DIVISION_COUNT &&
      values[divisionIndex] === true;
  }

  function count(access) {
    var total = 0;
    for (var league = 0; league < 2; league += 1) {
      var values = league ? access.super : access.standard;
      if (!Array.isArray(values)) continue;
      for (var division = 0; division < DIVISION_COUNT; division += 1) {
        if (values[division] === true) total += 1;
      }
    }
    return total;
  }

  return {
    divisionCount: DIVISION_COUNT,
    fromProgressStates: fromProgressStates,
    isUnlocked: isUnlocked,
    count: count
  };
}));
