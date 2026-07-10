# Shatter Storm: Amiga Edition v3.0.4

A standalone enhanced brick breaker derived from the clean-room browser remake
inspired by Jez's supplied 1987 Amiga disk.

## Play

Launch it from the Shatter Storm edition menu or open `index.html` directly.

No installation, web server, network connection, or proprietary Amiga ROM is
required.

## Controls

- Mouse or Left/Right: move the Vaus paddle
- Click, Space, or Enter: launch the ball; fire when the laser capsule is active
- P: pause
- F: full screen
- M: mute
- On phones/tablets: drag anywhere on the playfield to move; tap to launch or
  fire. On-screen Pause, Settings, Fullscreen, Music, and Sound controls remain
  visible.

The separate title screen opens Play, Options, or the Shatter Storm edition
selector. Options provide Relaxed, Classic, and Expert difficulty; Auto,
960x720, 1440x1080, and 1920x1440 render resolutions; separate
master/music/Paula-effect levels; independent music and SFX switches; optional
CRT scanlines; and optional screen shake. Settings persist in the browser.
Fullscreen uses measured viewport fitting so the status bar, complete 4:3
playfield, and controls remain visible without cropping.

The game includes ten handcrafted Arkanoid-inspired rounds, multi-hit and indestructible bricks,
enemy drones, six capsule types, multiball, lasers, catch, paddle expansion,
extra lives, and a persistent local high score.

Version 3.0.1 replaced the noisy emulator captures and one-second generated
effects with eight deterministic tonal MP3s. Every sample is under one second,
has no noise source or ambience, and ends before repeated collisions can build
into a continuous wash. Brick, wall, paddle, launch, laser, capsule, death, and
round-clear events each have a distinct file. The synthesis recipes are stored
in `audio/sfx-manifest.json`.

Version 3.0.2 removes two malformed Project-X renders whose sweeping broadband
content sounded like wind. The optional score now chains four spectrally
verified Amiga gamerips from Project-X and Apidya, selected from Jez's
existing Amiga Sounds archive. It can be switched off or mixed independently
from the effects.

Version 3.0.4 fixes the wind noise for good. The entire Project-X, Apidya, and
Turrican II render folders in the Amiga Sounds archive turned out to be
malformed at the source (frequency sweeps over broadband noise — spectral
flatness screening was fooled because swept tones measure "tonal"). The
playlist is rebuilt from four tracks that were verified by reading their
spectrograms (harmonic and rhythmic structure, no sweeps or wash): Pinball
Dreams "Ignition", Lotus Turbo Challenge 2 title, Xenon 2 "Megablast"
(in-game), and Jim Power title, all loudness-normalized to -14 LUFS. The tonal
chip effects are replaced with genuine Amiga Paula sound: FS-UAE emulator
captures (brick x3 variants, paddle, wall, launch, laser, bonus, death, round),
peak-normalized and encoded to MP3 for Safari compatibility. The music player
now reuses a single audio element so the playlist keeps advancing on iOS, and
a failed sample playback falls back to a chip tone instead of silence.
Provenance for every file is recorded in `audio/sfx-manifest.json`.
