// 5.4 FIGHT NIGHT (sweep #19 / #22 / #24): the attract demo's audio contract —
// when the unattended show is allowed to make its first sound, and which bed
// it plays under an exhibition. Pure state and pure decisions so node can pin
// them; every element, listener, gain and timer stays in game.js.
//
// What was wrong (measured in headless Chrome, cold load, no gesture):
//   (1) The attract loop starts with no user gesture, so every audio path in
//       game.js held on `demoSession.attract && !state.audioUnlocked`. Two
//       synth paths did not (perfectGuardTink, objectSound): the first
//       PERFECT GUARD of the show called unlockAudio() itself, flipped the
//       flag, and the bed, the announcer and the crowd all joined 3.9 s into
//       an exchange — with the round card already spent. The exit gesture
//       (any key / pointer) never armed audio, so the NEXT idle cycle was as
//       silent as the first.
//   (2) startNextDemoMatch set the bed from the director's own track bag,
//       independent of the stage bag: the stage's own theme played in 17.2%
//       of 600 director cycles (wildwood 14/100, cruise 16/100 — the two
//       tracks 5.3 generated specifically for those stages). The bed also ran
//       out at 80 s and the AUTO jukebox advanced to the next file mid-round.
//
// What ships. A three-state ARMING GATE — cold / armed / live — that only
// ever advances on a user gesture Chrome counts as activation, and once
// armed releases the sound AT THE NEXT ROUND CARD (never mid-exchange):
// the first thing a viewer hears is the announcer's ROUND call, the bed
// fades in under it, then FIGHT! and the round-start stinger. A gesture that
// lands while the card is still up (before FIGHT!) joins that same bell.
// The bed becomes the stage's own theme (stageMusicTrackIndex), loops for the
// exhibition, and is restarted UNDER THE ROUND CARD when it would otherwise
// run out mid-round — so the seam lands on the punctuation, not the fight.
// The whole module is consulted only behind `demoSession.attract` or
// `state.mode === "demo"`; a played match never reaches it.

export const ATTRACT_AUDIO_STATES = Object.freeze({ cold: "cold", armed: "armed", live: "live" });

// The bed's fade-in when the gate opens on a card (the ROUND call is ~1.2 s;
// the bed is under it by FIGHT!).
export const ATTRACT_BED_FADE_MS = 1500;

// An attract round measured 16.7 s of fighting plus an 8.7 s ceremony plus
// the card (sweep #1): a bed with less than this left at the card would end
// and seam inside the round, so it restarts under the card instead.
export const DEMO_BED_RESTART_WINDOW_SECONDS = 30;

/**
 * Does this DOM event count as the activation Chrome needs before play() and
 * AudioContext.resume() are allowed? The sticky flag is the truth wherever
 * the browser exposes it (navigator.userActivation.hasBeenActive is set
 * BEFORE the activating event is dispatched, so reading it inside the
 * handler is exact). Without it, the table is Chrome's: keydown except
 * Escape, a mouse press, a touch RELEASE (a touch pointerdown does not count
 * — the matching pointerup does). Untrusted (synthetic) events never arm.
 */
export function gestureArmsAudio({ trusted = false, type = "", code = "", pointerType = "", hasBeenActive = null } = {}) {
  if (!trusted) return false;
  if (hasBeenActive === true) return true;
  if (hasBeenActive === false) {
    // The flag exists and is still false after this event: Chrome did not
    // count it (Escape, a touch press, a synthetic dispatch).
    return false;
  }
  switch (type) {
    case "keydown": return code !== "Escape";
    case "pointerdown":
    case "mousedown": return pointerType !== "touch";
    case "pointerup":
    case "mouseup":
    case "click":
    case "touchend": return true;
    default: return false;
  }
}

/**
 * The arming gate. `cold`: no accepted gesture yet — every audio path holds
 * and the HUD shows TAP FOR SOUND. `armed`: a gesture was accepted (or the
 * page had audio unlocked before the show began) and the sound is waiting
 * for the next round card. `live`: sounding. The card window (`cardOpen`)
 * runs from the ROUND card to FIGHT!: a gesture inside it goes live at once
 * — the bell is still ahead — a gesture after it waits for the next card.
 */
export function createAttractAudioGate() {
  let state = ATTRACT_AUDIO_STATES.cold;
  let cardOpen = false;
  let liveReason = "";
  let opens = 0;

  function goLive(reason) {
    if (state === ATTRACT_AUDIO_STATES.live) return false;
    state = ATTRACT_AUDIO_STATES.live;
    liveReason = reason;
    opens += 1;
    return true;
  }

  return Object.freeze({
    /** A new attract show begins; `unlocked` = the page already has a gesture behind it. */
    beginShow({ unlocked = false } = {}) {
      cardOpen = false;
      liveReason = "";
      if (unlocked || state !== ATTRACT_AUDIO_STATES.cold) state = ATTRACT_AUDIO_STATES.armed;
      return state;
    },
    /** An accepted user gesture. Returns true when the gate opened right here. */
    gesture() {
      if (state === ATTRACT_AUDIO_STATES.live) return false;
      state = ATTRACT_AUDIO_STATES.armed;
      return cardOpen ? goLive("gesture-at-card") : false;
    },
    /** The ROUND card went up. Returns true when the gate opened on it. */
    roundCard() {
      cardOpen = true;
      return state === ATTRACT_AUDIO_STATES.armed ? goLive("card") : false;
    },
    /** FIGHT! — the card window closes; a later gesture waits for the next card. */
    bell() {
      cardOpen = false;
    },
    /** The show ends (exit or a played match): live memory becomes armed. */
    endShow() {
      cardOpen = false;
      if (state === ATTRACT_AUDIO_STATES.live) state = ATTRACT_AUDIO_STATES.armed;
      return state;
    },
    live() {
      return state === ATTRACT_AUDIO_STATES.live;
    },
    armed() {
      return state !== ATTRACT_AUDIO_STATES.cold;
    },
    snapshot() {
      return { state, cardOpen, liveReason, opens };
    },
  });
}

/**
 * The HUD chip's copy for a gate state: TAP FOR SOUND while nothing has
 * armed it, SOUND AT THE BELL once a gesture has and the show is waiting for
 * its next card, nothing once it sounds. Only the attract show wears it — a
 * WATCH DEMO started from the button already has the gesture.
 */
export function attractSoundChip({ attract = false, state = ATTRACT_AUDIO_STATES.cold } = {}) {
  if (!attract) return "";
  if (state === ATTRACT_AUDIO_STATES.cold) return "TAP FOR SOUND";
  if (state === ATTRACT_AUDIO_STATES.armed) return "SOUND AT THE BELL";
  return "";
}

/** Only the demo loops its bed; AUTO in every played mode still jukeboxes on `ended`. */
export function demoBedLoops(mode) {
  return mode === "demo";
}

/** Only the demo swaps the round-robin voice cursor for the shuffle bag. */
export function demoVoiceDrawsFromBag(mode) {
  return mode === "demo";
}

/**
 * Restart the bed under this round card? Yes when the element knows its
 * length and less than a round's worth is left — the restart then lands
 * under the ROUND call's duck instead of as an `ended` seam in the fight.
 */
export function demoBedRestartAtCard({ currentTime = 0, duration = NaN, windowSeconds = DEMO_BED_RESTART_WINDOW_SECONDS } = {}) {
  if (!Number.isFinite(duration) || duration <= 0) return false;
  if (!Number.isFinite(currentTime) || currentTime <= 0) return false;
  return duration - currentTime < windowSeconds;
}

/** One render-clock step of the bed fade-in (linear, clamped). */
export function bedFadeStep(level, dtSeconds, fadeMs = ATTRACT_BED_FADE_MS) {
  if (level >= 1) return 1;
  const step = Math.max(0, dtSeconds) * 1000 / Math.max(1, fadeMs);
  return Math.min(1, level + step);
}
