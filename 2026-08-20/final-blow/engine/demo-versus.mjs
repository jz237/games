// ===========================================================================
// 5.4 FIGHT NIGHT — THE VERSUS CARD AND THE RING INTRODUCTION (demo sweep
// #8 / #20, with #16's time budget).
//
// What was wrong. Between two exhibitions the attract show spent 8.0 s of wall
// clock (a 5 s result hold, then the 2.25 s round-1 intro at the 0.75x demo
// rate) and told the viewer almost nothing in it: the result screen held a
// static "NEXT RANDOM FIGHT IN 5 SECONDS", and the next pair was introduced by
// a 1.2 s letter-slam that spent the big type on the words WATCH DEMO with the
// names on the small amber line — which also CLOBBERED the ROUND 1 / stage
// card startMatch had put up a moment earlier (measured: ROUND 1 never survived
// a frame while round1-1.mp3 played). The announcer never said either name or
// the stage, although every fighter has three recorded "<id>-name" takes and
// the roster carries a title, the kit an archetype, the stage a name.
//
// What ships. The 8.0 s is REPARTITIONED, not lengthened: the result hold
// drops to DEMO_RESULT_HOLD_MS (2.4 s, engine/demo.mjs) and the difference is
// spent on the fight screen as a VERSUS hold of DEMO_VERSUS_HOLD_MS (2.6 s) —
// a demo-only floor under the intro art hold (engine/art-readiness holdDecision
// `floorMs`), so the sim clock stands still exactly the way it does for a
// cold sheet, the FIGHT! call is shifted by the same release, and the tick
// stream is untouched (a link and qa.demo(seed) still match tick for tick).
// Over that hold the arcade dialogue-card DOM (#introDialogue / .speech-card)
// carries the two corner cards — portrait, IN THE LEFT/RIGHT CORNER, name,
// roster title, kit archetype, the night's record — and the ring
// introduction runs in broadcast order: left corner (the "<left>-name" take),
// right corner ("<right>-name"), the stage banner (text only — no stage cue
// is recorded, and no voice is generated here), then ROUND 1 at the release
// and FIGHT! 1150 ms after it, as in every played match. This module is the
// pure part: the card copy, the beat plan and its order, the record line and
// the standings fold. game.js keeps the DOM, the timers and the speech.
// ===========================================================================

/** Wall-clock length of the VERSUS hold under the round-1 intro (demo only). */
export const DEMO_VERSUS_HOLD_MS = 2_600;
/** ROUND 1 -> FIGHT! spacing, the value startMatch has always used. */
export const DEMO_VERSUS_FIGHT_DELAY_MS = 1_150;
/** When the corner cards and the stage row reveal, from the hold's start. */
export const DEMO_VERSUS_BEAT_MS = Object.freeze({ left: 0, right: 1_000, stage: 1_900 });

const CORNER_EYEBROWS = Object.freeze(["IN THE LEFT CORNER", "IN THE RIGHT CORNER"]);

function upper(text) {
  return String(text || "").trim().toUpperCase();
}

/**
 * The night's record line for one corner. No record yet (a fighter's first
 * exhibition of the session) reads FIRST BOUT TONIGHT; otherwise W-L TONIGHT.
 */
export function demoRecordLine(record = null) {
  const wins = Math.max(0, Math.floor(Number(record?.wins) || 0));
  const losses = Math.max(0, Math.floor(Number(record?.losses) || 0));
  if (wins + losses === 0) return "FIRST BOUT TONIGHT";
  return `${wins}-${losses} TONIGHT`;
}

/**
 * Fold one settled exhibition into the standings (fighterId -> { wins,
 * losses }). Returns a new object; the input is never mutated. A mirror
 * match (same id both sides) counts one win and one loss for that id.
 */
export function demoStandingsAfterMatch(standings = {}, winnerId = "", loserId = "") {
  const next = {};
  for (const [id, record] of Object.entries(standings || {})) {
    next[id] = { wins: Math.max(0, Number(record?.wins) || 0), losses: Math.max(0, Number(record?.losses) || 0) };
  }
  if (winnerId) {
    next[winnerId] = next[winnerId] || { wins: 0, losses: 0 };
    next[winnerId].wins += 1;
  }
  if (loserId) {
    next[loserId] = next[loserId] || { wins: 0, losses: 0 };
    next[loserId].losses += 1;
  }
  return next;
}

/**
 * The card copy for a matchup. `corners` is [left, right], each { id, name,
 * title, archetype, color, portrait }; `standings` is the session's fold
 * (demoStandingsAfterMatch). Everything is upper-cased the way the announcer
 * banners are, so the card and the bug agree letter for letter.
 */
export function demoVersusCard({
  corners = [],
  stageName = "",
  cycle = 1,
  format = "standard",
  standings = {},
  // 5.4 integration (session layer): the bout's place on tonight's card and
  // its story ride the VS row when the session names them; empty keeps the
  // WATCH DEMO · CYCLE n line.
  boutLabel = "",
  storyLabel = "",
} = {}) {
  const cycleNumber = Math.max(1, Math.floor(Number(cycle) || 1));
  const cards = corners.slice(0, 2).map((corner, side) => ({
    side,
    id: String(corner?.id || ""),
    eyebrow: CORNER_EYEBROWS[side],
    name: upper(corner?.name || corner?.id),
    title: upper(corner?.title),
    archetype: upper(corner?.archetype),
    record: demoRecordLine(standings?.[corner?.id]),
    color: corner?.color || "#d8d8d8",
    portrait: corner?.portrait || (corner?.id ? `assets/fighters/${corner.id}.webp` : ""),
    cue: corner?.id ? `${corner.id}-name` : "",
  }));
  const clock = format === "clock" ? " · ON THE CLOCK" : "";
  const show = boutLabel
    ? `${upper(boutLabel)}${storyLabel ? ` · ${upper(storyLabel)}` : ""}${clock}`
    : `WATCH DEMO · CYCLE ${cycleNumber}${clock}`;
  return {
    cards,
    stage: { name: upper(stageName), line: stageName ? `TONIGHT · ${upper(stageName)}` : "TONIGHT", show },
  };
}

/**
 * The ring introduction, in order. Each beat says when it fires from the top
 * of the hold (wall ms), what it shows and what it books. The corner beats
 * speak the fighter's recorded name take (through announce()'s `speak`
 * plan); the stage beat is a banner only; the ROUND beat fires at the hold's
 * release (never earlier than `holdMs`, later only if a sheet is still
 * decoding) and FIGHT! rides the timer startMatch armed, shifted by the
 * release. `at` is therefore exact for the first three and the planned
 * minimum for the last two.
 */
export function demoRingIntroPlan({
  card = null,
  stageName = "",
  stageCue = "",
  round = 1,
  holdMs = DEMO_VERSUS_HOLD_MS,
  fightDelayMs = DEMO_VERSUS_FIGHT_DELAY_MS,
  beats = DEMO_VERSUS_BEAT_MS,
} = {}) {
  const cards = card?.cards || [];
  const plan = [];
  const corner = (side, at) => {
    const entry = cards[side];
    if (!entry) return;
    plan.push({
      at,
      kind: "corner",
      side,
      card: side,
      cue: entry.cue || "",
      text: `${entry.eyebrow} · ${entry.name}`,
    });
  };
  corner(0, beats.left);
  corner(1, beats.right);
  plan.push({
    at: beats.stage,
    kind: "stage",
    card: 2,
    // 5.4.1 RINGSIDE: the venue call (engine/demo-voice.mjs DEMO_STAGE_VOICE)
    // once its take exists; "" keeps the beat a banner only.
    cue: stageCue || "",
    text: upper(stageName),
    banner: { main: upper(stageName), sub: card?.stage?.show || "" },
  });
  plan.push({
    at: holdMs,
    kind: "round",
    cue: `round${Math.max(1, Math.floor(Number(round) || 1)) === 1 ? "1" : ""}`,
    text: `ROUND ${Math.max(1, Math.floor(Number(round) || 1))}`,
    banner: { main: `ROUND ${Math.max(1, Math.floor(Number(round) || 1))}`, sub: upper(stageName) },
    release: true,
  });
  plan.push({ at: holdMs + fightDelayMs, kind: "fight", cue: "fight", text: "FIGHT!" });
  return plan.sort((a, b) => a.at - b.at);
}

/** The beats that are due at `elapsedMs` and have not fired (`fired` = count so far), in order. */
/**
 * 5.4.1 RINGSIDE — the card holds while the MC is still talking. The corner
 * calls, the venue call and any sign-off that spilled over from the result
 * hold play back to back on the announcer's busy window, and ROUND 1 must
 * follow the last of them rather than land under it: the floor becomes the
 * moment the window clears (plus a settle), never less than the card's own
 * floor and never past the cap, so a stuck window cannot hold the card.
 */
export const DEMO_VERSUS_SPEECH_CAP_MS = 6_000;
export const DEMO_VERSUS_SPEECH_SETTLE_MS = 250;
export function demoVersusSpeechFloor({
  floorMs = DEMO_VERSUS_HOLD_MS, startedAt = 0, busyUntil = 0,
  settleMs = DEMO_VERSUS_SPEECH_SETTLE_MS, capMs = DEMO_VERSUS_SPEECH_CAP_MS,
} = {}) {
  const speechMs = Math.max(0, busyUntil - startedAt) + settleMs;
  return Math.max(Math.max(0, floorMs), Math.min(capMs, speechMs));
}

export function demoRingIntroDue(plan = [], elapsedMs = 0, fired = 0) {
  const due = [];
  for (let index = Math.max(0, fired); index < plan.length; index += 1) {
    const beat = plan[index];
    if (beat.release || beat.kind === "fight") break;
    if (elapsedMs < beat.at) break;
    due.push(beat);
  }
  return due;
}

/**
 * The card times the dialogue reveal loop reads for the versus kind, in
 * seconds, indexed by data-card: [left, right, stage].
 */
export function demoVersusCardTimes(beats = DEMO_VERSUS_BEAT_MS) {
  return [beats.left / 1000, beats.right / 1000, beats.stage / 1000];
}

/**
 * Is the ROUND card owed at a hold release? Only when the sim is still in
 * the intro: a release because the sim LEFT the intro (the QA manual clock
 * stepped through it) or because a new match re-armed the hold has no round
 * to announce.
 */
export function demoVersusAnnouncesRound({ reason = "", phase = "intro", screen = "fight" } = {}) {
  if (reason === "left" || reason === "rearmed") return false;
  return phase === "intro" && screen === "fight";
}
