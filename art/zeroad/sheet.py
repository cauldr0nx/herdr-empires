#!/usr/bin/env python3
"""Contact sheet for reviewing the zeroad pack (output is gitignored).

  sheet.py --pack mods/empires/packs/zeroad --out art/out/zeroad-sheet.png

Top: a small map scene laid out the way the world role would draw it
(terrain diamonds, buildings, nature, villagers sorted by foot y), all at
final size. Bottom: every villager animation (row 0 = S, frame strip),
the eight player colours, terrain tiles and UI icons.
"""
import argparse
import json
import os

from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument("--pack", required=True)
ap.add_argument("--out", required=True)
a = ap.parse_args()
P = a.pack
pack = json.load(open(os.path.join(P, "pack.json")))
TW, TH = pack["tile"]
E = pack["entities"]
img_cache = {}


def img(rel):
    if rel not in img_cache:
        img_cache[rel] = Image.open(os.path.join(P, rel)).convert("RGBA")
    return img_cache[rel]


def sheet_frame(ent, anim, color, d, i):
    an = E[ent]["anims"][anim]
    fw, fh = E[ent]["frame"]
    s = img(an["sheet"].format(color=color))
    return s.crop((i * fw, d * fh, (i + 1) * fw, (d + 1) * fh))


# ---------------------------------------------------------------- map scene
N = 14
SW, SH = N * TW + 80, N * TH + 260
scene = Image.new("RGBA", (SW, SH), (20, 22, 18, 255))
ox, oy = SW // 2, 200


def tile_xy(i, j):  # top-left of the tile's bounding box
    return ox + (i - j) * TW // 2 - TW // 2, oy + (i + j) * TH // 2


def foot(i, j):  # centre of tile (i, j)
    x, y = tile_xy(i, j)
    return x + TW // 2, y + TH // 2


forest = {(i, j) for i in range(N) for j in range(N) if i + j <= 5}
dirt = {(i, j) for i in range(N) for j in range(N) if abs(i - 7) + abs(j - 7) <= 3}
ground = pack["terrain"].get("ground")
if ground:
    g = img(ground)
    gw, gh = g.size
    for yy in range(0, SH, gh):
        for xx in range(0, SW, gw):
            scene.alpha_composite(g, (xx, yy))
for j in range(N):
    for i in range(N):
        if ground:
            break
        kind = "forest_floor" if (i, j) in forest else "dirt" if (i, j) in dirt else "grass"
        tiles = pack["terrain"][kind]
        t = img(tiles[(i * 7 + j * 3) % len(tiles)] if kind != "dirt" else tiles[0])
        scene.alpha_composite(t, tile_xy(i, j))

sprites = []  # (foot_y, foot_x, image, anchor)
if "dirt_patch" in E:
    dp = E["dirt_patch"]
    for k, (i, j, sc) in enumerate([(7, 7, 1.6), (3, 6, 0.8), (11, 10, 0.8)]):
        im = img(dp["variants"][k % len(dp["variants"])])
        im = im.resize((int(im.width * sc), int(im.height * sc)), Image.LANCZOS)
        fx, fy = foot(i, j)
        scene.alpha_composite(im, (int(fx - im.width / 2), int(fy - im.height / 2)))


def put(image, anchor, fx, fy):
    sprites.append((fy, fx, image, anchor))


def static(ent, i, j, color="blue", variant=0, dx=0, dy=0):
    e = E[ent]
    rel = e["variants"][variant] if "variants" in e else e["image"]
    fx, fy = foot(i, j)
    put(img(rel.format(color=color)), e["anchor"], fx + dx, fy + dy)


static("town_center", 7, 7, "blue")
static("house", 10, 5, "blue", 0)
static("house", 4, 10, "blue", 1)
static("lumber_camp", 3, 6, "blue")
static("mining_camp", 11, 10, "red")
static("monastery", 11, 2, "blue")
static("mill", 3, 12, "blue")
static("university", 12, 13, "red")
for k, (i, j) in enumerate([(0, 0), (1, 0), (0, 2), (2, 1), (1, 3), (3, 0), (0, 4), (2, 3), (4, 1)]):
    static("tree", i, j, variant=k % len(E["tree"]["variants"]), dx=(k * 7) % 11 - 5, dy=(k * 5) % 7 - 3)
static("gold_mine", 13, 7)
static("stone_mine", 8, 13)
static("berry_bush", 6, 11)
static("berry_bush", 7, 12, dx=10)

vfw, vfh = E["villager"]["frame"]
vanc = E["villager"]["anchor"]
units = [("walk", "blue", 1, 2, 7, 4), ("gather_wood", "blue", 2, 5, 2, 3), ("carry", "blue", 6, 3, 4, 5),
         ("gather_gold", "red", 6, 7, 12, 7), ("idle", "blue", 0, 0, 8, 9), ("idle", "green", 7, 2, 9, 9),
         ("build", "yellow", 3, 4, 10, 4), ("walk", "purple", 4, 6, 9, 11), ("idle", "orange", 0, 3, 6, 10)]
looks = pack.get("unitLooks", ["villager"])
for k, (anim, color, d, fr, i, j) in enumerate(units):
    look = looks[k % len(looks)]
    an = E[look]["anims"][anim]
    fx, fy = foot(i, j)
    put(sheet_frame(look, anim, color, d % an["dirs"], fr % an["frames"]), E[look]["anchor"], fx, fy)

for fy, fx, im, (ax, ay) in sorted(sprites, key=lambda s: (s[0], s[1])):
    scene.alpha_composite(im, (int(fx - ax), int(fy - ay)))

# ---------------------------------------------------------------- strips
rows = []
for anim, an in E["villager"]["anims"].items():
    strip = Image.new("RGBA", (vfw * an["frames"] + 8 * vfw + 20, vfh), (0, 0, 0, 0))
    for i in range(an["frames"]):
        strip.alpha_composite(sheet_frame("villager", anim, "blue", 0, i), (i * vfw, 0))
    for d in range(an["dirs"]):
        strip.alpha_composite(sheet_frame("villager", anim, "red", d, 0), (an["frames"] * vfw + 20 + d * vfw, 0))
    rows.append((anim, strip))
for look in looks[1:]:
    an = E[look]["anims"]
    strip = Image.new("RGBA", (vfw * 30, vfh), (0, 0, 0, 0))
    x = 0
    for anim in ("idle", "walk", "gather_wood", "gather_gold", "carry", "build"):
        for d in (0, 2, 5):
            strip.alpha_composite(sheet_frame(look, anim, "blue", d, an[anim]["frames"] // 2), (x, 0))
            x += vfw
        x += 6
    rows.append((look, strip))
colors = Image.new("RGBA", (vfw * 8, vfh), (0, 0, 0, 0))
for k, c in enumerate(pack["playerColors"]):
    colors.alpha_composite(sheet_frame("villager", "idle", c, 0, 0), (k * vfw, 0))
tc = E["town_center"]
tcs = Image.new("RGBA", (tc["size"][0] // 2 * 4, tc["size"][1] // 2 * 2), (0, 0, 0, 0))
for k, c in enumerate(pack["playerColors"]):
    t = img(tc["image"].format(color=c)).resize((tc["size"][0] // 2, tc["size"][1] // 2), Image.LANCZOS)
    tcs.alpha_composite(t, ((k % 4) * (tc["size"][0] // 2), (k // 4) * (tc["size"][1] // 2)))
icons = Image.new("RGBA", (900, 140), (0, 0, 0, 0))
x = 0
for k in ("food", "wood", "gold", "stone", "population"):
    im = img(pack["ui"][k])
    icons.alpha_composite(im, (x, 0))
    x += im.width + 8
for k, rel in pack["ui"]["portraits"].items():
    im = img(rel)
    icons.alpha_composite(im, (x, 0))
    x += im.width + 8
tiles = Image.new("RGBA", (TW * 8, TH), (0, 0, 0, 0))
x = 0
for kind, lst in pack["terrain"].items():
    if kind.startswith("ground") or not isinstance(lst, list):
        continue
    for rel in lst:
        tiles.alpha_composite(img(rel), (x, 0))
        x += TW

H = scene.height + sum(r.height + 6 for _, r in rows) + colors.height + tcs.height + icons.height + tiles.height + 80
W = max(scene.width, tcs.width + 20, max(r.width for _, r in rows) + 110)
out = Image.new("RGBA", (W, H), (58, 64, 52, 255))
out.alpha_composite(scene, (0, 0))
dr = ImageDraw.Draw(out)
y = scene.height + 10
for anim, r in rows:
    dr.text((4, y + r.height // 2), anim, fill=(240, 230, 200, 255))
    out.alpha_composite(r, (100, y))
    y += r.height + 6
out.alpha_composite(colors, (100, y))
y += colors.height + 10
out.alpha_composite(tiles, (100, y))
y += tiles.height + 10
out.alpha_composite(icons, (100, y))
y += icons.height + 10
out.alpha_composite(tcs, (10, y))
# Gallery: every building / nature image at final size on the ground.
gal_names = [n for n, e in E.items() if "anims" not in e]
items = []
for n in gal_names:
    e = E[n]
    for k, rel in enumerate(e.get("variants") or [e["image"]]):
        items.append((f"{n}" + (f" #{k}" if "variants" in e else ""), img(rel.format(color="red")), e))
GW = 1424
x = y = 0
rowh = 0
placed = []
for label, im, e in items:
    if x + im.width > GW:
        x, y = 0, y + rowh + 16
        rowh = 0
    placed.append((label, im, x, y))
    x += im.width + 6
    rowh = max(rowh, im.height)
gal = Image.new("RGBA", (GW, y + rowh + 16), (0, 0, 0, 255))
if ground:
    for yy in range(0, gal.height, img(ground).height):
        for xx in range(0, GW, img(ground).width):
            gal.alpha_composite(img(ground), (xx, yy))
gd = ImageDraw.Draw(gal)
for label, im, x0, y0 in placed:
    gal.alpha_composite(im, (x0, y0))
    gd.text((x0 + 2, y0 + im.height), label + f" {im.width}x{im.height}", fill=(255, 255, 255, 255))
big = Image.new("RGBA", (max(out.width, GW), out.height + gal.height + 10), (58, 64, 52, 255))
big.alpha_composite(out, (0, 0))
big.alpha_composite(gal, (0, out.height + 10))
out = big
if ground:
    g = img(ground)
    t3 = Image.new("RGBA", (g.width * 3, g.height * 3))
    for i in range(3):
        for j in range(3):
            t3.alpha_composite(g, (i * g.width, j * g.height))
    t3 = t3.resize((t3.width // 3, t3.height // 3), Image.LANCZOS)
    big = Image.new("RGBA", (max(out.width, t3.width), out.height + t3.height + 10), (58, 64, 52, 255))
    big.alpha_composite(out, (0, 0))
    big.alpha_composite(t3, (0, out.height + 10))
    ImageDraw.Draw(big).text((6, out.height + 14), "ground.png tiled 3x3 (shown at 1/3)", fill=(255, 255, 255, 255))
    out = big
os.makedirs(os.path.dirname(a.out), exist_ok=True)
out.convert("RGB").save(a.out)
print("wrote", a.out, out.size)
