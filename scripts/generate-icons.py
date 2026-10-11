"""Generate extension sizes from the project's AI-generated Android icon."""
from PIL import Image
from pathlib import Path

SIZES = [16, 48, 128]
ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "android" / "app" / "src" / "main" / "res" / "mipmap-xxxhdpi" / "ic_launcher.png"
OUT_DIR = ROOT / "public" / "icons"


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with Image.open(SOURCE) as source:
        source = source.convert("RGBA")
        for size in SIZES:
            image = source.resize((size, size), Image.Resampling.LANCZOS)
            image.save(OUT_DIR / f"icon{size}.png")
            print(f"  icon{size}.png  ({size}x{size})")


if __name__ == "__main__":
    main()
