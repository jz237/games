"""Cut a single generated figure out of its magenta backdrop into a portrait."""
import sys
from PIL import Image
from build_atlas import key_magenta


def build(src_path, out_path, width=588, height=720, pad=0.04):
    keyed = key_magenta(Image.open(src_path))
    solid = keyed.getchannel("A").point(lambda v: 255 if v > 140 else 0)
    box = solid.getbbox()
    if not box:
        raise SystemExit("no figure found")
    cut = keyed.crop(box)
    # Fit inside the target box preserving aspect, then centre with feet low.
    inner_w, inner_h = int(width * (1 - pad * 2)), int(height * (1 - pad * 2))
    scale = min(inner_w / cut.width, inner_h / cut.height)
    cut = cut.resize((max(1, round(cut.width * scale)), max(1, round(cut.height * scale))), Image.LANCZOS)
    out = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    out.alpha_composite(cut, ((width - cut.width) // 2, height - cut.height - int(height * pad * 0.5)))
    out.save(out_path)
    print(f"wrote {out_path} from bbox {box} scale={scale:.3f}")


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2])
