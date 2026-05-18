from pathlib import Path
from collections import deque
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter
import colorsys
import math
import random


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "assets" / "combatants"
SOURCE_DIR = ROOT / "public" / "assets" / "generated-sources"
QA_DIR = ROOT / "qa"
CANVAS = (1024, 1536)
CORE_ALPHA_THRESHOLD = 38
VISIBLE_ALPHA_THRESHOLD = 8
CENTER_TOLERANCE = 42

TIER_FRAMES = {
    "normal": {"max_w": 0.56, "max_h": 0.64, "bottom": 0.115, "safe": 72},
    "elite": {"max_w": 0.62, "max_h": 0.71, "bottom": 0.1, "safe": 76},
    "boss": {"max_w": 0.68, "max_h": 0.76, "bottom": 0.085, "safe": 76},
    "player": {"max_w": 0.58, "max_h": 0.69, "bottom": 0.1, "safe": 72},
}

SPRITES = [
    {"key": "player", "kind": "player", "tier": "player", "hue": 196, "accent": 42, "outputs": ["player-echo-diver.png"]},
    {"key": "cataloger", "kind": "cataloger", "tier": "boss", "hue": 44, "accent": 194, "outputs": ["boss-cataloger.png", "enemy-cataloger.png"]},
    {"key": "algorithm", "kind": "algorithm", "tier": "boss", "hue": 216, "accent": 328, "outputs": ["boss-algorithm.png", "enemy-algorithm.png"]},
    {"key": "lastgate", "kind": "lastgate", "tier": "boss", "hue": 346, "accent": 42, "outputs": ["boss-lastgate.png", "enemy-lastgate.png"]},
    {"key": "bailiff", "kind": "bailiff", "tier": "elite", "hue": 32, "accent": 198, "outputs": ["elite-bailiff.png", "enemy-bailiff.png"]},
    {"key": "engine", "kind": "engine", "tier": "elite", "hue": 8, "accent": 42, "outputs": ["elite-engine.png", "enemy-engine.png"]},
    {"key": "knight", "kind": "knight", "tier": "elite", "hue": 206, "accent": 44, "outputs": ["elite-knight.png", "enemy-knight.png"]},
    {"key": "cantor", "kind": "cantor", "tier": "elite", "hue": 138, "accent": 316, "outputs": ["elite-cantor.png", "enemy-cantor.png"]},
    {"key": "colossus", "kind": "colossus", "tier": "elite", "hue": 28, "accent": 188, "outputs": ["elite-colossus.png", "enemy-colossus.png"]},
    {"key": "choir", "kind": "choir", "tier": "normal", "hue": 128, "accent": 314, "outputs": ["enemy-choir.png"]},
    {"key": "clerk", "kind": "clerk", "tier": "normal", "hue": 190, "accent": 42, "outputs": ["enemy-clerk.png"]},
    {"key": "crab", "kind": "crab", "tier": "normal", "hue": 184, "accent": 36, "outputs": ["enemy-crab.png"]},
    {"key": "diver", "kind": "diver", "tier": "normal", "hue": 210, "accent": 40, "outputs": ["enemy-diver.png"]},
    {"key": "drone", "kind": "drone", "tier": "normal", "hue": 202, "accent": 144, "outputs": ["enemy-drone.png"]},
    {"key": "eel", "kind": "eel", "tier": "normal", "hue": 192, "accent": 50, "outputs": ["enemy-eel.png"]},
    {"key": "hound", "kind": "hound", "tier": "normal", "hue": 356, "accent": 30, "outputs": ["enemy-hound.png"]},
    {"key": "jelly", "kind": "jelly", "tier": "normal", "hue": 188, "accent": 286, "outputs": ["enemy-jelly.png"]},
    {"key": "leech", "kind": "leech", "tier": "normal", "hue": 330, "accent": 142, "outputs": ["enemy-leech.png"]},
    {"key": "mite", "kind": "mite", "tier": "normal", "hue": 26, "accent": 196, "outputs": ["enemy-mite.png"]},
    {"key": "page", "kind": "page", "tier": "normal", "hue": 44, "accent": 198, "outputs": ["enemy-page.png"]},
    {"key": "ray", "kind": "ray", "tier": "normal", "hue": 194, "accent": 282, "outputs": ["enemy-ray.png"]},
    {"key": "sentinel", "kind": "sentinel", "tier": "normal", "hue": 202, "accent": 38, "outputs": ["enemy-sentinel.png"]},
    {"key": "squid", "kind": "squid", "tier": "normal", "hue": 220, "accent": 296, "outputs": ["enemy-squid.png"]},
    {"key": "wisp", "kind": "wisp", "tier": "normal", "hue": 184, "accent": 46, "outputs": ["enemy-wisp.png"]},
]


def rgba(hue, saturation=0.72, value=0.9, alpha=255):
    red, green, blue = colorsys.hsv_to_rgb((hue % 360) / 360, saturation, value)
    return (int(red * 255), int(green * 255), int(blue * 255), int(alpha))


def shadow_color(alpha=255):
    return (4, 8, 13, int(alpha))


def transparent():
    return Image.new("RGBA", CANVAS, (0, 0, 0, 0))


def layer():
    return Image.new("RGBA", CANVAS, (0, 0, 0, 0))


def composite_glow(image, glow_layer, blur=18, opacity=1.0):
    if opacity < 1:
        alpha = glow_layer.getchannel("A").point(lambda value: int(value * opacity))
        glow_layer = glow_layer.copy()
        glow_layer.putalpha(alpha)
    image.alpha_composite(glow_layer.filter(ImageFilter.GaussianBlur(blur)))


def glowing_line(image, points, color, width=12, glow=20, opacity=0.65):
    glow_layer = layer()
    draw = ImageDraw.Draw(glow_layer)
    draw.line(points, fill=color, width=width + 8)
    composite_glow(image, glow_layer, glow, opacity)
    ImageDraw.Draw(image).line(points, fill=color, width=width)


def glowing_polygon(image, points, fill, outline=None, width=6, glow=18):
    outline = outline or fill
    glow_layer = layer()
    glow_draw = ImageDraw.Draw(glow_layer)
    glow_draw.polygon(points, fill=outline)
    composite_glow(image, glow_layer, glow, 0.45)
    draw = ImageDraw.Draw(image)
    draw.polygon(points, fill=fill)
    draw.line(points + [points[0]], fill=outline, width=width)


def glowing_ellipse(image, box, fill, outline=None, width=6, glow=18):
    outline = outline or fill
    glow_layer = layer()
    glow_draw = ImageDraw.Draw(glow_layer)
    glow_draw.ellipse(box, fill=outline)
    composite_glow(image, glow_layer, glow, 0.45)
    draw = ImageDraw.Draw(image)
    draw.ellipse(box, fill=fill, outline=outline, width=width)


def glowing_rect(image, box, radius, fill, outline=None, width=6, glow=18):
    outline = outline or fill
    glow_layer = layer()
    glow_draw = ImageDraw.Draw(glow_layer)
    glow_draw.rounded_rectangle(box, radius=radius, fill=outline)
    composite_glow(image, glow_layer, glow, 0.42)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def glowing_arc(image, box, start, end, color, width=10, glow=16):
    glow_layer = layer()
    glow_draw = ImageDraw.Draw(glow_layer)
    glow_draw.arc(box, start=start, end=end, fill=color, width=width + 8)
    composite_glow(image, glow_layer, glow, 0.55)
    ImageDraw.Draw(image).arc(box, start=start, end=end, fill=color, width=width)


def draw_core(image, center, radius, hue, accent=None):
    x, y = center
    accent = hue if accent is None else accent
    glowing_ellipse(image, (x - radius, y - radius, x + radius, y + radius), rgba(hue, 0.48, 0.22, 230), rgba(accent, 0.8, 1.0, 230), 5, 24)
    glowing_ellipse(image, (x - radius * 0.45, y - radius * 0.45, x + radius * 0.45, y + radius * 0.45), rgba(accent, 0.82, 1.0, 178), rgba(accent, 0.38, 1.0, 230), 3, 20)


def draw_eye(image, center, width, height, accent):
    x, y = center
    box = (x - width / 2, y - height / 2, x + width / 2, y + height / 2)
    glowing_ellipse(image, box, rgba(accent, 0.9, 1.0, 210), rgba(accent, 0.35, 1.0, 245), 3, 14)
    ImageDraw.Draw(image).ellipse((x - 5, y - 5, x + 5, y + 5), fill=(255, 255, 255, 230))


def circuit_marks(image, hue, accent, seed, count=8):
    rng = random.Random(seed)
    draw = ImageDraw.Draw(image)
    for _ in range(count):
        x = rng.randint(270, 760)
        y = rng.randint(390, 1050)
        length = rng.randint(38, 92)
        if rng.random() < 0.55:
            draw.line((x, y, x + length, y), fill=rgba(accent, 0.6, 1.0, 70), width=3)
            draw.ellipse((x + length - 5, y - 5, x + length + 5, y + 5), fill=rgba(hue, 0.5, 1.0, 80))
        else:
            draw.line((x, y, x, y + length), fill=rgba(accent, 0.6, 1.0, 58), width=3)


def fin_points(cx, cy, side, height=130):
    return [(cx, cy), (cx + side * 82, cy + height * 0.24), (cx + side * 24, cy + height)]


def draw_player(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    glowing_polygon(image, [(378, 430), (538, 368), (682, 500), (650, 1160), (354, 1178), (326, 520)], rgba(212, 0.35, 0.16, 226), rgba(hue, 0.7, 0.76, 150), 6, 26)
    glowing_line(image, [(702, 498), (300, 936)], rgba(accent, 0.84, 1.0, 238), 18, 28, 0.78)
    glowing_line(image, [(710, 482), (772, 430)], rgba(accent, 0.7, 1.0, 210), 9, 18, 0.72)
    glowing_rect(image, (408, 620, 616, 1028), 72, rgba(hue, 0.42, 0.25, 242), rgba(hue, 0.62, 0.84, 190), 7, 22)
    glowing_ellipse(image, (392, 354, 624, 590), rgba(hue, 0.46, 0.2, 244), rgba(hue, 0.72, 0.9, 210), 8, 24)
    glowing_ellipse(image, (438, 398, 585, 538), rgba(194, 0.7, 0.95, 98), rgba(188, 0.65, 1.0, 190), 5, 22)
    glowing_line(image, [(416, 734), (292, 846), (254, 1026)], rgba(hue, 0.45, 0.55, 230), 34, 18, 0.42)
    glowing_line(image, [(610, 738), (706, 852), (708, 1020)], rgba(hue, 0.45, 0.55, 230), 34, 18, 0.42)
    glowing_line(image, [(442, 1022), (398, 1234)], rgba(hue, 0.36, 0.48, 230), 38, 16, 0.35)
    glowing_line(image, [(584, 1020), (634, 1230)], rgba(hue, 0.36, 0.48, 230), 38, 16, 0.35)
    draw_core(image, (512, 728), 38, hue, accent)
    circuit_marks(image, hue, accent, seed, 9)


def draw_clerk(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    glowing_rect(image, (390, 408, 635, 1036), 62, rgba(hue, 0.34, 0.19, 240), rgba(hue, 0.55, 0.72, 190), 7, 24)
    for y in [520, 642, 764, 886]:
        glowing_line(image, [(424, y), (602, y - 16)], rgba(accent, 0.68, 1.0, 150), 5, 8, 0.35)
    glowing_ellipse(image, (406, 260, 620, 462), rgba(hue, 0.38, 0.22, 238), rgba(accent, 0.72, 1.0, 205), 7, 24)
    draw_eye(image, (512, 368), 96, 34, accent)
    glowing_line(image, [(388, 642), (274, 772)], rgba(hue, 0.44, 0.5, 215), 26, 14, 0.36)
    glowing_line(image, [(640, 642), (750, 770)], rgba(hue, 0.44, 0.5, 215), 26, 14, 0.36)
    glowing_polygon(image, [(268, 786), (342, 824), (324, 900), (240, 860)], rgba(42, 0.28, 0.88, 190), rgba(accent, 0.7, 1.0, 135), 4, 10)
    glowing_line(image, [(430, 1030), (376, 1208)], rgba(hue, 0.35, 0.45, 220), 30, 10, 0.32)
    glowing_line(image, [(596, 1030), (656, 1208)], rgba(hue, 0.35, 0.45, 220), 30, 10, 0.32)


def draw_crab(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    glowing_ellipse(image, (332, 568, 700, 966), rgba(hue, 0.44, 0.2, 245), rgba(hue, 0.65, 0.8, 210), 8, 22)
    draw_core(image, (516, 730), 44, hue, accent)
    for side in [-1, 1]:
        glowing_line(image, [(396 + side * 72, 812), (292 + side * 154, 932), (250 + side * 212, 1068)], rgba(hue, 0.46, 0.48, 230), 26, 12, 0.34)
        glowing_line(image, [(414 + side * 86, 654), (292 + side * 190, 512)], rgba(hue, 0.48, 0.58, 230), 30, 16, 0.42)
        claw_x = 230 if side < 0 else 794
        glowing_arc(image, (claw_x - 82, 414, claw_x + 82, 594), 38 if side < 0 else 142, 318 if side < 0 else 222, rgba(accent, 0.78, 1.0, 220), 18, 18)
    glowing_line(image, [(510, 540), (510, 440)], rgba(accent, 0.72, 1.0, 170), 8, 14, 0.5)
    glowing_ellipse(image, (480, 386, 540, 446), rgba(accent, 0.8, 1.0, 185), rgba(accent, 0.38, 1.0, 230), 4, 20)


def draw_wisp(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    for radius, alpha in [(224, 45), (160, 72), (96, 104)]:
        glowing_ellipse(image, (512 - radius, 492 - radius, 512 + radius, 492 + radius), rgba(hue, 0.74, 0.8, alpha), rgba(accent, 0.8, 1.0, alpha + 28), 4, 28)
    glowing_polygon(image, [(512, 242), (642, 530), (560, 842), (512, 1000), (462, 842), (382, 530)], rgba(hue, 0.68, 0.38, 188), rgba(accent, 0.85, 1.0, 210), 5, 26)
    draw_core(image, (512, 596), 66, hue, accent)
    rng = random.Random(seed)
    for _ in range(12):
        x = rng.randint(350, 680)
        y = rng.randint(300, 970)
        r = rng.randint(5, 13)
        glowing_ellipse(image, (x - r, y - r, x + r, y + r), rgba(accent, 0.7, 1.0, 120), None, 2, 10)


def draw_choir(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    bases = [(370, 740), (512, 662), (654, 740)]
    for index, (x, y) in enumerate(bases):
        glowing_rect(image, (x - 58, y - 132, x + 58, y + 126), 38, rgba(hue, 0.4, 0.2, 235), rgba(hue, 0.64, 0.72, 180), 5, 18)
        glowing_ellipse(image, (x - 70, y - 234, x + 70, y - 102), rgba(hue + index * 12, 0.46, 0.22, 238), rgba(accent, 0.7, 0.95, 165), 5, 16)
        draw_eye(image, (x, y - 168), 60, 18, accent)
        glowing_line(image, [(x, y + 126), (x + (index - 1) * 38, 1120)], rgba(hue, 0.35, 0.42, 220), 26, 10, 0.3)
    for r in [210, 278, 340]:
        glowing_arc(image, (512 - r, 338 - r * 0.35, 512 + r, 338 + r * 1.25), 205, 335, rgba(accent, 0.72, 1.0, 95), 5, 12)


def draw_eel(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    points = []
    for i in range(16):
        t = i / 15
        points.append((300 + t * 430, 344 + t * 734 + math.sin(t * math.pi * 4.1) * 96))
    glowing_line(image, points, rgba(hue, 0.42, 0.22, 242), 92, 22, 0.42)
    glowing_line(image, points, rgba(hue, 0.62, 0.74, 212), 22, 18, 0.65)
    glowing_polygon(image, [(716, 1060), (838, 1112), (738, 1190)], rgba(hue, 0.48, 0.38, 220), rgba(accent, 0.78, 1.0, 170), 5, 14)
    draw_eye(image, (330, 390), 62, 22, accent)
    for i in [4, 7, 10, 13]:
        x, y = points[i]
        glowing_line(image, [(x - 50, y), (x + 64, y + 18)], rgba(accent, 0.82, 1.0, 150), 7, 12, 0.45)


def draw_leech(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    points = [(330, 990), (398, 770), (542, 620), (676, 720), (710, 942)]
    glowing_line(image, points, rgba(hue, 0.46, 0.2, 240), 116, 22, 0.42)
    glowing_line(image, points, rgba(hue, 0.62, 0.58, 166), 18, 14, 0.44)
    glowing_ellipse(image, (602, 586, 780, 766), rgba(346, 0.62, 0.18, 240), rgba(accent, 0.75, 0.9, 185), 7, 22)
    for x in [646, 690, 730]:
        glowing_line(image, [(x, 640), (x - 24, 700)], rgba(accent, 0.76, 1.0, 160), 6, 8, 0.42)
    draw_core(image, (454, 784), 34, hue, accent)


def draw_sentinel(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    glowing_polygon(image, [(512, 290), (690, 480), (650, 1060), (512, 1218), (374, 1060), (334, 480)], rgba(hue, 0.38, 0.19, 244), rgba(hue, 0.6, 0.76, 205), 8, 24)
    glowing_polygon(image, [(512, 410), (622, 542), (598, 930), (512, 1038), (426, 930), (402, 542)], rgba(hue, 0.45, 0.24, 222), rgba(accent, 0.78, 1.0, 180), 6, 20)
    draw_eye(image, (512, 560), 108, 30, accent)
    glowing_line(image, [(736, 296), (736, 1168)], rgba(accent, 0.76, 1.0, 210), 18, 20, 0.62)
    glowing_line(image, [(690, 430), (760, 430)], rgba(accent, 0.74, 1.0, 190), 10, 12, 0.5)


def draw_ray(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    glowing_polygon(image, [(512, 360), (820, 678), (638, 910), (512, 1080), (386, 910), (204, 678)], rgba(hue, 0.44, 0.19, 236), rgba(hue, 0.66, 0.78, 188), 7, 24)
    glowing_line(image, [(512, 392), (512, 1080)], rgba(accent, 0.78, 1.0, 155), 8, 14, 0.48)
    glowing_line(image, [(280, 684), (742, 684)], rgba(accent, 0.72, 1.0, 120), 6, 12, 0.42)
    draw_core(image, (512, 676), 46, hue, accent)
    glowing_line(image, [(512, 1062), (476, 1252)], rgba(hue, 0.48, 0.52, 205), 18, 12, 0.32)


def draw_hound(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    glowing_line(image, [(326, 850), (448, 704), (638, 730), (746, 612)], rgba(hue, 0.5, 0.22, 240), 104, 22, 0.42)
    glowing_polygon(image, [(708, 548), (834, 610), (732, 698)], rgba(hue, 0.54, 0.23, 240), rgba(accent, 0.8, 0.86, 190), 6, 20)
    draw_eye(image, (748, 606), 46, 18, accent)
    for x, y in [(388, 844), (502, 820), (618, 824), (706, 760)]:
        glowing_line(image, [(x, y), (x - 28, 1102)], rgba(hue, 0.44, 0.44, 220), 30, 10, 0.32)
    for x in [424, 500, 576, 652]:
        glowing_line(image, [(x, 672), (x + 24, 594)], rgba(accent, 0.72, 1.0, 156), 12, 12, 0.42)


def draw_page(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    pages = [
        [(338, 416), (620, 354), (682, 836), (386, 904)],
        [(452, 486), (744, 548), (656, 1002), (384, 902)],
        [(294, 610), (542, 536), (608, 1110), (348, 1074)],
    ]
    for points in pages:
        glowing_polygon(image, points, rgba(42, 0.2, 0.86, 210), rgba(accent, 0.7, 1.0, 138), 5, 14)
    for y in [560, 640, 720, 800]:
        glowing_line(image, [(402, y), (608, y - 30)], rgba(hue, 0.7, 0.42, 130), 5, 8, 0.28)
    glowing_line(image, [(514, 910), (476, 1200)], rgba(accent, 0.7, 1.0, 155), 10, 14, 0.42)


def draw_drone(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    glowing_ellipse(image, (322, 444, 702, 824), rgba(hue, 0.38, 0.2, 242), rgba(hue, 0.62, 0.76, 205), 8, 24)
    draw_core(image, (512, 634), 74, hue, accent)
    for side in [-1, 1]:
        glowing_polygon(image, fin_points(350 if side < 0 else 674, 620, side, 120), rgba(hue, 0.46, 0.34, 210), rgba(accent, 0.7, 1.0, 145), 5, 13)
        glowing_line(image, [(512 + side * 94, 812), (512 + side * 170, 1040)], rgba(hue, 0.45, 0.48, 210), 22, 10, 0.35)
    glowing_line(image, [(512, 820), (512, 1118)], rgba(accent, 0.76, 1.0, 190), 16, 18, 0.6)
    glowing_polygon(image, [(512, 1128), (468, 1048), (556, 1048)], rgba(accent, 0.7, 0.9, 210), rgba(accent, 0.8, 1.0, 190), 4, 14)


def draw_squid(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    glowing_ellipse(image, (346, 282, 678, 680), rgba(hue, 0.46, 0.2, 240), rgba(hue, 0.68, 0.78, 205), 8, 24)
    glowing_polygon(image, [(512, 646), (674, 912), (558, 1010), (512, 1180), (466, 1010), (350, 912)], rgba(hue, 0.48, 0.2, 226), rgba(accent, 0.7, 0.92, 160), 6, 20)
    draw_eye(image, (458, 472), 58, 22, accent)
    draw_eye(image, (566, 472), 58, 22, accent)
    for offset in [-144, -72, 0, 72, 144]:
        points = []
        for i in range(8):
            t = i / 7
            points.append((512 + offset * (1 - t * 0.3) + math.sin(t * 5 + offset) * 28, 812 + t * 420))
        glowing_line(image, points, rgba(hue, 0.54, 0.48, 210), 24, 12, 0.36)


def draw_mite(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    glowing_ellipse(image, (346, 650, 678, 986), rgba(hue, 0.5, 0.2, 242), rgba(hue, 0.65, 0.74, 205), 8, 20)
    glowing_ellipse(image, (432, 504, 592, 674), rgba(hue, 0.48, 0.18, 238), rgba(accent, 0.72, 1.0, 170), 5, 18)
    draw_eye(image, (486, 584), 40, 16, accent)
    draw_eye(image, (542, 584), 40, 16, accent)
    for side in [-1, 1]:
        for i, y in enumerate([724, 812, 900]):
            glowing_line(image, [(512 + side * 94, y), (512 + side * (210 + i * 24), y + 72)], rgba(hue, 0.46, 0.45, 210), 18, 10, 0.3)


def draw_diver(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    glowing_ellipse(image, (392, 296, 632, 548), rgba(38, 0.38, 0.24, 242), rgba(accent, 0.72, 0.98, 190), 8, 22)
    glowing_ellipse(image, (438, 350, 586, 498), rgba(194, 0.6, 0.88, 92), rgba(hue, 0.7, 1.0, 168), 5, 18)
    glowing_rect(image, (396, 560, 630, 1014), 74, rgba(hue, 0.36, 0.2, 242), rgba(hue, 0.6, 0.72, 190), 8, 20)
    draw_core(image, (512, 730), 44, hue, accent)
    glowing_line(image, [(628, 704), (750, 918)], rgba(hue, 0.42, 0.46, 220), 34, 12, 0.34)
    glowing_ellipse(image, (708, 892, 838, 1032), rgba(38, 0.38, 0.24, 220), rgba(accent, 0.72, 1.0, 160), 6, 14)
    glowing_line(image, [(448, 1006), (406, 1210)], rgba(hue, 0.34, 0.44, 220), 34, 10, 0.32)
    glowing_line(image, [(584, 1006), (644, 1210)], rgba(hue, 0.34, 0.44, 220), 34, 10, 0.32)


def draw_jelly(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    glowing_ellipse(image, (286, 292, 738, 748), rgba(hue, 0.44, 0.22, 202), rgba(accent, 0.66, 1.0, 180), 7, 30)
    glowing_arc(image, (334, 356, 690, 804), 186, 354, rgba(accent, 0.62, 1.0, 150), 12, 16)
    draw_core(image, (512, 578), 64, hue, accent)
    for offset in [-168, -96, -32, 32, 96, 168]:
        points = []
        for i in range(8):
            t = i / 7
            points.append((512 + offset * (1 - t * 0.45) + math.sin(t * 6 + offset) * 24, 714 + t * 430))
        glowing_line(image, points, rgba(hue, 0.62, 0.74, 155), 14, 14, 0.4)


def draw_bailiff(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    glowing_rect(image, (390, 360, 634, 1040), 82, rgba(hue, 0.34, 0.2, 245), rgba(hue, 0.58, 0.82, 210), 9, 24)
    glowing_ellipse(image, (386, 188, 638, 438), rgba(hue, 0.42, 0.22, 245), rgba(accent, 0.66, 1.0, 205), 8, 22)
    draw_eye(image, (512, 320), 118, 34, accent)
    glowing_line(image, [(682, 332), (314, 986)], rgba(accent, 0.78, 1.0, 230), 20, 24, 0.64)
    glowing_rect(image, (236, 940, 398, 1044), 18, rgba(accent, 0.56, 0.62, 232), rgba(accent, 0.78, 1.0, 180), 6, 16)
    glowing_polygon(image, [(512, 524), (612, 660), (574, 880), (512, 948), (450, 880), (412, 660)], rgba(42, 0.28, 0.78, 112), rgba(accent, 0.7, 1.0, 150), 5, 14)
    glowing_line(image, [(444, 1032), (398, 1260)], rgba(hue, 0.35, 0.44, 230), 38, 12, 0.3)
    glowing_line(image, [(584, 1032), (640, 1260)], rgba(hue, 0.35, 0.44, 230), 38, 12, 0.3)


def draw_engine(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    glowing_ellipse(image, (264, 360, 760, 894), rgba(hue, 0.5, 0.18, 246), rgba(hue, 0.72, 0.78, 210), 10, 28)
    for radius in [86, 150, 218]:
        glowing_arc(image, (512 - radius, 628 - radius, 512 + radius, 628 + radius), 15, 335, rgba(accent, 0.8, 1.0, 150), 11, 16)
    draw_core(image, (512, 628), 74, hue, accent)
    for side in [-1, 1]:
        glowing_line(image, [(344 + side * 68, 792), (262 + side * 250, 1068)], rgba(hue, 0.48, 0.42, 230), 48, 14, 0.36)
        glowing_ellipse(image, (236 if side < 0 else 668, 984, 364 if side < 0 else 796, 1124), rgba(8, 0.62, 0.26, 226), rgba(accent, 0.8, 1.0, 160), 6, 16)
    for x in [404, 512, 620]:
        glowing_line(image, [(x, 904), (x, 1210)], rgba(hue, 0.42, 0.42, 220), 30, 10, 0.3)


def draw_knight(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    glowing_polygon(image, [(512, 216), (656, 418), (620, 1040), (512, 1244), (404, 1040), (368, 418)], rgba(hue, 0.34, 0.2, 246), rgba(hue, 0.6, 0.82, 214), 9, 24)
    glowing_ellipse(image, (400, 230, 624, 450), rgba(hue, 0.38, 0.22, 244), rgba(accent, 0.7, 1.0, 190), 8, 22)
    draw_eye(image, (512, 338), 112, 28, accent)
    glowing_line(image, [(732, 194), (288, 1208)], rgba(accent, 0.78, 1.0, 235), 18, 24, 0.68)
    glowing_polygon(image, [(732, 194), (784, 338), (692, 314)], rgba(accent, 0.68, 0.92, 222), rgba(accent, 0.8, 1.0, 190), 5, 14)
    glowing_polygon(image, [(512, 508), (636, 698), (602, 980), (512, 1098), (422, 980), (388, 698)], rgba(206, 0.42, 0.32, 180), rgba(accent, 0.72, 1.0, 160), 6, 18)


def draw_cantor(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    glowing_rect(image, (356, 408, 668, 1130), 92, rgba(hue, 0.42, 0.18, 242), rgba(hue, 0.66, 0.76, 205), 9, 24)
    for x in [420, 512, 604]:
        glowing_ellipse(image, (x - 72, 208, x + 72, 358), rgba(hue + x % 20, 0.44, 0.22, 238), rgba(accent, 0.72, 1.0, 172), 6, 18)
        draw_eye(image, (x, 286), 58, 18, accent)
    for r in [240, 330, 420]:
        glowing_arc(image, (512 - r, 124 - r * 0.22, 512 + r, 124 + r), 205, 335, rgba(accent, 0.75, 1.0, 110), 8, 16)
    draw_core(image, (512, 686), 52, hue, accent)
    for x in [424, 512, 600]:
        glowing_line(image, [(x, 1130), (x + (x - 512) * 0.2, 1300)], rgba(hue, 0.36, 0.42, 220), 34, 10, 0.28)


def draw_colossus(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    glowing_polygon(image, [(512, 212), (760, 516), (710, 1048), (512, 1302), (314, 1048), (264, 516)], rgba(hue, 0.36, 0.18, 248), rgba(hue, 0.58, 0.72, 215), 11, 28)
    glowing_ellipse(image, (376, 250, 648, 500), rgba(hue, 0.36, 0.2, 244), rgba(accent, 0.68, 1.0, 178), 8, 20)
    draw_eye(image, (512, 374), 126, 34, accent)
    glowing_line(image, [(772, 428), (772, 1188)], rgba(accent, 0.7, 0.86, 226), 38, 20, 0.48)
    glowing_arc(image, (646, 930, 898, 1314), 40, 302, rgba(accent, 0.72, 0.92, 220), 26, 22)
    draw_core(image, (512, 752), 62, hue, accent)
    for x in [384, 640]:
        glowing_line(image, [(x, 1056), (x - 40 if x < 512 else x + 40, 1320)], rgba(hue, 0.34, 0.42, 230), 48, 12, 0.28)


def draw_cataloger(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    glowing_polygon(image, [(512, 158), (702, 386), (690, 1080), (512, 1336), (334, 1080), (322, 386)], rgba(36, 0.34, 0.18, 248), rgba(hue, 0.72, 0.82, 218), 10, 30)
    for side in [-1, 1]:
        wing = [(512 + side * 84, 448), (512 + side * 356, 306), (512 + side * 382, 1040), (512 + side * 100, 972)]
        glowing_polygon(image, wing, rgba(42, 0.2, 0.82, 142), rgba(accent, 0.72, 1.0, 165), 6, 22)
        for i in range(5):
            y = 430 + i * 110
            glowing_line(image, [(512 + side * 126, y), (512 + side * 312, y - 38)], rgba(hue, 0.7, 0.95, 104), 5, 8, 0.3)
    glowing_ellipse(image, (386, 170, 638, 422), rgba(42, 0.36, 0.22, 245), rgba(accent, 0.72, 1.0, 205), 8, 24)
    draw_eye(image, (512, 296), 132, 34, accent)
    draw_core(image, (512, 692), 74, hue, accent)


def draw_algorithm(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    for radius, start in [(360, 0), (282, 34), (204, 68)]:
        glowing_arc(image, (512 - radius, 512 - radius, 512 + radius, 512 + radius), start, start + 292, rgba(accent, 0.8, 1.0, 162), 12, 22)
    glowing_polygon(image, [(512, 202), (780, 512), (512, 822), (244, 512)], rgba(hue, 0.38, 0.18, 220), rgba(hue, 0.68, 0.82, 190), 8, 28)
    draw_core(image, (512, 512), 104, hue, accent)
    for angle in range(0, 360, 45):
        x = 512 + math.cos(math.radians(angle)) * 302
        y = 512 + math.sin(math.radians(angle)) * 302
        glowing_line(image, [(512, 512), (x, y)], rgba(hue, 0.65, 0.8, 86), 5, 10, 0.28)
        glowing_ellipse(image, (x - 24, y - 24, x + 24, y + 24), rgba(accent, 0.76, 1.0, 132), None, 3, 12)
    glowing_line(image, [(512, 820), (452, 1220)], rgba(hue, 0.38, 0.42, 190), 24, 12, 0.26)
    glowing_line(image, [(512, 820), (572, 1220)], rgba(hue, 0.38, 0.42, 190), 24, 12, 0.26)


def draw_lastgate(image, spec, seed):
    hue, accent = spec["hue"], spec["accent"]
    glowing_rect(image, (236, 188, 788, 1268), 78, rgba(348, 0.44, 0.14, 250), rgba(hue, 0.72, 0.76, 218), 11, 32)
    glowing_rect(image, (326, 308, 698, 1222), 62, rgba(226, 0.36, 0.14, 230), rgba(accent, 0.76, 0.92, 205), 8, 26)
    glowing_ellipse(image, (350, 498, 674, 822), rgba(hue, 0.62, 0.32, 176), rgba(accent, 0.84, 1.0, 225), 8, 32)
    draw_core(image, (512, 660), 82, hue, accent)
    for x in [318, 420, 604, 706]:
        glowing_line(image, [(x, 286), (x, 1238)], rgba(accent, 0.66, 1.0, 118), 6, 14, 0.32)
    for y in [390, 956, 1128]:
        glowing_line(image, [(280, y), (744, y)], rgba(hue, 0.72, 0.8, 118), 7, 14, 0.32)
    for side in [-1, 1]:
        glowing_line(image, [(512 + side * 230, 724), (512 + side * 370, 980)], rgba(hue, 0.54, 0.46, 220), 34, 14, 0.34)


DRAWERS = {
    "player": draw_player,
    "clerk": draw_clerk,
    "crab": draw_crab,
    "wisp": draw_wisp,
    "choir": draw_choir,
    "eel": draw_eel,
    "leech": draw_leech,
    "sentinel": draw_sentinel,
    "ray": draw_ray,
    "hound": draw_hound,
    "page": draw_page,
    "drone": draw_drone,
    "squid": draw_squid,
    "mite": draw_mite,
    "diver": draw_diver,
    "jelly": draw_jelly,
    "bailiff": draw_bailiff,
    "engine": draw_engine,
    "knight": draw_knight,
    "cantor": draw_cantor,
    "colossus": draw_colossus,
    "cataloger": draw_cataloger,
    "algorithm": draw_algorithm,
    "lastgate": draw_lastgate,
}


def has_transparency(image):
    alpha = image.getchannel("A")
    return alpha.getextrema()[0] < 250


def border_key_color(image):
    samples = []
    width, height = image.size
    pixels = image.load()
    step_x = max(1, width // 32)
    step_y = max(1, height // 32)
    for x in range(0, width, step_x):
        samples.append(pixels[x, 0][:3])
        samples.append(pixels[x, height - 1][:3])
    for y in range(0, height, step_y):
        samples.append(pixels[0, y][:3])
        samples.append(pixels[width - 1, y][:3])
    samples.sort()
    return samples[len(samples) // 2]


def remove_chroma_key(image):
    if has_transparency(image):
        return image
    key = border_key_color(image)
    key_is_green = key[1] > 160 and key[1] - max(key[0], key[2]) > 70
    key_is_dark = max(key) < 28
    if not key_is_green and not key_is_dark:
        return image

    out = image.copy()
    width, height = out.size
    source_pixels = out.load()
    background = Image.new("L", out.size, 0)
    mask_pixels = background.load()
    queue = deque()

    def is_background_pixel(x, y):
        r, g, b, _ = source_pixels[x, y]
        distance = math.sqrt((r - key[0]) ** 2 + (g - key[1]) ** 2 + (b - key[2]) ** 2)
        if key_is_dark:
            return distance < 72 or max(r, g, b) < 20
        green_gap = g - max(r, b)
        return g > 118 and green_gap > 34 and distance < 170

    for x in range(width):
        if is_background_pixel(x, 0):
            queue.append((x, 0))
        if is_background_pixel(x, height - 1):
            queue.append((x, height - 1))
    for y in range(height):
        if is_background_pixel(0, y):
            queue.append((0, y))
        if is_background_pixel(width - 1, y):
            queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if mask_pixels[x, y]:
            continue
        if not is_background_pixel(x, y):
            continue
        mask_pixels[x, y] = 255
        if x > 0:
            queue.append((x - 1, y))
        if x < width - 1:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y < height - 1:
            queue.append((x, y + 1))

    alpha = out.getchannel("A")
    soft_background = background.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.15))
    out.putalpha(ImageChops.subtract(alpha, soft_background))

    if key_is_green:
        pixels = out.load()
        for y in range(height):
            for x in range(width):
                r, g, b, a = pixels[x, y]
                if a and g > max(r, b) + 20:
                    pixels[x, y] = (r, min(g, max(r, b) + 18), b, a)
    return out


def subject_bbox(image, threshold=CORE_ALPHA_THRESHOLD):
    alpha = image.getchannel("A").point(lambda value: 255 if value > threshold else 0)
    return alpha.getbbox()


def crop_subject(image):
    bbox = subject_bbox(image, threshold=VISIBLE_ALPHA_THRESHOLD)
    if not bbox:
        raise ValueError("source image has no visible subject")
    pad = 18
    left = max(0, bbox[0] - pad)
    top = max(0, bbox[1] - pad)
    right = min(image.width, bbox[2] + pad)
    bottom = min(image.height, bbox[3] + pad)
    return image.crop((left, top, right, bottom))


def reframe(source, tier):
    frame = TIER_FRAMES[tier]
    cutout = crop_subject(remove_chroma_key(source.convert("RGBA")))
    max_w = int(CANVAS[0] * frame["max_w"])
    max_h = int(CANVAS[1] * frame["max_h"])
    scale = min(max_w / cutout.width, max_h / cutout.height)
    width = max(1, int(cutout.width * scale))
    height = max(1, int(cutout.height * scale))
    cutout = cutout.resize((width, height), Image.Resampling.LANCZOS)

    canvas = transparent()
    x = (CANVAS[0] - width) // 2
    bottom_margin = int(CANVAS[1] * frame["bottom"])
    y = CANVAS[1] - bottom_margin - height
    y = max(26, y)
    canvas.alpha_composite(cutout, (x, y))
    return canvas


def enforce_sprite_safety(image, tier):
    frame = TIER_FRAMES[tier]
    bbox = subject_bbox(image, threshold=VISIBLE_ALPHA_THRESHOLD)
    if not bbox:
        return image

    left, top, right, bottom = bbox
    safety = frame["safe"]
    overflows = [
        max(0, safety - left),
        max(0, safety - top),
        max(0, right - (CANVAS[0] - safety)),
        max(0, bottom - (CANVAS[1] - safety)),
    ]
    overflow = max(overflows)
    if overflow <= 0:
        return image

    crop = image.crop(bbox)
    max_w = CANVAS[0] - safety * 2
    max_h = CANVAS[1] - safety * 2
    scale = min(max_w / crop.width, max_h / crop.height, 1)
    width = max(1, int(crop.width * scale))
    height = max(1, int(crop.height * scale))
    crop = crop.resize((width, height), Image.Resampling.LANCZOS)

    canvas = transparent()
    x = (CANVAS[0] - width) // 2
    target_bottom = CANVAS[1] - int(CANVAS[1] * frame["bottom"])
    y = min(CANVAS[1] - safety - height, target_bottom - height)
    y = max(safety, y)
    canvas.alpha_composite(crop, (x, y))
    return canvas


def source_path_for(spec):
    if spec["key"] == "player":
        return SOURCE_DIR / "player-echo-diver-source.png"
    if spec["tier"] == "boss":
        return SOURCE_DIR / f"boss-{spec['key']}-source.png"
    if spec["tier"] == "elite":
        return SOURCE_DIR / f"elite-{spec['key']}-source.png"
    return SOURCE_DIR / f"enemy-{spec['key']}-source.png"


def load_source_sprite(spec):
    source_path = source_path_for(spec)
    if not source_path.exists():
        return None
    image = Image.open(source_path).convert("RGBA")
    image = remove_chroma_key(image)
    alpha = image.getchannel("A")
    rgb = image.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(1.08)
    rgb = ImageEnhance.Contrast(rgb).enhance(1.06)
    rgb = ImageEnhance.Sharpness(rgb).enhance(1.08)
    polished = rgb.convert("RGBA")
    polished.putalpha(alpha)
    return polished


def add_sprite_rim(image, hue, accent, tier):
    bbox = subject_bbox(image)
    if not bbox:
        return image
    alpha = image.getchannel("A")
    rim_mask = alpha.filter(ImageFilter.MaxFilter(7 if tier == "boss" else 5))
    rim_mask = ImageChops.subtract(rim_mask, alpha).filter(ImageFilter.GaussianBlur(1.2))
    rim = Image.new("RGBA", image.size, rgba(accent, 0.64, 1.0, 92 if tier == "boss" else 70))
    rim.putalpha(rim_mask)
    glow = Image.new("RGBA", image.size, rgba(hue, 0.72, 0.72, 34))
    glow.putalpha(alpha.filter(ImageFilter.GaussianBlur(18 if tier == "boss" else 12)))
    final = transparent()
    final.alpha_composite(glow)
    final.alpha_composite(rim)
    final.alpha_composite(image)
    return final


def add_ground_shadow(image, hue, tier):
    bbox = subject_bbox(image)
    if not bbox:
        return image
    left, top, right, bottom = bbox
    width = right - left
    shadow = layer()
    draw = ImageDraw.Draw(shadow)
    pad_x = width * (0.18 if tier == "boss" else 0.12)
    y = min(CANVAS[1] - 40, bottom + 18)
    height = 52 if tier != "boss" else 72
    shadow_left = max(18, left - pad_x)
    shadow_right = min(CANVAS[0] - 18, right + pad_x)
    draw.ellipse((shadow_left, y - height, shadow_right, y + height * 0.24), fill=(0, 0, 0, 106))
    draw.ellipse((max(28, left + width * 0.08), y - height * 0.62, min(CANVAS[0] - 28, right - width * 0.08), y + height * 0.12), fill=rgba(hue, 0.75, 0.65, 58))
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    final = transparent()
    final.alpha_composite(shadow)
    final.alpha_composite(image)
    return final


def compose_sprite(spec):
    source = load_source_sprite(spec)
    if source is not None:
        image = source
    else:
        image = transparent()
        seed = sum(ord(char) for char in spec["key"]) * 97
        DRAWERS[spec["kind"]](image, spec, seed)
        circuit_marks(image, spec["hue"], spec["accent"], seed + 23, 4 if spec["tier"] == "normal" else 7)
    framed = reframe(image, spec["tier"])
    final = add_sprite_rim(framed, spec["hue"], spec["accent"], spec["tier"])
    final = add_ground_shadow(final, spec["hue"], spec["tier"])
    final = enforce_sprite_safety(final, spec["tier"])
    validate_combatant_canvas(final, spec["key"], spec["tier"])
    return final


def validate_combatant_canvas(image, key, tier):
    if image.size != CANVAS:
        raise ValueError(f"{key} is {image.size}, expected {CANVAS}")
    bbox = subject_bbox(image, threshold=VISIBLE_ALPHA_THRESHOLD)
    if not bbox:
        raise ValueError(f"{key} has no visible pixels")
    left, top, right, bottom = bbox
    margin = TIER_FRAMES[tier]["safe"]
    if left < margin or top < margin or right > CANVAS[0] - margin or bottom > CANVAS[1] - margin:
        raise ValueError(f"{key} touches the canvas edge: {bbox}")
    core_bbox = subject_bbox(image)
    if not core_bbox:
        raise ValueError(f"{key} has no readable core silhouette")
    core_left, core_top, core_right, core_bottom = core_bbox
    if core_left < margin or core_top < margin or core_right > CANVAS[0] - margin or core_bottom > CANVAS[1] - margin:
        raise ValueError(f"{key} core silhouette leaves the safe frame: {core_bbox}")
    visible_width = right - left
    visible_height = bottom - top
    center_x = (left + right) / 2
    if abs(center_x - CANVAS[0] / 2) > CENTER_TOLERANCE:
        raise ValueError(f"{key} is not centered enough for combat staging: {bbox}")
    min_height = {"normal": 360, "elite": 520, "boss": 640, "player": 620}[tier]
    if visible_height < min_height or visible_width < 220:
        raise ValueError(f"{key} is too small for combat readability: {bbox}")
    target_bottom = int(CANVAS[1] * (1 - TIER_FRAMES[tier]["bottom"])) + 42
    if abs(bottom - target_bottom) > 120:
        raise ValueError(f"{key} baseline drifted too far: bottom {bottom}, target {target_bottom}")


def checkerboard(size, tile=24):
    width, height = size
    image = Image.new("RGB", size, (10, 17, 25))
    draw = ImageDraw.Draw(image)
    for y in range(0, height, tile):
        for x in range(0, width, tile):
            if ((x // tile) + (y // tile)) % 2:
                draw.rectangle((x, y, x + tile, y + tile), fill=(13, 22, 32))
    return image


def write_contact_sheet(paths):
    QA_DIR.mkdir(parents=True, exist_ok=True)
    columns = 6
    tile_w = 222
    tile_h = 360
    label_h = 34
    gap = 16
    rows = math.ceil(len(paths) / columns)
    sheet_w = columns * tile_w + (columns + 1) * gap
    sheet_h = rows * (tile_h + label_h) + (rows + 1) * gap
    sheet = Image.new("RGB", (sheet_w, sheet_h), (5, 10, 17))
    draw = ImageDraw.Draw(sheet)
    for index, path in enumerate(paths):
        source = Image.open(ROOT / path).convert("RGBA")
        row, col = divmod(index, columns)
        x = gap + col * (tile_w + gap)
        y = gap + row * (tile_h + label_h + gap)
        cell = checkerboard((tile_w, tile_h))
        cell_draw = ImageDraw.Draw(cell)
        cell_draw.rounded_rectangle((1, 1, tile_w - 2, tile_h - 2), radius=8, outline=(48, 70, 96), width=1)
        cell_draw.line((18, tile_h - 42, tile_w - 18, tile_h - 42), fill=(226, 166, 77), width=1)
        preview = source.copy()
        preview.thumbnail((tile_w - 22, tile_h - 28), Image.Resampling.LANCZOS)
        px = (tile_w - preview.width) // 2
        py = tile_h - preview.height - 20
        cell.alpha_composite(preview, (px, py)) if cell.mode == "RGBA" else cell.paste(preview, (px, py), preview)
        sheet.paste(cell, (x, y))
        draw.text((x + 4, y + tile_h + 10), path.name if isinstance(path, Path) else Path(path).name, fill=(220, 230, 240))
    out_path = QA_DIR / "combatants-safe-regenerated-sheet.png"
    sheet.save(out_path)
    return out_path


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = []
    for spec in SPRITES:
        sprite = compose_sprite(spec)
        for output_name in spec["outputs"]:
            out_path = OUT_DIR / output_name
            sprite.save(out_path)
            written.append(out_path.relative_to(ROOT))
    print("Rebuilt combatant sprites:")
    for path in written:
        print(f"- {path}")
    sheet = write_contact_sheet(written)
    print(f"QA sheet: {sheet.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
