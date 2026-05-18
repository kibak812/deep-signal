from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import math
import random


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "event-backdrops.png"

SCALE = 2
CELL_W = 768
CELL_H = 432
COLS = 3
ROWS = 2
W = CELL_W * COLS * SCALE
H = CELL_H * ROWS * SCALE


def rgba(hex_color, alpha=255):
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4)) + (alpha,)


def cell_origin(col, row):
    return col * CELL_W * SCALE, row * CELL_H * SCALE


def local_box(col, row, box):
    ox, oy = cell_origin(col, row)
    return tuple(ox + int(v * SCALE) if i % 2 == 0 else oy + int(v * SCALE) for i, v in enumerate(box))


def local_points(col, row, points):
    ox, oy = cell_origin(col, row)
    return [(ox + int(x * SCALE), oy + int(y * SCALE)) for x, y in points]


def line(draw, col, row, points, fill, width=1):
    draw.line(local_points(col, row, points), fill=fill, width=max(1, int(width * SCALE)))


def poly(draw, col, row, points, fill):
    draw.polygon(local_points(col, row, points), fill=fill)


def rect(draw, col, row, box, outline=None, fill=None, width=1):
    draw.rectangle(local_box(col, row, box), outline=outline, fill=fill, width=max(1, int(width * SCALE)))


def ellipse(draw, col, row, box, outline=None, fill=None, width=1):
    draw.ellipse(local_box(col, row, box), outline=outline, fill=fill, width=max(1, int(width * SCALE)))


def radial_glow(size, center, radius, color):
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    px = layer.load()
    cx, cy = center
    cr, cg, cb, ca = color
    for y in range(max(0, int(cy - radius)), min(size[1], int(cy + radius))):
        for x in range(max(0, int(cx - radius)), min(size[0], int(cx + radius))):
            d = math.hypot(x - cx, y - cy) / radius
            if d >= 1:
                continue
            a = int(ca * (1 - d) ** 1.75)
            if a:
                px[x, y] = (cr, cg, cb, a)
    return layer


def vertical_gradient(width, height, top, mid, bottom):
    image = Image.new("RGBA", (width, height), top)
    draw = ImageDraw.Draw(image)
    for y in range(height):
        t = y / max(1, height - 1)
        if t < 0.52:
            p = t / 0.52
            c0, c1 = top, mid
        else:
            p = (t - 0.52) / 0.48
            c0, c1 = mid, bottom
        color = tuple(int(c0[i] + (c1[i] - c0[i]) * p) for i in range(4))
        draw.line([(0, y), (width, y)], fill=color)
    return image


def draw_base(image, col, row, palette, seed):
    ox, oy = cell_origin(col, row)
    size = (CELL_W * SCALE, CELL_H * SCALE)
    top, mid, bottom, glow = palette
    cell = vertical_gradient(*size, rgba(top), rgba(mid), rgba(bottom))
    rng = random.Random(seed)

    for cx, cy, radius, alpha in [
        (rng.randint(130, 620) * SCALE, rng.randint(54, 210) * SCALE, rng.randint(140, 250) * SCALE, 76),
        (rng.randint(90, 690) * SCALE, rng.randint(230, 400) * SCALE, rng.randint(190, 320) * SCALE, 52),
    ]:
        cell = Image.alpha_composite(cell, radial_glow(size, (cx, cy), radius, rgba(glow, alpha)))

    noise = Image.new("RGBA", size, (0, 0, 0, 0))
    nd = ImageDraw.Draw(noise)
    for _ in range(1900):
        nd.point((rng.randrange(size[0]), rng.randrange(size[1])), fill=(255, 255, 255, rng.randrange(4, 18)))
    cell = Image.alpha_composite(cell, noise.filter(ImageFilter.GaussianBlur(0.35)))

    vignette = Image.new("RGBA", size, (0, 0, 0, 0))
    vd = ImageDraw.Draw(vignette)
    for i in range(36):
        vd.rectangle((i * 5, i * 3, size[0] - i * 5, size[1] - i * 3), outline=(0, 0, 0, max(0, 96 - i * 3)), width=7)
    cell = Image.alpha_composite(cell, vignette.filter(ImageFilter.GaussianBlur(8)))
    image.alpha_composite(cell, (ox, oy))


def memory_market(draw, glow):
    col, row = 0, 0
    gd = ImageDraw.Draw(glow)
    for x, y, w, h in [(58, 92, 148, 250), (230, 64, 132, 286), (406, 82, 142, 266), (582, 104, 126, 236)]:
        rect(draw, col, row, (x, y, x + w, y + h), fill=rgba("041018", 172), outline=rgba("18354a", 104), width=2)
        rect(gd, col, row, (x + 18, y + 26, x + w - 18, y + 72), fill=rgba("7dd3fc", 42))
        for i in range(4):
            yy = y + 102 + i * 38
            rect(draw, col, row, (x + 18, yy, x + w - 22, yy + 10), fill=rgba("103040", 124))
            rect(gd, col, row, (x + 20, yy + 2, x + w - 24, yy + 5), fill=rgba("f6c177", 52))
    line(draw, col, row, [(0, 356), (768, 330)], rgba("031018", 180), 18)
    line(gd, col, row, [(26, 354), (742, 330)], rgba("7dd3fc", 58), 2)


def terminal_patch(draw, glow):
    col, row = 1, 0
    gd = ImageDraw.Draw(glow)
    rect(draw, col, row, (120, 52, 648, 342), fill=rgba("031018", 184), outline=rgba("24506c", 126), width=4)
    rect(gd, col, row, (150, 80, 618, 312), outline=rgba("63e6ff", 84), width=2)
    for i in range(12):
        y = 106 + i * 16
        line(draw, col, row, [(174, y), (346 + (i % 4) * 52, y)], rgba("0b3140", 150), 3)
        line(gd, col, row, [(176, y), (250 + (i % 5) * 58, y)], rgba("7dd3fc", 62), 1)
    for i in range(6):
        x = 424 + i * 28
        rect(gd, col, row, (x, 110 + i % 2 * 28, x + 14, 240 + i * 6), fill=rgba("f6c177", 38))
    for x in [82, 686]:
        line(draw, col, row, [(x, 0), (x - 28, 432)], rgba("041018", 140), 8)
        line(gd, col, row, [(x, 40), (x - 20, 390)], rgba("7dd3fc", 44), 2)


def coral_contract(draw, glow):
    col, row = 2, 0
    gd = ImageDraw.Draw(glow)
    rect(draw, col, row, (248, 52, 520, 356), fill=rgba("120a12", 190), outline=rgba("ff7186", 110), width=3)
    for y in [92, 132, 178, 232, 280]:
        line(draw, col, row, [(286, y), (482, y + 4)], rgba("46202a", 168), 4)
        line(gd, col, row, [(288, y + 1), (462, y + 4)], rgba("ff9bab", 52), 1)
    rng = random.Random(28)
    for base_x in [86, 142, 586, 648, 704]:
        for _ in range(5):
            y0 = 420 - rng.randint(0, 42)
            x0 = base_x + rng.randint(-14, 14)
            lean = rng.randint(-46, 42)
            length = rng.randint(82, 210)
            line(draw, col, row, [(x0, y0), (x0 + lean, y0 - length)], rgba("ff7186", 138), 4)
            line(gd, col, row, [(x0, y0), (x0 + lean, y0 - length)], rgba("ff9bab", 76), 5)
    ellipse(gd, col, row, (326, 150, 442, 266), outline=rgba("f6c177", 86), width=2)


def judgment_chamber(draw, glow):
    col, row = 0, 1
    gd = ImageDraw.Draw(glow)
    for x in [86, 174, 508, 612]:
        poly(draw, col, row, [(x, 432), (x + 30, 82), (x + 72, 432)], rgba("050711", 188))
        line(gd, col, row, [(x + 36, 394), (x + 42, 114)], rgba("ff6f7c", 56), 2)
    rect(draw, col, row, (218, 76, 550, 324), fill=rgba("050711", 162), outline=rgba("7b2230", 130), width=3)
    for r, alpha in [(62, 84), (110, 62), (158, 38)]:
        ellipse(gd, col, row, (384 - r, 126 - r / 3, 384 + r, 126 + r * 1.66), outline=rgba("ff6f7c", alpha), width=2)
    rect(gd, col, row, (370, 54, 398, 338), fill=rgba("ff5365", 84))
    line(draw, col, row, [(0, 354), (768, 330)], rgba("080913", 150), 16)


def warm_current(draw, glow):
    col, row = 1, 1
    gd = ImageDraw.Draw(glow)
    for i in range(10):
        y = 82 + i * 30
        points = [(0, y), (160, y + 34), (320, y - 20), (500, y + 24), (768, y - 12)]
        line(gd, col, row, points, rgba("f6c177", 34 + i % 3 * 12), 5)
        line(draw, col, row, points, rgba("2d2414", 50), 2)
    ellipse(gd, col, row, (240, 94, 528, 382), fill=rgba("f6c177", 28))
    ellipse(draw, col, row, (314, 166, 454, 306), outline=rgba("f6c177", 72), width=3)
    for i in range(24):
        x = 82 + i * 28
        y = 330 + int(math.sin(i * 0.8) * 28)
        ellipse(gd, col, row, (x, y, x + 4, y + 4), fill=rgba("fff0bf", 70))


def last_waystation(draw, glow):
    col, row = 2, 1
    gd = ImageDraw.Draw(glow)
    rect(draw, col, row, (96, 74, 672, 370), fill=rgba("031018", 158), outline=rgba("234963", 98), width=3)
    rect(draw, col, row, (286, 56, 482, 376), fill=rgba("07111b", 192), outline=rgba("7dd3fc", 80), width=3)
    rect(gd, col, row, (324, 104, 444, 316), fill=rgba("7dd3fc", 38))
    for x in [134, 180, 588, 636]:
        rect(draw, col, row, (x, 96, x + 24, 366), fill=rgba("02080e", 172))
        rect(gd, col, row, (x + 8, 118, x + 12, 330), fill=rgba("f6c177", 44))
    for r, alpha in [(88, 70), (146, 46), (214, 30)]:
        ellipse(gd, col, row, (384 - r, 214 - r, 384 + r, 214 + r), outline=rgba("7dd3fc", alpha), width=2)
    line(draw, col, row, [(0, 372), (768, 350)], rgba("021018", 168), 18)


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    palettes = [
        ("07111b", "0a2631", "031018", "7dd3fc"),
        ("06101b", "082332", "02080f", "7dd3fc"),
        ("150914", "2a101a", "05070e", "ff7186"),
        ("070810", "160a15", "03050b", "ff5365"),
        ("071017", "1b241c", "06100f", "f6c177"),
        ("041017", "08212c", "02080e", "7dd3fc"),
    ]
    scenes = [memory_market, terminal_patch, coral_contract, judgment_chamber, warm_current, last_waystation]
    for index, scene in enumerate(scenes):
        col = index % COLS
        row = index // COLS
        draw_base(image, col, row, palettes[index], 100 + index * 19)
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for scene in scenes:
        scene(draw, glow)
    image = Image.alpha_composite(glow.filter(ImageFilter.GaussianBlur(3 * SCALE)), image)
    image = image.resize((CELL_W * COLS, CELL_H * ROWS), Image.Resampling.LANCZOS)
    image.save(OUT)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
