# zeroad art pack

The default world art for Herdr Empires: isometric sprites rendered from the
3D models of [0 A.D.](https://play0ad.com) by Wildfire Games, plus its terrain
textures, resource icons and portraits.

**License: CC BY-SA 3.0** (see `LICENSE`). Original art © Wildfire Games,
https://www.wildfiregames.com/, https://creativecommons.org/licenses/by-sa/3.0/.
These files are derived works and stay CC BY-SA 3.0. `pack.manifest.json`
lists the 0 A.D. source files behind every image.

Built by `art/zeroad/build.sh` (see `art/zeroad/README.md`); do not edit by hand.

## Layout

| Path | Contents |
|---|---|
| `pack.json` | the pack descriptor (SPEC §18.4) |
| `units/<look>-<anim>-<color>.png` | sprite sheets for the six unit looks in `unitLooks` (one row per direction, frames left to right) |
| `buildings/<name>[-<variant>]-<color>.png` | one image per building (variant) and player colour; `buildings/<name>.png` when the model has no player colour |
| `walls/*.png` | wall pieces for the `walls` block. Segments and gates are seamless slices exactly `spanTiles` × 48 px wide, anchored at their ground midpoint; corners are anchored on the tile vertex. |
| `fauna/<animal>-<anim>.png` | animal sheets (sheep, boar, chicken), same layout as unit sheets, no player colour |
| `nature/*.png` | trees (7 variants), gold mine, stone mine, berry bush (2), rocks (3), bush (2), tuft (3, flat) |
| `terrain/ground.png` | 1024×512 seamless iso grass (tiles in x and y); `terrain.ground` / `terrain.groundSize`. Prefer it over the diamond tiles. |
| `terrain/dirt-patch-*.png` | 400×200 soft-edged dirt decals (entity `dirt_patch`, anchor = centre), for under town centres |
| `terrain/<kind>-<n>.png` | 96×48 2:1 diamond tiles (grass, dirt, forest floor); legacy, edges are hard |
| `ui/*.png` | resource icons and unit portraits |

### Sprite sheets

- Row order (`sheetLayout.dirOrder`): `S, SW, W, NW, N, NE, E, SE`. Row 0
  faces the viewer; the rest go clockwise as seen on screen. Directions are
  45° steps on the ground, so SW/NW/NE/SE run along tile edges.
- Frame `i` of row `d` sits at `x = i * frame[0]`, `y = d * frame[1]`.
- All animations of a unit share `frame` and `anchor` (the foot point, in px
  from the frame's top-left), so swapping animations never jumps.
- Each frame includes the unit's soft ground shadow.

### Player colours

`{color}` in a path is one of `blue, red, green, yellow, cyan, purple, gray,
orange` (values in `playerColorValues`). Colours were applied the way 0 A.D.
does it: the texture alpha masks where the player colour multiplies in.

### Anchors

Static images (`image` / `variants`) have one `anchor` per entity: the
model's origin on the ground, in px from the image's top-left. Draw the image
at `(footX - anchor[0], footY - anchor[1])` and depth-sort by foot y.
