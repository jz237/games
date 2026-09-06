import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEMO_CLUTCH_HEALTH,
  DEMO_COMEBACK_DEFICIT,
  DEMO_COMMENTARY_KINDS,
  DEMO_COMMENTARY_LINES,
  DEMO_COMMENTARY_POLICY,
  DEMO_COMMENTARY_PROTECT_TICKS,
  DEMO_COMMENTARY_RECENT_MAX,
  createDemoCommentaryBus,
  demoAllegiance,
  formatCommentaryLine,
} from "../engine/demo-commentary.mjs";
import { DeterministicRng } from "../engine/foundation.mjs";

// ===========================================================================
// 5.4 FIGHT NIGHT — the demo's LOWER THIRD (sweep #12, the text half of
// #21). The sweep counted 22 announcer calls and 53 crowd swells in a 175 s
// attract run with nothing readable on screen and no sign of whom the room
// was backing. This file pins the pure half: the event bus, the per-kind
// seeded bags (every variant before a repeat, never the same line back to
// back), the hold/priority policy, the clutch/comeback observer, the
// allegiance read — and, from source, that every game.js call site reaches
// the bus through the one demo gate so a played match is byte-identical.
// ===========================================================================

const gameRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const names = ["Deathblow", "Jez"];
const bus = (seed = 7) => createDemoCommentaryBus({ seed });

// ---------------------------------------------------------------------------
// The banks
// ---------------------------------------------------------------------------

test("the brief's thirteen events are all kinds, plus the two round bookends", () => {
  const brief = ["super", "ex", "counter", "throw", "tech", "weapon-pickup", "weapon-throw", "wall-bounce",
    "perfect-guard", "comeback", "first-hit", "clutch", "guard-crush", "finisher"];
  for (const kind of brief) assert.ok(DEMO_COMMENTARY_KINDS.includes(kind), kind);
  assert.ok(DEMO_COMMENTARY_KINDS.includes("round-start"), "the allegiance read rides the bell");
  assert.ok(DEMO_COMMENTARY_KINDS.includes("round-end"), "the score rides the round line");
  assert.equal(DEMO_COMMENTARY_KINDS.length, 16);
});

test("every kind has four or more distinct all-caps variants and a policy", () => {
  for (const kind of DEMO_COMMENTARY_KINDS) {
    const lines = DEMO_COMMENTARY_LINES[kind];
    assert.ok(Array.isArray(lines) && lines.length >= 4, `${kind}: ${lines?.length} variants`);
    assert.equal(new Set(lines).size, lines.length, `${kind}: duplicate variant`);
    for (const line of lines) {
      const bare = line.replace(/\{[A-Z]+\}/g, "");
      assert.equal(bare, bare.toUpperCase(), `${kind}: "${line}" is not all caps`);
      assert.doesNotMatch(line, /\{[a-z]/, `${kind}: lowercase token in "${line}"`);
    }
    const policy = DEMO_COMMENTARY_POLICY[kind];
    assert.ok(policy && policy.priority >= 1 && policy.priority <= 3, `${kind} priority`);
    assert.ok(policy.holdTicks >= 120 && policy.holdTicks <= 300, `${kind} hold ${policy.holdTicks}`);
  }
  // The big three read in amber and hold the screen; a per-frame nicety is
  // the quietest kind.
  assert.equal(DEMO_COMMENTARY_POLICY.super.priority, 3);
  assert.equal(DEMO_COMMENTARY_POLICY.comeback.priority, 3);
  assert.equal(DEMO_COMMENTARY_POLICY.finisher.priority, 3);
  assert.equal(DEMO_COMMENTARY_POLICY["perfect-guard"].priority, 1);
  assert.equal(DEMO_COMMENTARY_POLICY.ex.priority, 1);
  // The bell's room read yields to anything: first contact lands 0.3-1.5 s
  // after the bell and FIRST BLOOD must not be swallowed by it.
  assert.equal(DEMO_COMMENTARY_POLICY["round-start"].priority, 1);
  assert.equal(DEMO_COMMENTARY_POLICY["round-start"].holdTicks, 240);
});

test("formatting fills tokens in caps and collapses a separator left dangling by an empty token", () => {
  assert.equal(formatCommentaryLine("COUNTER HIT · {NAME}", { NAME: "Ali G" }), "COUNTER HIT · ALI G");
  assert.equal(formatCommentaryLine("{NAME} ENDS IT · {SCORE}", { NAME: "Post" }), "POST ENDS IT");
  assert.equal(formatCommentaryLine("{SCORE} · {NAME} ON THE BOARD", { NAME: "Post" }), "POST ON THE BOARD");
  assert.equal(formatCommentaryLine("EX {MOVE} · {NAME}", { MOVE: "Golf Ball", NAME: "Jez" }), "EX GOLF BALL · JEZ");
  assert.equal(formatCommentaryLine("{UNKNOWN} X", {}), "X");
});

// ---------------------------------------------------------------------------
// The bus: bags, determinism, policy
// ---------------------------------------------------------------------------

test("a kind's bag plays every variant before any repeats and never the same line back to back", () => {
  for (const kind of DEMO_COMMENTARY_KINDS) {
    const b = bus(3);
    const size = DEMO_COMMENTARY_LINES[kind].length;
    const draws = [];
    for (let index = 0; index < size * 25; index += 1) {
      // Spaced past every hold so the policy never drops a draw.
      draws.push(b.emit(kind, { side: 0, tick: index * 400, tokens: { NAME: "A", OTHER: "B" } }).variant);
    }
    for (let start = 0; start < draws.length; start += size) {
      assert.deepEqual([...new Set(draws.slice(start, start + size))].length, size, `${kind}: bag ${start / size} repeats a variant`);
    }
    for (let index = 1; index < draws.length; index += 1) {
      assert.notEqual(draws[index], draws[index - 1], `${kind}: variant ${draws[index]} twice running at ${index}`);
    }
  }
});

test("the same seed replays the same lines; a different seed does not", () => {
  const run = (seed) => {
    const b = bus(seed);
    const out = [];
    for (let index = 0; index < 40; index += 1) {
      const kind = DEMO_COMMENTARY_KINDS[index % DEMO_COMMENTARY_KINDS.length];
      out.push(b.emit(kind, { side: index % 2, tick: index * 400, tokens: { NAME: "A", OTHER: "B", HEALTH: 9, ROUND: 1, SCORE: "1-0", FAV: "A", A: 9, B: 7, MOVE: "M", WEAPON: "W" } }).line);
    }
    return out;
  };
  assert.deepEqual(run(237), run(237));
  assert.deepEqual(run("fight-night"), run("fight-night"));
  assert.notDeepEqual(run(237), run(238));
  // A caller's own stream is honoured (the announcer-bag contract).
  const rng = new DeterministicRng(99);
  const mine = createDemoCommentaryBus({ random: () => rng.nextFloat() });
  assert.ok(mine.emit("super", { side: 0, tick: 0, tokens: { NAME: "A" } }));
});

test("hold and priority: a lesser event cannot bump a fresh bigger line, an equal or greater one can, and the line expires", () => {
  const b = bus(1);
  const superLine = b.emit("super", { side: 0, tick: 100, tokens: { NAME: "A" } });
  assert.ok(superLine);
  assert.equal(b.emit("ex", { side: 1, tick: 110, tokens: { NAME: "B", MOVE: "X" } }), null, "an EX cannot replace a fresh super");
  assert.equal(b.emit("counter", { side: 1, tick: 120, tokens: { NAME: "B" } }), null, "a counter cannot either");
  assert.equal(b.current(120).id, superLine.id);
  assert.deepEqual(b.stats().dropped, 2);
  const finisher = b.emit("finisher", { side: 0, tick: 130, tokens: { NAME: "A", SCORE: "1-0" } });
  assert.ok(finisher, "an equal priority replaces");
  assert.equal(b.current(130).id, finisher.id);
  // Past the protect window a lesser line may take over.
  const counter = b.emit("counter", { side: 1, tick: 130 + DEMO_COMMENTARY_PROTECT_TICKS, tokens: { NAME: "B" } });
  assert.ok(counter);
  assert.equal(b.current(200).kind, "counter");
  assert.equal(b.current(130 + DEMO_COMMENTARY_PROTECT_TICKS + DEMO_COMMENTARY_POLICY.counter.holdTicks), null, "the line runs its hold and goes");
  assert.equal(b.emit("nonsense", { side: 0, tick: 999 }), null, "an unknown kind is refused");
  assert.equal(b.stats().emitted, 3);
});

test("accepted events are published to subscribers with a cue name — the seam a voice bank subscribes on", () => {
  const b = bus(5);
  const heard = [];
  const stop = b.subscribe((event) => heard.push(event));
  b.emit("throw", { side: 1, tick: 10, tokens: { NAME: "Jez", OTHER: "Post" } });
  b.emit("ex", { side: 0, tick: 12, tokens: { NAME: "Post", MOVE: "Sweep" } }); // dropped: fresh throw outranks it
  b.emit("super", { side: 0, tick: 400, tokens: { NAME: "Post" } });
  assert.deepEqual(heard.map((event) => event.cue), ["demo-throw", "demo-super"]);
  assert.equal(heard[0].side, 1);
  assert.ok(heard[0].line.includes("JEZ") || heard[0].line.includes("POST"));
  assert.ok(Object.isFrozen(heard[0]));
  stop();
  b.emit("counter", { side: 0, tick: 800, tokens: { NAME: "Post" } });
  assert.equal(heard.length, 2, "unsubscribed");
  assert.equal(b.stats().subscribers, 0);
  assert.ok(b.recent().length <= DEMO_COMMENTARY_RECENT_MAX);
});

// ---------------------------------------------------------------------------
// The round: first blood, clutch, comeback, the bookends
// ---------------------------------------------------------------------------

test("first blood is once per round and a counter on the first hit outranks it on the same tick", () => {
  const b = bus(2);
  b.roundStart({ tick: 0, names, favourites: [9, 7] });
  const first = b.noteHit({ side: 1, tick: 20, names });
  assert.equal(first.kind, "first-hit", "first contact 0.33 s after the bell is not swallowed by the room read");
  assert.ok(first.line.includes("JEZ"));
  assert.equal(b.noteHit({ side: 0, tick: 80, names }), null, "only the first");
  const counter = b.emit("counter", { side: 1, tick: 20, tokens: { NAME: "Jez", OTHER: "Deathblow" } });
  assert.equal(counter.kind, "counter", "equal priority on the same tick replaces");
  b.roundStart({ tick: 1000, names, favourites: [9, 7] });
  assert.ok(b.noteHit({ side: 0, tick: 1040, names }), "a new round has a new first blood");
});

test("the observer books CLUTCH at the threshold and COMEBACK on the lead flip, once per side per round", () => {
  const b = bus(4);
  b.roundStart({ tick: 0, names, favourites: [9, 7] });
  assert.equal(b.observe({ tick: 1, phase: "intro", health: [10, 50], names }), null, "not before the bell");
  assert.equal(b.observe({ tick: 2, phase: "fight", health: [DEMO_CLUTCH_HEALTH + 1, 50], names }), null);
  const clutch = b.observe({ tick: 3, phase: "fight", health: [DEMO_CLUTCH_HEALTH, 50], names });
  assert.equal(clutch.kind, "clutch");
  assert.equal(clutch.side, 0);
  assert.ok(clutch.line.includes("DEATHBLOW") && clutch.line.includes("20%"), clutch.line);
  assert.equal(b.observe({ tick: 4, phase: "fight", health: [12, 50], names }), null, "clutch once");
  assert.equal(b.observe({ tick: 5, phase: "fight", health: [12, 25], names }), null, "level-ish is not a lead");
  assert.equal(b.round().deficit[0], 38, "the deficit is the worst gap while in the clutch");
  const comeback = b.observe({ tick: 300, phase: "fight", health: [12, 11], names });
  assert.equal(comeback.kind, "comeback");
  assert.equal(comeback.side, 0);
  assert.ok(comeback.line.includes("12%"), `from the round's minimum: ${comeback.line}`);
  assert.equal(b.observe({ tick: 301, phase: "fight", health: [12, 5], names }), null, "comeback once");
  assert.equal(b.observe({ tick: 302, phase: "fight", health: [12, 0], names }), null, "a KO'd opponent is not a comeback");
  // Taking the lead from 12 put the other side under 20 on the same tick:
  // its CLUTCH was booked first and the COMEBACK (priority 3) took the line.
  assert.deepEqual(b.round().clutch, [true, true]);
  assert.deepEqual(b.round().comeback, [true, false]);
});

test("a lead traded between two fighters under 20 is not a comeback — the side must have been a real deficit down", () => {
  const b = bus(4);
  b.roundStart({ tick: 0, names, favourites: [9, 7] });
  assert.equal(b.observe({ tick: 1, phase: "fight", health: [18, 30], names }).kind, "clutch");
  assert.equal(b.observe({ tick: 400, phase: "fight", health: [18, 15], names }).kind, "clutch", "the other side's clutch, not a comeback");
  assert.equal(b.observe({ tick: 401, phase: "fight", health: [18, 15], names }), null, "a 12-point gap is a trade");
  assert.equal(b.observe({ tick: 800, phase: "fight", health: [14, 18], names }), null, "the trade back is not one either");
  assert.deepEqual(b.round().comeback, [false, false]);
  assert.ok(DEMO_COMEBACK_DEFICIT > DEMO_CLUTCH_HEALTH, "a full clutch bar behind is not enough on its own");
  // The round line follows the same rule: a winner who was only ever a
  // trade down gets the round line, not a comeback.
  const line = b.roundEnd({ winner: 0, tick: 900, names, roundNumber: 1, rounds: [1, 0] });
  assert.equal(line.kind, "round-end");
});

test("the round line: plain / Final Blow / the comeback that landed on the deciding hit — never stacked", () => {
  const plain = bus(6);
  plain.roundStart({ tick: 0, names, favourites: [9, 7] });
  const line = plain.roundEnd({ winner: 1, tick: 900, names, roundNumber: 1, rounds: [0, 1] });
  assert.equal(line.kind, "round-end");
  assert.ok(line.line.includes("JEZ") && line.line.includes("0-1"), line.line);

  const finisher = bus(6);
  finisher.roundStart({ tick: 0, names, favourites: [9, 7] });
  const final = finisher.roundEnd({ winner: 0, tick: 900, names, roundNumber: 2, rounds: [2, 0], finisher: true });
  assert.equal(final.kind, "finisher");
  assert.ok(final.line.includes("DEATHBLOW") && final.line.includes("2-0"), final.line);

  const brink = bus(6);
  brink.roundStart({ tick: 0, names, favourites: [9, 7] });
  brink.observe({ tick: 10, phase: "fight", health: [8, 60], names });
  assert.equal(brink.round().deficit[0], 52);
  const comeback = brink.roundEnd({ winner: 0, tick: 900, names, roundNumber: 1, rounds: [1, 0], finisher: true });
  assert.equal(comeback.kind, "comeback", "a winner who never led before the KO came back on the deciding hit");
  assert.ok(comeback.line.includes("8%"), comeback.line);
  assert.equal(brink.stats().counts["round-end"], 0);
  assert.equal(brink.stats().counts.finisher, 0);
});

// ---------------------------------------------------------------------------
// The allegiance read
// ---------------------------------------------------------------------------

test("the room read names the favoured side from the 5.3 head count, calls a split a split and an empty street empty", () => {
  const backs = demoAllegiance({ favourites: [9, 7], names });
  assert.deepEqual(backs, { kind: "backs", side: 0, counts: [9, 7], share: 9 / 16, text: "THE ROOM BACKS DEATHBLOW · 9-7" });
  const away = demoAllegiance({ favourites: [12, 20], names });
  assert.equal(away.side, 1);
  assert.equal(away.text, "THE ROOM BACKS JEZ · 20-12");
  assert.equal(demoAllegiance({ favourites: [16, 16], names }).text, "THE ROOM IS SPLIT · 16-16");
  assert.equal(demoAllegiance({ favourites: [0, 0], names }).text, "NO CROWD ON THIS STREET");
  assert.equal(demoAllegiance({ favourites: [0, 0], names }).kind, "empty");
  assert.equal(demoAllegiance().kind, "empty");
});

test("the bell sets the room read and only a room with a lean gets a round-start line", () => {
  const b = bus(8);
  const lean = b.roundStart({ tick: 5, names, favourites: [5, 11] });
  assert.equal(lean.kind, "round-start");
  assert.equal(lean.side, 1);
  assert.ok(lean.line.includes("JEZ") && lean.line.includes("11-5"), lean.line);
  assert.equal(b.allegiance().text, "THE ROOM BACKS JEZ · 11-5");
  assert.equal(b.roundStart({ tick: 900, names, favourites: [16, 16] }), null, "a split room has no favourite to name");
  assert.equal(b.allegiance().kind, "split");
  assert.equal(b.roundStart({ tick: 1800, names, favourites: [0, 0] }), null);
  assert.equal(b.allegiance().kind, "empty");
});

// ---------------------------------------------------------------------------
// The gates in game.js, from source — a played match is byte-identical
// ---------------------------------------------------------------------------

test("game.js reaches the bus only through the demo gate, and creates it only per demo card", async () => {
  const source = await readFile(join(gameRoot, "game.js"), "utf8");
  const gate = source.slice(source.indexOf("function demoCommentaryLive() {"));
  assert.match(gate, /^function demoCommentaryLive\(\) \{\n  return !rollbackResimulating && state\.mode === "demo" && demoSession\.active && Boolean\(demoSession\.commentary\);\n\}/);
  // Every helper that touches the bus asks the gate first.
  for (const name of ["demoCommentaryEmit", "demoCommentaryHit", "demoCommentaryRoundStart", "demoCommentaryRoundEnd", "demoCommentaryObserve"]) {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start > 0, name);
    const body = source.slice(start, source.indexOf("\n}\n", start));
    assert.match(body, /\n  if \(!demoCommentaryLive\(\)[^\n]*\) return/, `${name} must gate on the demo first`);
  }
  // The bus is created in startNextDemoMatch (a fresh one per card, seeded
  // from the director) and nowhere else; the render sync reads it only
  // behind the session.
  assert.equal(source.split("createDemoCommentaryBus({").length - 1, 1, "one creation site");
  const startNext = source.slice(source.indexOf("function startNextDemoMatch() {"), source.indexOf("function startDemo("));
  assert.ok(startNext.includes("demoSession.commentary = createDemoCommentaryBus({"));
  assert.ok(startNext.includes('seed: hashSeed(demoSession.director.snapshot().seed, "commentary", cycle.cycle)'));
  assert.ok(source.includes("if (demoSession.active) syncDemoLowerThird();"), "the render loop syncs only in a demo");
  // The call sites the brief names, each through a gated helper.
  const sites = [
    'demoCommentaryEmit("super", fighter.side)',
    'demoCommentaryEmit("ex", fighter.side, {',
    "demoCommentaryHit(attacker, { counter })",
    'demoCommentaryEmit("throw", attacker.side)',
    'demoCommentaryEmit("tech", victim.side)',
    'demoCommentaryEmit("weapon-pickup", fighter.side, { WEAPON: profile.name })',
    'demoCommentaryEmit("weapon-throw", fighter.side, { WEAPON: profile.name })',
    'demoCommentaryEmit("wall-bounce", attacker.side)',
    'demoCommentaryEmit("perfect-guard", victim.side)',
    'demoCommentaryEmit("guard-crush", attacker ? attacker.side : 1 - fighter.side)',
    "demoCommentaryRoundEnd(winner, type);",
    "demoCommentaryObserve();",
  ];
  for (const site of sites) assert.ok(source.includes(site), `missing call site: ${site}`);
  assert.equal(source.split("demoCommentaryRoundStart();").length - 1, 2, "the bell edge and the skip path");
  // Nothing the sim checksums is written by the lower third: the helpers
  // only read state and write demoSession / the DOM.
  const block = source.slice(source.indexOf("function demoCommentaryLive() {"), source.indexOf("function syncDemoLowerThird() {"));
  assert.doesNotMatch(block, /state\.[a-zA-Z]+(\[[^\]]*\])?(\.[a-zA-Z]+)* (=|\+=|-=)[^=]/, "no sim writes");
});

test("index.html carries the two rows on the bug and styles.css gives them the grid", async () => {
  const html = await readFile(join(gameRoot, "index.html"), "utf8");
  assert.match(html, /<strong id="demoHudLine" class="demo-hud-line" hidden><\/strong>/);
  assert.match(html, /<data id="demoHudRoom" class="demo-hud-room" value="" hidden><\/data>/);
  // Inside the bug, and the smoke's existing selectors survive around it.
  const bug = html.slice(html.indexOf('<div id="demoHud"'), html.indexOf("</div>", html.indexOf('<div id="demoHud"')));
  assert.ok(bug.includes('id="demoHudLine"') && bug.includes('id="demoHudRoom"'));
  assert.match(bug, /<span id="demoHudMatchup">/);
  assert.match(bug, /<em id="demoHudCycle">/);
  const css = await readFile(join(gameRoot, "styles.css"), "utf8");
  assert.match(css, /grid-template-areas: "show speed" "matchup matchup" "story story" "line line" "room room" "cycle prompt" "actions actions";/);
  assert.match(css, /\.demo-hud \.demo-hud-line \{[^}]*grid-area: line;/);
  assert.match(css, /\.demo-hud \.demo-hud-line \{[^}]*font-size: 1\.95em;/, "the loudest type in the bug: ~22 px at 1440x900");
  assert.match(css, /\.demo-hud \.demo-hud-room \{[^}]*grid-area: room;/);
  assert.match(css, /body\.demo-active\.demo-idle \.demo-hud\.calling \{ opacity: 1; \}/, "a live line lifts the screensaver dim");
  assert.match(css, /body\.demo-active\.demo-idle \.demo-hud \{ opacity: \.45;/, "the tuck itself is unchanged");
});
