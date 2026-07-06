# Joust (Williams, 1982) — Flap Physics Research Note

**Scope:** Player mount (ostrich/stork) flight physics: gravity, flap impulse, horizontal acceleration, braking/skid, terminal velocities, momentum/inertia. For a faithful browser remake.

**Primary source:** The original 6809 assembly source, released as [historicalsource/joust](https://github.com/historicalsource/joust) (main game file `JOUSTRV4.SRC`, ~193 KB / 8000+ lines). This is the actual shipped ROM source — the definitive authority for gameplay constants. MAME emulates this same 6809 ROM, so MAME's driver only gives hardware/video timing; the *gameplay* numbers live in this source. All "rom-constant" facts below are quoted directly from it.

---

## 0. Frame basis (READ FIRST)

Every physics number here is **per video frame at ~60 Hz**.

- Refresh: **60.096154 Hz**, i.e. **~16.64 ms/frame**, **16,640 CPU cycles/frame** (MC6809E @ 1.0 MHz). Sources: [PixelatedArcade techspecs](https://pixelatedarcade.com/games/joust/techspecs), [Sean Riddle hardware](https://seanriddle.com/willhard.html) (14-bit video counter reloaded to `0x3F00`, 16640 counts = 16.64 ms).
- The game uses a **cooperative multitasking scheduler** (`SYSTEM.SRC`, `EXEC`/`NAPTPC`): each process's `PNAP` counter is decremented once per main-exec pass (once per frame). The **player's nap time is `PLYTIM FCB 1`** → the player flap/run loop **runs once per frame**. So GRAV, FLYX displacement, etc. are all applied every ~16.64 ms.

Conversions used: velocity/position are **16-bit fixed point, 8 fractional bits** (integer pixels in the high byte). So `$0100` = 1.0 px, `$0040` = 0.25 px. Velocity units: `256 units = 1 px/frame`.

---

## 1. Gravity (downward pull)

```
GRAV     EQU  4              ; initialised: LDA #4 / STA GRAV
ADDGRA   ADDB GRAV           ; add to Y-velocity every frame
         SEX
         ADDD PVELY,U
         STD  PVELY,U        ; new Y velocity
```

- **+4 velocity-units added to `PVELY` every frame** = **+0.0156 px/frame added to fall speed each frame** → gravitational acceleration ≈ **0.0156 px/frame² ≈ 56 px/s²**. *(rom-constant, high)*
- **Wings-up penalty:** when the flap button is released (wings up loop `FLIPS2`), an extra offset is added: `LDB #$04` → effective downward term **GRAV+4 = 8 units/frame**. Wings-down loop (`FLAPS2`) passes `CLRB` (no offset). **You fall roughly twice as fast with wings up.** *(rom-constant, high)*

---

## 2. Flap impulse (upward kick)

On a fresh flap (`GOFLAP → ADDFLP`):

```
ADDFLP  LDB  PTIMUP,U        ; time aloft since last flap (0..255, saturates)
        LDA  #256*96/255     ; scale
        MUL
        TFR  A,B
        CLRA
        SUBD #96             ; deltaY = scaled(PTIMUP) - 96
        ADDD PVELY,U
        STD  PVELY,U
```

- **Base single-flap impulse ≈ −96 velocity-units** (upward; negative = up) ≈ **−0.375 px/frame** applied instantly. *(rom-constant, high)*
- The `(256*96/255)*PTIMUP` term grows with time aloft (0..~96 over 0..255 frames), so `deltaY` blends from ≈ −96 (just flapped → strong kick) toward ≈ 0 (long aloft → weak). **Net: rapid taps climb; sustained/late flaps barely offset gravity.** This is the core "flap to hold altitude" mechanic. *(formula high; resulting feel medium)*
- **Initial launch off the ground** (`STFLY`): `LDD #-$0080 / STD PVELY` → **−128 units = −0.5 px/frame** upward. *(rom-constant, high)*
- **Anti-mash lockout:** after each flap, `PACCX := 5` ("WING DOWN MINIMUM TIME"), counted down 1/frame; wings must stay down ~5 frames before the next wing-up cycle. `STFALL` sets `PACCX := 10`. *(rom-constant, high)*

---

## 3. Horizontal acceleration & maximum speed

Horizontal thrust is applied **per-flap**, not continuously:

```
        LDA  CURJOY          ; joystick: -1 / 0 / +1
        ASLA                 ; x2  -> -2 / 0 / +2
        ADDA PVELX,U         ; accumulate into velocity index
        CMPA #MAXVX          ; clamp ...
```

- Each flap adds **±2 to the velocity index `PVELX`** toward the held direction. *(rom-constant, high)*
- **`MAXVX EQU 8`** → `PVELX` clamped to **−8..+8**. *(rom-constant, high)*
- `PVELX` is an **index into `FLYX`**, the per-frame displacement table (applied every frame in `ADDGRX`):

```
FLYX    FDB  $0000   ; idx 0 -> 0.00 px/frame
        FDB  $0040   ; idx 1 -> 0.25 px/frame
        FDB  $0080   ; idx 2 -> 0.50 px/frame
        FDB  $0100   ; idx 3 -> 1.00 px/frame
        FDB  $0200   ; idx 4 -> 2.00 px/frame
```

- **Realized top horizontal speed ≈ 2.0 px/frame ≈ 120 px/s.** The table has only 5 entries, so indices above 4 saturate at `$0200`. The `MAXVX=8` cap is the *accumulator* limit; `~2 px/frame` is the *realized* speed. *(rom-constant, high; see conflict note)*

---

## 4. Momentum / inertia (the signature feel)

- **Horizontal velocity persists frame-to-frame with NO air friction.** `PVELX` is stored and carried; the per-frame code only adds `FLYX[PVELX]` (+ a fractional accumulator `PVELX+2`) to position — it never decays `PVELX`. *(rom-constant, high)*
- **Momentum bleeds ONLY by flapping the opposite direction** (each reverse flap subtracts 2 from the index). You cannot stop dead or reverse instantly in the air. This is exactly the widely-described "beautifully realized" inertia — [Wikipedia](https://en.wikipedia.org/wiki/Joust_(video_game)), [StrategyWiki](https://strategywiki.org/wiki/Joust/Gameplay), [PrimeTime Amusements](https://primetimeamusements.com/getting-good-joust/). *(corroborated, high)*

---

## 5. Skid / turnaround (ground slide)

Reversing direction while running enters a multi-frame **skid** state chain (each `STATE` = `WAIT, HCALL, WCALL, MINUS, ZERO, PLUS, FLYVEL`):

```
PLYFR  STATE 1,RUNR ,PLYIR,PLYFR,PLYFR,8   ; fastest run
PLYIR  STATE 2,SKIDR,PLYJR,PLYJR,PLYER,6   ; reverse -> skid
PLYJR  STATE 2,SKIDR,PLYKR,PLYKR,PLYDR,4
PLYKR  STATE 2,SKIDR,PLYLR,PLYLR,PLYDR,4
PLYLR  STATE 4,SKIDR,PLYMR,PLYMR,PLYCR,2
PLYMR  STATE 4,SKIDR,PLYBR,PLYBR,PLYCR,2
```

- Reversing from a fast run routes through `SKIDR` frames with `WAIT` holds of 2–4 frames each → the mount **slides ~10–16 frames** before it can move the other way. This is the Road-Runner "skid to a halt" sound + slide. The last column (`FLYVEL` = 0/2/4/6/8) is the flight velocity index carried into the air from each running speed. *(rom-constant, high)*
- Strategy corroboration: players are told to bounce off ledges or fly across rather than reverse mid-air, because of this inertia + skid. *(known-fact, high)*

---

## 6. Terminal velocities & world bounds

```
MAXVY  EQU $1000   ; max fall Y-velocity = 4096 units = 16.0 px/frame (~960 px/s)
MINVY  EQU $0400   ; max rise Y-velocity = 1024 units =  4.0 px/frame (~240 px/s)
CEILNG EQU $0020   ; ceiling (highest Y); hitting it inverts upward velocity
FLOOR  EQU $00DF   ; floor / lava (lowest Y) -> death
ELEFT  EQU -10     ; screen wrap left
ERIGHT EQU 292     ; screen wrap right (horizontal wrap-around)
```

- Fall cap **16 px/frame**, rise cap **4 px/frame** are the intended design caps. *(rom-constant values high; but see conflict — the explicit clamp code I found is on the enemy/pterodactyl Y paths (`PTEUP`/`PTEDN`), so player Y may be bounded chiefly by the flap mechanic + collisions.)* *(medium)*
- Ceiling bump inverts upward velocity (`ADDGRX`: `COMA/NEGB/SBCA #-1`); floor/lava contact kills. Horizontal screen **wraps**. *(rom-constant, high)*

---

## 7. Hardware context (not physics, for completeness)

- Main CPU **MC6809E @ 1.0 MHz**; sound CPU **MC6808 @ 3.579545 MHz**; visible raster **292×240** ([PixelatedArcade](https://pixelatedarcade.com/games/joust/techspecs), [Sean Riddle](https://seanriddle.com/willhard.html)). Full framebuffer 304×256 @ 4bpp (border/overscan).

---

## 8. Amiga port (1988) — out of scope, low confidence

No authoritative source found for exact physics changes; reviewed in *The Games Machine* #10 (Sep 1988), 71% ([amr.abime.net review 47235](http://amr.abime.net/review_47235), [Lemon Amiga](https://www.lemonamiga.com/games/details.php?id=4299)). **Note:** "Parachute Joust" on Amiga is a *different, unrelated* game. Treat any Amiga port as a re-implementation, **not** a source of authentic constants.

---

## For the remake — concrete numbers to implement

Run a **fixed 60 Hz tick** (16.64 ms) with a sub-pixel (8.8 fixed-point or float) position/velocity model. All units below are **px/frame at 60 Hz**.

| Quantity | Value (px/frame @60Hz) | ROM origin |
|---|---|---|
| Gravity accel (wings down) | +0.0156 /frame added to vy | `GRAV=4` |
| Gravity accel (wings up) | +0.0313 /frame added to vy (2×) | `GRAV+4=8` |
| Flap impulse (base) | −0.375 to vy, instant | `ADDFLP` −96 |
| Flap impulse decay | scales down with frames since last flap (`PTIMUP` term); ≈0 when long aloft | `(256*96/255)*PTIMUP−96` |
| Initial launch vy | −0.5 | `STFLY −$0080` |
| Wing-down lockout | ~5 frames min between flaps | `PACCX=5` |
| Horizontal thrust per flap | ±0.25 index step (±2 in index units) toward stick | `CURJOY*2` |
| Max horizontal speed | ~2.0 px/frame (~120 px/s) | `FLYX` top = `$0200`, `MAXVX=8` cap |
| Horizontal speed steps | 0 / 0.25 / 0.5 / 1.0 / 2.0 | `FLYX` table |
| Air friction | **none** — momentum fully persists | (no decay in source) |
| Momentum bleed | only via reverse flaps (−0.25 index/flap) | `ADDFLP` |
| Max fall speed | 16 px/frame (~960 px/s) design cap | `MAXVY=$1000` |
| Max rise speed | 4 px/frame (~240 px/s) design cap | `MINVY=$0400` |
| Ground skid | multi-frame slide (~10–16 frames) on run reversal, cannot turn instantly | `PLYHR..PLYMR` `SKIDR` |
| Ceiling behavior | bump inverts upward velocity | `ADDGRX` |
| Horizontal wrap | wrap around screen edges | `ELEFT=-10 / ERIGHT=292` |

**Feel priorities (in order):** (1) flap = instantaneous upward impulse with diminishing returns when mashed + a ~5-frame lockout; (2) wings-up falls ~2× faster than wings-down; (3) horizontal momentum never self-decays — only reverse-flaps bleed it; (4) a visible multi-frame ground skid on reversal. Get these four right and it will read as Joust.

*Verify the two medium-confidence items (player Y terminal caps; FLYX indices 5–8 saturation) against a MAME frame-step + memory watch if you need pixel-exact fidelity.*
