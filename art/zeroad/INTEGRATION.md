# Integration proposals for the zeroad pack

The pack pipeline only touches `art/zeroad/` and `mods/empires/packs/zeroad/`.
These changes elsewhere are needed before the pack can be committed and
shipped. They are proposals for whoever owns those files.

## 1. `tools/asset-check.ts`: accept the pack's own manifest

Today CC-BY-SA-3.0 is allowed only under `assets-cc-by-sa/`, and every file
needs an entry in `mods/empires/assets.manifest.json`. SPEC §13.1 (v0.2) puts
the 0 A.D. derived files in `packs/zeroad/` with their own `LICENSE`. Proposal:

- For files under `packs/<name>/`, read provenance from
  `packs/<name>/pack.manifest.json` (`files` map, keys relative to the pack
  folder) instead of `assets.manifest.json`. Exempt `pack.json`,
  `pack.manifest.json`, `README.md` and `LICENSE` inside a pack folder.
- Allow `CC-BY-SA-3.0` under `packs/zeroad/` (or generally `packs/*/` when
  that folder has a `LICENSE`), in addition to `assets-cc-by-sa/`.
- Each entry already carries `source` (string), `sources` (0 A.D. paths under
  `binaries/data/mods/public/art` at the commit in `_about`), `url`,
  `author: "Wildfire Games"`, `license: "CC-BY-SA-3.0"`, `modified: true`,
  `generator`.

Sketch:

```ts
const packDir = join(modDir, "packs");
for (const pack of existsSync(packDir) ? readdirSync(packDir) : []) {
  const pm = join(packDir, pack, "pack.manifest.json");
  if (!existsSync(pm)) continue;
  for (const [f, e] of Object.entries(JSON.parse(readFileSync(pm, "utf8")).files))
    manifest[`packs/${pack}/${f}`] = e;
}
// and: SA allowed when f.startsWith("assets-cc-by-sa/") || /^packs\/[^/]+\//.test(f) && existsSync(<pack>/LICENSE)
// and: EXEMPT pack.json, pack.manifest.json, LICENSE inside packs/*/
```

## 2. `CREDITS.md`: replace the "no tier-D assets" sentence and add a section

The "Not used" paragraph currently says "no tier-D (CC BY-SA) assets"; that
becomes false. Proposed text:

```md
## 0 A.D. art pack (CC BY-SA 3.0)

`mods/empires/packs/zeroad/` contains sprites, terrain tiles, icons and
portraits derived from the art of **0 A.D.** by **Wildfire Games**
(https://www.wildfiregames.com/), source https://github.com/0ad/0ad at tag A26
(commit 0562a8c13982ee979f852004756dd3f16453acc7), licensed under
CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/). The 3D models
were rendered to sprites and the textures resampled by `art/zeroad/`; these
derived images are themselves released under CC BY-SA 3.0. See
`mods/empires/packs/zeroad/LICENSE` and, per file, `pack.manifest.json`.
Some 0 A.D. textures derive from CGTextures materials, redistributed as
CC BY-SA by special permission (upstream `art/LICENSE.txt`).
```

## 3. `tools/install.sh`: copy the pack folder

`install.sh update` prunes unknown files inside the mod folder (SPEC §18.4),
so `packs/zeroad/**` must be in whatever list it copies/keeps.

## 4. `.gitignore`

Nothing new required: all inputs go to `art/sources/` and all intermediates
and the contact sheet to `art/out/`, both already ignored.

## 5. `tools/hygiene-check.sh`

No change needed: every pack file is under 2 MB (largest is `terrain/ground.png` ≈ 1.2 MB; unit sheets ≈ 0.1 MB),
and no committed text contains home paths, emails or IPv4-like strings. The
pack `LICENSE` is the CC legal code text, which contains no addresses.

## 6. Notes for the world role (`mods/empires/*.js`)

- `pack.json` follows SPEC §18.4. Additions the loader can ignore or use:
  `entities.*.size` (image/canvas size), `entities.*.source` (which 0 A.D.
  actor stands in), `entities.*.scale_px_per_m`, `sheetLayout` (row order
  `S, SW, W, NW, N, NE, E, SE`; S faces the viewer, clockwise on screen;
  directions are ground-plane 45° steps so diagonals follow tile edges),
  `playerColorValues`.
- Unit sheets: every animation shares `frame` and `anchor`, so switching
  animation never jumps. Frame `i` of direction `d` is at
  `(i * frame[0], d * frame[1])`.
- Static entities with several images (`house`, `tree`) put every variant on
  one canvas size with one anchor, so `variants` stay plain strings.
- Buildings are coloured (`{color}` in the path); nature is not.
- `unitLooks` lists six interchangeable unit entities (`villager`,
  `villager_b` … `villager_f`): same anim names, frame counts, `frame` and
  `anchor`. Sheet paths: `units/<look-with-dashes>-<anim-with-dashes>-{color}.png`.
- Progression buildings: `market`, `blacksmith`, `defense_tower`,
  `sentry_tower`, `field`, `corral`, `fortress` (2 variants), `wonder`,
  `palisade`, `palisade_corner`, `gate`. `playerColor: false` entities
  (`field`, palisades, `gate`) have a plain `image` path with no `{color}`.
  `field` is a flat ground decal: draw it with the ground layer, not depth-sorted.
- Villager anim names: `idle`, `walk`, `gather_wood`, `gather_gold`, `carry`,
  `build`. There is no `gather_stone`/`gather_food`; fall back to
  `gather_gold` (pick) and `gather_wood` or `build` respectively.
- Terrain: draw `terrain.ground` tiled at `terrain.groundSize` (it repeats
  exactly in x and y; tile origin is arbitrary). `dirt_patch` (`image`,
  `variants`, `size`, `anchor` = centre) is a ground decal: draw it after the
  ground and before every depth-sorted sprite; scaling it ~1.5× suits a
  town centre.
- UI portraits are 0 A.D. session portraits (not square crops of HUD frames);
  scale them down as needed.
