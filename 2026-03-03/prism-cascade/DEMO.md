# Prism Cascade — AI vs AI Demo Playthrough

**Setup:** Puzzle "The Trident." One white beam enters from the top-left. Three targets: Red (top-right), Green (bottom-center), Blue (bottom-right). Inventory: 2 prisms, 3 mirrors, 1 filter. AI-Elegant vs AI-Brute compete for highest score on the same puzzle.

---

**Turn 1 — AI-Elegant analyzes**
AI-Elegant runs its solver. White beam enters top-left traveling right. First observation: one prism near the source can split it into R/G/B immediately. But that creates three beams needing three separate redirects. With only 3 mirrors, it's tight.

Elegant places **Prism #1** at cell (2,1) — directly in the beam path. Three rays split: red goes right, green angles down-right at 30°, blue goes steeply down.

---

**Turn 2 — AI-Brute goes wild**
AI-Brute places **Mirror #1** at (6,1) — trying to deflect the entire white beam downward before splitting. Bold. Risky. The white beam bounces down. Brute places **Prism #1** at (6,4) — splits the now-downward beam into horizontal R/G/B.

---

**Turn 3 — Elegant threads the needle**
Elegant's red ray travels right and needs to reach the top-right target. But it's heading at an angle. Elegant places **Mirror #1** at (8,1) to redirect red straight up. Red hits the top-right target. TARGET ACTIVATED. The target ring glows crimson and pulses. 

Score: Elegant 40, Brute 0.

---

**Turn 4 — Elegant's green problem**
Green is heading down-right at 30°. The bottom-center target is directly below the source. Green is going the wrong direction entirely. Elegant places **Mirror #2** at (5,4) to catch the green ray and redirect it left toward center. 

Green now travels toward the bottom-center. But it's not quite aligned — will overshoot the target by 2 cells.

---

**Turn 5 — Brute cracks it**
Brute's horizontal red ray from the prism bounces off **Mirror #2** at (9,4) → up → right target. ACTIVATED. Score: Brute 40.

Then Brute places **Mirror #3** at (6,9) to catch the downward blue ray → right → bottom-right target. ACTIVATED. Score: Brute 80.

Brute still needs green. Places **Filter #1** (green-pass) at (3,7) to catch... wait. The filter is in the wrong spot — the green ray doesn't travel there. Brute's green ray hits a wall. Wasted piece.

---

**Turn 6 — Elegant adjusts**
Elegant places **Mirror #3** at (4,6) — redirecting green down through the bottom-center cell. Green hits the target. TARGET ACTIVATED. Score: Elegant 80.

Both AIs at 80. Both have activated 2/3 targets. One target left each (Elegant: blue. Brute: green).

---

**Turn 7 — The Endgame**
Elegant's blue ray is heading steeply down. The blue target is bottom-right. Elegant has 1 piece left: **Prism #2**. But it doesn't need to split — it needs to redirect. A second prism won't reflect at the right angle.

Elegant realizes: the blue ray will naturally hit the bottom-right corner. It adjusts the angle slightly using **Prism #2** as a partial deflector (a prism can act as an angled surface if beam enters at edge). Blue ray redirects to hit the bottom-right target exactly.

BLUE TARGET ACTIVATED. Score: Elegant 120.

---

**Turn 8 — Brute's Last Stand**
Brute has only **Prism #2** left. The green ray from the split is going wrong direction. Brute places the second prism in its path, which creates MORE splits. Now there's a secondary yellow ray bouncing randomly. It accidentally hits the green target. 

GREEN ACTIVATED. Score: Brute 120.

---

**Cascade Scoring**
Both solved all 3 targets. Now efficiency scoring:
- Elegant: 0 stray beams, 1 piece unused. Efficiency bonus +30.
- Brute: 2 stray beams (yellow and magenta bouncing uselessly). -20 penalty.

**Final: Elegant 150, Brute 100.**

The chamber lights up with all three beams active — a triskelion of colored light crossing the dark grid. Beam intersections create yellow, cyan, and magenta flares. The full visible spectrum represented in a 12×8 grid. Beautiful.
