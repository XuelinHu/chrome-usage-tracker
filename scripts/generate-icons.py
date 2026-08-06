"""Generate extension icons in 16/48/128 px from a single source design."""
from PIL import Image, ImageDraw
from pathlib import Path

SIZES = [16, 48, 128]
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "icons"

BG = "#071014"
CYAN = "#2563eb"
TEAL = "#0e9fbb"


def draw_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    margin = max(1, size * 0.08)
    r = (size - margin * 2) / 2
    cx, cy = size / 2, size / 2

    # background circle
    draw.ellipse(
        [margin, margin, size - margin, size - margin],
        fill=BG,
    )

    # cyan pulse dot (top-left area, scaled)
    dot_r = size * 0.09
    dot_cx = cx - r * 0.30
    dot_cy = cy - r * 0.08
    draw.ellipse(
        [dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r],
        fill=CYAN,
    )

    # small chart line (three segments forming a trend up)
    line_w = max(1, size * 0.04)
    base_x = cx - r * 0.52
    base_y = cy + r * 0.50
    pts = [
        (base_x, base_y),
        (base_x + r * 0.48, base_y - r * 0.15),
        (base_x + r * 0.80, base_y - r * 0.55),
        (base_x + r * 1.18, base_y + r * 0.12),
    ]
    for i in range(len(pts) - 1):
        draw.line([pts[i], pts[i + 1]], fill=TEAL, width=int(line_w))

    # small bar at the end
    bar_w = size * 0.05
    bar_h = size * 0.22
    bar_x = pts[-1][0] - bar_w / 2
    draw.rectangle(
        [bar_x, pts[-1][1] - bar_h, bar_x + bar_w, pts[-1][1]],
        fill=TEAL,
    )

    return img


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        img = draw_icon(size)
        img.save(OUT_DIR / f"icon{size}.png")
        print(f"  icon{size}.png  ({size}x{size})")


if __name__ == "__main__":
    main()
