from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import math
import random


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "map-node-icons.png"

CELL = 128
SCALE = 3
TYPES = ["combat", "elite", "event", "shop", "rest", "boss"]
W = CELL * len(TYPES) * SCALE
H = CELL * SCALE


PALETTE = {
    "combat": ("ff8b72", "ffd1b8", "381012"),
    "elite": ("b59cff", "f0e8ff", "1b123c"),
    "event": ("f6c177", "fff0b8", "3c2408"),
    "shop": ("4fe2a6", "c4ffe5", "092817"),
    "rest": ("7dd3fc", "d8fbff", "08263a"),
    "boss": ("fb7185", "ffe0e4", "3a0711"),
}


def rgba(hex_color, alpha=255):
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4)) + (alpha,)


def local_x(index, x):
    return int((index * CELL + x) * SCALE)


def local_y(y):
    return int(y * SCALE)


def box(index, values):
    x1, y1, x2, y2 = values
    return (local_x(index, x1), local_y(y1), local_x(index, x2), local_y(y2))


def points(index, values):
    return [(local_x(index, x), local_y(y)) for x, y in values]


def width(value):
    return max(1, int(value * SCALE))


def line(draw, index, values, fill, stroke=1):
    draw.line(points(index, values), fill=fill, width=width(stroke), joint="curve")


def polygon(draw, index, values, fill=None, outline=None):
    draw.polygon(points(index, values), fill=fill, outline=outline)


def ellipse(draw, index, values, fill=None, outline=None, stroke=1):
    draw.ellipse(box(index, values), fill=fill, outline=outline, width=width(stroke))


def rect(draw, index, values, fill=None, outline=None, stroke=1):
    draw.rounded_rectangle(box(index, values), radius=width(7), fill=fill, outline=outline, width=width(stroke))


def arc(draw, index, values, start, end, fill, stroke=1):
    draw.arc(box(index, values), start=start, end=end, fill=fill, width=width(stroke))


def icon_base(draw, glow, index, kind):
    accent, light, dark = PALETTE[kind]
    rng = random.Random(index + 72)
    ellipse(glow, index, (20, 18, 108, 108), fill=rgba(accent, 76))
    ellipse(draw, index, (17, 16, 111, 110), fill=rgba(dark, 216), outline=rgba(accent, 168), stroke=2)
    ellipse(draw, index, (25, 24, 103, 102), fill=rgba("06101d", 180), outline=rgba(light, 92), stroke=1)
    for _ in range(12):
        x = rng.randint(34, 94)
        y = rng.randint(30, 94)
        ellipse(draw, index, (x - 1, y - 1, x + 1, y + 1), fill=rgba(light, rng.randint(50, 116)))


def combat(draw, glow, index):
    accent, light, _ = PALETTE["combat"]
    line(glow, index, [(38, 88), (90, 34)], rgba(accent, 150), 8)
    line(glow, index, [(38, 34), (91, 88)], rgba(accent, 100), 7)
    line(draw, index, [(38, 88), (90, 34)], rgba(light, 236), 6)
    line(draw, index, [(38, 34), (91, 88)], rgba(accent, 232), 5)
    line(draw, index, [(30, 96), (54, 96)], rgba(light, 190), 4)
    line(draw, index, [(74, 96), (98, 96)], rgba(light, 190), 4)
    ellipse(draw, index, (58, 58, 70, 70), fill=rgba("fff4d8", 230))


def elite(draw, glow, index):
    accent, light, _ = PALETTE["elite"]
    diamond = [(64, 20), (103, 64), (64, 108), (25, 64)]
    polygon(glow, index, diamond, fill=rgba(accent, 94))
    polygon(draw, index, diamond, fill=rgba("140d2c", 236), outline=rgba(light, 232))
    line(draw, index, diamond + [diamond[0]], rgba(accent, 220), 4)
    line(draw, index, [(64, 34), (64, 94), (42, 64), (86, 64)], rgba(light, 202), 4)
    ellipse(draw, index, (54, 54, 74, 74), fill=rgba(accent, 212), outline=rgba(light, 210), stroke=2)


def event(draw, glow, index):
    accent, light, _ = PALETTE["event"]
    arc(glow, index, (28, 20, 100, 98), 192, 350, rgba(accent, 145), 8)
    arc(draw, index, (30, 22, 98, 96), 195, 350, rgba(light, 230), 5)
    line(draw, index, [(61, 82), (61, 70), (72, 64), (77, 52), (72, 42), (60, 37), (48, 42), (44, 52)], rgba(accent, 238), 5)
    ellipse(draw, index, (56, 92, 66, 102), fill=rgba(light, 240))
    ellipse(glow, index, (54, 90, 68, 104), fill=rgba(accent, 120))


def shop(draw, glow, index):
    accent, light, _ = PALETTE["shop"]
    ellipse(glow, index, (28, 26, 100, 100), fill=rgba(accent, 88))
    ellipse(draw, index, (30, 28, 98, 96), fill=rgba("092817", 232), outline=rgba(light, 214), stroke=4)
    line(draw, index, [(64, 38), (64, 88)], rgba(light, 230), 4)
    arc(draw, index, (46, 38, 82, 62), 180, 352, rgba(accent, 240), 4)
    arc(draw, index, (46, 66, 82, 90), 8, 180, rgba(accent, 240), 4)
    line(draw, index, [(45, 91), (83, 91)], rgba(light, 190), 3)


def rest(draw, glow, index):
    accent, light, _ = PALETTE["rest"]
    arc(glow, index, (30, 22, 98, 88), 188, 352, rgba(accent, 130), 9)
    arc(draw, index, (32, 24, 96, 88), 190, 350, rgba(light, 232), 5)
    rect(draw, index, (28, 66, 100, 98), fill=rgba("08263a", 232), outline=rgba(accent, 222), stroke=3)
    line(draw, index, [(64, 43), (64, 90)], rgba(light, 230), 5)
    line(draw, index, [(43, 68), (85, 68)], rgba(light, 230), 5)
    ellipse(draw, index, (56, 56, 72, 72), fill=rgba(accent, 210))


def boss(draw, glow, index):
    accent, light, _ = PALETTE["boss"]
    rect(glow, index, (30, 26, 98, 108), fill=rgba(accent, 74))
    rect(draw, index, (31, 34, 97, 110), fill=rgba("2b0710", 238), outline=rgba(light, 224), stroke=3)
    rect(draw, index, (45, 48, 83, 110), fill=rgba("13030a", 210), outline=rgba(accent, 220), stroke=3)
    line(draw, index, [(31, 70), (97, 70)], rgba(light, 174), 3)
    line(draw, index, [(64, 34), (64, 110)], rgba(light, 174), 3)
    ellipse(draw, index, (55, 18, 73, 36), fill=rgba(accent, 230), outline=rgba(light, 230), stroke=2)
    for x in (43, 85):
        line(draw, index, [(x, 34), (x, 20)], rgba(accent, 184), 3)


DRAWERS = {
    "combat": combat,
    "elite": elite,
    "event": event,
    "shop": shop,
    "rest": rest,
    "boss": boss,
}


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    gd = ImageDraw.Draw(glow)
    for index, kind in enumerate(TYPES):
        icon_base(draw, gd, index, kind)
        DRAWERS[kind](draw, gd, index)
    glow = glow.filter(ImageFilter.GaussianBlur(width(4)))
    image = Image.alpha_composite(glow, image)
    image = image.resize((CELL * len(TYPES), CELL), Image.Resampling.LANCZOS)
    image.save(OUT)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
