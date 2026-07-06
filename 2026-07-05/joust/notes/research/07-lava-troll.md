# Joust (Williams, 1982) — Lava Troll: Grab, Escape & Lava Death

**Primary source:** annotated 6809 ROM reconstruction `synamaxmusic/joust` (`JOUSTRV4.ASM`, 8140 lines). MAME emulates this same 6809 ROM, so the gameplay constants below are the *actual ROM values*, not observed approximations. Frame constants convert at **60 fps** (the ROM's own comments confirm: `30*60` is labelled "30 SECOND", `#90` is labelled "1 1/2 SECOND").

Categories: **[ROM]** exact ROM constant · **[FACT]** well-known gameplay fact · **[APPROX]** reasoned approximation.

---

## 1. When the Lava Troll appears

- **[ROM]** Wave init (`JOUSTRV4.ASM` ~L952-961): `TBRIDGE=#3` ("wave nbr to destroy bridge"), `TTROLL=#1` ("number of waves after bridge destroy till troll comes out"). The lower platform/bridge over the lava burns on **wave 3**; the troll is active from **wave 4 onward**.
- **[FACT]** StrategyWiki agrees: bridge burns in stage 3, "from wave 4 onwards a lava troll appears." Confirms the ROM.
- **Conflict:** some casual fan pages say "wave 5." **Trust the ROM: wave 4.**
- **[ROM]** Only **one** hand at a time: `LAVNBR` counts active trolls; `LNDB7` won't spawn a new one while `LAVNBR != 0`.

## 2. How the hand grabs (LAVAT1 / LT1HT / LT1GRP)

- **[ROM]** The hand spawns at the floor (`FLOOR-9`) under a bird that flies low, tracks the victim's **X** continuously, and extends **upward through 6 animation frames** (`PFRAME` 0 → `5*6`, +6 per step, timed by `LAVTIM`).
- **[ROM]** Once fully extended it matches the victim's **Y** (`LT1HT`, offset `#10-7`); when heights line up it **grips** (`LT1GRP`) and plays sound `SNTROL`.
- **[ROM] Reach zone** (`LAVVIC` L1711-1731): victim must be **low enough** (`PPOSY+1 >= FLOOR+7-32`, i.e. within ~32 px of the floor) **and** within the lava X-span (`PPOSX` roughly `54-14` … `240`, the CLIF5 bounds). Above that line or outside that X window → out of reach, hand retracts.
- **[ROM]** `FLOOR = $00DF` (223 decimal) is the lowest game position (the lava surface line).

## 3. The grab & the escape — a velocity tug-of-war (NOT a flap counter)

This is the key mechanic and the most misreported one.

- **[ROM]** On grip, the victim's gravity handler is **swapped**: `PADGRA <- ADDLAV` (from normal `ADDGRA`). `ADDLAV` (L6608) zeroes X velocity ("the player is not going anywhere"), then each frame adds **`CLVGRA`** (the troll's pull) to `PVELY`.
- **[ROM] Break-free threshold** (L6616): `CMPD #-$0180 ; BREAK FREE VELOCITY?` → `BLT ADLFRE`. If the bird's **net Y velocity is more upward than -$0180** (= -384 in 8.8 fixed-point ≈ **1.5 px/frame upward**), it **breaks free** (`ADLFRE`), the hand drops (`LT1DRP`), gravity reverts to `ADDGRA`, and the player scores **50 points** (`LDA #$50 ; SCORE 50 POINTS FOR BREAKING FREE`, L6668).
- **[ROM] Each flap** (`ADDFLP` L6429): adds a fixed upward impulse to `PVELY` (`SUBD #96` → ≈ **-0.375 px/frame** per flap in 8.8). So **rapid flapping** accumulates upward velocity; when it out-paces the pull and crosses -$0180 you escape. There is **no discrete "N flaps" constant** — wikis saying "press flap repeatedly" are directionally right but there is no fixed count.
- **[ROM] The pull strengthens over time** (`PATCH1`/`PATCH2` L6374-6396): on grab, `LAVKLL = 30*60 = 1800` frames (**30 seconds**) and `CLVGRA = LAVGRA` (starting pull). After that 30 s countdown, `CLVGRA` **increments by 1 each check up to a maximum of `$500`** ("MAXIMUM LAVA TROLL GRAVITY"). So a bird that lingers gripped becomes progressively harder, then impossible, to free.
- **[ROM] Death while gripped** (`ADDLAV` L6620): if the dragged bird reaches `FLOOR+7`, the grab routine jumps to `LT2DIE`/`ADGFLR` → suicide. Full submersion animation checked at `FLOOR+20`.

**Summary of the loop:** low bird → hand rises (6 frames) → grip (sound) → gravity becomes downward pull `CLVGRA` → player flaps to build upward `PVELY` → **escape if `PVELY < -$0180`** (+50 pts) **else** dragged to `FLOOR+7` and **dies**. Pull auto-strengthens after 30 s.

## 4. Does it grab enemies?

- **[ROM]** **Yes.** `LNDB7` spawn check (L6769-6773) accepts both `#$80+PLYID` (player) and `#$80+EMYID` (enemy). The hand grabs enemy buzzard-knights too and can drag them in.
- **[FACT]** The classic **exploit**: park an enemy permanently in the hand from a center ledge and farm pterodactyls endlessly; Williams shipped a corrected ROM to operators to curb the resulting inflated scores (joustmaster, Wikipedia).

## 5. General lava death (no troll needed)

- **[ROM]** Touching the lava surface kills regardless of the troll. `FLOOR=$DF`; the floor-clip / gravity code (`ADGCEI`/`ADGFLR`, `ADDLAV`) treats a bird that reaches `FLOOR+7` as "in the lava" and kills it, with the submerge point at `FLOOR+20`.

## 6. Hardware / timing

- **[FACT]** Williams 6809 arcade hardware (MAME `src/mame/midway/williams.cpp`) runs at **~60 fps**. The ROM's own labels corroborate (30*60 = "30 SECOND"; 90 = "1 1/2 SECOND"). Use 60 fps to turn every frame constant above into seconds.

---

## For the remake — concrete numbers to implement

Model the grab as **gravity-swap + velocity race**, not a button-mash meter:

| Mechanic | Value (from ROM) | Remake units (60 fps, px/frame) |
|---|---|---|
| First appears | Wave 4 (bridge burns wave 3) | gate on wave >= 4 |
| Hands active at once | 1 (`LAVNBR`) | cap at 1 |
| Hand extend time | 6 frames | ~0.1 s rise animation |
| Reach zone Y | within ~32 px of floor | trigger when bird bottom is near lava line |
| Reach zone X | ~40 … 240 px | lava span only |
| Break-free velocity | `-$0180` (8.8) | **1.5 px/frame upward** |
| Per-flap impulse | `96` (8.8) | **~0.375 px/frame up** per flap → ~4+ quick flaps to cross threshold from rest |
| Pull start | `LAVGRA` (≈$0004+, difficulty-scaled) | small downward accel |
| Pull hardening | after 30 s (`1800` frames), +1/frame → max `$500` | ramp pull up sharply after 30 s |
| Escape reward | `#$50` = 50 pts | award 50 |
| Death line | `FLOOR+7` (`FLOOR=$DF`) | instant kill on lava contact |
| Grabs enemies | yes (PLYID + EMYID) | let it grab enemies too |
| Sound | `SNTROL` on grip | play troll grab SFX |

**Feel target:** a bird caught early can be saved with a burst of rapid flapping (net upward velocity beats the pull and crosses ~1.5 px/frame up → free, +50 pts). Wait too long (30 s+) and the strengthening pull ($500 cap) makes escape hopeless — it drags you to the floor line and you die.

---

### Sources
- **Primary (ROM):** https://raw.githubusercontent.com/synamaxmusic/joust/main/JOUSTRV4.ASM — LAVATC/LAVAT1/LT1HT/LT1GRP (~L1600-1770), ADDLAV/ADLFRE (~L6608-6696), PATCH1/PATCH2 (L6374-6397), LNDB7 spawn (L6764-6793), wave init (L952-961), FLOOR EQU (L37). Repo: https://github.com/synamaxmusic/joust
- **Hardware:** https://github.com/mamedev/mame (`src/mame/midway/williams.cpp`)
- StrategyWiki: https://strategywiki.org/wiki/Joust/Gameplay , https://strategywiki.org/wiki/Joust
- joustmaster wiki: https://joustmaster.com/joust-wiki/
- Wikipedia: https://en.wikipedia.org/wiki/Joust_(video_game)
- KLOV / Museum of the Game: https://www.arcade-museum.com/Videogame/joust
