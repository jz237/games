# MISSING-AUDIO.md — Release 1.6 "LOUD" voice work order

> INTERNAL WORK ORDER — fine to commit to jz237/games, but keep this file out
> of the publish mirror (do not add it to the deploy/publish list). Auth was
> fixed and the ElevenLabs batch ran on 2026-08-30.

## Batch status (2026-08-30)

The full P1–P5 batch was generated with the casting in `VOICE-CAST.json`
(model `eleven_v3`, `mp3_44100_128`): **427 of 427 files are on disk and
verified** (valid mp3, 0.4–6.0s, mean above −35 dB, peak below −0.5 dB).

| Group | Status |
| --- | --- |
| P1 announcer core | DONE — 77/77 |
| P2 fighter reactive | DONE — 168/168 |
| P2B Commissioner | DONE — 63/63 |
| P2C Pinelands Devil | DONE — 63/63 |
| P3 match-story | DONE — 14/14 |
| P4 online moments | DONE — 12/12 |
| P5 variant retakes | DONE — 30/30 |
| P0 rejected-cue retakes | NOT GENERATED — 0/117, blocked (see Priority 0) |

P0 is not a quota problem: fresh takes for the rejected cues cannot land at
their canonical paths while the review contract holds — rejected recordings
must stay deleted from the tree (`tests/audio-review.test.mjs` enforces it)
until Jez rates new candidates and `engine/audio-review.mjs` is regenerated
from that review. Run P0 as a candidate-review cycle with him, not as a
drop-in batch.

Every system below shipped caption-first before the files existed: captions
show the exact lines, missing banks are HEAD-probed once per session and
skipped silently, and single-take fighter cues get deterministic
playbackRate/detune jitter. **Drop a file at its canonical path and it joins
the rotation on the next page load — no code changes needed.** Banks are
contiguous: the probe stops at the first missing number, so generate `-1`
before `-2` before `-3`.

Announcer voice (all `assets/audio/announcer/` files): one voice — a deep,
gritty arena MC. Short, punchy takes with hard consonants and a little tail
reverb feel; no music, no crowd, clean mono. Target loudness matched to the
existing `assets/audio/knockout.mp3` call — the old `final-blow.mp3` reference
went out with the SFX review (see Priority 0 below).

Line text below is exact and positional: take `-1` speaks line 1, `-2` line 2,
and so on (`ANNOUNCER_LINES` in game.js mirrors this table — keep both in sync
if a line changes).

## Priority 1 — announcer core — DONE (77/77 generated + verified)

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
| assets/audio/announcer/wallbounce-1.mp3 | OFF THE WALL! |
| assets/audio/announcer/wallbounce-2.mp3 | CORNER CARNAGE! |
| assets/audio/announcer/wallbounce-3.mp3 | THE WALL HITS BACK! |

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

## Priority 2 — fighter reactive cues — DONE (168/168 generated + verified)

Per-fighter voices — match each persona (kit docs: `engine/fighter-kits.mjs`
archetypes, `CYRAXX.md`). These are vocalisations, not scripted words; the
"line" column is the performance direction. 3 takes per cue per fighter:
`<cue>.mp3`, `<cue>-2.mp3`, `<cue>-3.mp3` under `assets/audio/fighters/<id>/`.
Until these exist the game pitch-shifts the nearest recorded take
(dizzy→hit-heavy ×0.86, counter→special ×1.09, tech→block ×1.06,
desperation→hit-light ×0.93, scream→fatal ×1.14, crush→block ×0.78,
taunt→jump ×1.18 — further offset per rotating line). The SFX review deleted
most of those borrowed cues, so for the majority of fighters there is now
nothing to pitch-shift and the reactive moment falls through to the shared or
procedural sound — which makes recording these takes more valuable, not less.

| Cue | Performance | Length |
| --- | --- | --- |
| dizzy | woozy dazed groan, head-spinning babble | 0.8–1.2s |
| counter | sharp triumphant bark on landing a counter-hit ("GOTCHA!" energy, in persona) | 0.4–0.8s |
| tech | strained escape shout breaking a throw | 0.4–0.7s |
| desperation | panicked low-health snarl / ragged breathing burst (fires once per round under 20%) | 0.8–1.2s |
| scream | full fatality death scream — must read bigger and longer than the existing `ko.mp3` groan | 1.0–2.0s |
| crush | guard-shatter cry — arms blown open, staggered disbelief (Release 1.7 GUARD CRUSH) | 0.6–1.0s |
| taunt | SCRIPTED spoken lines (wave 11 punishable taunt) — exact text below, strictly positional: the sim picks line N via state.rng and plays take N+1, so the caption and the take must match | 0.8–1.6s |

### Taunt line scripts (positional — take 1 = line 1, take 2 = line 2, take 3 = line 3)

`FIGHTER_TAUNT_LINES` in `engine/fighter-audio.mjs` mirrors this table exactly;
keep both in sync if a line changes. Files:
`assets/audio/fighters/<id>/taunt.mp3`, `taunt-2.mp3`, `taunt-3.mp3`.

| Fighter (id) | Line 1 | Line 2 | Line 3 |
| --- | --- | --- | --- |
| DEATHBLOW (deathblow) | I POUR CONCRETE HARDER THAN YOU. | ROCK BOTTOM SUITS YOU. | STAY DOWN. IT'S LOAD-BEARING. |
| JEZ (jez) | READ THE SIGN. | I MADE THAT LOOK EASY. | LIGHTS OUT, PAL. |
| ALLAN (alan) | YOUSE DONE ALREADY? | GET UP. I AIN'T FINISHED. | THAT ALL YOU GOT, HUH? |
| POST (post) | CAN'T CATCH ME. | I'LL TAG YOUR TOMBSTONE. | SPRAYED AND SLAYED. |
| BENNY (benny) | TOO SLOW. WAY TOO SLOW. | PRECISION, BABY. | CLIPPED YA. |
| DONALD TRUMP (donald) | TOTAL DISASTER. SAD. | NOBODY FIGHTS BETTER THAN ME. | YOU'RE FIRED. |
| CYRAXX (cyraxx) | HEHEHE... FEEDBACK! | YOU HEAR THAT? THAT'S LOSING. | CRANK IT UP! |
| ALI G (ali) | BOOYAKASHA! | IS IT COS I IS WINNING? | RESPEK. NOT FOR YOU, THOUGH. |

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

Full file list (8 fighters × 7 cues × 3 takes = 168 files):
`assets/audio/fighters/<id>/{dizzy,counter,tech,desperation,scream,crush,taunt}{,-2,-3}.mp3`
for each id in `deathblow, jez, alan, post, benny, donald, cyraxx, ali`.

## Priority 2B — THE COMMISSIONER (wave 16 boss voice) — DONE (63/63 generated + verified)

New in R2.0 FAMILY: the boss (and secret unlockable) has his own kit and his
own voice slots. **Nothing is recorded yet** — every slot below is caption-
first and probe-all (`BOSS_AUDIO_IDS` in `engine/fighter-audio.mjs`), so
files join the rotation at their canonical paths with zero code changes.

Voice direction: **aged Philadelphia power broker.** Deep, dry, unhurried
gravel — a man who has never once raised his voice to win an argument.
Contempt, not rage; courtroom cadence; the cane taps between clauses.

### The 12 core cue slots (12 cues × 3 takes = 36 files)

`assets/audio/fighters/commissioner/<cue>{,-2,-3}.mp3` for each cue:

| Cue | Performance |
| --- | --- |
| jump | short effort exhale, disdainful |
| dash | clipped movement grunt, cloth-and-cane |
| light | terse cane-jab effort, almost bored |
| heavy | committed swing grunt, weight behind the cane |
| special | authoritative call — "ORDER." energy, in persona |
| throw | contract-grab exertion, through the teeth |
| hit-light | annoyed intake — an inconvenience |
| hit-heavy | deep body-blow grunt, dignity cracking |
| block | cane-parry effort, tight |
| super | the FINAL AUTHORITY pronouncement — his biggest read |
| fatal | low, savoring exhale as the sentence is carried out |
| ko | long defeated collapse — the book hitting the floor |

### Reactive cues (7 cues × 3 takes = 21 files, same contract as the mains)

`assets/audio/fighters/commissioner/{dizzy,counter,tech,desperation,scream,crush,taunt}{,-2,-3}.mp3`

### Taunt line scripts (positional, mirrors `FIGHTER_TAUNT_LINES`)

| Fighter (id) | Line 1 | Line 2 | Line 3 |
| --- | --- | --- | --- |
| THE COMMISSIONER (commissioner) | YOU'RE NOT IN THE BOOK. | COURT FEES DOUBLE AFTER DARK. | SIT DOWN. SESSION'S NOT OVER. |

### Announcer additions

| File | Line to speak |
| --- | --- |
| assets/audio/announcer/commissioner-name-1.mp3 … -3.mp3 | THE COMMISSIONER (1 neutral, 2 hyped, 3 drawn-out) |
| assets/audio/announcer/commissioner-wins-1.mp3 … -3.mp3 | THE COMMISSIONER WINS! / THE WINNER — THE COMMISSIONER! / THE COMMISSIONER TAKES IT! |

## Priority 2C — THE PINELANDS DEVIL (wave 17 roster voice) — DONE (63/63 generated + verified)

New in R2.0 FAMILY wave 17: the tenth fighter ships caption-first on the same
contract as the Commissioner (`CAPTION_FIRST_AUDIO_IDS` in
`engine/fighter-audio.mjs`) — nothing recorded, every bank probe-all, files
join the rotation at their canonical paths with zero code changes.

Voice direction: **a screechy South-Jersey cryptid.** Two layers in one
throat: an animal register — raptor screeches, goat-bleat breaks, leathery
wing snaps behind the breath — over a dry, unimpressed local drawl for the
scripted lines. Folkloric, feral, but a LOCAL; never a cartoon demon growl.
The screech should genuinely spike — this is the loudest voice in the cast.

### The 12 core cue slots (12 cues × 3 takes = 36 files)

`assets/audio/fighters/devil/<cue>{,-2,-3}.mp3` for each cue:

| Cue | Performance |
| --- | --- |
| jump | wing-snap effort chirp, air catching leather |
| dash | quick hoof-scrabble hiss, low and fast |
| light | clipped talon-jab screech, short |
| heavy | horn-swing effort bellow with a goat-bleat crack |
| special | the PINEY SCREECH itself — full sonic shriek, his signature read |
| throw | snarling wing-grab exertion, teeth closed |
| hit-light | annoyed animal chuff |
| hit-heavy | pained bleat-howl, dignity gone |
| block | tight leathery brace grunt |
| super | the BARRENS CURSE — layered screech over a muttered hex, biggest take |
| fatal | long savoring predator rattle as the wings close |
| ko | crumpling screech dying into a sad little bleat |

### Reactive cues (7 cues × 3 takes = 21 files, same contract as the mains)

`assets/audio/fighters/devil/{dizzy,counter,tech,desperation,scream,crush,taunt}{,-2,-3}.mp3`

### Taunt line scripts (positional, mirrors `FIGHTER_TAUNT_LINES`)

| Fighter (id) | Line 1 | Line 2 | Line 3 |
| --- | --- | --- | --- |
| PINELANDS DEVIL (devil) | THE PINES ARE HUNGRY TONIGHT. | THIRTEENTH CHILD, FIRST PLACE. | SKREEE! ...THAT MEANS RUN. |

### Announcer additions

| File | Line to speak |
| --- | --- |
| assets/audio/announcer/devil-name-1.mp3 … -3.mp3 | THE PINELANDS DEVIL (1 neutral, 2 hyped, 3 drawn-out) |
| assets/audio/announcer/devil-wins-1.mp3 … -3.mp3 | THE PINELANDS DEVIL WINS! / THE WINNER — THE PINELANDS DEVIL! / THE PINELANDS DEVIL TAKES IT! |

## Priority 3 — match-story callouts (announcer voice) — DONE (14/14 generated + verified)

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

## Priority 4 — online moments (announcer voice) — DONE (12/12 generated + verified)

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

## Priority 5 — variant retakes for the existing fighter cues — DONE (30/30 generated + verified)

The 15 surviving single takes (`assets/audio/fighters/<id>/<cue>.mp3`) each
want two alternate takes so the interim pitch-jitter can retire:
`<cue>-2.mp3` and `<cue>-3.mp3`, same persona and energy as the original take,
different read (15 × 2 = 30 files). Which cue survived for which fighter is
`APPROVED_CORE_CUES` in `engine/audio-review.mjs`; a cue that is not listed
there needs a fresh original take first (Priority 0), not a variant.

## Priority 0 — retakes for the cues the SFX review rejected — NOT GENERATED (0/117, blocked on review cycle)

Jez reviewed all 170 sounds on 2026-08-23 and rejected 117. The 84 that had
shipped are deleted, so those moments now play a shared take he kept or
synthesise procedurally — which works, but is generic. Re-recording them is the
highest-value audio work outstanding.

| Group | Files to re-record |
| --- | --- |
| Shared: special swing, guard impact, Death Blow call | 3 |
| Per-fighter core cues | 81 |
| Kick takes he turned down (10 of 32 fighter/role pairs have no accepted take) | 33 |

`engine/audio-review.mjs` is generated from his review and lists every id in
each bucket — `REVIEW_REJECTED` is the work list. Regenerate it with
`tools/build-audio-review.mjs` if he re-rates anything. One sound is still
unrated, `post-light-kick-impact-b`, and is deliberately held outside the tree
until he decides either way.

## Totals

| Group | Files |
| --- | --- |
| P0 rejected-cue retakes | 3 + 81 + 33 = 117 |
| P1 announcer core | 29 + 24 name + 24 wins = 77 |
| P2 fighter reactive | 168 |
| P2B Commissioner voice (wave 16) | 36 core + 21 reactive + 6 announcer = 63 |
| P2C Pinelands Devil voice (wave 17) | 36 core + 21 reactive + 6 announcer = 63 |
| P3 match-story | 14 |
| P4 online moments | 12 |
| P5 fighter variant retakes | 30 |
| **Total** | **544** |
