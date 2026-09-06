# Verifying Final Blow

Three kinds of test live here, and they answer three different questions.

```sh
node --test tests/*.test.mjs         # 434 unit / module / guard tests, ~0.9 s
node tests/browser-smoke.mjs         # 75 probes in a real headless Chrome, ~75 s
node tests/orientation-gate.mjs      # portrait-gate capability scenarios, needs Chrome
node tests/mobile-parity.mjs         # atlas-facing / scanline / profile parity, needs Chrome
```

`browser-smoke.mjs` is the bar for publishing. It starts its own static server
on a free port and its own headless Chrome on a free debugging port, so it
never collides with anything already running on the box.

---

## The probe registry (5.3, sweep #53)

Until 5.3 the smoke was one 3,700-line sequential body. The first failing
assert aborted everything after it, so one broken probe hid the sixty that
followed, and there was no way to re-run a section of a two-minute script. That
is why the 5.0 and 5.1 acceptance evidence ended up in a markdown log instead
of a test — nobody could afford the loop.

The bodies did not change. Each section is now registered as a named probe:

```js
probe('crowd-density', async () => { /* the same asserts, untouched */ });
```

Probes run **in registry order**, always — they share page state deliberately
(a probe leaves a fight running, a stage selected, a preference toggled for the
next one), so re-ordering them would be a different test. A probe that throws
is recorded against its own name and the run continues; the exit code is
non-zero if anything failed, and the failures are listed again at the end.

### Flags

| flag | what it does |
| --- | --- |
| `--only=<name,...>` | run only probes whose name equals or contains one of these |
| `--skip=<name,...>` | leave those out (applied after `--only`) |
| `--report=<path>` | write the JSON run report — per-probe status and timing, plus every measurement the summary prints |
| `--artifacts=<dir>` | where probes drop screenshots (default: the OS temp dir) |
| `--list` | print the probe names in run order and exit |

`--list` is answered before the server and Chrome are started, so it is free.
A pattern that matches no probe is an error, not a silent empty run.

```sh
node tests/browser-smoke.mjs --list
node tests/browser-smoke.mjs --only=cinema-3d --artifacts=/tmp/fb
node tests/browser-smoke.mjs --only=crowd,tempo,ambient      # ~8 s
node tests/browser-smoke.mjs --skip=demo-mode,graphic-fatalities
FINAL_BLOW_SMOKE_VERBOSE=1 node tests/browser-smoke.mjs      # one line per probe
```

A filtered run reports `probes.filtered: true`. Its measurement block only
carries what the probes it ran actually measured — the whole-suite summary and
the zero-console-error sweep assume a full run.

The five `FINAL_BLOW_*_SCREENSHOT` environment dumps still work unchanged
(`FINAL_BLOW_SCREENSHOT`, `_COUNTER_`, `_FIGHT_`, `_RUSH_`, `_PROJECTILE_`,
`_FEEDBACK_`, `_FLOW_`, `_DEATHBLOW_`, `_KIT_`, `_VICTORY_`), and
`CHROME_PATH` still overrides the browser binary.

### Adding a probe

Register it at the end of the section it belongs to, with a lowercase
kebab-case name. Names are the CLI contract and
`tests/probe-registry.test.mjs` pins them, so keep them stable. Anything a
later probe reads must be assigned to one of the hoisted `let`s at the top of
the file rather than declared with `const` inside the probe.

Two probes are order-critical and must stay last: `cinema-3d` reloads the page
under `?renderer=3d`, and `console-clean` sweeps the runtime errors and failed
responses of the whole run.

---

## What 5.3 added, and what it measures

Every probe below turns a reading that used to be taken by eye into an
assertion. The numbers are the ones measured at 5.3 on this box; the
thresholds sit well under them so a retune does not false-fail.

**`ambient-ko-pulse`** — the 5.0 stage reaction. MOTION-ATLAS.md recorded
"both floodlight regions +27 mean brightness at the KO tick, the plain sky flat
at 74.5", measured by hand, and STAGES.md said the browser probe for it was
still to write. It samples the two authored Vet floodlight centres — [125, 88]
and [1230, 232] in `drawStageAmbient`, whose glow radius grows 90 → 210 with
the pulse — through `getImageData` on the game canvas, plus a patch of plain
sky outside every glow and firework lane as the control, taken as MEDIANS over
nine painted frames (a blimp crosses the sky and an ambient firework's sparks
spread nearly 200 px, so a single frame — or a peak — is noise). Measured:
floodlight A **+16.5..+18.4**, floodlight B **+45.1..+47.5** (mean
**+31..+33**), sky **+1.5..+1.8**. Asserted: mean ≥ 15, each ≥ 10, sky < 8,
and each floodlight more than 3× the sky. Then all six stages: calm before, surge > 0 and the KO
kind latched after.

**`crowd-ko-hold`** — 5.1's KO moment. The hold latches on the first painted
frame after the phase edge (0 → 1), the held reaction ramps to 1.4, the crowd
splits (measured 9 cheering / 14 wincing / 9 flinching on the tailgate), a
voiced take plays, and no take may follow itself. It waits out the roar's
2,000 ms rate limit first so "the KO plays a take" is a real assertion rather
than a race against whatever probe landed a KO before it.

**`tempo-tells`** — a whiffed jab. `whiffTells` +1, phase `none → whiff →
rearm`, strength 0.7, and the drawn counters sampled over real frames: a
fringe, ghosts, a re-arm flash, and — when a second press lands inside the gap
— one `rearmDrop`, one `rearmClick` and one drop flash. All the sim totals are
monotonic for the session, so the probe asserts deltas.

**`announcer-decision`** — the clock's voice. A round starts at 99 seconds and
nothing waits 89 of them, so `__finalBlowQa.setTimer(seconds)` (new, and
guarded to QA fights through `state.qaManualMode`) puts the clock on the edge.
The probe first proves the guard by starting a match from the menu and
watching `setTimer` refuse it, then walks the ladder: one TEN SECONDS call at
:10 and only one, 11 booked timer edges from :10 to :00, every one of them
voiced, and a decision call at :00 with the round over.

**`pose-trace-chains`** — 5.0's frame attribution, which was "verified by eye in
real play". `qa.pose()` resolves through the same `fighterAnimationPose` the
renderers call, so stepping one tick and asking for the pose records the
transition deterministically — no rendered frame, no tick counting. Chains are
asserted as an ordered PREFIX, so tempo tuning cannot break them.

**`cinema-3d`** — the ~9,000 lines of `renderer/three` that no test ever booted.
It reloads under `?renderer=3d` (after putting the session back on a profile
that allows 3D — the mobile probes leave the quality governor on `battery`,
which `cinema3dAllowed()` refuses), then asserts the `stats()` shape, the live
host contract, a rendered fight (measured **241 draw calls / 4,211 triangles /
10 crowd billboards / 22 sheet banks** on Somerset), a forced stage weapon and
a live projectile reaching the world-objects layer, and finally writes
`cinema-3d.png` and measures it — mean luma **59.6**, **67 %** of the frame
carrying image — so a black world fails here instead of at the next release.
Headless Chrome renders this through SwiftShader on the smoke's existing
flags; no `--use-angle` is needed.

---

## The unit suites behind them

- `tests/probe-registry.test.mjs` — the registry, the CLI parsing, the
  selection rules and continue-on-failure, plus source pins on the smoke's
  probe names, its `--list`-before-launch order and its exit code.
- `tests/png-luma.test.mjs` — the PNG decoder the CINEMA 3D artifact is
  measured with, pinned against PNGs built byte by byte, one per filter type.
  A wrong decoder would turn "the 3D world is black" into a green test.
- `tests/cinema-host.test.mjs` — the 2D→3D host contract from both ends in
  source, plus the QA read the browser probe uses against the live object.
- `tests/announcer.test.mjs` — the clock ladder, and `setTimer`'s guard.
- `tests/ambient.test.mjs`, `tests/crowd-ko-moment.test.mjs`,
  `tests/tempo-tells.test.mjs` — the pure state machines the probes above
  measure the *drawn* result of.

## Helpers

`tests/helpers/` holds the modules the smoke imports so they can be tested on
their own: `probe-registry.mjs` (registry, CLI, runner) and `png-luma.mjs`
(dependency-free PNG mean-luminance). `three-stub.mjs` /
`three-stub-loader.mjs` let the Node suites load `renderer/three` modules that
import `three`.
