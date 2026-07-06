## Joust (Williams Electronics, 1982) — Scoring & Lives Research Note

Faithful-remake reference. Primary sources prioritized: **MAME `williams.cpp`** (hardware/inputs) and the **official Williams operator manual** (Internet Archive). Gameplay point values come from **StrategyWiki**, cross-checked against Wikipedia and community walkthroughs. Category tags: (a) ROM/manual constant, (c) well-known gameplay fact, (d) approximation.

---

### 1. Lives / Warriors

- **Default starting lives = 5** per credit ("men"/"mounts"), adjustable **1–99**, "5 recommended." — *category (a), high confidence.*
  > "The number of turns (men) per 1-credit game can be set anywhere from 1 to 99 (5 recommended)." — Williams operator manual
  > "Each gladiator has five* mounts." (the `*` marks an adjustable feature)
- **CONFLICT:** Many secondary sources (Wikipedia summaries, KLOV blurbs) claim default **3**. The official manual overrides them → **use 5** (offer 3 as an option for player expectation).
- Source: [Williams Joust manual (archive.org)](https://archive.org/stream/ArcadeGameManualJoust/joust_djvu.txt)

### 2. Extra Man (Bonus Warrior)

- **Every 20,000 points** (adjustable). — *category (a), high confidence on the 20,000; the "every/repeating" interval is community convention, medium.*
  > "Fortunately at 20,000* points … you will be awarded another bird to mount"
- Source: manual (above) + [StrategyWiki/Gameplay](https://strategywiki.org/wiki/Joust/Gameplay)

### 3. DIP Switches — important correction

- **Joust has NO gameplay DIP switches in the emulated ROM.** `INPUT_PORTS_START( joust )` in current MAME contains only controls, coin, service, tilt, and high-score-reset — **zero `PORT_DIPNAME`/`PORT_DIPSETTING`**. Lives, bonus threshold, pricing and free play are set through the **in-game CMOS operator-adjustment menu** (Advance / Auto-Up-Manual-Down service switches).
- **CONFLICT:** An older MAMEinfo-style listing shows Joust "Bonus Life 20000 60000 / 40000 90000 / 50000 120000 / None" and "Lives 3/5" as dipswitches. This does **not** match current MAME and appears copied from another Williams title — **treat as spurious for Joust.**
- Source: [MAME `williams.cpp`](https://raw.githubusercontent.com/mamedev/mame/master/src/mame/williams/williams.cpp) (path is now `src/mame/williams/williams.cpp`, formerly `src/mame/drivers/williams.cpp`).

### 4. Scoring Table (canonical — StrategyWiki, cross-checked)

| Action | Points | Confidence |
|---|---|---|
| Dismount a **Bounder** | 500 | high |
| Dismount a **Hunter** | 750 | high |
| Dismount a **Shadow Lord** | **1,500** | medium (conflict) |
| Gather 1st egg (per wave) | 250 | high |
| Gather 2nd egg | 500 | high |
| Gather 3rd egg | 750 | high |
| Gather 4th egg and beyond | 1,000 | high |
| Catch an egg in mid-air | +500 bonus | medium |
| Destroy a **pterodactyl** | 1,000 | high |
| Dismount the other player (2P) | 1,000 | medium (conflict) |
| Lose a life | 50 | medium |
| Survive a **Survival Wave** | 3,000 | high |
| **Team Wave** (co-op) bonus | 3,000 | high |
| 1st kill in a **Gladiator Wave** | 3,000 | high |

- Egg escalation **resets each wave**.
- **CONFLICT — Shadow Lord:** StrategyWiki + Wikipedia = **1,500**; classicgaming.cc walkthrough + a GameFAQs mirror = 1,000. I trust **1,500** (StrategyWiki's table is internally consistent and matches Wikipedia's tier description). Not yet verified against a 6809 disassembly.
- **CONFLICT — dismount opponent:** StrategyWiki 1,000 vs classicgaming.cc 2,000.
- Pterodactyl note: red/yellow ROM revs had a lance-collision bug making pterodactyls trivially killable; **fixed in the green-label ROM** (MAME parent `joust`).
- Sources: [StrategyWiki/Gameplay](https://strategywiki.org/wiki/Joust/Gameplay), [classicgaming.cc walkthrough](https://classicgaming.cc/classics/joust/walkthrough), [Wikipedia](https://en.wikipedia.org/wiki/Joust_(video_game)).

### 5. Enemy Tiers (behavior, from Wikipedia)

- **Bounder** — basic; flies semi-randomly, slower early, matches player speed by ~wave 3.
- **Hunter** — actively seeks/collides with the player.
- **Shadow Lord** — fastest, hugs top of screen, most aggressive.
- Each is a distinct color (red/grey/blue in common descriptions). Source: [Wikipedia](https://en.wikipedia.org/wiki/Joust_(video_game)).

### 6. Score Display / Rollover

- On-screen score is a **7-digit** field, rolls at **9,999,999** (documented by record-holders rolling the counter). — *category (c), medium confidence; no ROM citation.*
- Manual CMOS-init text seeds the high-score table default entry at **4,000 points**.
- **Free play:** Pricing Selection **code 9**. — *(a), high.*
- Sources: [Kotaku record note](https://kotaku.com/new-world-record-in-joust-awaiting-certification-5671566), manual.

### 7. Amiga Port (1988) — low confidence

- Home-computer port, reviewed **71%** in *The Games Machine* #10 (Sep 1988). Publisher/developer attribution is murky in accessible listings (a garbled "Rugby/Rubgy Circle Inc"). Specific resolution / sampled-audio / sprite-art changes were **not obtainable** from reachable sources. **Verify separately** before relying on any Amiga-specific claim.
- Source: [Amiga Magazine Rack review 47235](http://amr.abime.net/review_47235).

---

### For the Remake — concrete numbers to implement

- **Lives:** start **5** (default); option toggle for 3. Max on-screen lives cap ~ a handful (e.g. 6–9) for HUD sanity.
- **Extra man:** award +1 warrior **every 20,000 points** (repeating).
- **Point values:** Bounder **500**, Hunter **750**, Shadow Lord **1,500**, pterodactyl **1,000**.
- **Eggs:** **250 / 500 / 750 / 1,000** (1st/2nd/3rd/4th+), **reset each wave**; **+500** if caught before it lands.
- **Wave bonuses:** Survival / Team / Gladiator = **3,000** each.
- **2-player dismount:** 1,000 (or 2,000 — pick and note the source conflict).
- **Score field:** 7 digits, roll at **9,999,999**; seed high-score table at **4,000**.
- **Config model:** emulate the CMOS operator menu (lives 1–99, adjustable bonus threshold, free play) rather than fake DIP switches — that's the authentic Joust behavior.
- **Open items to close with a 6809 disassembly:** Shadow Lord 1,000 vs 1,500; extra-man one-time vs repeating; mid-air egg +500 separate or folded in.
