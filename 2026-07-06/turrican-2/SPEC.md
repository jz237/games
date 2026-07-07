# Turrican II: The Final Fight — Tribute Build Spec

**Working title:** Turrican II Tribute (browser)
**Genre:** Run-and-gun exploration platformer + on-rails shmup interlude
**Target:** HTML5 / Canvas or WebGL, 60 Hz fixed timestep, 16 px base tiles @ 2-3x scale

> ### ORIGINAL-ASSET NOTICE (read first)
> This is a **faithful ORIGINAL homage / tribute**. Every asset — sprites,
> tiles, palettes, music, and sound effects — must be **originally created**.
> **No copyrighted ROM data, no ripped graphics, no ripped audio, no reproduced
> melodies from Chris Huelsbeck's score.** The original game is referenced only
> for structure, mechanics feel, and mood. When in doubt, create fresh.

---

## 1. World & Stage List (AUTHORITATIVE, ordered)

**5 worlds / 11 stages**, distributed **2 / 2 / 3 / 2 / 2**. Worlds 1, 2, 4, 5
are EXPLORE platform stages; **World 3 is the only 3-stage world**, an on-rails
SHOOT-'EM-UP interlude. Game ends vs the final boss **"The Machine."**

| # | World | Type | Stages | Theme |
|---|-------|------|--------|-------|
| 1 | **Desert / Landorin Surface** | PLATFORM | 1-1, 1-2 | Outdoor rocky desert surface; open sky, powerful winds; the opening world. Waterfalls appear in 1-2. Introduces morph wheel, laser/spread, power line. |
| 2 | **Submerged Dungeon** | PLATFORM | 2-1, 2-2 | Underground caverns + an **underwater lake** with all-directional swim movement; ends on a vertical **wind-climb**. Enemy-dense. Ends by stealing a spaceship -> World 3. |
| 3 | **Corridor** | SHMUP (on rails) | 3-1, 3-2, 3-3 | Space/mechanical tunnel blaster. 3-1 horizontal; 3-2 mixes vertical scroll; 3-3 high-velocity reaction finale. |
| 4 | **Walker Factory** | PLATFORM | 4-1, 4-2 | Industrial machine interior; fire-breathing Walker statues, conveyors, spinning nuts-on-bolts crush hazards. **PENULTIMATE world.** |
| 5 | **Alien Ship** | PLATFORM | 5-1, 5-2 | H.R. Giger-inspired biomechanical world; eggs, huggers, xenomorph leapers; bone/flesh set pieces. **FINAL world.** 5-2 is a vertical-climb finale ending vs **"The Machine."** |

**Resolved uncertainties (majority / most-authoritative source chosen):**
- **11 stages, not 12.** A "World 2 stage 2-3" was fabricated; Fandom
  ("Submerged Dungeon" = two areas) and Kyzer's maps (only 2.1, 2.2) confirm 11.
  The "12 levels" figure is a single old Zzap!64 outlier — rejected.
- **World order W4 (Walker Factory, penultimate) -> W5 (Alien Ship, final)** is
  uncontested (Fandom + Kyzer + C64-wiki). HG101 does not actually order them.
- On Amiga, **5-2 is an on-foot platform finale**, NOT a shmup (the "final
  shmup level" belongs to the console Super Turrican ports — do not import it).
- World 5 = "Alien Ship" (do NOT confuse with "Alien Labyrinth" from Turrican 1).

---

## 2. Mechanics

Fixed timestep **60 Hz**. Base tile **16 px**. Units: px, px/frame unless noted.

### 2.1 Core physics (tunable constants — suggested starting values)

| Constant | Value | Purpose |
|----------|-------|---------|
| `GRAVITY` | `0.55` | Airborne downward accel per frame^2 |
| `MAX_FALL_SPEED` | `9.0` | Terminal velocity |
| `JUMP_VELOCITY` | `-9.5` | Single-jump impulse (no double jump) |
| `JUMP_CUT_MULT` | `0.45` | Multiply up-vel when jump released early (variable height) |
| `RUN_ACCEL` | `0.7` | Ground accel |
| `AIR_ACCEL` | `0.45` | Air accel |
| `MAX_RUN_SPEED` | `3.2` | Ground top speed (Turrican is brisk) |
| `GROUND_FRICTION` | `0.80` | Idle ground damping/frame |
| `AIR_FRICTION` | `0.92` | Idle air damping/frame |
| `COYOTE_FRAMES` | `5` | Post-ledge grace to still jump |
| `JUMP_BUFFER_FRAMES` | `5` | Remembered jump press before landing |
| `INVULN_FRAMES_ON_HIT` | `90` | I-frames after damage |
| `KNOCKBACK_ON_HIT` | `3.0` | Horizontal shove on damage |

**Contextual modifiers:**
| Constant | Value | Where |
|----------|-------|-------|
| `WIND_FORCE` | `0.25` | W1 open sky, W2 vertical climb — constant push to fight |
| `WATER_GRAVITY_MULT` | `0.35` | W2 underwater |
| `WATER_MOVE_SPEED` | `2.4` | W2 8-directional swim cap |
| `MORPH_SPEED` | `4.5` | Wheel ground speed (faster than run) |

**Feel:** fast, heavy, controllable. Jump is **single** (no double jump),
variable-height via early-release cut. Keep coyote-time + jump-buffer for
forgiving maze traversal even though the original lacked them.

### 2.2 Morph wheel

- Toggle transforms Bren into a spinning invulnerable-ish wheel (`MORPH_SPEED`).
- Fits through 1-tile-tall gaps; used to reach secrets.
- **Cannot fire the primary weapon while morphed.** Can **drop mines/bombs**
  (limited stock). Still dies to hazards/pits.

### 2.3 Power line (rotating beam / whip)

- Hold FIRE to emit a tethered energy beam; rotate stick to sweep it through
  ~180-270 degrees. Continuous damage; reveals/breaks hidden blocks.
- **Movement locks while aiming/charging the power line.**

### 2.4 Freeze / smart-bomb

- Countable secondary (start stock **3**). Activation freezes or clears all
  on-screen enemies and deals heavy boss damage. Refilled by pickup.

### 2.5 Camera & scroll

- Platform worlds: multi-directional follow camera, ~48 px dead-zone, clamped
  to level bounds.
- Shmup (W3): auto-scroll. 3-1 horizontal, 3-2 horizontal+vertical, 3-3 fast
  horizontal. Ship moves freely within the frame.

### 2.6 Timer, lives, checkpoints (reconstructed defaults — tune)

- **Per-stage countdown timer**; expiry = lose a life, respawn at checkpoint.
  Suggested: **300 s** platform stages, **120 s** shmup stages (exact original
  value undocumented).
- `START_LIVES = 3`; extra life via green-diamond thresholds and 1-UP pickups /
  secret set pieces.
- Checkpoints at platform-stage midpoints. Continues: suggest **3**
  (password/retry-style; original exact count undocumented).

---

## 3. Weapons & Power-ups

### 3.1 Primary weapons (switch by pickup; upgrade to L3)

| Weapon | L1 | L2 | L3 | Role |
|--------|----|----|----|------|
| **Spread / Multiple** (default) | 1 forward bullet | 3-way spread | 5-way wide spread, rapid | Crowd control all-rounder |
| **Laser / Beam** | thin piercing beam | thicker, pierces multiple | full-width lightning, high DPS | Single-target / boss |
| **Bounce / Rebound** | 1 ricochet shot | 2 shots | 3 shots, more bounces | Corridors, secret rooms |

### 3.2 Always-available secondaries

- **Power line** (see 2.3), **morph mines** (see 2.2), **freeze/smart-bomb**
  (see 2.4).

### 3.3 Pickups

| Pickup | Effect |
|--------|--------|
| Weapon-swap icon | Switch primary to Spread / Laser / Bounce |
| Upgrade orb | +1 level to current primary (cap L3) |
| Mine refill | +N morph-mine stock |
| Freeze refill | +1 smart-bomb/freeze |
| Green diamond | Score; N diamonds = extra life |
| 1-UP | +1 life |
| Shield | Brief invulnerability |
| Health/energy | Restore energy bar |

### 3.4 Upgrade model (recommended)

- Weapon level is **per-weapon and persists** across switches (more forgiving
  than original). On death: **drop one level** of the current weapon. See
  DECISIONS to lock this.

---

## 4. Enemies & Bosses

> Only **"The Machine"** (final boss) is a firmly attested name. Other bosses
> are undocumented "mega-monsters"; rosters below are ORIGINAL designs matched
> to each world's documented theme.

### World 1 — Desert
- Enemies: crawling scarab-bots, hopping rock-mites, cliff turret pods, flying
  wasp-drones, wind-borne mines.
- **Boss:** rock-armored guardian mech. Stomps + arcing projectiles; exposes
  chest core (weakpoint) between attacks. Phases at 66% / 33% HP.

### World 2 — Submerged Dungeon
- Enemies: underwater eels, homing bubble-mines, cave crabs, spitting wall
  polyps, elevator-guard sentries.
- **Boss:** cavern leviathan with a **grab attack** — claw/tentacle sweeps; on
  grab, drags Bren toward a spike/death barrier (mash fire to break free).
  Weakpoint: exposed maw on lunge.

### World 3 — Corridor (shmup)
- Enemies: fixed wall turrets, fast interceptors, mine-layers, destructible
  barriers, homing seekers.
- **Bosses:** large gun-platform ships blocking the tunnel; spread + beam
  volleys; destroy weakpoint cores. **3-3 = fast gauntlet finale.**

### World 4 — Walker Factory
- Enemies: fire-breathing Walker statues, spinning nuts-on-bolts (crush),
  conveyor drones, arc-hazards, assembly-arm turrets.
- **Boss:** assembled walker mecha. Multi-port fire + march; destroy leg joints
  then core.

### World 5 — Alien Ship
- Enemies: face-hugger crawlers, xenomorph leapers, hatching egg-pods,
  acid-spitters, bone-train segments.
- **Area boss:** Alien-queen-style biomech creature; spawns huggers, lunges,
  spits acid arcs.
- **FINAL BOSS — "The Machine" (5-2):** multi-phase mechanical/biomech
  antagonist.
  - Phase 1: armored exterior — break plating to expose core.
  - Phase 2: core beam sweeps + minion spawns.
  - Phase 3: desperation rapid barrage.
  - Weakpoint: pulsing core (Laser L3 / freeze bombs). Defeat = ending.

**Boss template:** HP pool, 0.5-1.0 s telegraph, 2-4 cyclic attack states, a
vulnerable open window, phase shifts at 66% / 33%. Contact damage on body; only
weakpoint takes weapon damage during open window.

---

## 5. Art Direction (per-world palettes + parallax)

Global: pixel art, 16 px tiles @ 2-3x, bold saturated Amiga-era palettes,
chunky readable sprites, 2-3 parallax layers + interactive layer + foreground
occluder. Hazards use warm/red glow everywhere to read as danger.

**Hero — Bren McGuire:** blue/teal armor `#2E5FD9` w/ highlights `#7CB0FF`,
visor accent `#F2C037`. Morph wheel = spinning metallic sphere with trail.

### World 1 — Desert
- Sky `#2A4C8A`->`#6FA8DC`; rock `#8A5A2B` / `#B5793C` / `#D9A566`; shadow
  `#4A2F14`; accents `#3FAE5A`, `#C0C0C0`.
- Parallax: far dunes/mountains (desat blue-grey, 0.2x), mid mesas (0.5x), near
  rock outcrops.

### World 2 — Submerged Dungeon
- Water `#0E2E3E`->`#1B5E7A`; rock `#2C3A45` / `#455A64`; bioluminescent
  `#39D0C8` / `#7CF9E6`; hazard glow `#B23A48`.
- Parallax: far water column w/ light shafts, mid stalactites, near dripping
  rock. Caustic overlay + bubble particles.

### World 3 — Corridor
- Void `#05060F`; metal `#3A3F5C` / `#5C6486` / `#8892C4`; thruster `#FF6B35` /
  `#FFD23F`; neon hazard `#E040FB`.
- Parallax: twinkling starfield far, streaking tunnel panels mid, girders near.
  Fast scroll to sell velocity (esp. 3-3).

### World 4 — Walker Factory
- Metal `#3E3E46` / `#57575F` / `#7A7A85`; warning stripes `#F2C037` on
  `#1A1A1D`; hot machinery `#FF4D2E` / `#FFB347`; screens `#2EC4E0`.
- Parallax: dim machine hall far, animated gears/pistons mid, pipes/conveyors
  near. Steam + spark particles.

### World 5 — Alien Ship
- Biomech `#1B1420` / `#2E2233` / `#463349`; flesh `#7A2E3B` / `#B23A5A`;
  bio-glow `#8FD14F` / `#C6FF6B`; egg/ichor `#D9C7B0`.
- Parallax: cathedral ribcage silhouettes far, dripping organic walls mid,
  bone/tendon near. Heartbeat-synced pulsing glow + fog.

---

## 6. Audio (ORIGINAL composition + SFX)

> Compose ORIGINAL chiptune/synth music in the style of the multi-channel Amiga
> era. **Do not reproduce any melody from the original score.** Reference only
> the mood.

| Track | Context | Style (original) |
|-------|---------|------------------|
| Title theme | Menu/intro | Anthemic, heroic soaring lead over driving bass; build to a triumphant hook |
| W1 Desert | Platform | Adventurous, mid-fast, bright, propulsive bass |
| W2 Submerged | Platform | Dark, echoey, mysterious; watery pads, reverb tails |
| W3 Corridor | Shmup | High-energy fast arpeggios, relentless adrenaline drive |
| W4 Factory | Platform | Mechanical, percussive, metallic industrial groove |
| W5 Alien Ship | Platform | Eerie, dissonant; heartbeat kick, screech FX, sparse tension |
| Boss | Boss fights | Intense, urgent, minor key, heavy percussion |
| Victory/ending | Post-final | Triumphant major-key reprise of title hook |
| Game over | Death-out | Short somber sting |

**SFX:** weapon fire (per weapon), power-line loop, morph in/out, mine drop +
explosion, freeze activation, jump, land, player damage/death, enemy hit,
enemy explosion (small/large), boss hit, boss explosion (big/multi-stage),
pickups (weapon/upgrade/diamond/1-UP/shield), extra-life jingle, low-time
warning beep, W2 underwater ambience, W4 machinery loop, W5 heartbeat/screech
ambience, menu move/select, stage-clear fanfare.

Ducking: lower music under boss/large SFX. Loop world themes seamlessly.

---

## 7. DECISIONS log

> Append decisions here as they are made during the build. Start empty.

_(none yet)_

Open items to resolve early (candidates for DECISIONS):
- Weapon-upgrade persistence model (per-weapon persist vs shared reset).
- Death penalty (drop one level vs reset to L1).
- Exact per-stage timer seconds; number of continues; starting lives.
- Whether to add coyote-time/jump-buffer (recommended yes).

---

## 8. Asset provenance

All sprites, tiles, palettes, music, and SFX in this project are **original
works created for this tribute**. No ROM data, ripped graphics, ripped audio,
or reproduced compositions from the original game are used. Public references
(Wikipedia, Turrican Fandom Wiki, C64-wiki, Kyzer map archive, HG101,
amigareviews) informed structure, theme, and mechanics only — see
`notes/research/` for the sourced facts.
