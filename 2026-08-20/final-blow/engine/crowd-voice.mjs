// v5.1 KO MOMENT — the crowd's voice and its KO celebration, as pure tables.
//
// Two problems this closes. The crowd never SOUNDED like people: every crowd
// sound was the shared noise loop through a filter (playCrowdSwell), so the
// painted crowd cheered in silence. And it never CELEBRATED a KO: a plain
// knockout put 6-10% of the painted people on the cheer cell for 2.5 ticks
// (reaction 0.34 against thresholds of 0.3-0.8, decaying 0.016/tick), then
// the 4.9 s roundover hold played to a crowd already back on its routes.
//
// The voice bank is twelve generated takes (ElevenLabs sound-effects, mono,
// 44.1 kHz, 96 kbps, normalised to -14 LUFS / -1 dBTP so they sit under the
// -11 LUFS hits, trimmed to <= 4.05 s) in assets/audio/crowd/. They are new
// generated media on the elementAudioAssets pattern — never part of the 45
// reviewed takes, never routed through audioAssets. Everything in here is
// deterministic and DOM-free so tests can pin the tiers, the level curve, the
// never-repeat draw and the hold curve without a browser.

export const CROWD_VOICE_DIR = "assets/audio/crowd";

// Per cue: how many takes ship, the base HTMLAudio volume before the amount
// level and the SFX slider, the shortest gap between two plays of the same
// cue, whether it may ride over a reaction that is still sounding (a roar over
// a gasp is right; a gasp on top of a roar is mud), and how long it keeps the
// crowd "busy" so the short reactions stay out of its way. Seconds are the
// measured lengths of the longest take (ffprobe), kept for the manifest test.
export const CROWD_VOICE_CUES = Object.freeze({
  gasp: Object.freeze({ takes: 3, volume: 0.5, minGapMs: 900, busyMs: 700, layers: false, seconds: 1.802, caption: "CROWD GASPS" }),
  ooh: Object.freeze({ takes: 3, volume: 0.58, minGapMs: 1300, busyMs: 1200, layers: false, seconds: 2.247, caption: "CROWD: OOOH" }),
  roar: Object.freeze({ takes: 3, volume: 0.7, minGapMs: 2000, busyMs: 1800, layers: true, seconds: 3.527, caption: "CROWD ROARS" }),
  cheer: Object.freeze({ takes: 3, volume: 0.6, minGapMs: 3600, busyMs: 2400, layers: true, seconds: 4.049, caption: "CROWD CHEERS" }),
});

export const CROWD_VOICE_CUE_IDS = Object.freeze(Object.keys(CROWD_VOICE_CUES));

/** Canonical path of one take (1-based, the announcer convention). */
export function crowdVoicePath(cue, take) {
  return `${CROWD_VOICE_DIR}/${cue}-${take}.mp3`;
}

/** Every shipped take path, in cue order — the registration list. */
export function crowdVoiceFiles() {
  const files = [];
  for (const [cue, spec] of Object.entries(CROWD_VOICE_CUES)) {
    for (let take = 1; take <= spec.takes; take += 1) files.push(crowdVoicePath(cue, take));
  }
  return files;
}

// Which reaction a stir amount earns. The stir scale is the sim's: light hit
// .12, heavy .34, special .56, throw .62, weapon .68, wall bounce .75, super
// 1.05, FINISH prompt / KO 1.4, fatal blow 1.5. The swell latch already
// ignores anything under 0.5, so a gasp is the floor of the voiced range.
export const CROWD_VOICE_TIERS = Object.freeze({ roar: 1.2, ooh: 0.7, gasp: 0.5 });

export function crowdVoiceCueFor(amount) {
  if (!(amount >= CROWD_VOICE_TIERS.gasp)) return null;
  if (amount >= CROWD_VOICE_TIERS.roar) return "roar";
  if (amount >= CROWD_VOICE_TIERS.ooh) return "ooh";
  return "gasp";
}

// Level tied to the reaction amount: a special's gasp at 0.61 of the cue
// volume, a super's ooh at 0.79, the KO roar at 0.93, the fatal blow at 0.96.
export function crowdVoiceLevel(amount) {
  const t = Math.min(1.6, Math.max(0, Number(amount) || 0)) / 1.6;
  return Math.min(1, Math.max(0.4, 0.4 + 0.6 * t));
}

// Shuffle bag with a no-repeat border: every take plays once per bag and the
// reshuffle never lets the last take of one bag open the next. Same contract
// as announcerBagDraw, but rng-injected so the guarantee is provable in node.
export function createCrowdVoiceBag(size) {
  return { size: Math.max(1, Math.floor(size) || 1), order: [], position: 0, last: -1 };
}

export function crowdVoiceBagDraw(bag, rng = Math.random) {
  if (bag.size <= 1) return 0;
  if (bag.position >= bag.order.length) {
    const order = Array.from({ length: bag.size }, (_, index) => index);
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(rng() * (index + 1));
      [order[index], order[swap]] = [order[swap], order[index]];
    }
    if (order[0] === bag.last) [order[0], order[order.length - 1]] = [order[order.length - 1], order[0]];
    bag.order = order;
    bag.position = 0;
  }
  const pick = bag.order[bag.position];
  bag.position += 1;
  bag.last = pick;
  return pick;
}

// The KO hold. Latched render-side on the roundover phase edge (the way
// roundWinBeatStartTick is) and read as an EFFECTIVE reaction that the crowd
// draw, the 3D billboards and the crowd bed take instead of the decaying sim
// value. It opens at the lowest painted threshold (0.3) and climbs to 0.95 —
// past the highest (0.8) — over rampTicks, so a person with threshold t
// throws their arms up at tick (t - 0.3) / 0.5 * rampTicks: the crowd goes up
// person by person over a third of a second instead of all at once, and stays
// up for the whole hold (294 ticks at 4.9 s, 60 Hz). The pump gives the held
// cheer its life: past their threshold each person drops to the weight-shift
// cell for half their own shift window, so ~85% of the crowd is arms-up at
// any tick and the arms are never frozen.
export const CROWD_KO_HOLD = Object.freeze({
  floor: 0.3,
  peak: 0.95,
  rampTicks: 20,
  holdTicks: 294,
  // The sustained cheer take follows the KO roar by this much (0.6 s) so the
  // roar's front edge is the hit and the cheer is the crowd staying up.
  cheerDelayTicks: 36,
  // Flashbulbs during the hold: an 8-tick window (7.5/s against the fight's
  // 3/s cap) lit for 5 of its 8 ticks, three phones per window.
  flashWindowTicks: 8,
  flashLitTicks: 5,
  flashPicks: 3,
  // Jump bob of an arms-up person during the hold, sim px at scale 1.
  bobPx: 3,
});

/** Effective crowd reaction `age` ticks into the hold; 0 when not latched. */
export function crowdKoHoldReaction(age) {
  if (!(age >= 0)) return 0;
  const { floor, peak, rampTicks } = CROWD_KO_HOLD;
  if (age >= rampTicks) return peak;
  return floor + (peak - floor) * (age / rampTicks);
}

/**
 * Whether a person past their threshold is pumping (weight-shift cell) rather
 * than arms-up on this tick of the hold. Uses the person's own shift timer so
 * the pumps are scattered the way the idle weight shifts are.
 */
export function crowdKoHoldPumping(sprite, frame) {
  if (!sprite) return false;
  const window = Math.max(1, Math.floor(sprite.shiftLength * 0.5));
  return ((frame + sprite.shiftOffset) % sprite.shiftPeriod) < window;
}

/**
 * Painted-cell column for a person during the hold, given the effective
 * reaction: cheer (2) past threshold unless pumping (1); below threshold the
 * caller keeps its ordinary stand/shift/stride logic (returns -1).
 */
export function crowdKoHoldColumn(sprite, frame, reaction) {
  if (!sprite || !(reaction > sprite.reactThreshold)) return -1;
  return crowdKoHoldPumping(sprite, frame) ? 1 : 2;
}
