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

- **Villager:** Celtic female citizen (`units/celts/female_citizen.xml`), the
  most medieval-looking gatherer. Animations: idle, walk, gather_wood (axe),
  gather_gold (pick, 0 A.D. `gather_ore`), carry (wood bundle), build (mallet).
- **Buildings (Briton/Celt set):** civic centre (with its garrison banner, so
  the player colour shows) → `town_center`; house (2 variants); storehouse →
  `lumber_camp` and `mining_camp`; farmstead → `mill`; temple → `monastery`;
  barracks → `university`.
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
- Only the female citizen is rendered; no scout/monk/knight/king yet.
- Player colour on most Briton buildings is limited to small shields and
  banners (that is how 0 A.D. paints them), so building colour reads weakly at
  final size. Units carry it on the tartan dress and read well.
- Normal, specular and parallax maps are ignored; lighting is a single sun
  plus sky. Wind animation on trees and the garrison flag's cloth animation
  are not rendered (rest pose).
- The baked ground shows a faint repeat at the texture-period scale when
  zoomed out; there is no grass/dirt transition art beyond the dirt decals.
  The legacy diamond tiles have hard edges and lose texture detail.
- Particle props (smoke, sparkles) are skipped; ground decals are drawn as
  flat textured quads.
- Animation sampling is uniform over each clip; 0 A.D.'s `speed` attributes
  are ignored, the pack's `fps` sets playback speed.
- Renders are deterministic in content but Cycles noise/denoise can change
  pixels slightly between machines, so a rebuild produces a non-empty PNG diff.
