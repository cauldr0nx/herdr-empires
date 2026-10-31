#!/usr/bin/env python3
"""Resolve 0 A.D. actor XML into flat render scenes (SPEC §18.5 step 2).

0 A.D. assembles every visible object from an *actor*: groups of variants
(mesh, textures, props, animations), variant files merged in, and props
(other actors) hung on named attach points. This module re-implements the
subset the pack needs, deterministically:

  * one variant per group: a variant whose name matches a selection wins,
    otherwise the variant at ``pick`` (seed index) among those with
    frequency > 0, otherwise the first;
  * ``file=`` variants are merged from art/variants/;
  * textures merge by name, props by attach point (a prop with no actor
    removes the one on that point), animations by name (later wins);
  * props recurse with the same selections.

Usage (system python, no Blender):
  resolve.py files      print every art file the configured entities need
  resolve.py scenes     write art/sources/zeroad/scenes.json for render.py

Entity choices live in ENTITIES below.
"""
import json
import os
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
ART_REL = "binaries/data/mods/public/art"
ZEROAD = os.path.join(ROOT, "art", "sources", "zeroad", "0ad")
ART = os.path.join(ZEROAD, ART_REL)

# --------------------------------------------------------------------------
# What the pack renders. "kind" picks the camera/scale preset in render.py.
# anims: pack anim name -> (selections, 0 A.D. animation name, frames, fps)
# Frame counts are shared by every unit look so looks are drop-in for each
# other; they are kept modest (52 frames per direction) to fit six looks x 8
# colours into the pack budget.
VILLAGER_ANIMS = {
    "idle":        (["Idle"], "Idle", 8, 6),
    "walk":        (["Walk"], "Walk", 12, 12),
    "gather_wood": (["gather_tree"], "gather_tree", 8, 7),
    "gather_gold": (["gather_ore"], "gather_ore", 8, 7),
    "carry":       (["carry_wood"], "Walk", 8, 9),
    "build":       (["Build"], "Build", 8, 7),
}
FAUNA_ANIMS = {
    "idle": (["Idle"], "Idle", 6, 5),
    "walk": (["Walk"], "Walk", 8, 10),
}
# Turns a citizen soldier into an unarmed worker: swap the soldier's base
# stance for 0 A.D.'s male labourer stance and drop weapons/shields/helmets
# (gather/carry/build variants still add their own tools).
WORKER = {"replace_base": "biped/base_slave_male.xml",
          "drop_props": ["props/units/weapons/", "props/units/shields/", "props/units/helmets/"]}

ENTITIES = {
    # unit
    "villager": {"actor": "units/celts/female_citizen.xml", "kind": "unit",
                 "pick": 0, "anims": VILLAGER_ANIMS},
    "villager_b": {"actor": "units/britons/infantry_spearman_b.xml", "kind": "unit",
                   "pick": 1, "anims": VILLAGER_ANIMS, **WORKER},
    # Capes are rigid props on the root, so they stick out when the unit bends: dropped.
    "villager_c": {"actor": "units/gauls/infantry_swordsman_b.xml", "kind": "unit",
                   "pick": 2, "anims": VILLAGER_ANIMS, **WORKER,
                   "drop_props": WORKER["drop_props"] + ["props/units/capes/"]},
    "villager_d": {"actor": "units/iberians/infantry_spearman_b.xml", "kind": "unit",
                   "pick": 0, "anims": VILLAGER_ANIMS, **WORKER},
    "villager_e": {"actor": "units/romans/infantry_swordsman_servus.xml", "kind": "unit",
                   "pick": 5, "anims": VILLAGER_ANIMS, **WORKER},
    "villager_f": {"actor": "units/celts/female_citizen.xml", "kind": "unit",
                   "pick": 4, "anims": VILLAGER_ANIMS},
    # buildings (Briton set; stand-ins for the AoE-style roles noted)
    # "garrisoned" hangs the player-colour banner on the town center.
    "town_center": {"actor": "structures/britons/civic_centre.xml", "kind": "building",
                    "select": ["garrisoned"]},
    "house":       {"actor": "structures/britons/house.xml", "kind": "building", "pick": 0},
    "house_b":     {"actor": "structures/britons/house.xml", "kind": "building", "pick": 2},
    "storehouse":  {"actor": "structures/britons/storehouse.xml", "kind": "building"},   # lumber/mining camp
    "barracks":    {"actor": "structures/britons/barracks.xml", "kind": "building"},     # university stand-in
    "temple":      {"actor": "structures/britons/temple.xml", "kind": "building"},       # monastery
    "farmstead":   {"actor": "structures/britons/farmstead.xml", "kind": "building"},    # mill
    # progression buildings
    "market":        {"actor": "structures/britons/market.xml", "kind": "building"},
    "blacksmith":    {"actor": "structures/britons/blacksmith.xml", "kind": "building"},
    "defense_tower": {"actor": "structures/britons/wooden_tower.xml", "kind": "building"},
    "sentry_tower":  {"actor": "structures/britons/scout_tower.xml", "kind": "building"},
    # plot_field.xml's meshes are 2009 3ds Max COLLADA that Blender imports as
    # empty; the newer farmland decal renders cleanly.
    "field":         {"actor": "structures/plot_field_new.xml", "kind": "building"},
    "corral":        {"actor": "structures/britons/plot_corral.xml", "kind": "building"},
    "fortress":      {"actor": "structures/britons/fortress.xml", "kind": "building"},
    "fortress_gaul": {"actor": "structures/gauls/fortress.xml", "kind": "building"},
    "wonder":        {"actor": "structures/britons/wonder.xml", "kind": "building"},
    "palisade":        {"actor": "props/special/palisade_rocks_long.xml", "kind": "building"},
    "palisade_corner": {"actor": "props/special/palisade_rocks_curve.xml", "kind": "building"},
    "gate":            {"actor": "props/special/palisade_rocks_gate.xml", "kind": "building"},
    "house_gaul_0":  {"actor": "structures/gauls/house.xml", "kind": "building", "pick": 0},
    "house_gaul_1":  {"actor": "structures/gauls/house.xml", "kind": "building", "pick": 1},
    # walls (kind "wall"; render.py fits them to the 96x48 tile grid).
    # tiles: length in tile edges; uniform: scale for the other two axes;
    # flank: actor rendered either side (1 tile each) so the sprite can be cut
    # into a seamless slice of an endless wall.
    "palisade_a":      {"actor": "props/special/palisade_rocks_medium.xml", "kind": "wall", "axis": "a",
                        "tiles": 1, "uniform": 1.0, "overlap": 1.25, "flank": "props/special/palisade_rocks_medium.xml"},
    "palisade_b":      {"actor": "props/special/palisade_rocks_medium.xml", "kind": "wall", "axis": "b",
                        "tiles": 1, "uniform": 1.0, "overlap": 1.25, "flank": "props/special/palisade_rocks_medium.xml"},
    "palisade_gate_a": {"actor": "props/special/palisade_rocks_gate.xml", "kind": "wall", "axis": "a",
                        "tiles": 2, "uniform": 1.0, "overlap": 1.25, "flank_inset": 0.2, "flank": "props/special/palisade_rocks_medium.xml"},
    "palisade_gate_b": {"actor": "props/special/palisade_rocks_gate.xml", "kind": "wall", "axis": "b",
                        "tiles": 2, "uniform": 1.0, "overlap": 1.25, "flank_inset": 0.2, "flank": "props/special/palisade_rocks_medium.xml"},
    "palisade_post":   {"actor": "props/special/palisade_rocks_tower.xml", "kind": "wall", "axis": "post",
                        "uniform": 0.85},
    "wall_a":      {"actor": "structures/britons/wall_short.xml", "kind": "wall", "axis": "a",
                    "tiles": 1, "uniform": 0.58, "flank": "structures/britons/wall_short.xml"},
    "wall_b":      {"actor": "structures/britons/wall_short.xml", "kind": "wall", "axis": "b",
                    "tiles": 1, "uniform": 0.58, "flank": "structures/britons/wall_short.xml"},
    "wall_gate_a": {"actor": "structures/britons/wall_gate.xml", "kind": "wall", "axis": "a",
                    "tiles": 2, "uniform": 0.58, "flank": "structures/britons/wall_short.xml"},
    "wall_gate_b": {"actor": "structures/britons/wall_gate.xml", "kind": "wall", "axis": "b",
                    "tiles": 2, "uniform": 0.58, "flank": "structures/britons/wall_short.xml"},
    "wall_tower":  {"actor": "structures/britons/wall_tower.xml", "kind": "wall", "axis": "post",
                    "uniform": 0.58},
    # fauna (kind "fauna": unit framing, no player colour)
    "sheep": {"actor": "fauna/sheep1.xml", "kind": "fauna", "anims": FAUNA_ANIMS, "select": ["normal"]},
    "boar":  {"actor": "fauna/boar.xml", "kind": "fauna", "anims": FAUNA_ANIMS, "select": ["normal"]},
    "chicken": {"actor": "fauna/chicken.xml", "kind": "fauna", "anims": FAUNA_ANIMS},
    # Not usable with Blender 4.5's COLLADA importer (see README): deer (its
    # ColladaMax animations have a different rest pose than the mesh: limbs
    # explode, with or without unit conversion), goat (animation keys scaled
    # ~500x), cow and pig (animation .dae fail to parse).
    # gaia
    "tree_0": {"actor": "flora/trees/oak_new.xml", "kind": "gaia", "pick": 0},
    "tree_1": {"actor": "flora/trees/euro_birch_tree.xml", "kind": "gaia", "pick": 0},
    "tree_2": {"actor": "flora/trees/pine.xml", "kind": "gaia", "pick": 0},
    "gold_mine":  {"actor": "geology/metal_temperate_round.xml", "kind": "gaia", "pick": 0},
    "stone_mine": {"actor": "geology/stonemine_temperate_quarry.xml", "kind": "gaia"},
    "berry_bush": {"actor": "props/flora/berry_bush.xml", "kind": "gaia", "pick": 0},
    "berry_bush_1": {"actor": "props/flora/berry_bush_02.xml", "kind": "gaia", "pick": 0},
    # wilderness decor
    "tree_3": {"actor": "flora/trees/oak_large.xml", "kind": "gaia", "pick": 0},
    "tree_4": {"actor": "flora/trees/oak_dead.xml", "kind": "gaia", "pick": 0},
    "tree_5": {"actor": "flora/trees/european_beech.xml", "kind": "gaia", "pick": 0},
    "tree_6": {"actor": "flora/trees/temperate_bush_biome.xml", "kind": "gaia", "pick": 0},
    "rocks_0": {"actor": "geology/gray_rock1.xml", "kind": "gaia", "pick": 0},
    "rocks_1": {"actor": "geology/stone_granite_boulder.xml", "kind": "gaia", "pick": 0},
    "rocks_2": {"actor": "geology/shoreline_small.xml", "kind": "gaia", "pick": 0},
    "bush_0": {"actor": "props/flora/bush_tempe_me_lush.xml", "kind": "gaia", "pick": 0},
    "bush_1": {"actor": "props/flora/bush_tempe_la.xml", "kind": "gaia", "pick": 0},
    "tuft_0": {"actor": "props/flora/grass_soft_tuft_a.xml", "kind": "gaia", "pick": 0},
    "tuft_1": {"actor": "props/flora/grass_field_flowering_tall.xml", "kind": "gaia", "pick": 0},
    "tuft_2": {"actor": "props/flora/flower_bright.xml", "kind": "gaia", "pick": 0},
}
# Group selections that are always applied (alive, ungarrisoned, ...).
BASE_SELECTIONS = ["alive", "ungarrisoned", "Base"]

# Terrain samples (relative to art/textures/terrain/types/).
TERRAIN = {
    "grass": ["temp_grass_mod_01.png", "temp_grass_mod_02.png", "temp_grass_mod_03.png"],
    "dirt": ["temp_dirt_a.png", "temp_dirt_gravel_b.png"],
    "forest_floor": ["temp_forestfloor_a.dds", "temp_forest_mod_01.png"],
}
# UI (relative to art/textures/ui/session/).
UI = {
    "food": "icons/resources/food.png",
    "wood": "icons/resources/wood.png",
    "gold": "icons/resources/metal.png",
    "stone": "icons/resources/stone.png",
    "population": "icons/resources/population.png",
    "portrait-villager": "portraits/units/celt_support_female_citizen.png",
    "portrait-spearman": "portraits/units/brit_infantry_spearman.png",
    "portrait-swordsman": "portraits/units/gaul_infantry_swordsman.png",
}
SKIP_PROP_PREFIXES = ("particle/",)
# Attach points the game only fills transiently (arrows on defensive buildings).
SKIP_ATTACH = {"projectile", "loaded-projectile"}


def read_xml(rel):
    path = os.path.join(ART, rel)
    with open(path, "rb") as f:
        data = f.read()
    return ET.fromstring(data.decode("utf-8-sig").encode("utf-8"))


# Per-entity overrides, set by build() while an entity is resolved.
OPTS = {}


def variant_data(v, files):
    """Merge a <variant> element with its file= base. Returns a dict."""
    d = {"name": v.get("name", ""), "frequency": int(v.get("frequency", "0") or 0),
         "mesh": None, "textures": {}, "props": [], "animations": {}, "color": None,
         "decal": None}
    if v.get("file"):
        f = v.get("file")
        if OPTS.get("replace_base") and f.startswith("biped/base_"):
            f = OPTS["replace_base"]
        rel = "variants/" + f
        files.add(rel)
        base = variant_data(read_xml(rel), files)
        for k in ("mesh", "color", "decal"):
            d[k] = base[k]
        d["textures"].update(base["textures"])
        d["props"] = merge_props(d["props"], base["props"])
        d["animations"].update(base["animations"])
        if not d["name"]:
            d["name"] = base["name"]
        if "frequency" not in v.attrib:
            d["frequency"] = base["frequency"]
    for c in v:
        if c.tag == "mesh":
            d["mesh"] = (c.text or "").strip()
        elif c.tag == "textures":
            for t in c:
                d["textures"][t.get("name")] = t.get("file")
        elif c.tag == "props":
            d["props"] = merge_props(d["props"], [(p.get("attachpoint"), p.get("actor")) for p in c])
        elif c.tag == "animations":
            for a in c:
                d["animations"][a.get("name").lower()] = a.get("file")
        elif c.tag == "color":
            d["color"] = [int(x) for x in c.text.split()]
        elif c.tag == "decal":
            d["decal"] = dict(c.attrib)
    return d


def merge_props(old, new):
    """Props named by a later variant replace every earlier prop on that point."""
    points = {ap for ap, _ in new}
    return [p for p in old if p[0] not in points] + [p for p in new if p[1]]


def choose(variants, selections, pick):
    # The most specific (last) selection wins.
    for s in reversed(selections):
        for v in variants:
            if v["name"].lower() == s.lower():
                return v
    weighted = [v for v in variants if v["frequency"] > 0]
    if weighted:
        return weighted[pick % len(weighted)]
    return variants[0]


def resolve_actor(rel, selections, pick, files, parent=None, attach="root", parts=None, depth=0):
    """Flatten an actor into parts. Returns (parts, animations of the root)."""
    if parts is None:
        parts = []
    files.add("actors/" + rel)
    root = read_xml("actors/" + rel)
    merged = {"mesh": None, "textures": {}, "props": [], "animations": {}, "color": None, "decal": None}
    for g in root.findall("group"):
        vs = [variant_data(v, files) for v in g.findall("variant")]
        if not vs:
            continue
        v = choose(vs, selections, pick)
        if v["mesh"]:
            merged["mesh"] = v["mesh"]
        merged["textures"].update(v["textures"])
        merged["props"] = merge_props(merged["props"], v["props"])
        merged["animations"].update(v["animations"])
        if v["color"]:
            merged["color"] = v["color"]
        if v["decal"]:
            merged["decal"] = v["decal"]
    mat = root.findtext("material") or "default.xml"
    pid = len(parts)
    part = {"id": pid, "actor": rel, "parent": parent, "attach": attach,
            "mesh": merged["mesh"], "textures": merged["textures"], "material": mat,
            "color": merged["color"], "decal": merged["decal"]}
    parts.append(part)
    if merged["mesh"]:
        files.add("meshes/" + merged["mesh"])
    for name, tex in merged["textures"].items():
        if name in ("baseTex", "aoTex"):  # norm/spec maps are not used by the renderer
            files.add("textures/skins/" + tex)
    if depth < 6:
        for ap, actor in merged["props"]:
            if not actor or actor.startswith(SKIP_PROP_PREFIXES) or ap in SKIP_ATTACH:
                continue
            if actor.startswith(tuple(OPTS.get("drop_props", ()))):
                continue
            resolve_actor(actor, selections, pick, files, pid, ap, parts, depth + 1)
    return parts, merged["animations"]


def build():
    files = set()
    scenes = {}
    for name, e in ENTITIES.items():
        pick = e.get("pick", 0)
        OPTS.clear()
        OPTS.update(e)
        if "anims" in e:
            scenes[name] = {"kind": e["kind"], "actor": e["actor"], "anims": {}}
            if "import_units" in e:
                scenes[name]["import_units"] = e["import_units"]
            for anim, (sel, zname, frames, fps) in e["anims"].items():
                parts, anims = resolve_actor(e["actor"], BASE_SELECTIONS + e.get("select", []) + sel, pick, files)
                af = anims.get(zname.lower())
                if not af:
                    raise SystemExit(f"{name}/{anim}: no animation {zname!r} in {sorted(anims)}")
                files.add("animation/" + af)
                scenes[name]["anims"][anim] = {"parts": parts, "animation": af,
                                               "frames": frames, "fps": fps}
        else:
            parts, _ = resolve_actor(e["actor"], BASE_SELECTIONS + e.get("select", []), pick, files)
            scenes[name] = {"kind": e["kind"], "actor": e["actor"], "parts": parts}
            if e["kind"] == "wall":
                for k in ("axis", "tiles", "uniform", "overlap", "flank_inset"):
                    if k in e:
                        scenes[name][k] = e[k]
                if e.get("flank"):
                    scenes[name]["flank_parts"], _ = resolve_actor(e["flank"], BASE_SELECTIONS, 0, files)
                    scenes[name]["flank"] = e["flank"]
    for v in TERRAIN.values():
        for t in v:
            files.add("textures/terrain/types/" + t)
    for t in UI.values():
        files.add("textures/ui/session/" + t)
    files.add("skeletons/biped.xml")
    OPTS.clear()
    return scenes, files


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "scenes"
    scenes, files = build()
    if cmd == "files":
        for f in sorted(files):
            print(ART_REL + "/" + f)
    elif cmd == "scenes":
        out = os.path.join(ROOT, "art", "sources", "zeroad", "scenes.json")
        with open(out, "w") as f:
            json.dump({"entities": scenes, "terrain": TERRAIN, "ui": UI}, f, indent=1)
        print(f"wrote {os.path.relpath(out, ROOT)} ({len(scenes)} entities, {len(files)} source files)")
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
