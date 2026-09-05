// ===========================================================================
// v3.2 SHOWCASE — ADJUSTABLE DEMO SPEED.
//
// WHY THIS IS A CADENCE SCALER AND NOT A dt SCALER.
//
// Final Blow simulates on a fixed 60Hz timestep behind a rollback engine.
// Every frame-count in the game — startup, active and recovery windows, the
// six-frame input buffer, hitstun, the 48-frame stun decay grace, the
// choreographer's per-kind timeouts — is an INTEGER NUMBER OF TICKS, and
// every physics integration is written against `SIMULATION_STEP_SECONDS`.
// Handing the sim a smaller dt would change all of it at once: a 0.25x dt
// quarters the distance a walk covers per tick while leaving the frame
// windows alone, so spacing, reach and every cancel window drift, and two
// peers (or a rollback resimulation against a live one) integrating the same
// inputs at different dt produce different states. That is a desync, and it
// is also simply the wrong picture — the owner asked to watch the SHIPPED
// animation slowly, not a different animation.
//
// So nothing here ever touches dt. The only thing that changes is HOW OFTEN
// the fixed step is taken against the wall clock: `scale()` shrinks the
// seconds handed to `FixedStepClock.advance`, the clock's accumulator
// therefore crosses `stepSeconds` proportionally less often, and each tick it
// does take still runs at exactly 1/60s. 0.5x = a tick every other rendered
// frame, 0.1x = a tick roughly every tenth. Rendering keeps running at the
// display rate, so motion still reads smoothly (the renderer already
// interpolates presentation off `state.simulationAlpha`, which the smaller
// accumulator advance drives for free).
//
// The tick STREAM is bit-identical either way: same inputs, same order, same
// dt, just spread over more wall-clock. That is why this cannot desync, and
// it is also why it is still scoped to offline demo/training and refuses to
// arm in online — a peer that renders the same ticks over a different
// wall-clock still has to deliver its inputs on time.
// ===========================================================================

/** Selectable rates, fastest first. `[` / `]` walk this list. */
// 4.3: 0.75 added and made the default — the attract demo at full speed was
// too quick to read from the couch (Jez).
export const DEMO_SPEED_RATES = Object.freeze([1, 0.75, 0.5, 0.25, 0.1]);
export const DEFAULT_DEMO_SPEED = 0.75;

/**
 * How many queued frame-steps a single rendered frame may drain. A held `.`
 * key repeats at the OS rate, which can outrun the render loop; without a cap
 * a long hold would bank hundreds of ticks and dump them in one frame, which
 * is the exact opposite of what a frame-step control is for.
 */
export const MAX_FRAME_STEP_BURST = 4;

// The modes the transport is allowed to arm in. Online is deliberately absent
// and separately hard-refused below: a client that advances the sim on its own
// cadence stops delivering inputs on the frames the remote peer is waiting for.
// Ranked/versus/arcade/tournament are absent because slow motion is not a
// feature of a real match — this is an inspection tool.
const SPEED_SCOPED_MODES = Object.freeze(["demo", "training"]);

/**
 * Is the cadence scaler allowed to run in this context at all? The single
 * scoping gate — game.js calls exactly this, and so do the tests.
 */
export function demoSpeedAllowed(mode, { online = false, replay = false } = {}) {
  if (online) return false;
  if (replay) return false;
  return SPEED_SCOPED_MODES.includes(mode);
}

export function clampDemoSpeed(rate) {
  const value = Number(rate);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_DEMO_SPEED;
  // Snap to the authored ladder in LOG space, so 0.3 lands on 0.25 rather
  // than on 0.5 the way a linear nearest would.
  let best = DEMO_SPEED_RATES[0];
  let bestError = Infinity;
  for (const candidate of DEMO_SPEED_RATES) {
    const error = Math.abs(Math.log(candidate) - Math.log(value));
    if (error < bestError - 1e-12) {
      bestError = error;
      best = candidate;
    }
  }
  return best;
}

/** `?speed=` parser. Returns null for an absent or unusable value. */
export function parseDemoSpeed(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return clampDemoSpeed(value);
}

/** One notch along the ladder. -1 = slower, +1 = faster. Clamps at both ends. */
export function nextDemoSpeed(rate, direction) {
  const current = clampDemoSpeed(rate);
  const index = DEMO_SPEED_RATES.indexOf(current);
  const moved = index + (direction < 0 ? 1 : -1);
  return DEMO_SPEED_RATES[Math.max(0, Math.min(DEMO_SPEED_RATES.length - 1, moved))];
}

/**
 * The transport. Holds a rate, a pause latch and a queue of single-frame
 * steps; owns no clock and no timer, so it is a pure state machine the render
 * loop asks two questions per frame:
 *
 *   takeFrameSteps()  — how many EXPLICIT ticks to run right now (pause only)
 *   scale(elapsed)    — how many wall-clock seconds the fixed-step clock sees
 *
 * `scale` is the whole feature. It never returns a dt.
 */
export function createDemoSpeed({ rate = DEFAULT_DEMO_SPEED, paused = false } = {}) {
  return {
    rate: clampDemoSpeed(rate),
    paused: Boolean(paused),
    pendingSteps: 0,
    // Instrumentation: ticks this transport has explicitly frame-stepped, and
    // the wall-clock seconds it has withheld from the clock. Never read back.
    steppedTicks: 0,
    heldSeconds: 0,
    hintUntilMs: 0,

    setRate(next) {
      this.rate = clampDemoSpeed(next);
      return this.rate;
    },

    nudge(direction) {
      this.rate = nextDemoSpeed(this.rate, direction);
      return this.rate;
    },

    setPaused(next) {
      this.paused = Boolean(next);
      if (!this.paused) this.pendingSteps = 0;
      return this.paused;
    },

    togglePause() {
      return this.setPaused(!this.paused);
    },

    /**
     * Queue single ticks. Frame-stepping only makes sense against a stopped
     * clock, so asking for one while the demo is running pauses it first —
     * exactly what a viewer means by "hold on, show me that frame".
     */
    frameStep(count = 1) {
      const wanted = Math.max(1, Math.floor(Number(count) || 1));
      this.paused = true;
      this.pendingSteps += wanted;
      return this.pendingSteps;
    },

    /**
     * Drain the frame-step queue for ONE rendered frame. Returns the number of
     * ticks the caller must run through the normal fixed-step path.
     */
    takeFrameSteps() {
      if (!this.paused || this.pendingSteps <= 0) return 0;
      const taken = Math.min(this.pendingSteps, MAX_FRAME_STEP_BURST);
      this.pendingSteps -= taken;
      this.steppedTicks += taken;
      return taken;
    },

    /**
     * THE SCALER. Wall-clock seconds in, wall-clock seconds out — the fixed
     * step the clock then takes is untouched, so this changes the tick
     * CADENCE and nothing else.
     */
    scale(elapsedSeconds) {
      const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
      if (this.paused) {
        this.heldSeconds += elapsed;
        return 0;
      }
      const scaled = elapsed * this.rate;
      this.heldSeconds += elapsed - scaled;
      return scaled;
    },

    snapshot() {
      return {
        rate: this.rate,
        paused: this.paused,
        pendingSteps: this.pendingSteps,
        steppedTicks: this.steppedTicks,
        heldSeconds: Number(this.heldSeconds.toFixed(3)),
        rates: [...DEMO_SPEED_RATES],
      };
    },
  };
}
