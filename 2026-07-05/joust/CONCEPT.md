# Joust — Concept

A faithful browser remake of **Joust** (Williams Electronics, arcade, 1982;
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

## Presentation and browser shell
The playfield uses the original ROM sprites, riders, cliff bitmaps, compressed lower island,
Williams 5x7 font, palette, and vector-drawn title logo at the arcade's 292x240 raster and 4:3
pixel aspect. The authentic Williams sound-ROM output remains intact. Browser additions are kept
outside the core rules: CRT option, key remap, difficulty, wave select with saved progress and a
`1234` unlock, local/global scores, touch controls, simultaneous local 2-player, pause, and a
hold-ESC wave restart escape hatch.
