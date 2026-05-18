from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import math
import random


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "arena-props.png"
SCALE = 2
CELL = 512
COLS = 3
ROWS = 2
W = CELL * COLS * SCALE
H = CELL * ROWS * SCALE


def rgba(hex_color, alpha):
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4)) + (alpha,)


def cell_box(col, row):
    x = col * CELL * SCALE
    y = row * CELL * SCALE
    return x, y, CELL * SCALE, CELL * SCALE


def local(draw, col, row, xy, fill, width=1):
    ox, oy, _, _ = cell_box(col, row)
    scaled = [(ox + int(x * SCALE), oy + int(y * SCALE)) for x, y in xy]
    if len(scaled) == 2:
        draw.line(scaled, fill=fill, width=max(1, int(width * SCALE)))
    else:
        draw.polygon(scaled, fill=fill)


def ellipse(draw, col, row, box, outline=None, fill=None, width=1):
    ox, oy, _, _ = cell_box(col, row)
    scaled = tuple(ox + int(v * SCALE) if i % 2 == 0 else oy + int(v * SCALE) for i, v in enumerate(box))
    draw.ellipse(scaled, outline=outline, fill=fill, width=max(1, int(width * SCALE)))


def rect(draw, col, row, box, outline=None, fill=None, width=1):
    ox, oy, _, _ = cell_box(col, row)
    scaled = tuple(ox + int(v * SCALE) if i % 2 == 0 else oy + int(v * SCALE) for i, v in enumerate(box))
    draw.rectangle(scaled, outline=outline, fill=fill, width=max(1, int(width * SCALE)))


def glow_layer():
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def archive(draw, glow):
    col, row = 0, 0
    gd = ImageDraw.Draw(glow)
    for x in [44, 82, 410, 464]:
        local(draw, col, row, [(x, 0), (x - 12, 160), (x + 9, 260)], rgba("031018", 176))
        local(gd, col, row, [(x, 22), (x - 8, 170), (x + 7, 260)], rgba("49d6ff", 42), 2)
    for i in range(11):
        x = 34 + i * 44
        y = 358 + (i % 3) * 14
        local(draw, col, row, [(x, y), (x + 18, 334), (x + 42, 392), (x + 12, 430)], rgba("041019", 150))
        local(gd, col, row, [(x + 8, y + 8), (x + 24, y + 10)], rgba("7dd3fc", 64), 1)
    for i in range(7):
        ellipse(gd, col, row, (60 + i * 62, 230 + (i % 2) * 18, 68 + i * 62, 238 + (i % 2) * 18), fill=rgba("8df4ff", 84))


def pressure(draw, glow):
    col, row = 1, 0
    gd = ImageDraw.Draw(glow)
    ellipse(draw, col, row, (100, 62, 412, 374), outline=rgba("06101a", 168), width=18)
    ellipse(gd, col, row, (116, 78, 396, 358), outline=rgba("7dd3fc", 72), width=3)
    for angle in range(0, 360, 30):
        cx = 256 + math.cos(math.radians(angle)) * 168
        cy = 218 + math.sin(math.radians(angle)) * 168
        ellipse(gd, col, row, (cx - 4, cy - 4, cx + 4, cy + 4), fill=rgba("f6c177", 95))
    for x in [122, 172, 222, 292, 342, 392]:
        rect(draw, col, row, (x, 360, x + 12, 500), fill=rgba("041019", 150))
        rect(gd, col, row, (x + 4, 366, x + 7, 486), fill=rgba("50e6ff", 54))


def coral(draw, glow):
    col, row = 2, 0
    gd = ImageDraw.Draw(glow)
    rng = random.Random(5)
    for base_x in [32, 76, 406, 452, 492]:
        color = rgba("ff7a8a", 156)
        for branch in range(6):
            length = rng.randint(40, 130)
            lean = rng.randint(-26, 26)
            y0 = 494 - rng.randint(0, 28)
            x0 = base_x + rng.randint(-8, 8)
            local(draw, col, row, [(x0, y0), (x0 + lean, y0 - length)], color, 3)
            local(gd, col, row, [(x0, y0), (x0 + lean, y0 - length)], rgba("ff8ea3", 72), 4)
            local(draw, col, row, [(x0 + lean, y0 - length + 16), (x0 + lean + rng.randint(-22, 22), y0 - length - rng.randint(5, 28))], color, 2)
    for i in range(16):
        x = rng.randint(38, 474)
        y = rng.randint(60, 300)
        ellipse(gd, col, row, (x, y, x + 3, y + 3), fill=rgba("9beeff", 80))


def machine(draw, glow):
    col, row = 0, 1
    gd = ImageDraw.Draw(glow)
    for x, w in [(30, 58), (110, 34), (364, 44), (438, 50)]:
        rect(draw, col, row, (x, 48, x + w, 512), fill=rgba("031018", 172))
        for y in range(82, 462, 38):
            rect(gd, col, row, (x + 9, y, x + w - 9, y + 4), fill=rgba("5ee7ff", 44))
    for y in [356, 392, 430]:
        local(draw, col, row, [(0, y), (512, y + 22)], rgba("031018", 112), 5)
        local(gd, col, row, [(0, y), (512, y + 22)], rgba("f6c177", 42), 1)


def abyss(draw, glow):
    col, row = 1, 1
    gd = ImageDraw.Draw(glow)
    for x, h, color in [(34, 170, "250b43"), (86, 110, "071324"), (392, 138, "260d48"), (456, 190, "061020")]:
        local(draw, col, row, [(x, 510), (x + 38, 510 - h), (x + 78, 510)], rgba(color, 178))
        local(gd, col, row, [(x + 40, 502), (x + 40, 510 - h + 18)], rgba("b179ff", 70), 2)
    for i in range(22):
        x = 32 + i * 22
        y = 286 + int(math.sin(i) * 18)
        ellipse(gd, col, row, (x, y, x + 2, y + 2), fill=rgba("b8e7ff", 72))


def gate(draw, glow):
    col, row = 2, 1
    gd = ImageDraw.Draw(glow)
    for radius, alpha in [(96, 80), (142, 55), (190, 38)]:
        ellipse(gd, col, row, (256 - radius, 74, 256 + radius, 74 + radius * 2), outline=rgba("ff4d5e", alpha), width=2)
    rect(gd, col, row, (246, 40, 266, 486), fill=rgba("ff415d", 120))
    rect(draw, col, row, (250, 52, 262, 494), fill=rgba("13040a", 86))
    for i, x in enumerate([66, 118, 404, 454]):
        local(draw, col, row, [(x, 508), (x + 18, 242 + i * 14), (x + 54, 508)], rgba("070812", 172))
        local(gd, col, row, [(x + 20, 492), (x + 20, 258 + i * 14)], rgba("ff6a78", 58), 2)
    for i in range(18):
        angle = i * 20
        x = 256 + math.cos(math.radians(angle)) * (82 + i % 4 * 20)
        y = 246 + math.sin(math.radians(angle)) * (82 + i % 4 * 20)
        ellipse(gd, col, row, (x - 3, y - 3, x + 3, y + 3), fill=rgba("ffd1d6", 90))


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    glow = glow_layer()
    draw = ImageDraw.Draw(image)
    archive(draw, glow)
    pressure(draw, glow)
    coral(draw, glow)
    machine(draw, glow)
    abyss(draw, glow)
    gate(draw, glow)
    glow = glow.filter(ImageFilter.GaussianBlur(3 * SCALE))
    image = Image.alpha_composite(glow, image)
    image = image.resize((CELL * COLS, CELL * ROWS), Image.Resampling.LANCZOS)
    image.save(OUT)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
