from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import math
import random


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "hud-icons.png"

CELL = 128
SCALE = 3
ICONS = ["deck", "settings"]
W = CELL * len(ICONS) * SCALE
H = CELL * SCALE

PALETTE = {
    "deck": ("7dd3fc", "e0fbff", "071827"),
    "settings": ("a9beb9", "ecf8f3", "111827"),
}


def rgba(hex_color, alpha=255):
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4)) + (alpha,)


def px(index, x):
    return int((index * CELL + x) * SCALE)


def py(y):
    return int(y * SCALE)


def box(index, values):
    x1, y1, x2, y2 = values
    return (px(index, x1), py(y1), px(index, x2), py(y2))


def pts(index, values):
    return [(px(index, x), py(y)) for x, y in values]


def sw(value):
    return max(1, int(value * SCALE))


def line(draw, index, values, fill, stroke=1):
    draw.line(pts(index, values), fill=fill, width=sw(stroke), joint="curve")


def ellipse(draw, index, values, fill=None, outline=None, stroke=1):
    draw.ellipse(box(index, values), fill=fill, outline=outline, width=sw(stroke))


def rect(draw, index, values, fill=None, outline=None, stroke=1, radius=8):
    draw.rounded_rectangle(box(index, values), radius=sw(radius), fill=fill, outline=outline, width=sw(stroke))


def polygon(draw, index, values, fill=None, outline=None):
    draw.polygon(pts(index, values), fill=fill, outline=outline)


def icon_base(draw, glow, index, key):
    accent, light, dark = PALETTE[key]
    rng = random.Random(index * 29 + 5)
    ellipse(glow, index, (20, 18, 108, 110), fill=rgba(accent, 68))
    ellipse(draw, index, (18, 17, 110, 109), fill=rgba(dark, 220), outline=rgba(accent, 166), stroke=2)
    ellipse(draw, index, (28, 27, 100, 99), fill=rgba("050d18", 148), outline=rgba(light, 54), stroke=1)
    for _ in range(8):
        x = rng.randint(35, 94)
        y = rng.randint(34, 94)
        ellipse(draw, index, (x - 1, y - 1, x + 1, y + 1), fill=rgba(light, rng.randint(28, 70)))


def draw_deck(draw, glow, index):
    accent, light, _ = PALETTE["deck"]
    for offset, alpha in [(-13, 145), (-5, 184), (5, 230)]:
        rect(draw, index, (39 + offset, 34 + abs(offset) * 0.2, 85 + offset, 92 + abs(offset) * 0.16), fill=rgba("071827", alpha), outline=rgba(light, min(230, alpha + 40)), stroke=3, radius=7)
    line(draw, index, [(51, 53), (78, 53)], rgba(accent, 186), 3)
    line(draw, index, [(51, 66), (75, 66)], rgba(accent, 146), 3)
    line(draw, index, [(51, 79), (69, 79)], rgba(accent, 116), 3)
    polygon(glow, index, [(86, 29), (97, 43), (86, 57), (75, 43)], fill=rgba(accent, 76))
    polygon(draw, index, [(86, 31), (96, 43), (86, 55), (76, 43)], fill=rgba(accent, 210), outline=rgba(light, 190))


def draw_settings(draw, glow, index):
    accent, light, _ = PALETTE["settings"]
    center = (64, 64)
    teeth = []
    for step in range(16):
        radius = 38 if step % 2 == 0 else 29
        angle = math.radians(step * 22.5 - 90)
        teeth.append((center[0] + math.cos(angle) * radius, center[1] + math.sin(angle) * radius))
    polygon(glow, index, teeth, fill=rgba(accent, 68))
    polygon(draw, index, teeth, fill=rgba("111827", 224), outline=rgba(light, 210))
    ellipse(draw, index, (41, 41, 87, 87), fill=rgba("050d18", 215), outline=rgba(accent, 225), stroke=5)
    ellipse(draw, index, (55, 55, 73, 73), fill=rgba(light, 232))
    for angle in range(0, 360, 60):
        x1 = 64 + math.cos(math.radians(angle)) * 24
        y1 = 64 + math.sin(math.radians(angle)) * 24
        x2 = 64 + math.cos(math.radians(angle)) * 34
        y2 = 64 + math.sin(math.radians(angle)) * 34
        line(draw, index, [(x1, y1), (x2, y2)], rgba(accent, 180), 3)


DRAWERS = {
    "deck": draw_deck,
    "settings": draw_settings,
}


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    gd = ImageDraw.Draw(glow)
    for index, key in enumerate(ICONS):
        icon_base(draw, gd, index, key)
        DRAWERS[key](draw, gd, index)
    glow = glow.filter(ImageFilter.GaussianBlur(sw(4)))
    image = Image.alpha_composite(glow, image)
    image = image.resize((CELL * len(ICONS), CELL), Image.Resampling.LANCZOS)
    image.save(OUT)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
