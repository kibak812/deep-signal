from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import math
import random


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "arena-backdrops.png"

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
            a = int(ca * (1 - d) ** 1.8)
            if a:
                px[x, y] = (cr, cg, cb, a)
    return layer


def vertical_gradient(width, height, top, middle, bottom):
    image = Image.new("RGBA", (width, height), top)
    draw = ImageDraw.Draw(image)
    for y in range(height):
        t = y / max(1, height - 1)
        if t < 0.5:
            p = t / 0.5
            c0, c1 = top, middle
        else:
            p = (t - 0.5) / 0.5
            c0, c1 = middle, bottom
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
        (rng.randint(140, 620) * SCALE, rng.randint(70, 260) * SCALE, rng.randint(160, 260) * SCALE, 78),
        (rng.randint(80, 680) * SCALE, rng.randint(210, 410) * SCALE, rng.randint(190, 310) * SCALE, 52),
    ]:
        cell = Image.alpha_composite(cell, radial_glow(size, (cx, cy), radius, rgba(glow, alpha)))

    noise = Image.new("RGBA", size, (0, 0, 0, 0))
    nd = ImageDraw.Draw(noise)
    for _ in range(2200):
        x = rng.randrange(size[0])
        y = rng.randrange(size[1])
        a = rng.randrange(5, 22)
        nd.point((x, y), fill=(255, 255, 255, a))
    noise = noise.filter(ImageFilter.GaussianBlur(0.35))
    cell = Image.alpha_composite(cell, noise)

    vignette = Image.new("RGBA", size, (0, 0, 0, 0))
    vd = ImageDraw.Draw(vignette)
    vd.rectangle((0, 0, size[0], size[1]), outline=None, fill=(0, 0, 0, 0))
    for i in range(34):
        alpha = int(i * 3.2)
        vd.rectangle((i * 5, i * 3, size[0] - i * 5, size[1] - i * 3), outline=(0, 0, 0, max(0, 96 - alpha)), width=7)
    cell = Image.alpha_composite(cell, vignette.filter(ImageFilter.GaussianBlur(9)))

    image.alpha_composite(cell, (ox, oy))


def archive(draw, glow):
    col, row = 0, 0
    gd = ImageDraw.Draw(glow)
    for i, x in enumerate([46, 108, 178, 518, 604, 688]):
        h = 250 + (i % 3) * 38
        poly(draw, col, row, [(x, 420), (x + 28, 420 - h), (x + 56, 420)], rgba("03131e", 176))
        line(gd, col, row, [(x + 30, 388), (x + 30, 420 - h + 24)], rgba("61dcff", 72), 2)
    for y in [92, 142, 196, 252]:
        line(draw, col, row, [(120, y), (650, y + 36)], rgba("0a2230", 104), 8)
        line(gd, col, row, [(132, y + 4), (638, y + 38)], rgba("7dd3fc", 52), 2)
    for i in range(18):
        x = 132 + i * 29
        y = 296 + int(math.sin(i * 0.9) * 16)
        rect(gd, col, row, (x, y, x + 3, y + 18), fill=rgba("d9fbff", 70))


def pressure(draw, glow):
    col, row = 1, 0
    gd = ImageDraw.Draw(glow)
    ellipse(draw, col, row, (205, 38, 564, 376), outline=rgba("04101a", 190), width=22)
    ellipse(gd, col, row, (226, 60, 542, 354), outline=rgba("8aefff", 78), width=3)
    ellipse(gd, col, row, (278, 112, 490, 308), outline=rgba("f6c177", 48), width=2)
    for angle in range(0, 360, 18):
        x = 384 + math.cos(math.radians(angle)) * 190
        y = 207 + math.sin(math.radians(angle)) * 176
        ellipse(gd, col, row, (x - 4, y - 4, x + 4, y + 4), fill=rgba("f9d998", 92))
    for x in [76, 134, 618, 684]:
        rect(draw, col, row, (x, 44, x + 26, 432), fill=rgba("031018", 158))
        rect(gd, col, row, (x + 9, 70, x + 13, 396), fill=rgba("4fe7ff", 48))
    for y in [318, 356, 394]:
        line(draw, col, row, [(0, y), (768, y + 10)], rgba("031018", 134), 5)
        line(gd, col, row, [(20, y + 3), (748, y + 13)], rgba("f6c177", 38), 1)


def coral(draw, glow):
    col, row = 2, 0
    gd = ImageDraw.Draw(glow)
    rng = random.Random(12)
    for base_x in [36, 84, 148, 590, 656, 724]:
        for _ in range(7):
            x0 = base_x + rng.randint(-12, 12)
            y0 = 430 - rng.randint(0, 34)
            length = rng.randint(70, 210)
            lean = rng.randint(-44, 44)
            line(draw, col, row, [(x0, y0), (x0 + lean, y0 - length)], rgba("ff7186", 148), 4)
            line(gd, col, row, [(x0, y0), (x0 + lean, y0 - length)], rgba("ff9aab", 80), 6)
            for branch in range(2):
                by = y0 - length * (0.35 + branch * 0.24)
                bx = x0 + lean * (0.35 + branch * 0.24)
                line(draw, col, row, [(bx, by), (bx + rng.randint(-40, 40), by - rng.randint(18, 54))], rgba("ff8d9f", 116), 2)
    for i in range(30):
        x = rng.randint(80, 700)
        y = rng.randint(44, 300)
        ellipse(gd, col, row, (x, y, x + rng.randint(2, 5), y + rng.randint(2, 5)), fill=rgba("b9fbff", rng.randint(42, 88)))


def machine(draw, glow):
    col, row = 0, 1
    gd = ImageDraw.Draw(glow)
    for x, w in [(34, 72), (134, 44), (220, 62), (496, 58), (612, 82), (716, 44)]:
        rect(draw, col, row, (x, 40, x + w, 432), fill=rgba("031018", 176))
        for y in range(74, 382, 36):
            rect(gd, col, row, (x + 10, y, x + w - 10, y + 4), fill=rgba("5ee7ff", 46))
    for y in [96, 188, 282, 366]:
        line(draw, col, row, [(0, y), (768, y + 32)], rgba("080f16", 92), 9)
        line(gd, col, row, [(0, y + 3), (768, y + 35)], rgba("f6c177", 44), 2)
    for x in [318, 362, 406, 450]:
        rect(gd, col, row, (x, 142, x + 8, 330), fill=rgba("ffd37a", 58))


def abyss(draw, glow):
    col, row = 1, 1
    gd = ImageDraw.Draw(glow)
    poly(draw, col, row, [(328, 0), (416, 0), (392, 432), (350, 432)], rgba("050713", 112))
    line(gd, col, row, [(370, 0), (388, 432)], rgba("b07aff", 96), 5)
    for x, h, color in [(34, 196, "14082b"), (92, 136, "071324"), (604, 158, "190a32"), (680, 220, "061020")]:
        poly(draw, col, row, [(x, 432), (x + 42, 432 - h), (x + 104, 432)], rgba(color, 188))
        line(gd, col, row, [(x + 46, 412), (x + 50, 432 - h + 28)], rgba("a788ff", 72), 2)
    for i in range(24):
        x = 130 + i * 22
        y = 262 + int(math.sin(i * 0.7) * 24)
        ellipse(gd, col, row, (x, y, x + 4, y + 4), fill=rgba("c8f2ff", 76))


def gate(draw, glow):
    col, row = 2, 1
    gd = ImageDraw.Draw(glow)
    for radius, alpha in [(86, 90), (136, 70), (190, 48), (248, 30)]:
        ellipse(gd, col, row, (384 - radius, 22, 384 + radius, 22 + radius * 2), outline=rgba("ff5166", alpha), width=2)
    rect(gd, col, row, (372, 26, 396, 422), fill=rgba("ff3f5d", 126))
    rect(draw, col, row, (377, 38, 391, 432), fill=rgba("15050b", 104))
    for i, x in enumerate([74, 132, 578, 646]):
        poly(draw, col, row, [(x, 432), (x + 32, 186 + i * 18), (x + 96, 432)], rgba("070812", 184))
        line(gd, col, row, [(x + 36, 412), (x + 42, 204 + i * 18)], rgba("ff6b78", 64), 3)
    for i in range(24):
        angle = i * 15
        x = 384 + math.cos(math.radians(angle)) * (78 + i % 5 * 26)
        y = 210 + math.sin(math.radians(angle)) * (74 + i % 5 * 22)
        ellipse(gd, col, row, (x - 3, y - 3, x + 3, y + 3), fill=rgba("ffd1d6", 86))


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    palettes = [
        ("08121f", "12354b", "02070d", "4fdcff"),
        ("06111d", "123443", "02070c", "71f0ff"),
        ("130c1a", "44222f", "041015", "ff8fa1"),
        ("081017", "222516", "02070c", "f6c177"),
        ("050713", "151a3b", "010409", "a778ff"),
        ("110710", "3a0f19", "020407", "ff4f66"),
    ]
    for row in range(ROWS):
        for col in range(COLS):
            draw_base(image, col, row, palettes[row * COLS + col], seed=3100 + row * COLS + col)

    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    archive(draw, glow)
    pressure(draw, glow)
    coral(draw, glow)
    machine(draw, glow)
    abyss(draw, glow)
    gate(draw, glow)

    glow = glow.filter(ImageFilter.GaussianBlur(3.2 * SCALE))
    image = Image.alpha_composite(image, glow)
    image = image.filter(ImageFilter.UnsharpMask(radius=1.1 * SCALE, percent=68, threshold=4))
    image = image.resize((CELL_W * COLS, CELL_H * ROWS), Image.Resampling.LANCZOS).convert("RGB")
    image.save(OUT, optimize=True)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
