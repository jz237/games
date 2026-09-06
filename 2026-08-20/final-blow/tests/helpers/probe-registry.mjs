// The browser smoke's probe registry (5.3 VERIFICATION HARNESS, sweep #53).
//
// tests/browser-smoke.mjs used to be one 3,700-line sequential body: the first
// failing assert aborted everything after it, so a broken crowd probe hid
// every later probe, and a two-minute all-or-nothing run with no way to rerun
// one section is why the 5.0/5.1 acceptance evidence lives in a markdown log
// instead of a test. The bodies are unchanged; they are now registered as
// named probes that run in order, keep going after a failure, and report.
//
// This module is deliberately free of DOM, CDP and node:child_process so the
// selection and reporting logic is unit-testable under `node --test`
// (tests/probe-registry.test.mjs) instead of only exercised by a 2-minute
// browser run.

// One ordered registry. `register` is called at module load, before anything
// is launched, so `--list` can answer without starting a server or Chrome.
export function createProbeRegistry() {
  const probes = [];
  const names = new Set();
  return {
    register(name, run) {
      if (typeof name !== "string" || !name.trim()) throw new Error("probe name must be a non-empty string");
      if (names.has(name)) throw new Error(`duplicate probe name: ${name}`);
      if (typeof run !== "function") throw new Error(`probe ${name} must be a function`);
      names.add(name);
      probes.push({ name, run });
      return name;
    },
    get names() {
      return probes.map((probe) => probe.name);
    },
    get size() {
      return probes.length;
    },
    probes() {
      return probes.slice();
    },
  };
}

// --only / --skip take a comma-separated list; each entry matches a probe
// whose name EQUALS it or CONTAINS it, so `--only=crowd` runs every crowd
// probe and `--only=cinema-3d` runs exactly one. Both flags may be repeated.
export function parseProbeArgs(argv = []) {
  const result = { only: [], skip: [], report: null, artifacts: null, list: false, unknown: [] };
  for (const argument of argv) {
    const [flag, ...rest] = argument.split("=");
    const value = rest.join("=");
    if (flag === "--only") result.only.push(...splitList(value));
    else if (flag === "--skip") result.skip.push(...splitList(value));
    else if (flag === "--report") result.report = value || null;
    else if (flag === "--artifacts") result.artifacts = value || null;
    else if (flag === "--list") result.list = true;
    else result.unknown.push(argument);
  }
  return result;
}

function splitList(value) {
  return String(value || "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

export function matchesPattern(name, pattern) {
  return name === pattern || name.includes(pattern);
}

// Selection keeps REGISTRY ORDER, never the order the patterns were typed:
// probes share page state (a probe leaves a fight running for the next one),
// so running them out of order would be a different test.
export function selectProbes(names, { only = [], skip = [] } = {}) {
  const chosen = only.length
    ? names.filter((name) => only.some((pattern) => matchesPattern(name, pattern)))
    : names.slice();
  return chosen.filter((name) => !skip.some((pattern) => matchesPattern(name, pattern)));
}

// Patterns that matched nothing are a typo, not a silent empty run.
export function unmatchedPatterns(names, patterns = []) {
  return patterns.filter((pattern) => !names.some((name) => matchesPattern(name, pattern)));
}

// Continue-on-failure: every probe runs, a throw is recorded against its own
// name, and the caller decides the exit code from `failed`.
export async function runProbes(probes, { selected = null, onStart = null, onResult = null, now = () => Date.now() } = {}) {
  const wanted = selected ? new Set(selected) : null;
  const results = [];
  for (const probe of probes) {
    if (wanted && !wanted.has(probe.name)) {
      results.push({ name: probe.name, status: "skipped", durationMs: 0, error: null });
      continue;
    }
    onStart?.(probe.name);
    const started = now();
    try {
      await probe.run();
      const result = { name: probe.name, status: "passed", durationMs: now() - started, error: null };
      results.push(result);
      onResult?.(result);
    } catch (error) {
      const result = {
        name: probe.name,
        status: "failed",
        durationMs: now() - started,
        error: { message: error?.message || String(error), stack: error?.stack || null },
      };
      results.push(result);
      onResult?.(result);
    }
  }
  return summariseProbes(results);
}

export function summariseProbes(results) {
  const counts = { total: results.length, passed: 0, failed: 0, skipped: 0 };
  for (const result of results) counts[result.status] += 1;
  return {
    status: counts.failed ? "failed" : "passed",
    counts,
    failed: results.filter((result) => result.status === "failed").map((result) => result.name),
    results,
  };
}
