# Joust (Williams, 1982) — Two-Player Simultaneous Mode

Research note for the browser remake. Every claim cited; conflicts and confidence flagged. Categories: **(a)** exact ROM constant, **(b)** measured/observed, **(c)** well-known gameplay fact, **(d)** reasoned approximation.

## 1. The two players & their mounts

- **Player 1** = yellow knight on an **ostrich**. **Player 2** = light-blue knight on a **stork**. *(c, high)* — [Wikipedia](https://en.wikipedia.org/wiki/Joust_(video_game)), [Atari CE "Mastering Joust" 1982](https://www.atarimagazines.com/cva/v1n2/joust.php), [joustmaster](https://joustmaster.com/joust-wiki/).
- **Why a stork:** the team wanted a bird with proportions similar to an ostrich but a different color to avoid confusing the two players. Lead designer **John Newcomer disliked the stork**; his headcanon is that P2 rides an *albino ostrich*. *(c, high)* — [Wikipedia](https://en.wikipedia.org/wiki/Joust_(video_game)), [TheGamer](https://www.thegamer.com/joust-arcade-game-trivia/).

### ⚠️ Stork "slower / differently tuned" — CONFLICT WITH THE BRIEF
The task brief states the stork is *"slightly slower / differently tuned."* **No source I reached supports this.** Wikipedia, the contemporary 1982 *Atari Computer Enthusiast* strategy article, MobyGames, joustmaster, StrategyWiki and pixelatedarcade all describe the two mounts as **mechanically identical** — the ostrich/stork distinction is **purely cosmetic (bird sprite + palette)**. *(d, medium — "identical" is well-attested folklore; "slower" is not.)* This can only be settled by the **6809 ROM disassembly** (a per-player velocity/flap table), which I could not fetch. **Recommendation: treat "stork is slower" as unverified.**

## 2. Co-op vs competitive — wave structure

Joust was notable as one of the first two-player *simultaneous* arcade games. Both players are on screen at once and score **independently** for enemies AND for unseating the human opponent. *(c, high)* — [co-optimus](https://www.co-optimus.com/article/1616/www.co-optimus.com/system/1/xbox-360.html).

The game alternates the *incentive* via special waves:

| Wave type | Occurs on | Incentive | Bonus |
|---|---|---|---|
| **Team / Survival** | Wave **2** and every 5th (2, 7, 12, 17…) | Cooperate; don't unseat each other | **3000 pts to EACH** player who survives without losing a mount *(operator-adjustable)* |
| **Gladiator** | Wave **4** and every 5th (4, 9, 14, 19…) | Kill your partner | **3000 pts to the FIRST** player to unseat the other |

*(c; bonus values high confidence, wave-number schedule medium.)* — [rentmyarcade](https://rentmyarcade.net/content/joust), [War_Doc GameFAQs FAQ](https://gamefaqs.gamespot.com/arcade/584163-joust/faqs/25324), [classicgaming.cc walkthrough](https://classicgaming.cc/classics/joust/walkthrough), [Atari CE 1982](https://www.atarimagazines.com/cva/v1n2/joust.php).

- **Gladiator wave exists only in a 2-player game.** *(c, high)* — [co-optimus](https://www.co-optimus.com/article/1616/www.co-optimus.com/system/1/xbox-360.html).
- The 3000 bonus is an **operator-adjustable** value (default 3000), not a fixed ROM literal. *(c, medium)* — [rentmyarcade](https://rentmyarcade.net/content/joust), [arcade-museum forums](https://forums.arcade-museum.com/threads/joust-settings.247870/).

### Bounty-value conflict (resolved)
[rentmyarcade](https://rentmyarcade.net/content/joust) leaves the *Gladiator* figure "not specified," but co-optimus, classicgaming.cc, the War_Doc FAQ and the 1982 Atari CE article all give **3000**. → **Resolved to 3000 (high).**

## 3. Player-vs-player collision / bounce

Standard Joust lance rule applies to **P1 ↔ P2** exactly as to enemies:
- **Higher lance wins** — unseats the lower rider (→ that rider dies / drops an egg; on a Gladiator wave the winner collects the 3000 bounty).
- **Equal-height collision REPELS both characters apart** — i.e., yes, players **bounce off each other**. *(c, high)* — [Wikipedia](https://en.wikipedia.org/wiki/Joust_(video_game)), [joustmaster](https://joustmaster.com/joust-wiki/).

No source indicates special-cased player-player restitution; behavior mirrors an equal-height enemy bounce. *(d, medium — a disassembly check would confirm the exact impulse.)*

## 4. Supporting scoring (shared by both players)

*(c, high — [Atari CE 1982](https://www.atarimagazines.com/cva/v1n2/joust.php), [classicgaming.cc](https://classicgaming.cc/classics/joust/walkthrough))*

- **Eggs:** 1st = 250, 2nd = 500, 3rd = 750, 4th and thereafter = **1000**. **+500** for catching an egg in mid-air (before it lands).
- **Enemies:** Bounder **500**, Hunter **750**, Shadow Lord **1500**.
- **Pterodactyl:** **1000** (the classic lance-into-open-beak "wave" kill).

## 5. Hardware timing (Williams 6809) — for frame-accurate feel

From the MAME driver (`SCREEN_RAW_PARAMS(MASTER_CLOCK*2/3, 512, 10, 304, 260, 7, 245)`, `MASTER_CLOCK = 12 MHz`): *(b, high)* — [MAME historic driver](https://raw.githubusercontent.com/mamedev/historic-mame/master/src/mame/drivers/williams.c), [Sean Riddle hardware notes](https://seanriddle.com/willhard.html).

- **VSync ≈ 60.096 Hz** (game logic ticks per frame at this rate).
- **Pixel clock = 8 MHz** (12 MHz × 2/3).
- **Visible area ≈ 292–294 × 240**; full framebuffer **304 × 256, 4 bpp**.
- CPU: **Motorola 6809E @ 1 MHz**; the video counter reloads with `0x3F00` giving the `count240` mid-frame interrupt scheme.
- Note: MAME emulates the 6809 ROM, so *gameplay* constants (bird speeds, exact bounce impulse) live in the ROM/disassembly, not MAME's C source.

## 6. Amiga port (1988) — secondary
Published by **Atari**, **reverse-engineered from the Atari ST version by Philippe Guichardon**; reviewed **71%** in *The Games Machine* #10 (Sep 1988). Specific graphics/audio changes could not be extracted (magazine scan has no text layer). *(c, low)* — [Amiga Magazine Rack review](http://amr.abime.net/review_47235), [Lemon Amiga forum](https://www.lemonamiga.com/forum/viewtopic.php?t=9842).

---

## For the remake — concrete numbers to implement

1. **Mounts:** ostrich (P1) and stork (P2) with **identical physics**; differ only by sprite/palette. Ship no speed penalty by default. *(Optional hidden toggle for a ~3–5% stork penalty only if the disassembly later confirms it.)*
2. **Gladiator waves** = waves **4, 9, 14, 19, …** → award **3000** to the **first** player to unseat the other (2-player only).
3. **Team/Survival waves** = waves **2, 7, 12, 17, …** → award **3000 to each** player who finishes the wave without losing a mount / without being unseated by the partner.
4. **P-vs-P collision:** reuse the lance-height resolver — higher lance unseats lower; **equal height → symmetric bounce impulse** on both riders.
5. **Config constants:** `SURVIVAL_BONUS = 3000`, `GLADIATOR_BOUNTY = 3000` (make adjustable to mirror the operator DIP).
6. **Scoring:** eggs 250/500/750/1000 (+500 air-catch), Bounder 500 / Hunter 750 / Shadow Lord 1500 / Pterodactyl 1000.
7. **Timing:** run the fixed game step at **~60.096 Hz** for authentic feel.
