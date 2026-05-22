from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import math
import random


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "status-icons.png"

CELL = 128
SCALE = 3
STATUSES = [
    "vulnerable",
    "weak",
    "frail",
    "virus",
    "mark",
    "strength",
    "focus",
    "charge",
    "counter",
    "plated",
    "fragile",
    "echo",
    "deepIndex",
    "choir",
    "contagion",
    "pearlEngine",
    "nextEnergy",
    "mirror",
    "haste",
    "more",
]
W = CELL * len(STATUSES) * SCALE
H = CELL * SCALE


PALETTE = {
    "harmful": ("fb7185", "ffe0e4", "351018"),
    "warning": ("f6c177", "fff0b8", "372408"),
    "beneficial": ("7dd3fc", "e0fbff", "08263a"),
    "power": ("b59cff", "f2ecff", "1a1238"),
    "bio": ("8ef2dc", "e6fff8", "082b25"),
    "neutral": ("a9beb9", "ecf8f3", "111827"),
}

STATUS_GROUP = {
    "vulnerable": "harmful",
    "weak": "harmful",
    "frail": "harmful",
    "virus": "bio",
    "mark": "warning",
    "strength": "beneficial",
    "focus": "beneficial",
    "charge": "warning",
    "counter": "beneficial",
    "plated": "beneficial",
    "fragile": "harmful",
    "echo": "power",
    "deepIndex": "power",
    "choir": "warning",
    "contagion": "bio",
    "pearlEngine": "bio",
    "nextEnergy": "warning",
    "mirror": "beneficial",
    "haste": "beneficial",
    "more": "neutral",
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


def rect(draw, index, values, fill=None, outline=None, stroke=1, radius=7):
    draw.rounded_rectangle(box(index, values), radius=sw(radius), fill=fill, outline=outline, width=sw(stroke))


def polygon(draw, index, values, fill=None, outline=None):
    draw.polygon(pts(index, values), fill=fill, outline=outline)


def arc(draw, index, values, start, end, fill, stroke=1):
    draw.arc(box(index, values), start=start, end=end, fill=fill, width=sw(stroke))


def palette(status):
    return PALETTE[STATUS_GROUP[status]]


def icon_base(draw, glow, index, status):
    accent, light, dark = palette(status)
    rng = random.Random(index * 31 + 11)
    ellipse(glow, index, (21, 19, 107, 107), fill=rgba(accent, 78))
    ellipse(draw, index, (18, 17, 110, 109), fill=rgba(dark, 226), outline=rgba(accent, 166), stroke=2)
    ellipse(draw, index, (27, 26, 101, 100), fill=rgba("06101d", 188), outline=rgba(light, 72), stroke=1)
    for _ in range(7):
        x = rng.randint(36, 92)
        y = rng.randint(34, 94)
        ellipse(draw, index, (x - 1, y - 1, x + 1, y + 1), fill=rgba(light, rng.randint(36, 88)))


def draw_vulnerable(draw, glow, index):
    accent, light, _ = palette("vulnerable")
    diamond = [(64, 27), (96, 64), (64, 101), (32, 64)]
    polygon(glow, index, diamond, fill=rgba(accent, 95))
    polygon(draw, index, diamond, fill=rgba("351018", 232), outline=rgba(light, 224))
    line(draw, index, [(64, 38), (64, 90), (45, 64), (83, 64)], rgba(accent, 226), 4)
    ellipse(draw, index, (56, 56, 72, 72), fill=rgba(light, 225))


def draw_weak(draw, glow, index):
    accent, light, _ = palette("weak")
    for offset, alpha in [(0, 230), (16, 168), (-16, 168)]:
        polygon(draw, index, [(64 + offset, 91), (46 + offset, 67), (57 + offset, 67), (57 + offset, 37), (71 + offset, 37), (71 + offset, 67), (82 + offset, 67)], fill=rgba(light if offset == 0 else accent, alpha))
    line(glow, index, [(43, 93), (85, 93)], rgba(accent, 130), 7)


def draw_frail(draw, glow, index):
    accent, light, _ = palette("frail")
    polygon(glow, index, [(64, 29), (91, 43), (86, 84), (64, 100), (42, 84), (37, 43)], fill=rgba(accent, 86))
    polygon(draw, index, [(64, 30), (90, 44), (85, 83), (64, 99), (43, 83), (38, 44)], fill=rgba("351018", 228), outline=rgba(light, 220))
    line(draw, index, [(64, 33), (58, 55), (69, 66), (60, 96)], rgba(accent, 232), 5)
    line(draw, index, [(45, 54), (58, 55), (78, 42)], rgba(light, 135), 3)


def draw_virus(draw, glow, index):
    accent, light, _ = palette("virus")
    ellipse(glow, index, (37, 37, 91, 91), fill=rgba(accent, 108))
    ellipse(draw, index, (42, 42, 86, 86), fill=rgba("082b25", 225), outline=rgba(light, 218), stroke=4)
    for angle in range(0, 360, 45):
        x1 = 64 + math.cos(math.radians(angle)) * 23
        y1 = 64 + math.sin(math.radians(angle)) * 23
        x2 = 64 + math.cos(math.radians(angle)) * 36
        y2 = 64 + math.sin(math.radians(angle)) * 36
        line(draw, index, [(x1, y1), (x2, y2)], rgba(accent, 220), 4)
        ellipse(draw, index, (x2 - 4, y2 - 4, x2 + 4, y2 + 4), fill=rgba(light, 210))
    ellipse(draw, index, (56, 56, 72, 72), fill=rgba(accent, 210))


def draw_mark(draw, glow, index):
    accent, light, _ = palette("mark")
    for radius, alpha in [(31, 225), (20, 170), (9, 225)]:
        ellipse(draw, index, (64 - radius, 64 - radius, 64 + radius, 64 + radius), outline=rgba(light if radius == 31 else accent, alpha), stroke=4)
    line(draw, index, [(64, 27), (64, 101), (27, 64), (101, 64)], rgba(light, 120), 2)


def draw_strength(draw, glow, index):
    accent, light, _ = palette("strength")
    line(glow, index, [(64, 91), (64, 34)], rgba(accent, 130), 8)
    line(draw, index, [(64, 91), (64, 34)], rgba(light, 232), 6)
    line(draw, index, [(42, 56), (64, 34), (86, 56)], rgba(accent, 228), 6)
    line(draw, index, [(47, 78), (81, 78)], rgba(light, 180), 5)
    ellipse(draw, index, (57, 66, 71, 80), fill=rgba(accent, 225))


def draw_focus(draw, glow, index):
    accent, light, _ = palette("focus")
    polygon(glow, index, [(31, 64), (48, 45), (64, 39), (80, 45), (97, 64), (80, 83), (64, 89), (48, 83)], fill=rgba(accent, 78))
    polygon(draw, index, [(32, 64), (49, 46), (64, 40), (79, 46), (96, 64), (79, 82), (64, 88), (49, 82)], fill=rgba("08263a", 225), outline=rgba(light, 218))
    ellipse(draw, index, (51, 51, 77, 77), fill=rgba(accent, 180), outline=rgba(light, 220), stroke=3)
    ellipse(draw, index, (59, 59, 69, 69), fill=rgba(light, 235))


def draw_charge(draw, glow, index):
    accent, light, _ = palette("charge")
    polygon(glow, index, [(68, 24), (41, 68), (62, 66), (55, 104), (88, 55), (67, 58)], fill=rgba(accent, 110))
    polygon(draw, index, [(68, 25), (42, 67), (62, 66), (55, 103), (87, 55), (67, 58)], fill=rgba(accent, 232), outline=rgba(light, 224))
    line(draw, index, [(67, 32), (56, 61), (72, 59), (62, 88)], rgba(light, 175), 3)


def draw_counter(draw, glow, index):
    accent, light, _ = palette("counter")
    line(draw, index, [(37, 78), (55, 46), (72, 78), (91, 43)], rgba(light, 226), 6)
    polygon(draw, index, [(91, 43), (91, 61), (105, 45)], fill=rgba(accent, 226))
    arc(glow, index, (31, 30, 97, 98), 40, 330, rgba(accent, 110), 8)
    arc(draw, index, (34, 33, 94, 95), 44, 330, rgba(accent, 220), 4)


def draw_plated(draw, glow, index):
    accent, light, _ = palette("plated")
    hexagon = [(64, 28), (92, 46), (92, 82), (64, 100), (36, 82), (36, 46)]
    polygon(glow, index, hexagon, fill=rgba(accent, 85))
    polygon(draw, index, hexagon, fill=rgba("08263a", 232), outline=rgba(light, 224))
    polygon(draw, index, [(64, 42), (79, 52), (79, 76), (64, 86), (49, 76), (49, 52)], fill=rgba(accent, 118), outline=rgba(light, 174))
    line(draw, index, [(50, 64), (78, 64)], rgba(light, 170), 3)


def draw_fragile(draw, glow, index):
    accent, light, _ = palette("fragile")
    rect(glow, index, (39, 31, 89, 97), fill=rgba(accent, 80), radius=9)
    rect(draw, index, (41, 33, 87, 95), fill=rgba("351018", 230), outline=rgba(light, 218), stroke=4, radius=9)
    line(draw, index, [(64, 37), (57, 56), (69, 67), (60, 92)], rgba(accent, 235), 5)
    line(draw, index, [(48, 51), (57, 56), (80, 45)], rgba(light, 135), 3)
    line(draw, index, [(47, 78), (60, 76), (77, 88)], rgba(light, 125), 3)


def draw_echo(draw, glow, index):
    accent, light, _ = palette("echo")
    for radius, alpha in [(31, 206), (21, 168), (11, 225)]:
        ellipse(draw, index, (64 - radius, 64 - radius, 64 + radius, 64 + radius), outline=rgba(light if radius == 11 else accent, alpha), stroke=4)
    arc(glow, index, (30, 30, 98, 98), 35, 320, rgba(accent, 115), 9)
    polygon(draw, index, [(89, 39), (97, 57), (78, 54)], fill=rgba(light, 220))


def draw_deep_index(draw, glow, index):
    accent, light, _ = palette("deepIndex")
    rect(glow, index, (37, 29, 91, 97), fill=rgba(accent, 78), radius=8)
    rect(draw, index, (39, 31, 89, 96), fill=rgba("1a1238", 232), outline=rgba(light, 218), stroke=4, radius=7)
    for y in [48, 60, 72, 84]:
        line(draw, index, [(50, y), (80, y)], rgba(accent, 184), 3)
    line(draw, index, [(49, 31), (49, 96)], rgba(light, 145), 3)


def draw_choir(draw, glow, index):
    accent, light, _ = palette("choir")
    for x, h in [(45, 44), (58, 58), (71, 50), (84, 64)]:
        line(draw, index, [(x, 90), (x, 90 - h)], rgba(light, 220), 5)
        ellipse(draw, index, (x - 7, 87 - h, x + 7, 101 - h), fill=rgba(accent, 218))
    arc(glow, index, (31, 34, 97, 96), 204, 335, rgba(accent, 118), 8)
    arc(draw, index, (34, 36, 94, 94), 206, 335, rgba(light, 160), 3)


def draw_contagion(draw, glow, index):
    accent, light, _ = palette("contagion")
    for x, y, r in [(55, 56, 16), (74, 66, 19), (58, 82, 13), (82, 44, 11)]:
        ellipse(glow, index, (x - r, y - r, x + r, y + r), fill=rgba(accent, 62))
        ellipse(draw, index, (x - r, y - r, x + r, y + r), fill=rgba("082b25", 218), outline=rgba(light, 190), stroke=3)
    line(draw, index, [(59, 61), (71, 65), (62, 78), (79, 49)], rgba(accent, 225), 4)


def draw_pearl_engine(draw, glow, index):
    accent, light, _ = palette("pearlEngine")
    ellipse(glow, index, (34, 32, 94, 94), fill=rgba(accent, 106))
    ellipse(draw, index, (37, 35, 91, 89), fill=rgba("082b25", 220), outline=rgba(light, 224), stroke=4)
    ellipse(draw, index, (50, 48, 78, 76), fill=rgba(light, 230), outline=rgba(accent, 225), stroke=3)
    for angle in range(0, 360, 90):
        x = 64 + math.cos(math.radians(angle)) * 31
        y = 64 + math.sin(math.radians(angle)) * 31
        line(draw, index, [(64, 64), (x, y)], rgba(accent, 164), 3)


def draw_next_energy(draw, glow, index):
    accent, light, _ = palette("nextEnergy")
    rect(draw, index, (36, 47, 86, 84), fill=rgba("372408", 232), outline=rgba(light, 220), stroke=4, radius=8)
    rect(draw, index, (87, 58, 95, 73), fill=rgba(light, 210), radius=3)
    polygon(glow, index, [(63, 31), (50, 63), (65, 61), (59, 96), (81, 55), (67, 58)], fill=rgba(accent, 98))
    polygon(draw, index, [(63, 31), (51, 62), (65, 61), (59, 96), (80, 55), (67, 58)], fill=rgba(accent, 232), outline=rgba(light, 200))


def draw_mirror(draw, glow, index):
    accent, light, _ = palette("mirror")
    ellipse(glow, index, (34, 28, 94, 100), fill=rgba(accent, 96))
    ellipse(draw, index, (37, 31, 91, 97), fill=rgba("08263a", 210), outline=rgba(light, 224), stroke=4)
    arc(draw, index, (45, 38, 87, 92), 65, 285, rgba(accent, 210), 5)
    line(draw, index, [(52, 48), (77, 80)], rgba(light, 140), 3)
    line(draw, index, [(75, 44), (50, 80)], rgba(light, 90), 2)


def draw_haste(draw, glow, index):
    accent, light, _ = palette("haste")
    for offset, alpha in [(0, 230), (-18, 150), (18, 150)]:
        polygon(draw, index, [(45 + offset, 38), (84 + offset, 64), (45 + offset, 90), (58 + offset, 64)], fill=rgba(light if offset == 0 else accent, alpha))
    line(glow, index, [(33, 96), (95, 96)], rgba(accent, 104), 7)


def draw_more(draw, glow, index):
    accent, light, _ = palette("more")
    for x in [46, 64, 82]:
        ellipse(draw, index, (x - 7, 57, x + 7, 71), fill=rgba(light, 224), outline=rgba(accent, 180), stroke=2)
    arc(glow, index, (32, 32, 96, 96), 0, 360, rgba(accent, 70), 8)
    ellipse(draw, index, (34, 34, 94, 94), outline=rgba(accent, 145), stroke=3)


DRAWERS = {
    "vulnerable": draw_vulnerable,
    "weak": draw_weak,
    "frail": draw_frail,
    "virus": draw_virus,
    "mark": draw_mark,
    "strength": draw_strength,
    "focus": draw_focus,
    "charge": draw_charge,
    "counter": draw_counter,
    "plated": draw_plated,
    "fragile": draw_fragile,
    "echo": draw_echo,
    "deepIndex": draw_deep_index,
    "choir": draw_choir,
    "contagion": draw_contagion,
    "pearlEngine": draw_pearl_engine,
    "nextEnergy": draw_next_energy,
    "mirror": draw_mirror,
    "haste": draw_haste,
    "more": draw_more,
}


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    gd = ImageDraw.Draw(glow)
    for index, status in enumerate(STATUSES):
        icon_base(draw, gd, index, status)
        DRAWERS[status](draw, gd, index)
    glow = glow.filter(ImageFilter.GaussianBlur(sw(4)))
    image = Image.alpha_composite(glow, image)
    image = image.resize((CELL * len(STATUSES), CELL), Image.Resampling.LANCZOS)
    image.save(OUT)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
