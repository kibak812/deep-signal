from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps
import colorsys
import math
import re
import shutil


ROOT = Path(__file__).resolve().parents[1]
CARD_SOURCE = ROOT / "src" / "data" / "cards.js"
BASE_ATLAS = ROOT / "public" / "assets" / "generated-sources" / "card-illustrations-base.png"
OUT = ROOT / "public" / "assets" / "card-illustrations.png"
QA_DIR = ROOT / "qa"

COLS = 9
ROWS = 8
CELL_W = 320
CELL_H = 288
ART_SAFE_BOUNDS = (18, 16, CELL_W - 18, CELL_H - 16)

BASE_COLS = 6
BASE_ROWS = 4
BASE_CELLS = {
    "pulseLance": (0, 0),
    "zeroPin": (1, 0),
    "memoryShift": (2, 0),
    "cacheCleanse": (3, 0),
    "shieldWard": (4, 0),
    "chargeCrystal": (5, 0),
    "virusBloom": (0, 1),
    "counterBarrier": (1, 1),
    "anchorStrike": (2, 1),
    "harpoonBeam": (3, 1),
    "algorithmLattice": (4, 1),
    "deadLetter": (5, 1),
    "quarantineSeal": (0, 2),
    "tideCurrent": (1, 2),
    "echoWave": (2, 2),
    "coralEngine": (3, 2),
    "firewallWall": (4, 2),
    "pressureBloom": (5, 2),
    "pearlFocus": (0, 3),
    "chronoLoop": (1, 3),
    "royalConduit": (2, 3),
    "nullVoid": (3, 3),
    "oathFlare": (4, 3),
    "leviathan": (5, 3),
}

BASE_BY_ART = {
    "lance": "pulseLance",
    "pin": "harpoonBeam",
    "memory_sift": "cacheCleanse",
    "rill_cut": "pulseLance",
    "drift_scan": "tideCurrent",
    "static_psalm": "virusBloom",
    "ledger": "deadLetter",
    "needle": "zeroPin",
    "salvage": "anchorStrike",
    "bolt": "chargeCrystal",
    "mirror": "counterBarrier",
    "net": "algorithmLattice",
    "lantern": "oathFlare",
    "glass": "pressureBloom",
    "shard": "echoWave",
    "box": "nullVoid",
    "kick": "tideCurrent",
    "rite": "chronoLoop",
    "suture": "pearlFocus",
    "bargain": "deadLetter",
    "axiom": "algorithmLattice",
    "cleanse": "cacheCleanse",
    "cache": "cacheCleanse",
    "ward": "shieldWard",
    "seal": "shieldWard",
    "bastion": "shieldWard",
    "armor": "shieldWard",
    "coat": "shieldWard",
    "charge": "chargeCrystal",
    "spark": "chargeCrystal",
    "brass": "chargeCrystal",
    "circuit": "chargeCrystal",
    "pearl": "pearlFocus",
    "virus": "virusBloom",
    "outbreak": "virusBloom",
    "hex": "virusBloom",
    "quarantine": "quarantineSeal",
    "anchor": "anchorStrike",
    "harpoon": "harpoonBeam",
    "beam": "harpoonBeam",
    "knife": "harpoonBeam",
    "redaction_blade": "harpoonBeam",
    "algorithm": "algorithmLattice",
    "lattice": "algorithmLattice",
    "index": "algorithmLattice",
    "rewrite": "algorithmLattice",
    "dead_letter": "deadLetter",
    "waterlogged_doubt": "deadLetter",
    "current": "tideCurrent",
    "dive": "tideCurrent",
    "breath": "tideCurrent",
    "echo": "echoWave",
    "signal": "echoWave",
    "sonar_choir": "echoWave",
    "coral": "coralEngine",
    "reef": "coralEngine",
    "rust_bloom": "coralEngine",
    "firewall": "firewallWall",
    "pressure_bloom": "pressureBloom",
    "chrono": "chronoLoop",
    "reset": "chronoLoop",
    "royal": "royalConduit",
    "cathedral": "royalConduit",
    "gate": "royalConduit",
    "null": "nullVoid",
    "dust": "nullVoid",
    "tax": "nullVoid",
    "footnote": "nullVoid",
    "covenant": "oathFlare",
    "oath": "oathFlare",
    "sunrise": "oathFlare",
    "leviathan": "leviathan",
}

TYPE_HUES = {
    "attack": 12,
    "skill": 194,
    "power": 43,
    "curse": 334,
}

KEYWORD_HUES = {
    "damage": 15,
    "mark": 205,
    "block": 184,
    "counter": 52,
    "plated": 172,
    "charge": 190,
    "focus": 176,
    "virus": 342,
    "weak": 315,
    "vulnerable": 8,
    "frail": 262,
    "temporary": 214,
    "exhaust": 38,
    "retain": 54,
    "power": 48,
}

# Starter cards should read as painted card art, not as procedural symbols.
STARTER_ART_OVERRIDES = set()
PAINTED_SOURCE_CARD_IDS = {"pulse_lance", "tide_ward", "memory_sift", "null_pin"}
MINIMAL_OVERLAY_CARD_IDS = PAINTED_SOURCE_CARD_IDS

ATTACK_ARTS = {
    "lance",
    "rill_cut",
    "signal",
    "brass",
    "needle",
    "rust_bloom",
    "redaction_blade",
    "kick",
    "lattice",
    "harpoon",
    "tax",
    "null",
    "beam",
    "knife",
    "charge",
    "footnote",
    "axiom",
    "royal",
}

SHIELD_ARTS = {
    "ward",
    "coral",
    "seal",
    "bastion",
    "firewall",
    "coat",
    "armor",
    "quarantine",
}

MEMORY_ARTS = {
    "memory_sift",
    "drift_scan",
    "cleanse",
    "ledger",
    "rewrite",
    "salvage",
    "index",
    "cache",
    "rite",
    "reset",
    "chrono",
    "pearl",
}

VIRUS_ARTS = {
    "dust",
    "static_psalm",
    "reef",
    "hex",
    "pressure_bloom",
    "outbreak",
    "dead_letter",
    "waterlogged_doubt",
}

CHARGE_ARTS = {
    "current",
    "gate",
    "spark",
    "bolt",
    "lantern",
    "cathedral",
    "circuit",
    "algorithm",
    "suture",
    "sunrise",
    "oath",
    "covenant",
}


def parse_cards():
    source = CARD_SOURCE.read_text("utf-8")
    cards = []
    for block in re.findall(r"card\(\{([\s\S]*?)\n  \}\),?", source):
        card_id = field(block, "id")
        art = field(block, "art")
        if not card_id or not art:
            continue
        cards.append(
            {
                "id": card_id,
                "name": field(block, "name"),
                "type": field(block, "type"),
                "rarity": field(block, "rarity"),
                "art": art,
                "keywords": re.findall(r'"([^"]+)"', re.search(r"keywords:\s*\[([^\]]*)\]", block).group(1)) if re.search(r"keywords:\s*\[([^\]]*)\]", block) else [],
            }
        )
    return cards


def field(block, key):
    match = re.search(rf'{key}:\s*"([^"]+)"', block)
    return match.group(1) if match else ""


def ensure_base_atlas():
    if BASE_ATLAS.exists():
        return
    if not OUT.exists():
        raise FileNotFoundError("public/assets/card-illustrations.png is missing")
    image = Image.open(OUT)
    if image.width > 2400 or image.height > 1400:
        raise RuntimeError("base card atlas is missing and current card-illustrations.png already looks rebuilt")
    BASE_ATLAS.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(OUT, BASE_ATLAS)


def source_cell(base, key):
    col, row = BASE_CELLS[key]
    left = round(base.width * col / BASE_COLS)
    right = round(base.width * (col + 1) / BASE_COLS)
    top = round(base.height * row / BASE_ROWS)
    bottom = round(base.height * (row + 1) / BASE_ROWS)
    source = base.crop((left, top, right, bottom)).convert("RGBA")
    return ImageOps.fit(source, (CELL_W, CELL_H), method=Image.Resampling.LANCZOS, centering=(0.5, 0.48))


def rgb_from_hue(hue, sat=0.82, light=0.58):
    r, g, b = colorsys.hls_to_rgb((hue % 360) / 360, light, sat)
    return (int(r * 255), int(g * 255), int(b * 255))


def seed_for(text):
    value = 2166136261
    for ch in text:
        value ^= ord(ch)
        value = (value * 16777619) & 0xFFFFFFFF
    return value


def dominant_hue(card):
    for keyword in card["keywords"]:
        if keyword in KEYWORD_HUES:
            return KEYWORD_HUES[keyword]
    return TYPE_HUES.get(card["type"], 190)


def color_grade(image, card, seed):
    hue = dominant_hue(card) + ((seed >> 5) % 28) - 14
    accent = rgb_from_hue(hue)
    glow = Image.new("RGBA", image.size, (*accent, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((-40, -34, CELL_W * 0.86, CELL_H * 0.82), fill=(*accent, 44))
    gd.ellipse((CELL_W * 0.42, CELL_H * 0.14, CELL_W + 54, CELL_H + 62), fill=(*rgb_from_hue(hue + 42), 32))
    image = Image.alpha_composite(image, glow.filter(ImageFilter.GaussianBlur(16)))
    image = ImageEnhance.Color(image).enhance(1.06)
    image = ImageEnhance.Contrast(image).enhance(1.08)
    return image, hue


def transform_base(image, seed):
    angle = ((seed >> 9) % 7) - 3
    if seed & 4:
        image = ImageOps.mirror(image)
    rotated = image.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    return ImageOps.fit(rotated, (CELL_W, CELL_H), method=Image.Resampling.LANCZOS, centering=(0.5, 0.52))


def vignette():
    layer = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for i, alpha in enumerate([52, 36, 24, 14]):
        inset = i * 10
        draw.rounded_rectangle((inset, inset, CELL_W - inset, CELL_H - inset), radius=18, outline=(0, 0, 0, alpha), width=8)
    draw.rectangle((0, 0, CELL_W, 16), fill=(255, 255, 255, 10))
    draw.rectangle((0, CELL_H - 34, CELL_W, CELL_H), fill=(0, 0, 0, 34))
    draw.line((0, CELL_H - 1, CELL_W, CELL_H - 1), fill=(236, 248, 243, 20), width=1)
    return layer


def starter_background(hue, seed):
    image = Image.new("RGBA", (CELL_W, CELL_H), (2, 8, 13, 255))
    draw = ImageDraw.Draw(image)
    top = rgb_from_hue(hue + 12, 0.58, 0.16)
    bottom = rgb_from_hue(hue - 34, 0.62, 0.08)
    for y in range(CELL_H):
        t = y / max(1, CELL_H - 1)
        color = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        draw.line((0, y, CELL_W, y), fill=(*color, 255))
    for i in range(28):
        x = (seed >> (i % 17)) % CELL_W
        y = (seed >> ((i + 6) % 19)) % CELL_H
        r = 1 + ((seed >> (i % 11)) % 3)
        alpha = 24 + ((seed >> (i % 13)) % 42)
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(*rgb_from_hue(hue + i * 7, 0.7, 0.62), alpha))
    grid = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for x in range(-CELL_H, CELL_W + CELL_H, 34):
        gd.line((x, CELL_H, x + CELL_H, 0), fill=(236, 248, 243, 10), width=1)
    for x in range(0, CELL_W, 54):
        gd.line((x, 0, x + 24, CELL_H), fill=(125, 211, 252, 12), width=1)
    return Image.alpha_composite(image, grid)


def glow_layer(draw_fn, blur=8, opacity=1):
    layer = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(layer))
    if blur:
        layer = layer.filter(ImageFilter.GaussianBlur(blur))
    if opacity != 1:
        alpha = layer.getchannel("A").point(lambda value: int(value * opacity))
        layer.putalpha(alpha)
    return layer


def soften_alpha(layer, factor):
    alpha = layer.getchannel("A").point(lambda value: int(value * factor))
    softened = layer.copy()
    softened.putalpha(alpha)
    return softened


def overlay_strength(card):
    if card["id"] in MINIMAL_OVERLAY_CARD_IDS:
        return 0
    if card["rarity"] == "rare":
        return 0.34
    if card["rarity"] == "uncommon":
        return 0.26
    if card["type"] == "power":
        return 0.3
    return 0.18


def symbol_strength(card):
    if card["id"] in MINIMAL_OVERLAY_CARD_IDS:
        return 0
    if card["rarity"] == "rare":
        return 0.12
    if card["rarity"] == "uncommon":
        return 0.08
    return 0.045


def line_glow(layer, points, color, width=5, blur=10, opacity=0.7):
    glow = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.line(points, fill=color, width=width + 7)
    if blur:
        glow = glow.filter(ImageFilter.GaussianBlur(blur))
    if opacity != 1:
        alpha = glow.getchannel("A").point(lambda value: int(value * opacity))
        glow.putalpha(alpha)
    layer.alpha_composite(glow)
    ImageDraw.Draw(layer).line(points, fill=color, width=width)


def ellipse_glow(layer, box, fill, outline=None, width=4, blur=10, opacity=0.62):
    outline = outline or fill
    glow = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse(box, fill=outline)
    if blur:
        glow = glow.filter(ImageFilter.GaussianBlur(blur))
    alpha = glow.getchannel("A").point(lambda value: int(value * opacity))
    glow.putalpha(alpha)
    layer.alpha_composite(glow)
    ImageDraw.Draw(layer).ellipse(box, fill=fill, outline=outline, width=width)


def polygon_glow(layer, points, fill, outline=None, width=4, blur=10, opacity=0.58):
    outline = outline or fill
    glow = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.polygon(points, fill=outline)
    if blur:
        glow = glow.filter(ImageFilter.GaussianBlur(blur))
    alpha = glow.getchannel("A").point(lambda value: int(value * opacity))
    glow.putalpha(alpha)
    layer.alpha_composite(glow)
    draw = ImageDraw.Draw(layer)
    draw.polygon(points, fill=fill)
    draw.line(points + [points[0]], fill=outline, width=width)


def art_family(card):
    art = card["art"]
    if art in ATTACK_ARTS:
        return "attack"
    if art in SHIELD_ARTS:
        return "shield"
    if art in MEMORY_ARTS:
        return "memory"
    if art in VIRUS_ARTS:
        return "virus"
    if art in CHARGE_ARTS:
        return "charge"
    if art in {"echo", "shard", "sonar_choir"}:
        return "echo"
    if art in {"anchor", "dive", "breath", "glass"}:
        return "tide"
    if art in {"box", "null"}:
        return "void"
    if art in {"leviathan"}:
        return "leviathan"
    if card["type"] == "curse":
        return "virus"
    return card["type"]


def draw_landmark(layer, card, hue, seed):
    draw = ImageDraw.Draw(layer)
    accent = (*rgb_from_hue(hue, 0.88, 0.62), 210)
    accent2 = (*rgb_from_hue(hue + 48, 0.78, 0.65), 170)
    soft = (*rgb_from_hue(hue - 32, 0.62, 0.42), 96)
    cx = CELL_W // 2 + ((seed >> 4) % 19) - 9
    cy = CELL_H // 2 + ((seed >> 8) % 15) - 7
    family = art_family(card)

    if family == "attack":
        start = (34 + ((seed >> 5) % 22), 194 - ((seed >> 7) % 16))
        end = (276 - ((seed >> 11) % 30), 38 + ((seed >> 13) % 22))
        line_glow(layer, [start, end], (*rgb_from_hue(hue + 18, 0.92, 0.66), 230), 8, 14, 0.76)
        line_glow(layer, [(start[0] - 16, start[1] + 12), (end[0] - 32, end[1] + 26)], (*rgb_from_hue(hue + 188, 0.82, 0.62), 118), 2, 7, 0.45)
        tip = [(end[0] + 20, end[1] - 12), (end[0] + 2, end[1] + 34), (end[0] - 30, end[1] + 8)]
        polygon_glow(layer, tip, (238, 248, 255, 224), accent, 2, 9, 0.48)
        for index in range(3):
            y = 70 + index * 42 + ((seed >> index) % 12)
            draw.arc((40 - index * 4, y - 44, 300 + index * 2, y + 74), 205, 335, fill=(*rgb_from_hue(hue + 38, 0.84, 0.62), 64), width=3)
    elif family == "shield":
        ellipse_glow(layer, (46, 22, 274, 220), (*rgb_from_hue(hue, 0.52, 0.23), 82), accent, 5, 16, 0.46)
        polygon_glow(layer, [(cx, 40), (cx + 80, 84), (cx + 62, 174), (cx, 208), (cx - 62, 174), (cx - 80, 84)], (*rgb_from_hue(hue, 0.48, 0.24), 112), accent2, 4, 12, 0.4)
        for offset in [-48, -18, 18, 48]:
            line_glow(layer, [(cx + offset, 58), (cx - offset * 0.62, 190)], (*rgb_from_hue(hue + 22, 0.7, 0.72), 72), 2, 5, 0.32)
    elif family == "memory":
        for radius, alpha in [(90, 118), (64, 96), (36, 130)]:
            draw.ellipse((cx - radius, cy - radius * 0.72, cx + radius, cy + radius * 0.72), outline=(*rgb_from_hue(hue + radius, 0.76, 0.64), alpha), width=3)
        for index in range(7):
            x = 54 + index * 34
            y = 44 + ((seed >> index) % 34)
            draw.rounded_rectangle((x, y, x + 22, y + 36), radius=4, outline=accent2, fill=(5, 18, 30, 126), width=1)
            draw.line((x + 5, y + 11, x + 17, y + 11), fill=accent, width=2)
        line_glow(layer, [(46, 178), (116, 142), (178, 158), (272, 72)], accent, 4, 9, 0.52)
    elif family == "virus":
        for index in range(15):
            angle = math.tau * index / 15 + (seed % 120) / 140
            radius = 34 + ((seed >> (index % 12)) % 66)
            x = cx + math.cos(angle) * radius
            y = cy + math.sin(angle) * radius * 0.72
            draw.line((cx, cy, x, y), fill=(*rgb_from_hue(hue + index * 7, 0.84, 0.54), 72), width=2)
            ellipse_glow(layer, (x - 7, y - 7, x + 7, y + 7), (*rgb_from_hue(hue + index * 9, 0.78, 0.64), 150), None, 1, 7, 0.34)
        ellipse_glow(layer, (cx - 34, cy - 34, cx + 34, cy + 34), (*rgb_from_hue(hue, 0.62, 0.25), 170), accent, 3, 12, 0.48)
    elif family == "charge":
        for radius, alpha in [(92, 78), (62, 118), (30, 168)]:
            draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=(*rgb_from_hue(hue + radius, 0.82, 0.64), alpha), width=3)
        line_glow(layer, [(cx, 24), (cx - 18, 98), (cx + 22, 104), (cx, 216)], accent, 5, 11, 0.58)
        polygon_glow(layer, [(cx - 18, cy - 22), (cx + 24, cy - 28), (cx + 4, cy + 56), (cx + 40, cy + 48), (cx - 12, cy + 96), (cx + 2, cy + 22)], (*rgb_from_hue(hue + 38, 0.9, 0.64), 160), accent2, 2, 10, 0.34)
    elif family == "echo":
        for radius in [42, 72, 104, 134]:
            draw.arc((cx - radius, cy - radius * 0.62, cx + radius, cy + radius * 0.62), 198, 342, fill=(*rgb_from_hue(hue + radius, 0.82, 0.62), 120 - radius // 2), width=4)
        line_glow(layer, [(44, cy), (278, cy + ((seed >> 5) % 24) - 12)], accent, 4, 9, 0.48)
    elif family == "tide":
        points = []
        for index in range(11):
            t = index / 10
            points.append((34 + t * 260, cy + math.sin(t * math.tau * 1.25 + seed) * 42))
        line_glow(layer, points, accent, 10, 14, 0.5)
        for shift in [24, -26]:
            line_glow(layer, [(x, y + shift) for x, y in points], (*rgb_from_hue(hue + 36, 0.68, 0.68), 84), 3, 7, 0.32)
    elif family == "void":
        ellipse_glow(layer, (52, 36, 268, 208), (18, 4, 24, 190), accent, 5, 18, 0.54)
        draw.polygon([(cx, 62), (cx + 58, cy), (cx, 178), (cx - 58, cy)], outline=accent2)
        line_glow(layer, [(48, 198), (272, 44)], (*rgb_from_hue(hue + 80, 0.74, 0.66), 130), 3, 8, 0.36)
    elif family == "leviathan":
        points = []
        for index in range(14):
            t = index / 13
            points.append((34 + t * 260, 66 + t * 112 + math.sin(t * math.tau * 2.2) * 42))
        line_glow(layer, points, (*rgb_from_hue(hue, 0.62, 0.36), 220), 28, 18, 0.44)
        line_glow(layer, points, accent, 5, 9, 0.46)
        polygon_glow(layer, [(252, 164), (304, 184), (260, 216)], (*rgb_from_hue(hue + 42, 0.62, 0.42), 160), accent2, 2, 8, 0.28)
    else:
        for index in range(8):
            angle = math.tau * index / 8
            x = cx + math.cos(angle) * 78
            y = cy + math.sin(angle) * 56
            draw.line((cx, cy, x, y), fill=soft, width=2)
            draw.ellipse((x - 5, y - 5, x + 5, y + 5), fill=accent2)
        ellipse_glow(layer, (cx - 42, cy - 42, cx + 42, cy + 42), (*rgb_from_hue(hue, 0.48, 0.24), 116), accent, 2, 10, 0.4)


def frame_art_panel(image, card, hue):
    layer = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    accent = rgb_from_hue(hue, 0.76, 0.64)
    rare = card["rarity"] == "rare"
    draw.rectangle((0, 0, CELL_W, CELL_H), outline=(*accent, 34 if rare else 22), width=1)
    draw.rectangle((0, 0, CELL_W, CELL_H), outline=(236, 248, 243, 12), width=1)
    draw.polygon([(0, 0), (CELL_W * 0.46, 0), (0, CELL_H * 0.42)], fill=(255, 255, 255, 10))
    draw.polygon([(CELL_W, CELL_H), (CELL_W * 0.58, CELL_H), (CELL_W, CELL_H * 0.58)], fill=(0, 0, 0, 30))
    if rare:
        draw.arc((18, 14, CELL_W - 18, CELL_H - 12), 205, 335, fill=(*rgb_from_hue(45, 0.86, 0.64), 86), width=3)
    return Image.alpha_composite(image, layer)


def finish_card_art(image, card, hue):
    return Image.alpha_composite(frame_art_panel(image, card, hue), vignette())


def compose_starter_lance(seed):
    image = starter_background(14, seed)
    cyan = rgb_from_hue(190, 0.9, 0.62)
    orange = rgb_from_hue(18, 0.96, 0.62)
    image = Image.alpha_composite(
        image,
        glow_layer(lambda d: [d.line((28, 206, 286, 36), fill=(*orange, 172), width=18), d.ellipse((226, 46, 306, 126), outline=(*cyan, 120), width=8)], 12),
    )
    layer = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.line((34, 202, 262, 52), fill=(255, 227, 162, 230), width=7)
    d.line((38, 209, 270, 58), fill=(*orange, 220), width=3)
    d.polygon([(248, 44), (302, 30), (278, 82)], fill=(231, 245, 255, 234), outline=(*cyan, 210))
    d.polygon([(238, 53), (264, 77), (104, 180), (90, 165)], fill=(34, 69, 78, 230), outline=(*cyan, 140))
    for r, alpha in [(58, 130), (82, 82), (112, 44)]:
        d.ellipse((250 - r, 58 - r, 250 + r, 58 + r), outline=(*orange, alpha), width=3)
    for offset, alpha in [(0, 120), (22, 82), (44, 48)]:
        d.line((22 + offset, 216, 150 + offset, 132), fill=(*cyan, alpha), width=2)
    d.line((18, 220, 302, 34), fill=(255, 255, 255, 62), width=1)
    return Image.alpha_composite(image, layer)


def compose_starter_ward(seed):
    image = starter_background(188, seed)
    cyan = rgb_from_hue(188, 0.86, 0.64)
    pearl = rgb_from_hue(170, 0.55, 0.78)
    image = Image.alpha_composite(
        image,
        glow_layer(lambda d: d.ellipse((42, 18, 278, 220), fill=(*cyan, 72), outline=(*pearl, 150), width=8), 14),
    )
    layer = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse((52, 28, 268, 218), outline=(*pearl, 214), width=5)
    d.ellipse((76, 48, 244, 202), outline=(*cyan, 126), width=3)
    d.polygon([(160, 42), (234, 88), (218, 174), (160, 206), (102, 174), (86, 88)], outline=(*cyan, 164), fill=(20, 80, 91, 78))
    for x in [112, 142, 176, 208]:
        d.line((x, 64, x - 34, 192), fill=(*pearl, 62), width=2)
        d.line((x, 64, x + 34, 192), fill=(*cyan, 48), width=2)
    d.arc((34, 144, 286, 282), 198, 342, fill=(*rgb_from_hue(44, 0.82, 0.62), 132), width=8)
    d.arc((62, 160, 258, 260), 200, 340, fill=(*cyan, 112), width=4)
    for crack in [((162, 42), (172, 92), (154, 122)), ((214, 86), (184, 112), (194, 160)), ((102, 92), (132, 126), (120, 172))]:
        d.line(crack, fill=(236, 248, 243, 80), width=2)
    return Image.alpha_composite(image, layer)


def compose_starter_memory(seed):
    image = starter_background(202, seed)
    cyan = rgb_from_hue(196, 0.9, 0.62)
    violet = rgb_from_hue(238, 0.82, 0.65)
    image = Image.alpha_composite(
        image,
        glow_layer(lambda d: [d.ellipse((62, 28, 258, 224), outline=(*cyan, 126), width=10), d.line((36, 120, 284, 120), fill=(*violet, 128), width=6)], 12),
    )
    layer = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for r, alpha in [(92, 126), (66, 104), (38, 152), (16, 190)]:
        d.ellipse((160 - r, 118 - r, 160 + r, 118 + r), outline=(*cyan, alpha), width=3)
    for i in range(7):
        x = 62 + i * 32
        y = 58 + ((seed >> i) % 20)
        d.rounded_rectangle((x, y, x + 28, y + 42), radius=5, outline=(*violet, 120), fill=(9, 28, 45, 152), width=2)
        d.line((x + 6, y + 13, x + 22, y + 13), fill=(*cyan, 110), width=2)
    d.arc((70, 52, 250, 200), 210, 505, fill=(*cyan, 190), width=5)
    d.polygon([(234, 65), (276, 74), (244, 102)], fill=(*cyan, 174))
    d.ellipse((142, 100, 178, 136), fill=(*rgb_from_hue(184, 0.92, 0.72), 220), outline=(236, 248, 243, 160), width=2)
    d.line((160, 16, 160, 224), fill=(*violet, 56), width=2)
    return Image.alpha_composite(image, layer)


def compose_starter_pin(seed):
    image = starter_background(210, seed)
    blue = rgb_from_hue(204, 0.9, 0.62)
    amber = rgb_from_hue(42, 0.86, 0.6)
    image = Image.alpha_composite(
        image,
        glow_layer(lambda d: [d.ellipse((72, 34, 248, 210), outline=(*blue, 150), width=9), d.line((158, 22, 158, 222), fill=(*blue, 84), width=8)], 12),
    )
    layer = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = 160, 120
    for r, alpha in [(88, 128), (56, 166), (26, 214)]:
        d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(*blue, alpha), width=3)
    d.line((34, cy, 286, cy), fill=(*blue, 150), width=2)
    d.line((cx, 30, cx, 210), fill=(*blue, 150), width=2)
    d.polygon([(152, 48), (176, 48), (166, 118), (154, 118)], fill=(225, 247, 255, 224), outline=(*blue, 180))
    d.polygon([(154, 118), (166, 118), (160, 190)], fill=(*amber, 218), outline=(255, 238, 168, 160))
    d.ellipse((146, 104, 174, 132), fill=(3, 13, 15, 212), outline=(*amber, 210), width=3)
    d.ellipse((156, 114, 164, 122), fill=(*blue, 230))
    for angle in range(0, 360, 45):
        x = cx + math.cos(math.radians(angle)) * 106
        y = cy + math.sin(math.radians(angle)) * 74
        d.line((cx, cy, x, y), fill=(*blue, 28), width=1)
    return Image.alpha_composite(image, layer)


def compose_starter_override(card, seed):
    if card["art"] == "lance":
        return compose_starter_lance(seed)
    if card["art"] == "ward":
        return compose_starter_ward(seed)
    if card["art"] == "memory_sift":
        return compose_starter_memory(seed)
    if card["art"] == "pin":
        return compose_starter_pin(seed)
    return None


def draw_symbol(layer, card, hue, seed):
    draw = ImageDraw.Draw(layer)
    accent = rgb_from_hue(hue)
    accent2 = rgb_from_hue(hue + 52, 0.78, 0.62)
    cx = CELL_W // 2 + ((seed >> 3) % 25) - 12
    cy = CELL_H // 2 + ((seed >> 11) % 17) - 8
    keywords = set(card["keywords"])
    motif = card["type"]
    if "virus" in keywords or card["type"] == "curse":
        motif = "virus"
    elif "charge" in keywords or "focus" in keywords:
        motif = "charge"
    elif {"block", "counter", "plated"} & keywords:
        motif = "ward"
    elif "mark" in keywords:
        motif = "mark"
    elif {"exhaust", "temporary", "retain"} & keywords:
        motif = "cycle"

    if motif == "attack":
        draw.line((22, CELL_H - 34, CELL_W - 34, 32), fill=(*accent, 168), width=5)
        draw.line((46, CELL_H - 52, CELL_W - 66, 54), fill=(*accent2, 88), width=2)
        for i in range(8):
            x = 46 + ((seed >> (i + 1)) % 224)
            y = 30 + ((seed >> (i + 7)) % 176)
            draw.ellipse((x - 2, y - 2, x + 2, y + 2), fill=(*accent2, 120))
    elif motif == "ward":
        for r, alpha in [(84, 96), (62, 72), (40, 52)]:
            draw.arc((cx - r, cy - r, cx + r, cy + r), 205, 335, fill=(*accent, alpha), width=4)
            draw.arc((cx - r, cy - r, cx + r, cy + r), 24, 156, fill=(*accent2, alpha // 2), width=2)
        draw.polygon([(cx, cy - 72), (cx + 66, cy - 20), (cx + 42, cy + 70), (cx, cy + 92), (cx - 42, cy + 70), (cx - 66, cy - 20)], outline=(*accent, 116))
    elif motif == "charge":
        for r, alpha in [(82, 62), (54, 92), (24, 132)]:
            draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=(*accent, alpha), width=3)
        draw.line((cx, 18, cx, CELL_H - 20), fill=(*accent2, 76), width=2)
        draw.line((22, cy, CELL_W - 20, cy), fill=(*accent, 62), width=2)
    elif motif == "virus":
        for i in range(13):
            angle = (math.tau * i / 13) + ((seed % 90) / 100)
            radius = 28 + ((seed >> (i % 12)) % 58)
            x = cx + math.cos(angle) * radius
            y = cy + math.sin(angle) * radius * 0.72
            draw.line((cx, cy, x, y), fill=(*accent, 64), width=2)
            draw.ellipse((x - 5, y - 5, x + 5, y + 5), fill=(*accent2, 106))
        draw.ellipse((cx - 30, cy - 30, cx + 30, cy + 30), outline=(*accent, 144), width=4)
    elif motif == "mark":
        draw.ellipse((cx - 78, cy - 62, cx + 78, cy + 62), outline=(*accent, 112), width=4)
        draw.line((cx - 96, cy, cx + 96, cy), fill=(*accent2, 116), width=3)
        draw.line((cx, cy - 76, cx, cy + 76), fill=(*accent, 88), width=2)
        draw.polygon([(cx, cy - 22), (cx + 21, cy), (cx, cy + 22), (cx - 21, cy)], outline=(*accent2, 132), width=3)
    elif motif == "cycle":
        for i in range(4):
            box = (cx - 84 + i * 10, cy - 70 + i * 8, cx + 84 - i * 10, cy + 70 - i * 8)
            draw.arc(box, 16 + i * 24, 260 + i * 18, fill=(*accent, 116 - i * 16), width=4)
        draw.polygon([(cx + 82, cy - 8), (cx + 112, cy - 18), (cx + 96, cy + 10)], fill=(*accent2, 128))
    elif motif == "power":
        points = []
        for i in range(8):
            angle = math.tau * i / 8 + 0.39
            points.append((cx + math.cos(angle) * 76, cy + math.sin(angle) * 58))
        for i, p1 in enumerate(points):
            for p2 in points[i + 1 :]:
                if (i + int(p2[0])) % 3 == 0:
                    draw.line((p1, p2), fill=(*accent, 38), width=1)
        for x, y in points:
            draw.ellipse((x - 4, y - 4, x + 4, y + 4), fill=(*accent2, 130))
    else:
        draw.arc((cx - 86, cy - 64, cx + 86, cy + 64), 200, 520, fill=(*accent, 96), width=4)
        draw.line((24, CELL_H - 30, CELL_W - 32, 34), fill=(*accent2, 76), width=2)

    if card["rarity"] == "rare":
        draw.ellipse((18, 18, CELL_W - 18, CELL_H - 18), outline=(*rgb_from_hue(45, 0.82, 0.64), 80), width=2)
    elif card["rarity"] == "starter":
        draw.line((28, 28, CELL_W - 28, 28), fill=(*rgb_from_hue(188, 0.7, 0.66), 80), width=2)


def compose_card(card, base):
    seed = seed_for(f"{card['id']}:{card['art']}:{card['name']}")
    if card["art"] in STARTER_ART_OVERRIDES:
        return finish_card_art(compose_starter_override(card, seed), card, dominant_hue(card))
    base_key = BASE_BY_ART.get(card["art"], "pulseLance")
    image = transform_base(source_cell(base, base_key), seed)
    image, hue = color_grade(image, card, seed)
    if card["id"] in MINIMAL_OVERLAY_CARD_IDS:
        return finish_card_art(image, card, hue)
    landmark_strength = overlay_strength(card)
    if landmark_strength > 0:
        landmark = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
        draw_landmark(landmark, card, hue, seed)
        image = Image.alpha_composite(image, soften_alpha(landmark, landmark_strength))
    sigil_strength = symbol_strength(card)
    if sigil_strength > 0:
        symbol = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
        draw_symbol(symbol, card, hue, seed)
        symbol = soften_alpha(symbol.filter(ImageFilter.GaussianBlur(0.18)), sigil_strength)
        image = Image.alpha_composite(image, symbol)
    return finish_card_art(image, card, hue)


def validate_card_cell(image, card):
    if image.size != (CELL_W, CELL_H):
        raise ValueError(f"{card['art']} is {image.size}, expected {(CELL_W, CELL_H)}")
    if image.mode != "RGBA":
        raise ValueError(f"{card['art']} must be RGBA")
    _, alpha_max = image.getchannel("A").getextrema()
    if alpha_max < 240:
        raise ValueError(f"{card['art']} should have visible atlas pixels")


def checkerboard(size, tile=18):
    width, height = size
    image = Image.new("RGB", size, (8, 13, 20))
    draw = ImageDraw.Draw(image)
    for y in range(0, height, tile):
        for x in range(0, width, tile):
            if ((x // tile) + (y // tile)) % 2:
                draw.rectangle((x, y, x + tile, y + tile), fill=(12, 19, 29))
    return image


def write_contact_sheet(atlas, art_cards):
    QA_DIR.mkdir(parents=True, exist_ok=True)
    columns = 6
    tile_w = 208
    tile_h = 156
    label_h = 30
    gap = 14
    rows = math.ceil(len(art_cards) / columns)
    sheet_w = columns * tile_w + (columns + 1) * gap
    sheet_h = rows * (tile_h + label_h) + (rows + 1) * gap
    sheet = Image.new("RGB", (sheet_w, sheet_h), (5, 9, 15))
    draw = ImageDraw.Draw(sheet)
    for index, card in enumerate(art_cards):
        source_col = index % COLS
        source_row = index // COLS
        cell = atlas.crop((source_col * CELL_W, source_row * CELL_H, (source_col + 1) * CELL_W, (source_row + 1) * CELL_H)).convert("RGBA")
        cell.thumbnail((tile_w - 10, tile_h - 10), Image.Resampling.LANCZOS)
        row, col = divmod(index, columns)
        preview = checkerboard((tile_w, tile_h))
        preview_draw = ImageDraw.Draw(preview)
        preview_draw.rounded_rectangle((0, 0, tile_w - 1, tile_h - 1), radius=8, outline=(50, 73, 100), width=1)
        preview_x = (tile_w - cell.width) // 2
        preview_y = (tile_h - cell.height) // 2
        preview.paste(cell, (preview_x, preview_y), cell)
        sheet_x = gap + col * (tile_w + gap)
        sheet_y = gap + row * (tile_h + label_h + gap)
        sheet.paste(preview, (sheet_x, sheet_y))
        label = f"{card['art']} · {card['type']}"
        draw.text((sheet_x + 4, sheet_y + tile_h + 9), label[:30], fill=(220, 230, 240))
    out_path = QA_DIR / "card-illustrations-sheet.png"
    sheet.save(out_path)
    return out_path


def main():
    ensure_base_atlas()
    cards = parse_cards()
    art_cards = []
    seen = set()
    for card in cards:
        if card["art"] in seen:
            continue
        seen.add(card["art"])
        art_cards.append(card)
    if len(art_cards) > COLS * ROWS:
        raise RuntimeError(f"{len(art_cards)} card art keys exceed {COLS * ROWS} atlas cells")

    base = Image.open(BASE_ATLAS).convert("RGBA")
    atlas = Image.new("RGBA", (COLS * CELL_W, ROWS * CELL_H), (4, 10, 14, 255))
    for index, card in enumerate(art_cards):
        col = index % COLS
        row = index // COLS
        cell = compose_card(card, base)
        validate_card_cell(cell, card)
        atlas.alpha_composite(cell, (col * CELL_W, row * CELL_H))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT)
    sheet = write_contact_sheet(atlas, art_cards)
    print(f"Rebuilt {len(art_cards)} card illustration cells into {OUT.relative_to(ROOT)}")
    print(f"Atlas layout: {COLS} columns x {ROWS} rows, {CELL_W}x{CELL_H} cells")
    print(f"QA sheet: {sheet.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
