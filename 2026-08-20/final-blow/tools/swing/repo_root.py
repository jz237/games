"""Where the game checkout is, for every script in tools/swing.

Derived from THIS file's location (tools/swing/ -> the game root two levels
up), so a tool run from any clone reads and writes THAT clone. The 4.9/5.0
scripts hard-coded one checkout path, which meant a run from a second clone
silently wrote sheets, the manifest and the engine tables into the first.
FINAL_BLOW_ROOT overrides it (an explicit target for a scratch clone)."""
import os


def repo_root():
    here = os.path.dirname(os.path.abspath(__file__))
    override = os.environ.get("FINAL_BLOW_ROOT")
    root = override or os.path.normpath(os.path.join(here, "..", ".."))
    if not os.path.isfile(os.path.join(root, "game.js")):
        raise SystemExit(f"repo_root: {root} is not a Final Blow checkout (no game.js); set FINAL_BLOW_ROOT")
    return root


G = repo_root()
