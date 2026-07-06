# Joust — Concept

A faithful, graphically-enhanced browser remake of **Joust** (Williams Electronics, arcade, 1982;
designed by John Newcomer, programmed by Bill Pfutzenreuter). This is a NEW game — it does not
replace the separate, unrelated "Sky Joust" (2026-05-11).

## Pitch
You are a knight riding a flying buzzard (ostrich for P1, stork for P2) over a lava-floored arena
of stone platforms. Flap to fly, and win the joust by riding **higher** than your opponent — the
higher lance unseats the lower. Collect the eggs that fall from unhorsed riders before they hatch
into tougher foes, dodge the near-invulnerable pterodactyl (killable only by a lance in its open
beak), and stay clear of the lava troll's grasping hand.

## Fidelity
The engine is ported directly from the original Williams 6809 source (rebuilt to byte-match the
shipped ROM): 60 Hz tick, gravity `4/256` px/frame² (double while gliding), the decaying
`floor(ptimup*96/256)-96` flap impulse, the non-linear `FLYX` horizontal velocity table, the
exact higher-lance-wins joust resolution, the 250/500/750/1000 egg ladder (+500 mid-air), the
Bounder/Hunter/Shadow-Lord point values 500/750/1500, the pterodactyl 1000, 3000-point
survival/team/gladiator bonuses, the mod-5 wave-type cycle (with pterodactyls from wave 8), the
bridge burning on wave 3 and the lava troll from wave 4, and the horizontal cylinder wrap.
See `SPEC.md` for the full authoritative rules + decisions log and `notes/` for the research
bundle and the cloned original source.

## Enhancements (over the raw arcade)
HD procedural sprites + animated lava + starfield + CRT-filter option; attract mode; wave
announcements; separate SFX/Music volume, key remap, difficulty, wave-select with saved progress
and a `1234` all-waves unlock; local + global leaderboards; touch controls; 2-player on one
keyboard; hold-ESC wave restart. Audio is faithful SFX-only synthesis (the arcade had no music by
design) plus an original title theme.
