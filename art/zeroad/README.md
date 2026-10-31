# art/zeroad: the 0 A.D. art pack pipeline

Builds `mods/empires/packs/zeroad/` (SPEC §18.4–§18.5) from the CC BY-SA 3.0
art of [0 A.D.](https://play0ad.com) by Wildfire Games.

```sh
sh art/zeroad/build.sh          # full build, ~13 min on 8 CPU cores (12 min Blender, 1 min compose)
sh art/zeroad/build.sh --quick  # 2 directions, low samples: preview only, don't commit
```

Then look at `art/out/zeroad-sheet.png` (gitignored contact sheet) before
committing the pack.

## Steps

| Script | Runs in | Does |
|---|---|---|
| `fetch.sh` | sh + git + curl | Blobless, sparse clone of https://github.com/0ad/0ad at tag **A26** (`0562a8c13982ee979f852004756dd3f16453acc7`) into `art/sources/zeroad/0ad/`. Pass 1 checks out only actor/variant/skeleton/material XML; pass 2 checks out exactly the meshes, animations and textures `resolve.py files` lists (~70 MB of working tree, ~85 MB of git objects). Downloads portable **Blender 4.5.15 LTS** (linux-x64) from an official mirror into `art/sources/tools/` and verifies its sha256. |
| `resolve.py` | python3 | Re-implements the subset of 0 A.D.'s actor system the pack needs: one variant per group (named selections win, else a fixed pick among frequency>0 variants), `file=` variant merging, textures/props/animations merging, props recursed onto attach points. Writes `art/sources/zeroad/scenes.json`. **Entity, terrain and UI choices live in this file** (`ENTITIES`, `TERRAIN`, `UI`). |
| `render.py` | Blender 4.5 | Imports each part with the legacy COLLADA importer (`import_units=True`), hangs props on `prop-*` bones/empties, binds the animation action (from a separate `.dae`) to the mesh armature, and renders with Cycles CPU: orthographic camera at 30° elevation (2:1 dimetric), azimuth 45°, warm sun from the screen's upper left, cool sky fill, invisible shadow-catcher ground, transparent film. Units: 8 directions × N frames at a fixed frame and foot point. Each frame writes the lit image (player colour = white) and an AOV mask of the player-colour weight. Renders at 2× final size. |
| `compose.py` | python3 + Pillow + NumPy | Tints frames with the 8 player colours (linear-light multiply by `mix(playerColor, 1, mask)`, the same formula as 0 A.D.'s model shader), downsamples 2× with premultiplied alpha, crops every entity to one shared box, packs sheets, saves sprites as 256-colour palette PNGs via libimagequant (visually lossless here, ~3× smaller; falls back to Pillow's octree quantizer), bakes the seamless ground and dirt decals, cuts terrain diamonds, copies UI art, writes `pack.json` and `pack.manifest.json`. |
| `sheet.py` | python3 + Pillow | Contact sheet: a small map scene drawn the way the world role would draw it, plus every animation strip, colours, tiles and icons. |

## Tool versions used

- Blender 4.5.15 LTS (portable tarball; system Blender 5.x has no COLLADA importer)
- Python 3.14, Pillow 12, NumPy 2.5 (any recent Python 3 / Pillow / NumPy should do)
- git with partial-clone support (2.25+), curl, ImageMagick (`magick`, only as a DDS fallback)

## Content choices

- **Unit looks** (`unitLooks` in pack.json; identical animation set, frame
  size, anchor and frame counts, so they are drop-in for each other):
  `villager` and `villager_f` (Celtic female citizen, two dress/hair
  variants), `villager_b` (Briton citizen spearman), `villager_c` (Gaul
  citizen swordsman; its rigid cloak prop is dropped), `villager_d` (Iberian citizen spearman),
  `villager_e` (Roman servus in a tunic). The men are turned into unarmed
  workers: `resolve.py` swaps their soldier stance for 0 A.D.'s male labourer
  stance (`base_slave_male`) and drops weapon/shield/helmet props, while the
  gather/carry/build variants still add the axe, pick, wood bundle and mallet.
  Animations: idle (8 frames), walk (12), gather_wood (8, axe), gather_gold
  (8, pick; 0 A.D. `gather_ore`), carry (8, wood bundle), build (8, mallet).
- **Buildings (Briton/Celt set):** civic centre (with its garrison banner, so
  the player colour shows) → `town_center`; house (2 variants); storehouse →
  `lumber_camp` and `mining_camp`; farmstead → `mill`; temple → `monastery`;
  barracks → `university`.
- **Progression buildings:** market, blacksmith, defense_tower (Briton
  wooden tower), sentry_tower (Briton scout tower), field (0 A.D. farmland
  decal; flat), corral, fortress (variant 0: Gaul walled fortress; variant 1:
  Briton broch), wonder (Briton ring fort, drawn at 7 px/m instead of 8.6),
  palisade (straight), palisade_corner, gate; Gaul houses join `house.variants`.
  Entities without any player-colour area (field, palisades, gate) ship a
  single image (`playerColor: false`).
- **Walls** (`walls` block in pack.json; kind `wall` in `render.py`):
  - Palisade: 0 A.D. rock-footed palisade (`props/special/palisade_rocks_medium`)
    for segments `palisade_a` and `palisade_b`, `palisade_rocks_gate` for
    `palisade_gate_a` and `palisade_gate_b`, and `palisade_rocks_tower`
    (at 0.85×) for the corner `palisade_post`.
  - Stone: Briton `wall_short` for `wall_a` and `wall_b`, `wall_gate` for
    `wall_gate_a` and `wall_gate_b`, and `wall_tower` for the corner.
  - **One tile edge per segment** (`segmentTiles: 1`). At building scale
    (8.6 px/m) a 96×48 tile edge is 7.89 m. Each mesh is stretched along its
    length to fit:
    - palisade: medium segment ×0.886 (made 25% longer than the tile so the
      stakes interlock);
    - stone: everything at 0.58× uniform, with the segment fitted to 1 tile
      (×0.58 along its length);
    - gates span 2 tiles (`spanTiles: 2`): palisade gate ×0.93, stone gate
      ×0.42 along its length.
  - **Seamless slices.** Each segment or gate is rendered between neighbouring
    copies of the segment, so its geometry and shadow continue on both sides.
    `compose.py` then cuts a vertical strip `spanTiles × 48` px wide, centred
    on the piece's ground midpoint. The camera is nudged so that midpoint
    falls on an exact pixel. Strips placed (±48, ±24) apart therefore tile
    with no gap or overlap.
  - Axis a runs along world X (screen upper-left → lower-right); axis b runs
    along world Y.
- **Fauna** (`fauna`; kind `fauna`): sheep, boar and chicken. Each has idle
  (6 frames) and walk (8 frames), 8 directions, unit scale, and no player
  colour.
- **Decor** (`decor`): `rocks` (3 variants), `bush` (2) and `tuft` (3; flat,
  drawn with the ground). `tree` gains a big oak, a dead oak, a beech and a
  bush-tree (7 variants). `berry_bush` gains a second variant.
- **Nature:** oak, birch and pine trees; temperate metal mine (gold), temperate
  stone quarry, berry bush.
- **Terrain:** `terrain/ground.png`, a 1024×512 seamless iso ground: two
  0 A.D. temperate grass textures rotated 45°, squashed 2:1 (3 texture
  periods per lattice axis, so the 2:1 rectangle repeats exactly in x and
  y), blended with integer-frequency (hence seamless) noise and graded
  brighter/greener. Two soft-edged `dirt_patch` decals (400×200) from
  `temp_dirt_gravel_b`. Legacy 96×48 diamond tiles: grass (3), dirt (2),
  forest floor (2), colour-matched per kind.
- **UI:** resource icons (food, wood, metal → gold, stone, population) and
  three portraits (female citizen, Briton spearman, Gaul swordsman).

## Known limitations

- 0 A.D. is antiquity, not the Middle Ages: Celtic roundhouses and thatch, not
  castles and cathedrals. Millennium A.D. was not evaluated (license check pending).
- Six villager looks, but no scout/monk/knight/king yet.
- `structures/plot_field.xml` (the grain field with 3D crops) is 2009-era 3ds
  Max COLLADA that Blender 4.5 imports as empty; the flat farmland decal
  (`plot_field_new.xml`) is used instead. The Gaul wonder rendered fine but
  was left out (it reads as a Roman camp, and the budget favoured unit looks).
- Player colour on most Briton buildings is limited to small shields and
  banners (that is how 0 A.D. paints them), so building colour reads weakly at
  final size. Units carry it on the tartan dress and read well.
- Normal, specular and parallax maps are ignored; lighting is a single sun
  plus sky. Wind animation on trees and the garrison flag's cloth animation
  are not rendered (rest pose).
- The baked ground shows a faint repeat at the texture-period scale when
  zoomed out; there is no grass/dirt transition art beyond the dirt decals.
  The legacy diamond tiles have hard edges and lose texture detail.
- Some gaia meshes float above their origin (0 A.D. drapes them on
  terrain); `render.py` lowers gaia to touch the ground (fixed the floating
  stone mine). The shadow catcher's faint whole-frame sky occlusion is
  removed in `compose.py`.
- Fauna that Blender 4.5's COLLADA importer cannot animate:
  - deer: its 3ds Max animations have a different rest pose from the mesh,
    so the limbs explode, with or without unit conversion;
  - goat: its animation keys come in scaled about 500×;
  - cow and pig: their animation `.dae` files fail to parse.

  The lead asked for deer, goat and cow; chicken was added instead.
- Stone wall slices include a sliver of the neighbouring segment's shadow at
  the start of a run (the render assumes the wall continues). Corner pieces
  cover most of it.
- Particle props (smoke, sparkles) are skipped; ground decals are drawn as
  flat textured quads.
- Animation sampling is uniform over each clip; 0 A.D.'s `speed` attributes
  are ignored, the pack's `fps` sets playback speed.
- Renders are deterministic in content but Cycles noise/denoise can change
  pixels slightly between machines, so a rebuild produces a non-empty PNG diff.
