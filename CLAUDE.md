# Herdr Empires: instructions for build agents

Read `SPEC.md` first; it is the complete brief. `SPIKES.md` records what the
Herdr API really does (answers to SPEC §8). `RECIPE.md` is the from-scratch
build brief for herdr.dev.

## Non-negotiable rules
- **Hygiene (SPEC §15):** never commit AI state, Herdr app state, usernames,
  hostnames, emails, absolute home paths, tokens or raw downloads. Run
  `tools/hygiene-check.sh` before every commit (it is also the CI guard).
- **Assets (SPEC §13):** every non-JS file under `mods/empires/` needs an entry
  in `mods/empires/assets.manifest.json` with an allow-listed license.
  `bun tools/asset-check.ts` must pass. Nothing from any commercial game, ever.
- **Throwaway app home:** test with `HERDR_APP_HOME=$(mktemp -d)`; never touch a
  real `~/.config/herdr-app`; never commit anything from an app home.
- **No timers for animation:** no `setTimeout`/`setInterval`; `cx.timer` only
  for data, never faster than 1 s; motion is native (`.loop`, `.frames`,
  `.spin`, `.transition`).
- Product strings never name any commercial game or its publisher.

## Commands
```sh
bun install                      # dev deps (none at run time; users never run Bun)
bun test                         # data.js view-model tests
bun tools/check.ts mods/empires  # Bun stand-in for `herdr-app check` (see SPIKES.md R6)
herdr-app check mods/empires     # the real check, where a Herdr install exists
bun tools/asset-check.ts         # manifest / license guard
tools/hygiene-check.sh           # public-repo guard
bun art/generate.ts              # regenerate icons + frames (deterministic)
bun art/textures.ts              # procedural tiles
bun art/sounds.ts                # FFmpeg-synthesized sounds
tools/install.sh --home "$HERDR_APP_HOME" install --switch
```

## Layout of the code
- `layouts/empires.json` the window; `themes/empires*.json` palettes.
- `mods/empires/main.js` routes `props().role` to `roles/*.js`; `kit.js` is the
  drawing kit (palette, bevels, wood/stone/parchment, buttons, menus, sfx);
  `data.js` holds pure view-model functions (unit-tested, no Herdr imports).
- Shared state is namespaced `empires.*`; keys live in `keys.json` section
  `layout:empires` and are dispatched by the always-present `resources` role.
