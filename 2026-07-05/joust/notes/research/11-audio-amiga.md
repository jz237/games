## Joust (Williams, 1982) — Audio System & Amiga Port

Research for a faithful browser remake. Primary sources: the **original game source** (`historicalsource/joust`), the **original sound-ROM source** (`williams-soundroms` / `synamaxmusic/joust` retarget of VSNDRM4), **MAME** hardware models, and Sean Riddle's hardware notes. These are cited inline; wikis are used only for corroboration.

> **Major correction to the brief:** Joust arcade has **no attract-mode music and no "iconic fanfare tune."** It is **sound-effects only**. The premise of an iconic START tune is a misconception — see the Music section.

---

### 1. Sound hardware (the separate Williams sound board)

| Component | Value | Source / confidence |
|---|---|---|
| Sound CPU | Motorola **M6808** (6802 pin-compatible) | MAME `williamssound.cpp`; Sean Riddle — **high** |
| Sound CPU clock | **3,580,000 Hz** (~3.58 MHz) | MAME S4 board block — **high** |
| DAC | **MC1408, 8-bit** (via PIA port A) | MAME + Sean Riddle + sound-ROM `STAB SOUND` — **high** |
| PIA (sound side) | **MC6821 at $0400** | `VSNDRM4.ASM` (`SOUND EQU $400`), MAME — **high** |
| Command bus | **6-bit** (B0-B5), IRQ handshake on B7 | game `EQU.SRC` — **high** |
| Sound ROM | **VSNDRM4**, 4 KB at **$F000-$FFFF**, IRQ-driven | `williams-soundroms` — **high** |
| Main CPU | Motorola **6809** | MAME / KLOV — high |
| Audio out | Amplified **mono**, single channel | arcade-museum.com — high |

The main 6809 writes a 6-bit **sound command** to its PIA (label `SOUND EQU $C80E` in `EQU.SRC`); this drives 6 lines into the sound board's 6821, which **IRQs the M6808**. The 6808's IRQ handler (`VSNDRM4.ASM`) reads the command and dispatches to a synthesis routine. **All audio is real-time synthesized to the 8-bit DAC — there is no PCM sample playback.**

**Conflict — "6-bit vs 8-bit":** hobby sources sometimes call Williams sound "6-bit." That is the **command** width (B0-B5). The **DAC is 8-bit** (MC1408), confirmed by MAME, Sean Riddle, and the ROM's 8-bit `STAB SOUND` writes. *(cite: williamssound.cpp; seanriddle.com/willhard.html)*

---

### 2. Synthesis engine (from VSNDRM4)

The IRQ dispatcher splits commands into four synthesis families (from `VSNDRM4.ASM`):

- **GWAVE** (grouped-waveform oscillators), commands ≈ **$01-$13** — most in-game blips (egg, thud, mount, bounty, lava, credit, transporter, extra-man, etc.). Waveform vectors live in `SVTAB` (labels `DP1V/PROTV/SVA…` are Sinistar-derived generic names; the game references them only by command byte).
- **Jump-table block, $14-$1E** (`JMPTBL`): LITE (lightning), SND4/SND5, THNDR (thunder), ATARI, PERK, SQRT, KNOCK, WHIST, SETUP, WINGDN.
- **JKNOIS noise waveforms, $1F-$21**: `WING UP`, `CLIP`, `CLOP`, `WING DOWN` — the **flap** and **footstep** textures.
- **WALSH-function sound machine, $22-$27** (`WALSHT`): **PTERODACTYL SCREAM** ($22/$23 internal) and **OSTRICH STOP / skid** ($24/$25 internal). Tim Murphy's Walsh macros; the `synamaxmusic` project reproduces these bit-exact.

---

### 3. Complete sound-command map (authoritative — from `JOUSTRV4.SRC` SOUND TABLE)

Format in ROM: `label FCB priority, command, length(frames)`. Command range **$01-$3E**; `$00` extends timer; `$FF` kills a sound. Lengths are in 1/60 s frames.

| Event | Label | Command | Priority | Notes |
|---|---|---|---|---|
| **Flap — wing up** (player) | SNPLWU | **$21** | 10 | enemy SNELWU same $21 |
| **Flap — wing down** (player) | SNPLWD | **$20** | 10 | enemy SNELWD same $20 |
| **Walk/run leg 1 (CLIP)** | SNPRU1 | **$22** | 10 | enemy SNERU1 same |
| **Walk/run leg 2 (CLOP)** | SNPRU2 | **$23** | 10 | enemy SNERU2 same |
| **Skid start** | SNPLSK | **$26** | 10 | enemy SNEMSK; internal WALSHT $24 "OSTRICH STOP" |
| **Skid end** | SNPLS2 | **$27** | 10 | enemy SNEMS2; internal WALSHT $25 |
| **Fall (stops skid)** | SNPFAL | **$FF** (kill) | 10 | |
| **Thud / landing** | SNPTHD / SNETHD | **$08** | 20 / 9 | "at least 1 person thud'ed" |
| **Cliff thud** | SNCTHD | **$06** | 10 | |
| **Egg — player hits egg** | SNEGG | **$03** | 45 | |
| **Egg — hatching** | SNEGGH | **$02** | 45 | |
| **Enemy dies / unseat** | SNEDIE | **$16** | 40 | |
| **Player dies** | SNPDIE | **$16** | 80 | shares $16 |
| **Pterodactyl scream** | SNPTE | **$24** | 65 | WALSH "PTERODACTYL SCREAM" |
| **Pterodactyl intro scream** | SNPTEI | **$24**→**$25** | 65 | |
| **Pterodactyl dying** | SNPTED | **$16** (pulsed) | 66 | 4 short + 1 long |
| **Lava troll grab** | SNTROL | **$09** | 50 | "captured by lava troll" |
| **In lava** (player/enemy) | SNPLAV/SNELAV | **$0D** | 60/40 | |
| **Enemy re-create (transporter)** | SNECRE | **$07** | 40 | |
| **Player re-create (transporter)** | SNPCR1 | **$12**→fade **$14** | 70 | P2 uses $12→$15 |
| **Mount the buzzard** | SNMOUN | **$0C** | 45 | enemy mounting bird |
| **Collect bounty** | SNBOUN | **$1C** | 50 | |
| **Cliff destroyer** | SNCLIF | **$19** | 67 | |
| **Extra life / replay** | SNREPL | **$0B** | 100 | "EXTRA MAN" |
| **Game start** | SNGS | **$1B** | 200 | single short cue |
| **Credit change** | SNCRED | **$0A** | 200 | |
| **High-score-to-date / name-entry jingle** | SNHIGH / SNHI2 | **$0F/$10/$11/$18/$1A** seq | 190 | the only "melody" |

*(cite: github.com/historicalsource/joust/blob/main/JOUSTRV4.SRC)*

Note the deliberate **sound sharing**: player & enemy use the same wing/run/skid/thud commands; player-dies and enemy-dies both use **$16**. The **priority byte** governs which sound wins when several fire — reproduce this for authenticity (scream 65, egg 45, thud 10-20, extra-man 100, game-start/credit 200).

---

### 4. Music? — There is none

`JOUSTRV4.SRC` contains **no music track**. The only multi-note sequence is **SNHIGH**, the high-score name-entry jingle (a scripted list of $0F/$10/$11/$18/$1A GWAVE commands with per-note frame lengths). `SNGS` "game start" is a **single** $1B command, length 1 frame — a short sting, not a fanfare. Wikipedia corroborates designer **John Newcomer** deliberately prioritized the **wing-flap SFX** above other audio and did not add musical accompaniment. **The brief's "iconic START/attract fanfare tune" does not exist in the arcade game.** *(cite: JOUSTRV4.SRC; en.wikipedia.org/wiki/Joust_(video_game))*

---

### 5. MAME / recreation resources

- **MAME**: hardware/interrupt/DAC model in `src/mame/shared/williamssound.cpp` (M6808 @ 3.58 MHz, MC1408, PIA6821). The Joust game driver lives under `src/mame/midway/` (Williams 6809 video driver). MAME emulates the **original ROMs**, so exact gameplay/sound constants come from the ROM/disassembly above, not MAME. *(cite: raw.githubusercontent.com/mamedev/mame/.../williamssound.cpp)*
- **Original sound-ROM source**: `historicalsource/williams-soundroms/VSNDRM4.SRC`.
- **Buildable retarget + annotations**: `synamaxmusic/joust` (VSNDRM4.ASM) — reproduces the Walsh scream/skid bit-exact.
- **Original game source**: `historicalsource/joust` (JOUSTRV4.SRC = latest revision, the SOUND TABLE above).
- **Hardware notes**: seanriddle.com/willhard.html.

---

### 6. Amiga port (1988) — and an important identity conflict

There are **two different Amiga Jousts** that web searches conflate:

1. **1988 commercial home port** — reviewed in **The Games Machine** issue 10 (Sep 1988), scored **71%**, £14.99. Part of the Atari Corporation home-port family (released alongside the Atari ST version). The **ST version** is well-regarded: "detailed sprites and lovely animations," a "belting conversion," gameplay "spot-on perfect." *(cite: amr.abime.net/review_47235; ataricrypt.blogspot.com/2018/09/joust.html)*
2. **~2012-2013 fan port** — reverse-engineered from the Atari ST version by **Philippe Guichardon (Meynaf)**. **Not** the 1988 release. *(cite: blog.amigaguru.com/fight-oh-wait/)*

**What the port "improved" (partly unverified):** Home 16-bit versions ran at higher resolution than the arcade's ~292×240 raster and had cleaner, larger sprite art than the 2600/7800 ports. The Amiga's **Paula** chip (4× 8-bit PCM channels) *could* play digitized/sampled SFX and add music — but **no primary source reached confirms the 1988 Amiga/ST Joust actually shipped sampled SFX or added music.** Treat "improved sampled sound + added music" as **plausible-but-unverified**. *(cite: en.wikipedia.org/wiki/Amiga; wiki.amigaos.net SAMP IFF)*

**Recommendation:** use the **arcade** as the authoritative audio/gameplay reference. Borrow from the Amiga/ST port only for **higher-res sprite artwork**, and only after confirming the specific port + licensing (abime.net Hall of Light and MobyGames were 403-blocked here; fetch via a browser tool to pin the exact publisher/developer).

---

### 7. For the remake — concrete recommendations

- **Audio = SFX-only, no music/fanfare.** This is the faithful choice. If you want a title tune, label it an original addition, not a recreation. Optionally recreate the **high-score name-entry jingle** (SNHIGH) as the one canonical "melody."
- **Model ~13-15 distinct SFX**, triggered by the exact **command→event table** in §3, and honor the **priority bytes** for sound-preemption.
- **Synthesize, don't sample** (Web Audio API) — matches the arcade (all synthesized) and avoids licensing issues:
  - *Flap*: short filtered **white-noise burst** with a fast amplitude envelope (~60-100 ms), pitched up on wing-up.
  - *Clip/Clop (walk)*: two shorter, lower noise ticks alternating per foot.
  - *Thud*: very short low noise/click.
  - *Skid*: swept-pitch tonal noise (down-glide), with a distinct short "end skid" tail.
  - *Egg hit / hatch*: short descending square/GWAVE blips ("bloop").
  - *Pterodactyl scream*: harsh swept oscillator + noise (the Walsh-style buzz), longer (~120 frames ≈ 2 s).
  - *Enemy/player die*: same short percussive "$16" hit for both.
  - *Transporter spawn*: rising→fading tone ($12 then fade $14/$15).
  - *Extra life*: distinct rising chime ($0B), high priority.
- **Timing base**: SOUND TABLE lengths are in **1/60 s frames** (e.g. SNTROL=30 ⇒ ~0.5 s, SNPTE=120 ⇒ ~2 s). Use 60 Hz as the SFX tick to match durations.
- **Graphics**: target ~292×240 logical arcade resolution scaled up; if borrowing Amiga sprite art, verify the exact 1988 port and its rights first.
