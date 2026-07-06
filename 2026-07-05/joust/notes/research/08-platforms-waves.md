# Joust (Williams, 1982) — Platforms, Erosion & Waves

Research note for a faithful browser remake. **Primary sources**: the leaked original 6809 game source (`historicalsource/joust`, file `JOUSTRV4.SRC`) and Sean Riddle's reverse-engineered wave table. Secondary: classicgaming.cc walkthrough, MAME driver (hardware only). Every numeric constant below is tagged by category.

---

## 1. Playfield geometry (the stone ledges + center island + bottom bridge)

The board has **six landable surfaces**. From the ROM landing table (`LNDB0`–`LNDB5`, category = ROM constant), the *top-surface Y* of each (pixels from top of the 240-line playfield):

| ROM name | Role | Y (hex-1) | Y (dec) |
|---|---|---|---|
| CLIF1L / CLIF1R | top-left & top-right pair | `$45` / `$51` | 69 / 81 |
| CLIF2 | upper-right ledge | `$51` | 81 |
| CLIF3R | mid-right step | `$81` | 129 |
| CLIF3L + CLIF3R | **center floating island** (middle) | `$8A` | 138 |
| CLIF4 | left ledge | `$A3` | 163 |
| **CLIF5** | **big bottom platform / bridge over lava** | `$D3` | 211 |

> Source: [JOUSTRV4.SRC LNDB0-LNDB5](https://github.com/historicalsource/joust/blob/main/JOUSTRV4.SRC). CLIF5 is explicitly commented "THE BIG ONE" and is the bottom bridge spanning the lava; the lava troll seeks up to but never above CLIF5 (`CMPB #$D3-1 NEVER SEEK HIM BELOW CLIFF5`).

Sean Riddle's table uses a **different, simpler numbering** for the "Missing Platforms" column: **1 = top-left, 2 = top-right, 3 = top-middle, 4 = center platform** ([seanriddle.com/jwaves.html](https://seanriddle.com/jwaves.html)). The bottom bridge (CLIF5) is never in that column — it is handled separately by the bridge-collapse timer.

The lava floor runs along the bottom; a **lava troll** hand reaches up to grab low-flying mounts once active.

---

## 2. Erosion / burn-away sequence

Two independent mechanisms:

### (a) Bottom bridge collapse + lava troll (time-based, ROM constants)
```
LDA #3      / STA TBRIDGE   ; "WAVE NBR TO DESTROY BRIDGE"
LDA #1      / STA TTROLL    ; "NUMBER OF WAVES AFTER BRIDGE DESTROY TILL TROLL"
... IWAVE2: DEC TBRIDGE / JSR STBRID  ; "START BRIDGE COLAPSING ROUTINE, LEFT TO RT."
```
- **Bottom bridge (CLIF5) burns away entering wave 3**, as a **left-to-right flame sweep** (`STBRID`, flame uses a landing-table offset). Category: ROM constant.
- **Lava troll becomes active one wave later → wave 4** onward. Category: ROM constant.
- classicgaming.cc agrees: "On the 3rd wave the floor burns away. On the fourth and subsequent waves, a troll inhabits the lava pit." *(Consistent — see Conflicts.)*

### (b) Per-wave ledge removal (data-driven bitmask, ROM constants)
Each wave's status byte carries a **cliff-disable mask**:
```
WBCL1L $10   WBCL1R $20   WBCL2 $40   WBCL4 $80
WBCL1 = 1L+1R   WBCL12 = 1+2   WBCL14 = 1+4   WBCL24 = 4+2   WBCLS = 1+2+4 (all)
WBPER  $01  = instant-pursue flag (NOT a platform)
```
The wave table `WAVTBL` applies these; e.g. wave 6 = `WBCL2` (top-right gone), wave 7 = `WBCL12`, wave 9/13/14 = `WBCLS` (all three side ledges gone), wave 12 = `WBCL4` (center gone). This lines up 1:1 with Sean Riddle's "Missing Platforms" column. Category: ROM constant. Sources: [JOUSTRV4.SRC](https://github.com/historicalsource/joust/blob/main/JOUSTRV4.SRC), [jwaves.html](https://seanriddle.com/jwaves.html).

---

## 3. Horizontal torus wrap

```
ELEFT  EQU -10    ; EXTREME LEFT SIDE OF WRAP AROUND SCREEN
ERIGHT EQU 292    ; EXTREME RIGHT SIDE OF WRAP AROUND SCREEN
```
Fly off one edge, reappear on the other. Playfield is ~292 px wide with a ~10 px off-screen margin so sprites cross seamlessly. Category: ROM constant. Source: [JOUSTRV4.SRC lines 38-39](https://github.com/historicalsource/joust/blob/main/JOUSTRV4.SRC). (`FXREV` = "X POSITION'S WRAP DIRECTION".)

---

## 4. Wave types, cycle, and the full table

Types rotate in a **5-wave cycle**, the last of each five always an **Egg wave**:

- **Normal** — standard.
- **Survival / Team** — same slot: **Survival = 1-player**, **Team = 2-player**. Complete without losing a rider → **3,000-point bonus**.
- **Gladiator** — 2-player only; **3,000-point bounty** to the first player to kill the other.
- **Pterodactyl** — pterodactyls spawn from the start (not on the usual buzzard-baiter timer).
- **Egg** — 12 eggs/Bounders to grab before they hatch.

**Milestones** (Riddle): 4 = first Hunter-start · 8 = first ptero · 12 = last Bounders · 16 = first Shadow-Lord-start · 18 = first 2-ptero · 43 = first 3-ptero · 56 = last Hunters. After ~wave 46 a repeating 10-wave enemy cycle runs through wave 90.

**Authoritative wave table (waves 1–30 shown; full 1–90 on [jwaves.html](https://seanriddle.com/jwaves.html)):**

| Wave | Bounders | Hunters | Shadow Lords | Pteros | Missing Platforms | Type |
|--|--|--|--|--|--|--|
| 1 | 3 | 0 | 0 | 0 | None | Normal |
| 2 | 4 | 0 | 0 | 0 | None | Survival/Team |
| 3 | 6 | 0 | 0 | 0 | None | Normal *(bridge burns)* |
| 4 | 3 | 3 | 0 | 0 | None | Gladiator *(troll appears)* |
| 5 | 12 | 0 | 0 | 0 | None | Egg |
| 6 | 3 | 3 | 0 | 0 | 3 | Normal |
| 7 | 2 | 4 | 0 | 0 | 123 | Survival/Team |
| 8 | 0 | 6 | 0 | 1 | 123 | Pterodactyl |
| 9 | 0 | 6 | 0 | 0 | 1234 | Gladiator |
| 10 | 12 | 0 | 0 | 0 | None | Egg |
| 11 | 3 | 5 | 0 | 0 | None | Normal |
| 12 | 2 | 6 | 0 | 0 | 4 | Survival/Team |
| 13 | 0 | 7 | 0 | 1 | 1234 | Pterodactyl |
| 14 | 0 | 8 | 0 | 0 | 1234 | Gladiator |
| 15 | 0 | 12 | 0 | 0 | None | Egg |
| 16 | 0 | 5 | 1 | 0 | None | Normal |
| 17 | 0 | 5 | 1 | 0 | None | Survival/Team |
| 18 | 0 | 5 | 1 | 2 | None | Pterodactyl |
| 19 | 0 | 4 | 2 | 0 | None | Gladiator |
| 20 | 0 | 12 | 0 | 0 | None | Egg |
| 21 | 0 | 3 | 3 | 0 | 12 | Normal |
| 22 | 0 | 2 | 4 | 0 | 12 | Survival/Team |
| 23 | 0 | 2 | 4 | 2 | 124 | Pterodactyl |
| 24 | 0 | 2 | 4 | 0 | 124 | Gladiator |
| 25 | 0 | 12 | 0 | 0 | None | Egg |
| 26 | 0 | 3 | 5 | 0 | 1234 | Normal |
| 27 | 0 | 3 | 5 | 0 | 1234 | Survival/Team |
| 28 | 0 | 2 | 4 | 2 | 1234 | Pterodactyl |
| 29 | 0 | 3 | 5 | 0 | 1234 | Gladiator |
| 30 | 0 | 12 | 0 | 0 | None | Egg |

*(Waves 31–90 continue the same 5-slot pattern with escalating Shadow-Lord counts and 3-ptero waves at 43,48,53,…; see the source for exact rows.)*

---

## 5. Scoring (from ROM `EGGVAL` and message tables)

- **Egg pickup escalation**: 250 → 500 → 750 → 1000 (1st/2nd/3rd/4th), **resets on death or new wave**. `EGGVAL FCB $52,$05,$57` (BCD 250/500/750). Catch an egg in mid-air = +500.
- **Enemy values**: Bounder (red) **500**, Hunter **750**, Shadow Lord **1500** — from ROM strings `ATX6 'BOUNDER (500)'`, `ATX7 'HUNTER (750)'`, `ATX8 'SHADOW LORD (1500)'`.
- **Survival / Team completion (no death)**: **3,000**.
- **Gladiator first-kill bounty**: **3,000**.
- **Pterodactyl kill**: **1,000** (well-attested by strategy sources; exact ROM FCB not yet isolated).
- Up to **3 pterodactyl "baiters" on screen** at once (`CMPA #3-1 ONLY ALLOW 3 BAITERS`).

Sources: [JOUSTRV4.SRC](https://github.com/historicalsource/joust/blob/main/JOUSTRV4.SRC), [classicgaming.cc walkthrough](https://classicgaming.cc/classics/joust/walkthrough).

---

## 6. Banner / intro messages

From the ROM `ATX`/`MSW` message tables (wording per comments; on-screen strings are compressed): `WELCOME TO JOUST`; egg wave `PICK UP THE EGGS / BEFORE THEY HATCH`; ptero wave `PTERODACTYL BEWARE`; lava warning `HOME OF THE / LAVA TROLL`; plus Survival, Gladiator and Team intro banners with "BONUS AWARDED / NO BONUS" variants (`SURV1-5`, `GLAD1-6`, `COOP1-4`). The famous **"PREPARE TO JOUST, BUZZARD BAIT!"** is the cabinet's attract/marquee taunt ([orphanedgames.com](https://www.orphanedgames.com/articles/Bookcast_Articles/joust.html)).

---

## 7. MAME & Amiga port

- **MAME** (`src/mame/midway/williams.cpp`) emulates the Williams 6809 board — use it for video/interrupt/hardware timing only; **gameplay constants live in the ROM/disassembly**, not the C++ driver. [williams.cpp](https://github.com/mamedev/mame/blob/master/src/mame/midway/williams.cpp).
- **Amiga port (~1988)**: reviewed in *The Games Machine* #10 (Sep 1988, ~71%). Detailed change list (resolution, sampled audio, music, sprite art) is **poorly documented** in reachable sources — **low confidence**, flagged as an open question. [amr.abime.net review](http://amr.abime.net/review_47235), [Lemon Amiga](https://www.lemonamiga.com/games/details.php?id=4299).

---

## 8. Conflicts log

1. **Bridge collapse wave** — classicgaming ("3rd wave the floor burns away") vs ROM (`TBRIDGE=3`, collapse on decrement-to-zero). **Consistent** — both = wave 3. Trust ROM.
2. **Lava troll wave** — strategy ("wave 4+") vs ROM (`TTROLL=1` → wave 4). **Consistent.** Trust ROM.
3. **Pterodactyl score** — 1000 (strategy) not yet pinned to a ROM FCB. Medium-high confidence as gameplay fact.
4. **Wave-2 label** — Riddle "Survival/Team" vs ROM "COOP/TEAM/SURVIVE": same slot, mode-dependent. No conflict.
5. **Amiga port credits/specs** — sources silent/contradictory. Low confidence.

---

## 9. For the remake — concrete numbers

- **Torus wrap**: left edge `x = -10`, right edge `x = 292` (scale to canvas, keep ~10 px off-screen bleed).
- **Six colliders**, normalized to a 240-tall playfield: top-left 81, top-right 81, mid-right step 129, **center island 138**, left 163, **bottom bridge 211**.
- **Erosion mask** per wave = bits `{1L=$10, 1R=$20, 2=$40, 4=$80}`; drop matching ledges. Bake directly from Sean Riddle's "Missing Platforms" column (1=TL, 2=TR, 3=mid, 4=center).
- **Bottom bridge**: left-to-right flame collapse **entering wave 3**; **lava troll from wave 4**.
- **Wave types**: 5-slot cycle, every 5th = Egg (12 eggs). Slot order Normal → Survival(1P)/Team(2P) → Pterodactyl → Gladiator → Egg (with per-wave enemy counts from the table).
- **Bonuses**: 3,000 survival-no-death, 3,000 gladiator first-kill; eggs 250/500/750/1000 (reset on death/wave); enemies 500/750/1500; ptero 1000; max 3 pteros on screen.
- **Ptero waves**: first at 8 (1 ptero), 2 pteros from 18, 3 pteros from 43; every 5th wave from 8.
- Bake waves **1–90** from Riddle's table, then loop the wave 81–90 (≈46–55) 10-wave cycle.
