import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createProbeRegistry,
  matchesPattern,
  parseProbeArgs,
  runProbes,
  selectProbes,
  summariseProbes,
  unmatchedPatterns,
} from "./helpers/probe-registry.mjs";

// 5.3 VERIFICATION HARNESS (sweep #53). tests/browser-smoke.mjs was one
// 3,700-line sequential body whose first failing assert aborted the rest — a
// broken crowd probe hid every later probe, and there was no way to re-run one
// section of a two-minute script. The registry that fixed that is its own
// module precisely so this suite can test the selection and reporting logic
// under `node --test`, instead of the logic only ever being exercised by a
// browser run nobody can afford to repeat.

const testDir = dirname(fileURLToPath(import.meta.url));
const smokeSource = readFileSync(join(testDir, "browser-smoke.mjs"), "utf8");

test("the registry keeps names unique and preserves registration order", () => {
  const registry = createProbeRegistry();
  registry.register("alpha", () => {});
  registry.register("beta", () => {});
  registry.register("gamma", () => {});
  assert.deepEqual(registry.names, ["alpha", "beta", "gamma"]);
  assert.equal(registry.size, 3);
  assert.throws(() => registry.register("beta", () => {}), /duplicate probe name: beta/);
  assert.throws(() => registry.register("", () => {}), /non-empty string/);
  assert.throws(() => registry.register("delta", "not a function"), /must be a function/);
});

test("parseProbeArgs reads the five flags and collects anything else", () => {
  const parsed = parseProbeArgs([
    "--only=crowd,tempo",
    "--only=cinema-3d",
    "--skip=demo",
    "--report=/tmp/report.json",
    "--artifacts=/tmp/shots",
    "--list",
    "--wat",
  ]);
  assert.deepEqual(parsed.only, ["crowd", "tempo", "cinema-3d"]);
  assert.deepEqual(parsed.skip, ["demo"]);
  assert.equal(parsed.report, "/tmp/report.json");
  assert.equal(parsed.artifacts, "/tmp/shots");
  assert.equal(parsed.list, true);
  assert.deepEqual(parsed.unknown, ["--wat"]);
});

test("parseProbeArgs defaults to a full run and ignores empty list entries", () => {
  const parsed = parseProbeArgs([]);
  assert.deepEqual(parsed, { only: [], skip: [], report: null, artifacts: null, list: false, unknown: [] });
  assert.deepEqual(parseProbeArgs(["--only=,, a ,,b,"]).only, ["a", "b"]);
  // A path with an "=" in it survives the split.
  assert.equal(parseProbeArgs(["--report=/tmp/a=b.json"]).report, "/tmp/a=b.json");
});

test("a pattern matches a probe by exact name or as a substring", () => {
  assert.equal(matchesPattern("crowd-ko-hold", "crowd-ko-hold"), true);
  assert.equal(matchesPattern("crowd-ko-hold", "crowd"), true);
  assert.equal(matchesPattern("crowd-ko-hold", "ko-hold"), true);
  assert.equal(matchesPattern("crowd-ko-hold", "cinema"), false);
});

test("selection keeps registry order, not the order the patterns were typed", () => {
  const names = ["title-menu", "crowd-density", "crowd-ko-hold", "tempo-tells", "cinema-3d"];
  // Probes share page state, so running them in the caller's order would be a
  // different test. This is the rule that keeps that from happening.
  assert.deepEqual(selectProbes(names, { only: ["cinema-3d", "crowd"] }), ["crowd-density", "crowd-ko-hold", "cinema-3d"]);
  assert.deepEqual(selectProbes(names, {}), names);
  assert.deepEqual(selectProbes(names, { skip: ["crowd"] }), ["title-menu", "tempo-tells", "cinema-3d"]);
  // --skip is applied after --only, so a name in both is left out.
  assert.deepEqual(selectProbes(names, { only: ["crowd"], skip: ["ko"] }), ["crowd-density"]);
  assert.deepEqual(selectProbes(names, { only: ["nothing-like-this"] }), []);
});

test("a pattern that matches nothing is reported, not silently ignored", () => {
  const names = ["title-menu", "cinema-3d"];
  assert.deepEqual(unmatchedPatterns(names, ["cinema", "typo", "menu"]), ["typo"]);
  assert.deepEqual(unmatchedPatterns(names, []), []);
});

test("every probe runs even after one throws, and each failure keeps its own name", async () => {
  const ran = [];
  const probes = [
    { name: "first", run: async () => { ran.push("first"); } },
    { name: "boom", run: async () => { ran.push("boom"); throw new Error("crowd density collapsed"); } },
    { name: "after", run: async () => { ran.push("after"); } },
  ];
  const summary = await runProbes(probes);
  assert.deepEqual(ran, ["first", "boom", "after"], "a failure must not abort the probes after it");
  assert.equal(summary.status, "failed");
  assert.deepEqual(summary.failed, ["boom"]);
  assert.deepEqual(summary.counts, { total: 3, passed: 2, failed: 1, skipped: 0 });
  assert.match(summary.results[1].error.message, /crowd density collapsed/);
  assert.ok(summary.results[1].error.stack.includes("crowd density collapsed"));
});

test("an unselected probe is reported as skipped and never invoked", async () => {
  const ran = [];
  const probes = ["a", "b", "c"].map((name) => ({ name, run: async () => ran.push(name) }));
  const summary = await runProbes(probes, { selected: ["a", "c"] });
  assert.deepEqual(ran, ["a", "c"]);
  assert.deepEqual(summary.results.map((result) => result.status), ["passed", "skipped", "passed"]);
  assert.deepEqual(summary.counts, { total: 3, passed: 2, failed: 0, skipped: 1 });
  assert.equal(summary.status, "passed", "skipping is not failing");
});

test("runProbes reports a duration per probe and calls back as it goes", async () => {
  let clock = 1000;
  const seen = [];
  const probes = [
    { name: "quick", run: () => { clock += 5; } },
    { name: "slow", run: () => { clock += 250; } },
  ];
  const summary = await runProbes(probes, {
    now: () => clock,
    onStart: (name) => seen.push(`start:${name}`),
    onResult: (result) => seen.push(`${result.status}:${result.name}`),
  });
  assert.deepEqual(seen, ["start:quick", "passed:quick", "start:slow", "passed:slow"]);
  assert.deepEqual(summary.results.map((result) => result.durationMs), [5, 250]);
});

test("summariseProbes tallies a mixed run", () => {
  const summary = summariseProbes([
    { name: "a", status: "passed" },
    { name: "b", status: "failed" },
    { name: "c", status: "skipped" },
    { name: "d", status: "failed" },
  ]);
  assert.equal(summary.status, "failed");
  assert.deepEqual(summary.failed, ["b", "d"]);
  assert.deepEqual(summary.counts, { total: 4, passed: 1, failed: 2, skipped: 1 });
});

// --- the smoke script itself ------------------------------------------------
// browser-smoke.mjs launches a server and Chrome at import, so it cannot be
// imported here; these read its source, which is also what keeps the probe
// names (the --only/--skip contract, and what tests/README.md documents)
// from drifting silently.

const probeNames = [...smokeSource.matchAll(/^probe\('([a-z0-9-]+)', async \(\) => \{$/gm)].map((match) => match[1]);

test("browser-smoke registers a probe per section, with unique names", () => {
  assert.ok(probeNames.length >= 69, `expected the whole 5.2 body to be registered, found ${probeNames.length}`);
  assert.deepEqual(
    probeNames.filter((name, index) => probeNames.indexOf(name) !== index),
    [],
    "probe names are the CLI contract; they must be unique",
  );
  for (const name of probeNames) {
    assert.match(name, /^[a-z][a-z0-9-]*[a-z0-9]$/, `${name} must be a lowercase kebab-case name`);
  }
});

test("browser-smoke keeps the 5.3 verification probes and runs CINEMA 3D last", () => {
  for (const name of [
    "ambient-ko-pulse",
    "crowd-ko-hold",
    "tempo-tells",
    "announcer-decision",
    "pose-trace-chains",
    "cinema-3d",
    "console-clean",
  ]) {
    assert.ok(probeNames.includes(name), `browser-smoke must register ${name}`);
  }
  // cinema-3d reloads the page under ?renderer=3d, so nothing but the
  // console/network sweep may follow it.
  assert.deepEqual(probeNames.slice(-2), ["cinema-3d", "console-clean"]);
});

test("browser-smoke answers --list before it launches anything", () => {
  const listIndex = smokeSource.indexOf("if (cli.list) {");
  const serverIndex = smokeSource.indexOf("const server = await startStaticServer();");
  assert.ok(listIndex > 0 && serverIndex > 0);
  assert.ok(listIndex < serverIndex, "--list must not cost a server and a Chrome launch");
});

test("browser-smoke sets a non-zero exit code when a probe fails", () => {
  assert.match(smokeSource, /if \(summary\.status === "failed"\) \{[\s\S]*?process\.exitCode = 1;/);
});
