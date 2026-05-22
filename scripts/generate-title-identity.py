from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import math
import random


ROOT = Path(__file__).resolve().parents[1]
OUT_MARK = ROOT / "public" / "assets" / "deep-signal-mark.png"
OUT_DIVER = ROOT / "public" / "assets" / "echo-diver-emblem.png"

SIZE = 256
SCALE = 4
CANVAS = SIZE * SCALE


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


def rounded(draw, coords, radius, fill=None, outline=None, width_value=1):
    draw.rounded_rectangle(box(coords), radius=width(radius), fill=fill, outline=outline, width=width(width_value))


def ellipse(draw, coords, fill=None, outline=None, width_value=1):
    draw.ellipse(box(coords), fill=fill, outline=outline, width=width(width_value))


def line(draw, coords, fill, width_value=1, joint=None):
    draw.line(points(coords), fill=fill, width=width(width_value), joint=joint)


def arc(draw, coords, start, end, fill, width_value=1):
    draw.arc(box(coords), start=start, end=end, fill=fill, width=width(width_value))


def radial_plate(seed, accent=(42, 181, 255), warm=(246, 193, 119)):
    rng = random.Random(seed)
    image = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    pixels = image.load()
    cx = CANVAS * 0.5
    cy = CANVAS * 0.42
    for y in range(CANVAS):
        for x in range(CANVAS):
            dx = (x - cx) / CANVAS
            dy = (y - cy) / CANVAS
            dist = math.sqrt(dx * dx * 1.28 + dy * dy * 1.7)
            glow = max(0, 1 - dist * 2.8)
            rim = max(0, 1 - abs((x / CANVAS) - 0.5) * 2.0) * max(0, 1 - y / CANVAS)
            noise = rng.randint(-5, 5)
            r = int(4 + accent[0] * glow * 0.34 + warm[0] * rim * 0.05 + noise)
            g = int(13 + accent[1] * glow * 0.34 + warm[1] * rim * 0.05 + noise)
            b = int(24 + accent[2] * glow * 0.38 + warm[2] * rim * 0.03 + noise)
            pixels[x, y] = (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)), 255)
    return image


def clip_rounded(image):
    w, h = image.size
    mask = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, w - 1, h - 1), radius=int(min(w, h) * 28 / SIZE), fill=255)
    image.putalpha(mask)
    return image


def add_glow(base, layer, blur=8):
    glow = layer.filter(ImageFilter.GaussianBlur(width(blur)))
    return Image.alpha_composite(base, glow)


def draw_deep_signal_mark():
    image = radial_plate(812, accent=(46, 185, 255), warm=(246, 193, 119))
    glow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    gd = ImageDraw.Draw(glow)

    rounded(draw, (10, 10, 246, 246), 24, outline=rgba("8ee8ff", 68), width_value=2)
    rounded(draw, (20, 20, 236, 236), 18, fill=rgba("04101d", 118), outline=rgba("7dd3fc", 86), width_value=1)

    for x in range(42, 230, 32):
        line(draw, [(x, 30), (x - 18, 226)], rgba("7dd3fc", 18), 1)
    for y in range(48, 224, 34):
        line(draw, [(28, y), (228, y + 8)], rgba("f6c177", 14), 1)

    gd.rectangle(box((124, 24, 132, 232)), fill=rgba("77dfff", 110))
    gd.ellipse(box((42, 34, 214, 206)), fill=rgba("38bdf8", 62))
    image = add_glow(image, glow, 11)
    glow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)

    line(draw, [(128, 20), (128, 236)], rgba("c9fbff", 184), 2.4)
    line(gd, [(128, 22), (128, 234)], rgba("57d7ff", 168), 5.5)
    for inset, alpha, stroke in [(30, 150, 5.4), (48, 128, 3.6), (68, 92, 2.6)]:
        arc(draw, (inset, 38 + inset * 0.08, 256 - inset, 150 + inset * 0.14), 205, 335, rgba("a8f5ff", alpha), stroke)
        arc(gd, (inset, 38 + inset * 0.08, 256 - inset, 150 + inset * 0.14), 205, 335, rgba("57d7ff", alpha), stroke + 2)

    image = add_glow(image, glow, 5)
    draw = ImageDraw.Draw(image)
    glow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)

    diamond = [(128, 50), (171, 118), (128, 188), (85, 118)]
    draw.polygon(points(diamond), fill=rgba("06101f", 236), outline=rgba("f6c177", 238))
    line(draw, [(128, 50), (171, 118), (128, 188), (85, 118), (128, 50)], rgba("f6c177", 232), 4)
    line(gd, [(128, 50), (171, 118), (128, 188), (85, 118), (128, 50)], rgba("ffd78a", 142), 7)
    ellipse(draw, (103, 93, 153, 143), fill=rgba("c8f8ff", 245), outline=rgba("f6c177", 220), width_value=3)
    ellipse(draw, (116, 106, 140, 130), fill=rgba("06101f", 246))
    ellipse(gd, (95, 85, 161, 151), fill=rgba("7df4ff", 92))

    for i in range(22):
        angle = i * 0.83
        radius = 46 + (i % 5) * 13
        x = 128 + math.cos(angle) * radius
        y = 122 + math.sin(angle * 0.72) * radius * 0.54
        ellipse(draw, (x - 1.4, y - 1.4, x + 1.4, y + 1.4), fill=rgba("baf9ff", 124))

    line(draw, [(58, 211), (198, 211)], rgba("7dd3fc", 178), 3.5)
    line(gd, [(60, 213), (196, 213)], rgba("2dc5ff", 126), 8)
    image = add_glow(image, glow, 4)
    return clip_rounded(image.resize((SIZE, SIZE), Image.Resampling.LANCZOS))


def draw_echo_diver_emblem():
    image = radial_plate(108, accent=(60, 214, 232), warm=(246, 193, 119))
    glow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    gd = ImageDraw.Draw(glow)

    rounded(draw, (10, 10, 246, 246), 24, outline=rgba("7dd3fc", 72), width_value=2)
    rounded(draw, (20, 20, 236, 236), 18, fill=rgba("06101d", 130), outline=rgba("7dd3fc", 84), width_value=1)

    for x in [38, 54, 202, 218]:
        line(draw, [(x, 35), (x + (128 - x) * 0.18, 226)], rgba("7dd3fc", 24), 1)
    ellipse(gd, (51, 40, 205, 202), fill=rgba("2dd4ff", 68))
    image = add_glow(image, glow, 10)
    glow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)

    helmet = [(60, 159), (60, 100), (78, 59), (128, 42), (178, 59), (196, 100), (196, 159), (181, 201), (128, 217), (75, 201)]
    draw.polygon(points(helmet), fill=rgba("0b2434", 238))
    line(draw, helmet + [helmet[0]], rgba("bff8ff", 210), 5)
    line(gd, helmet + [helmet[0]], rgba("57d7ff", 130), 9)

    arc(draw, (70, 48, 186, 148), 188, 352, rgba("f6c177", 230), 7)
    arc(gd, (70, 48, 186, 148), 188, 352, rgba("ffd995", 132), 11)
    line(draw, [(58, 100), (34, 88), (28, 66)], rgba("f6c177", 170), 4)
    line(draw, [(198, 100), (222, 88), (228, 66)], rgba("f6c177", 170), 4)
    ellipse(draw, (26, 58, 42, 74), fill=rgba("79eaff", 228), outline=rgba("f6c177", 190), width_value=2)
    ellipse(draw, (214, 58, 230, 74), fill=rgba("79eaff", 228), outline=rgba("f6c177", 190), width_value=2)

    ellipse(draw, (76, 75, 180, 179), fill=rgba("08324b", 246), outline=rgba("ecf8f3", 210), width_value=4)
    ellipse(gd, (72, 71, 184, 183), fill=rgba("67e8f9", 80))
    ellipse(draw, (99, 98, 157, 156), fill=rgba("06101f", 245), outline=rgba("f6c177", 232), width_value=4)
    line(draw, [(128, 79), (128, 177)], rgba("eafcff", 126), 2)
    line(draw, [(80, 128), (176, 128)], rgba("eafcff", 126), 2)
    ellipse(draw, (116, 116, 140, 140), fill=rgba("c8f8ff", 230))
    ellipse(draw, (122, 122, 134, 134), fill=rgba("04101d", 245))

    line(draw, [(55, 183), (84, 210), (128, 222), (172, 210), (201, 183)], rgba("45d3ff", 168), 4)
    line(gd, [(54, 183), (84, 210), (128, 222), (172, 210), (202, 183)], rgba("45d3ff", 110), 8)
    for angle in range(0, 360, 45):
        x = 128 + math.cos(math.radians(angle)) * 76
        y = 130 + math.sin(math.radians(angle)) * 72
        ellipse(draw, (x - 3, y - 3, x + 3, y + 3), fill=rgba("f6c177", 170))

    image = add_glow(image, glow, 4)
    draw = ImageDraw.Draw(image)
    line(draw, helmet + [helmet[0]], rgba("d8fbff", 232), 2.2)
    arc(draw, (62, 54, 194, 170), 185, 355, rgba("ffd993", 238), 3.8)
    arc(draw, (72, 64, 184, 160), 190, 350, rgba("45d3ff", 150), 2.2)
    ellipse(draw, (72, 72, 184, 184), fill=rgba("06121f", 166), outline=rgba("d8fbff", 210), width_value=3.2)
    ellipse(draw, (86, 86, 170, 170), fill=rgba("08324b", 240), outline=rgba("f6c177", 212), width_value=3)
    ellipse(draw, (100, 100, 156, 156), fill=rgba("73efff", 236))
    ellipse(draw, (116, 116, 140, 140), fill=rgba("06101f", 242))
    line(draw, [(128, 92), (128, 164)], rgba("effdff", 130), 1.8)
    line(draw, [(92, 128), (164, 128)], rgba("effdff", 130), 1.8)
    line(draw, [(72, 184), (96, 207), (128, 216), (160, 207), (184, 184)], rgba("45d3ff", 194), 2.8)
    for x in [61, 195]:
        ellipse(draw, (x - 7, 121, x + 7, 135), fill=rgba("06101f", 220), outline=rgba("f6c177", 190), width_value=1.6)
    return clip_rounded(image.resize((SIZE, SIZE), Image.Resampling.LANCZOS))


def main():
    OUT_MARK.parent.mkdir(parents=True, exist_ok=True)
    draw_deep_signal_mark().save(OUT_MARK)
    draw_echo_diver_emblem().save(OUT_DIVER)
    print(f"Wrote {OUT_MARK}")
    print(f"Wrote {OUT_DIVER}")


if __name__ == "__main__":
    main()
