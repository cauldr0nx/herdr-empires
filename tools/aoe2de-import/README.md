# aoe2de-import

Builds the **local** `aoe2de` art pack (SPEC §18.6) from your own copy of
Age of Empires II: Definitive Edition (Steam app 813780). The tool contains
**no game data**. It only reads an install you own and writes PNG sprite
sheets and a `pack.json` into your Herdr app home:

```
<app home>/empires-packs/aoe2de/
  pack.json             schema of SPEC §18.4, plus "dirOrder" and "playerColorHex"
  pack.manifest.json    which game file each output came from
  units/<entity>-<anim>-<color>.png
  buildings/<entity>-<color>.png
  nature/<entity>-<n>.png
  terrain/<name>-<n>.png
  ui/<key>.png          (only if found; unverified)
```

The output is for you alone. Never commit it, never publish it, and never use
it for `preview.png` or screenshots. Those use the shipped `zeroad` pack.

## Run

```sh
bun tools/aoe2de-import/main.ts [--source DIR] [--home DIR] [--list] [--dry-run]
#   --source DIR    the game folder (the one that holds resources/_common)
#   --home DIR      Herdr app home (default: $HERDR_APP_HOME, then
#                   $XDG_CONFIG_HOME/herdr-app, then ~/.config/herdr-app)
#   --list          show which whitelist entries exist in your install, then exit
#   --dry-run       decode everything, write nothing
#   --no-shadow     leave shadows out of the sheets
#   --dir-offset N, --dir-ccw   fix sprite facing if it comes out rotated
```

The mod never runs this by itself. It prints every file it reads and writes.
It opens game files read-only. It refuses to write inside the game folder or
inside this repository. It exits with status 2 if it finds no install.

**Finding the install:** it uses `--source` when given. Otherwise it looks in
each Steam root (`~/.steam/steam`, `~/.steam/root`, `~/.local/share/Steam`,
the Flatpak path `~/.var/app/com.valvesoftware.Steam/.local/share/Steam`,
and Snap) and in every library listed in that root's
`steamapps/libraryfolders.vdf`, for `steamapps/common/AoE2DE`. On Windows it
also tries the usual Steam folders. A folder counts as an install when it has
`resources/_common/drs/graphics/`.

## What it decodes

| Input | Where | How |
|---|---|---|
| SMX (`SMPX` magic) | `resources/_common/drs/graphics/` | palette-indexed, 4plus1 / 8to5 packing; player-colour pixels; shadow layer |
| SLD (`SLDX` magic) | same | BC1 main layer, BC4 shadow layer, BC4 player-colour mask; "reuse previous frame" blocks |
| JASC-PAL palettes | `resources/_common/palettes/` (+ `palettes.conf`) | for SMX only |
| DDS | `resources/_common/terrain/textures/` (recursive) | BC1/BC3/RGBA natively; anything else (for example BC7) through ImageMagick `magick` if installed |

The format is detected from each file's magic bytes. The extension is not
used. Damage masks and outline layers are skipped.

**Player colour.** Each frame is rendered once per pack colour: blue
`#3561d9`, red `#d23a2f`, green `#3e9e48`, yellow `#e2c13a`, cyan `#3cb3bf`,
purple `#8a4fc2`, gray `#9b9b9b`, orange `#e3802c`. SMX player pixels take
their shade from the brightness of `playercolor_blue.pal` at that index (a
flat shade if the file is missing). The pack colour is then darkened or
lightened to match. For SLD files, the BC4 mask is used as a blend weight, and
the shade comes from the brightness of the base pixel. The game's own shader
is not documented, so treat both as close approximations.

**Directions.** Each sheet has one row per direction in `dirOrder`: `s, sw, w,
nw, n, ne, e, se`. That is clockwise on screen, starting from facing the
viewer. Each row holds that direction's frames, left to right. The tool
assumes source files store frames direction by direction: 16 directions (or
8), starting at south and going clockwise. A 16-direction file keeps every
second direction. A file whose frame count divides by 5 but not by 8 is
treated as the classic 5-direction layout, and the east side is mirrored. Any
other file repeats its frames on all 8 rows. See `directions.ts`.

**Anchors.** All animations of one entity share one cell size. The cell is the
union of every frame's extent around its hotspot. `anchor` is the hotspot's
position inside that cell.

**Terrain.** For each terrain, a square patch of the texture (side = a quarter
of the texture) is resampled into 96×48 diamond tiles, four variants per
terrain.

## Honest limitations

- **Not tested against real game files.** The game was not installed on the
  machine where this was written. The decoders are tested against small
  synthetic SMX, SLD and DDS files that the tests build byte by byte from the
  format documentation (`tests/aoe2de/`). Expect some fixes on the first real
  run.
- **The file-name whitelist (`whitelist.ts`) is a best guess** based on
  community naming such as `u_vil_male_villager_idleA_x1.sld`. Run `--list`
  first. It shows found and missing entries, with near-miss suggestions for
  the missing ones. Then edit the patterns.
- Direction start and rotation, the `palettes.conf` syntax, the terrain
  texture names and scale, and the UI icon locations are also unverified.
- Sounds (Wwise banks) are out of scope.

## Credits

The sprite format knowledge comes from the **openage** project
(https://github.com/SFTtech/openage): `doc/media/smx-files.md`,
`smp-files.md`, `sld-files.md`, with openage's converter used as a reference
for bit orders. This is an independent implementation, written from those
notes. No openage code is copied. Age of Empires II: Definitive Edition is a
trademark of its owners. This project is not affiliated with them.
