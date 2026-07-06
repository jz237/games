## Joust (Williams, 1982) — EGG Mechanics Research Note

Scope: egg production, hatch timing (and wave escalation), the hatch→remount sequence, and the egg-point escalation ladder (250/500/750/1000) plus the mid-air catch bonus. Primary source is a faithful, MAME-verified reassembly of the original 6809 ROM (`synamaxmusic/joust`, files `JOUSTRV4.ASM`, `RAMDEF.ASM`, `SYSTEM.ASM`), cross-checked against strategy sources. **Where the disassembly and wikis disagree, the disassembly wins.**

> Category legend: **[ROM]** = exact ROM constant from disassembly; **[HW]** = measured hardware/timing; **[FACT]** = well-known gameplay fact; **[APPROX]** = reasoned approximation.

---

### 1. Egg production (unhorsing)
When a rider is unhorsed, the enemy dies (sound `SNEDIE`, `NENEMY--`) and a new object with ID `$80+EGGID` (`EGGID=$02`) is spawned via `VCUPROC` running the `STEGG` process. The egg inherits the dying enemy's **position and velocity**; the buzzard/mount simply disappears. **[ROM]** (`JOUSTRV4.ASM` ~2955–3010)

### 2. Egg physics: fall, bounce, settle
`ADDEGG` adds variable gravity (`GRAV`) to `PVELY` each frame. On impact the egg **bounces**: vertical velocity is halved and inverted (two `ASRA/RORB` then negate), and horizontal velocity bleeds ±2/frame. The egg is treated as **landed** — and enters the hatch timer (`EGGLND`) — only once downward `|PVELY| < $0020` **and** `PVELX == 0`. If the platform under a settled egg disappears (burning bridge), it falls again. **[ROM]** (`ADDEGG` ~3110+, land test 3200–3235)

### 3. Hatch timing — and it SPEEDS UP in later waves
Once settled, `PJOYT` is loaded from **`EGGWT`** and counted down in the `EGGLND` loop (each pass ≈ `PCNAP 12` at the ~1/60 s scheduler rate). `EGGWT` is a **dynamic difficulty parameter that ramps DOWN across waves** (lower = faster hatch):

| Param | start1 | start2 | start3 | step | floor |
|---|---|---|---|---|---|
| `EGGWT` (normal waves) | `$60`=96 | `$40`=64 | `$20`=32 | −`$02` | `$10`=16 |
| `EGGWT2` (egg waves) | `$5A+4`=94 | `$34+4`=56 | `$1E+4`=34 | −`$04` | `$08`=8 |

So the hatch delay shrinks ~3.5–6× from early to late play. **[ROM]** (DYWORD table 7309–7310, macro 210; `EGGLND` 3224). *This directly contradicts the common wiki claim of a fixed "few seconds" — that figure is only the early-wave value.*

### 4. Hatch → remount sequence (with a kill window)
When the hatch timer hits 0 (and `NENEMY < WENEMY`): **[ROM]** (`EGGLND`/`EGGHCH`/`EGGLLP` 3236–3312)
1. `NENEMY++`; play `SNEGGH` (**egg-hatching sound**).
2. Run the 4-frame hatch animation (`HATCH 1–4`).
3. A **standing, dismounted rider** (little man) is drawn. He is **killable by touch** and still **scores as an egg** at this stage.
4. A **buzzard** (`EMYID`) is spawned at `PVELX = 8` ("MAXIMUM WARP SPEED"), riderless, entering from the **nearer screen edge**, with `PJOY = SEEKE` to fetch the man.
5. `EGGLLP` loops "**UNTIL BUZZARD COMES OR KILLED BY PLAYER**" — i.e. there is a genuine **vulnerability window** between hatch and remount. If the buzzard reaches him, the rider **remounts** and becomes a full active enemy.

Corroboration: classicgaming — *"If the egg hatches, it is still harmless and may also be destroyed (by touch) prior to the new knight mounting the new buzzard."* **[FACT]**

**Tier escalation on hatch:** the egg copies the victim's intelligence (`PDECSN`) and bumps it **one tier harder** (`ADDD #P4DEC-P3DEC`), capped at the hardest (`P6DEC`). So **Bounder→Hunter→Hunter→Shadow Lord→Shadow Lord**. **[ROM]** (2986–2990; enemy labels ATX6/7/8)

### 5. Egg-point ESCALATION ladder (the headline question)
A per-player counter (`EGGS1`/`EGGS2`, indexed via `DEGGS,Y`) increments on each egg/hatchling collected and indexes the **`EGGVAL`** table: **[ROM]** (`EGGSCR` 3030–3104)

```
EGGVAL  FCB $52  ;250   (SCRTEN)
        FCB $05  ;500   (SCRHUN)
        FCB $57  ;750   (SCRTEN)
        FCB $10  ;PEG AT 1,000 (SCRHUN)
```
The counter is capped: *"THE MAGIC MAXIMUM NUMBER IS 4"* — it stops at 1000 and stays there.

**Reset rule (the crux, and a source conflict):** `EGGS1`/`EGGS2` are cleared **only** at:
- game start (907/912),
- **each new wave** — `WNRM` setup (1979–1980),
- **player death** — `DEATH1`/`DEATH2` (4669/4675).

They are **never** cleared on landing or between swoops. So escalation is **cumulative across the whole wave, per player**, resetting at wave change or death.

- ✅ classicgaming agrees exactly: *"This progression starts over once the death of the player or the beginning of another wave."*
- ⚠️ Data Driven Gamer says "per life" only — **incomplete**; the disassembly also resets per wave.
- ⚠️ Informal "per swoop / resets when you touch ground" claims are **wrong** per the ROM.

### 6. Mid-air catch bonus (+500)
Each egg has a `PFEET` flag, `CLR`'d on spawn with the literal comment *"NOT CAUGHT IN THE AIR YET! (500 PTS. BONUS)"*, and set once the egg touches a platform. In `EGGSCR`, if `PFEET == 0` at collection, the code loads `A=$05` and calls `SCRHUN` → **+500 flat**. **[ROM]** (2985; 3062–3069)

- **Settled egg** = escalation value only (250/500/750/1000).
- **Mid-air egg** = escalation value **+ 500**.

### 7. Egg waves
Wave 5 and every 5th wave after are **all-egg waves**: `WAVTBL` flags waves 5,10,15,…; `WAVEGG` seeds ~12 eggs across ledges (`EGLEDG`), with `PWREGA = 2` "premature hatchings" so some hatch early, using the faster `EGGWT2` timer. **[ROM]** (WAVTBL 2443–2545, WAVEGG 2737–2820) / StrategyWiki confirms "twelve eggs."

### 8. Timing base (for translating constants to seconds)
6809E @ 1 MHz; 14-bit video counter reloads to `0x3F00`, 16640 counts in **16.64 ms ⇒ 60.1 Hz**; watchdog wants service within 8 VBLANKs (~133 ms). In-game comment: *"THIS ROUTINE IS SERVICED EVERY 1/60 SEC."* Treat all egg timer constants as **frame counts at ~60 fps**. **[HW]** (seanriddle willhard.html; SYSTEM.ASM 617; robotron-2084 hardware id)

### 9. Amiga port (peripheral to eggs)
1988 Amiga Joust was **Arcadia Systems** (also in *Awesome Arcade Action Pack Vol. 1*), reviewed ~71% in The Games Machine #10. Exact resolution / sampled-audio / music changes **not verified** this pass — low confidence. **[FACT/low]**

---

## For the remake — concrete numbers to implement
1. **Run at 60 fps**; treat every constant below as frames.
2. **Egg-point ladder:** per-player index `c∈{0,1,2,3}` → `[250,500,750,1000]`, `c++` on each collect, clamp at 3. **Reset `c=0` on new wave and on player death only.** No ground/swoop reset.
3. **Mid-air bonus:** +500 flat if the egg hasn't touched a platform yet (`onGround==false`). Stacks on the ladder value.
4. **Hatch delay:** wave-scaled countdown; normal waves start ~96 frames (~1.6 s) and ramp down by ~2/step to a floor ~16 frames (~0.27 s); egg waves faster (~8-frame floor). Tune to feel but preserve the shrink-with-wave curve.
5. **Two-stage hatch:** egg → standing rider (killable, scores as egg) → buzzard swoops in fast from nearer edge → remount into an enemy **one tier harder** (Bounder→Hunter→Shadow Lord→Shadow Lord). Keep a short kill window before remount.
6. **Bounce physics:** gravity each frame; on impact invert+halve vertical velocity, bleed horizontal ±2/frame; consider landed when slow enough and horizontally stopped.

## Sources
- **Primary (ROM disassembly/reassembly):** https://github.com/synamaxmusic/joust — `JOUSTRV4.ASM`, `RAMDEF.ASM`, `SYSTEM.ASM` (labels: EGGVAL, EGGSCR, EGGLND, EGGWT/EGGWT2, EGGS1/EGGS2, WNRM, DEATH1/2, PFEET, WAVEGG)
- **Hardware timing:** https://seanriddle.com/willhard.html · https://www.robotron-2084.co.uk/techwilliamshardwareid.html
- **Strategy corroboration:** https://classicgaming.cc/classics/joust/walkthrough · https://strategywiki.org/wiki/Joust/Gameplay · https://strategywiki.org/wiki/Joust/Walkthrough · http://amigan.1emu.net/kolsen/instructions/joust.html · https://datadrivengamer.blogspot.com/2020/01/game-146-joust.html
- **Amiga port:** https://www.lemonamiga.com/games/list.php?list_company=arcadia-systems · http://amr.abime.net/review_47235
