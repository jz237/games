## Joust (Williams, 1982) — Collision Resolution: Research Note

**Scope:** exact rule for who wins/unseats vs. who bounces when two knights collide, the height metric, the equal-height tolerance, the bounce vectors, and 2P player-vs-player resolution. **Primary source is the recovered Williams 6809 assembly source** (synamaxmusic/joust, which reassembles to byte-identical ROMs), corroborated by MAME hardware timing and secondary wikis.

### Sources (by trust)
1. **Williams 6809 source — `JOUSTRV4.ASM`** (assembles to matching ROMs): https://github.com/synamaxmusic/joust/blob/main/JOUSTRV4.ASM — the definitive gameplay logic. Field definitions: https://github.com/synamaxmusic/joust/blob/main/RAMDEF.ASM
2. **MAME hardware driver** `williams.cpp` (frame/CPU timing only): https://github.com/mamedev/mame/blob/master/src/mame/williams/williams.cpp
3. Wikipedia (qualitative rule): https://en.wikipedia.org/wiki/Joust_(video_game)
4. Lemon Amiga (1988 Amiga port / Arcadia Systems): https://www.lemonamiga.com/games/details.php?id=4299

---

### 1. The core rule (from the ROM)
The resolution routine is **`OSTBO`** ("determination of who is killed"), ~lines 5002–5012 of `JOUSTRV4.ASM`:

```
OSTBO   LDB     PLANTZ,U        ; loser-candidate U lance offset (sign-extended)
        SEX
        STD     ,--S
        LDB     PLANTZ,X        ; other knight X lance offset
        SEX
        SUBD    ,S++            ; D = PLANTZ.X - PLANTZ.U
        ADDD    PPOSY,X         ; + X's Y position
        SUBD    PPOSY,U         ; - U's Y position
        BEQ     .1S             ; ==0  -> BOTH ON SAME LEVEL -> BOUNCE
        BMI     OSTXT3          ; <0   -> X is HIGHER -> X wins, U dies
        JMP     OSTPYP          ; >0   -> U is HIGHER -> U wins, X dies
```

So the compared quantity is:

> **effective_height = PPOSY + PLANTZ**, and the knight with the **smaller** value (higher on screen — screen Y grows downward) **wins and unseats** the other.

- **PPOSY** is the object's Y (sprite anchor / top-region). **PLANTZ** ("lantz offset") is normally **0** in flight, so in the common case this is a **pure `PPOSY` comparison** — the rider/sprite Y, not a separate lance-tip pixel.
- PLANTZ variants: **+2** when skidding on the ground (`SRCSKP`, "skidding ostrich has a lantz 2 pixels lower"); **0x80** for the pterodactyl ("A VERY HIGH LANTZ (TO KILL PLAYER)") so it always beats a player on contact from a non-mouth hit.

### 2. The "equal" tolerance band — it's ZERO
`BEQ .1S` triggers the bounce only on an **exact integer tie** (`net == 0`, a single pixel). **There is no tolerance band.** Wikis imply a fuzzy "roughly equal" zone; that perception is an emergent artifact of (a) the coarse **~18×20 px** collision box and (b) per-frame position quantization — *not* a coded epsilon. **Conflict logged: trust the disassembly over the wikis.**

### 3. Broad + narrow phase (what counts as "a collision")
Routine **`HITEM`** (~4909–4945):
1. **AABB overlap.** X via `PPOSX`/`PCOLX` (PCOLX = PPOSX + 16 → ~18px wide). Y via `PCOLY1` (bottom) / `PCOLY2` (top); box is **0x14 = 20 px** tall (`PCOLY1 = PPOSY − ~5`, `PCOLY2 = PCOLY1 − 19`).
2. **Pixel-perfect check** (`JSR BPCOL` at `OSTXYP`) with a computed Y offset (max Y diff `$1F`). Only a true sprite overlap (`BCS OSTHIT`) proceeds to resolution.

### 4. Who dies vs. who bounces (routing) — `OSTHIT` (~4952)
`OSTHIT` ANDs the two `PID` bytes and tests bits:
- **Enemy-vs-enemy** and **ptero-vs-ptero** → *no kill*, pure bump (`OSTHT2`/`OSTH11`/`OSTBMP`).
- **Player vs enemy / player vs player / player vs ptero** → run `OSTBO` height test → higher wins, tie bounces.
- Player vs pterodactyl has an extra special case (mouth/lance-line + opposite-facing check, `OSTBO` preamble ~4971–5001) letting a player kill a diving buzzard by spearing its mouth; otherwise the buzzard's `PLANTZ=0x80` wins.

### 5. Bounce vectors (equal height, and all non-kill bumps)
Handled by `OSTUTP`/`OSTXTP` → `OSTXUP`/`OSTXDN` (vertical) and `OSTLR` (horizontal). These write to **one-shot displacement registers** `PBUMPX`/`PBUMPY` and modify velocity `PVELX`/`PVELY`:

**Vertical** (`OSTXUP` upper knight, `OSTXDN` lower):
- Upper knight: `PBUMPY = −2` (nudge up); if it was moving down, `PVELY` is inverted and **halved** (`ASRA/RORB`).
- Lower knight: `PBUMPY = +2` (nudge down); if moving up, `PVELY` inverted and halved.

**Horizontal** (`OSTLR`, ~5110): decided by `COLDX` sign (who's on the right):
- Each knight's `PVELX` is **reversed** with a **−2 slow-down** and `PFACE` flipped to face the shove.
- The other knight receives `PBUMPX ≈ (−vel + 2) / 2` (a half-strength opposite impulse).
- **`COLDX == 0` (perfect center-to-center) → no horizontal bounce** (`OSTNLR`), only the vertical push.

**How bumps are consumed** (position integration, so they're *displacement* not persistent velocity):
- `PBUMPY`: added to `PPOSY` each frame, bled toward 0 by **1 px/frame** (`ADDGRX` ~6495) → a ±2 bump = 2 px separation over 2 frames.
- `PBUMPX`: added to `PPOSX`, bled off up to **3 px/frame** (`WRAPX` ~7272).

Pterodactyl-vs-bird bumps are harder: `PBUMPY = ±5` and `PVELX` reversed & **doubled** (`PTEBRD` ~5203).

### 6. Player-vs-player (2-player mode)
Routine **`PLYCOL`** (~4856) enumerates player/opponent pairs and calls the **same `HITEM`→`OSTHIT`→`OSTBO`** path. In 2P, two humans **can unseat/kill each other** by the identical higher-lance rule; equal height bounces. There is a dedicated "players collide" sound (`SNPTHD`, `.1S` at ~5014) but **no friendly-fire exemption**. (Wikipedia's "players can attack each other" is consistent but omits the mechanic.)

### 7. Hardware / frame reference (MAME)
`williams.cpp`: `MASTER_CLOCK = 12 MHz`; game CPU `MC6809E = MASTER_CLOCK/3/4 ≈ 1.0 MHz`; `set_raw(8 MHz pixel, htotal 512, vtotal 260)` → **refresh ≈ 60.10 Hz**, visible **~292×240** (matches ROM `ERIGHT=292`). ROM playfield bounds: `CEILNG=0x20 (32)` highest, `FLOOR=0xDF (223)` lowest. Physics/collision run once per ~60 Hz frame. *(Note: current MAME path is `src/mame/williams/williams.cpp`; older docs cite `src/mame/midway/`.)*

### 8. Amiga port (secondary)
1988 Amiga Joust was released under **Arcadia Systems** (coin-op-to-Amiga label), with **sampled/digitized audio** and reworked presentation; the core higher-lance rule is unchanged. Exact resolution/sprite/physics deltas were **not confirmed from a primary source** in this pass (open question). Confidence: medium.

---

## For the remake — concrete numbers to implement
- **Height metric:** `effective_y = rider_top_y (+2 while skidding on ground)`. Smaller `effective_y` = higher = **winner**. Screen Y grows downward.
- **Equal test = EXACT tie** (`effective_y_A == effective_y_B`) → both bounce. **Do not add a tolerance band**; let the collision box (~18w × 20h, anchored at sprite top) supply the natural fuzziness. Require actual sprite overlap after the AABB test.
- **Bounce, vertical:** upper knight −2 px over 2 frames + vertical velocity reflected & halved; lower knight +2 px + reflected/halved.
- **Bounce, horizontal:** reverse each knight's X velocity with a small (~2) slowdown, flip facing to the shove direction, give the other knight a half-strength opposite X impulse (bled ~3 px/frame). If centers coincide exactly, **skip** the horizontal bounce.
- **Enemy-vs-enemy & ptero-vs-ptero:** never kill — bump only.
- **Pterodactyl:** treat as always-higher (`PLANTZ=0x80`) except a mouth-spear from the opposite facing direction, which lets the player kill it.
- **2P:** run player-vs-player through the exact same resolver — humans unseat each other by higher lance; equal bounces; no friendly-fire exemption.
- **Timing:** fixed **60 Hz** simulation step so the integer bump/velocity arithmetic reproduces faithfully. Playfield ~**292×240**, ceiling Y≈32, floor Y≈223.
