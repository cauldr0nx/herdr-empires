"""Render 0 A.D. actors to sprite frames (SPEC §18.5 step 3).

Runs inside portable Blender 4.5 LTS (the last series with the COLLADA
importer):

  blender --background --factory-startup --python art/zeroad/render.py -- \
      --scenes art/sources/zeroad/scenes.json --out art/out/zeroad-frames \
      [--only villager,town_center] [--quick]

For every frame it writes two PNGs:
  <entity>/<anim>/d<dir>/rgba_<frame>.png   lit colour, transparent background
                                            plus a soft ground shadow (Cycles
                                            shadow catcher), player colour = white
  <entity>/<anim>/d<dir>/mask_<frame>.png   player-colour weight (1 - baseTex
                                            alpha on player_trans materials)
and <entity>/meta.json with the frame size and the projected foot point.
compose.py multiplies the player colours in afterwards, so each frame is
rendered once rather than eight times.
"""
import json
import math
import os
import sys

import bpy
import mathutils
from bpy_extras.object_utils import world_to_camera_view

ELEVATION = math.radians(30.0)   # classic 2:1 dimetric
AZIMUTH = math.radians(45.0)     # camera sits south-east of the subject... see camera()
SS = 2                           # supersampling factor (compose.py downscales)

# Final-size pixels per metre for each kind (0 A.D. metres, i.e. engine units).
SCALE = {"unit": 13.0, "building": 8.6, "gaia": 8.6}
# Per-entity overrides (final px/m).
ENTITY_SCALE = {"tree_0": 6.5, "tree_1": 6.5, "tree_2": 6.5,
                # The Briton wonder is a ~100 m ring fort; shrink it, but keep it
                # the largest building.
                "wonder": 7.0}
UNIT_FRAME = (56, 64)            # final frame size for units (w, h)
UNIT_FOOT = (28, 54)             # where the unit origin lands inside the frame

# Direction rows. Row 0 faces the viewer (screen-down), then clockwise as seen
# on screen: S, SW, W, NW, N, NE, E, SE. Angles are ground-plane (world)
# angles, so "SW" runs along a tile edge on a 2:1 map.
DIR_NAMES = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"]


def args():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    o = {"scenes": None, "out": None, "only": None, "quick": False, "art": None}
    i = 0
    while i < len(a):
        k = a[i].lstrip("-")
        if k == "quick":
            o["quick"] = True
            i += 1
            continue
        o[k] = a[i + 1]
        i += 2
    return o


OPT = args()
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
ART = OPT["art"] or os.path.join(ROOT, "art/sources/zeroad/0ad/binaries/data/mods/public/art")


# ---------------------------------------------------------------- scene setup
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _img_cache.clear()
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    cy = sc.cycles
    cy.device = "CPU"
    cy.samples = 16 if OPT["quick"] else 48
    cy.use_adaptive_sampling = True
    cy.use_denoising = True
    cy.max_bounces = 3
    cy.diffuse_bounces = 2
    cy.glossy_bounces = 1
    cy.transparent_max_bounces = 16
    cy.caustics_reflective = cy.caustics_refractive = False
    sc.render.threads_mode = "AUTO"
    sc.render.film_transparent = True
    sc.render.filter_size = 1.2
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = 0.0
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    # Ambient: soft, slightly cool sky so shadowed faces keep their colour.
    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.62, 0.68, 0.80, 1.0)
    bg.inputs[1].default_value = 0.55
    sc.world = world
    # Key light: warm sun from the upper left of the screen.
    sun = bpy.data.objects.new("key", bpy.data.lights.new("key", "SUN"))
    sun.data.energy = 3.6
    sun.data.color = (1.0, 0.91, 0.78)
    sun.data.angle = math.radians(6.0)
    sc.collection.objects.link(sun)
    # Ground: invisible shadow catcher.
    bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.name = "ground"
    ground.is_shadow_catcher = True
    # Camera.
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.type = "ORTHO"
    cam.data.clip_start = 0.1
    cam.data.clip_end = 1000
    sc.collection.objects.link(cam)
    sc.camera = cam
    place_camera_and_light(cam, sun)
    # AOV for the player-colour mask, routed to a File Output node.
    vl = sc.view_layers[0]
    aov = vl.aovs.add()
    aov.name = "pc"
    aov.type = "VALUE"
    sc.use_nodes = True
    nt = sc.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    rl = nt.nodes.new("CompositorNodeRLayers")
    fo = nt.nodes.new("CompositorNodeOutputFile")
    fo.name = "out"
    fo.format.file_format = "PNG"
    fo.format.color_mode = "RGBA"
    fo.format.color_depth = "8"
    fo.file_slots.clear()
    fo.file_slots.new("rgba_")
    fo.file_slots.new("mask_")
    m = fo.file_slots["mask_"]
    m.use_node_format = False
    m.format.file_format = "PNG"
    m.format.color_mode = "BW"
    m.format.color_depth = "8"
    nt.links.new(rl.outputs["Image"], fo.inputs["rgba_"])
    nt.links.new(rl.outputs["pc"], fo.inputs["mask_"])
    comp = nt.nodes.new("CompositorNodeComposite")
    nt.links.new(rl.outputs["Image"], comp.inputs["Image"])
    return sc, cam


def place_camera_and_light(cam, sun):
    # Camera looks at the origin from the south-west-ish diagonal: azimuth is
    # measured from -Y towards +X, elevation from the ground.
    d = 200.0
    dirv = mathutils.Vector((math.sin(AZIMUTH) * math.cos(ELEVATION),
                             -math.cos(AZIMUTH) * math.cos(ELEVATION),
                             math.sin(ELEVATION)))
    cam.location = dirv * d
    cam.rotation_euler = (-dirv).to_track_quat("-Z", "Y").to_euler()
    # Light from screen upper-left: camera-left, a little behind the subject.
    right = mathutils.Vector((math.cos(AZIMUTH), math.sin(AZIMUTH), 0.0))
    toward_cam = mathutils.Vector((dirv.x, dirv.y, 0.0)).normalized()
    from_dir = (-right * 1.0 - toward_cam * 0.25 + mathutils.Vector((0, 0, 1.9))).normalized()
    sun.rotation_euler = (-from_dir).to_track_quat("-Z", "Y").to_euler()


# ---------------------------------------------------------------- materials
_img_cache = {}


def load_image(rel, non_color=False):
    path = os.path.join(ART, "textures/skins", rel)
    key = (path, non_color)
    if key in _img_cache:
        return _img_cache[key]
    if not os.path.exists(path):
        print("MISSING texture", rel)
        _img_cache[key] = None
        return None
    img = bpy.data.images.load(path)
    # Keep RGB untouched by alpha: in 0 A.D. alpha is often a mask, not coverage.
    img.alpha_mode = "CHANNEL_PACKED"
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    _img_cache[key] = img
    return img


def make_material(part, uv_names):
    mat = bpy.data.materials.new(part["actor"].split("/")[-1])
    mat.use_nodes = True
    nt = mat.node_tree
    N, L = nt.nodes, nt.links
    bsdf = N["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Specular IOR Level"].default_value = 0.15
    out = N["Material Output"]
    matname = part["material"]
    tex = part["textures"]
    base = load_image(tex["baseTex"]) if tex.get("baseTex") else None
    aov = N.new("ShaderNodeOutputAOV")
    aov.aov_name = "pc"
    aov.inputs["Value"].default_value = 0.0
    if base is None:
        bsdf.inputs["Base Color"].default_value = (0.5, 0.5, 0.5, 1)
        return mat
    t = N.new("ShaderNodeTexImage")
    t.image = base
    t.interpolation = "Linear"
    uv0 = N.new("ShaderNodeUVMap")
    uv0.uv_map = uv_names[0] if uv_names else ""
    L.new(uv0.outputs["UV"], t.inputs["Vector"])
    color = t.outputs["Color"]
    alpha = t.outputs["Alpha"]
    # Object colour (hair tint): rgb *= mix(objectColor, 1, a)
    if matname.startswith("objectcolor") and part.get("color"):
        oc = [c / 255.0 for c in part["color"]]
        oc = [srgb_to_linear(c) for c in oc]
        mix = N.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.inputs["A"].default_value = (*oc, 1)
        mix.inputs["B"].default_value = (1, 1, 1, 1)
        L.new(alpha, mix.inputs["Factor"])
        mul = N.new("ShaderNodeMix")
        mul.data_type = "RGBA"
        mul.blend_type = "MULTIPLY"
        mul.inputs["Factor"].default_value = 1.0
        L.new(color, mul.inputs["A"])
        L.new(mix.outputs["Result"], mul.inputs["B"])
        color = mul.outputs["Result"]
    # Ambient occlusion map on the second UV set.
    if tex.get("aoTex") and len(uv_names) > 1:
        ao_img = load_image(tex["aoTex"], non_color=True)
        if ao_img is not None:
            ta = N.new("ShaderNodeTexImage")
            ta.image = ao_img
            uv1 = N.new("ShaderNodeUVMap")
            uv1.uv_map = uv_names[1]
            L.new(uv1.outputs["UV"], ta.inputs["Vector"])
            soft = N.new("ShaderNodeMix")
            soft.data_type = "RGBA"
            soft.inputs["Factor"].default_value = 0.75
            soft.inputs["A"].default_value = (1, 1, 1, 1)
            L.new(ta.outputs["Color"], soft.inputs["B"])
            mul = N.new("ShaderNodeMix")
            mul.data_type = "RGBA"
            mul.blend_type = "MULTIPLY"
            mul.inputs["Factor"].default_value = 1.0
            L.new(color, mul.inputs["A"])
            L.new(soft.outputs["Result"], mul.inputs["B"])
            color = mul.outputs["Result"]
    L.new(color, bsdf.inputs["Base Color"])
    if matname.startswith("player"):
        inv = N.new("ShaderNodeMath")
        inv.operation = "SUBTRACT"
        inv.inputs[0].default_value = 1.0
        L.new(alpha, inv.inputs[1])
        L.new(inv.outputs[0], aov.inputs["Value"])
    elif "trans" in matname or matname.startswith("terrain"):
        # Alpha-tested foliage / blended decals.
        if matname.startswith("terrain"):
            L.new(alpha, bsdf.inputs["Alpha"])
        else:
            gt = N.new("ShaderNodeMath")
            gt.operation = "GREATER_THAN"
            gt.inputs[1].default_value = 0.45
            L.new(alpha, gt.inputs[0])
            L.new(gt.outputs[0], bsdf.inputs["Alpha"])
        mat.blend_method = "HASHED" if hasattr(mat, "blend_method") else None
    return mat


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


# ---------------------------------------------------------------- assembly
def import_dae(rel):
    before = set(bpy.data.objects)
    bpy.ops.wm.collada_import(filepath=os.path.join(ART, rel), import_units=True)
    return [o for o in bpy.data.objects if o not in before]


def prop_point(objs, name):
    """Find attach point `name` among objects: empty prop-x / prop_x, or bone."""
    want = {"prop-" + name, "prop_" + name}
    for o in objs:
        if o.type == "EMPTY" and (o.name.split(".")[0] in want):
            return ("obj", o, None)
    for o in objs:
        if o.type == "ARMATURE":
            for b in o.data.bones:
                if b.name in want:
                    return ("bone", o, b)
    return None


def attach(child_roots, target):
    kind, obj, bone = target
    for c in child_roots:
        mw = c.matrix_basis.copy()
        c.parent = obj
        if kind == "bone":
            c.parent_type = "BONE"
            c.parent_bone = bone.name
            # Bone parenting measures from the tail; 0 A.D. measures from the head.
            c.matrix_parent_inverse = mathutils.Matrix.Translation((0, -bone.length, 0))
        else:
            c.matrix_parent_inverse = mathutils.Matrix.Identity(4)
        c.matrix_basis = mw


def add_decal(part, parent_root):
    d = part["decal"]
    w, h = float(d.get("width", 1)), float(d.get("depth", 1))
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
    pl = bpy.context.active_object
    pl.name = "decal"
    pl.scale = (w, h, 1)
    # 0 A.D. offsetx/offsetz are engine X/Z; engine Z is Blender -Y here.
    pl.location = (float(d.get("offsetx", 0)), -float(d.get("offsetz", 0)), 0.03)
    pl.rotation_euler = (0, 0, math.radians(float(d.get("angle", 0))))
    pl.visible_shadow = False
    mat = make_material(part, [pl.data.uv_layers[0].name])
    pl.data.materials.append(mat)
    return pl


def assemble(parts):
    """Import every part, hang props on their points. Returns (root, objs, armature)."""
    by_id = {}
    armature = None
    root = None
    allobjs = []
    for p in parts:
        if p["mesh"] is None:
            if p.get("decal"):
                allobjs.append(add_decal(p, root))
            by_id[p["id"]] = []
            continue
        objs = import_dae("meshes/" + p["mesh"])
        allobjs += objs
        by_id[p["id"]] = objs
        for o in objs:
            if o.type == "MESH":
                uvs = [u.name for u in o.data.uv_layers]
                mat = make_material(p, uvs)
                o.data.materials.clear()
                o.data.materials.append(mat)
                for poly in o.data.polygons:
                    poly.material_index = 0
            if o.type == "ARMATURE" and p["parent"] is None:
                armature = o
        roots = [o for o in objs if o.parent is None]
        if p["parent"] is None:
            if root is None:
                root = roots[0] if len(roots) == 1 else None
                if root is None:
                    root = bpy.data.objects.new("root", None)
                    bpy.context.scene.collection.objects.link(root)
                    for r in roots:
                        r.parent = root
            continue
        parent_objs = by_id.get(p["parent"], [])
        target = None
        if p["attach"] != "root":
            target = prop_point(parent_objs, p["attach"])
            if target is None:
                print(f"WARN no attach point {p['attach']!r} for {p['actor']}; using root")
        if target is None:
            proot = [o for o in parent_objs if o.parent is None] or [root]
            target = ("obj", proot[0], None)
        attach(roots, target)
    return root, allobjs, armature


def count_fcurves(action):
    if hasattr(action, "layers") and len(action.layers):
        return sum(len(cb.fcurves) for l in action.layers for s in l.strips for cb in s.channelbags)
    return len(getattr(action, "fcurves", []))


def apply_animation(armature, rel):
    objs = import_dae("animation/" + rel)
    # Some files hold a second armature with object-level keys only; take the
    # one whose action drives the most channels (the pose bones).
    cands = [o for o in objs if o.type == "ARMATURE" and o.animation_data and o.animation_data.action]
    src = max(cands, key=lambda o: count_fcurves(o.animation_data.action), default=None)
    if src is None:
        raise RuntimeError("no action in " + rel)
    action = src.animation_data.action
    armature.animation_data_create()
    armature.animation_data.action = action
    # Blender 4.4+ slotted actions: bind the slot the importer created.
    if hasattr(action, "slots") and len(action.slots):
        armature.animation_data.action_slot = action.slots[0]
    for o in objs:
        bpy.data.objects.remove(o, do_unlink=True)
    return action.frame_range


# ---------------------------------------------------------------- rendering
def world_bbox(objs, decals=False):
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs:
        if o.type != "MESH" or (o.name.startswith("decal") and not decals):
            continue
        oe = o.evaluated_get(dg)
        for c in oe.bound_box:
            p = oe.matrix_world @ mathutils.Vector(c)
            p.z = max(p.z, 0.0)  # foundations below ground are hidden by the catcher
            pts.append(p)
    if not pts and not decals:  # decal-only actors (flat fields)
        return world_bbox(objs, decals=True)
    return pts


def snap_to_ground(root, objs, sink=0.3):
    """Some gaia meshes sit above their origin (the game drapes them on
    terrain); lower them so they touch the ground and their shadow attaches."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    zmin = None
    for o in objs:
        if o.type != "MESH" or o.name.startswith("decal"):
            continue
        oe = o.evaluated_get(dg)
        for v in oe.data.vertices:
            z = (oe.matrix_world @ v.co).z
            zmin = z if zmin is None else min(zmin, z)
    if zmin is not None and zmin > 0.05:
        root.location.z -= zmin + sink
        print(f"SNAP lowered by {zmin + sink:.2f} m")


def frame_static(sc, cam, objs, pxm):
    """Fit an ortho camera around the objects (plus room for the shadow)."""
    bpy.context.view_layer.update()
    pts = world_bbox(objs)
    inv = cam.matrix_world.inverted()
    loc = [inv @ p for p in pts]
    xs = [p.x for p in loc]
    ys = [p.y for p in loc]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    # Shadow falls right and down: pad those sides.
    w, h = x1 - x0, y1 - y0
    x1 += w * 0.25
    y0 -= h * 0.06
    x0 -= w * 0.03
    y1 += h * 0.03
    w, h = x1 - x0, y1 - y0
    px_w = int(math.ceil(w * pxm)) + 4
    px_h = int(math.ceil(h * pxm)) + 4
    sc.render.resolution_x = px_w * SS
    sc.render.resolution_y = px_h * SS
    sc.render.resolution_percentage = 100
    big = max(px_w, px_h)
    cam.data.ortho_scale = big / pxm
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    cam.data.shift_x = cx / cam.data.ortho_scale
    cam.data.shift_y = cy / cam.data.ortho_scale
    return px_w, px_h


def frame_unit(sc, cam, pxm):
    fw, fh = UNIT_FRAME
    sc.render.resolution_x = fw * SS
    sc.render.resolution_y = fh * SS
    sc.render.resolution_percentage = 100
    big = max(fw, fh)
    cam.data.ortho_scale = big / pxm
    # Put the origin at UNIT_FOOT: shift the view so (0,0,0) lands there.
    cam.data.shift_x = -(UNIT_FOOT[0] - fw / 2) / big
    cam.data.shift_y = (UNIT_FOOT[1] - fh / 2) / big
    return fw, fh


def foot_pixel(sc, cam):
    v = world_to_camera_view(sc, cam, mathutils.Vector((0, 0, 0)))
    fw = sc.render.resolution_x // SS
    fh = sc.render.resolution_y // SS
    return [round(v.x * fw, 2), round((1 - v.y) * fh, 2)]


def render_to(sc, outdir, index):
    fo = sc.node_tree.nodes["out"]
    os.makedirs(outdir, exist_ok=True)
    fo.base_path = outdir
    bpy.ops.render.render(write_still=False)
    fr = sc.frame_current
    for slot in ("rgba_", "mask_"):
        src = os.path.join(outdir, f"{slot}{fr:04d}.png")
        dst = os.path.join(outdir, f"{slot}{index:02d}.png")
        if os.path.exists(src):
            os.replace(src, dst)
        else:
            print("MISSING output", src)


def render_entity(name, ent, outroot):
    kind = ent["kind"]
    pxm = ENTITY_SCALE.get(name, SCALE[kind])
    meta = {"name": name, "kind": kind, "actor": ent["actor"], "scale_px_per_m": pxm}
    if "anims" in ent:
        meta["anims"] = {}
        for anim, a in ent["anims"].items():
            sc, cam = reset()
            root, objs, arm = assemble(a["parts"])
            f0, f1 = apply_animation(arm, a["animation"])
            fw, fh = frame_unit(sc, cam, pxm)
            n = a["frames"]
            dirs = 2 if OPT["quick"] else 8
            span = f1 - f0
            for d in range(dirs):
                # Model forward is -Y (0 A.D. +Z); camera ground direction is
                # (sin az, -cos az). Row 0 faces the camera, then clockwise on screen.
                arm.rotation_euler = (0, 0, AZIMUTH - d * math.radians(45.0))
                for i in range(n):
                    t = f0 + span * i / n
                    sc.frame_set(int(math.floor(t)), subframe=t - math.floor(t))
                    render_to(sc, os.path.join(outroot, name, anim, f"d{d}"), i)
            meta["anims"][anim] = {"frames": n, "fps": a["fps"], "dirs": dirs,
                                   "source_frames": [f0, f1], "animation": a["animation"]}
            meta["frame"] = [fw, fh]
            meta["foot"] = foot_pixel(sc, cam)
            print(f"RENDERED {name}/{anim}: {dirs}x{n} frames, foot {meta['foot']}")
    else:
        sc, cam = reset()
        root, objs, arm = assemble(ent["parts"])
        if kind == "gaia":
            snap_to_ground(root, objs)
        fw, fh = frame_static(sc, cam, objs, pxm)
        sc.frame_set(1)
        render_to(sc, os.path.join(outroot, name, "static", "d0"), 0)
        meta["frame"] = [fw, fh]
        meta["foot"] = foot_pixel(sc, cam)
        print(f"RENDERED {name}: {fw}x{fh}, foot {meta['foot']}")
    with open(os.path.join(outroot, name, "meta.json"), "w") as f:
        json.dump(meta, f, indent=1)


def main():
    with open(OPT["scenes"]) as f:
        data = json.load(f)
    only = OPT["only"].split(",") if OPT["only"] else None
    for name, ent in data["entities"].items():
        if only and name not in only:
            continue
        render_entity(name, ent, OPT["out"])


main()
