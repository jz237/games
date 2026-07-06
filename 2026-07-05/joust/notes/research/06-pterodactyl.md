# Joust (Williams, 1982) — The Pterodactyl

Research note for a faithful browser remake. Primary source is the **6809 ROM disassembly** (`synamaxmusic/joust`, `JOUSTRV4.ASM` — the final "Rev 4 / green" ROM, rebuildable to the original binary). Where the ROM gives an exact constant it is marked **[ROM]**; observed/player-facing figures are **[obs]**; well-known facts **[fact]**; reasoned approximations **[approx]**.

> ⚠️ The disassembly is the **fixed (green/V4)** ROM. The famous "pterodactyl bug" lived in the earlier **red/yellow** ROMs; V4 added `PATCH4`–`PATCH9` specifically to kill the camp-farm. Comments in those patches let us reconstruct the old behavior.

---

## 1. What the pterodactyl is for (design intent)

John Newcomer designed the pterodactyl **to stop players idling/camping** and to be **very hard to kill**; its only weakness is its **open mouth during a specific animation frame**, and it **jerks upward at the last moment** when a player waits at a platform edge. **[fact]** — [Wikipedia](https://en.wikipedia.org/wiki/Joust_(video_game))

The ROM implements exactly this: pterodactyls used as anti-dawdle enemies are internally called **"baiters"** ("BAITER TYPE PTERODACTYLS"), and `PATCH4`'s comment reads *"ADJUST PTERODACTYL TO HIT PLAYER IN THE LEGGS (PREVENT PLAYER FROM STANDING ON CLIF4 AND KILLING MY PETS)"*. **[ROM]**

---

## 2. Spawn trigger — the anti-camping timer

There are **two** ways pterodactyls appear:

### (a) Scheduled "pterodactyl waves" [ROM]
From `WAVTBL` (each wave row's **3rd byte = pterodactyl count**), with comments literally naming the waves:

| Wave | Ptero count |
|-----:|:-----------:|
| 8  | 1 |
| 13 | 1 |
| 18 | 2 |
| 23 | 2 |
| 28 | 2 |
| 33 | 2 |
| 38 | 2 |
| 43 | 3 |
| 48, 53, … | 3 |

So: **wave 8 first, then wave 13, then every 5th wave** (18, 23, 28, …), ramping **1 → 2 → 3** pterodactyls, **capped at 3**. — `JOUSTRV4.ASM` `WAVTBL` (~lines 2439-2545)

### (b) Anti-dawdle "baiter" timer — appears on ANY wave [ROM]
Core loop `EMY2` runs a countdown `CBAIT`, reloaded from **`BAITBL`**; each entry is `N*60/8` counts decremented once per 8 frames ⇒ **N seconds** of real time. Reading from `BWAV1` (first baiter of a normal wave):

```
BWAV1  = 60 s   (first pterodactyl)
BWAV2  = 45 s   (+45 s)
BWAVN  = 30 s   (+30 s)
         15 s
         15 s
          7 s
          5 s
          3 s
          1 s   ← then every +1 s
          1 s …
```
**"ONLY ALLOW 3 BAITERS ON THE SCREEN"** — max 3 concurrent. **The longer you camp, the faster and more they come.** — `JOUSTRV4.ASM` `EMY2`/`BAITBL` (~2094-2169)

**Cross-check:** `PATCH7` comment: *"MAKE BAITERS COME OUT MORE QUICKLY, TYPICAL OLD TIME **4 MIN 16 SEC**, NEW TIME **2 MIN 16 SEC**. VERSION 4."* (60+45+30 = 135 s ≈ 2:15 to reach the 1-per-second frenzy.) **[ROM]**

**Player-facing corroboration:** "at the one-minute mark a pterodactyl comes out, then 30 seconds later another emerges." **[obs]** — [classicgaming.cc](https://classicgaming.cc/classics/joust/walkthrough) (matches the 60→45→30 head of the table).

---

## 3. Invulnerability & the beak/lance kill (exact geometry) [ROM]

The pterodactyl is invulnerable **everywhere except a lance hit aligned to its mouth**, and only when several conditions hold simultaneously. From the `OSTHIT` collision resolver, "PTERODACTYL VS. PLAYER" branch (~lines 4952-5001):

1. **Lance-to-mouth vertical alignment.** The code computes the player's lance line relative to the pterodactyl and "fudges" it to the mouth center, with the window **depending on the pterodactyl's flap frame**:
   - **Wings-up / attacking frame** (`PIMAGE > FLY2-FLY1`): fudge `15-7 = 8` px, kill if `|delta| <= 3` — comment *"WITHIN 7 PIXELS"*.
   - **Wings-down frame**: fudge `15-5 = 10` px, kill if `|delta| <= 2` — comment *"WITHIN 5 PIXELS"*.
   
   ⇒ effectively a **~2–3 pixel vertical sweet spot** on the mouth. This is the "2 or 3 pixel" hitbox strategy guides describe. **[ROM]** / **[fact]** ([StrategyWiki](https://strategywiki.org/wiki/Joust/Walkthrough))
2. **Facing opposite directions** — `PFACE,U EOR PFACE,X` must be positive, else *"CANNOT KILL PTERODACTYL"*.
3. **Player facing INTO the pterodactyl** (toward the beak). If the pterodactyl is on the right, the player must face right, and vice-versa.

If any condition fails, control falls to `OSTBO` → the normal "highest lance wins" comparison, and since the pterodactyl is treated as effectively unbeatable in a body check, **the player dies / is bounced away** (`OSTPYP` "BOUNCE KILLER AWAY FROM PTERODACTYL").

**Note on "open vs closed mouth":** Wikipedia/Newcomer say **open mouth**; some guides say "beak closed." The ROM has **no open/closed flag** — vulnerability is **frame-selected**: the wings-up/attacking frame gives the *wider* (±3px) window. Treat the attack frame as the vulnerable one. **(conflict logged)**

Other AI constants: attack commit window **±13 px in X** (`PTEATK`); `PATCH8` delays the first swoop 138 units so the **first pass deliberately misses** to telegraph the threat. `PTEID = $17` (live pterodactyl id = `$97`). **[ROM]**

---

## 4. Point value [ROM]

The pterodactyl decision block `P7DEC` ends with `FCB WHI*$11,$10,MSGAMO`: `DVALUE = $10`, passed to `SCRHUN`, which adds BCD **thousands/hundreds** ⇒ **1000 points**, drawn in **white**. Corroborated by every strategy guide. **[ROM]** + **[fact]**

---

## 5. Death behavior [ROM]

On a valid mouth-kill (`DEATH4`):
1. Play dying scream `SNPTED`.
2. **Death "dance"**: `PTEKLL`/`PTEKL2` flip between `FLY2`/`FLY3` frames and flip facing over an 8-count.
3. **Ashes**: 3-frame `PTEASH` animation (`ASH1R`) that falls toward the **nearest cliff** (`CLIFER`).
4. Float the **1000** score in white (`MSGTH1`, `PTC` color) via `SCRAIR`.

At **wave end / timeout** (`PTEOFF`) the pterodactyl heads to **one of three fixed tracking lines** (`AOFFL1/2/3`) and exits the screen edge — a skilled player can intercept it on whichever line it chose. **[ROM]** + **[obs]** ([classicgaming.cc](https://classicgaming.cc/classics/joust/walkthrough)).

---

## 6. The "wave" high-score technique / pterodactyl bug [fact]

- Present in **RED & YELLOW** ROMs; **removed in GREEN** (Rev 4). — [Sean Riddle](https://seanriddle.com/ptero.html), [mikesarcade](https://www.mikesarcade.com/cgi-bin/spies.cgi?action=url&type=info&page=robocheat2.txt)
- **Method:** on a wave with the **center platform** and the **lava troll** active, kill all enemies but one hunter, fly low so the troll grabs him, then stand mid-center-platform and **point at incoming baiter-pterodactyls** — they fly straight into your lance for **1000 each**, indefinitely.
- **Why V4 killed it:** `PATCH4` (aim for the legs, not catchable from a high platform), `PATCH6` (skim upper cliff then dive), `PATCH8` (first pass misses), `PATCH5`/`PATCH9` (slow-down/accounting) — collectively make baiters attack the legs and **jerk upward at the platform edge**, exactly the behavior Newcomer described.

---

## 7. Hardware/timing context (MAME) [fact]
Williams 6809 hardware runs at **~60 Hz**; every ROM timer is in 60ths (`#15*60` = "15 SECONDS", `PCNAP` counts, `N*60/8` baiter table). **MAME emulates the hardware**; the gameplay constants above live in the ROM, not MAME. — [MAME williams.cpp](https://github.com/mamedev/mame/blob/master/src/mame/midway/williams.cpp)

## 8. Amiga port [low-confidence]
**Could not confirm an official 1988 commercial Amiga Joust.** Only a **2012 homebrew** Amiga port (reverse-engineered from the Atari ST version by Philippe Guichardon) is documented. — [Lemon Amiga](https://www.lemonamiga.com/games/details.php?id=4299). Flagged as an open question.

---

## For the remake — concrete numbers to implement

- **Score:** pterodactyl = **1000** (white pop-up).
- **Tick base:** 60 fps; express all timers in frames.
- **Scheduled pterodactyl waves:** 8 (×1), 13 (×1), then every 5th wave; count ramps 1→2 (wave 18) →3 (wave 43+), **cap 3**.
- **Anti-dawdle baiter timer (every wave):** first pterodactyl at **60 s** of stalling, then **+45, +30, +15, +15, +7, +5, +3, then +1 s repeatedly**; **cap 3** on screen. (≈2:15 to reach 1/second.)
- **Kill rule:** invulnerable unless — (1) player & pterodactyl face **opposite** directions, (2) player faces **into** the pterodactyl, and (3) lance line within **±3 px** of mouth (attack/wings-up frame) or **±2 px** (wings-down frame) of mouth-center. Else the pterodactyl kills the player.
- **AI:** baiters aim for the **legs**, first swoop **misses**, and they **pull up** at platform edges (V4 behavior) — do **not** ship the red/yellow farm bug unless you deliberately offer a "classic bug" mode.
- **Death:** scream → flap death-dance → ashes fall to nearest cliff → 1000 pop-up.
- **Exit:** at wave end the pterodactyl leaves on **one of 3 fixed height lines**; allow interception.

### Primary sources
- **[synamaxmusic/joust — JOUSTRV4.ASM (6809 ROM disassembly, final/green ROM)](https://github.com/synamaxmusic/joust)** — the authoritative constants.
- [Sean Riddle — The Pterodactyl Bug](https://seanriddle.com/ptero.html)
- [mikesarcade — Joust ROM correction (red/yellow/green)](https://www.mikesarcade.com/cgi-bin/spies.cgi?action=url&type=info&page=robocheat2.txt)
- [MAME williams.cpp](https://github.com/mamedev/mame/blob/master/src/mame/midway/williams.cpp)
- [StrategyWiki/Joust Walkthrough](https://strategywiki.org/wiki/Joust/Walkthrough) · [classicgaming.cc Joust Walkthrough](https://classicgaming.cc/classics/joust/walkthrough) · [Wikipedia: Joust](https://en.wikipedia.org/wiki/Joust_(video_game)) · [AtariAge: beating the pterodactyl](https://forums.atariage.com/topic/243719-how-to-beat-the-pterodactyl-in-joust/)
