from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import math
import random


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "relic-icons.png"

CELL = 128
SCALE = 3
ICONS = [
    "anchor",
    "battery",
    "bell",
    "coin",
    "compass",
    "coral",
    "crown",
    "echo",
    "gear",
    "gill",
    "hourglass",
    "ink",
    "key",
    "ledger",
    "lens",
    "map",
    "medal",
    "meter",
    "needle",
    "oil",
    "pass",
    "pearl",
    "prism",
    "shell",
    "spool",
    "tablet",
    "tag",
    "vial",
    "weight",
]
W = CELL * len(ICONS) * SCALE
H = CELL * SCALE


PALETTES = {
    "metal": ("9df0ba", "e7ffe8", "0c2417"),
    "charge": ("7dd3fc", "e1fbff", "06243a"),
    "gold": ("f6c177", "fff1bc", "3a2308"),
    "archive": ("b59cff", "f0e8ff", "1a1238"),
    "optic": ("8ddcff", "effcff", "08263a"),
    "abyss": ("d7c8ff", "f6f0ff", "1a1530"),
    "bio": ("8ef2dc", "e6fff8", "082b25"),
    "hazard": ("ffc2b7", "fff0ea", "3a110d"),
}

ICON_GROUP = {
    "anchor": "metal",
    "weight": "metal",
    "gear": "metal",
    "battery": "charge",
    "meter": "charge",
    "oil": "charge",
    "coin": "gold",
    "crown": "gold",
    "medal": "gold",
    "bell": "gold",
    "key": "archive",
    "pass": "archive",
    "map": "archive",
    "tablet": "archive",
    "ledger": "archive",
    "lens": "optic",
    "prism": "optic",
    "compass": "optic",
    "ink": "abyss",
    "spool": "abyss",
    "echo": "abyss",
    "hourglass": "abyss",
    "coral": "bio",
    "shell": "bio",
    "gill": "bio",
    "pearl": "bio",
    "needle": "hazard",
    "tag": "hazard",
    "vial": "hazard",
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


def palette(icon):
    return PALETTES[ICON_GROUP[icon]]


def icon_base(draw, glow, index, icon):
    accent, light, dark = palette(icon)
    rng = random.Random(index * 47 + 19)
    ellipse(glow, index, (20, 18, 108, 108), fill=rgba(accent, 82))
    rect(glow, index, (28, 28, 100, 100), fill=rgba(accent, 42), radius=18)
    ellipse(draw, index, (18, 17, 110, 109), fill=rgba(dark, 230), outline=rgba(accent, 162), stroke=2)
    ellipse(draw, index, (27, 26, 101, 100), fill=rgba("06101d", 188), outline=rgba(light, 78), stroke=1)
    for _ in range(8):
        x = rng.randint(36, 92)
        y = rng.randint(34, 94)
        ellipse(draw, index, (x - 1, y - 1, x + 1, y + 1), fill=rgba(light, rng.randint(42, 96)))


def draw_anchor(draw, glow, index):
    accent, light, _ = palette("anchor")
    line(glow, index, [(64, 30), (64, 87)], rgba(accent, 142), 8)
    ellipse(draw, index, (56, 24, 72, 40), outline=rgba(light, 226), stroke=4)
    line(draw, index, [(64, 39), (64, 88)], rgba(light, 226), 5)
    line(draw, index, [(45, 52), (83, 52)], rgba(accent, 230), 5)
    arc(draw, index, (35, 55, 93, 103), 22, 158, rgba(light, 222), 5)
    polygon(draw, index, [(35, 78), (48, 79), (40, 91)], fill=rgba(accent, 230))
    polygon(draw, index, [(93, 78), (80, 79), (88, 91)], fill=rgba(accent, 230))


def draw_battery(draw, glow, index):
    accent, light, _ = palette("battery")
    rect(glow, index, (34, 44, 91, 84), fill=rgba(accent, 92), radius=9)
    rect(draw, index, (34, 45, 88, 84), fill=rgba("052a3b", 230), outline=rgba(light, 226), stroke=4, radius=8)
    rect(draw, index, (89, 56, 97, 72), fill=rgba(light, 220), radius=3)
    rect(draw, index, (41, 53, 58, 77), fill=rgba(accent, 230), radius=4)
    rect(draw, index, (62, 53, 80, 77), fill=rgba(accent, 120), outline=rgba(accent, 190), stroke=2, radius=4)
    line(draw, index, [(50, 44), (55, 33), (59, 44)], rgba(light, 190), 3)


def draw_bell(draw, glow, index):
    accent, light, _ = palette("bell")
    ellipse(glow, index, (38, 30, 90, 92), fill=rgba(accent, 96))
    polygon(draw, index, [(43, 83), (48, 50), (64, 35), (80, 50), (85, 83)], fill=rgba("3a2308", 230), outline=rgba(light, 220))
    arc(draw, index, (43, 74, 85, 94), 0, 180, rgba(light, 222), 4)
    ellipse(draw, index, (57, 86, 71, 100), fill=rgba(accent, 228), outline=rgba(light, 210), stroke=2)
    line(draw, index, [(54, 39), (64, 24), (74, 39)], rgba(accent, 210), 4)


def draw_coin(draw, glow, index):
    accent, light, _ = palette("coin")
    ellipse(glow, index, (31, 30, 97, 96), fill=rgba(accent, 112))
    ellipse(draw, index, (33, 32, 95, 94), fill=rgba("3a2308", 235), outline=rgba(light, 226), stroke=5)
    ellipse(draw, index, (45, 44, 83, 82), outline=rgba(accent, 228), stroke=4)
    line(draw, index, [(64, 45), (64, 82)], rgba(light, 226), 4)
    arc(draw, index, (51, 47, 77, 63), 180, 350, rgba(accent, 225), 3)
    arc(draw, index, (51, 64, 77, 80), 8, 180, rgba(accent, 225), 3)


def draw_compass(draw, glow, index):
    accent, light, _ = palette("compass")
    ellipse(glow, index, (30, 28, 98, 96), fill=rgba(accent, 104))
    ellipse(draw, index, (33, 31, 95, 93), fill=rgba("08263a", 232), outline=rgba(light, 226), stroke=4)
    polygon(draw, index, [(64, 38), (72, 64), (64, 90), (56, 64)], fill=rgba(accent, 226), outline=rgba(light, 214))
    polygon(draw, index, [(64, 38), (70, 64), (64, 60), (58, 64)], fill=rgba(light, 236))
    ellipse(draw, index, (58, 58, 70, 70), fill=rgba("06101d", 230), outline=rgba(light, 210), stroke=2)
    line(draw, index, [(43, 64), (85, 64), (64, 43), (64, 85)], rgba(light, 120), 2)


def draw_coral(draw, glow, index):
    accent, light, _ = palette("coral")
    line(glow, index, [(64, 91), (64, 45)], rgba(accent, 150), 8)
    line(draw, index, [(64, 92), (64, 42)], rgba(light, 226), 5)
    for branch in [[(64, 67), (48, 54), (43, 42)], [(65, 61), (83, 49), (87, 36)], [(63, 76), (46, 77), (38, 69)], [(66, 78), (82, 78), (91, 69)]]:
        line(draw, index, branch, rgba(accent, 230), 5)
    for x, y in [(43, 42), (87, 36), (38, 69), (91, 69), (64, 42)]:
        ellipse(draw, index, (x - 4, y - 4, x + 4, y + 4), fill=rgba(light, 230))


def draw_crown(draw, glow, index):
    accent, light, _ = palette("crown")
    polygon(glow, index, [(33, 84), (42, 45), (56, 70), (64, 35), (72, 70), (86, 45), (95, 84)], fill=rgba(accent, 92))
    polygon(draw, index, [(35, 84), (43, 46), (56, 70), (64, 35), (72, 70), (85, 46), (93, 84)], fill=rgba("3a2308", 232), outline=rgba(light, 226))
    rect(draw, index, (38, 80, 90, 93), fill=rgba(accent, 228), outline=rgba(light, 210), stroke=2, radius=4)
    for x, y in [(43, 46), (64, 35), (85, 46)]:
        ellipse(draw, index, (x - 4, y - 4, x + 4, y + 4), fill=rgba(light, 235))


def draw_echo(draw, glow, index):
    accent, light, _ = palette("echo")
    for offset, alpha in [(0, 70), (12, 105), (24, 140)]:
        ellipse(glow, index, (28 + offset / 2, 28 + offset / 2, 100 - offset / 2, 100 - offset / 2), fill=rgba(accent, alpha))
    for radius in [(34, 34, 94, 94), (45, 45, 83, 83), (55, 55, 73, 73)]:
        ellipse(draw, index, radius, outline=rgba(light, 230), stroke=4)
    ellipse(draw, index, (60, 60, 68, 68), fill=rgba(accent, 240))
    line(draw, index, [(77, 50), (89, 40), (93, 54)], rgba(accent, 180), 3)


def draw_gear(draw, glow, index):
    accent, light, _ = palette("gear")
    teeth = []
    for step in range(16):
        angle = math.radians(step * 22.5)
        radius = 38 if step % 2 == 0 else 30
        teeth.append((64 + math.cos(angle) * radius, 64 + math.sin(angle) * radius))
    polygon(glow, index, teeth, fill=rgba(accent, 86))
    polygon(draw, index, teeth, fill=rgba("0c2417", 232), outline=rgba(light, 220))
    ellipse(draw, index, (45, 45, 83, 83), fill=rgba("06101d", 230), outline=rgba(accent, 228), stroke=5)
    ellipse(draw, index, (57, 57, 71, 71), fill=rgba(light, 235))


def draw_gill(draw, glow, index):
    accent, light, _ = palette("gill")
    arc(glow, index, (28, 30, 100, 98), 200, 340, rgba(accent, 118), 9)
    for offset in [0, 8, 16, 24]:
        arc(draw, index, (33 + offset, 35, 95 - offset, 93), 200, 340, rgba(light if offset == 0 else accent, 220), 4)
    line(draw, index, [(64, 36), (64, 92)], rgba(light, 210), 4)
    ellipse(draw, index, (56, 56, 72, 72), fill=rgba(accent, 220))


def draw_hourglass(draw, glow, index):
    accent, light, _ = palette("hourglass")
    rect(glow, index, (42, 28, 86, 100), fill=rgba(accent, 82), radius=8)
    line(draw, index, [(43, 30), (85, 30), (43, 98), (85, 98)], rgba(light, 224), 5)
    polygon(draw, index, [(47, 36), (81, 36), (64, 61)], fill=rgba(accent, 172), outline=rgba(light, 130))
    polygon(draw, index, [(64, 67), (47, 92), (81, 92)], fill=rgba(accent, 218), outline=rgba(light, 130))
    line(draw, index, [(64, 61), (64, 70)], rgba(light, 230), 3)


def draw_ink(draw, glow, index):
    accent, light, _ = palette("ink")
    rect(draw, index, (45, 31, 83, 73), fill=rgba("1a1530", 235), outline=rgba(light, 220), stroke=4, radius=9)
    rect(draw, index, (51, 24, 77, 38), fill=rgba(accent, 218), outline=rgba(light, 190), stroke=2, radius=5)
    polygon(glow, index, [(64, 68), (82, 92), (64, 104), (46, 92)], fill=rgba(accent, 110))
    polygon(draw, index, [(64, 66), (81, 91), (64, 104), (47, 91)], fill=rgba(accent, 222), outline=rgba(light, 215))


def draw_key(draw, glow, index):
    accent, light, _ = palette("key")
    ellipse(glow, index, (31, 39, 65, 73), fill=rgba(accent, 105))
    ellipse(draw, index, (33, 41, 63, 71), fill=rgba("1a1238", 230), outline=rgba(light, 225), stroke=5)
    line(draw, index, [(62, 56), (96, 56)], rgba(light, 225), 6)
    line(draw, index, [(84, 56), (84, 71), (94, 71)], rgba(accent, 230), 5)
    ellipse(draw, index, (43, 51, 53, 61), fill=rgba(accent, 210))


def draw_ledger(draw, glow, index):
    accent, light, _ = palette("ledger")
    rect(glow, index, (34, 29, 94, 96), fill=rgba(accent, 80), radius=8)
    rect(draw, index, (36, 31, 92, 95), fill=rgba("1a1238", 235), outline=rgba(light, 220), stroke=4, radius=7)
    line(draw, index, [(50, 31), (50, 95)], rgba(accent, 190), 4)
    for y in [48, 60, 72, 84]:
        line(draw, index, [(58, y), (82, y)], rgba(light, 145), 2)
    rect(draw, index, (41, 42, 48, 55), fill=rgba(accent, 220), radius=2)


def draw_lens(draw, glow, index):
    accent, light, _ = palette("lens")
    ellipse(glow, index, (31, 30, 83, 82), fill=rgba(accent, 114))
    ellipse(draw, index, (33, 32, 81, 80), fill=rgba("08263a", 170), outline=rgba(light, 230), stroke=5)
    line(draw, index, [(75, 75), (96, 96)], rgba(light, 228), 6)
    line(draw, index, [(45, 44), (59, 37)], rgba(light, 120), 3)
    ellipse(draw, index, (47, 46, 67, 66), fill=rgba(accent, 78))


def draw_map(draw, glow, index):
    accent, light, _ = palette("map")
    polygon(glow, index, [(30, 39), (51, 31), (77, 40), (98, 32), (98, 86), (76, 96), (51, 88), (30, 97)], fill=rgba(accent, 82))
    polygon(draw, index, [(31, 40), (51, 32), (77, 41), (97, 33), (97, 85), (76, 95), (51, 87), (31, 96)], fill=rgba("1a1238", 232), outline=rgba(light, 212))
    line(draw, index, [(51, 32), (51, 87), (77, 41), (77, 95)], rgba(accent, 170), 3)
    line(draw, index, [(39, 75), (53, 64), (66, 70), (86, 53)], rgba(light, 220), 3)
    ellipse(draw, index, (36, 72, 44, 80), fill=rgba(accent, 230))
    ellipse(draw, index, (82, 49, 90, 57), fill=rgba(accent, 230))


def draw_medal(draw, glow, index):
    accent, light, _ = palette("medal")
    polygon(draw, index, [(48, 28), (64, 52), (80, 28), (87, 48), (72, 69), (56, 69), (41, 48)], fill=rgba("3a2308", 228), outline=rgba(light, 210))
    ellipse(glow, index, (43, 57, 85, 99), fill=rgba(accent, 105))
    ellipse(draw, index, (44, 58, 84, 98), fill=rgba(accent, 228), outline=rgba(light, 230), stroke=4)
    polygon(draw, index, [(64, 66), (69, 78), (82, 78), (71, 85), (75, 96), (64, 89), (53, 96), (57, 85), (46, 78), (59, 78)], fill=rgba(light, 218))


def draw_meter(draw, glow, index):
    accent, light, _ = palette("meter")
    polygon(glow, index, [(44, 94), (64, 27), (84, 94)], fill=rgba(accent, 82))
    polygon(draw, index, [(44, 94), (64, 27), (84, 94)], fill=rgba("06243a", 232), outline=rgba(light, 222))
    line(draw, index, [(64, 35), (72, 78)], rgba(accent, 230), 4)
    ellipse(draw, index, (67, 76, 77, 86), fill=rgba(light, 230))
    for x in [54, 64, 74]:
        line(draw, index, [(x, 82), (x, 94)], rgba(light, 150), 3)


def draw_needle(draw, glow, index):
    accent, light, _ = palette("needle")
    line(glow, index, [(36, 91), (92, 35)], rgba(accent, 125), 8)
    line(draw, index, [(39, 88), (89, 38)], rgba(light, 230), 5)
    rect(draw, index, (33, 79, 53, 99), fill=rgba("3a110d", 230), outline=rgba(accent, 220), stroke=3, radius=5)
    line(draw, index, [(76, 31), (96, 25)], rgba(accent, 228), 4)
    line(draw, index, [(56, 71), (70, 85)], rgba(accent, 180), 3)


def draw_oil(draw, glow, index):
    accent, light, _ = palette("oil")
    rect(draw, index, (38, 54, 78, 90), fill=rgba("06243a", 232), outline=rgba(light, 222), stroke=4, radius=8)
    polygon(draw, index, [(75, 59), (92, 49), (95, 59), (78, 70)], fill=rgba(accent, 218), outline=rgba(light, 170))
    rect(draw, index, (45, 42, 67, 57), fill=rgba(accent, 220), outline=rgba(light, 180), stroke=2, radius=4)
    polygon(glow, index, [(89, 69), (100, 88), (88, 99), (78, 88)], fill=rgba(accent, 92))
    polygon(draw, index, [(90, 69), (100, 88), (88, 99), (78, 88)], fill=rgba(accent, 226), outline=rgba(light, 215))


def draw_pass(draw, glow, index):
    accent, light, _ = palette("pass")
    rect(glow, index, (31, 43, 97, 85), fill=rgba(accent, 86), radius=9)
    rect(draw, index, (32, 44, 96, 84), fill=rgba("1a1238", 235), outline=rgba(light, 222), stroke=4, radius=8)
    for x in [45, 64, 83]:
        line(draw, index, [(x, 48), (x, 80)], rgba(accent, 158), 2)
    line(draw, index, [(42, 64), (86, 64)], rgba(light, 180), 3)
    ellipse(draw, index, (51, 56, 61, 66), fill=rgba(accent, 230))


def draw_pearl(draw, glow, index):
    accent, light, _ = palette("pearl")
    ellipse(glow, index, (34, 32, 94, 94), fill=rgba(accent, 118))
    ellipse(draw, index, (37, 35, 91, 89), fill=rgba("082b25", 220), outline=rgba(light, 226), stroke=4)
    ellipse(draw, index, (48, 46, 80, 78), fill=rgba(light, 230), outline=rgba(accent, 230), stroke=3)
    arc(draw, index, (32, 38, 96, 96), 210, 320, rgba(accent, 180), 4)
    arc(draw, index, (31, 30, 97, 88), 30, 150, rgba(accent, 150), 3)


def draw_prism(draw, glow, index):
    accent, light, _ = palette("prism")
    polygon(glow, index, [(64, 27), (98, 91), (30, 91)], fill=rgba(accent, 88))
    polygon(draw, index, [(64, 29), (96, 90), (32, 90)], fill=rgba("08263a", 218), outline=rgba(light, 230))
    line(draw, index, [(64, 29), (64, 90), (42, 90)], rgba(accent, 190), 3)
    line(draw, index, [(42, 59), (86, 59)], rgba(light, 150), 3)
    for y, color in [(49, "ffc2b7"), (64, "f6c177"), (78, "8ef2dc")]:
        line(draw, index, [(30, y), (49, 58)], rgba(color, 190), 3)


def draw_shell(draw, glow, index):
    accent, light, _ = palette("shell")
    ellipse(glow, index, (32, 31, 96, 94), fill=rgba(accent, 95))
    polygon(draw, index, [(64, 34), (91, 83), (78, 96), (50, 96), (37, 83)], fill=rgba("082b25", 230), outline=rgba(light, 220))
    for x in [48, 56, 64, 72, 80]:
        line(draw, index, [(64, 35), (x, 94)], rgba(accent, 178), 3)
    arc(draw, index, (42, 61, 86, 98), 190, 350, rgba(light, 190), 4)


def draw_spool(draw, glow, index):
    accent, light, _ = palette("spool")
    ellipse(glow, index, (33, 34, 95, 94), fill=rgba(accent, 95))
    ellipse(draw, index, (35, 37, 61, 63), fill=rgba("1a1530", 232), outline=rgba(light, 218), stroke=4)
    ellipse(draw, index, (67, 65, 93, 91), fill=rgba("1a1530", 232), outline=rgba(light, 218), stroke=4)
    line(draw, index, [(54, 55), (75, 74)], rgba(accent, 230), 6)
    line(draw, index, [(47, 75), (81, 41)], rgba(light, 186), 3)


def draw_tablet(draw, glow, index):
    accent, light, _ = palette("tablet")
    rect(glow, index, (38, 26, 90, 101), fill=rgba(accent, 80), radius=7)
    rect(draw, index, (40, 28, 88, 100), fill=rgba("1a1238", 235), outline=rgba(light, 220), stroke=4, radius=7)
    for y in [47, 59, 71, 83]:
        line(draw, index, [(50, y), (78, y)], rgba(accent, 175), 3)
    ellipse(draw, index, (58, 34, 70, 46), fill=rgba(light, 210))


def draw_tag(draw, glow, index):
    accent, light, _ = palette("tag")
    polygon(glow, index, [(35, 43), (77, 35), (96, 55), (85, 92), (43, 99), (28, 77)], fill=rgba(accent, 86))
    polygon(draw, index, [(36, 44), (76, 36), (95, 55), (84, 91), (44, 98), (29, 77)], fill=rgba("3a110d", 232), outline=rgba(light, 218))
    ellipse(draw, index, (68, 45, 80, 57), fill=rgba("06101d", 220), outline=rgba(light, 205), stroke=2)
    line(draw, index, [(44, 72), (75, 66)], rgba(accent, 218), 4)
    line(draw, index, [(50, 84), (70, 80)], rgba(light, 140), 3)


def draw_vial(draw, glow, index):
    accent, light, _ = palette("vial")
    rect(draw, index, (53, 27, 75, 44), fill=rgba(accent, 212), outline=rgba(light, 190), stroke=2, radius=4)
    rect(glow, index, (43, 40, 85, 99), fill=rgba(accent, 80), radius=11)
    rect(draw, index, (44, 42, 84, 98), fill=rgba("3a110d", 205), outline=rgba(light, 220), stroke=4, radius=10)
    polygon(draw, index, [(48, 73), (80, 64), (80, 91), (48, 91)], fill=rgba(accent, 218))
    ellipse(draw, index, (59, 55, 69, 65), fill=rgba(light, 170))


def draw_weight(draw, glow, index):
    accent, light, _ = palette("weight")
    ellipse(draw, index, (54, 27, 74, 47), outline=rgba(light, 226), stroke=4)
    polygon(glow, index, [(45, 47), (83, 47), (94, 94), (34, 94)], fill=rgba(accent, 84))
    polygon(draw, index, [(46, 48), (82, 48), (93, 93), (35, 93)], fill=rgba("0c2417", 232), outline=rgba(light, 222))
    line(draw, index, [(48, 65), (80, 65)], rgba(accent, 218), 4)
    ellipse(draw, index, (58, 71, 70, 83), fill=rgba(light, 210))


DRAWERS = {
    "anchor": draw_anchor,
    "battery": draw_battery,
    "bell": draw_bell,
    "coin": draw_coin,
    "compass": draw_compass,
    "coral": draw_coral,
    "crown": draw_crown,
    "echo": draw_echo,
    "gear": draw_gear,
    "gill": draw_gill,
    "hourglass": draw_hourglass,
    "ink": draw_ink,
    "key": draw_key,
    "ledger": draw_ledger,
    "lens": draw_lens,
    "map": draw_map,
    "medal": draw_medal,
    "meter": draw_meter,
    "needle": draw_needle,
    "oil": draw_oil,
    "pass": draw_pass,
    "pearl": draw_pearl,
    "prism": draw_prism,
    "shell": draw_shell,
    "spool": draw_spool,
    "tablet": draw_tablet,
    "tag": draw_tag,
    "vial": draw_vial,
    "weight": draw_weight,
}


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    gd = ImageDraw.Draw(glow)
    for index, icon in enumerate(ICONS):
        icon_base(draw, gd, index, icon)
        DRAWERS[icon](draw, gd, index)
    glow = glow.filter(ImageFilter.GaussianBlur(sw(4)))
    image = Image.alpha_composite(glow, image)
    image = image.resize((CELL * len(ICONS), CELL), Image.Resampling.LANCZOS)
    image.save(OUT)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
