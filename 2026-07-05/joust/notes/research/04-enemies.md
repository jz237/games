# JOUST (Williams, 1982) — Enemy Riders Research Note

Scope: the three enemy buzzard-riders (Bounder, Hunter, Shadow Lord) — point values, AI/behavior, wave appearance, spawn mechanics, unseat/egg behavior, plus the pterodactyl and the 1988 Amiga port. Prioritizes the **6809 ROM disassembly** (synamaxmusic/joust, which byte-matches the original ROM for ROMs 1–6) over wikis.

> **Category legend:** (rom) = exact ROM constant from disassembly; (fact) = well-known gameplay fact; (approx) = reasoned approximation; (meas) = measured/observed.

---

## 1. The three riders

| Rider | Color | Points | AI label in ROM | Behavior |
|---|---|---|---|---|
| **Bounder** | Red | **500** (rom) | `BOUNDR` @3787 | Weakest. Semi-random flight, loosely reacts to player. Gentlest vertical seek. |
| **Hunter** | Grey / silver | **750** (rom) | `B2UNDR` ("ADVANCED BOUNDAR (HUNTER)") @3971 | Actively pursues to collide. ~2× stronger vertical correction than Bounder. |
| **Shadow Lord** | Dark blue | **1500** (rom) | `SHADOW` @4230 | Toughest. Fast, flies high, actively climbs **above** the player to win jousts; flaps constantly. |

All three ride identical giant-buzzard mounts; **rider color** is the type indicator. (fact)

**Point-value conflict (logged):** The ROM's own attract/"lesson" text (`JOUSTRV4.ASM` lines 71–73) reads `BOUNDER (500)`, `HUNTER (750)`, `SHADOW LORD (1500)`. Wikipedia, Joustmaster, and the classicgaming walkthrough all say **Shadow Lord = 1000**. **I trust the ROM: 1500.** The 1000 figure is almost certainly a conflation with the *capped max egg-collection value* (also 1000). Sources: [disassembly](https://github.com/synamaxmusic/joust/blob/main/JOUSTRV4.ASM), [classicgaming walkthrough](https://classicgaming.cc/classics/joust/walkthrough), [Wikipedia](https://en.wikipedia.org/wiki/Joust_(video_game)).

### AI differences (from ROM tuning constants)
The three brains share a "select target player → seek vertically (long/short range) → flap" structure. What differs are the `DYWORD` dynamic-adjust constants (they also **ramp up** as the game progresses):

| Constant | Bounder | Hunter | Shadow Lord | Meaning |
|---|---|---|---|---|
| Down-velocity cap | `BODNVY` $0080→$0100→$0200 (cap $0300) | `HUDNVY` $0100→$0200→$0300 (cap $0380) | — | how hard it dives (rom) |
| Up-velocity (climb) | gentle | moderate | `SHUPVY` $FFF0→$FE00→$FD00 (cap **$FC00**, hardest climb) | how hard it flaps upward (rom) |
| Seek range | `BODNRG` $000E | `HUDNRG` $000F | `SHDNRG`/`SHUPRG` **$0014** (largest) | how far away it reacts (rom) |
| Decision cadence | — | — | `SHUPTM` $14→**$02** | Shadow Lord decides faster over time (rom) |

This is the ROM proof of designer Bill Pfutzenreuter's stated intent: "Shadow Lords… fly higher when close to the protagonist to increase the Shadow Lord's chances of victory." Source: [Wikipedia](https://en.wikipedia.org/wiki/Joust_(video_game)); constants `JOUSTRV4.ASM` @7313–7331.

---

## 2. Waves — when each type appears & how many

Wave data lives in a 4-byte-per-wave table (`WTBL`, `JOUSTRV4.ASM` @2437–2546), running waves 0–80 then **repeating from `WTBRST` (wave 81)**. Encoding (rom):

- **Byte 1** = Bounders (high nibble) | Hunters (low nibble)
- **Byte 2** = Shadow Lords (high nibble) | Pursue/aggression `WPERSUE` (low nibble, 0–F — **NOT a literal enemy count**)
- **Byte 3** = # Pterodactyls
- **Byte 4** = status bits (early-pursue flag, JSR-table offset, which platforms/cliffs are removed)

### Decoded composition (from the ROM table)
| Wave | Bounders | Hunters | Shadow Lords | Pterodactyls |
|---|---|---|---|---|
| 1 | 3 | – | – | – |
| 3 | 6 | – | – | – |
| 4 | 3 | 3 | – | – |
| 8 | – | 6 | – | **1** |
| 14 | – | 8 | – | – |
| 15 | – | 6 | – | – |
| **16** | – | 5 | **1** ← first Shadow Lord | – |
| 18 | – | 5 | 1 | 2 |
| 19 | – | 4 | 2 | – |
| 21 | – | 3 | 3 | – |
| 22 | – | 2 | 4 | – |
| 26 | – | 3 | 5 | – |
| 36 | – | 2 | 6 | – |
| 41 | – | 3 | 7 | – |

- **Waves 1–15: only Bounders & Hunters** (Bounder-heavy early → Hunter-heavy by ~wave 8). (rom, corroborated by [walkthrough](https://classicgaming.cc/classics/joust/walkthrough))
- **Shadow Lords first appear wave 16**, then more are added each wave until later waves are nearly all Shadow Lords. (rom)
- **Every 5th wave (5,10,15,20,25…) is an "egg wave"** with no Shadow Lords by design.
- Total riders per wave is typically **4–8**; each rider can lay up to **4 eggs** (`WCREATE` @2184: "MAXIMUM NUMBER OF EGGS TO LAY" = 4).

> ⚠️ **Do not misread the WPERSUE low-nibble** (values up to `F`=15 in waves 16+) as an enemy count — it's the *aggression/pursuer* variable (`WSMART`/`NSMART`), max 15.

---

## 3. Spawn mechanics (transporters / spawn pads)

Enemies and respawning players emerge from **4 fixed transporters** (`CREEM` @5663; `GOTR1–GOTR4` @5680–5700), labeled in the ROM as:
- **TR1** – top-most
- **TR2, TR3** – two middle
- **TR4** – bottom

The `CREEM` routine random-selects a free transporter, then materializes a new buzzard mount there (grey "transporter effect", ~30-frame emerge animation). Corroborated by the [walkthrough](https://classicgaming.cc/classics/joust/walkthrough) ("four spawn points").

---

## 4. Unseating a rider → egg → tier escalation

When a joust is resolved, **the higher rider wins**; the loser is unseated. `DEATH3` @2955 (rom):

1. An **egg** (`EGGID`) is spawned at the rider's position, inheriting its velocity, and falls under gravity.
2. **The egg's AI is bumped up one tier before it hatches** (@2986–2990): `CMPD #P6DEC` / `ADDD #P4DEC-P3DEC`. So **Bounder → Hunter → Shadow Lord**, and a **Shadow Lord egg stays a Shadow Lord** (capped at `P6DEC`).
3. The riderless buzzard flies off-screen; later a fresh mount swoops in to re-mount the hatched rider.

This is the ROM confirmation of the classic "leave an egg and it hatches into something nastier" escalation.

### Egg scoring (rom, `EGGVAL` @3097)
`FCB $52 ;250 / $05 ;500 / $57 ;750 / $10 ;PEG AT 1,000` →
**250 → 500 → 750 → 1000 (capped at 1000)**, counter increments per egg collected. Matches the [walkthrough](https://classicgaming.cc/classics/joust/walkthrough) exactly.

**Mid-air catch bonus: +500** (rom, `EGGSCR` @3062–3069, `PFEET` flag; and `DEATH3` @2985 comment "(500 PTS. BONUS)"), on top of the escalating value.

---

## 5. Pterodactyl (for completeness)

- **1000 points** (rom, `P7DEC` scores via `SCRHUN #$0A`).
- First appears **wave 8, then ~every 5th wave** (8, 13, 18, 23…), 1–3 at a time in higher waves (byte 3 of the wave table). (rom + [walkthrough](https://classicgaming.cc/classics/joust/walkthrough))
- Vulnerable only when its **beak is open** — must be lanced frontally in the open mouth. Speeds up / climbs when the player camps at platform edges (anti-idle). (fact)

---

## 6. Amiga port (1988)

- **Publisher: Atari (Games); conversion: Rugby Circle Inc.** (medium)
- [The Games Machine #10 (Sep 1988)](http://amr.abime.net/review_47235) scored it **71%**, £14.99.
- Added **sampled/digitized sound** and reworked Amiga sprite art at Amiga resolution (vs the arcade's ~292×240 Williams raster); **core gameplay unchanged**. (medium — full review text not retrievable; audio/art specifics inferred from era-typical Amiga conversions + metadata.)
- See also [Lemon Amiga](https://www.lemonamiga.com/games/details.php?id=4299).

---

## 7. For the remake — concrete numbers to implement

| Thing | Value |
|---|---|
| Bounder / Hunter / Shadow Lord kill points | **500 / 750 / 1500** |
| Pterodactyl points | **1000** |
| Egg collect (escalating, per wave) | **250 → 500 → 750 → 1000** (cap 1000) |
| Mid-air egg catch bonus | **+500** |
| Shadow Lords first appear | **wave 16**; +~1 every few waves after |
| Waves 1–15 | Bounders + Hunters only |
| Egg waves | every 5th (5,10,15,20,25…), no Shadow Lords |
| Riders per wave | ~4–8; each can lay up to 4 eggs |
| Spawn pads | **4 transporters** (top / mid / mid / bottom), random free pad |
| Unseat behavior | falling egg → hatches **one tier up** (cap Shadow Lord); new buzzard re-mounts |
| Pterodactyl schedule | wave 8, then ~every 5th wave; kill only via open beak |

**AI recipe (single shared brain, three presets — all "seek player vertically, flap toward target"):**
- **Bounder:** weak/semi-random, gentle vertical correction, small seek range, slow decisions.
- **Hunter:** actively chases to collide, ~2× vertical correction, slightly larger range.
- **Shadow Lord:** fast; *always tries to climb above the player*; strongest upward flap, largest seek range, fastest decision cadence.
- Optionally ramp each preset's aggression/speed slightly with wave number (mirrors the ROM `DYWORD` dynamic-adjust tables).

---

### Sources
- **Primary:** [synamaxmusic/joust 6809 disassembly — JOUSTRV4.ASM](https://github.com/synamaxmusic/joust/blob/main/JOUSTRV4.ASM) (byte-matches original ROM for ROMs 1–6) — used for all point values, wave table, AI constants, spawn/egg logic.
- [classicgaming.cc Joust walkthrough](https://classicgaming.cc/classics/joust/walkthrough)
- [Wikipedia: Joust (video game)](https://en.wikipedia.org/wiki/Joust_(video_game))
- [Joustmaster wiki](https://joustmaster.com/joust-wiki/)
- [The Games Machine #10 Amiga review](http://amr.abime.net/review_47235) · [Lemon Amiga](https://www.lemonamiga.com/games/details.php?id=4299)
