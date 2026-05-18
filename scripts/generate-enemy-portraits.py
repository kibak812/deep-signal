from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
import math
import random


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "assets" / "sprite-atlas.png"
OUT = ROOT / "public" / "assets" / "enemy-portraits.png"
COMBAT_OUT = ROOT / "public" / "assets" / "combat-sprites.png"
PLAYER_OUT = ROOT / "public" / "assets" / "player-sprite.png"
COMBATANT_DIR = ROOT / "public" / "assets" / "combatants"
CELL = 256
COMBAT_CELL = 320
COLS = 6
ROWS = 4

SOURCE_CELLS = {
    "player": (0, 0),
    "orbSpirit": (1, 0),
    "crab": (2, 0),
    "tankDrone": (3, 0),
    "squid": (4, 0),
    "diverKnight": (5, 0),
    "orbEngine": (6, 0),
    "bookRelic": (7, 0),
    "gateBoss": (0, 1),
    "whaleBoss": (1, 1),
    "redBoss": (2, 1),
    "roundRelic": (3, 1),
    "crystalRelic": (4, 1),
    "shellRelic": (5, 1),
    "tubeRelic": (6, 1),
    "coralRelic": (7, 1),
}

SOURCE_FOCUS_BOXES = {
    "player": (30, 0, 196, 256),
    "orbSpirit": (10, 0, 240, 252),
    "crab": (8, 0, 244, 254),
    "tankDrone": (6, 0, 238, 256),
    "squid": (4, 0, 202, 256),
    "diverKnight": (8, 0, 158, 256),
    "orbEngine": (8, 0, 202, 256),
    "bookRelic": (22, 0, 256, 238),
    "gateBoss": (0, 0, 256, 232),
    "whaleBoss": (0, 0, 256, 232),
    "redBoss": (0, 0, 256, 238),
    "roundRelic": (0, 0, 236, 256),
    "crystalRelic": (24, 0, 232, 256),
    "shellRelic": (12, 0, 238, 246),
    "tubeRelic": (18, 0, 234, 256),
    "coralRelic": (14, 0, 238, 250),
}

COMBAT_SOURCE_OVERRIDES = {
    "sentinel": {"box": (18, 0, 156, 256), "scale": 0.96},
    "diver": {"box": (30, 0, 196, 256), "scale": 1.02},
    "bailiff": {"box": (18, 0, 156, 256), "scale": 1.0},
    "knight": {"box": (18, 0, 156, 256), "scale": 1.02},
    "eel": {"box": (8, 0, 198, 256), "scale": 0.98},
    "squid": {"box": (8, 0, 198, 256), "scale": 1.0},
    "colossus": {"box": (8, 0, 202, 256), "scale": 1.06},
    "cataloger": {"box": (0, 0, 256, 232), "scale": 1.04},
    "algorithm": {"box": (0, 0, 256, 232), "scale": 1.02},
    "lastgate": {"box": (0, 0, 256, 238), "scale": 1.06},
}

ENEMIES = [
    ("clerk", "bookRelic", (102, 218, 242), "scan"),
    ("crab", "crab", (98, 231, 255), "claw"),
    ("wisp", "orbSpirit", (130, 245, 255), "spark"),
    ("choir", "gateBoss", (137, 226, 255), "choir"),
    ("eel", "squid", (92, 235, 220), "coil"),
    ("leech", "shellRelic", (255, 104, 132), "leech"),
    ("sentinel", "diverKnight", (151, 201, 255), "guard"),
    ("ray", "whaleBoss", (108, 222, 255), "ray"),
    ("hound", "orbEngine", (255, 112, 128), "hound"),
    ("page", "bookRelic", (178, 228, 255), "page"),
    ("drone", "tankDrone", (246, 193, 119), "drone"),
    ("squid", "squid", (173, 136, 255), "tentacle"),
    ("mite", "crab", (246, 193, 119), "mite"),
    ("diver", "player", (129, 220, 255), "bell"),
    ("jelly", "orbSpirit", (182, 246, 255), "jelly"),
    ("bailiff", "diverKnight", (246, 193, 119), "seal"),
    ("engine", "roundRelic", (255, 116, 93), "engine"),
    ("knight", "diverKnight", (242, 214, 143), "lance"),
    ("cantor", "gateBoss", (255, 121, 173), "virus"),
    ("colossus", "orbEngine", (246, 193, 119), "anchor"),
    ("cataloger", "gateBoss", (132, 218, 255), "catalog"),
    ("algorithm", "whaleBoss", (184, 146, 255), "algorithm"),
    ("lastgate", "redBoss", (255, 75, 94), "gate"),
]


def rgba(color, alpha):
    return (*color, alpha)


def cell_crop(source, cell_name):
    col, row = SOURCE_CELLS[cell_name]
    crop = source.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL)).convert("RGBA")
    box = SOURCE_FOCUS_BOXES.get(cell_name)
    if not box:
        return crop
    focused = crop.crop(box)
    scale = min(CELL / focused.width, CELL / focused.height)
    width = int(focused.width * scale)
    height = int(focused.height * scale)
    focused = focused.resize((width, height), Image.Resampling.LANCZOS)
    centered = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    centered.alpha_composite(focused, ((CELL - width) // 2, (CELL - height) // 2))
    return centered


def raw_source_crop(source, cell_name, box=None):
    col, row = SOURCE_CELLS[cell_name]
    base = (col * CELL, row * CELL)
    if box is None:
        box = SOURCE_FOCUS_BOXES.get(cell_name, (0, 0, CELL, CELL))
    left, top, right, bottom = box
    return source.crop((base[0] + left, base[1] + top, base[0] + right, base[1] + bottom)).convert("RGBA")


def subject_mask(image):
    mask = Image.new("L", image.size, 0)
    pixels = image.convert("RGBA").load()
    out = mask.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
            saturation = max(r, g, b) - min(r, g, b)
            if (luma > 46 and saturation > 8) or (luma > 30 and saturation > 42):
                out[x, y] = 255
    mask = mask.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(1.1))
    return mask


def significant_mask_components(mask):
    binary = mask.point(lambda value: 255 if value > 0 else 0)
    pixels = binary.load()
    width, height = binary.size
    visited = set()
    components = []
    for start_y in range(height):
        for start_x in range(width):
            if pixels[start_x, start_y] == 0 or (start_x, start_y) in visited:
                continue
            stack = [(start_x, start_y)]
            visited.add((start_x, start_y))
            component = []
            while stack:
                x, y = stack.pop()
                component.append((x, y))
                for nx in (x - 1, x, x + 1):
                    for ny in (y - 1, y, y + 1):
                        if nx < 0 or ny < 0 or nx >= width or ny >= height:
                            continue
                        if (nx, ny) in visited or pixels[nx, ny] == 0:
                            continue
                        visited.add((nx, ny))
                        stack.append((nx, ny))
            components.append(component)
    if not components:
        return binary
    largest_area = max(len(component) for component in components)
    min_area = max(18, int(largest_area * 0.025))
    clean = Image.new("L", binary.size, 0)
    draw = ImageDraw.Draw(clean)
    for component in components:
        xs = [point[0] for point in component]
        ys = [point[1] for point in component]
        area = len(component)
        cx = sum(xs) / area
        cy = sum(ys) / area
        touches_edge = min(xs) <= 2 or max(xs) >= width - 3 or min(ys) <= 2 or max(ys) >= height - 3
        centered = width * 0.12 <= cx <= width * 0.88 and height * 0.02 <= cy <= height * 0.98
        if area >= min_area and (centered or area >= largest_area * 0.16) and not (touches_edge and area < largest_area * 0.12):
            for point in component:
                draw.point(point, fill=255)
    return clean


def transparent_subject(source, cell_name, box=None):
    crop = raw_source_crop(source, cell_name, box)
    crop = ImageEnhance.Contrast(crop).enhance(1.08)
    crop = ImageEnhance.Color(crop).enhance(1.16)
    mask = subject_mask(crop)
    bbox = mask.point(lambda value: 255 if value > 14 else 0).getbbox()
    if not bbox:
        bbox = (0, 0, crop.width, crop.height)
    pad = 10
    left = max(0, bbox[0] - pad)
    top = max(0, bbox[1] - pad)
    right = min(crop.width, bbox[2] + pad)
    bottom = min(crop.height, bbox[3] + pad)
    crop = crop.crop((left, top, right, bottom))
    mask = mask.crop((left, top, right, bottom))
    alpha = mask.point(lambda value: 0 if value < 10 else min(255, value))
    crop.putalpha(alpha)
    return crop


def compose_combat_sprite(source, sprite, source_cell, accent, tier, index):
    override = COMBAT_SOURCE_OVERRIDES.get(sprite, {})
    crop = transparent_subject(source, source_cell, override.get("box"))
    target = Image.new("RGBA", (COMBAT_CELL, COMBAT_CELL), (0, 0, 0, 0))
    scale_limit = 0.84 if tier == "boss" else 0.78 if tier == "elite" else 0.72
    scale_limit *= override.get("scale", 1.0)
    max_width = int(COMBAT_CELL * min(0.92, scale_limit + 0.14))
    max_height = int(COMBAT_CELL * min(0.9, scale_limit + 0.16))
    scale = min(max_width / max(1, crop.width), max_height / max(1, crop.height))
    width = max(1, int(crop.width * scale))
    height = max(1, int(crop.height * scale))
    crop = crop.resize((width, height), Image.Resampling.LANCZOS)
    shadow = Image.new("RGBA", (COMBAT_CELL, COMBAT_CELL), (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow)
    draw.ellipse(
        (
            COMBAT_CELL / 2 - width * 0.34,
            COMBAT_CELL - 36,
            COMBAT_CELL / 2 + width * 0.34,
            COMBAT_CELL - 12,
        ),
        fill=(0, 0, 0, 116),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(5))
    target.alpha_composite(shadow)
    x = (COMBAT_CELL - width) // 2
    y = COMBAT_CELL - height - (24 if tier == "boss" else 22)
    target.alpha_composite(crop, (x, y))
    glow = Image.new("RGBA", (COMBAT_CELL, COMBAT_CELL), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((42, COMBAT_CELL - 82, COMBAT_CELL - 42, COMBAT_CELL - 2), outline=rgba(accent, 48), width=2)
    gd.line((COMBAT_CELL / 2, 26, COMBAT_CELL / 2, COMBAT_CELL - 42), fill=rgba(accent, 28), width=2)
    glow = glow.filter(ImageFilter.GaussianBlur(1.3))
    return Image.alpha_composite(target, glow)


def compose_player_sprite(source):
    crop = transparent_subject(source, "player", (30, 0, 218, 256))
    target = Image.new("RGBA", (COMBAT_CELL, COMBAT_CELL), (0, 0, 0, 0))
    scale = min((COMBAT_CELL * 0.7) / max(1, crop.width), (COMBAT_CELL * 0.9) / max(1, crop.height))
    crop = crop.resize((max(1, int(crop.width * scale)), max(1, int(crop.height * scale))), Image.Resampling.LANCZOS)
    shadow = Image.new("RGBA", (COMBAT_CELL, COMBAT_CELL), (0, 0, 0, 0))
    draw = ImageDraw.Draw(shadow)
    draw.ellipse((82, COMBAT_CELL - 42, COMBAT_CELL - 82, COMBAT_CELL - 12), fill=(0, 0, 0, 124))
    shadow = shadow.filter(ImageFilter.GaussianBlur(6))
    target.alpha_composite(shadow)
    target.alpha_composite(crop, ((COMBAT_CELL - crop.width) // 2, COMBAT_CELL - crop.height - 24))
    return target


def normalize_crop(crop, accent, tier_boost=1.0):
    crop = ImageEnhance.Contrast(crop).enhance(1.08)
    crop = ImageEnhance.Color(crop).enhance(1.16)
    alpha = Image.new("L", crop.size, 255)
    mask = Image.new("L", crop.size, 0)
    md = ImageDraw.Draw(mask)
    md.ellipse((8, 8, CELL - 8, CELL - 6), fill=255)
    crop.putalpha(Image.composite(alpha, Image.new("L", crop.size, 0), mask))

    tinted = Image.new("RGBA", crop.size, rgba(accent, int(20 * tier_boost)))
    return Image.alpha_composite(crop, tinted)


def background(accent, seed, tier):
    image = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, CELL, CELL), fill=(4, 12, 17, 206))
    for radius, alpha in [(118, 30), (82, 42), (46, 54)]:
        draw.ellipse((CELL / 2 - radius, 38 - radius / 2, CELL / 2 + radius, 38 + radius * 1.5), fill=rgba(accent, alpha))
    draw.rectangle((0, CELL - 54, CELL, CELL), fill=(2, 7, 10, 166))
    for x in range(-16, CELL + 24, 32):
        offset = (seed % 17) - 8
        draw.line((x + offset, CELL - 42, x + 48 + offset, CELL - 12), fill=rgba(accent, 26), width=1)
    border = rgba(accent, 120 if tier == "boss" else 78)
    draw.rounded_rectangle((9, 9, CELL - 9, CELL - 9), radius=16, outline=border, width=2)
    return image


def draw_motif(draw, motif, accent, rng, tier):
    low = (5, 12, 18, 190)
    bright = rgba(accent, 150 if tier == "boss" else 118)
    soft = rgba(accent, 76)
    if motif in {"scan", "catalog", "page"}:
        for y in [70, 98, 126, 154]:
            draw.line((44, y, 212, y + rng.randint(-4, 4)), fill=soft, width=2)
        for x in [58, 198]:
            draw.line((x, 46, x + rng.randint(-10, 10), 208), fill=bright, width=2)
    elif motif in {"claw", "mite"}:
        for side in [-1, 1]:
            cx = 128 + side * 68
            draw.arc((cx - 42, 88, cx + 42, 186), 210 if side < 0 else -30, 30 if side < 0 else 210, fill=bright, width=5)
            draw.line((cx, 158, 128 + side * 22, 198), fill=soft, width=4)
    elif motif in {"spark", "jelly"}:
        for i in range(10):
            x = rng.randint(36, 220)
            y = rng.randint(38, 202)
            r = rng.randint(2, 6)
            draw.ellipse((x - r, y - r, x + r, y + r), outline=bright, width=1)
    elif motif in {"choir", "virus"}:
        for i in range(7):
            x = 44 + i * 28
            draw.line((x, 202, x + rng.randint(-12, 12), 68 + rng.randint(-12, 18)), fill=soft, width=3)
            draw.ellipse((x - 5, 58, x + 5, 70), fill=bright)
    elif motif in {"coil", "tentacle"}:
        for i in range(4):
            x0 = 36 + i * 52
            points = []
            for t in range(9):
                points.append((x0 + math.sin(t * 0.9 + i) * 18, 206 - t * 18))
            draw.line(points, fill=bright, width=4)
    elif motif in {"guard", "seal", "lance"}:
        draw.polygon([(128, 34), (202, 92), (176, 206), (80, 206), (54, 92)], outline=bright, fill=None)
        draw.line((128, 44, 128, 212), fill=soft, width=3)
        if motif == "lance":
            draw.line((62, 194, 194, 54), fill=bright, width=4)
    elif motif == "ray":
        draw.polygon([(34, 126), (128, 64), (222, 126), (128, 190)], outline=bright, fill=(0, 0, 0, 0))
        draw.line((128, 64, 128, 190), fill=soft, width=2)
    elif motif == "hound":
        draw.line((54, 170, 104, 104, 152, 128, 206, 82), fill=bright, width=5)
        draw.line((78, 176, 74, 214), fill=soft, width=4)
        draw.line((154, 152, 170, 212), fill=soft, width=4)
    elif motif in {"drone", "engine", "algorithm"}:
        for r in [34, 58, 84]:
            draw.ellipse((128 - r, 128 - r, 128 + r, 128 + r), outline=soft, width=2)
        for angle in range(0, 360, 45):
            x = 128 + math.cos(math.radians(angle)) * 86
            y = 128 + math.sin(math.radians(angle)) * 86
            draw.line((128, 128, x, y), fill=soft, width=1)
    elif motif == "bell":
        draw.arc((68, 58, 188, 218), 180, 360, fill=bright, width=5)
        draw.line((76, 138, 62, 210), fill=soft, width=4)
        draw.line((180, 138, 194, 210), fill=soft, width=4)
    elif motif in {"anchor", "gate"}:
        draw.line((128, 34, 128, 220), fill=bright, width=7)
        draw.arc((62, 110, 194, 242), 18, 162, fill=soft, width=5)
        draw.line((92, 184, 62, 152), fill=soft, width=4)
        draw.line((164, 184, 194, 152), fill=soft, width=4)
    else:
        draw.ellipse((54, 54, 202, 202), outline=bright, width=3)
        draw.line((54, 128, 202, 128), fill=soft, width=2)
    if tier == "boss":
        draw.rectangle((22, 218, 234, 224), fill=bright)
    else:
        draw.line((48, 224, 208, 224), fill=rgba(accent, 82), width=2)
    draw.ellipse((48, 216, 208, 244), fill=low)


def compose_cell(source, sprite, source_cell, accent, motif, tier, index):
    seed = sum(ord(ch) for ch in sprite) + index * 97
    rng = random.Random(seed)
    canvas = background(accent, seed, tier)
    draw = ImageDraw.Draw(canvas)
    draw_motif(draw, motif, accent, rng, tier)
    crop = normalize_crop(cell_crop(source, source_cell), accent, 1.25 if tier == "boss" else 1.0)
    scale = 0.84 if tier == "boss" else 0.78 if tier == "elite" else 0.72
    if source_cell in {"bookRelic", "roundRelic", "shellRelic", "tubeRelic", "coralRelic"}:
        scale += 0.08
    crop = crop.resize((int(CELL * scale), int(CELL * scale)), Image.Resampling.LANCZOS)
    shadow = crop.copy()
    shadow_alpha = shadow.getchannel("A").filter(ImageFilter.GaussianBlur(8))
    shadow.putalpha(shadow_alpha)
    shadow = ImageEnhance.Brightness(shadow).enhance(0.1)
    x = (CELL - crop.width) // 2 + rng.randint(-6, 6)
    y = 32 + rng.randint(-4, 8)
    canvas.alpha_composite(shadow, (x, y + 18))
    canvas.alpha_composite(crop, (x, y))
    top_glow = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    gd = ImageDraw.Draw(top_glow)
    gd.ellipse((36, 20, 220, 198), outline=rgba(accent, 44), width=2)
    top_glow = top_glow.filter(ImageFilter.GaussianBlur(1.2))
    return Image.alpha_composite(canvas, top_glow)


def tier_for(sprite):
    if sprite in {"cataloger", "algorithm", "lastgate"}:
        return "boss"
    if sprite in {"bailiff", "engine", "knight", "cantor", "colossus"}:
        return "elite"
    return "normal"


def main():
    source = Image.open(SRC).convert("RGBA")
    sheet = Image.new("RGBA", (COLS * CELL, ROWS * CELL), (0, 0, 0, 0))
    combat_sheet = Image.new("RGBA", (COLS * COMBAT_CELL, ROWS * COMBAT_CELL), (0, 0, 0, 0))
    COMBATANT_DIR.mkdir(parents=True, exist_ok=True)
    for index, (sprite, source_cell, accent, motif) in enumerate(ENEMIES):
        row, col = divmod(index, COLS)
        cell = compose_cell(source, sprite, source_cell, accent, motif, tier_for(sprite), index)
        sheet.alpha_composite(cell, (col * CELL, row * CELL))
        combat_cell = compose_combat_sprite(source, sprite, source_cell, accent, tier_for(sprite), index)
        combat_sheet.alpha_composite(combat_cell, (col * COMBAT_CELL, row * COMBAT_CELL))
        combat_cell.save(COMBATANT_DIR / f"enemy-{sprite}.png")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT)
    combat_sheet.save(COMBAT_OUT)
    compose_player_sprite(source).save(PLAYER_OUT)
    print(f"Wrote {OUT}")
    print(f"Wrote {COMBAT_OUT}")
    print(f"Wrote {PLAYER_OUT}")


if __name__ == "__main__":
    main()
