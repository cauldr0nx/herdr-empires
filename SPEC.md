# Herdr Empires: specification

> Status: **v0.1 draft spec, nothing built yet.** This single file is the
> complete brief for building the project. A build agent should be able to
> work from this file plus a Herdr install alone.

A medieval real-time-strategy total-conversion layout for the
[Herdr](https://herdr.dev) desktop app (`herdr-app`, Apache-2.0). Agents
become units, spaces become towns, tabs become buildings, and the window
becomes an RTS HUD: resource bar, command card, selected-unit panel, diamond
minimap. Phase 1 is a pure **look + navigation** layer. Phase 2 adds an
**RTS-style agent command layer** on top of herdr-core (`hc`) (§14).

The look evokes classic medieval RTS games in general. It ships **none** of
their art, audio, names or trademarks (§1, §13).

**How to read this:** §16 is a primer on how Herdr can be restyled (read it
first if you haven't built a Herdr layout before). §0–§11 are the Phase 1
product and build spec. §13 covers assets and licensing, §14 orchestration
(Phase 2), and §15 the public-repo hygiene rules, which are **mandatory**.

---

## 0. Goals and non-goals

**Goals**
1. A complete restyle at Herdr 98's depth: every visible surface (bars, pane
   frames, menus, dialogs, boot screen, notifications) is drawn by our mod.
2. **Trivially switchable:** one install step; `ctrl-shift-l` / Settings →
   Look / `herdr-app do layout.switch --name empires` in and out; the user's
   own layouts, keys and settings are never modified destructively.
3. Faithful to Herdr's model. "Every layout shows the same world": nothing
   hidden that the user needs; every action maps to a real Herdr command.
4. 100% redistributable assets (§13); no trademarks in the product.
5. Readable and fast for 8-hour use: terminal text stays crisp; no
   timer-driven animation; theme works at zoom 0.75–2 and on portrait monitors.

**Non-goals (v1)**
- Not a game. No units walking around a map in v1 (stretch, §12).
- No modification of Herdr itself; no reliance on undocumented APIs.
- No network access by the mod in Phase 1 (keeps install review trivial).
- No copying of the original game's art, audio, names or exact layout pixels.

## 1. Naming

| Thing | Value |
|---|---|
| Product / display name | **Herdr Empires** |
| Layout file / id | `layouts/empires.json` (`layout.switch {name: "empires"}`) |
| Layout-owned palette | `themes/empires.json` |
| Standalone palettes (usable on any layout) | `themes/empires-parchment.json` (light), `themes/empires-dusk.json` (dark) |
| Mod folder | `mods/empires/` |
| Shared-state prefix | `empires.*` |
| Keys section | `layout:empires`, actions `empires.<command>` |

Product strings never mention "Age of Empires", "AoE" or other marks
(§1, §13).

## 2. Repository layout

The repo root **mirrors the Herdr app home**, so install is a copy and the
repo is directly publishable to herdr.dev/layouts (topic `herdr-layout`).

```
herdr-empires/
├── layouts/
│   ├── empires.json            the layout (§5)
│   └── empires.svg             Settings preview, 320×200
├── themes/
│   ├── empires.json            layout-owned palette (§4.1)
│   ├── empires-parchment.json  standalone light palette
│   └── empires-dusk.json       standalone dark palette
├── mods/empires/
│   ├── mod.json                { "place": "none" }
│   ├── main.js                 role router (§6)
│   ├── kit.js                  drawing kit: palette, materials, frames, buttons, sfx
│   ├── roles/*.js              one file per role
│   ├── data.js                 Herdr model → RTS view-model (pure functions, unit-testable)
│   ├── fonts/                  OFL fonts + OFL.txt
│   ├── icons/ img/ sounds/     generated + curated assets
│   ├── assets.manifest.json    provenance for every non-JS file (§13.3)
│   └── README.md
├── keys.json                   ONLY the layout:empires section, merged on install
├── templates/                  Phase 2 hc unit templates (opt-in install, §14.3)
├── art/                        generators (Bun), sources/ gitignored
├── tools/
│   ├── install.sh              install / update / uninstall (§3)
│   ├── hygiene-check.sh        pre-commit + CI guard (§15)
│   └── asset-check.ts          manifest/license guard (§11)
├── SPEC.md                     this file
├── RECIPE.md                   herdr.dev build brief (written at the end, from real files)
├── preview.png                 screenshot from a clean demo profile
├── CREDITS.md  NOTICE  LICENSE (Apache-2.0)
└── CLAUDE.md                   instructions for build agents
```

## 3. Installation and switching

### 3.1 `tools/install.sh`
- Resolve the app home: `$HERDR_APP_HOME`, else `~/.config/herdr-app`
  (macOS/Windows paths: confirm from Herdr docs during M0; never hard-code a
  user's path).
- `install`: copy `layouts/empires.{json,svg}`, `themes/empires*.json`,
  `mods/empires/` into the app home. **Refuse to overwrite** a non-ours file
  of the same name (detect ours via a marker field, e.g. root
  `"x_empires": {"version": "…"}` in the layout and `mods/empires/.empires-version`).
- Merge `keys.json`'s `layout:empires` section into the user's `keys.json`:
  add missing keys, never replace a binding the user already has; back the
  file up first (`keys.json.bak-<time>`); validate JSON before and after.
- Run `herdr-app check <home>/mods/empires`; print result.
- Optionally `--switch`: `herdr-app do layout.switch --name empires`.
- `update`: same as install but replaces files that carry our marker.
- `uninstall`: switch away if shown (`layout.switch {name: "main"}`), remove
  our files and our `layout:empires` keys section, and leave everything else alone.
- Idempotent, POSIX sh, no network, no sudo, prints every path it touches.
- Phase 3: a PowerShell twin for Windows.

### 3.2 Switching in and out (what the user does)
| Want | Do |
|---|---|
| Enter the theme | `ctrl-shift-l` (cycles layouts), or Settings → Look → pick "Herdr Empires" (shows `empires.svg`), or palette "Switch layout" |
| Leave it | `ctrl-shift-l` again, an in-theme **"Resign"** item in the game menu (→ `layout.switch {name: "main"}`), or Settings |
| Only the colours on my normal layout | Settings → Look → theme `empires-parchment` / `empires-dusk` |
| Panic | `ctrl-alt-shift-escape` (Herdr's unbindable reset) |

The layout carries its whole look (fonts, palette, chrome), so switching
needs no other setting changes, the same way Herdr 98 works.

## 4. Visual language

**Mood:** a carved-stone and dark-wood command HUD framing a warm,
low-glare "night camp" terminal; parchment for dialogs; thin gold trim for
focus/selection; player colours for spaces.

### 4.1 Palette (starting point; tune in M1 against real terminals)

| Token | Hex | Use |
|---|---|---|
| `stone.face` | `#6e665a` | HUD panels, buttons |
| `stone.light` / `stone.hi` | `#8c8375` / `#b0a693` | bevel highlights |
| `stone.shadow` / `stone.dark` | `#3d382f` / `#1f1c17` | bevel shadows |
| `wood.dark` / `wood.mid` / `wood.light` | `#2e1f12` / `#4f341c` / `#7a5230` | bars, pane headers |
| `parchment` / `parchment.edge` | `#e9d8ae` / `#c9b07a` | dialogs, tooltips, menus |
| `ink` | `#2a1c0d` | text on parchment |
| `gold` / `gold.bright` | `#b8922a` / `#ecc95a` | focus border, selection, default button |
| `hud.text` | `#f1e6c8` | text on stone/wood |
| terminal `background` / `foreground` | `#16110b` / `#e7d9b6` | terminals |
| `selection` | `#5a4320` | terminal selection |
| `working` | `#e0a63a` | amber: gathering |
| `blocked` | `#d63c2e` | red: under attack |
| `done` | `#79bd4a` | green: task complete |
| `idle` / `unknown` | `#8f8678` / `#6f685d` | stone gray |

**Player colours** (spaces; ordered like the genre convention, our own
hexes): blue `#3561d9`, red `#d23a2f`, green `#3e9e48`, yellow `#e2c13a`,
cyan `#3cb3bf`, purple `#8a4fc2`, gray `#9b9b9b`, orange `#e3802c`. Herdr
already assigns each space a colour slot (`shared("space.colors")` maps
space id → `ansiN`); map `ansi1..ansi8` → the 8 player colours so a space's
colour matches across layouts.

**ANSI 16:** warm but readable; every colour must reach ≥ 4.5:1 contrast
against the terminal background except ansi0/ansi8 (verify with a script in M1).

### 4.2 Typography
- Display (titles, age banner, dialog captions): **Cinzel** Bold, small caps feel.
- UI body: **Alegreya Sans** 12–13 px (fallback Alegreya / EB Garamond).
- Numbers in the resource bar: Alegreya Sans SC or tabular figures.
- Terminal: **JetBrains Mono** (bundled by Herdr), size from settings unless
  the user hasn't set one (default 14).
- Fonts ship in `mods/empires/fonts/` with `OFL.txt`; Herdr loads them automatically.

### 4.3 Materials and frames
Drawn by `kit.js`, preferably in code (like Herdr 98's `bevel()`): stacked 1 px
borders for stone bevels, gradients for wood, and small tileable textures only where
code can't fake it. Textures at low contrast so text stays legible. Gold
trim = the focused/selected state everywhere (pane, menu row, unit button).

### 4.4 Sound
Per §13. All sounds go through `kit.sfx(name)`, which respects
`settings().sounds.enabled === false` and an in-theme mute
(`shared("empires.mute")`). **Agent alerts:** Herdr itself already plays
done/blocked sounds globally; the mod must not double them. The Options
dialog offers "Use Empires alert sounds", which sets `settings.json`
`sounds.done/blocked` to our files only on explicit click, and restores the
previous values on un-check (store the previous values in
`shared("empires.prevSounds")`). Default: off.

## 5. The layout

### 5.1 Mockup (landscape)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ⚑ Menu │ 🌾 3  🪵 2  🪙 14  🪨 1  👤 7/16 │   ── Village Age ──   │ ⏱ 01:42:10 ⚙ ─□✕│ resources 34px
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌─[🛡 Claude Code · herdr-empires (main)  ▰▰▰▰▱ working 4m]─────[⌂][⤢][⇲][✕]┐ │
│ │                                                                          │ │
│ │  terminal                                                                │ │ main: tab:active,
│ │                                                                          │ │ pane header = banner role
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌─[⚒ Shell · ~/src/api ]──────────────┐┌─[📜 Codex · api (fix-auth) ⚔ BLOCKED]┐ │
│ │                                     ││                                     │ │
│ └─────────────────────────────────────┘└─────────────────────────────────────┘ │
├──────────────┬───────────────────────────────────────────────┬───────────────┤
│ [⚒][⇥][⇩][⤢][✕]│ ┌────┐  Claude Code — "fix login"            │      ◆        │ hud 150px
│ [⌂][✎][⚑][🔔][💤]│ │icon│  ~/src/api · main · tab 2 of 3        │   ◆ ◆ ◆ ◆     │  command | selection | minimap
│ [📜][?][⚙][  ][  ]│ └────┘  ▰▰▰▰▰▰▱▱ working 4m · 2 sub-agents   │      ◆        │
│              │  queue: (Phase 2)                               │ [idle 2] [⚔1] │
└──────────────┴───────────────────────────────────────────────┴───────────────┘
 floating: herald (advisor) bottom-left, toasts top-right
```

Portrait / narrow window (< 900 px wide): HUD collapses to two rows (command
card + minimap on one row, selection panel on top), resource bar drops labels.

### 5.2 Tree (sketch; exact sizes tuned in M1, refit by `fitLayout()`)

```jsonc
{ "id": "root", "type": "column", "titlebar": "none",
  "theme": "empires", "font": "JetBrains Mono", "ui_font": "Alegreya Sans",
  "background": "#1f1c17", "terminal_padding": [6, 4], "terminal_opacity": 1,
  "preview": "layouts/empires.svg", "terminal_menu": "empires-menu"?,  // §6.9: decide in M2
  "x_empires": { "version": "0.1.0" },
  "children": [
    { "id": "resources", "type": "block", "size": { "px": 34 }, "window_drag": true,
      "content": { "mod": "empires", "props": { "role": "resources" } } },
    { "id": "field", "type": "row", "padding": [8, 8],
      "children": [
        { "id": "main", "type": "block",
          "content": { "tab": "active", "pane": {
            "gap": 6, "radius": 0, "background": "background", "lone": true,
            "border": { "width": 3, "color": "#4f341c" },
            "focus":  { "width": 3, "color": "#b8922a" },
            "header": { "content": { "mod": "empires", "props": { "role": "banner" } },
                        "height": 26, "position": "top", "reveal": "always" } } } }
      ],
      "floating": [
        { "id": "herald", "content": { "mod": "empires", "props": { "role": "herald" } },
          "edge": "left", "align": "end" } ] },
    { "id": "hud", "type": "row", "size": { "px": 150 }, "resizable": false,
      "children": [
        { "id": "command",   "type": "block", "size": { "px": 260 }, "content": { "mod": "empires", "props": { "role": "command" } } },
        { "id": "selection", "type": "block",                          "content": { "mod": "empires", "props": { "role": "selection" } } },
        { "id": "minimap",   "type": "block", "size": { "px": 220 }, "content": { "mod": "empires", "props": { "role": "minimap" } } } ] } ] }
```

`hud` is hideable (`layout.toggle {id: "hud"}`, key `empires.toggle_hud`) for
max terminal space. The resource bar stays.

## 6. Roles (one mod, many roles, like Herdr 98)

`main.js` routes `props().role` to a class in `roles/`. All roles draw through
`kit.js`. Data comes from `data.js` (pure functions over `spaces()`, `agents()`,
`panes()`, `terminals()`, `focused()`), so it is testable without the app.

### 6.1 `resources`: top bar (window-drag)
- Left: **Menu** button (game menu: Options, Tech Tree = help, Chronicle,
  Resign = leave layout, About).
- Resource counters, each an icon + number + tooltip that says exactly what
  it counts (honesty rule: never show a fake metric):

  | Resource | Default meaning | Source |
  |---|---|---|
  | Food | agents **working** | `agents()` status |
  | Wood | agents **idle** | `agents()` |
  | Gold | tasks **completed** this session (transitions into `done`) | counted in mod, `shared("empires.session")` |
  | Stone | agents **blocked** (pulses red when > 0) | `agents()` |
  | Population | live agents / pop cap (cap configurable, default 16) | `agents()`, `terminals()` |

  The mapping is configurable in Options (`shared("empires.resources")`).
  Phase 2 adapters may add *tokens* and *cost* where a reliable local source
  exists; otherwise they're hidden, never estimated.
- Center: **Age** banner (§7.3) with a thin progress bar to the next age.
- Right: session clock (time since app start or since the theme was entered),
  settings, window buttons when `window().buttons` (Linux/Windows), else leave
  room for macOS traffic lights (`traffic_lights`).
- Clicking Stone jumps to the first blocked agent (`agent.focus`); Wood cycles idle.

### 6.2 `banner`: pane header (one per pane)
- Wooden plank bar; a pennant in the pane's **space player colour** at left;
  **unit portrait**: the program icon (`programIcon` pattern from Herdr 98) in
  a small stone frame; title: `Program · repo-or-folder (branch)`, with
  `~` for home and **never a full absolute path** (screenshots go public).
- **Status as an HP-style bar:** working = amber bar with native
  `.loop("opacity")` shimmer + elapsed time from `TabInfo.working_since`;
  blocked = red, crossed-swords badge, pulsing; done = green laurel until
  seen; idle = gray. Shells show no bar.
- Buttons (stone, gold on hover): garrison (`tab.settle`), split right/down
  (`pane.split`), zoom (`pane.zoom`), close (`pane.close`). Double-click = zoom;
  right-click = parchment context menu.
- Focused pane: gold trim on header + frame (layout `focus`).

### 6.3 `command`: command card (bottom-left)
3×5 grid of stone buttons with glyph icons, hotkey letter in the corner,
tooltip with name + key. Context-sensitive on the focused pane:

| Slot | Action | Command |
|---|---|---|
| Train | new agent tab (agent picker from `knownAgents()`, task prompt) | `tab.new {argv, task}` |
| Build | new shell tab | `tab.new` |
| Split → / ↓ | split | `pane.split` |
| Zoom | maximize pane | `pane.zoom` |
| Garrison | settle tab | `tab.settle` |
| Rename | rename tab/space | `tab.rename` / `space.rename` |
| Found town | new space (folder picker) | `space.new` + `pickFolder` |
| Worktree | new/open worktree space | opens shipped `worktree` mod dialog |
| Idle unit | next idle/done agent | `agent.focus` |
| Bell | next blocked agent (Phase 2: interrupt-all with confirm) | `agent.focus` |
| Tech tree | keybinding help dialog | dialog |
| Close | close pane | `pane.close` |
| Options | options dialog | dialog |

Phase 2 swaps in unit-specific orders (§14.4).

### 6.4 `selection`: selected-unit panel (bottom-center)
For the focused pane: large portrait, name (program + tab name), location
(space · folder · branch), status bar + elapsed, tab position ("tab 2 of 3"),
sub-agent count (`terminals()` with `parent` = this terminal) shown as small
worker portraits you can click (`terminal.peek`). For a mod pane: its title.
Nothing focused: town overview of the active space (tabs as building icons
with status badges, click = `tab.select`).

### 6.5 `minimap`: diamond map (bottom-right)
- A diamond (drawn with `PathBuilder`/`paint_path`, as Herdr 98 draws
  gradients) divided into **territories**, one per space, in player colours;
  the active space outlined in gold; remote-machine spaces (`space.machine`)
  across a "river".
- Inside each territory: tabs as small buildings, agents as dots coloured by
  status; blocked agents get a pulsing **ping ring** (native `.loop`).
- Click territory = `space.select`; click a dot = `agent.focus`.
- Below: **idle units** button (count of idle+done, cycles them) and an
  **alarm** counter (blocked, jumps to next).
- Must stay legible with 1–20 spaces; above ~12, territories become a
  ring of banners instead (decide in M2).

### 6.6 `herald`: floating advisor (Clippy equivalent)
Small portrait of an original herald character (scroll + trumpet). Shows the
most urgent agent event as a one-line parchment speech bubble ("A scholar in
*api* awaits your orders"), click = focus that agent, "Dismiss", "Silence the
herald" (`shared("empires.herald") = "off"`). Text from a small original line
bank per status. No voice lines in v1.

### 6.7 `menu`: popup menus
Parchment menus with wood frame, gold hover row, access-key underline,
submenus, separators, check/radio. Same item schema as Herdr 98's `openMenu`
(`{label, icon, shortcut, act, sub, disabled, checked, sep}`), opened with
`openOverlay({kind: "popup", frame: "none"})`.

### 6.8 `dialog`: all dialogs (overlay windows, `frame: "none"`)
Parchment scroll body, Cinzel caption on a wood header, wax-seal default
button. Kinds: `prompt`, `confirm` (close tab/space; mirrors Herdr's
confirmation semantics: pass `confirmed: true` only after the user agrees),
`about`, `options` (resource mapping, pop cap, mute, alert sounds, herald,
UI scale 1×/2×, HUD on/off, calm mode), `techtree` (keybindings from
`keys()`, rendered as a tree of "technologies" by category), `chronicle`
(session log, §7.4), `screen` (full-window: `loading`, `ageup`, `victory`,
`resign`).

### 6.9 Terminal right-click menu (optional)
`"terminal_menu"` lets a layout replace the terminal context menu. Ship it
only if we can match the shipped `menu` mod's items (copy, paste, split,
peek…) reliably; else keep Herdr's. Decide in M2.

### 6.10 Toasts
Herdr's `toast` mod draws notifications; replacing it means a different mod
name. v1: leave Herdr's toasts (they follow our palette via theme colours).
Stretch: an `empires` toast role if the API allows a layout-scoped toast mod.

## 7. Behaviour

### 7.1 Herdr model → RTS metaphor

| Herdr | Empires |
|---|---|
| machine | realm (remote machines across the river on the minimap) |
| space | **town**, with a player colour |
| tab | **building** (settled = garrisoned) |
| pane (terminal) | **unit**; shells = workers ⚒, agents = units by program |
| agent status working / blocked / done / idle | gathering / under attack / task complete / idle |
| sub-agent (`terminals().parent`) | worker attached to its unit |
| `agent.next/prev` | idle-unit cycling (we call `setAgentOrder` with our minimap order) |
| layout switch away | "Resign" |

### 7.2 Status presentation (consistent everywhere)

| Status | Colour | Badge | Motion | Sound |
|---|---|---|---|---|
| working | amber | hourglass | gentle opacity shimmer (native loop) | — |
| blocked | red | crossed swords | pulse + minimap ping | bell (only if alert sounds on) |
| done | green | laurel | none, until seen | brass two-note (if on) |
| idle | gray | — | none | — |

### 7.3 Ages (cosmetic progression)
The session advances through four **original** ages as tasks complete
(defaults: Camp Age 0 → Village Age 3 → Keep Age 10 → Crown Age 25 completed
tasks; configurable). Age-up: full-width banner over the resource bar
(not modal), fanfare (respecting mute), and an optional frame-material upgrade
(wood → stone → gold trim) as a **stretch**. Resets per session; no persistent
gamification pressure (calm mode hides it).

### 7.4 Chronicle (session log)
In-memory list of status transitions (time, town, unit, from → to), shown in
the `chronicle` dialog like a score screen: per-town tasks completed, time
working, time blocked. Persisted only under the app home (`localStorage` /
`shared`), **never** written into the repo or any file outside the app home.

### 7.5 Boot / loading screen
On entering the layout (at most every 30 min, like Herdr 98): full-window
loading screen (original illustration, rotating tips that teach Herdr keys,
progress bar that completes in ~1.5 s), horn fanfare. Click or any key
skips it. Never blocks longer than 2 s. Options can disable it.

### 7.6 Keys (`keys.json` section `layout:empires`)
Avoid plain ctrl+letters and anything in AGENTS.md's "programs rely on" list.
Proposed defaults:

| Key | Action |
|---|---|
| `alt-.` | `empires.idle` (next idle/done unit) |
| `alt-,` | `empires.alarm` (next blocked unit) |
| `alt-m` | `empires.menu` |
| `alt-t` | `empires.train` (new agent tab) |
| `alt-g` | `empires.garrison` (settle tab) |
| `ctrl-shift-h` | `empires.toggle_hud` |
| `f1` | `empires.techtree` |

Command dispatch lives in the always-present `resources` role (Herdr 98's
taskbar pattern).

### 7.7 Shared state keys
`empires.scale` (1|2), `empires.mute`, `empires.herald`, `empires.boot`,
`empires.session` ({startedAt, completed, age}), `empires.resources`
(mapping), `empires.popcap`, `empires.calm`, `empires.prevSounds`,
`empires.menus` (open menu stack). Never store paths or terminal content in
shared keys that other mods might render in screenshots.

## 8. Technical constraints and risks (spike these in M0)

| # | Question | Why it matters | Fallback |
|---|---|---|---|
| R1 | How does `image()` scale with explicit `w/h` (stretch/fit)? Any tiling? | No 9-slice API; textured frames | Code-drawn frames only (Herdr 98 style) |
| R2 | Can `PathBuilder` + `paint_path` draw arbitrary polygons with hit-testing for the minimap? | Diamond territories | Click regions as invisible absolutely-positioned divs; or square map |
| R3 | Is there rotation/transform? | Isometric diamond | Pre-rendered diamond SVG per territory count |
| R4 | Performance with ~20 panes × banner role + minimap re-render on every status change | Every redraw is whole-window | Memoize view-model in `data.js`; avoid per-frame timers |
| R5 | Do our sounds double Herdr's alert sounds? | §4.4 | Default alert sounds off |
| R6 | Can `herdr-app` run headless (Xvfb/Weston) in a cloud container for `herdr-app shot`? | Cloud build verification | `herdr-app check` + `data.js` unit tests in cloud; screenshots taken locally by a human in a clean demo profile |
| R7 | Floating-block frame: Herdr draws a rounded themed frame around floats. Can we make the herald look custom? | Look consistency | Style within the frame; use theme colours so the frame matches |
| R8 | Font loading: are OFL fonts with spaces in family names picked up from `mods/empires/fonts/`? | Typography | Rename families / use `ui_font` exact family name |
| R9 | `fitLayout()` pattern (mod calling `layout.set` on its own layout) on a third-party (non-shipped) layout | Crisp pixel sizes at any zoom | Ship sizes for zoom 1 only |
| R10 | macOS/Windows: window buttons, app-home path, `xdg-open` vs `open` | Cross-platform | Linux first; others in M5 |

## 9. Build environment notes (cloud agent)
- Needs: Bun (generators, tests), ImageMagick, FFmpeg, a Herdr app install
  for `herdr-app check` (Linux release from herdr.dev).
- Work on a **throwaway app home**: `HERDR_APP_HOME=$(mktemp -d)`; never
  touch a real user's home; never commit anything from it.
- `herdr-app check mods/empires` after every change; `bun test` for `data.js`.
- If R6 works: launch under Xvfb with a demo profile (spaces named `demo-api`,
  `demo-web`; fake agents via a tiny script that emits OSC 7501 statuses) and
  capture `herdr-app shot` images into a gitignored `shots/` folder for review.

## 10. Milestones and acceptance ("done when")

**M0, spikes + skeleton (½ day)**
- Answer R1–R9 in `SPIKES.md` with evidence (code snippets, screenshots
  stored outside the repo or in clean form).
- Skeleton mod with role router passes `herdr-app check`; layout switches in/out.

**M1, look foundation**
- `themes/empires*.json`, fonts bundled, `kit.js` (palette, bevels, wood/stone/parchment, buttons, gold focus, sfx).
- `resources` bar + `banner` role complete; terminal contrast script passes.
- Done when: a user can live in the layout all day with only these two roles and nothing looks like stock Herdr.

**M2, HUD**
- `command`, `selection`, `minimap` roles; idle/alarm cycling; `setAgentOrder`.
- `menu` + `dialog` (prompt, confirm, options, techtree, about).
- Done when: every action in §6.3 works by mouse and key; blocked agent visibly pings on minimap within one render.

**M3, atmosphere**
- Art generators + full asset set, `herald`, loading screen, ages, chronicle, sounds.
- `layouts/empires.svg` preview; `assets.manifest.json` complete; asset-check passes.

**M4, packaging**
- `tools/install.sh` (install/update/uninstall, key merge, marker detection),
  `RECIPE.md`, `preview.png` (clean demo profile), CREDITS/NOTICE, hygiene CI.
- Done when: fresh app home → `install.sh --switch` → working theme; `uninstall` leaves the home byte-identical except Herdr's own state files.

**M5, polish + platforms**: portrait/narrow layout, 2× scale, macOS/Windows check, calm mode.

**Phase 2**: §14.

## 11. Quality gates (every PR)
1. `herdr-app check mods/empires` passes.
2. `bun test` (view-model: status aggregation, resource counts, age thresholds,
   path shortening never emits absolute home paths).
3. `tools/asset-check.ts`: every non-JS file under `mods/empires/` has a
   manifest entry with an allow-listed license.
4. `tools/hygiene-check.sh` passes (§15).
5. No `setTimeout`/`setInterval`; no timers faster than 1 s; animations native only.

## 12. Stretch ideas (post-v1)
- Ambient animated units walking between buildings on the minimap (native `.loop("left"/"top")` only).
- Frame material upgrades with age.
- Numeric quick-message taunts sent to the focused agent (Phase 2: "1" = "continue", "2" = "run the tests"…), with original audio.
- Wonder timer: a timebox countdown per tab.
- Light "parchment day" layout variant.
- Publish to herdr.dev/layouts.

## 13. Assets and licensing

**Rule zero:** nothing from any Microsoft / Ensemble / Forgotten Empires game
ships: no textures, sprites, icons, cursors, fonts, audio (taunts, unit
voices, age-up fanfare, "wololo"), civ emblems, logos or names. Open-source
reimplementations like openage, freeaoe and FreeAge *convert the user's own
copy* of the original game. Their outputs are proprietary and off-limits. We
evoke the genre and the HUD arrangement (not copyrightable) and never copy
specific art or sound. (Engineering guidance, not legal advice; get a review
before a public release.)

### 13.1 Sourcing tiers (prefer the top)

| Tier | Source | License | Obligation | Use for |
|---|---|---|---|---|
| A | **Generated in-repo**: code-drawn SVG, procedural textures, FFmpeg-synthesized audio (the Herdr 98 approach) | Apache-2.0 (ours) | none | frames, bevels, buttons, icons, minimap, most sounds |
| A | **Original art** made for this project (hand-drawn, commissioned, or generated with a clean license and no style transfer from the original games' assets) | ours | record provenance | logo, herald, loading screen |
| B | [Kenney](https://kenney.nl/assets): Medieval RTS, Medieval Town, Castle Kit, UI Pack RPG Expansion, Game Icons, RPG Audio, Interface Sounds | CC0 | none | tiles, panels, UI sounds |
| B | [Freesound](https://freesound.org), **CC0 filter only** | CC0 | none | bells, horns, anvil, wood chop |
| B | Google Fonts: Cinzel, Alegreya, Alegreya Sans, EB Garamond, IM Fell, Almendra, MedievalSharp, Uncial Antiqua | SIL OFL 1.1 | ship `OFL.txt` beside the fonts | UI fonts |
| C | [game-icons.net](https://game-icons.net) ([SVG repo](https://github.com/game-icons/icons)) | CC BY 3.0 | credit each author in `CREDITS.md` | command-card glyphs, resource icons |
| D | [0 A.D.](https://play0ad.com) art/audio (`binaries/data/mods/public/art/**`, `audio/**`; UI in `art/textures/ui/`, resource icons in `ui/session/icons/resources/`) | CC BY-SA 3.0 | credit "Wildfire Games" + https://www.wildfiregames.com/ + CC link; **derived files stay CC BY-SA** | only by explicit decision |
| D | MegaGlest data; Unknown Horizons media (per-file check) | CC BY-SA 3.0 | same | only by explicit decision |
| ✗ | Widelands art (GPL), anything CC-NC, "free for personal use" fonts, Trajan, any original-game file | — | — | never |

**Default: ship v1 with tiers A–C only.** If tier D is ever used, it lives in
`mods/empires/assets-cc-by-sa/` with its own `LICENSE`, listed per file in
`CREDITS.md`.

### 13.2 Asset list (v1)
Design px at zoom 1; SVG where possible, else PNG @1x + @2x.

- **Fonts:** Cinzel Bold (display), Alegreya Sans (UI body, legible at
  11–13 px), JetBrains Mono for terminals (bundled with Herdr, nothing to ship).
- **Materials (code-generated preferred):** stone face + bevel set (raised /
  pressed / inset); dark wood plank (tileable 64×64); parchment (tileable
  128×128) + scroll caps; gold trim + 4 corner ornaments (16×16); wax seal;
  tintable pennant.
- **Icons (32 + 16 px):** resources (food, wood, gold, stone, population);
  ~15 command-card glyphs (§6.3); unit portrait frames around Herdr's program
  icons; buildings (town center = space, house = tab, watchtower = alert);
  status badges (hourglass, crossed swords, laurel, idle).
- **Screens:** loading screen (16:9 and 9:16 safe areas; portrait monitors
  exist), age-up banner ×4, victory/resign screens, `layouts/empires.svg`
  preview (320×200), `preview.png` (real screenshot, clean demo profile, §15).
- **Sounds** (original or CC0; mp3 96 kbps mono, < 100 KB each): boot horn
  fanfare (3–4 s), blocked = town bell ×3, done = brass two-note, age-up
  fanfare, stone click (button), wooden knock (menu), low horn (error), short
  non-vocal select chirp, victory/resign stings. No voice lines in v1.

### 13.3 Provenance manifest (required)
`mods/empires/assets.manifest.json`, one entry per non-JS file:

```json
{ "img/frame-corner.svg": { "source": "generated", "generator": "art/frames.ts",
    "url": null, "author": null, "license": "Apache-2.0", "modified": false, "notes": "" } }
```

`tools/asset-check.ts` fails on a file with no entry, or on a license outside
`{Apache-2.0, CC0-1.0, OFL-1.1, CC-BY-3.0, CC-BY-4.0}` (plus `CC-BY-SA-3.0`
only under `assets-cc-by-sa/`).

### 13.4 Pipeline
```
art/
  generate.ts   icons + frames as code-drawn SVG (Bun; ImageMagick for PNG)
  textures.ts   procedural wood / stone / parchment tiles
  sounds.ts     FFmpeg aevalsrc synthesis + loudness-normalize CC0 imports
  sheet.ts      contact sheet for review (output gitignored)
  import.ts     fetch pinned third-party files by URL + sha256, update manifest
  sources/      raw downloads (gitignored; re-fetched by import.ts)
```
Generated outputs **are committed** (users don't run Bun); generators are
deterministic so diffs stay reviewable.

---

## 14. Phase 2: the agent command layer

Build only after Phase 1 ships. The theme must remain fully usable without it
(feature flag `shared("empires.command") = true`, default off; **calm mode**
hides all of it).

### 14.1 Why on Herdr
Other "RTS for agents" projects (AgentCraft, AgentEmpire, arcane-agents,
tide-commander; see §17) are separate apps that wrap or scrape agent
sessions. Herdr already provides the substrate natively: persistent core
terminals, agent status (OSC 7501), parent/child sub-agents, labels,
multi-machine, and `hc` for run/send/wait. We add **controls and a view**,
not a runtime.

### 14.2 herdr-core primitives we build on (verify with `hc --skill`, `hc <cmd> --help`)
- `hc run --bg --name <n> --cwd <dir> [--on <machine>] [--label k=v]… <cmd|template> "<task>"`.
  Labels `herdr.space=<id>` + `herdr.tab=<id>` make a terminal appear in that space/tab.
- `hc templates`: role templates in `~/.config/herdr-core/templates/<name>.md`
  (frontmatter `name`, `description`, `command`; body = standing instructions).
- `hc send <t> "text"`, `hc send --wait`, `hc interrupt <t>` (stops the turn, not the process).
- `hc wait <t>`, `hc wait --children any|all`; `hc read <t> --lines N`; `hc ls --json`.
- App side: `tab.new {name, space, argv, task}`, `terminal.peek`,
  `terminal.keep`, `agent.focus`, `knownAgents()`, `terminals()` (with `parent`),
  the shipped `worktree` mod (`{branch, tab?, argv?}` props create a worktree space).
- Prefer app commands (`tab.new` with `task`) for visible units. Use `hc` for
  background sub-agents, waits and messaging.

### 14.3 Units = templates
Ship optional `hc` templates in `templates/` (installed only with
`install.sh --templates`, after showing the user what they contain):

| Unit | Template role | Default constraints in its instructions |
|---|---|---|
| Villager | general implementer | edits only within its assigned scope; reports via `hc send` when done/stuck |
| Scout | read-only explorer / researcher | no edits; writes findings to a file and reports its path |
| Monk | reviewer | read-only; reviews a diff or branch |
| Mason | test / build runner | runs the suite and reports failures |
| Captain | lead / orchestrator | may start units (explicitly allowed), uses `hc wait --children` |

The agent CLI per template comes from `knownAgents()` and user choice; never
hard-code a model or vendor.

### 14.4 Orders (command card in command mode)
| Order | Effect |
|---|---|
| **Train <unit>** | prompt for task + town (space) + optional worktree → `tab.new {argv, task}` (visible) or `hc run --bg` with labels (background worker) |
| **Rally point** | per town: default folder or "new worktree per unit" (via `worktree` mod) |
| **Send message** | to selected unit(s): `hc send` |
| **Stop** | `hc interrupt` selected (confirm if > 1) |
| **Town bell** | interrupt every working unit in the town (always confirms) |
| **Garrison / ungarrison** | `tab.settle` / `tab.unsettle` |
| **Peek** | `terminal.peek` a sub-agent |
| **Disband** | `terminal.kill` (always confirms, names the unit) |

- **Selection:** click to select; shift-click to multi-select on the minimap or
  in the town overview; **control groups**: `ctrl-shift-<digit>` assigns,
  `alt-shift-<digit>` selects (not `ctrl-<digit>`, which Herdr binds to
  `tab.select`). Groups are stored by terminal address and pruned when units end.
- **Production queue:** per town, a list of pending tasks in shared state.
  When a unit of the right type goes `idle`, the next task is dispatched
  (`hc send`) only if auto-dispatch is enabled for that town. Otherwise the
  herald asks. The queue is shown in the selection panel with progress.
- **Army view:** a Captain's children (`terminals()` where `parent` = captain)
  render as a formation around it on the minimap and in its selection panel.

### 14.5 Safety rules (non-negotiable)
- Every destructive or multi-unit order confirms and names its targets.
- Never auto-dispatch to a unit whose status is `blocked` (it's waiting on a human).
- Messages to agents are what the user typed or a visible template; no
  hidden prompt injection.
- The mod never sends terminal content anywhere off-machine.
- Templates install only on explicit opt-in, after displaying their full text.

### 14.6 Resource adapters (optional)
Tokens/cost counters appear only where a reliable **local** source exists
(e.g. an agent's own usage log read via `exec`). Each adapter declares what
it reads; absent data hides the counter instead of estimating it. A budget
cap per town ("treasury") may pause auto-dispatch when exceeded.

### 14.7 Phase 3 ideas
A declarative auto-dispatch rule language inspired by RTS AI scripts
(`(defrule (idle scout) (queue research) => (dispatch))`); a "chronicle"
exporter; a shared multi-machine map; tech-tree view of a task DAG.

---

## 15. Public-repo hygiene (mandatory)

This repository is public. Treat every commit, screenshot and generated file
as published forever.

**Never commit:**
- AI-assistant transcripts or state: `.claude/`, `*.jsonl` session logs,
  agent scratch files, `CLAUDE.local.md`, tool caches.
- Herdr app/core state: `shared.json`, `view.json`, `session.json`,
  `window.json`, `installed.json`, `seen.json`, `telemetry/`, `data/`,
  `layouts/.state/`, `*.log`, `*.sock`, `*.error`, `*.reset-*`, `*.bak-*`.
- Anything identifying a person or their machine: usernames, real names,
  emails, hostnames, machine names from `hc machine ls`, IPs, absolute paths
  (`/home/<user>`, `/Users/<user>`, `C:\Users\<user>`), shell history,
  tokens/keys, organisation names, real repo or space names.
- Raw third-party downloads (`art/sources/`), contact sheets, scratch
  screenshots (`shots/`).

**Always:**
- Write paths as `~/.config/herdr-app`, `$HERDR_APP_HOME`, or relative.
- Build and test against a **throwaway app home** (`HERDR_APP_HOME=$(mktemp -d)`),
  never a real one.
- Make screenshots (`preview.png`, docs) in a clean demo profile: generic
  space names (`demo-api`, `demo-web`), a demo `$HOME`-relative folder, no
  real terminal content. Inspect every image at full size before committing
  (window titles, prompts, branch names leak).
- The mod's own UI must never render absolute home paths (shorten to `~`);
  this is unit-tested (§11).
- Commit with a GitHub **noreply** author email.
- `tools/hygiene-check.sh` (pre-commit hook + CI) fails on: absolute home
  paths, email addresses (except a short allow-list like
  `noreply@anthropic.com` in commit trailers), IPv4 addresses, private-key
  headers, common token prefixes, files over 2 MB, and any path matching the
  never-commit list. A local, **uncommitted** deny-list file
  (`.hygiene-local`, gitignored) lets a developer add their own
  usernames/hostnames to scan for.
- A `.gitignore` covering the never-commit list ships with the first code commit.

---

## 16. Primer: how Herdr can be completely restyled

Herdr writes its own docs into the app home on every start:
`~/.config/herdr-app/AGENTS.md`, `herdr.d.ts` (app data and commands) and
`gpui-kit.d.ts` (UI elements). **Those files are the source of truth;**
re-read them before building, because the API moves. Notes below were
observed on herdr-app 0.1.x (Linux).

### 16.1 Three layers make a full restyle
| Layer | File | Controls | Switch with |
|---|---|---|---|
| Palette | `themes/<name>.json` | terminal bg/fg/selection/cursor + 16 ANSI, plus named UI colours (`surface`, `chrome`, `canvas`, `accent`, `working`, `blocked`, `done`, `idle`, …) | `app.theme {name}`, Settings → Look |
| Layout | `layouts/<name>.json` | the whole window: node tree, sizes, backgrounds, pane frames, fonts, which mod draws each block, floating blocks, preview | `layout.switch {name}`, `ctrl-shift-l` cycles |
| Mod | `mods/<name>/` | JavaScript (gpui-kit) drawing every block it's given, plus overlays; bundles fonts, icons, images, sounds | loaded when a layout references it |

- A theme **named like a layout** (`themes/empires.json`) is that layout's
  own; Settings offers it only there. A differently named palette is offered
  everywhere.
- Look precedence: theme picker > layout's own look > `settings.json`.
- Switching layouts switches the whole look. That is our "switch themes
  easily" mechanism.
- Herdr's shipped layouts/mods are read-only (replaced every start). Ours is
  third-party; never reuse a shipped name (`main`, `terminals`, `win98`,
  `spaces`, `agents`, `tabs`, `menu`, `toast`, `worktree`, …).
- `ctrl-alt-shift-escape` always resets to the default layout; it can't be rebound.

### 16.2 Layout nodes
Types: `block`, `row`, `column`, `stack`. Block content:
`{mod, props}`, `{tab: "active", pane: {...}}`, `{terminal: "t7"}`,
`{agent: "focused"}`. Node props: `id`, `size {px|weight}`, `min`, `max`,
`hidden`, `background` (colour, `{gradient, angle}`, `{image, fit}`),
`border`, `radius`, `shadow`, `padding`, `gap`, `divider`, `resizable`,
`movable`, `window_drag`, `floating`. Root only: `titlebar: "none"`,
`traffic_lights`, `preview`, `terminal_menu`. Look (root): `theme`, `colors`,
`font`, `font_size`, `ui_font`, `terminal_padding`, `terminal_opacity`.
Pane frames on the tab block: `gap`, `radius`, `background`, `border`,
`focus`, `header {content, height, position, reveal}`, `lone`. Floating
blocks `{id, content, edge, align, peek}` get a Herdr-drawn frame.

### 16.3 Mods
`main.js` default-exports `class X extends View` with `init(props, cx)` and
`render(cx)`. Builders: `div()`, `h_flex()`, `v_flex()`, `svg(path)`
(tinted mask), `image(path)` (full colour; paths relative to the app home,
e.g. `mods/empires/img/x.svg`), snake_case chain methods (`.bg`, `.border_t`,
`.gap`, `.on_click`, `.hover`, `.absolute`, `.tooltip`), `PathBuilder` +
`window.paint_path` for vector shapes and gradients.

`herdr` module: live data (`spaces()`, `agents()`, `panes()`, `terminals()`,
`focused()`, `theme()`, `settings()`, `keys()`, `layout()`, `window()`,
`placement()`); `run(command, args)`; `openOverlay({mod, props, kind:
dialog|popup|window, frame: "none", modal, key, keep, width, height, at})`
and `closeOverlay`; `notify`; `exec`, `hc`, `readTextFile`, `pickFolder`,
`knownAgents`; `playSound(path)`; `shared`/`setShared` (persisted, visible
to all mods); `nextCommand()` (key actions `<mod>.<command>` from a
`keys.json` section `layout:<name>`); `setAgentOrder`.

**Rules:** never keep a `cx` (each callback gets its own); no
`setTimeout`/top-level await (use `cx.timer`, `cx.spawn`); every redraw
redraws the whole window, so animate only natively (`.frames([...], ms)`,
`.spin(ms)`, `.loop(prop, {from, to, period})`, `.transition()`); hidden mod
copies keep running, so poll gently. `.ttf/.otf` in `mods/<name>/fonts/`
load automatically. There is **no 9-slice / tiling / object-fit** API as
observed (see R1). Can't: HTML/CSS/webviews, Node APIs, drawing outside a
block except via overlays, changing how terminal text is drawn.

**Tooling:** `herdr-app check <mod dir>` (must pass), `herdr-app status`
(file/mod errors), `herdr-app shot out.png` (rendered-window PNG; needs a
running app), `herdr-app commands`, `herdr-app do <command> --arg …`,
`HERDR_APP_HOME` selects the app home.

### 16.4 The reference implementation: Herdr 98 (shipped, Apache-2.0)
Read `layouts/win98.json`, `themes/win98.json`, `mods/win98/` in any Herdr
install; adapt patterns with attribution in `NOTICE`.
1. **One mod, many roles:** `main.js` maps `props.role` (taskbar, desktop,
   window = pane header, menu, dialog, games, clippy) to classes; overlays
   reopen the same mod with another role.
2. **`kit.js` drawing kit:** palette constants; `unit()` maps design px
   through zoom and a 1×/2× scale so 1 px bevels stay crisp; `bevel(kind)`
   from stacked 1 px borders; `button`, `titleBar`, `win`, `field`,
   `openMenu`, `openDialog`, `sfx`.
3. **`fitLayout()`**: the mod rewrites its own layout's px sizes via
   `layout.set` when zoom/scale changes.
4. A **namespaced shared state** (`win98.*`) and a `layout:win98` keys
   section dispatched by the always-present taskbar role.
5. **Boot screen:** a modal full-window `dialog` with `frame: "none"`, at
   most every 30 min, then a startup sound.
6. **Model mapping:** spaces → desktop folders with status badges; tabs →
   taskbar windows (click = `tab.settle`); pane headers → title bars (min =
   settle, max = `pane.zoom`, close = `pane.close`); agents → tray + assistant.
7. **Fully generated art:** `art/generate.ts` draws every icon in code to
   crisp SVG; `art/sounds.ts` synthesizes all sounds with FFmpeg; fonts are
   OFL/CC BY-SA. A fully redistributable look with no licensing ambiguity,
   which is the template for §13 tier A.

### 16.5 Sharing
herdr.dev/layouts lists public GitHub repos with topic `herdr-layout` whose
folder mirrors the app home and includes `RECIPE.md` (a from-scratch build
brief) and `preview.png`.

---

## 17. References

- Herdr: https://herdr.dev · https://github.com/herdrdev · layouts gallery https://herdr.dev/layouts
- openage: https://github.com/SFTtech/openage (GPL-3.0+, requires original game data) · nyan https://github.com/SFTtech/nyan
- 0 A.D.: https://play0ad.com · https://github.com/0ad/0ad (art/audio CC BY-SA 3.0, engine GPL-2.0+)
- freeaoe https://github.com/sandsmark/freeaoe · FreeAge https://github.com/grst/freeage (both need original data)
- MegaGlest license https://megaglest.org/license · Unknown Horizons http://www.unknown-horizons.org/
- aoc-mgz (recorded-game parser, MIT) https://github.com/happyleavesaoc/aoc-mgz
- Kenney https://kenney.nl/assets · game-icons.net https://game-icons.net · Freesound https://freesound.org · Google Fonts (OFL) https://fonts.google.com
- Related agent-RTS projects (UX reference only): AgentCraft https://getagentcraft.com ·
  AgentEmpire https://github.com/zeenie-ai/AgentEmpire ·
  agent-of-empires (Tauri) https://github.com/jvlustosa/agent-of-empires ·
  Age of Agents https://github.com/agentsmill/age-of-agents ·
  tide-commander https://github.com/deivid11/tide-commander ·
  arcane-agents https://github.com/thomasrice/arcane-agents ·
  peon-ping (sound-on-agent-events pattern) https://github.com/PeonPing/peon-ping
- Name note: "agent-of-empires" is already used by two projects; keep ours distinct.

**Trademark posture:** product name, UI strings, layout display name,
preview and marketing never use "Age of Empires", "AoE", "Ensemble",
"Forgotten Empires" or Microsoft/Xbox marks. Describe it as *a medieval RTS
theme for Herdr*.
