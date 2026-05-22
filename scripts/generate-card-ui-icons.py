from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import math
import random


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "card-ui-icons.png"
ICONS = ["attack", "skill", "power", "status", "curse", "damage", "block", "draw", "energy", "heal", "card", "relic", "warn", "generic"]

CELL = 128
SCALE = 4
CANVAS = CELL * SCALE

PALETTE = {
    "attack": ("fb7185", "ffe0e4", "240812"),
    "skill": ("7dd3fc", "e0fbff", "061827"),
    "power": ("f6c177", "fff0b8", "2a1c06"),
    "status": ("8ef2dc", "e8fff9", "06261f"),
    "curse": ("c4a1ff", "f0e7ff", "1a102e"),
    "damage": ("fb7185", "ffe0e4", "280811"),
    "block": ("7dd3fc", "e0fbff", "061827"),
    "draw": ("8ef2dc", "e8fff9", "06261f"),
    "energy": ("f6c177", "fff0b8", "2a1c06"),
    "heal": ("65f0b6", "f1fff7", "06291f"),
    "card": ("9fd8ff", "e7f7ff", "071827"),
    "relic": ("c4a1ff", "f0e7ff", "1a102e"),
    "warn": ("ff9db1", "ffe0e7", "2d0b16"),
    "generic": ("d8fbff", "ffffff", "071827"),
}


def rgba(hex_color, alpha=255):
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4)) + (alpha,)


def point(x, y):
    return int(x * SCALE), int(y * SCALE)


def points(items):
    return [point(x, y) for x, y in items]


def box(items):
    return tuple(int(v * SCALE) for v in items)


def width(value):
    return max(1, int(value * SCALE))


def line(draw, coords, fill, width_value=1, joint="curve"):
    draw.line(points(coords), fill=fill, width=width(width_value), joint=joint)


def rounded(draw, coords, radius, fill=None, outline=None, width_value=1):
    draw.rounded_rectangle(box(coords), radius=width(radius), fill=fill, outline=outline, width=width(width_value))


def ellipse(draw, coords, fill=None, outline=None, width_value=1):
    draw.ellipse(box(coords), fill=fill, outline=outline, width=width(width_value))


def polygon(draw, coords, fill=None, outline=None):
    draw.polygon(points(coords), fill=fill, outline=outline)


def arc(draw, coords, start, end, fill, width_value=1):
    draw.arc(box(coords), start=start, end=end, fill=fill, width=width(width_value))


def base_plate(key, seed):
    accent, light, dark = PALETTE[key]
    rng = random.Random(seed)
    image = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    pixels = image.load()
    cx = CANVAS * 0.46
    cy = CANVAS * 0.40
    for y in range(CANVAS):
        for x in range(CANVAS):
            dx = (x - cx) / CANVAS
            dy = (y - cy) / CANVAS
            dist = math.sqrt(dx * dx * 1.22 + dy * dy * 1.42)
            bloom = max(0, 1 - dist * 3.4)
            rim = max(0, 1 - abs((x / CANVAS) - 0.5) * 2.0) * max(0, 1 - y / CANVAS)
            noise = rng.randint(-3, 4)
            ac = rgba(accent)
            dc = rgba(dark)
            r = int(dc[0] + ac[0] * bloom * 0.36 + 246 * rim * 0.03 + noise)
            g = int(dc[1] + ac[1] * bloom * 0.36 + 193 * rim * 0.03 + noise)
            b = int(dc[2] + ac[2] * bloom * 0.36 + 119 * rim * 0.02 + noise)
            pixels[x, y] = (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)), 255)
    mask = Image.new("L", (CANVAS, CANVAS), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, CANVAS - 1, CANVAS - 1), radius=width(24), fill=255)
    image.putalpha(mask)
    draw = ImageDraw.Draw(image)
    rounded(draw, (7, 7, 121, 121), 21, outline=rgba(accent, 98), width_value=1.4)
    rounded(draw, (16, 16, 112, 112), 16, fill=rgba("020a12", 66), outline=rgba(light, 45), width_value=1)
    for offset in (-28, 0, 28):
        line(draw, [(24 + offset, 20), (13 + offset, 106)], rgba(light, 20), 0.8)
    return image


def finish(image, glow, blur=5):
    return Image.alpha_composite(glow.filter(ImageFilter.GaussianBlur(width(blur))), image)


def draw_attack(image, glow, key):
    accent, light, _ = PALETTE[key]
    gd = ImageDraw.Draw(glow)
    draw = ImageDraw.Draw(image)
    line(gd, [(30, 93), (84, 39), (101, 27)], rgba(accent, 150), 12)
    line(draw, [(31, 92), (84, 39), (100, 28)], rgba(light, 234), 5)
    polygon(draw, [(91, 21), (108, 20), (103, 38)], fill=rgba(accent, 242), outline=rgba(light, 180))
    line(draw, [(44, 55), (26, 42)], rgba(accent, 220), 5)
    line(draw, [(58, 70), (38, 61)], rgba(accent, 190), 4)


def draw_skill(image, glow, key):
    accent, light, _ = PALETTE[key]
    gd = ImageDraw.Draw(glow)
    draw = ImageDraw.Draw(image)
    polygon(gd, [(64, 23), (98, 42), (96, 83), (64, 105), (32, 83), (30, 42)], fill=rgba(accent, 96))
    polygon(draw, [(64, 24), (97, 43), (95, 82), (64, 104), (33, 82), (31, 43)], fill=rgba("061827", 224), outline=rgba(light, 220))
    polygon(draw, [(64, 38), (83, 49), (82, 74), (64, 87), (46, 74), (45, 49)], fill=rgba(accent, 120), outline=rgba(accent, 205))


def draw_power(image, glow, key):
    accent, light, _ = PALETTE[key]
    gd = ImageDraw.Draw(glow)
    draw = ImageDraw.Draw(image)
    polygon(gd, [(64, 18), (104, 64), (64, 110), (24, 64)], fill=rgba(accent, 110))
    polygon(draw, [(64, 20), (102, 64), (64, 108), (26, 64)], fill=rgba("2a1c06", 230), outline=rgba(light, 220))
    ellipse(draw, (45, 45, 83, 83), fill=rgba(accent, 155), outline=rgba(light, 210), width_value=3)
    line(draw, [(64, 27), (64, 101)], rgba(accent, 160), 3)
    line(draw, [(30, 64), (98, 64)], rgba(accent, 128), 3)


def draw_status(image, glow, key):
    accent, light, _ = PALETTE[key]
    gd = ImageDraw.Draw(glow)
    draw = ImageDraw.Draw(image)
    ellipse(gd, (22, 22, 106, 106), fill=rgba(accent, 76))
    for radius, start in [(72, 20), (54, 204), (34, 310)]:
        arc(draw, (64 - radius / 2, 64 - radius / 2, 64 + radius / 2, 64 + radius / 2), start, start + 245, rgba(light, 205), 5)
    ellipse(draw, (54, 54, 74, 74), fill=rgba(accent, 238), outline=rgba(light, 220), width_value=2)


def draw_curse(image, glow, key):
    accent, light, _ = PALETTE[key]
    gd = ImageDraw.Draw(glow)
    draw = ImageDraw.Draw(image)
    polygon(gd, [(64, 19), (99, 44), (87, 102), (41, 103), (29, 45)], fill=rgba(accent, 94))
    polygon(draw, [(64, 22), (96, 45), (85, 100), (43, 100), (32, 45)], fill=rgba("1a102e", 234), outline=rgba(light, 205))
    line(draw, [(63, 34), (54, 54), (66, 66), (57, 91)], rgba(accent, 235), 5)
    ellipse(draw, (72, 75, 83, 86), fill=rgba(light, 230))


def draw_damage(image, glow, key):
    accent, light, _ = PALETTE[key]
    gd = ImageDraw.Draw(glow)
    draw = ImageDraw.Draw(image)
    star = [(64, 17), (75, 51), (108, 38), (83, 64), (108, 91), (74, 78), (64, 111), (54, 78), (20, 91), (45, 64), (20, 38), (53, 51)]
    polygon(gd, star, fill=rgba(accent, 130))
    polygon(draw, star, fill=rgba(accent, 232), outline=rgba(light, 220))
    line(draw, [(36, 93), (92, 37)], rgba("280811", 190), 5)


def draw_block(image, glow, key):
    draw_skill(image, glow, key)
    draw = ImageDraw.Draw(image)
    accent, light, _ = PALETTE[key]
    line(draw, [(50, 64), (61, 77), (80, 50)], rgba(light, 232), 5)
    ellipse(draw, (58, 58, 70, 70), fill=rgba(accent, 180))


def draw_draw(image, glow, key):
    accent, light, _ = PALETTE[key]
    draw = ImageDraw.Draw(image)
    for offset, alpha in [(12, 120), (3, 170), (-6, 230)]:
        rounded(draw, (42 + offset, 30 + offset * 0.2, 85 + offset, 92 + offset * 0.2), 7, fill=rgba("06261f", alpha), outline=rgba(light, min(240, alpha + 35)), width_value=2)
    arc(draw, (30, 37, 96, 102), 200, 520, rgba(accent, 220), 5)
    polygon(draw, [(82, 91), (101, 89), (91, 73)], fill=rgba(light, 220))


def draw_energy(image, glow, key):
    accent, light, _ = PALETTE[key]
    gd = ImageDraw.Draw(glow)
    draw = ImageDraw.Draw(image)
    polygon(gd, [(68, 20), (38, 68), (61, 65), (53, 107), (92, 53), (69, 58)], fill=rgba(accent, 130))
    polygon(draw, [(68, 21), (39, 67), (61, 65), (53, 106), (91, 54), (69, 58)], fill=rgba(accent, 238), outline=rgba(light, 225))
    line(draw, [(66, 30), (57, 60), (73, 58), (61, 91)], rgba(light, 175), 3)


def draw_heal(image, glow, key):
    accent, light, _ = PALETTE[key]
    gd = ImageDraw.Draw(glow)
    draw = ImageDraw.Draw(image)
    ellipse(gd, (28, 27, 100, 101), fill=rgba(accent, 96))
    rounded(draw, (45, 29, 83, 95), 16, fill=rgba("06291f", 238), outline=rgba(light, 215), width_value=3)
    rounded(draw, (52, 37, 76, 88), 10, fill=rgba(accent, 150))
    line(draw, [(64, 44), (64, 81)], rgba(light, 235), 5)
    line(draw, [(48, 62), (80, 62)], rgba(light, 235), 5)


def draw_card(image, glow, key):
    accent, light, _ = PALETTE[key]
    draw = ImageDraw.Draw(image)
    rounded(draw, (38, 25, 88, 101), 8, fill=rgba("071827", 235), outline=rgba(light, 220), width_value=3)
    rounded(draw, (47, 38, 79, 50), 3, fill=rgba(accent, 115))
    line(draw, [(50, 66), (76, 66)], rgba(accent, 190), 3)
    line(draw, [(50, 78), (70, 78)], rgba(light, 145), 2)


def draw_relic(image, glow, key):
    accent, light, _ = PALETTE[key]
    gd = ImageDraw.Draw(glow)
    draw = ImageDraw.Draw(image)
    polygon(gd, [(64, 21), (101, 48), (86, 96), (64, 109), (42, 96), (27, 48)], fill=rgba(accent, 104))
    polygon(draw, [(64, 23), (98, 49), (84, 94), (64, 106), (44, 94), (30, 49)], fill=rgba("1a102e", 228), outline=rgba(light, 220))
    line(draw, [(64, 24), (64, 105)], rgba(accent, 190), 4)
    line(draw, [(32, 49), (96, 49)], rgba(accent, 154), 3)
    ellipse(draw, (54, 57, 74, 77), fill=rgba(light, 215))


def draw_warn(image, glow, key):
    accent, light, _ = PALETTE[key]
    gd = ImageDraw.Draw(glow)
    draw = ImageDraw.Draw(image)
    polygon(gd, [(64, 22), (105, 98), (23, 98)], fill=rgba(accent, 120))
    polygon(draw, [(64, 24), (102, 96), (26, 96)], fill=rgba("2d0b16", 235), outline=rgba(light, 220))
    line(draw, [(64, 45), (64, 72)], rgba(accent, 242), 6)
    ellipse(draw, (59, 81, 69, 91), fill=rgba(light, 235))


def draw_generic(image, glow, key):
    draw_status(image, glow, key)


DRAWERS = {
    "attack": draw_attack,
    "skill": draw_skill,
    "power": draw_power,
    "status": draw_status,
    "curse": draw_curse,
    "damage": draw_damage,
    "block": draw_block,
    "draw": draw_draw,
    "energy": draw_energy,
    "heal": draw_heal,
    "card": draw_card,
    "relic": draw_relic,
    "warn": draw_warn,
    "generic": draw_generic,
}


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    cells = []
    for index, key in enumerate(ICONS):
        image = base_plate(key, 700 + index * 43)
        glow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
        DRAWERS[key](image, glow, key)
        cells.append(finish(image, glow).resize((CELL, CELL), Image.Resampling.LANCZOS))
    sheet = Image.new("RGBA", (CELL * len(cells), CELL), (0, 0, 0, 0))
    for index, cell in enumerate(cells):
        sheet.alpha_composite(cell, (index * CELL, 0))
    sheet.save(OUT)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
