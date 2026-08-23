# MISSING-AUDIO.md — Release 1.6 "LOUD" voice work order

> INTERNAL WORK ORDER — fine to commit to jz237/games, but keep this file out
> of the publish mirror (do not add it to the deploy/publish list). It is the
> exact ElevenLabs batch to run the moment auth is fixed (a real `sk_` key —
> the config currently holds a key ID).

Every system below already ships and runs with zero mp3 files: captions show
the exact lines, missing banks are HEAD-probed once per session and skipped
silently, and single-take fighter cues get deterministic playbackRate/detune
jitter. **Drop a file at its canonical path and it joins the rotation on the
next page load — no code changes needed.** Banks are contiguous: the probe
stops at the first missing number, so generate `-1` before `-2` before `-3`.

Announcer voice (all `assets/audio/announcer/` files): one voice — a deep,
gritty arena MC. Short, punchy takes with hard consonants and a little tail
reverb feel; no music, no crowd, clean mono. Target loudness matched to the
existing `assets/audio/final-blow.mp3` call.

Line text below is exact and positional: take `-1` speaks line 1, `-2` line 2,
and so on (`ANNOUNCER_LINES` in game.js mirrors this table — keep both in sync
if a line changes).

## Priority 1 — announcer core

### Round / fight flow

| File | Line to speak |
| --- | --- |
| assets/audio/announcer/round1-1.mp3 | ROUND ONE |
| assets/audio/announcer/round1-2.mp3 | ROUND ONE — SETTLE IT |
| assets/audio/announcer/round1-3.mp3 | FIRST ROUND — FIGHT'S ON |
| assets/audio/announcer/round2-1.mp3 | ROUND TWO |
| assets/audio/announcer/round2-2.mp3 | SECOND ROUND |
| assets/audio/announcer/round2-3.mp3 | ROUND TWO — NO MERCY |
| assets/audio/announcer/finalround-1.mp3 | FINAL ROUND |
| assets/audio/announcer/finalround-2.mp3 | LAST ROUND — MAKE IT COUNT |
| assets/audio/announcer/finalround-3.mp3 | THE FINAL ROUND |
| assets/audio/announcer/fight-1.mp3 | FIGHT! |
| assets/audio/announcer/fight-2.mp3 | GET IT ON! |
| assets/audio/announcer/fight-3.mp3 | THROW DOWN! |
| assets/audio/announcer/fight-4.mp3 | GO! |
| assets/audio/announcer/finishthem-1.mp3 | FINISH THEM! |
| assets/audio/announcer/finishthem-2.mp3 | END THIS! |
| assets/audio/announcer/finishthem-3.mp3 | PUT THEM DOWN! |
| assets/audio/announcer/ko-1.mp3 | K.O.! |
| assets/audio/announcer/ko-2.mp3 | KNOCKOUT! |
| assets/audio/announcer/ko-3.mp3 | IT'S OVER! |
| assets/audio/announcer/ko-4.mp3 | LIGHTS OUT! |
| assets/audio/announcer/perfect-1.mp3 | PERFECT! |
| assets/audio/announcer/perfect-2.mp3 | UNTOUCHABLE! |
| assets/audio/announcer/perfect-3.mp3 | NOT A SCRATCH! |
| assets/audio/announcer/guardcrush-1.mp3 | GUARD CRUSH! |
| assets/audio/announcer/guardcrush-2.mp3 | DEFENSE SHATTERED! |
| assets/audio/announcer/guardcrush-3.mp3 | THE GUARD BREAKS! |

### Fighter name calls (select lock-in + VS slam)

Three deliveries of the same name per fighter: 1 = neutral call, 2 = hyped,
3 = drawn-out showcase. Direction: announcer relishes the name.

| Fighter | Files (3 takes each) | Line to speak |
| --- | --- | --- |
| DEATHBLOW | assets/audio/announcer/deathblow-name-1.mp3 … -3.mp3 | DEATHBLOW |
| JEZ | assets/audio/announcer/jez-name-1.mp3 … -3.mp3 | JEZ |
| ALLAN | assets/audio/announcer/alan-name-1.mp3 … -3.mp3 | ALLAN |
| POST | assets/audio/announcer/post-name-1.mp3 … -3.mp3 | POST |
| BENNY | assets/audio/announcer/benny-name-1.mp3 … -3.mp3 | BENNY |
| DONALD TRUMP | assets/audio/announcer/donald-name-1.mp3 … -3.mp3 | DONALD TRUMP |
| CYRAXX | assets/audio/announcer/cyraxx-name-1.mp3 … -3.mp3 | CYRAXX |
| ALI G | assets/audio/announcer/ali-name-1.mp3 … -3.mp3 | ALI G |

### Fighter win calls (after the KO call)

Take lines are positional per fighter (`<NAME>` = the name in the table above):
`-1` = "`<NAME>` WINS!", `-2` = "THE WINNER — `<NAME>`!", `-3` = "`<NAME>` TAKES IT!".

| Fighter | Files |
| --- | --- |
| DEATHBLOW | assets/audio/announcer/deathblow-wins-1.mp3 … -3.mp3 |
| JEZ | assets/audio/announcer/jez-wins-1.mp3 … -3.mp3 |
| ALLAN | assets/audio/announcer/alan-wins-1.mp3 … -3.mp3 |
| POST | assets/audio/announcer/post-wins-1.mp3 … -3.mp3 |
| BENNY | assets/audio/announcer/benny-wins-1.mp3 … -3.mp3 |
| DONALD TRUMP | assets/audio/announcer/donald-wins-1.mp3 … -3.mp3 |
| CYRAXX | assets/audio/announcer/cyraxx-wins-1.mp3 … -3.mp3 |
| ALI G | assets/audio/announcer/ali-wins-1.mp3 … -3.mp3 |

## Priority 2 — fighter reactive cues

Per-fighter voices — match each persona (kit docs: `engine/fighter-kits.mjs`
archetypes, `CYRAXX.md`). These are vocalisations, not scripted words; the
"line" column is the performance direction. 3 takes per cue per fighter:
`<cue>.mp3`, `<cue>-2.mp3`, `<cue>-3.mp3` under `assets/audio/fighters/<id>/`.
Until these exist the game pitch-shifts the nearest recorded take
(dizzy→hit-heavy ×0.86, counter→special ×1.09, tech→block ×1.06,
desperation→hit-light ×0.93, scream→fatal ×1.14, crush→block ×0.78).

| Cue | Performance | Length |
| --- | --- | --- |
| dizzy | woozy dazed groan, head-spinning babble | 0.8–1.2s |
| counter | sharp triumphant bark on landing a counter-hit ("GOTCHA!" energy, in persona) | 0.4–0.8s |
| tech | strained escape shout breaking a throw | 0.4–0.7s |
| desperation | panicked low-health snarl / ragged breathing burst (fires once per round under 20%) | 0.8–1.2s |
| scream | full fatality death scream — must read bigger and longer than the existing `ko.mp3` groan | 1.0–2.0s |
| crush | guard-shatter cry — arms blown open, staggered disbelief (Release 1.7 GUARD CRUSH) | 0.6–1.0s |

Voice directions per fighter:

| Fighter (id) | Persona / voice direction |
| --- | --- |
| DEATHBLOW (deathblow) | Seismic bruiser-grappler. Huge, gravel-deep chest voice; slow monster grunts, earthquake rumble. |
| JEZ (jez) | Blue-gi signsmith, neon footsies. Confident mid-range martial artist; crisp kiai energy, slightly playful. |
| ALLAN (alan) | South Philly heavyweight counter-puncher. Thick Philly accent, gruff bar-brawler low bark. |
| POST (post) | Spray-can graffiti zoner. Young, cocky, nasal street-punk; quick taunting edge. |
| BENNY (benny) | Street technician, electrical rushdown. Wiry and fast; clipped, crackling shouts. |
| DONALD TRUMP (donald) | Gilded showman, golf-club keep-away. Brash bluster, self-satisfied drawl, showman projection. |
| CYRAXX (cyraxx) | Feedback trickster (see CYRAXX.md). Unhinged chaos gremlin; cracking falsetto shrieks, distorted edges. |
| ALI G (ali) | West Staines MC, rhythm fighter. Mock-hip-hop swagger; rhythmic ad-lib energy. |

Full file list (8 fighters × 6 cues × 3 takes = 144 files):
`assets/audio/fighters/<id>/{dizzy,counter,tech,desperation,scream,crush}{,-2,-3}.mp3`
for each id in `deathblow, jez, alan, post, benny, donald, cyraxx, ali`.

## Priority 3 — match-story callouts (announcer voice)

| File | Line to speak |
| --- | --- |
| assets/audio/announcer/flawless-1.mp3 | FLAWLESS VICTORY! |
| assets/audio/announcer/flawless-2.mp3 | AN ABSOLUTE SHUTOUT! |
| assets/audio/announcer/comeback-1.mp3 | WHAT A COMEBACK! |
| assets/audio/announcer/comeback-2.mp3 | BACK FROM THE DEAD! |
| assets/audio/announcer/comeback-3.mp3 | NEVER COUNT THEM OUT! |
| assets/audio/announcer/timeover-1.mp3 | TIME OVER — DECISION! |
| assets/audio/announcer/timeover-2.mp3 | THE CLOCK CALLS IT! |
| assets/audio/announcer/timeover-3.mp3 | TIME! JUDGES' DECISION! |
| assets/audio/announcer/fatality-performed-1.mp3 | FATALITY. (hushed, almost reverent) |
| assets/audio/announcer/fatality-performed-2.mp3 | A GRAPHIC FINISH. (hushed) |
| assets/audio/announcer/fatality-performed-3.mp3 | THAT WAS A FINAL BLOW. (low, awed) |
| assets/audio/announcer/boss-intro-1.mp3 | THE FINAL AUTHORITY STEPS IN. (ominous) |
| assets/audio/announcer/boss-intro-2.mp3 | FINAL BOUT — THE BLACK BOOK CLOSES TONIGHT. (ominous) |
| assets/audio/announcer/boss-intro-3.mp3 | THE COMMISSIONER IS WAITING. (ominous) |

## Priority 4 — online moments (announcer voice)

| File | Line to speak |
| --- | --- |
| assets/audio/announcer/connected-1.mp3 | CHALLENGER CONNECTED! |
| assets/audio/announcer/connected-2.mp3 | YOUR OPPONENT HAS ENTERED! |
| assets/audio/announcer/connected-3.mp3 | THE WIRE IS LIVE! |
| assets/audio/announcer/setpoint-1.mp3 | SET POINT! |
| assets/audio/announcer/setpoint-2.mp3 | ONE ROUND FROM GLORY! |
| assets/audio/announcer/setpoint-3.mp3 | THE MATCH IS ON THE LINE! |
| assets/audio/announcer/rematch-1.mp3 | REMATCH ACCEPTED! |
| assets/audio/announcer/rematch-2.mp3 | RUN IT BACK! |
| assets/audio/announcer/rematch-3.mp3 | ONE MORE TIME! |
| assets/audio/announcer/recovered-1.mp3 | CONNECTION RESTORED! |
| assets/audio/announcer/recovered-2.mp3 | BACK IN SYNC! |
| assets/audio/announcer/recovered-3.mp3 | THE LINK HOLDS! |

## Priority 5 — variant retakes for the existing fighter cues

The 96 shipped single takes (`assets/audio/fighters/<id>/<cue>.mp3` for the 12
core cues) each want two alternate takes so the interim pitch-jitter can
retire: `<cue>-2.mp3` and `<cue>-3.mp3`, same persona and energy as the
original take, different read (8 fighters × 12 cues × 2 = 192 files). Core
cues: `jump, dash, light, heavy, special, throw, hit-light, hit-heavy, block,
super, fatal, ko`.

## Totals

| Group | Files |
| --- | --- |
| P1 announcer core | 26 + 24 name + 24 wins = 74 |
| P2 fighter reactive | 144 |
| P3 match-story | 14 |
| P4 online moments | 12 |
| P5 fighter variant retakes | 192 |
| **Total** | **436** |
