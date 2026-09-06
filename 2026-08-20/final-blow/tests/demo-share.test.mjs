import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEMO_CYCLE_MAX,
  buildDemoShareUrl,
  createDemoDirector,
  parseDemoBootRequest,
  parseDemoCycle,
  parseDemoSeed,
} from "../engine/demo.mjs";

// 5.4 FIGHT NIGHT, sweep #30 (and the share half of #12): SHAREABLE
// EXHIBITIONS. ?demo=<seed>[&cycle=n] boots straight into a seeded
// exhibition on the wall clock, the demo HUD bug copies/shares that address,
// and qa.demo(seed, cycle) and the boot router are the same startDemo call.
// The pure half (the URL grammar) is tested directly; the game.js wiring is
// pinned from source because the ONE-ENTRY property and the demo gating are
// what must never regress. The tick-for-tick proof itself lives in the
// browser (tests/browser-smoke.mjs, probe demo-seed-url).

const testDir = dirname(fileURLToPath(import.meta.url));
const gameRoot = join(testDir, "..");
const gameSource = readFileSync(join(gameRoot, "game.js"), "utf8");
const indexSource = readFileSync(join(gameRoot, "index.html"), "utf8");
const stylesSource = readFileSync(join(gameRoot, "styles.css"), "utf8");
const manifest = JSON.parse(readFileSync(join(gameRoot, "manifest.webmanifest"), "utf8"));

const fighters = ["deathblow", "jez", "alan", "post", "benny", "donald", "cyraxx", "ali"];
const stages = ["somerset", "vet", "wildwood", "buffet", "cruise", "janney"];

// ---------------------------------------------------------------------------
// The URL grammar
// ---------------------------------------------------------------------------

test("a demo seed is an unsigned decimal or a short slug, and nothing else", () => {
  assert.equal(parseDemoSeed("237"), 237);
  assert.equal(parseDemoSeed(" 237 "), 237);
  assert.equal(parseDemoSeed(237), 237);
  assert.equal(parseDemoSeed("0"), 0);
  assert.equal(parseDemoSeed("4294967295"), 4294967295, "the full uint32 range is a seed");
  assert.equal(parseDemoSeed("4294967296"), null, "past uint32 is refused, not wrapped");
  assert.equal(parseDemoSeed("fight-night"), "fight-night");
  assert.equal(parseDemoSeed("FightNight_2"), "FightNight_2");
  assert.equal(parseDemoSeed(""), null);
  assert.equal(parseDemoSeed(null), null);
  assert.equal(parseDemoSeed(undefined), null);
  assert.equal(parseDemoSeed("../x"), null);
  assert.equal(parseDemoSeed("-5"), null);
  assert.equal(parseDemoSeed("1.5"), null);
  assert.equal(parseDemoSeed("a".repeat(33)), null, "slugs are capped at 32 characters");
  assert.equal(parseDemoSeed("<script>"), null);
});

test("237 and \"237\" are the SAME show: the director hashes String(seed)", () => {
  const options = { fighterIds: fighters, stageIds: stages, trackCount: 4 };
  const byNumber = createDemoDirector({ ...options, seed: parseDemoSeed("237") });
  const byString = createDemoDirector({ ...options, seed: "237" });
  assert.deepEqual(byNumber.snapshot(), byString.snapshot());
  assert.deepEqual(Array.from({ length: 6 }, () => byNumber.next()), Array.from({ length: 6 }, () => byString.next()));
  // ...and a slug is as good a seed as a number.
  const slug = createDemoDirector({ ...options, seed: parseDemoSeed("fight-night") });
  const slugAgain = createDemoDirector({ ...options, seed: "fight-night" });
  assert.deepEqual(slug.next(), slugAgain.next());
});

test("the cycle is a 1-based card number, defaulting to 1 and capped at 500", () => {
  assert.equal(parseDemoCycle(undefined), 1);
  assert.equal(parseDemoCycle(""), 1);
  assert.equal(parseDemoCycle("3"), 3);
  assert.equal(parseDemoCycle(3), 3);
  assert.equal(parseDemoCycle("0"), 1);
  assert.equal(parseDemoCycle("-2"), 1);
  assert.equal(parseDemoCycle("2.5"), 1);
  assert.equal(parseDemoCycle("junk"), 1);
  assert.equal(parseDemoCycle("9999"), DEMO_CYCLE_MAX);
  assert.equal(DEMO_CYCLE_MAX, 500, "the cap matches qa.demoCycles' own bound");
});

test("the boot request: ?demo= wins, ?mode=demo is a random start, a bad seed is NO demo", () => {
  assert.deepEqual(parseDemoBootRequest("?demo=237"), { seed: 237, cycle: 1 });
  assert.deepEqual(parseDemoBootRequest("?debug=1&demo=237&cycle=3"), { seed: 237, cycle: 3 });
  assert.deepEqual(parseDemoBootRequest("?demo=fight-night&cycle=12"), { seed: "fight-night", cycle: 12 });
  assert.deepEqual(parseDemoBootRequest("?demo=237&mode=arcade"), { seed: 237, cycle: 1 }, "?demo= outranks a mode deep-link");
  assert.deepEqual(parseDemoBootRequest("?mode=demo"), { seed: null, cycle: 1 });
  assert.deepEqual(parseDemoBootRequest("?mode=demo&cycle=4"), { seed: null, cycle: 1 }, "a random show has no card to open on");
  // A mistyped share link must land on the title, never on a different show.
  assert.equal(parseDemoBootRequest("?demo=../etc"), null);
  assert.equal(parseDemoBootRequest("?demo="), null);
  assert.equal(parseDemoBootRequest("?demo=99999999999"), null);
  assert.equal(parseDemoBootRequest("?mode=arcade"), null);
  assert.equal(parseDemoBootRequest(""), null);
  assert.equal(parseDemoBootRequest(null), null);
});

test("the share link is the page's own address with only the exhibition on it", () => {
  assert.equal(
    buildDemoShareUrl("https://example.test/final-blow/?debug=1&mode=arcade#top", { seed: 237, cycle: 3 }),
    "https://example.test/final-blow/?demo=237&cycle=3",
  );
  assert.equal(buildDemoShareUrl("http://127.0.0.1:8080/?debug=1", { seed: 237 }), "http://127.0.0.1:8080/?demo=237");
  assert.equal(buildDemoShareUrl("http://127.0.0.1:8080/?debug=1", { seed: 237, cycle: 1 }), "http://127.0.0.1:8080/?demo=237",
    "card 1 is the default and is not written");
  assert.equal(buildDemoShareUrl("http://h/", { seed: "fight-night", cycle: 2 }), "http://h/?demo=fight-night&cycle=2");
  // A link a follower opens must parse back to the exhibition it names.
  const url = new URL(buildDemoShareUrl("http://h/x/?demo=old&cycle=9&debug=1", { seed: 4096, cycle: 7 }));
  assert.deepEqual(parseDemoBootRequest(url.search), { seed: 4096, cycle: 7 });
  // The presentation choices ride along; an online invite or a mode never does.
  assert.equal(
    buildDemoShareUrl("http://h/?renderer=3d&fighters=3d&speed=0.5&invite=abc&mode=daily", { seed: 5 }),
    "http://h/?demo=5&renderer=3d&fighters=3d&speed=0.5",
  );
  assert.equal(buildDemoShareUrl("http://h/", { seed: null }), null, "no seed, no link");
  assert.equal(buildDemoShareUrl("http://h/", { seed: "../" }), null);
});

// ---------------------------------------------------------------------------
// game.js wiring, pinned from source
// ---------------------------------------------------------------------------

test("the boot router, the title button, the attract timer and qa.demo all enter through startDemo", () => {
  // ONE ENTRY. The URL path is an attract start with the link's seed and card.
  assert.match(gameSource, /const bootDemo = parseDemoBootRequest\(location\.search\);/);
  assert.match(gameSource,
    /if \(bootDemo\) \{\s*showScreen\("title"\);\s*suppressImmersivePrompt = true;\s*startDemo\(\{ attract: true, seed: bootDemo\.seed, cycle: bootDemo\.cycle, source: "url" \}\);/,
    "a ?demo= boot must be startDemo({ attract: true, seed, cycle }) after the title, with the immersive prompt suppressed (no gesture)");
  // ...qa.demo(seed, cycle) is the same call under the manual clock.
  assert.match(gameSource, /demo\(seed = 237, cycle = 1\) \{\s*startDemo\(\{ qa: true, seed, cycle, source: "qa" \}\);/);
  // ...and the button and the idle timer are unchanged entries.
  assert.match(gameSource, /\$\("#demoButton"\)\.addEventListener\("click", \(\) => startDemo\(\)\);/);
  assert.match(gameSource, /startDemo\(\{ attract: true \}\);/);
  // The card is opened by the SAME loop qa.demoCycles runs.
  assert.match(gameSource, /for \(let card = 1; card < cards; card \+= 1\) startNextDemoMatch\(\);/);
  // The boot router sits where the manifest deep-links are routed and stays
  // behind the online-invite / stored-resume branches (a private room wins).
  const invite = gameSource.indexOf("if (pendingOnlineInvite) {\n  state.mode = \"online\";");
  const router = gameSource.indexOf("const bootDemo = parseDemoBootRequest(location.search);");
  const arcade = gameSource.indexOf("} else if (bootMode === \"arcade\" || bootMode === \"survival\") {");
  assert.ok(invite > 0 && router > invite && arcade > router, "the demo boot must be routed after the online branches and before the arcade one");
});

test("the seed is kept raw on the session and the link is built from it", () => {
  assert.match(gameSource, /const demoSeed = seed \?\? pendingSeed \?\? hashSeed\(Date\.now\(\), performance\.now\(\), state\.rng\.nextUint32\(\)\);/);
  assert.match(gameSource, /demoSession\.seed = demoSeed;/);
  assert.match(gameSource, /return buildDemoShareUrl\(location\.href, \{ seed: demoSession\.seed, cycle: demoSession\.cycle\?\.cycle \|\| 1 \}\);/);
  // The seed rewind (matchSerial / rng / tick domain) stays exactly where it
  // was: only an EXPLICIT seed rewinds the page to cold.
  assert.match(gameSource, /if \(seed !== null\) \{\s*state\.matchSerial = 0;/);
  // Session reset clears the new fields with the rest.
  assert.match(gameSource, /demoSession\.seed = null;\s*demoSession\.source = null;\s*demoSession\.rounds = \[\];/);
});

test("everything new is demo-gated: a played match is byte-identical", () => {
  // The round ledger is written at finishRound behind the demo gate and never
  // read by the sim (the only reads are qa.demoRounds and the snapshot count).
  assert.match(gameSource, /function demoLedgerRound\(winner, type\) \{\s*if \(state\.mode !== "demo" \|\| !demoSession\.active \|\| rollbackResimulating\) return;/);
  assert.equal((gameSource.match(/demoLedgerRound\(winner, type\);/g) || []).length, 1, "exactly one ledger call site (finishRound)");
  const reads = gameSource.match(/demoSession\.rounds\b/g) || [];
  assert.ok(reads.length >= 4 && reads.length <= 8, `the ledger is bookkeeping only, got ${reads.length} references`);
  assert.doesNotMatch(gameSource, /demoSession\.rounds\[/, "the sim must never index the ledger");
  // The share bug only exists inside the demo HUD, which only exists during a
  // demo, and its handler refuses to build a link outside one.
  assert.match(gameSource, /function demoShareUrl\(\) \{\s*if \(!demoSession\.active \|\| demoSession\.seed === null\) return null;/);
  assert.match(indexSource, /<div id="demoHud" class="demo-hud"[^>]*>[\s\S]*?<button id="demoShareButton" class="demo-share" type="button"[^>]*hidden>COPY LINK<\/button>[\s\S]*?<\/div>/);
  // The boot router only fires on a parsed request; a plain boot is untouched.
  assert.match(gameSource, /if \(bootDemo\) \{/);
});

test("a press on the share bug is the one pointer that does not end the demo", () => {
  // The capture-phase pointerdown listener is the any-input-exits rule; it
  // must consult the share guard FIRST, and the guard must be demo-scoped.
  assert.match(gameSource,
    /document\.addEventListener\("pointerdown", \(event\) => \{\s*if \(attractSoundChipPress\(event\)\) return;\s*armAttractAudio\(event\);\s*if \(isDemoShareTarget\(event\)\) return;\s*noteUserActivity\(\);\s*\}, true\);/);
  assert.match(gameSource, /function isDemoShareTarget\(event\) \{[\s\S]*?demoSession\.active && target[\s\S]*?target\.closest\("#demoShareButton"\)/);
  // The click handler stops its own propagation so nothing downstream reads
  // it as menu input, and share/clipboard/fallback are all handled.
  assert.match(gameSource, /\$\("#demoShareButton"\)\.addEventListener\("click", \(event\) => \{\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*shareDemoLink\(\);/);
  assert.match(gameSource, /if \(typeof navigator\.share === "function"\) \{[\s\S]*?title: "FINAL BLOW · WATCH DEMO"/);
  assert.match(gameSource, /await navigator\.clipboard\.writeText\(url\);\s*note\("LINK COPIED"\);/);
  // The HUD passes pointers through; the bug alone takes them, and is a real
  // target on a phone.
  assert.match(stylesSource, /\.demo-hud \{[^}]*pointer-events: none;/);
  assert.match(stylesSource, /\.demo-hud \.demo-share \{[^}]*min-height: 28px;[^}]*pointer-events: auto;/);
  assert.match(stylesSource, /\.demo-hud \.demo-share \{[^}]*min-height: 26px;/, "the phone rule keeps the bug tappable");
});

test("the demo HUD names the exhibition's address and the manifest offers the shortcut", () => {
  assert.match(gameSource, /const seedLabel = demoSession\.seed === null \? "" : ` · SEED \$\{demoSession\.seed\}`;/);
  assert.match(gameSource, /`\$\{text\.cycle\}\$\{onTheClock\}\$\{seedLabel\}`/);
  const shortcut = manifest.shortcuts.find((entry) => entry.url === "./?mode=demo");
  assert.ok(shortcut, "manifest.webmanifest must list the Watch Demo shortcut");
  assert.equal(shortcut.name, "Watch Demo");
  assert.deepEqual(manifest.shortcuts.map((entry) => entry.url), ["./?mode=arcade", "./?mode=survival", "./?mode=daily", "./?mode=demo"]);
  // The snapshot carries what the pin and the integrator read.
  assert.match(gameSource, /seed: demoSession\.seed,\s*source: demoSession\.source,\s*shareUrl: demoShareUrl\(\),\s*roundsSettled: demoSession\.rounds\.length,/);
  assert.match(gameSource, /demoRounds\(\) \{/);
  assert.match(gameSource, /demoShareUrl\(\) \{\s*return demoShareUrl\(\);/);
});
