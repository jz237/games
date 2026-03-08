Title: Neon Harbor
Tagline: A slow-burn narrative exploration of a neon-lit waterfront city where light, memory, and sound reveal hidden stories.

High-level vision:
- Single canonical longform game project. Blend of exploration, environmental puzzles, and episodic character vignettes.
- Visuals: neon-soaked 2.5D cityscape with layered parallax, reflective water, interactive signage.
- Core loop: Explore districts at night, collect audio snippets and light signatures, combine them to unlock memories and progress story.

Core mechanics:
1) Exploration: Walk, boat, and climb across docks, alleys, and rooftops. Dynamic day-night cycle limited to night scenes.
2) Collection: "Light signatures" (colored glyphs) and "Audio Shards" (short voice/ambient recordings).
3) Synthesis: Use a simple in-game tool (the Loom) to combine 2-3 shards to reconstruct a memory scene (mini vignette). Choices within vignettes affect which area opens.
4) Puzzles: Environmental puzzles driven by light/reflection and rhythm matching of audio shards.

Deliverables for this run (initial):
- Basic design doc (this file)
- Minimal prototype plan (asset list + tech stack)
- CONTINUE.json with precise next steps

Prototype plan:
- Tech: Godot 4 (GDScript), resolution-independent 2D with layered parallax; optional Web export.
- Minimum assets: player sprite, 3 district tilesets (docks, market, rooftops), water shader, neon sign assets, 6 audio shards, UI for Loom.
- Milestone A: Player movement + simple dock scene with parallax + water shader
- Milestone B: Collection system and 2 audio shards
- Milestone C: Loom UI and one memory vignette

Risks & notes:
- Audio quality and writing for vignettes will drive player engagement—prioritize good voice/ambient.
- Keep scope narrow: aim for 20-40 minutes of curated vignettes for first release.

Next steps (for CONTINUE.json):
1) Create project structure in repository and initialize Godot project files.
2) Implement player movement and camera with parallax in a single dock scene.
3) Build a simple water shader and attach to dock.
4) Produce placeholder art assets (simple shapes + neon overlays).
5) Log progress and update CONTINUE.json when Milestone A complete.
