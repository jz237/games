// 5.4.1 "Ringside" — the attract show's VOICE PACK: the lower-third
// commentary, the result-screen sign-offs, the venue call on the versus card
// and the ten-second clock call, all in the announcer's own voice.
//
// The text banks (engine/demo-commentary.mjs, engine/demo-session.mjs) carry
// tokens no take can speak — a fighter's name, a special's name, a health
// percentage, a round score. A spoken line is therefore a SEQUENCE of parts
// the announcer queue (game.js announcerSay, one call after another on the
// busy window) plays back to back, the way "K.O.! … POST … WINS!" already
// does:
//   { cue, text }   a generated announcer fragment — file
//                   assets/audio/announcer/<cue>-1.mp3, caption `text`
//   { name }        the reviewed `<id>-name` bank of a seat: NAME / OTHER /
//                   FAV for a commentary event, W / L for a sign-off
//   { weapon }      the stage weapon's own take (`weapon-<id>`)
//   { streak }      the streak count's own lead-in (`so-streak-k<n>`)
// Percentages and scores stay on screen only. Every fragment below is a line
// the owner approved on 2026-09-06; none of the 45 reviewed takes or the four
// music tracks is touched — these are NEW files under new cue names.

const f = (cue, text) => Object.freeze({ cue, text });
const n = (name) => Object.freeze({ name });
const WEAPON = Object.freeze({ weapon: true });
const STREAK = Object.freeze({ streak: true });
const seq = (...parts) => Object.freeze(parts);
const freezeAll = (table) => Object.freeze(Object.fromEntries(Object.entries(table).map(([key, plans]) => [key, Object.freeze(plans)])));

/** The lower third, one spoken plan per text variant (same index as DEMO_COMMENTARY_LINES). */
export const DEMO_COMMENTARY_VOICE = freezeAll({
  "first-hit": [
    seq(f("dc-first-hit-1", "FIRST BLOOD!"), n("NAME")),
    seq(n("NAME"), f("dc-first-hit-2", "DRAWS FIRST!")),
    seq(f("dc-first-hit-3", "FIRST TOUCH TO..."), n("NAME")),
    seq(n("NAME"), f("dc-first-hit-4", "LANDS THE OPENER!")),
  ],
  super: [
    seq(f("dc-super-1", "FULL GRIT SUPER!"), n("NAME")),
    seq(n("NAME"), f("dc-super-2", "CASHES THE WHOLE BAR!")),
    seq(n("NAME"), f("dc-super-3", "EMPTIES THE TANK!")),
    seq(n("NAME"), f("dc-super-4", "GOES ALL IN!")),
    seq(f("dc-super-5", "EVERY DROP OF GRIT!"), n("NAME")),
  ],
  ex: [
    seq(f("dc-ex-1", "E-X!"), n("NAME")),
    seq(n("NAME"), f("dc-ex-2", "PAYS FOR THAT ONE!")),
    seq(f("dc-ex-3", "GRIT ON THE MOVE!"), n("NAME")),
    seq(n("NAME"), f("dc-ex-4", "SPENDS HALF A BAR!")),
  ],
  counter: [
    seq(f("dc-counter-1", "COUNTER HIT!"), n("NAME")),
    seq(n("NAME"), f("dc-counter-2", "READ THAT ONE!")),
    seq(n("OTHER"), f("dc-counter-3", "SWUNG INTO IT!")),
    seq(n("NAME"), f("dc-counter-4", "STUFFS THE SWING!")),
    seq(f("dc-counter-5", "CAUGHT ON THE STARTUP!"), n("NAME")),
  ],
  throw: [
    seq(f("dc-throw-1", "THROW!"), n("NAME")),
    seq(n("NAME"), f("dc-throw-2", "GETS THE GRAB!")),
    seq(n("NAME"), f("dc-throw-3", "TOSSES..."), n("OTHER")),
    seq(n("OTHER"), f("dc-throw-4", "HELD ON TOO LONG!")),
  ],
  tech: [
    seq(f("dc-tech-1", "TECHED!"), n("NAME")),
    seq(n("NAME"), f("dc-tech-2", "BREAKS THE THROW!")),
    seq(n("NAME"), f("dc-tech-3", "SAW THE GRAB COMING!")),
    seq(f("dc-tech-4", "NO THROW FOR..."), n("OTHER")),
  ],
  "weapon-pickup": [
    seq(n("NAME"), f("dc-weapon-pickup-1", "PICKS UP..."), WEAPON),
    seq(f("dc-weapon-pickup-2", "STREET FURNITURE!"), n("NAME")),
    seq(n("NAME"), f("dc-weapon-pickup-3", "ARMS UP!")),
    seq(n("NAME"), f("dc-weapon-pickup-4", "HAS..."), WEAPON),
  ],
  "weapon-throw": [
    seq(n("NAME"), f("dc-weapon-throw-1", "THROWS..."), WEAPON),
    seq(f("dc-weapon-throw-2", "INCOMING!"), n("NAME")),
    seq(n("NAME"), WEAPON, f("dc-weapon-throw-3", "AWAY!")),
    seq(n("NAME"), f("dc-weapon-throw-4", "LETS IT FLY!")),
  ],
  "wall-bounce": [
    seq(f("dc-wall-bounce-1", "OFF THE WALL!"), n("NAME")),
    seq(n("OTHER"), f("dc-wall-bounce-2", "INTO THE WALL!")),
    seq(f("dc-wall-bounce-3", "THE CORNER PAYS OFF!"), n("NAME")),
    seq(n("OTHER"), f("dc-wall-bounce-4", "EATS THE CORNER!")),
  ],
  "perfect-guard": [
    seq(f("dc-perfect-guard-1", "PERFECT GUARD!"), n("NAME")),
    seq(n("NAME"), f("dc-perfect-guard-2", "BLOCKS ON THE FRAME!")),
    seq(f("dc-perfect-guard-3", "SPLIT-SECOND GUARD!"), n("NAME")),
    seq(n("NAME"), f("dc-perfect-guard-4", "SHUTS THE DOOR!")),
  ],
  "guard-crush": [
    seq(f("dc-guard-crush-1", "GUARD CRUSH!"), n("OTHER")),
    seq(n("OTHER"), f("dc-guard-crush-2", "IS WIDE OPEN!")),
    seq(n("NAME"), f("dc-guard-crush-3", "BREAKS THE GUARD!")),
    seq(n("OTHER"), f("dc-guard-crush-4", "BLOCKED ONE TOO MANY!")),
  ],
  clutch: [
    seq(f("dc-clutch-1", "CLUTCH!"), n("NAME"), f("dc-clutch-1-tail", "HOLDS ON!")),
    seq(n("NAME"), f("dc-clutch-2", "ON THE BRINK!")),
    seq(n("NAME"), f("dc-clutch-3", "SURVIVES!")),
    seq(n("NAME"), f("dc-clutch-4", "STILL STANDING!")),
  ],
  comeback: [
    seq(f("dc-comeback-1", "COMEBACK!"), n("NAME")),
    seq(n("NAME"), f("dc-comeback-2", "NOW LEADS!")),
    seq(n("NAME"), f("dc-comeback-3", "TURNS IT AROUND!")),
    seq(f("dc-comeback-4", "NEVER OUT!"), n("NAME")),
  ],
  // The round's own calls (K.O.! / the name / the wins bank) already own the
  // moment: the finisher and round-end lines add their fragment AFTER them
  // and never repeat the name.
  finisher: [
    seq(f("dc-finisher-1", "FINAL BLOW!")),
    seq(f("dc-finisher-2", "ENDS IT!")),
    seq(f("dc-finisher-3", "THAT IS THE FINAL BLOW!")),
    seq(f("dc-finisher-4", "CURTAIN!")),
  ],
  "round-start": [
    seq(f("dc-round-start-1", "THE ROOM IS BEHIND..."), n("FAV")),
    seq(f("dc-round-start-2", "THIS CROWD BELONGS TO..."), n("FAV")),
    seq(f("dc-round-start-3", "THIS ROOM WANTS..."), n("FAV")),
    seq(f("dc-round-start-4", "HOME LEAN..."), n("FAV")),
  ],
  "round-end": [
    seq(f("dc-round-end-1", "TAKES THE ROUND!")),
    seq(f("dc-round-end-2", "ROUND ON THE BOARD!")),
    seq(f("dc-round-end-3", "UP ON THE CARD!")),
    seq(f("dc-round-end-4", "ON THE BOARD!")),
  ],
});

/**
 * How each kind rides the announcer. Default: a line is spoken only when the
 * MC is free (nothing queued) and DEMO_VOICE_MIN_GAP_MS after the last one —
 * an exchange that throws five events a second is a ticker, not commentary.
 *   queue          — book behind whatever is playing (the bell's FIGHT!, the
 *                    K.O. call): these are the round's punctuation
 *   fragmentOnly   — drop the name parts (the round call just said it)
 *   skipWhenMatchWon — the "-wins" bank closed the match; no "takes the round"
 */
export const DEMO_VOICE_KIND_POLICY = Object.freeze({
  "round-start": Object.freeze({ queue: true, delayMs: 700 }),
  "round-end": Object.freeze({ queue: true, fragmentOnly: true, skipWhenMatchWon: true }),
  finisher: Object.freeze({ queue: true, fragmentOnly: true }),
});
export const DEMO_VOICE_MIN_GAP_MS = 3_000;
export const DEMO_VOICE_IDLE_SLACK_MS = 150;

/** The sign-offs (same family/index as DEMO_SIGN_OFF_LINES). N is the versus card's job. */
export const DEMO_SIGN_OFF_VOICE = freezeAll({
  card: [
    seq(f("so-card-1", "THAT'S THE CARD!"), n("W"), f("so-card-1-tail", "CLOSES THE NIGHT!")),
    seq(f("so-card-2", "MAIN EVENT TO..."), n("W"), f("so-card-2-tail", "THE BOARD STANDS!")),
    seq(n("W"), f("so-card-3", "TAKES THE HEADLINER! NEW CARD NEXT!")),
    seq(f("so-card-4", "FINAL BELL OF THE CARD!"), n("W"), f("so-card-4-tail", "OWNS IT!")),
  ],
  streak: [
    seq(STREAK, n("W"), f("so-streak-1-tail", "WHO STOPS THAT?")),
    seq(n("W"), f("so-streak-2", "IS ON A RUN! NEXT UP...")),
    seq(f("so-streak-3", "NOBODY HAS AN ANSWER FOR..."), n("W")),
    seq(n("W"), f("so-streak-4", "WINS TONIGHT, AND COUNTING!")),
  ],
  main: [
    seq(n("W"), f("so-main-1", "GETS IT DONE! THE MAIN EVENT IS NEXT!")),
    seq(f("so-main-2", "CO-MAIN TO..."), n("W"), f("so-main-2-tail", "NOW, THE HEADLINER!")),
    seq(n("W"), f("so-main-3", "STAY WITH US! MAIN EVENT COMING UP!")),
    seq(f("so-main-4", "THAT SETS THE TABLE! THE MAIN EVENT FOLLOWS!")),
  ],
  plain: [
    seq(n("W"), f("so-plain-1", "OVER..."), n("L")),
    seq(f("so-plain-2", "QUICK WORK FROM..."), n("W")),
    seq(n("W"), f("so-plain-3", "BANKS THE WIN!")),
    seq(n("L"), f("so-plain-4", "WILL WANT THAT BACK!")),
    seq(n("W"), f("so-plain-5", "MOVES UP THE BOARD!")),
  ],
});

/** The streak lead-in: exact for three to five, "ANOTHER STRAIGHT WIN" past that. */
export const DEMO_STREAK_VOICE = Object.freeze({
  3: f("so-streak-k3", "THREE STRAIGHT FOR..."),
  4: f("so-streak-k4", "FOUR STRAIGHT FOR..."),
  5: f("so-streak-k5", "FIVE STRAIGHT FOR..."),
  more: f("so-streak-kx", "ANOTHER STRAIGHT WIN FOR..."),
});
export function demoStreakVoice(streak = 0) {
  const count = Math.max(0, Math.floor(Number(streak) || 0));
  return DEMO_STREAK_VOICE[count] || DEMO_STREAK_VOICE.more;
}

/** The venue call on the versus card's stage beat, one take per stage. */
export const DEMO_STAGE_VOICE = Object.freeze({
  somerset: f("stage-somerset", "TONIGHT AT SOMERSET SEPTA STATION!"),
  vet: f("stage-vet", "TONIGHT AT THE VET PARKING LOT!"),
  wildwood: f("stage-wildwood", "TONIGHT AT WILDWOOD BOARDWALK!"),
  buffet: f("stage-buffet", "TONIGHT AT THE CHINESE BUFFET! CRAB LEGS!"),
  cruise: f("stage-cruise", "TONIGHT ON THE CRUISE-SHIP POOL DECK!"),
  janney: f("stage-janney", "TONIGHT AT THE JANNEY STREET VACANT LOT!"),
});
export function demoStageCue(stageId = "") {
  return DEMO_STAGE_VOICE[stageId]?.cue || "";
}

/** The stage weapons' own takes, so a pickup line can name what was picked up. */
export const DEMO_WEAPON_VOICE = Object.freeze({
  needle: f("weapon-needle", "THE DISCARDED NEEDLE!"),
  bottle: f("weapon-bottle", "THE BEER BOTTLE!"),
  pigeon: f("weapon-pigeon", "THE DEAD PIGEON!"),
  tongs: f("weapon-tongs", "THE SERVING TONGS!"),
  "souvenir-cup": f("weapon-souvenir-cup", "THE SOUVENIR CUP!"),
  brick: f("weapon-brick", "THE LOOSE BRICK!"),
});

/** The clock call (MISSING-AUDIO.md Priority 6): three takes of one cue. */
export const DEMO_CLOCK_VOICE = Object.freeze({
  cue: "tenseconds",
  texts: Object.freeze(["TEN SECONDS!", "CLOCK'S RUNNING!", "TIME'S ALMOST UP!"]),
});

function fragments() {
  const out = [];
  const walk = (plans) => { for (const parts of plans) for (const part of parts) if (part.cue) out.push(part); };
  for (const plans of Object.values(DEMO_COMMENTARY_VOICE)) walk(plans);
  for (const plans of Object.values(DEMO_SIGN_OFF_VOICE)) walk(plans);
  out.push(...Object.values(DEMO_STREAK_VOICE), ...Object.values(DEMO_STAGE_VOICE), ...Object.values(DEMO_WEAPON_VOICE));
  return out;
}

/** Every generated file: { cue, take, text, file }. Fragments are one take each; the clock call three. */
export function demoVoiceFiles() {
  const files = fragments().map((part) => ({ cue: part.cue, take: 1, text: part.text, file: `${part.cue}-1.mp3` }));
  DEMO_CLOCK_VOICE.texts.forEach((text, index) => files.push({ cue: DEMO_CLOCK_VOICE.cue, take: index + 1, text, file: `${DEMO_CLOCK_VOICE.cue}-${index + 1}.mp3` }));
  const seen = new Set();
  for (const entry of files) {
    if (seen.has(entry.file)) throw new Error(`duplicate voice file ${entry.file}`);
    seen.add(entry.file);
  }
  return files;
}

/** Caption lines per generated cue, for ANNOUNCER_LINES (the clock cue already has its own). */
export function demoVoiceCaptions() {
  return Object.freeze(Object.fromEntries(fragments().map((part) => [part.cue, Object.freeze([part.text])])));
}

/**
 * The cues a commentary event speaks, in order, or null for silence. `ids`
 * are the two seats' fighter ids, `weaponId` the stage weapon's id.
 */
export function demoCommentarySpeech(event, { ids = ["", ""], weaponId = "", matchWon = false } = {}) {
  const plans = DEMO_COMMENTARY_VOICE[event?.kind];
  if (!plans || !plans.length) return null;
  const policy = DEMO_VOICE_KIND_POLICY[event.kind] || {};
  if (policy.skipWhenMatchWon && matchWon) return null;
  const parts = plans[Math.max(0, Math.floor(Number(event.variant) || 0)) % plans.length];
  const side = event.side === 1 ? 1 : 0;
  const cues = [];
  for (const part of parts) {
    if (part.cue) cues.push(part.cue);
    else if (part.name) {
      if (policy.fragmentOnly) continue;
      const id = ids[part.name === "OTHER" ? 1 - side : side];
      if (!id) return null;
      cues.push(`${id}-name`);
    } else if (part.weapon) {
      const weapon = DEMO_WEAPON_VOICE[weaponId];
      if (!weapon) return null;
      cues.push(weapon.cue);
    }
  }
  return cues.length ? cues : null;
}

/** Whether a commentary line may be spoken now. `busyUntil` is the announcer's window. */
export function demoVoiceGate({
  kind = "", now = 0, busyUntil = 0, lastAt = -Infinity,
  minGapMs = DEMO_VOICE_MIN_GAP_MS, idleSlackMs = DEMO_VOICE_IDLE_SLACK_MS,
} = {}) {
  const policy = DEMO_VOICE_KIND_POLICY[kind] || {};
  if (policy.queue) return true;
  if (now - lastAt < minGapMs) return false;
  return busyUntil <= now + idleSlackMs;
}

/** The cues a sign-off speaks, in order (the next pair's names are the card's). */
export function demoSignOffSpeech({ family = "plain", variant = 0, winnerId = "", loserId = "", streak = 0 } = {}) {
  const plans = DEMO_SIGN_OFF_VOICE[family] || DEMO_SIGN_OFF_VOICE.plain;
  const parts = plans[Math.max(0, Math.floor(Number(variant) || 0)) % plans.length];
  const cues = [];
  for (const part of parts) {
    if (part.cue) cues.push(part.cue);
    else if (part.streak) cues.push(demoStreakVoice(streak).cue);
    else if (part.name) {
      const id = part.name === "L" ? loserId : winnerId;
      if (!id) return null;
      cues.push(`${id}-name`);
    }
  }
  return cues.length ? cues : null;
}
