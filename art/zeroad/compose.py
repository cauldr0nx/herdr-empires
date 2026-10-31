#!/usr/bin/env python3
"""Turn rendered frames into the shipped pack (SPEC §18.5 steps 4-6).

  compose.py --frames art/out/zeroad-frames --out mods/empires/packs/zeroad \
             [--sheet art/out/zeroad-sheet.png]

* tints each frame with the 8 player colours (multiplying in linear light by
  mix(playerColor, 1, mask), the same formula as 0 A.D.'s model shader),
* downsamples the 2x renders with premultiplied alpha,
* crops every entity to one shared box (all frames of a unit share a frame
  size and foot anchor) and packs per-animation sheets,
* cuts seamless 2:1 diamond terrain tiles from 0 A.D. terrain textures,
* copies UI icons and portraits,
* writes pack.json and pack.manifest.json.

Needs Python 3 with Pillow and NumPy (no Blender).
"""
import argparse
import json
import os
import shutil
import subprocess

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
ART_REL = "binaries/data/mods/public/art"
ART = os.path.join(ROOT, "art/sources/zeroad/0ad", ART_REL)
SS = 2

PLAYER_COLORS = {
    "blue": "#3561d9", "red": "#d23a2f", "green": "#3e9e48", "yellow": "#e2c13a",
    "cyan": "#3cb3bf", "purple": "#8a4fc2", "gray": "#9b9b9b", "orange": "#e3802c",
}
DIR_NAMES = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"]
TILE = (96, 48)

# Pack entity name -> rendered entities (several = variants on one canvas).
# "role" notes which 0 A.D. building stands in for an AoE-style one.
BUILDINGS = {
    "town_center": (["town_center"], "Briton civic centre"),
    "house":       (["house", "house_b", "house_gaul_0", "house_gaul_1"], "Briton house (2 variants) and Gaul house (2 variants)"),
    "lumber_camp": (["storehouse"], "Briton storehouse"),
    "mining_camp": (["storehouse"], "Briton storehouse"),
    "mill":        (["farmstead"], "Celtic farmstead"),
    "monastery":   (["temple"], "Celtic temple"),
    "university":  (["barracks"], "Briton barracks"),
    # progression
    "market":        (["market"], "Briton market"),
    "blacksmith":    (["blacksmith"], "Briton blacksmith"),
    "defense_tower": (["defense_tower"], "Briton wooden (defense) tower"),
    "sentry_tower":  (["sentry_tower"], "Briton scout tower"),
    "field":         (["field"], "0 A.D. farmland plot (flat ground decal)"),
    "corral":        (["corral"], "Briton corral"),
    "fortress":      (["fortress_gaul", "fortress"], "Gaul fortress (variant 0, walled, castle-like) and Briton fortress / broch (variant 1)"),
    "wonder":        (["wonder"], "Briton wonder (ring fort), rendered at a smaller scale"),
    "palisade":      (["palisade"], "0 A.D. rock-footed palisade, one straight segment"),
    "palisade_corner": (["palisade_corner"], "0 A.D. rock-footed palisade, curved corner"),
    "gate":          (["gate"], "0 A.D. palisade gate"),
}
UNIT_LOOKS = ["villager", "villager_b", "villager_c", "villager_d", "villager_e", "villager_f"]
LOOK_SOURCES = {
    "villager": "Celtic female citizen",
    "villager_b": "Briton citizen spearman, as unarmed worker",
    "villager_c": "Gaul citizen swordsman, as unarmed worker",
    "villager_d": "Iberian citizen spearman, as unarmed worker",
    "villager_e": "Roman servus (tunic), as unarmed worker",
    "villager_f": "Celtic female citizen, second dress/hair variant",
}
GAIA = {
    "tree": ["tree_0", "tree_1", "tree_2", "tree_3", "tree_4", "tree_5", "tree_6"],
    "gold_mine": ["gold_mine"],
    "stone_mine": ["stone_mine"],
    "berry_bush": ["berry_bush", "berry_bush_1"],
    "rocks": ["rocks_0", "rocks_1", "rocks_2"],
    "bush": ["bush_0", "bush_1"],
    "tuft": ["tuft_0", "tuft_1", "tuft_2"],
}
FAUNA = ["sheep", "boar", "chicken"]
DECOR = ["rocks", "bush", "tuft"]
# Wall pieces (rendered by render.py's wall mode). Segments and gates are cut
# into seamless slices; posts/towers are ordinary statics.
WALLS = {
    "palisade": {"a": "palisade_a", "b": "palisade_b", "corner": "palisade_post",
                 "gateA": "palisade_gate_a", "gateB": "palisade_gate_b"},
    "stone": {"a": "wall_a", "b": "wall_b", "corner": "wall_tower",
              "gateA": "wall_gate_a", "gateB": "wall_gate_b"},
}
def file_name(pack_entity):
    return pack_entity.replace("_", "-")

manifest = {}


def note(out_rel, sources, notes=""):
    manifest[out_rel] = {
        "source": "0 A.D. (rendered/derived)",
        "sources": sorted(set(sources)),
        "author": "Wildfire Games",
        "url": "https://github.com/0ad/0ad",
        "license": "CC-BY-SA-3.0",
        "modified": True,
        "generator": "art/zeroad/build.sh",
        "notes": notes,
    }


# ------------------------------------------------------------------ colour
def srgb2lin(x):
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def lin2srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def hex_lin(h):
    return srgb2lin(np.array([int(h[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]))


def load_frame(d, i):
    rgba = np.array(Image.open(os.path.join(d, f"rgba_{i:02d}.png")).convert("RGBA"), dtype=np.float64) / 255.0
    mp = os.path.join(d, f"mask_{i:02d}.png")
    mask = np.asarray(Image.open(mp).convert("L"), dtype=np.float64) / 255.0 if os.path.exists(mp) else np.zeros(rgba.shape[:2])
    # The shadow catcher also records faint sky occlusion over the whole frame
    # (alpha ~6/255, pure black). Lift that floor on shadow-only pixels.
    shadow = rgba[..., :3].max(axis=-1) < 10 / 255
    floor = 14 / 255
    rgba[..., 3] = np.where(shadow, np.clip((rgba[..., 3] - floor) / (1 - floor), 0, 1), rgba[..., 3])
    return rgba, mask


def tint(rgba, mask, color):
    """Multiply the player colour in, in linear light. color=None -> untinted."""
    out = rgba.copy()
    if color is None:
        return out
    a = rgba[..., 3]
    # The mask AOV is coverage-weighted at edges; undo that.
    m = np.where(a > 1e-3, np.clip(mask / np.maximum(a, 1e-3), 0, 1), 0)[..., None]
    lin = srgb2lin(rgba[..., :3])
    f = (1 - m) + m * hex_lin(PLAYER_COLORS[color])[None, None, :]
    out[..., :3] = lin2srgb(lin * f)
    return out


def downsample(rgba, k=SS):
    h, w = rgba.shape[:2]
    h2, w2 = h // k, w // k
    x = rgba[:h2 * k, :w2 * k]
    a = x[..., 3:4]
    pre = np.concatenate([x[..., :3] * a, a], axis=-1)
    pre = pre.reshape(h2, k, w2, k, 4).mean(axis=(1, 3))
    a2 = pre[..., 3:4]
    rgb = np.where(a2 > 1e-6, pre[..., :3] / np.maximum(a2, 1e-6), 0)
    return np.concatenate([rgb, a2], axis=-1)


def to_img(arr):
    return Image.fromarray(np.clip(np.round(arr * 255), 0, 255).astype(np.uint8), "RGBA")


def alpha_box(arrs, thresh=3 / 255):
    x0 = y0 = 10 ** 9
    x1 = y1 = -1
    for a in arrs:
        ys, xs = np.nonzero(a[..., 3] > thresh)
        if len(xs):
            x0, x1 = min(x0, xs.min()), max(x1, xs.max())
            y0, y1 = min(y0, ys.min()), max(y1, ys.max())
    return x0, y0, x1 + 1, y1 + 1


def save_png(img, path, quantize=False):
    """quantize: 256-colour palette PNG via libimagequant (if Pillow has it);
    visually lossless for these sprites and ~3x smaller."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if quantize:
        from PIL import features
        method = Image.Quantize.LIBIMAGEQUANT if features.check_feature("libimagequant") else Image.Quantize.FASTOCTREE
        img = img.quantize(256, method=method, dither=Image.Dither.FLOYDSTEINBERG)
    img.save(path, optimize=True)


# ------------------------------------------------------------------ units
def compose_unit(name, frames_dir, out, pack_name="villager", colored=True, folder="units"):
    meta = json.load(open(os.path.join(frames_dir, name, "meta.json")))
    sources = sources_for(name)
    # Pass 1: downsample everything once (untinted + mask) and find the union box.
    cache = {}
    for anim, am in meta["anims"].items():
        for d in range(am["dirs"]):
            for i in range(am["frames"]):
                rgba, mask = load_frame(os.path.join(frames_dir, name, anim, f"d{d}"), i)
                cache[(anim, d, i)] = (rgba, mask)
    box_src = [downsample(r) for r, _ in cache.values()]
    x0, y0, x1, y1 = alpha_box(box_src)
    x0, y0 = max(0, x0 - 1), max(0, y0 - 1)
    fw, fh = int(x1 - x0 + 1), int(y1 - y0 + 1)
    x0, y0 = int(x0), int(y0)
    foot = [round(meta["foot"][0] - x0), round(meta["foot"][1] - y0)]
    ent = {"anchor": foot, "frame": [fw, fh], "anims": {},
           "source": f"0 A.D. actor {meta['actor']}", "scale_px_per_m": meta["scale_px_per_m"]}
    for anim, am in meta["anims"].items():
        n, dirs = am["frames"], am["dirs"]
        rel = f"{folder}/{pack_name}-{anim.replace('_', '-')}" + ("-{color}.png" if colored else ".png")
        for color in (PLAYER_COLORS if colored else [None]):
            sheet = np.zeros((fh * dirs, fw * n, 4))
            for d in range(dirs):
                for i in range(n):
                    rgba, mask = cache[(anim, d, i)]
                    fr = downsample(tint(rgba, mask, color))[y0:y0 + fh, x0:x0 + fw]
                    sheet[d * fh:d * fh + fr.shape[0], i * fw:i * fw + fr.shape[1]] = fr
            orel = rel.format(color=color) if colored else rel
            save_png(to_img(sheet), os.path.join(out, orel), quantize=True)
            note(orel, sources + ["animation/" + am["animation"]],
                 f"{anim}: {dirs} rows (directions {','.join(DIR_NAMES[:dirs])}) x {n} frames, {fw}x{fh} px each"
                 + (f"; player colour {color}" if color else ""))
        ent["anims"][anim] = {"fps": am["fps"], "dirs": dirs, "frames": n, "sheet": rel}
    if not colored:
        ent["playerColor"] = False
    return ent


# ------------------------------------------------------------------ walls
def compose_wall_slice(name, frames_dir, out):
    """Cut a wall segment/gate out of its flanked render as an exact slice.

    The render shows the piece between copies of the neighbouring segment, so
    geometry and shadows are continuous. The slice is the vertical strip
    tiles*48 px wide centred on the piece's ground midpoint (an exact pixel);
    strips of consecutive pieces placed (+-48, +-24) apart tile with no gap or
    overlap. Returns entity dict."""
    meta = json.load(open(os.path.join(frames_dir, name, "meta.json")))
    rgba, mask = load_frame(os.path.join(frames_dir, name, "static", "d0"), 0)
    tiles = meta["tiles"]
    fx, fy = (int(round(v)) for v in meta["foot"])
    half = tiles * 24
    colored = mask.max() > 0.1
    rel = f"walls/{file_name(name)}" + ("-{color}.png" if colored else ".png")
    box = None
    imgs = {}
    for color in (PLAYER_COLORS if colored else [None]):
        small = downsample(tint(rgba, mask, color))
        strip = small[:, fx - half:fx + half]
        imgs[color] = strip
        if box is None:
            _, y0, _, y1 = alpha_box([strip])
            box = (y0, y1)
    y0, y1 = box
    for color, strip in imgs.items():
        orel = rel.format(color=color) if colored else rel
        save_png(to_img(strip[y0:y1]), os.path.join(out, orel), quantize=True)
        note(orel, sources_for(name) + sources_for_flank(name),
             f"0 A.D. actor {meta['actor']}: {tiles}-tile wall slice along axis {meta['axis'].upper()}, "
             f"mesh stretched x{meta['stretch']} along its length (natural {meta['natural_length_m']} m)"
             + (f"; player colour {color}" if color else ""))
    e = {"image": rel, "size": [2 * half, int(y1 - y0)], "anchor": [half, int(fy - y0)],
         "playerColor": bool(colored), "spanTiles": tiles, "axis": meta["axis"],
         "source": f"0 A.D. {meta['actor']} (slice of a continuous render)",
         "scale_px_per_m": meta["scale_px_per_m"]}
    return e


def sources_for_flank(entity):
    e = SCENES["entities"][entity]
    out = set()
    for p in e.get("flank_parts", []):
        out.add("actors/" + p["actor"])
        if p["mesh"]:
            out.add("meshes/" + p["mesh"])
        for n, t in p["textures"].items():
            if n in ("baseTex", "aoTex"):
                out.add("textures/skins/" + t)
    return sorted(out)


# ------------------------------------------------------------------ statics
def compose_static(names, frames_dir, out, rel_base, colored):
    """Render one or more entities onto a shared canvas with a shared anchor."""
    imgs = []
    for nm in names:
        meta = json.load(open(os.path.join(frames_dir, nm, "meta.json")))
        rgba, mask = load_frame(os.path.join(frames_dir, nm, "static", "d0"), 0)
        small = downsample(rgba)
        bx0, by0, bx1, by1 = alpha_box([small])
        fx, fy = meta["foot"]
        imgs.append((nm, meta, rgba, mask, (bx0, by0, bx1, by1), (fx, fy)))
    # Shared canvas: extents relative to the foot point.
    left = max(fx - b[0] for *_, b, (fx, fy) in imgs)
    right = max(b[2] - fx for *_, b, (fx, fy) in imgs)
    up = max(fy - b[1] for *_, b, (fx, fy) in imgs)
    down = max(b[3] - fy for *_, b, (fx, fy) in imgs)
    W, H = int(np.ceil(float(left + right))) + 2, int(np.ceil(float(up + down))) + 2
    ax, ay = int(np.ceil(float(left))) + 1, int(np.ceil(float(up))) + 1
    if colored is None:  # colour only if the model has any player-colour area
        colored = any(i[3].max() > 0.1 for i in imgs)
    files = []
    colors = list(PLAYER_COLORS) if colored else [None]
    for k, (nm, meta, rgba, mask, b, (fx, fy)) in enumerate(imgs):
        stem = rel_base if len(imgs) == 1 else f"{rel_base}-{k}"
        rel = stem + ("-{color}.png" if colored else ".png")
        files.append(rel)
        for color in colors:
            small = downsample(tint(rgba, mask, color))
            canvas = np.zeros((H, W, 4))
            ox, oy = int(round(ax - fx)), int(round(ay - fy))
            sx0, sy0 = max(0, -ox), max(0, -oy)
            sx1, sy1 = min(small.shape[1], W - ox), min(small.shape[0], H - oy)
            canvas[oy + sy0:oy + sy1, ox + sx0:ox + sx1] = small[sy0:sy1, sx0:sx1]
            orel = rel.format(color=color) if colored else rel
            save_png(to_img(canvas), os.path.join(out, orel), quantize=True)
            note(orel, sources_for(nm), f"0 A.D. actor {meta['actor']}" + (f"; player colour {color}" if color else ""))
    return {"anchor": [ax, ay], "size": [W, H], "files": files, "colored": colored,
            "scale_px_per_m": imgs[0][1]["scale_px_per_m"]}


# ------------------------------------------------------------------ terrain
def read_texture(path):
    try:
        return Image.open(path).convert("RGB")
    except Exception:
        tmp = path + ".tmp.png"
        subprocess.run(["magick", path, tmp], check=True)
        img = Image.open(tmp).convert("RGB")
        os.remove(tmp)
        return img


def diamond_tile(tex, size=TILE, ss=4, periods=1, shade=0.92):
    """Map one texture period onto a 2:1 diamond (seamless with itself).

    Pixel (x, y) of the tile is inside the diamond when its centre satisfies
    |x+.5-W/2|/(W/2) + |y+.5-H/2|/(H/2) <= 1; that rule partitions the plane
    exactly on the usual (W/2, H/2) iso lattice, so there are no gaps or
    overlaps between neighbours.
    """
    W, H = size
    t = np.asarray(tex, dtype=np.float64) / 255.0
    th, tw = t.shape[:2]
    # Supersampled positions inside the tile.
    ys, xs = np.mgrid[0:H * ss, 0:W * ss]
    px = (xs + 0.5) / ss
    py = (ys + 0.5) / ss
    # Screen -> ground: u along the down-right edge, v along the down-left edge.
    u = (px / W) + (py / H) - 0.5
    v = (py / H) - (px / W) + 0.5
    uu = ((u * periods) % 1.0) * tw
    vv = ((v * periods) % 1.0) * th
    # Bilinear sample with wraparound.
    x0 = np.floor(uu).astype(int) % tw
    y0 = np.floor(vv).astype(int) % th
    x1 = (x0 + 1) % tw
    y1 = (y0 + 1) % th
    fx = (uu - np.floor(uu))[..., None]
    fy = (vv - np.floor(vv))[..., None]
    c = (t[y0, x0] * (1 - fx) * (1 - fy) + t[y0, x1] * fx * (1 - fy)
         + t[y1, x0] * (1 - fx) * fy + t[y1, x1] * fx * fy)
    c = c.reshape(H, ss, W, ss, 3).mean(axis=(1, 3))
    c = lin2srgb(srgb2lin(c) * shade)
    yy, xx = np.mgrid[0:H, 0:W]
    inside = (np.abs(xx + 0.5 - W / 2) / (W / 2) + np.abs(yy + 0.5 - H / 2) / (H / 2)) <= 1
    out = np.zeros((H, W, 4))
    out[..., :3] = c
    out[..., 3] = inside
    return out


# Per-kind brightness (linear multiplier) so dirt sits darker than the
# sprites' gravel pads and grass, as in the game's lit terrain.
TERRAIN_SHADE = {"grass": 0.92, "dirt": 0.78, "forest_floor": 0.85}


def compose_terrain(terrain, out):
    """One texture period per tile (seamless with itself). Variants of a kind
    are colour-matched to the kind's mean so mixing them shows no checkerboard."""
    res = {}
    for kind, texs in terrain.items():
        res[kind] = []
        tiles = [diamond_tile(read_texture(os.path.join(ART, "textures/terrain/types", t)),
                              shade=TERRAIN_SHADE.get(kind, 0.9)) for t in texs]
        means = [srgb2lin(tl[..., :3][tl[..., 3] > 0]).mean(axis=0) for tl in tiles]
        target = np.mean(means, axis=0)
        for k, (t, tile, m) in enumerate(zip(texs, tiles, means)):
            inside = tile[..., 3] > 0
            lin = srgb2lin(tile[..., :3]) * (target / np.maximum(m, 1e-4))[None, None, :]
            tile[..., :3] = np.where(inside[..., None], lin2srgb(lin), 0)
            rel = f"terrain/{kind.replace('_', '-')}-{k}.png"
            save_png(to_img(tile), os.path.join(out, rel))
            note(rel, ["textures/terrain/types/" + t],
                 f"one texture period mapped onto a {TILE[0]}x{TILE[1]} 2:1 diamond, colour-matched to the other {kind} tiles")
            res[kind].append(rel)
    return res


# ------------------------------------------------------------------ ground
GROUND_SIZE = (1024, 512)   # must be 2:1
GROUND_PERIODS = 3          # texture periods across the tile, per lattice axis
GROUND_TEXTURES = ["temp_grass_mod_01.png", "temp_grass_mod_03.png"]
GROUND_TARGET = (98, 132, 50)   # sRGB mean: brighter, greener classic RTS grass
DIRT_TEXTURE = "temp_dirt_gravel_b.png"
DIRT_TARGET = (128, 104, 70)
DIRT_SIZE = (400, 200)


def iso_uv(W, H, periods, ss=1):
    """Ground (u, v) in texture periods for every pixel of a 2:1 iso image.

    A square texture rotated 45 degrees and squashed 2:1 repeats on the lattice
    (W/2, H/2), (-W/2, H/2) when one period spans the W x H diamond; so a
    W x H rectangle repeats exactly in x (u+1, v-1) and in y (u+1, v+1).
    """
    ys, xs = np.mgrid[0:H * ss, 0:W * ss]
    px = (xs + 0.5) / ss
    py = (ys + 0.5) / ss
    u = (px / W + py / H) * periods
    v = (py / H - px / W) * periods
    return u, v


def sample_wrap(t, u, v):
    th, tw = t.shape[:2]
    uu = (u % 1.0) * tw
    vv = (v % 1.0) * th
    x0 = np.floor(uu).astype(int) % tw
    y0 = np.floor(vv).astype(int) % th
    x1, y1 = (x0 + 1) % tw, (y0 + 1) % th
    fx = (uu - np.floor(uu))[..., None]
    fy = (vv - np.floor(vv))[..., None]
    return (t[y0, x0] * (1 - fx) * (1 - fy) + t[y0, x1] * fx * (1 - fy)
            + t[y1, x0] * (1 - fx) * fy + t[y1, x1] * fx * fy)


def periodic_noise(u, v, seed, terms=6, base=1):
    """Smooth noise that is periodic in u and v with period 1 (integer frequencies)."""
    rng = np.random.default_rng(seed)
    n = np.zeros_like(u)
    for _ in range(terms):
        # Avoid |fu| == |fv|: those terms depend on screen y only -> horizontal stripes.
        while True:
            fu, fv = rng.integers(base, base + 3, size=2) * rng.choice([-1, 1], size=2)
            if abs(fu) != abs(fv):
                break
        ph = rng.uniform(0, 2 * np.pi)
        n += np.sin(2 * np.pi * (fu * u + fv * v) + ph) / max(abs(fu), abs(fv))
    return n / np.abs(n).max()


def grade(lin, target_srgb, mask=None):
    """Per-channel linear gain so the mean hits target_srgb (keeps texture detail)."""
    sel = lin if mask is None else lin[mask]
    mean = sel.reshape(-1, 3).mean(axis=0)
    gain = srgb2lin(np.array(target_srgb) / 255.0) / np.maximum(mean, 1e-4)
    return lin * gain


def compose_ground(out):
    W, H = GROUND_SIZE
    ss = 2
    u, v = iso_uv(W, H, GROUND_PERIODS, ss)
    texs = [srgb2lin(np.asarray(read_texture(os.path.join(ART, "textures/terrain/types", t)), dtype=np.float64) / 255.0)
            for t in GROUND_TEXTURES]
    a = sample_wrap(texs[0], u, v)
    b = sample_wrap(texs[1], u + 0.37, v + 0.21)
    # Blend the two grasses with large, soft, seamless patches (noise period = 1 tile).
    U, V = u / GROUND_PERIODS, v / GROUND_PERIODS
    m = np.clip(0.5 + 0.9 * periodic_noise(U, V, 7), 0, 1)[..., None]
    c = a * (1 - m) + b * m
    # Gentle large-scale light/dark variation, also seamless.
    c *= (1 + 0.08 * periodic_noise(U, V, 11, base=2))[..., None]
    c = c.reshape(H, ss, W, ss, 3).mean(axis=(1, 3))
    c = grade(c, GROUND_TARGET)
    img = np.ones((H, W, 4))
    img[..., :3] = lin2srgb(c)
    rel = "terrain/ground.png"
    save_png(to_img(img), os.path.join(out, rel))
    note(rel, ["textures/terrain/types/" + t for t in GROUND_TEXTURES],
         f"{W}x{H} seamless iso ground: textures rotated 45 deg and squashed 2:1 "
         f"({GROUND_PERIODS} periods per axis), blended with periodic noise, graded greener/brighter")
    return rel, [W, H]


def compose_dirt_patches(out, count=2):
    W, H = DIRT_SIZE
    tex = srgb2lin(np.asarray(read_texture(os.path.join(ART, "textures/terrain/types", DIRT_TEXTURE)), dtype=np.float64) / 255.0)
    files = []
    for k in range(count):
        u, v = iso_uv(W, H, 1.6)
        c = sample_wrap(tex, u + 0.3 * k, v + 0.5 * k)
        yy, xx = np.mgrid[0:H, 0:W]
        dx = (xx + 0.5 - W / 2) / (W / 2)
        dy = (yy + 0.5 - H / 2) / (H / 2)
        r = np.sqrt(dx * dx + dy * dy)
        ang = np.arctan2(dy, dx)
        rng = np.random.default_rng(100 + k)
        wob = sum(rng.uniform(0.02, 0.05) * np.sin(f * ang + rng.uniform(0, 6.3)) for f in (2, 3, 4))
        edge = 0.86 + wob
        alpha = np.clip((edge - r) / 0.30, 0, 1)
        alpha = alpha * alpha * (3 - 2 * alpha)  # smoothstep falloff
        # Break the rim up with fine texture-driven speckle.
        lum = c.mean(axis=-1)
        alpha *= np.clip(0.75 + 1.5 * (lum - lum.mean()) + 0.6 * alpha, 0, 1)
        c = grade(c, DIRT_TARGET, alpha > 0.5)
        img = np.zeros((H, W, 4))
        img[..., :3] = lin2srgb(c)
        img[..., 3] = np.clip(alpha, 0, 1) * 0.95
        rel = f"terrain/dirt-patch-{k}.png"
        save_png(to_img(img), os.path.join(out, rel))
        note(rel, ["textures/terrain/types/" + DIRT_TEXTURE],
             f"{W}x{H} soft-edged iso dirt decal (alpha falloff), graded brown")
        files.append(rel)
    return {"image": files[0], "variants": files, "size": [W, H], "anchor": [W // 2, H // 2],
            "source": "0 A.D. terrain " + DIRT_TEXTURE + " (decal sprite; draw under buildings, below other sprites)"}


# ------------------------------------------------------------------ ui
def compose_ui(ui, out):
    res = {"portraits": {}}
    for key, rel_src in ui.items():
        src = os.path.join(ART, "textures/ui/session", rel_src)
        if key.startswith("portrait-"):
            unit = key[len("portrait-"):]
            rel = f"ui/portrait-{unit}.png"
            res["portraits"][unit] = rel
        else:
            rel = f"ui/{'pop' if key == 'population' else key}.png"
            res[key] = rel
        os.makedirs(os.path.dirname(os.path.join(out, rel)), exist_ok=True)
        Image.open(src).convert("RGBA").save(os.path.join(out, rel), optimize=True)
        note(rel, ["textures/ui/session/" + rel_src], "copied unchanged (re-encoded PNG)")
    return res


# ------------------------------------------------------------------ sources
SCENES = None


def sources_for(entity):
    """Every 0 A.D. file (actor, mesh, texture) that went into an entity."""
    e = SCENES["entities"][entity]
    parts_lists = [a["parts"] for a in e["anims"].values()] if "anims" in e else [e["parts"]]
    out = set()
    for parts in parts_lists:
        for p in parts:
            out.add("actors/" + p["actor"])
            if p["mesh"]:
                out.add("meshes/" + p["mesh"])
            for n, t in p["textures"].items():
                if n in ("baseTex", "aoTex"):
                    out.add("textures/skins/" + t)
    return sorted(out)


# ------------------------------------------------------------------ main
def main():
    global SCENES
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--scenes", default=os.path.join(ROOT, "art/sources/zeroad/scenes.json"))
    ap.add_argument("--commit", default="")
    a = ap.parse_args()
    SCENES = json.load(open(a.scenes))
    out = a.out
    # Start clean but keep hand-written files.
    for sub in ("units", "buildings", "nature", "terrain", "ui", "walls", "fauna"):
        shutil.rmtree(os.path.join(out, sub), ignore_errors=True)
    os.makedirs(out, exist_ok=True)

    entities = {}
    for look in UNIT_LOOKS:
        entities[look] = compose_unit(look, a.frames, out, pack_name=file_name(look))
        entities[look]["source"] = LOOK_SOURCES[look] + " (" + entities[look]["source"] + ")"
    done = {}
    for pname, (names, role) in BUILDINGS.items():
        base = "buildings/" + file_name(names[0] if len(names) == 1 else pname)
        key = tuple(names)
        r = done.get(key) or compose_static(names, a.frames, out, base, colored=None)
        done[key] = r
        e = {"anchor": r["anchor"], "size": r["size"], "source": role,
             "playerColor": r["colored"], "scale_px_per_m": r["scale_px_per_m"]}
        if len(r["files"]) == 1:
            e["image"] = r["files"][0]
        else:
            e["image"] = r["files"][0]
            e["variants"] = r["files"]
        entities[pname] = e
    for pname, names in GAIA.items():
        base = "nature/" + pname.replace("_", "-")
        r = compose_static(names, a.frames, out, base, colored=False)
        e = {"anchor": r["anchor"], "size": r["size"], "scale_px_per_m": r["scale_px_per_m"],
             "source": ", ".join(SCENES["entities"][n]["actor"] for n in names)}
        if len(r["files"]) == 1:
            e["image"] = r["files"][0]
        else:
            e["variants"] = r["files"]
        entities[pname] = e

    for look in FAUNA:
        entities[look] = compose_unit(look, a.frames, out, pack_name=file_name(look), colored=False, folder="fauna")
        entities[look]["source"] = "0 A.D. " + entities[look]["source"].replace("0 A.D. ", "")
    walls = {}
    for kind, pieces in WALLS.items():
        walls[kind] = {"segmentTiles": 1}
        for role, ent_name in pieces.items():
            if role == "corner":
                r = compose_static([ent_name], a.frames, out, "walls/" + file_name(ent_name), colored=None)
                entities[ent_name] = {"image": r["files"][0], "size": r["size"], "anchor": r["anchor"],
                                      "playerColor": r["colored"], "source": "0 A.D. " + SCENES["entities"][ent_name]["actor"],
                                      "scale_px_per_m": r["scale_px_per_m"]}
            else:
                entities[ent_name] = compose_wall_slice(ent_name, a.frames, out)
            walls[kind][role] = ent_name
    # Flat pieces belong to the ground layer (drawn before depth-sorted sprites).
    for flat in ("tuft", "field"):
        entities[flat]["flat"] = True
    terrain = compose_terrain(SCENES["terrain"], out)
    terrain["ground"], terrain["groundSize"] = compose_ground(out)
    entities["dirt_patch"] = compose_dirt_patches(out)
    ui = compose_ui(SCENES["ui"], out)

    pack = {
        "name": "zeroad",
        "unitLooks": UNIT_LOOKS,
        "fauna": FAUNA,
        "decor": DECOR,
        "title": "0 A.D. (CC BY-SA 3.0)",
        "license": "CC-BY-SA-3.0",
        "attribution": "Art derived from 0 A.D. by Wildfire Games (https://www.wildfiregames.com/), "
                       "CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/)",
        "source": {"repo": "https://github.com/0ad/0ad", "commit": a.commit, "tag": "A26"},
        "tile": list(TILE),
        "terrain": terrain,
        "playerColors": list(PLAYER_COLORS),
        "playerColorValues": PLAYER_COLORS,
        "sheetLayout": {
            "rows": "one row per direction, in dirOrder",
            "columns": "frames left to right, frame i at x = i * frame[0]",
            "dirOrder": DIR_NAMES,
            "dirNote": "S faces the viewer (screen-down); then clockwise on screen. "
                       "Directions are 45-degree steps on the ground plane, so SW/NW/NE/SE run along tile edges.",
            "anchor": "foot point inside each frame (units) or image (static), in px from the top-left",
        },
        "walls": walls,
        "wallNote": "Segments span exactly segmentTiles tile edges; axis a runs screen upper-left to "
                    "lower-right (+48, +24 px per tile), axis b upper-right to lower-left (-48, +24). "
                    "The anchor is the segment's ground midpoint; place consecutive pieces one tile apart. "
                    "Gates have spanTiles 2 (anchor = midpoint of the 2-tile run). Corners are posts/towers "
                    "centred on the tile vertex; draw them after the segments meeting there.",
        "entities": entities,
        "ui": ui,
    }
    with open(os.path.join(out, "pack.json"), "w") as f:
        json.dump(pack, f, indent=1)
        f.write("\n")
    with open(os.path.join(out, "pack.manifest.json"), "w") as f:
        json.dump({"_about": {
            "pack": "zeroad", "license": "CC-BY-SA-3.0", "author": "Wildfire Games",
            "source_repo": "https://github.com/0ad/0ad", "source_commit": a.commit,
            "source_root": ART_REL,
            "note": "sources are paths under source_root at source_commit; every file here is a derived work under CC BY-SA 3.0"},
            "files": dict(sorted(manifest.items()))}, f, indent=1)
        f.write("\n")
    total = sum(os.path.getsize(os.path.join(dp, fn)) for dp, _, fns in os.walk(out) for fn in fns)
    print(f"pack: {len(manifest)} images, {total / 1e6:.1f} MB total")


if __name__ == "__main__":
    main()
