from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import math
import random


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "shop-service-icons.png"
ICONS = ["heal", "remove", "upgrade"]

CELL = 128
SCALE = 4
CANVAS = CELL * SCALE


def rgba(hex_color, alpha=255):
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4)) + (alpha,)


def box(items):
    return tuple(int(v * SCALE) for v in items)


def point(x, y):
    return int(x * SCALE), int(y * SCALE)


def points(items):
    return [point(x, y) for x, y in items]


def width(value):
    return max(1, int(value * SCALE))


def rounded(draw, coords, radius, fill=None, outline=None, width_value=1):
    draw.rounded_rectangle(box(coords), radius=width(radius), fill=fill, outline=outline, width=width(width_value))


def ellipse(draw, coords, fill=None, outline=None, width_value=1):
    draw.ellipse(box(coords), fill=fill, outline=outline, width=width(width_value))


def line(draw, coords, fill, width_value=1, joint=None):
    draw.line(points(coords), fill=fill, width=width(width_value), joint=joint)


def arc(draw, coords, start, end, fill, width_value=1):
    draw.arc(box(coords), start=start, end=end, fill=fill, width=width(width_value))


def base_plate(seed, accent):
    rng = random.Random(seed)
    image = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    pixels = image.load()
    cx = CANVAS * 0.48
    cy = CANVAS * 0.42
    for y in range(CANVAS):
        for x in range(CANVAS):
            dx = (x - cx) / CANVAS
            dy = (y - cy) / CANVAS
            dist = math.sqrt(dx * dx * 1.22 + dy * dy * 1.55)
            glow = max(0, 1 - dist * 3.2)
            rim = max(0, 1 - abs((x / CANVAS) - 0.5) * 2.0) * max(0, 1 - y / CANVAS)
            noise = rng.randint(-4, 4)
            r = int(5 + accent[0] * glow * 0.34 + 246 * rim * 0.035 + noise)
            g = int(12 + accent[1] * glow * 0.34 + 193 * rim * 0.035 + noise)
            b = int(22 + accent[2] * glow * 0.36 + 119 * rim * 0.02 + noise)
            pixels[x, y] = (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)), 255)
    mask = Image.new("L", (CANVAS, CANVAS), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, CANVAS - 1, CANVAS - 1), radius=width(20), fill=255)
    image.putalpha(mask)
    return image


def add_glow(base, layer, blur=5):
    return Image.alpha_composite(base, layer.filter(ImageFilter.GaussianBlur(width(blur))))


def decorate_plate(draw):
    rounded(draw, (6, 6, 122, 122), 18, outline=rgba("8ee8ff", 76), width_value=1.4)
    rounded(draw, (13, 13, 115, 115), 13, fill=rgba("03101c", 88), outline=rgba("d8fbff", 42), width_value=1)
    for x in [25, 43, 85, 103]:
        line(draw, [(x, 18), (x - 8, 108)], rgba("7dd3fc", 20), 0.8)
    for y in [28, 99]:
        line(draw, [(18, y), (110, y + 4)], rgba("f6c177", 18), 0.8)


def draw_heal():
    image = base_plate(21, (68, 220, 160))
    draw = ImageDraw.Draw(image)
    glow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    decorate_plate(draw)

    ellipse(gd, (26, 24, 102, 100), fill=rgba("65f0b6", 86))
    image = add_glow(image, glow, 8)
    draw = ImageDraw.Draw(image)
    rounded(draw, (44, 30, 84, 94), 17, fill=rgba("082c2a", 244), outline=rgba("d8fbff", 220), width_value=3)
    rounded(draw, (50, 37, 78, 88), 12, fill=rgba("45dba7", 150))
    rounded(draw, (54, 18, 74, 34), 7, fill=rgba("0f1f2a", 250), outline=rgba("f6c177", 210), width_value=2)
    line(draw, [(64, 43), (64, 80)], rgba("f1fff7", 238), 5)
    line(draw, [(47, 61), (81, 61)], rgba("f1fff7", 238), 5)
    line(draw, [(34, 102), (53, 94), (73, 102), (94, 92)], rgba("65f0b6", 178), 3)
    return image.resize((CELL, CELL), Image.Resampling.LANCZOS)


def draw_remove():
    image = base_plate(34, (245, 104, 126))
    draw = ImageDraw.Draw(image)
    glow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    decorate_plate(draw)

    gd.ellipse(box((26, 26, 102, 100)), fill=rgba("fb7185", 82))
    image = add_glow(image, glow, 8)
    draw = ImageDraw.Draw(image)
    rounded(draw, (36, 24, 84, 96), 8, fill=rgba("101826", 246), outline=rgba("ffd2da", 212), width_value=2.6)
    rounded(draw, (45, 35, 75, 45), 3, fill=rgba("fb7185", 130))
    for y in [56, 66, 76]:
        line(draw, [(47, y), (75, y)], rgba("d8fbff", 92), 1.5)
    line(draw, [(82, 31), (101, 49), (69, 99)], rgba("f6c177", 235), 5.2)
    line(draw, [(93, 91), (69, 99), (99, 59)], rgba("fb7185", 230), 4.4)
    ellipse(draw, (89, 30, 102, 43), fill=rgba("06101f", 246), outline=rgba("ffd2da", 214), width_value=2)
    ellipse(draw, (79, 90, 92, 103), fill=rgba("06101f", 246), outline=rgba("ffd2da", 214), width_value=2)
    line(draw, [(28, 108), (102, 21)], rgba("ff9caf", 180), 2.5)
    return image.resize((CELL, CELL), Image.Resampling.LANCZOS)


def draw_upgrade():
    image = base_plate(55, (64, 190, 255))
    draw = ImageDraw.Draw(image)
    glow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    decorate_plate(draw)

    gd.polygon(points([(64, 18), (102, 64), (79, 64), (79, 102), (49, 102), (49, 64), (26, 64)]), fill=rgba("7dd3fc", 92))
    image = add_glow(image, glow, 8)
    draw = ImageDraw.Draw(image)
    draw.polygon(points([(64, 19), (102, 61), (81, 61), (81, 100), (47, 100), (47, 61), (26, 61)]), fill=rgba("08324b", 245), outline=rgba("d8fbff", 230))
    line(draw, [(64, 19), (102, 61), (81, 61), (81, 100), (47, 100), (47, 61), (26, 61), (64, 19)], rgba("d8fbff", 220), 3)
    line(draw, [(64, 35), (64, 90)], rgba("f6c177", 238), 4)
    arc(draw, (34, 37, 94, 99), 205, 335, rgba("7df4ff", 188), 3)
    rounded(draw, (49, 82, 79, 104), 7, fill=rgba("06101f", 194), outline=rgba("f6c177", 200), width_value=1.8)
    return image.resize((CELL, CELL), Image.Resampling.LANCZOS)


DRAWERS = {
    "heal": draw_heal,
    "remove": draw_remove,
    "upgrade": draw_upgrade,
}


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    atlas = Image.new("RGBA", (CELL * len(ICONS), CELL), (0, 0, 0, 0))
    for index, key in enumerate(ICONS):
        atlas.paste(DRAWERS[key](), (index * CELL, 0))
    atlas.save(OUT)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
