from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import math
import random


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "resource-icons.png"

CELL = 128
SCALE = 3
ICONS = ["energy", "draw", "hand", "discard", "exhaust"]
W = CELL * len(ICONS) * SCALE
H = CELL * SCALE

PALETTE = {
    "energy": ("7dd3fc", "e0fbff", "061a2a"),
    "draw": ("7dd3fc", "e0fbff", "071827"),
    "hand": ("f6c177", "fff0b8", "2e210a"),
    "discard": ("8ef2dc", "e6fff8", "082b25"),
    "exhaust": ("fb7185", "ffe0e4", "351018"),
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


def arc(draw, index, values, start, end, fill, stroke=1):
    draw.arc(box(index, values), start=start, end=end, fill=fill, width=sw(stroke))


def icon_base(draw, glow, index, key):
    accent, light, dark = PALETTE[key]
    rng = random.Random(index * 23 + 7)
    ellipse(glow, index, (19, 17, 109, 111), fill=rgba(accent, 74))
    ellipse(draw, index, (18, 17, 110, 109), fill=rgba(dark, 218), outline=rgba(accent, 170), stroke=2)
    ellipse(draw, index, (28, 27, 100, 99), fill=rgba("050d18", 150), outline=rgba(light, 55), stroke=1)
    for _ in range(8):
        x = rng.randint(35, 94)
        y = rng.randint(34, 94)
        ellipse(draw, index, (x - 1, y - 1, x + 1, y + 1), fill=rgba(light, rng.randint(28, 76)))


def draw_energy(draw, glow, index):
    accent, light, _ = PALETTE["energy"]
    polygon(glow, index, [(67, 21), (39, 68), (61, 65), (53, 105), (91, 54), (68, 58)], fill=rgba(accent, 120))
    polygon(draw, index, [(67, 22), (40, 67), (61, 65), (53, 104), (90, 54), (68, 58)], fill=rgba(accent, 236), outline=rgba(light, 226))
    line(draw, index, [(67, 30), (56, 61), (73, 58), (61, 89)], rgba(light, 185), 3)


def draw_draw(draw, glow, index):
    accent, light, _ = PALETTE["draw"]
    for offset in [9, 0, -9]:
        rect(draw, index, (42 + offset, 36 - offset * 0.35, 83 + offset, 91 - offset * 0.35), fill=rgba("071827", 220), outline=rgba(accent, 145), stroke=2, radius=6)
    arc(glow, index, (32, 31, 96, 95), 205, 520, rgba(accent, 130), 8)
    arc(draw, index, (35, 34, 93, 92), 205, 520, rgba(light, 215), 4)
    polygon(draw, index, [(82, 83), (98, 82), (89, 68)], fill=rgba(light, 226))
    line(draw, index, [(51, 58), (75, 58), (75, 72), (58, 72)], rgba(accent, 170), 3)


def draw_hand(draw, glow, index):
    accent, light, _ = PALETTE["hand"]
    for offset, alpha in [(-20, 140), (-10, 176), (0, 226), (10, 176), (20, 140)]:
        rect(draw, index, (48 + offset, 35 + abs(offset) * 0.25, 83 + offset, 92 + abs(offset) * 0.2), fill=rgba("2e210a", alpha), outline=rgba(light, min(220, alpha + 34)), stroke=2, radius=6)
    ellipse(glow, index, (34, 77, 94, 103), fill=rgba(accent, 84))
    line(draw, index, [(41, 91), (87, 91)], rgba(accent, 210), 5)
    line(draw, index, [(51, 50), (74, 77)], rgba(light, 120), 2)


def draw_discard(draw, glow, index):
    accent, light, _ = PALETTE["discard"]
    rect(draw, index, (41, 31, 87, 89), fill=rgba("082b25", 226), outline=rgba(light, 214), stroke=4, radius=7)
    line(draw, index, [(64, 40), (64, 78)], rgba(accent, 235), 7)
    polygon(draw, index, [(64, 91), (43, 68), (56, 68), (56, 48), (72, 48), (72, 68), (85, 68)], fill=rgba(accent, 232), outline=rgba(light, 178))
    line(glow, index, [(43, 96), (85, 96)], rgba(accent, 130), 8)


def draw_exhaust(draw, glow, index):
    accent, light, _ = PALETTE["exhaust"]
    rect(draw, index, (40, 32, 88, 94), fill=rgba("351018", 225), outline=rgba(light, 215), stroke=4, radius=8)
    for angle in range(0, 360, 60):
        x1 = 64 + math.cos(math.radians(angle)) * 18
        y1 = 65 + math.sin(math.radians(angle)) * 18
        x2 = 64 + math.cos(math.radians(angle)) * 36
        y2 = 65 + math.sin(math.radians(angle)) * 36
        line(glow, index, [(x1, y1), (x2, y2)], rgba(accent, 92), 6)
        line(draw, index, [(x1, y1), (x2, y2)], rgba(accent, 210), 3)
    line(draw, index, [(49, 49), (79, 80)], rgba(light, 235), 6)
    line(draw, index, [(79, 49), (49, 80)], rgba(light, 235), 6)


DRAWERS = {
    "energy": draw_energy,
    "draw": draw_draw,
    "hand": draw_hand,
    "discard": draw_discard,
    "exhaust": draw_exhaust,
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
