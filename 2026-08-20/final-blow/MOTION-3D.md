# MESH FIGHTERS — rigged 3D characters in CINEMA 3D (4.3)

Every fighter now ships as a rigged, skinned mesh with a shared humanoid
skeleton and a bank of motion-capture clips. In CINEMA 3D the mesh replaces
the sprite billboard for its side; every frame is a computed pose, so walks,
strikes, hits and knockdowns are continuous instead of held drawings.

The 2D canvas renderer is untouched. The simulation is untouched: hitboxes,
timing, rollback and every test read exactly what they read before. The layer
is presentation only (`renderer/three/mesh-fighters.mjs`).

## Assets — `renderer/rigs/<id>/`

| file | what |
| --- | --- |
| `rig.glb` | skinned mesh, ~45k tris, 1024px albedo, Meshy humanoid skeleton (24 joints, Mixamo names), faces +Z |
| `anim-<clip>.glb` | armature-only clip (30 fps); tracks bind onto the rig by bone name |

Clips (20 per fighter + `running`): `idle walk_fwd walk_back running jump jab
hook uppercut roundhouse high_kick sweep block hit_face hit_body launched
knockdown getup ko victory taunt dodge`. `guard` is derived at load: the first
six frames of `jab`, ping-ponged — an upright fists-up stance (the Meshy idle
presets are crouched or arms-down).

Root motion is stripped at load: every `.position` track is pinned to its
first frame on X/Z, and the hips may only DROP below their opening height
(knockdown / KO lie on the floor) — never rise. The sim owns position.

## How poses are chosen — `MeshFighterLayer.choose(fighter, state)`

Pure function of sim fields; every clip time comes from SIM COUNTERS
(`stateFrame`, `attackTime`, `simulationTick`, the stun/knockdown/wakeup
counters), never wall-clock, so a rollback resimulation re-poses identically.

Priority: finisher cinematic → round over (ko / victory) → down/knockdown →
wakeup (getup) → dizzy → hitstun (launched when airborne, else hit_face /
hit_body) → block/blockstun → attack → grab → airborne (jump, phased by vy) →
dash (running) → crouch (block frame 0, root dropped) → walk (fwd/back by vx
vs facing, cadence from speed) → taunt → guard loop.

**Attacks are time-warped to the hitbox.** `STRIKE_PEAK` holds the second at
which each strike clip reaches full extension. Startup maps `[0, active[0]]`
onto `[0, peak]`; active + recovery map onto `[peak, peak + 0.5 s]`. The 3D
limb is therefore at extension exactly on the first active frame, whatever the
move's authored startup. Clip choice: super → uppercut; air → high_kick;
low → sweep; overhead → hook; special → high_kick/uppercut; heavy →
roundhouse/hook (hashed per move id, stable); light → jab (kick/knee ids →
high_kick).

## Look

Ink-and-cel: 2-step toon ramp (shadow 0.75), albedo saturation ×1.05, an
inverted-hull outline (0.014 world units, back faces, ink black), no tone
mapping of its own (the CINEMA 3D stack's ACES still applies). The rigs'
forward axis is +Z, so facing is yaw +70° for screen-right and −70° for
screen-left: a near profile toward the opponent, ~20° open to the camera
(measured — an earlier −35° had the body mostly facing the camera and every
torso twist read as turning away from the opponent). Height is
`fighterRenderSize(id) × PX × 0.86`. Clip changes crossfade over 6 sim ticks
(the outgoing action freezes at its last pose). Hit flash: brief emissive lift.
Rigs ship at 65% of full polygon count with 2048px textures (5–11 MB each;
only the two fighters in the match load).

## Switches and QA

- Mesh fighters are OFF by default. Options → “3D FIGHTERS · EXPERIMENTAL”
  (persisted as `final-blow-mesh-fighters`; turning it on also turns CINEMA 3D
  on) or `?fighters=3d` for one session. The sprite rig is always built and
  takes over instantly while a mesh is loading, missing, or switched off.
- The 4.3 shell clears the persisted CINEMA 3D flag once on first boot so the
  sprite renderer is everyone's default again.
- Jez ships at FULL geometry (294k tris, 4096px texture, 12.6 MB); the rest
  at 65% (Pages caps files at 25 MiB).
- `window.__fbMesh3d` (render-only latch): per-side asset `status`
  (`loading` / `ready` / `missing`), the last `{clip, time}` pick per side;
  set `window.__fbMeshProbe = true` for rig bounds + skin sanity.
- Headless check used during the build: serve the folder, open
  `?debug=1&renderer=3d`, `__finalBlowQa.fight('jez','alan')`,
  `__finalBlowQa.aiMode(true)`, wait for both statuses `ready`, step, shoot.

## Gotchas learned the hard way

- `SkeletonUtils.clone` drops the armature's 0.01 scale on these exports
  (bones land at 104 m) — the layer keeps the rig BYTES and parses a fresh
  scene per side instead.
- Meshy needs the input mesh facing +Z; Tripo exports face −X (rotate −90°
  about Y first). Meshy/Tripo content checkers refuse some fighters (devil,
  donald): the roster pipeline falls back to Meshy multi-image → Hunyuan3D.
- A-pose references with the hands beside the hips fuse the gloves to the
  thighs (skinning spikes on every punch). Generate turnarounds with the arms
  held ~50° out.

## Pipeline

Scripts live in the session scratchpad (`roster/pipeline.py`, `rigC.py`,
`build_site.py`) and are described in the memory note `final-blow-3d-pilot`.
Per fighter: GPT-Image-2 turnaround → Tripo multiview mesh → Blender rotate →
Meshy rig + two clip batches → fused-geometry check → decimate 0.3 / 1024px
textures → armature-only clip exports. Showcase page:
`games/2026-08-20/final-blow/3d/` on jez237.com.
