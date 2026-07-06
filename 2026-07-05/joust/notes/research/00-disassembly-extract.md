# Joust (Williams, 1982) — Disassembly Physics & Gameplay Extract

Source of truth: rebuilt-to-ROM 6809 assembly in
`/home/jez237/.openclaw/workspace/games-source/2026-07-05/joust/notes/joust-src/`
Main file: `JOUSTRV4.ASM` (8140 lines). Supporting: `RAMDEF.ASM`, `EQU.ASM`, `PHRASE.ASM`, `MESSAGE.ASM`, `SYSTEM.ASM`, `JOUSTI.ASM`, `ATT.ASM`.

All line numbers below refer to `JOUSTRV4.ASM` unless another file is named. Quoted ASM is copied verbatim (comments included).

---

## 0. FUNDAMENTAL UNITS & TICK RATE (the foundation for everything)

### 0.1 The movement tick is 60 Hz (16 ms), NOT 4 ms
`SYSTEM.ASM` runs a cooperative process executive. Each process sleeps `PNAP` "nap units"; the executive decrements `PNAP` **once per foreground pass**, and that pass is locked to the 60 Hz video interrupt (video line 240, the 16 ms IRQ). Evidence:

- `EQU.ASM` line 50: `;*CA1 IRQ 240 (16 MS)  (LINE 240)` and line 54 `;*CB1 IRQ 4 MS`. The 4 ms IRQ (`CB1`, counter 0/$40/$80/$C0) exists only for sound/DMA-beam timing.
- `SYSTEM.ASM` line 617: `;*      THIS ROUTINE IS SERVICED EVERY 1/60 SEC AND 2 CONSECTIVE` (the switch debouncer that runs in the main IRQ).
- `SYSTEM.ASM` line 612: `LDD #60*60 ;NBR OF INTERUPTS UNTIL 1 MINUTE` — 3600 game-ticks per minute = **60 ticks/second**.
- `SYSTEM.ASM` NAPTIM (line 223): `STA PNAP,U` sets the nap; `EXEPRI`/`EXESEC` do `DEC PNAP,U` once per exec sweep, waking the process when it reaches 0.

**Conclusion: 1 NAP unit = 1 frame = 1/60 s ≈ 16.67 ms.** Object movement, gravity, and position integration run **once per 16 ms frame**.

### 0.2 The player runs FULL 60 Hz air physics (nap = 1)
Each object's fly/run loop naps for `[DTIME,X]` frames between updates. `DTIME` is a field in the object's DECISION BLOCK. For the two human players it points at `PLYTIM`:
- Line 5601: `PLYTIM  FCB     1`  → players wake **every 1 frame** in the air and on the ground. Full 60 Hz physics.
- For enemies `DTIME = EMYTIM` (a per-wave slow-down, normally 1; line 1993 `LDA #1 / STA EMYTIM`). So enemies also normally update every frame, but a wave can slow them.

The flying loops that consume this nap: `FLAPLP`/`FLIPLP` (lines 6163, 6190) call `LDA [DTIME,X] / JSR VNAPTPC`, then add gravity once per wake. Ground loop `PLYRLP` (line 5948) does the same.

### 0.3 Fixed-point position & velocity representation
From `RAMDEF.ASM`:
- `PPOSX RMB 3` and `PPOSY RMB 3` (lines 173-174): each position is **3 bytes** = `[integer_pixel][fraction_hi][fraction_lo]`. In code, `PPOSY+1` is the **integer pixel Y**, `PPOSY+2` is the fractional byte (1/256 px).
- `PVELY RMB 2` (line 188): **16-bit signed velocity**, "FACTIONAL SIGNED VELOCITY Y-DIRECTION". The **high byte = whole pixels/frame, low byte = 1/256 px/frame fraction**. Negative = upward (screen Y increases downward; CEILNG < FLOOR).
- `PVELX RMB 1` (line 190): 1-byte signed index, "TABLE LOOK-UP FLYING VELOCITY-X". This is NOT a raw velocity — it's an index into the `FLYX` table (see §1.5). Range −8..+8 in steps of 2.
- `PACCX RMB 1` (line 191): on the ground this is the **state-timer** ("LAND'S ACCELERATION RATE"); in the air it is reused as a wing-frame timer.

**How position integrates from velocity** (routine `ADDGRX`, line 6494):
```
ADDGRX  ADDD    PPOSY+1,U       ;ADD IN FRACTIONAL DISTANCE   (D = PVELY here)
        ADDA    PBUMPY,U        ;ADD IN BUMPING REGISTER
```
`D` (the 16-bit PVELY) is added to the 16-bit word `[PPOSY+1 : PPOSY+2]` = `[integer : fraction]`. So each frame: `posY_fixed += velY`. The high byte of PVELY carries whole pixels, the low byte accumulates fractional sub-pixel motion. **This is textbook 8.8 fixed-point integration at 60 Hz.**

### 0.4 World boundaries (native pixel units)
`JOUSTRV4.ASM` lines 36-42:
```
CEILNG  EQU     $0020           ;CEILING (HIGHEST POSITION) OF GAME)   = 32
FLOOR   EQU     $00DF           ;THE FLOOR (LOWEST POSITION OF GAME)   = 223
ELEFT   EQU     -10             ;EXTREME LEFT SIDE OF WRAP AROUND SCREEN
ERIGHT  EQU     292             ;EXTREME RIGHT SIDE OF WRAP AROUND SCREEN
MAXVX   EQU     8               ;MAXIMUM X +- VELOCITY
MAXVY   EQU     $1000           ;MAXIMUM Y + VELOCITY (FALLING)   [see note]
MINVY   EQU     $0400           ;MAXIMUM Y - VELOCITY (RISING)    [see note]
```
- Y ranges 32 (ceiling) to 223 (floor/lava). Ceiling bounce & floor/lava death handled in `ADDGRX` (lines 6497-6509).
- X wraps: screen is 302 px wide (`ERIGHT-ELEFT+1 = 303`); wrap handled in `WRAPX` (line 6272), `ADDD #-(ERIGHT-ELEFT+1)`.

**IMPORTANT caveat on MAXVY/MINVY:** these two equates are DEFINED but I found **no references** to `MAXVY` or `MINVY` anywhere in `JOUSTRV4.ASM` (grep returns only the two EQU lines). The player's fall/rise speed is therefore **not** explicitly clamped to $1000/$0400 in the flying loop — terminal velocity for the player emerges from the ceiling/floor bounds and flap cadence. Enemy Y-velocity caps use the separate DYTBL fields (`BODNVY`, `HUDNVY`, `HUUPVY`, `SHUPVY`), not MAXVY/MINVY. Treat MAXVY=$1000 (16 px/frame) and MINVY=$0400 (4 px/frame) as design-reference numbers only.

### 0.5 Platform (cliff) top Y-heights — landing table `CKGND`/`LNDBn` (lines 6703-6757)
```
LNDB0  CLIF1L & CLIF1R   #$0045-1   -> top at Y = $44 (68)
LNDB1  CLIF2             #$0051-1   -> top at Y = $50 (80)
LNDB2  CLIF3R            #$0081-1   -> top at Y = $80 (128)
LNDB3  CLIF3L & CLIF3R   #$008A-1   -> top at Y = $89 (137)
LNDB4  CLIF4             #$00A3-1   -> top at Y = $A2 (162)
```
CLIF5 (main lower platform) sits at ~`$D3` (211); pterodactyls clamp bottom at `$D3-1` (line 1530), transporter #4 at `$D3-1` (line 5590). Lava/floor is at `FLOOR=$DF` (223). `LAND5 EQU 210` (line 35) is the player-spawn Y.

---

## 1. PLAYER PHYSICS (the crux)

### 1.1 Gravity (`GRAV`)
- Base value: line 952-953 `LDA #4 / STA GRAV`. `GRAV` is in `RAMDEF.ASM` line 264 (`;GRAVITY FOR ALL PLAYERS`).
- **`GRAV = 4`, meaning +4/256 px added to PVELY every gravity call ≈ +0.0156 px/frame added to Y-velocity per frame** (an acceleration of ~0.0156 px/frame²... see effective value below).
- I found **no per-wave change of GRAV** — it is set once at init (line 952) and never re-stored. Grep for `STA GRAV`/`STD GRAV` returns only line 953. Gravity is constant across all waves. (The *lava troll's* pull `CLVGRA` does grow — that's separate, §6.)

**Gravity application in the flying loop** — `ADDGRA` (line 6489):
```
ADDGRA  ADDB    GRAV            ;ADD IN VARIABLE GRAVITY   (B = per-call offset)
        SEX                     ;sign-extend B into D
        ADDD    PVELY,U
        STD     PVELY,U         ;NEW Y VELOCITY
```
The caller passes `B` = an extra offset ON TOP of GRAV:
- Wings DOWN (flap held / `FLAPST`): `CLRB` → offset 0, so gravity add = **GRAV = 4** (line 6170).
- Wings UP (`FLIPST`): `LDB #$04` → offset 4, so gravity add = **GRAV + 4 = 8** (line 6197). You fall faster with wings up.

So effective downward accel is **+4/256 px/frame² wings-down, +8/256 px/frame² wings-up**.

### 1.2 Start-to-fly initial velocity — `STFLY` (line 6122)
```
STFLY   JSR     CPLYR           ;ERASE PLAYER
        LDD     #-$0080         ;INITIAL Y VELOCITY
        STD     PVELY,U
STKILL  DEC     PPOSY+1,U       ;JUMP UP 1 PIXEL (GET OUT OF LANDING AREA)
```
Leaving the ground gives **PVELY = −$0080 = −0.5 px/frame upward**, plus an immediate −1 px hop.

### 1.3 FLAP impulse — `ADDFLP` (line 6427)
This is the heart of flight. `PTIMUP` = frames elapsed since the last wing-down (reset to 0 at each flap; incremented each air frame in `AIRTIM`, line 6476, saturating at 255).
```
ADDFLP  LDB     PTIMUP,U        ;NOW CALC GAINED Y VELOCITY
        LDA     #256*96/255     ;CALC NBR -96 TO 0 FROM 0 TO 255   (#96)
        MUL                     ;A:B = PTIMUP * 96 / 256-ish
        TFR     A,B
        CLRA
        SUBD    #96             ;NEW DELTA-Y, USE IN GRAVITY CALC
        ADDD    PVELY,U
        STD     PVELY,U
```
Math: `impulse = floor(PTIMUP * 96 / 256) − 96`.
- If you flap again immediately after the previous flap (`PTIMUP ≈ 0`): impulse ≈ **−96** (= −96/256 = **−0.375 px/frame** added upward). Strongest.
- If a long time has passed (`PTIMUP ≈ 255`): `floor(255*96/256)=95`, impulse ≈ **−1** ≈ 0. Weakest.

So **rapid rhythmic flapping stacks near-full −0.375 px/frame kicks**; sluggish flapping gives almost nothing. This is the classic Joust "keep flapping to climb" feel. There is **no explicit upward-velocity cap** on the player in this routine.

Also in `ADDFLP`, the flap folds the joystick into horizontal velocity:
```
        LDA     CURJOY          ;ADD IN JOYSTICKS LEFT OR RIGHT POSITION
        ASLA                    ;x2  (so each held direction = ±2 to PVELX index)
        ADDA    PVELX,U         ;GET CURRENT TABLE VELOCITY-X SPEED
        BLT     ADXMAX
        CMPA    #MAXVX          ;PASSED MAXIMUM X VELOCITY?  (#8)
        BGT     ADXMX2
        STA     PVELX,U
...
ADXMAX  CMPA    #-MAXVX         ;PASSED MINIMUM X VELOCITY?  (#-8)
```
So **each flap while holding a direction bumps the PVELX index by ±2**, clamped to ±`MAXVX` = ±8. (Air horizontal acceleration therefore happens per-flap, not per-frame.)

### 1.4 Flap timing / cooldown
There is no fixed cooldown timer; the flap "wings-down minimum" is enforced by `PACCX` used as a wing-frame timer:
- On flap (`FLAST2`, line 6216): `LDA #5 / STA PACCX,U ;WING DOWN MINIMUM TIME` — wings stay visually down at least 5 frames.
- On fall-start (`STFALL`, line 6147): `LDA #10 / STA PACCX,U ;SLOW TIME TO RAISE WINGS`.
The wing state alternates flap-held (wings down loop `FLAPLP`) vs flap-released (wings up loop `FLIPLP`); the impulse is applied on the down-transition (`GOFLAP → ADDFLP`, line 6212). Practically: one impulse per flap-button press cycle.

### 1.5 Horizontal model — the `FLYX` velocity table (air) — line 7154
`PVELX` (−8..+8 in steps of 2) indexes a signed 16-bit fixed-point X-velocity table. The table (lines 7146-7158):
```
        FDB     -$0200   ; index -8  = -2.0  px/frame
        FDB     -$0100   ; index -6  = -1.0
        FDB     -$0080   ; index -4  = -0.5
        FDB     -$0040   ; index -2  = -0.25
FLYX    FDB     $0000    ; index  0  =  0.0
        FDB     $0040    ; index +2  =  0.25
        FDB     $0080    ; index +4  =  0.5
        FDB     $0100    ; index +6  =  1.0
        FDB     $0200    ; index +8  =  2.0
```
(The table is centered at label `FLYX`; PVELX is used as a signed byte offset `LDD A,X` in `ADDGRX` line 6512-6513, then the fractional low byte accumulates into `PVELX+2`.)

**So player air horizontal speed is one of: 0, ±0.25, ±0.5, ±1.0, ±2.0 px/frame** (= up to 2.0 px/frame = 120 px/s). Each flap-with-direction steps you one notch outward (±2 index = one row). Reversing joystick steps you back toward 0 and through it — i.e. air "braking" is just stepping the index back one notch per flap.

Horizontal position integration (`ADDGRX`, lines 6512-6518):
```
        LDA     PVELX,U
        LDD     A,X             ;X = #FLYX, look up 16-bit vel
        ADDB    PVELX+2,U       ;ADD IN FRACTIONAL DISTANCE
        STB     PVELX+2,U
        ADCA    #0
        TFR     A,B
        JMP     WRAPX           ;apply, wrap around screen
```

### 1.6 Ground horizontal model — the `STATE` machine (lines 7160-7245)
On the ground, movement is **animation-state driven**, not velocity-integrated. The `STATE` macro (line 7160) fields are `WAIT, CALL, MINUS, ZERO, PLUS, FLYVEL`. `WAIT` is the nap (frames) before the next state step; smaller WAIT = faster running. The running states (right-facing; left mirrors):
```
PLYAR  WAIT 8  REVR    ...        (reverse/turn)
PLYBR  WAIT 0  STANDR  ...  FLYVEL 0   (stand still)
PLYCR  WAIT 8  RUNR    ...  FLYVEL 2   (slowest run  — step every 8 frames)
PLYDR  WAIT 4  RUNR    ...  FLYVEL 4
PLYER  WAIT 2  RUNR    ...  FLYVEL 6
PLYFR  WAIT 1  RUNR    ...  FLYVEL 8   (fastest run — step every 1 frame)
PLYGR  WAIT 2  RUNSR   ...  (run-stop)
PLYHR..PLYMR  WAIT 2/4 SKIDR ...       (SKID states, entered on reversal)
```
Holding a direction advances the state toward faster tiers (`PLYCR→PLYDR→PLYER→PLYFR`); the running frame advances by a per-frame pixel delta (table `ORRUN`, line 7187) each animation step. Reversing direction enters the **SKID** states (`SKIDR`, line 7237, `PFRAME = -1`, plays skid sound) — this is the "skid" braking-on-reverse state. `FLYVEL` (0/2/4/6/8) is the PVELX index handed off when you take off from that ground speed, and is also the "fictitious velocity for bumping" (`PVELX` set at line 6000-6001 during ground movement).

**Ground → air handoff** (`STLAN`, line 6233 and `FRCONV`, line 6253): landing converts your flying PVELX magnitude back into the matching run-state via table `FRCONV` (NAP 8/4/2/1 = slowest→fastest).

`PACCX` on the ground = state-change timer: `LDA #8 / STA PACCX,U` when entering a new state (line 5979-5980), i.e. it takes 8 frames of holding a direction to shift up one speed tier. This is the effective **ground acceleration rate** ("LAND'S ACCELERATION RATE" per RAMDEF).

### 1.7 Terminal velocities (native units → px/frame @ 60 Hz)
| Quantity | Native | px/frame | px/sec |
|---|---|---|---|
| Max air horizontal speed | FLYX ±$0200 | ±2.0 | ±120 |
| Max ground run step delta | PLYFR (WAIT 1, ORRUN deltas) | ~fast, animation-based | — |
| Flap impulse (max, rapid) | −$0060 (−96) | −0.375 per flap | — |
| Wings-down gravity | +$0004 (GRAV) | +0.0156 /frame² | — |
| Wings-up gravity | +$0008 | +0.0312 /frame² | — |
| Initial takeoff velocity | −$0080 | −0.5 | −30 |
| (Design ref only) Max fall MAXVY | $1000 | 16 (unused clamp) | — |
| (Design ref only) Max rise MINVY | $0400 | 4 (unused clamp) | — |

The player's real max fall speed is bounded only by the height of the play area and gravity; over the ~190 px drop from ceiling to floor with +0.0156/frame² it never reaches the MAXVY reference. Practical terminal fall is a few px/frame.

---

## 2. JOUST COLLISION RESOLUTION (who wins the joust)

Routines: `OPPCOL` (enemy-vs-enemy, line 4808), `PLYCOL` (player-vs-all, line 4856), `HITEM` (bounding-box + pixel test, line 4909), `OSTHIT`/`OSTBO` (decision, lines 4952/5002), bounce vectors `OSTUTP`/`OSTXTP`/`OSTLR`/`OSTXUP`/`OSTXDN` (lines 5097-5185).

### 2.1 Bounding-box gate (`HITEM`, line 4909)
X overlap: compares `PPOSX,U` vs `PCOLX,X` both ways (lines 4910-4917). Y overlap: `PCOLY1` (bottom line of box) vs `PCOLY2` (top line) both ways (lines 4919-4923). Collision box maintained in `SRCADH` (lines 6035-6038): `PCOLY1 = PPOSY+1` (feet), `PCOLY2 = PPOSY+1 − ($14−1)` (i.e. body is $13 = 19 px tall). If boxes overlap, a per-pixel test `BPCOL` runs (line 4944); only a true pixel overlap proceeds to `OSTHIT`.

### 2.2 The decisive vertical comparison — the LANCE HEIGHT (`OSTBO`, line 5002)
This is the exact rule that decides the joust:
```
OSTBO   LDB     PLANTZ,U        ;LOSER-candidate's lance offset
        SEX
        STD     ,--S
        LDB     PLANTZ,X        ;WHICH LANTZ IS ON TOP?
        SEX
        SUBD    ,S++            ;  D = PLANTZ,X - PLANTZ,U
        ADDD    PPOSY,X         ; (DETERMINATION OF WHO IS KILLED)
        SUBD    PPOSY,U
        BEQ     .1S             ; BR=BOTH ON SAME LEVEL   -> BOUNCE
        BMI     OSTXT3          ; REG.U is higher -> REG.U wins (REG.X dies)
        JMP     OSTPYP          ; BR=REG.Y ON TOP -> REG.X wins (REG.U dies)
```
Effective comparison value:
```
  key = (PLANTZ_X − PLANTZ_U) + (PPOSY_X − PPOSY_U)
      = (PPOSY_X + PLANTZ_X) − (PPOSY_U + PLANTZ_U)
      = lanceHeight_X − lanceHeight_U
```
where **lanceHeight = PPOSY + PLANTZ** (PLANTZ = per-object "lantz offset for skidding"/lance height, `RAMDEF.ASM` line 202). Remember screen-Y grows downward, so the object with the **smaller** PPOSY+PLANTZ (higher on screen) has the higher lance.
- `key == 0` → **exactly equal lance height → BOUNCE**, no death (`.1S`, plays `SNPTHD` collide sound, line 5014, → `OSTXTT`/bounce).
- `key < 0` (BMI) → REG.U's lance is higher → **REG.U wins**, REG.X dies (`OSTXT3`).
- `key > 0` → REG.X's lance is higher → **REG.X wins**, REG.U dies (`OSTPYP`).

There is **no fuzz/tolerance band** — the bounce is only when the two lance heights are numerically identical. Any difference, however small, produces a winner. (Pterodactyls carry `PLANTZ = $80` = "A VERY HIGH LANTZ (TO KILL PLAYER)", line 1472-1473, so they almost always out-height the player unless the special beak rule fires — see §5.)

### 2.3 Bounce vectors (when nobody dies)
Vertical bounce `OSTXUP` (winner/upper) & `OSTXDN` (lower), lines 5163-5185:
```
OSTXUP  LDA #-2 / STA PBUMPY,X   ; top guy gets a -2 px vertical bump (up)
        (if moving down, invert & halve PVELY: COMA/NEGB/SBCA/ASRA/RORB -> reflect & /2)
OSTXDN  LDA #2  / STA PBUMPY,X   ; bottom guy gets +2 px bump (down)
        (if moving up, invert & halve PVELY)
```
So on a bounce the higher bird is bumped **−2 px** and the lower **+2 px**, and each one's PVELY is **reflected and halved** (`ASRA/RORB` = arithmetic /2) if it was moving into the other. Horizontal bounce `OSTLR`/`OSTXLF`/`OSTURT` (lines 5110-5158): the two are shoved apart in X — each `PVELX` is negated and slowed by `+2` toward zero, and a `PBUMPX = ±(...)/2` shove is applied to the opponent, with faces set to point away from each other. Net: a joust "clank" pushes both apart horizontally and vertically, halving vertical speed.

Pterodactyl-vs-bird special bump (`PTEBRD`, line 5203): the bird gets a **hard `PBUMPY = ±5`** (lines 5214/5219) instead of ±2.

### 2.4 On a kill (`OSTWIN`, line 5062)
Loser's `PID` high bit cleared (uncollidable/dead), rider removed, its death routine `[DDEAD,Y]` invoked, and the **winner is awarded `DVALUE` points via `[DVALUR,Y]`** (lines 5076-5080). Point values in §8.

---

## 3. WORLD CONSTANTS ALREADY CONFIRMED (cross-reference table)

| Const | Value | Meaning | Evidence |
|---|---|---|---|
| GRAV | 4 | base gravity add /frame (÷256 px) | L952-953 |
| CEILNG | $20 (32) | ceiling Y | L36 |
| FLOOR | $DF (223) | floor/lava Y | L37 |
| ELEFT / ERIGHT | −10 / 292 | X wrap bounds | L38-39 |
| MAXVX | 8 | max PVELX index (±8) | L40 |
| PEGG init | 4 | max eggs an enemy lays | L472-473 (`#4 ;MAXIMUM NUMBER OF EGGS TO LAY`) |
| Player air nap | 1 frame | PLYTIM | L5601 |
| Takeoff vel | −$0080 | −0.5 px/frame | L6124 |
| Flap impulse | −96 max | −0.375 px/frame | L6430-6435 |

---

## 4. ENEMIES — BOUNDER / HUNTER / SHADOW LORD

### 4.1 Architecture
Every enemy has a DECISION BLOCK with two behavior pointers: `DJOY` = the "dumb" brain **`LINET`** (line-tracking, line 3722) used by all enemies at spawn, and `DSMART` = the enemy's distinctive smart brain. Enemies spawn dumb and are promoted to their smart brain when the intelligence throttle allows (`LINET` tests `NSMART < WSMART`, line 3722-3724; promotion at `LNTSMT`, line 3764: `INC NSMART / STX PJOY,U / JMP ,X`).

Decision blocks (lines 5562-5573):
- `P4DEC FDB LINET,BOUNDR,...` → **BOUNDER**
- `P5DEC FDB LINET,B2UNDR,...` → **HUNTER**
- `P6DEC FDB LINET,SHADOW,...` → **SHADOW LORD**
- `P7DEC FDB LINET,PTERO,...` → PTERODACTYL (§6)

`LINET` flies the enemy toward one of three horizontal tracking lines (`AOFFL1/AOFFL2/AOFFL3`) nearest the player, flapping up (`LNTUP`) when below the line.

### 4.2 Point values — VERIFIED (via the EGGVAL Rosetta-stone, §5)
Each block's `DVALUE` byte + `DVALUR` routine encode the score:

| Enemy | Block | Brain | DVALUR | DVALUE | **Points** |
|---|---|---|---|---|---|
| BOUNDER | P4DEC (5562) | BOUNDR | SCRTEN | `$05` | **500** |
| HUNTER | P5DEC (5566) | B2UNDR | SCRTEN | `$57` | **750** |
| SHADOW LORD | P6DEC (5570) | SHADOW | SCRHUN | `$15` | **1,500** |
| PTERODACTYL | P7DEC (5574) | PTERO | SCRHUN | `$10` | **1,000** |

Confirmed by attract-mode strings: `BOUNDER [500]`, `HUNTER [750]`, `SHADOW LORD [1500]` (PHRASE.ASM).

### 4.3 The DYTBL difficulty table (lines 7305-7334) — how enemy behavior scales
The `DYWORD START1,START2,START3,INCRE,ENDV,TIM1,TIM2,TIM3` macro (line 210) gives three starting tiers (selected by the operator dip `GA1`), a per-step increment `INCRE`, and a saturation `ENDV`. Copied ROM→RAM at game start (line 939, START tier from `GA1`) and stepped **once per wave** by the inter-wave engine (lines 1893-1926): each value has its own countdown timer (from the `TIM` nibbles); when it expires the value takes one `INCRE` step toward `ENDV` and the timer reloads. So each enemy constant ramps on its own cadence, saturating at `ENDV`.

Y-velocity constants (16-bit fixed-point; high byte = px/frame; negative = upward):
| Const | START1→2→3 (native) | px/frame | Meaning |
|---|---|---|---|
| `BODNVY` | $0080→$0100→$0200 | 0.5→1.0→2.0 (down) | Bounder max fall speed |
| `HUDNVY` | $0100→$0200→$0300 | 1.0→2.0→3.0 (down) | Hunter max fall speed (faster) |
| `HUUPVY` | $FF80→$FF00→$FE00 | −0.5→−1.0→−2.0 (up) | Hunter max rise speed |
| `SHUPVY` | $FFF0→$FE00→$FD00 | −0.06→−2.0→−3.0 (up) | Shadow Lord max rise (fastest) |
| `BOLETM`/`HULETM`/`SHLETM` | $0020→$0015→$0010 (floor $0002) | 32→21→16 frames | "Level flight" time to next decision |
| `SHUPTM` | $0014→$000A→$0008 | 20→10→8 frames | Shadow Lord pursuit re-decision |
| `SHCLTM` | $000A→$0008→$0006 | 10→8→6 frames | Shadow Lord cliff-avoid brake time |

How they're applied: an enemy only flaps to gain speed if it hasn't reached its velocity cap (e.g. `BODN11 SUBD BODNVY / BMI ...` line 3818; `B2UP ... CMPD HUUPVY / BLT` line 4177; `SHUP1 ... CMPD SHUPVY / BLT` line 4271). `xxLETM` sets `PJOYT` = frames until the enemy re-evaluates the player's position.

### 4.4 Behavior summary (why HUNTER > BOUNDER, SHADOW LORD hardest)
- **BOUNDER** (line 3787): slowest (fall cap 0.5-2.0), lazy flapping (`BOUPWD`/`BOUPWU`), **no predictive cliff-avoidance** — can be lured into lava. Least aggressive.
- **HUNTER** (`B2UNDR`, line 3971): faster on every axis (dive to 3.0), **has predictive cliff-avoidance** (`B2DICL`, projects `PVELY×8` ahead, line 4142), climbs over cliffs (`B2UP3`, line 4195), tighter chase window. Hard-codes cliff-brake time = 8.
- **SHADOW LORD** (line 4230): fastest riser (−3.0), shortest decision intervals (reacts 2-3× more often), dedicated player-line tracking `SHLEP` (line 4277, copies the player's flight line and X-velocity), DYTBL-driven cliff-brake (`SHCLTM`) that also sharpens with difficulty.

All three have an anti-mirroring guard (`PRDIR` counter; flips facing to flank when it's been copying the player's velocity too long — lines 3939/4087/4303).

### 4.5 First-appearance waves (from `WAVTBL`, line 2438; byte0 hi=bounders, lo=hunters, byte1 hi=lords)
- **BOUNDER: Wave 1** (`$30` = 3 bounders).
- **HUNTER: Wave 4** (`$33` = 3 bounders + 3 hunters).
- **SHADOW LORD: Wave 16** (`$05,$1F` = 5 hunters + 1 lord). Count grows: wave 19→2, 21→3, 22→4, 26→5, up to 10 in high waves.

Also: killed enemies re-hatch one intelligence tier higher (lines 2986-2990: `ADDD #P4DEC-P3DEC ;NEXT LEVEL OF INTELLIGENCE` — a bounder's egg re-hatches as a hunter, a hunter's as a lord).

### 4.6 The intra-wave intelligence throttle (anti-dawdle #1)
Independent of DYTBL: `EMY2`/`EMYOK` (lines 2094-2130) — every **~15 seconds** (`#112` × `PCNAP 8` = 896 frames ≈ 15 s) `WSMART` is incremented, letting one more enemy abandon `LINET` and activate its full smart brain. Dawdle on a wave and progressively more enemies wake up and hunt you. When a smart enemy dies, `NSMART` is credited back (line 2962), freeing the slot.

---

## 5. EGGS

### 5.1 Egg gravity & bounce
- **Gravity** — `ADDEGG` (line 3111): `LDB GRAV (=4) / SEX / ADDD PVELY,U` then `ADDD PPOSY+1,U`. Same GRAV=4 as players. Ceiling clamp at `CEILNG=$20` (velocity inverted).
- **Bounce** — `EGGBON` (lines 3196-3222). Exact math:
  - **Y velocity is reversed and reduced to 1/4**: two `ASRA/RORB` pairs = arithmetic ÷4, then two's-complement negate → `Vy_new = −(Vy_old / 4)`.
  - **X velocity bleeds toward 0 by 2 units** per bounce (`ADDA #-2` / `ADDA #2` toward zero).
  - **Rest condition** (egg settles): reflected `|Vy| < $0020` AND `PVELX == 0` (lines 3219-3222). Until both true it keeps bouncing. This gives the decaying multi-bounce settle.

### 5.2 Hatch timing
- Countdown stored in the egg's `PJOYT`, decremented once per `PCNAP 12` cycle (`EGGLND`, lines 3224-3242). Initial value = **`EGGWT`** for a landed/bounced egg; **`EGGWT2`** for eggs pre-placed on the ground in an egg-wave (via `PEGGTM`).
- **2-player games halve the wait** (`LSRB` on the timer, lines 2762-2766).
- Gated by `WENEMY` (max concurrent enemies): egg keeps waiting if the wave already has enough enemies.
- **Per-wave speedup** (DYTBL, lines 7309-7310): `EGGWT` $60→$40→$20 (step −2, floor $10); `EGGWT2` $5E→$38→$22 (step −4, floor $08). Eggs hatch progressively faster with difficulty.
- **Hatch animation** (`EGGTBL`, lines 3537-3544): wiggle left/up/right/pause, then 4 crack/hatch frames. Then a standing unmounted rider appears.

### 5.3 Rider re-mount sequence
When the hatch timer fires, the game spawns a **buzzard that flies in at 8 px/frame** (`LDA #8 / STA PVELX,Y`, line 3256) from the nearest screen edge, seeking the standing rider (`SEEKE`, line 3549, flaps up when below the man). When it stops over the man (`BEQ MOUNTM ;GOT THE MAN!!!`, line 3592): ~6-frame settle (`#5+1`), mount sound (`SNMOUN`), the standing-egg process is killed and a **fully-active flying enemy is spawned** (`JMP PLYLI2`, line 3695) — now un-collidable-as-egg, and the pack gets smarter (`INC NSMART`). During the buzzard's flight the player can kill the standing rider.

### 5.4 Egg collection score escalation — table `EGGVAL` (lines 3097-3104)
```
EGGVAL  FCB $52 / FDB SCRTEN   ;250
        FCB $05 / FDB SCRHUN   ;500
        FCB $57 / FDB SCRTEN   ;750
        FCB $10 / FDB SCRHUN   ;PEG AT 1,000
```
- Per-player consecutive-collect counter is `EGGS1`/`EGGS2` (resolved via `DEGGS` field). 1st egg→250, 2nd→500, 3rd→750, **4th and beyond→1000 hard-capped** (`CMPB #4 / BHS EGGSMN`, lines 3043-3045).
- **Reset**: counter cleared at wave start (`WNRM`, lines 1979-1980) and on player death (`DEATH1`/`DEATH2` `CLR EGGS1/2`, lines 4669/4675). (No dedicated on-touchdown clear instruction was found — the reset happens via those paths. Verify against gameplay.)
- Overlapping score-display queue implemented in `EGGHIT` (lines 3339-3411) via a `SCRID` process-list walk with `PLAVT` delay stacking (no symbol literally named `EGGNBR` exists in this file).

### 5.5 Egg count per enemy (PEGG=4)
`PEGG` = "MAXIMUM NUMBER OF EGGS TO LAY" = 4 (lines 472-473, 2900-2901). Mechanic: each enemy **becomes** an egg when killed; that egg can respawn a bird→rider that, when re-killed, leaves another egg, decrementing `PEGG` each cycle (`STA PEGG,Y / DEC PEGG,Y ;YOU CAN ONLY SQUEEZE SO MUCH BLOOD FROM AN EGG`, lines 2999-3001). When it hits 0 the enemy is permanently removed. So an enemy line regenerates through up to **4 egg/rider cycles**.

### 5.6 Catch-in-air bonus (+500)
Catching an egg **before it bounces/lands** = a flat **+500 points** on top of the escalating collection value (`EGGSCR`, lines 3064-3069: if `PFEET,Y == 0`, `LDA #$05 / JSR SCRHUN`). The `PFEET` flag is set the moment the egg touches a platform (`EGGBON`, line 3196) or when ground-placed, disabling the bonus. Rendered as a separate `CATID`/`EGGCOL` (color $2) `MSG500` popup (lines 3392-3411).

---

## 6. PTERODACTYL

### 6.1 Spawn / anti-dawdle (baiters)
Baiters are pterodactyls that pour out faster the longer you dawdle. Driven by `CBAIT` countdown against a **table of shortening send-off times** `BAITBL` (V4 patch, lines 2150-2163), read backwards:
```
60s, 45s, 30s, 15s, 15s, 7s, 5s, 3s, then six × 1s  (converges to 1 baiter/sec)
```
- Wave-start offset (`BAISBL`): wave 1 starts at 60 s, wave 2 at 45 s, later waves at 30 s before the FIRST baiter; each subsequent baiter comes sooner as `PBAITN` walks the table toward the 1-second entries.
- **Max 3 baiters on screen at once** (`CMPA #3-1`, line 2108). `NBAIT` tracks the count.
- Baiters are flagged `PCHASE ≠ 0` (line 2113); PATCH8 makes a baiter's first pass deliberately miss (`PPVELX = 138`, lines 6307-6311).

Dedicated pterodactyl **waves** (`WPTEN`, byte 2 of the wave row) spawn 1-3 non-baiter pterodactyls on the marked pterodactyl waves.

### 6.2 Point value: 1,000 (`MSGTH1`, lines 1406-1408; `P7DEC` DVALUE=$10). Color red (`PTC=$4`).

### 6.3 Vulnerability — must lance the open beak (`OSTHIT`, lines 4962-5001)
A pterodactyl-vs-player collision only kills the PTERODACTYL when ALL are true:
1. **Lance within a small window of the mouth center** (`PLANTZ + PPOSY` vs pterodactyl Y):
   - Open-beak **attack frame** (`FLY3`, i.e. `PIMAGE > FLY2-FLY1`): lance within **±3 px** of mouth center (mouth offset 8 px from lance, `SUBB #15-7`, lines 4975-4982).
   - Non-attack frame: within **±2 px** (offset 10 px, `SUBB #15-5`, lines 4984-4990).
2. **Opposite facing**: `PFACE,U EORA PFACE,X / BPL fail` (lines 4991-4993).
3. **Player on the correct side** (lancing toward the mouth): `COLDX` sign + `PFACE` check (lines 4994-5001).

Any failure falls through to `OSTBO` (line 5002) = the normal lance-height rule, and since the pterodactyl carries `PLANTZ = $80` ("A VERY HIGH LANTZ TO KILL PLAYER", line 1472), a mistimed hit **kills the player**.

### 6.4 Movement / AI (lines 1142-1359)
- **Seek timer**: `PTERO DEC PPVELX,U` (line 1142); on timeout re-targets nearest player, reloads look-interval from `PFEET` (decrements toward min 15 → looks more often over time). Won't seek below CLIF5 (`$D3-1`).
- **Vertical clamps** (native / px-frame):
  - Climb `PTEUP`: cap −$00C0 (−0.75), step −$0040 (lines 1290-1293).
  - Dive `PTEDN`: cap +$0100 (+1.0), step +$0010 (lines 1307-1310).
  - Cruise `PTELEV`: ±$0100 (±1.0), step ±$0020.
- **Horizontal X table** (lines 1587-1595): 0 … ±$0300 (up to **±3.0 px/frame** — pterodactyls are the fastest movers). Cruise ±4 index, attack-dive ±8 index.
- **Attack X-window**: ±13 px (lines 1182-1189). During attack, baiter PVELY is ÷4 to avoid overshoot (PATCH5).
- Off-screen removal `PTEOFF` at `ELEFT+3`/`ERIGHT-3` (lines 1316-1359) → self-destruct.

---

## 7. LAVA TROLL / LAVA

### 7.1 First appearance
`TBRIDGE = 3` (lines 952-955), `TTROLL = 1` (lines 956-957). Each wave `TBRIDGE` counts down; at 0 the **lava bridge collapses** (`STBRID` launches two flame processes, lines 1938-1951) — i.e. the bridge burns at the start of **wave 3**. Then `TTROLL` counts down; at 0 the lava-flame/troll processes start (lines 1954-1978) — the troll can grab from ~**wave 4**. Only **1 troll at a time** (`LAVNBR` check, line 6767).

### 7.2 Hand-grab
The troll spawns when a bird lands on CLIF5 while `TTROLL==0` and `LAVNBR==0` (lines 6764-6793, starts at `FLOOR-9`). `LAVAT1` (lines 1606-1642) raises the hand to match the victim's foot height (`ADDB #10-7 ;OFFSET FOR PROPER HAND GRIP`). Grip is only kept while in-range (`LAVVI3`, lines 1711-1731): victim alive, `PSTATE==0` (airborne), not too high (`CMPA #FLOOR+7-32`), X within CLIF5 bounds (54-14 … 240). On grab (`LT1GRP`, line 1646): plays `SNTROL`, and **re-points the victim's gravity vector at `ADDLAV`** (`STX PADGRA,U`, line 1652), and calls PATCH1.

### 7.3 Flap-to-escape math (`ADDLAV`, lines 6608-6642)
While grabbed, each frame `ADDLAV` adds the growing downward pull `CLVGRA` to `PVELY`. **Break-free** when the player's flaps drive `PVELY < −$0180` (= **−1.5 px/frame upward**, `CMPD #-$0180 / BLT` line 6616) — awards **50 points** (line 6668). The tug strengthens on two timescales:
1. **Within a grab (30-second ramp)**: `CLVGRA` starts at `LAVGRA` (PATCH1, line 6396) and grows **+1 per frame-tick, capped at $500 = 5.0 px/frame** (PATCH2, lines 6374-6381; `LAVKLL = 30*60`).
2. **Across waves (DYTBL, line 7307)**: base `LAVGRA` = $0004→$0008 (by difficulty), grows +$0002/adjust up to max $002D. Higher waves = stronger initial pull.

Practically: early on a couple of flaps break free; as the timer runs (or on high waves) the per-frame pull approaches 5.0 px/frame and eventually outpaces any flap rate, dragging the player under.

### 7.4 Lava level (`SAFRAM`/`SAFRM2`)
`SAFRAM` (bubbling display level) starts at $EA, **rises $5 per wave** toward a ceiling of $E0 (lines 1929-1933; smaller Y = higher). `SAFRM2` = the actual current surface level, used to gate the bridge-burn flames (lines 5254-5256).

### 7.5 Lava death (`ADGFLR`/`ADGLAV`, lines 6508-6572)
Each frame `ADGCEI CMPA #FLOOR+7 / BHS ADGFLR` — at/below `FLOOR+7` ($E6) you die. `ADGLAV` plays the splash (`SNPLAV`/`SNELAV`), draws the clipped sinking sprite, marks dead once submerged (`ANDA #$7F`, line 6557), sinks to `FLOOR+20`, `PCNAP 30`, then respawns via `[DCRE,X]`.

---

## 8. WAVES / LEVELS / SCORING / LIVES

### 8.1 Wave table & type selection (`WAVTBL`, line 2438; 4 bytes/wave = `WLEN`)
- byte0 = bounders(hi nibble):hunters(lo); byte1 = shadow-lords(hi):pursuers(lo); byte2 = pterodactyls; byte3 = `WSTATUS`.
- **Wave TYPE** = `WSTATUS` low-3 bits (`WBJSR`) index `WJSRTB` (lines 2586-2591):
  - +0 = plain combat wave
  - +2 = intro message ("PREPARE TO JOUST" / "BUZZARD BAIT")
  - +4 = COOP/TEAM wave (becomes SURVIVAL if solo — decided at runtime in `WCOOP`, line 2628)
  - +6 = GLADIATOR wave
  - +8 = EGG wave
  - +10 = PTERODACTYL wave
- Authored as a **repeating 5-wave pattern**: intro / team / combat / gladiator / egg, with pterodactyl waves inserted from wave 8. Table wraps at wave 80 → `WTBRST` (wave 81 slot), so difficulty plateaus/repeats past wave 80.
- `WAVBCD` = current BCD wave (starts 0, incremented+DAA each wave).

### 8.2 Platform erosion
- **Numbered cliffs** erode via `WSTATUS` bits: `WBCL1L=$10, WBCL1R=$20, WBCL2=$40, WBCL4=$80` (lines 189-192); `WBCLS` = all three. On each wave, changed cliffs are erased/created by `WCLFEW` (with `SNCLIF` destroy sound). E.g. wave 6 removes CLIF2, wave 7/8 remove CLIF1+CLIF2, wave 9 removes all three, and from ~wave 26 onward often all-three (`WBCLS`).
- **Lava bridge collapse** is separate & hardcoded: `TBRIDGE=3` countdown → bridge burns at wave 3 (§7.1).

### 8.3 Enemy counts per wave
Sum of the three nibbles (bounders+hunters+lords) + pterodactyls + baiters. `WPERSUE` (byte1 lo nibble) → `WSMART` (how many turn smart immediately). `WENEMY` = max concurrent (255 for normal waves, set from wave data for egg waves). Wave ends when `NRIDER == 0`.

### 8.4 Banner phrases (exact strings, from PHRASE.ASM glyphs)
| String | Shown |
|---|---|
| `PREPARE TO JOUST` | wave-1 intro |
| `BUZZARD BAIT!` | intro line 2 |
| `TEAM WAVE` | 2-player team wave |
| `BONUS AWARDED FOR TEAM PLAY` | team wave |
| `PLAYER CONFLICT - NO BONUS AWARDED` | team wave, players killed each other |
| `PLAYER CO-OPERATION - EACH PLAYER 3000 POINTS` | team bonus paid |
| `WAVE ` | prefix + wave number, every wave |
| `BEWARE OF THE "UNBEATABLE?" PTERODACTYL` | pterodactyl wave |
| `GLADIATOR WAVE` | gladiator wave |
| `3000 POINT BOUNTY` / `FOR DISMOUNTING FIRST PLAYER` | gladiator wave |
| `NO BOUNTY AWARDED` / `COLLECTED 3000 BOUNTY` | gladiator result |
| `EGG WAVE` | egg wave |
| `SURVIVAL WAVE` | solo survival wave |
| `COLLECT 3000 SURVIVAL POINTS` / `NO SURVIVAL POINTS AWARDED` | survival result |
| `HOME OF THE` / `LAVA TROLL` | lava-troll lesson |
| `TEMPORARY SAFETY` / `UNTIL A CONTROL IS PRESSED` | transporter-safety |

### 8.5 Scoring & lives (factory defaults from `TB12REV3.ASM` `DEFALT`)
- **Starting lives (`NSHIP`) = 5** (`$05`).
- **Extra-life / replay threshold (`REPLAY`) = 20,000** (`$20`). Recurring: a life every 20,000 points (`SCRLEV`/`INCLIV`, lines 7382-7413; `LEVPAS`=0 → no extra men).
- **Master difficulty `GA1` = 5** (selects DYTBL START tier).

**Full point table:**
| Object | Points |
|---|---|
| Egg collected (1st / 2nd / 3rd / 4th+) | 250 / 500 / 750 / 1000 (capped) |
| Egg caught in air (before bounce) | +500 bonus (on top of collection value) |
| Bounder | 500 |
| Hunter | 750 |
| Shadow Lord | 1,500 |
| Pterodactyl | 1,000 |
| Survive lava-troll grip (break free) | 50 |
| Player death (consolation) | 50 |

**Bonuses (all 3,000 points, encoded `LDA #$30 / JSR SCRHUN`):**
- **Survival wave** cleared without dying → 3,000 (`WSUSCR`, lines 2680-2691).
- **Team/co-op wave**, neither player killed the other → **each** surviving player 3,000 (`WCOSCR`, lines 2650-2657).
- **Gladiator wave** 2-player partner-kill bounty → first to dismount the partner gets 3,000 (`SPDGLA`, lines 4695-4712; only one per wave).

---

## 9. REMAKE IMPLEMENTATION VALUES

Assume a **60 Hz fixed timestep**. Store positions and Y-velocity as floats or 8.8 fixed-point. All "px/frame" values below are at 60 Hz; multiply by 60 for px/second.

### 9.1 Core player physics (per 60 Hz frame)
```
GRAVITY_WINGS_DOWN =  0.015625  px/frame^2   ; = 4/256, applied when flap held / falling
GRAVITY_WINGS_UP   =  0.03125   px/frame^2   ; = 8/256, applied when wings up (fall faster)
TAKEOFF_VELOCITY_Y = -0.5       px/frame     ; = -$0080, on leaving the ground (+1px hop up)
FLAP_IMPULSE_MAX   = -0.375     px/frame     ; = -96/256, added to velY per flap when flapped rapidly
   ; exact per-flap impulse = (framesSinceLastFlap * 96 / 256) - 96, then /256 px  -> ranges -0.375..~0
CEILING_Y = 32     ; bounce (invert velY if moving up)
FLOOR_Y   = 223    ; lava surface; death at FLOOR+7 = 230, fully submerged at FLOOR+20 = 243
SCREEN_X_WRAP: left=-10, right=292 (width 303, wrap around)
```
Flap model: each flap press adds `FLAP_IMPULSE` to velY (strongest when flapping in quick rhythm; weakest if you waited). No hard upward cap on the player — climbing is limited by gravity + flap cadence + ceiling. There is NO explicit MAXVY/MINVY clamp in the shipped player code (those equates are unused).

### 9.2 Horizontal (air) — discrete velocity ladder
Player air X-velocity is one of these 9 values (index steps ±2 per flap-with-direction, clamped ±8):
```
FLYX = [ -2.0, -1.0, -0.5, -0.25, 0.0, +0.25, +0.5, +1.0, +2.0 ]  px/frame
```
(native $0200/$0100/$0080/$0040/$0000...). Reversing joystick steps the index back toward/through 0. Max air horizontal = 2.0 px/frame (120 px/s).

### 9.3 Horizontal (ground) — state-machine speeds
Ground movement is animation-state driven, not velocity-integrated. Holding a direction advances speed tiers; each tier steps its running animation every N frames:
```
Stand -> RunSlow(step every 8 frames) -> Run(4) -> Run(2) -> RunFast(1)
```
It takes ~8 frames of holding a direction to shift up one tier (ground acceleration). Reversing direction enters a **SKID** state (brake + skid sound) before turning. On takeoff, ground speed converts to the matching FLYX index (0/2/4/6/8).

### 9.4 Joust collision resolution
- Collision box: ~19 px tall (`$14-1`), width from `PCOLX`. Bounding-box + pixel test.
- **Winner = higher lance**: compare `lanceHeight = PPOSY + PLANTZ` (smaller Y = higher = wins). **Exactly equal → BOUNCE** (no tolerance band).
- Bounce vectors: higher bird bumped **−2 px** Y, lower **+2 px** Y; each one's velY **reflected and halved** if moving into the other. Horizontally shoved apart: velX negated & slowed by +2 toward 0, plus a `±(...)/2` bump to the opponent; faces set pointing away. (Pterodactyl-vs-bird bump = ±5 px.)

### 9.5 Enemies (Y velocities px/frame; use the START1/easy column for wave 1, ramp toward START3/ENDV over waves)
```
BOUNDER:  max fall 0.5..2.0 ; max rise via flap; NO cliff-avoidance; lazy flap; 500 pts; wave 1
HUNTER:   max fall 1.0..3.0 ; max rise 0.5..2.0 ; predictive cliff-avoid; 750 pts; wave 4
SHADOW LORD: max rise up to 3.0 ; shortest reaction (16 frames, down to 2); tracks player's exact
             flight line; DYTBL cliff-brake; 1500 pts; wave 16
```
Enemies spawn "dumb" (fly to nearest of 3 horizontal lines) and turn "smart" (full brain) one-at-a-time every ~15 s of dawdling (throttle `WSMART`). Killed enemies re-hatch one tier smarter. Each enemy line survives up to 4 egg/rider cycles (PEGG=4).

### 9.6 Pterodactyl
```
Kill only if: opposite facing AND player on mouth-side AND lance within ±3 px of mouth
              (open-beak attack frame) or ±2 px (other frames). Else the pterodactyl kills you.
Movement: dive cap +1.0, climb cap -0.75, cruise ±1.0 ; X up to ±3.0 px/frame (fastest actor).
Value: 1000. Baiters: max 3 on screen; spawn interval collapses from 60/45/30 s toward 1 s the
       longer you dawdle.
```

### 9.7 Eggs
```
Gravity: same 0.015625 px/frame^2. Bounce: velY_new = -(velY/4) (reverse + quarter);
   velX bleeds toward 0 by 2 per bounce; settles when |velY|<0.125 AND velX==0.
Hatch timer (frames, halved in 2-player): EGGWT 96->64->32 (min 16), egg-wave EGGWT2 94->56->34 (min 8).
Collect score: 250/500/750/1000 (per-player streak, capped at 4; resets at wave start & on death).
Catch-in-air (before bounce): +500 bonus.
Re-mount: buzzard flies in at 8 px/frame, seeks & mounts the standing rider (~6-frame settle),
   then a live enemy spawns. Player can kill the standing rider during this window.
```

### 9.8 Lava troll
```
Grab re-points victim gravity to a downward pull CLVGRA that grows +1/frame from LAVGRA (~4-8,
   higher on later waves) up to a cap of 5.0 px/frame over 30 s.
Break free when player's flaps push velY < -1.5 px/frame upward (award 50 pts).
Only 1 troll at a time; grabs on CLIF5 (X 40..240); appears ~wave 4 (bridge burns wave 3).
Lava death at Y>=230 (FLOOR+7); sink to 243, respawn after 30 frames.
Lava level rises 5 px/wave up to a ceiling.
```

### 9.9 Waves, lives, scoring
```
Starting lives: 5.  Extra life: every 20,000 points.
Wave TYPE cycle (repeat every 5): intro / TEAM(or SURVIVAL solo) / combat / GLADIATOR / EGG,
   with PTERODACTYL waves inserted from wave 8.  Table repeats past wave 80.
Bounder from wave 1, Hunter from wave 4, Shadow Lord from wave 16.
Cliff erosion via per-wave WSTATUS bits; lava bridge burns at wave 3.
Bonuses (all 3000): survival-wave-no-death, team-wave-no-friendly-kill (each player),
   gladiator first-partner-kill bounty.
Point values: egg 250/500/750/1000; bounder 500; hunter 750; shadow lord 1500;
   pterodactyl 1000; lava escape 50; player death 50; air-catch +500.
```

### 9.10 Timing/units cheat-sheet
- **1 frame = 1/60 s = 16.67 ms.** Player physics runs every frame; enemies every `EMYTIM` frames (normally 1).
- **Y velocity fixed-point**: value/256 = px/frame. `$0100` = 1.0 px/frame, `$0040` = 0.25, `$0080` = 0.5, `$0200` = 2.0.
- **Position fixed-point**: `PPOSY+1` = integer pixel, `PPOSY+2` = fraction/256. Each frame `posY_fixed += velY`.
- **PVELX** is an index (−8..+8 step 2) into the FLYX table, NOT a raw velocity.

---

## 10. UNRESOLVED / CAVEATS
- **MAXVY ($1000) / MINVY ($0400)** are defined in EQU but **never referenced** in `JOUSTRV4.ASM` — the player has no hard fall/rise velocity clamp in shipped code. Treat as design-reference only.
- **GRAV never changes per wave** — set once to 4 (only the lava troll's separate `CLVGRA` grows).
- Some symbol *definitions* (`MSGTH1`/`MSG500` glyph data, and some RAM equates like `SAFRM2`, `PLANTZ`, `PFEET` numeric values) live in *included* files (`MESSEQU2.ASM`, RAM-equate includes) not fully present as a single file; their *values/roles* were pinned by usage and sibling comments (e.g. `MSGTH3 = 3,000` confirms the `MSGTHn` = n,000 convention → `MSGTH1` = 1,000).
- No dedicated "reset egg-streak on landing" instruction found; streak resets confirmed only at wave start and on death.
- Wave-type cycle is hand-authored in the table (not a computed modulo); the 5-wave pattern is explicit in the ROM comments and verified byte-by-byte through the early waves.

*End of extract.*
