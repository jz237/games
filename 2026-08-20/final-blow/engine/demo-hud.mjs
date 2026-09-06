// ===========================================================================
// 5.4 FIGHT NIGHT — THE DEMO'S BROADCAST BUG, ITS SCREENSAVER HYGIENE AND THE
// HIDDEN-TAB HOLD (demo sweep #10 / #28 / #31 / #32).
//
// Everything in here is PRESENTATION LOGIC for the CPU-vs-CPU exhibition and
// nothing else: what the corner bug says, when the operator legend is allowed
// on screen, when the static chrome dims and the pointer hides, and how the
// wall-clock timers that pace the loop (the result hold, the FIGHT! call)
// are frozen while the tab is hidden and re-armed when it returns. None of it
// reads sim state, none of it is snapshotted, and every game.js call site is
// gated on the demo session — a played match never consults this module, so
// it stays byte-identical (pinned by tests/demo-hud.test.mjs from source).
//
// The hold is deliberately NOT the speed transport's pause: the transport is
// the viewer's control (its chip says PAUSED, its keys release it), whereas
// the hold is the page's own idea of "nobody can see this", which no key may
// release and which must never leave the chip lying about the state.
// ===========================================================================

/** Quiet time before the bug tucks into the corner and the chrome dims. */
export const DEMO_HUD_IDLE_MS = 12_000;
/** Quiet time before the pointer is hidden over the demo (cabinet parity). */
export const DEMO_CURSOR_IDLE_MS = 3_000;
/** The RESUMING beat: how long the returned tab stays frozen before the clock runs. */
export const DEMO_RESUME_BEAT_MS = 1_000;

const KEYBOARD_PROMPT = "PRESS ANY BUTTON TO PLAY";
const TOUCH_PROMPT = "TAP TO PLAY";

/**
 * The broadcast bug's three lines. `coarsePointer` swaps the exit prompt for
 * the one a phone viewer can actually follow — the old chip kept telling a
 * touch screen to press a button, and on the phone media query hid the line
 * outright, so mid-fight there was no visible way out at all.
 */
export function demoBugText({
  first = "",
  second = "",
  cycle = 1,
  stageName = "",
  coarsePointer = false,
} = {}) {
  const cycleNumber = Math.max(1, Math.floor(Number(cycle) || 1));
  return {
    matchup: `${String(first || "").toUpperCase()} VS ${String(second || "").toUpperCase()}`,
    cycle: stageName ? `CYCLE ${cycleNumber} · ${String(stageName).toUpperCase()}` : `CYCLE ${cycleNumber}`,
    prompt: coarsePointer ? TOUCH_PROMPT : KEYBOARD_PROMPT,
  };
}

/** The result screen's countdown line, phrased for the pointer in use. */
export function demoResultPrompt({ holdMs = 5000, coarsePointer = false, held = false } = {}) {
  if (held) return "NEXT FIGHT WAITS FOR THE SCREEN";
  const seconds = Math.max(1, Math.round(holdMs / 1000));
  return `NEXT RANDOM FIGHT IN ${seconds} SECOND${seconds === 1 ? "" : "S"} · ${coarsePointer ? TOUCH_PROMPT : KEYBOARD_PROMPT}`;
}

/**
 * The small rate tag inside the bug. It replaces the 20 px canvas chip that
 * used to be the loudest demo-specific text on a TV (and that sat across CPU
 * 1's Grit row on a phone, where the canvas is cropped by object-fit: cover).
 */
export function demoSpeedTag({ rate = 1, paused = false, held = false, cadence = null, beat = "" } = {}) {
  if (held) return { text: "HELD", tone: "held" };
  if (paused) return { text: "PAUSED", tone: "paused" };
  // 5.4 (sweep #17): while the cadence director drives, the tag shows the
  // rate the viewer is actually watching — 1× in neutral, 0.75× in an
  // exchange — and SLOW-MO (never "0.35×") on the KO beat. The operator's
  // own rate takes the tag back the moment a transport key locks the cadence.
  if (cadence !== null && cadence !== undefined) {
    if (beat === "ko") return { text: "SLOW-MO", tone: "slowmo" };
    const driven = Number(cadence);
    const label = Number.isFinite(driven) && driven > 0 ? `${driven}×` : "1×";
    return { text: label, tone: driven === 1 ? "live" : "slow" };
  }
  const value = Number(rate);
  const label = Number.isFinite(value) && value > 0 ? `${value}×` : "1×";
  return { text: label, tone: value === 1 ? "live" : "slow" };
}

/**
 * May the operator's key legend be painted this frame? Hidden by default —
 * the transport keys reveal it (game.js arms `hintUntilMs` on a key) — and
 * never on a coarse pointer, where three lines of keyboard advice are wrong
 * twice over: the keys do not exist and the third line fell off the bottom of
 * an 844x390 viewport.
 */
export function demoLegendVisible({
  scoped = false,
  hintUntilMs = 0,
  nowMs = 0,
  coarsePointer = false,
} = {}) {
  if (!scoped || coarsePointer) return false;
  return nowMs < hintUntilMs;
}

/**
 * The intro/roundover skip hint. Any input EXITS a demo and the CPU seats
 * refuse the skip, so the prompt was an instruction to kill the show.
 */
export function flowSkipHintVisible({ screen = "", phase = "", demoActive = false } = {}) {
  if (demoActive) return false;
  return screen === "fight" && (phase === "intro" || phase === "roundover");
}

/**
 * The FINISH THEM sub-line. A spectator does not hold a controller; in a demo
 * the line says who is moving in instead of which button to press. Outside
 * the demo the exact shipped string is returned, so a played match reads the
 * same bytes it always has.
 */
export const FINISH_THEM_PLAYER_SUBLINE = "LP = A  ·  LK = B  ·  ANY DISTANCE";
export function finishThemSubline({ demo = false, winnerName = "" } = {}) {
  if (!demo) return FINISH_THEM_PLAYER_SUBLINE;
  const name = String(winnerName || "").toUpperCase();
  return name ? `${name} MOVES IN FOR THE FINAL BLOW` : "THE FINAL BLOW IS COMING";
}

/**
 * Screensaver state. Both clocks restart on real input (mouse movement, a
 * transport key) and the HUD clock ALSO restarts on every new exhibition, so
 * the bug announces each matchup at full strength and then gets out of the
 * way — an attract loop that has already run 45 s unattended does not need
 * to wait another idle window before it tucks.
 */
export function demoIdleState({
  now = 0,
  lastInputAt = 0,
  matchStartedAt = 0,
  hudIdleMs = DEMO_HUD_IDLE_MS,
  cursorIdleMs = DEMO_CURSOR_IDLE_MS,
} = {}) {
  const sinceInput = now - lastInputAt;
  const sinceShow = now - Math.max(lastInputAt, matchStartedAt);
  return {
    cursorIdle: sinceInput >= cursorIdleMs,
    hudIdle: sinceShow >= hudIdleMs,
  };
}

/** Should the demo be held right now? Hidden tab, or a phone turned portrait. */
export function demoHoldWanted({ hidden = false, orientationBlocked = false } = {}) {
  return Boolean(hidden || orientationBlocked);
}

/** How much of a wall-clock hold is left when it is frozen. */
export function demoResultHoldRemaining({ armedAt = 0, holdMs = 0, now = 0 } = {}) {
  return Math.max(0, Math.round(armedAt + holdMs - now));
}

/**
 * The hold state machine. `hold(now)` freezes; `release(now)` starts the
 * RESUMING beat; `settle(now)` is asked once per rendered frame and reports
 * the moment the beat has run out, handing back the total time held so the
 * caller can shift its wall-clock plans by exactly that much. `frozen()` is
 * what the render loop reads: true from hold() through the end of the beat.
 */
export function createDemoHold({ beatMs = DEMO_RESUME_BEAT_MS } = {}) {
  return {
    phase: "live",
    since: 0,
    resumeAt: 0,
    heldMs: 0,
    holds: 0,

    hold(now) {
      if (this.phase === "held") return false;
      // A hold that lands during a RESUMING beat keeps the ORIGINAL start:
      // the viewer has not seen a frame since then, so the plans still owe
      // the whole span.
      if (this.phase === "live") this.since = now;
      this.phase = "held";
      this.resumeAt = 0;
      this.holds += 1;
      return true;
    },

    release(now) {
      if (this.phase !== "held") return false;
      this.phase = "resuming";
      this.resumeAt = now + beatMs;
      return true;
    },

    settle(now) {
      if (this.phase !== "resuming" || now < this.resumeAt) return null;
      const heldMs = Math.max(0, now - this.since);
      this.phase = "live";
      this.since = 0;
      this.resumeAt = 0;
      this.heldMs += heldMs;
      return { heldMs };
    },

    frozen() {
      return this.phase !== "live";
    },

    reset() {
      this.phase = "live";
      this.since = 0;
      this.resumeAt = 0;
    },

    snapshot() {
      return { phase: this.phase, holds: this.holds, heldMs: Math.round(this.heldMs) };
    },
  };
}
