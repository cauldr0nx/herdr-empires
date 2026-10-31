# Herdr Empires

A medieval real-time-strategy theme for the [Herdr](https://herdr.dev) desktop
app. Agents become **units**, spaces become **towns**, tabs become
**buildings**, and the window becomes an RTS HUD: a resource bar that counts
real things, a command card, a selected-unit panel and a diamond minimap. A
herald brings news from the front. Everything maps to a real Herdr command,
and nothing from any commercial game ships here (SPEC §13).

![Herdr Empires](preview.png)

> `preview.png` is currently a rendered mock of the layout, not a screenshot:
> the build environment could not run Herdr (see `SPIKES.md` R6). Replace it
> with `herdr-app shot` from a clean demo profile before publishing.

## Install

```sh
git clone https://github.com/cauldr0nx/herdr-empires
cd herdr-empires
tools/install.sh install --switch
```

The installer copies `layouts/empires.{json,svg}`, `themes/empires*.json`
and `mods/empires/` into your Herdr app home (`$HERDR_APP_HOME`, else
`~/.config/herdr-app`), merges the `layout:empires` keys into your
`keys.json` (never replacing a binding you already have; it backs the file
up first), runs `herdr-app check`, and switches to the layout. It refuses to
overwrite any file of the same name that it did not install.

| Want | Do |
|---|---|
| Enter the theme | `ctrl-shift-l` (cycles layouts), Settings → Look → Herdr Empires, or `herdr-app do layout.switch --name empires` |
| Leave it | `ctrl-shift-l` again, or Menu → Resign |
| Only the colours on your normal layout | Settings → Look → theme `empires-parchment` (light) or `empires-dusk` (dark) |
| Update | `tools/install.sh update` |
| Remove | `tools/install.sh uninstall` |
| Panic | `ctrl-alt-shift-escape` (Herdr's unbindable reset) |

## Keys (`layout:empires`)

| Key | Action |
|---|---|
| `alt-.` | next idle or finished unit |
| `alt-,` | next unit under attack (blocked) |
| `alt-m` | game menu |
| `alt-t` | train a unit (new agent tab) |
| `alt-g` | garrison (settle) the current tab |
| `ctrl-shift-h` | hide/show the HUD |
| `f1` | tech tree (every key binding) |

## What the HUD shows

- **Food / Wood / Gold / Stone / Population**: agents working, idle, tasks
  completed this session, agents blocked, live agents over a pop cap. Hover a
  counter to read exactly what it counts; the mapping is configurable in
  Options. Nothing is estimated.
- **Ages**: Camp → Village → Keep → Crown as tasks complete (cosmetic, resets
  each session, off in calm mode).
- **Status everywhere**: amber shimmer = working, red pulse + crossed swords =
  blocked (needs you), green laurel = done, gray = idle.

## Development

Requires Bun (generators, tests), ImageMagick/Chromium (contact sheets),
FFmpeg (sounds). Users never run Bun: generated assets are committed.

```sh
bun test                           # view-model tests (data.js)
bun tools/check.ts mods/empires    # Bun stand-in for `herdr-app check`
bun tools/asset-check.ts           # every asset has provenance and an allowed license
bun tools/contrast.ts              # terminal palette contrast
sh tools/hygiene-check.sh          # public-repo guard (also the pre-commit hook: tools/install-hooks.sh)
sh tools/install-test.sh           # installer round-trip on a throwaway home
bun art/generate.ts . && bun art/textures.ts . && bun art/sounds.ts .   # regenerate art (deterministic)
```

Always test against a throwaway app home: `HERDR_APP_HOME=$(mktemp -d)`.
See `SPEC.md` (the brief), `SPIKES.md` (what the Herdr API really does),
`RECIPE.md` (the from-scratch build brief) and `CLAUDE.md` (rules for build
agents).

## Phase 2: the command layer

Off by default (Options → Command layer). Turns the command card into unit
orders on top of herdr-core (`hc`):

| Order | Does |
|---|---|
| Train | unit type (Villager, Scout, Monk, Mason, Captain) + agent program + orders + town; a new building (`tab.new`) or a worker in the current one (`hc run` with labels). The installed template's standing orders are shown in full and sent first. |
| Rally point | per town: the town's folder, or a new worktree per unit |
| Send message | `hc send` exactly what you typed to the selected units |
| Stop / Town bell | `hc interrupt` the selected units / every working unit in the town (confirms, names them) |
| Garrison / Ungarrison | `tab.settle` / `tab.unsettle` |
| Peek | `terminal.peek` a worker of the selected unit |
| Disband | `terminal.kill` (always confirms, names the units) |
| Queue | the town's production queue; auto-dispatch per town sends the next order when a unit goes idle, never to a blocked one; otherwise the herald asks |

Selection: click a unit; shift-click dots on the minimap or buildings in the
town overview to multi-select; `ctrl-shift-<digit>` assigns a control group,
`alt-shift-<digit>` selects it (groups are pruned when units end). A
Captain's workers show as a formation under it on the minimap and as
portraits in its card. Every destructive or multi-unit order confirms and
names its targets; messages to agents are what you typed or a template you
read; nothing leaves the machine. `tools/install.sh install --templates`
prints each unit template in full, asks which agent program they run, and
asks before installing. Token/cost counters are not shown: no reliable local
source exists yet, and the theme never estimates.

## License

Apache-2.0 (code, generated art and sounds). Fonts: SIL OFL 1.1, see
`CREDITS.md` and `mods/empires/fonts/OFL.txt`.
