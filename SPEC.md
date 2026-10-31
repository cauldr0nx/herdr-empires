# Herdr Empires: specification

> Status: **v0.2.** Phase 1 (HUD) and Phase 2 are built on branch
> `claude/hopeful-dirac-dqzi6u` and were live-tested in a real Herdr. v0.2
> adds the **world layer**: agents as units on an isometric map, drawn with
> real RTS art from swappable art packs (§18). It also lists the bugs the live
> test found (§19). This single file is the complete brief: a build agent
> should be able to work from it plus a Herdr install alone.

A medieval real-time-strategy total-conversion layout for the
[Herdr](https://herdr.dev) desktop app (`herdr-app`, Apache-2.0). Agents
become units, spaces become towns, tabs become buildings, and the window
becomes an RTS HUD: resource bar, command card, selected-unit panel, diamond
minimap. Phase 1 is a pure **look + navigation** layer. **Phase 1.5 adds the
world layer** (§18): an isometric map where each space is a town and each
agent is a unit walking, gathering and raising alarms. Phase 2 adds an
**RTS-style agent command layer** on top of herdr-core (`hc`) (§14).

**Fidelity goal (from live review):** it must read as a classic medieval RTS
at first glance, with painted isometric terrain, real-looking buildings and
units. The HUD chrome alone and code-drawn placeholder art were both
rejected. Real art comes from **art packs** (§18.4): a shipped **0 A.D.**
pack (CC BY-SA 3.0) and an optional, **local-only** pack that a converter
builds from the user's own installed copy of AoE2 DE. The AoE2 pack never
ships.

The repository and every published artifact ship **none** of the
commercial games' art, audio, names or trademarks (§1, §13). The local-only
pack (§18.6) is generated on the user's machine from their own copy and
stays there.

**How to read this:** §16 is a primer on how Herdr can be restyled (read it
first if you haven't built a Herdr layout before). §0–§11 are the Phase 1
product and build spec. §13 covers assets and licensing, §14 orchestration
(Phase 2), and §15 the public-repo hygiene rules, which are **mandatory**.
**§18 (world layer + art packs) and §19 (live-test bugs) are the current
work.**

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
- Not a game engine. The world layer (§18) is a live diorama of Herdr's state, with no pathfinding, combat or simulation.
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

**Decision (v0.2):** tier D **0 A.D.** is adopted as the shipped world-art
source (§18.5). Its derived files live only in `mods/empires/packs/zeroad/`
with its own `LICENSE` (CC BY-SA 3.0) and per-file credits in `CREDITS.md`.
Everything outside that folder stays tiers A–C. The HUD may also take 0 A.D.
UI textures and portraits, but those copies live in the pack folder too.

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
- World-layer pipeline: openage asset conversion (SMX/SLD reference, Steam app id 813780) https://github.com/SFTtech/openage/blob/master/doc/media_convert.md ·
  0 A.D. model import/animation guides https://trac.wildfiregames.com/wiki/Basic3DImplementation · https://trac.wildfiregames.com/wiki/AnimationExportTutorial ·
  Blender COLLADA moved to legacy (removed in 5.0) https://devtalk.blender.org/t/moving-collada-i-o-to-legacy-status/34621 · assimp https://github.com/assimp/assimp

**Trademark posture:** product name, UI strings, layout display name,
preview and marketing never use "Age of Empires", "AoE", "Ensemble",
"Forgotten Empires" or Microsoft/Xbox marks. Describe it as *a medieval RTS
theme for Herdr*.

---

## 18. The world layer (Phase 1.5): agents as units

### 18.1 What the person sees
An isometric RTS map in the classic dimetric view (2:1 tiles): painted grass
and dirt, forest edges, gold and stone mines, berry bushes. **Each space is a
town:** a town center flying its player-colour banner, ringed by one building
per tab. **Each agent is a unit:**
- **Working:** a villager walks between its tab's building and a resource
  node, plays its gather animation there, and walks back carrying the load.
  This is "gathering".
- **Blocked:** the unit stops at the town center, a red alert flag pulses
  over it, the town bell icon shows, and the minimap pings. This is "under attack".
- **Done:** the unit returns to the town center with a laurel or check badge
  until the person looks at it.
- **Idle:** the unit stands beside the town center. These are the "idle
  villagers" that the idle button and `alt-.` cycle through.
- **Sub-agents** (`terminals().parent`) are smaller units that follow their
  parent in formation.

Clicking a unit selects it, with a selection ellipse under its feet; the
selection panel and banner follow it. Double-clicking opens its terminal.
Right-clicking gives its order menu (Phase 2 orders when command mode is on).
Clicking a town center selects that space.

### 18.2 Where it lives in the layout
The `field` node becomes a `stack`: `world` (`{mod: "empires", props: {role:
"world"}}`) and `main` (the existing `tab: active` block). There are three view
modes, cycled with `alt-w` (`empires.view`) and also offered in the game menu:

| Mode | Shows |
|---|---|
| **Map** | the world fills the field; HUD and resource bar stay |
| **Split** (default) | the world as a band above the terminals (≈35 % height, resizable), terminals below |
| **Terminals** | today's layout, with no world |

Split mode is a `column` holding `world` and `main`. Implement the modes by
having the mod rewrite its own layout tree through `layout.set` (the
`fitLayout` pattern; this is allowed because the layout is third-party).
Double-clicking a unit in Map mode switches to Terminals with that pane
focused, and `alt-w` returns. The minimap gains a viewport rectangle; clicking
it pans the world camera.

### 18.3 World model (pure functions in `data.js`, unit-tested)
- **Map:** the active space's town sits at the camera center, with neighbour
  towns placed around it on a deterministic spiral (seeded by space id, so
  layouts are stable across restarts). Remote-machine towns sit across a river.
- **Terrain:** generated per town from the seed: grass base, dirt around
  buildings, a forest crescent on one side, one gold and one stone mine, and
  berries. Tile size follows the pack (`tile: [w, h]`, AoE-style ≈ 96×48).
- **Buildings:** one per tab, assigned by the tab's lead program through a
  configurable table: shell-only tab → house; agent tab → workshop-type
  building (lumber camp / mining camp / mill / university / monastery,
  chosen by the hash of the tab id unless the program or the Phase 2 unit
  type maps it explicitly). Settled (garrisoned) tabs show closed doors and
  their units are hidden inside.
- **Units:** one per agent. Unit class by program, or by Phase 2 template:
  villager (default), scout (Scout), monk (Monk), builder villager (Mason),
  knight or king (Captain). Shell panes aren't drawn by default (option:
  "show shells as villagers").
- **Resource node per working unit:** stable per tab (hash), so the same agent
  always gathers at the same spot.
- **Depth:** sprites are sorted by their foot `y`, then `x`, every render.
- **Caps:** at most 60 units and 40 buildings drawn. Overflow collapses into
  a "+N" banner at the town center.

### 18.4 Art packs: one schema, swappable
The world role and the HUD read art only through a **pack**. A pack is a
folder with `pack.json`:

```jsonc
{
  "name": "zeroad", "title": "0 A.D. (CC BY-SA 3.0)", "license": "CC-BY-SA-3.0",
  "tile": [96, 48],
  "terrain": { "grass": ["terrain/grass-0.png", "..."], "dirt": ["..."], "forest_floor": ["..."] },
  "playerColors": ["blue", "red", "green", "yellow", "cyan", "purple", "gray", "orange"],
  "entities": {
    "villager": {
      "anchor": [24, 44],                      // foot point inside a frame
      "frame": [48, 52],
      "anims": {                               // name -> per-direction frame lists
        "idle":   { "fps": 6,  "dirs": 8, "sheet": "units/villager-idle-{color}.png", "frames": 8 },
        "walk":   { "fps": 10, "dirs": 8, "sheet": "units/villager-walk-{color}.png", "frames": 12 },
        "gather_wood": { "...": "..." }, "gather_gold": {}, "carry": {}, "build": {}
      }
    },
    "town_center": { "anchor": [0, 0], "image": "buildings/town-center-{color}.png" },
    "house": {}, "lumber_camp": {}, "mining_camp": {}, "mill": {}, "monastery": {}, "university": {},
    "tree": { "variants": ["nature/tree-0.png", "..."] }, "gold_mine": {}, "stone_mine": {}, "berry_bush": {}
  },
  "ui": { "food": "ui/food.png", "wood": "ui/wood.png", "gold": "ui/gold.png", "stone": "ui/stone.png",
          "population": "ui/pop.png", "portraits": { "villager": "ui/portrait-villager.png" } }
}
```

- Every entity name the world needs has a **fallback chain** (e.g. `university
  → monastery → house`), so a partial pack still works.
- The pack is chosen in Options → Art pack: **Auto** (`aoe2de` if installed,
  else `zeroad`), **0 A.D.**, or **AoE2 DE (local)**. Stored in
  `shared("empires.pack")`.
- Pack locations (paths relative to the app home, which is how `image()`
  resolves them):
  - shipped: `mods/empires/packs/zeroad/`
  - local: `empires-packs/<name>/`. This is **outside** `mods/empires/`
    because `install.sh update` prunes unknown files inside the mod folder.
    The installer never touches `empires-packs/` except `uninstall --purge`.

### 18.5 The shipped pack: rendered from 0 A.D.
0 A.D. art and audio are CC BY-SA 3.0 (Wildfire Games). Units and buildings
are 3D models (COLLADA `.dae` meshes in `art/meshes/`, animations in
`art/animation/`, skeletons in `art/skeletons/`, assembled by actor XML in
`art/actors/`). AoE2's own sprites were pre-rendered from 3D, so rendering
0 A.D. models to sprites is the faithful route.

Pipeline: `art/zeroad/`, run on a dev machine or the cloud agent. Its outputs
are committed into `mods/empires/packs/zeroad/`.
1. **Fetch** a pinned 0 A.D. release's `public` mod data, or the git mirror
   at a pinned commit, by URL + sha256 into `art/sources/zeroad/`
   (gitignored).
2. **Choose actors** closest to the AoE2 look. 0 A.D. is antiquity, so prefer
   the Briton, Gaul and Roman sets for buildings, and their citizen-soldier
   or female-citizen gatherers as villagers. Evaluate the medieval 0 A.D. mod
   *Millennium A.D.* as a better source, **only after verifying its license
   is compatible** (CC BY-SA or freer).
3. **Render** headless with Blender:
   - Blender 5.0 removed COLLADA import, so either pin **Blender 4.5 LTS**
     (legacy COLLADA importer) or convert `.dae` → glTF with **assimp**
     first and use current Blender. Decide in spike R12.
   - Parse the actor XML (meshes, props, textures, variants). Apply player
     colour (0 A.D. player-colour materials use a texture mask) once per
     each of the 8 colours.
   - Use an orthographic camera at classic RTS dimetric (elevation ≈ 30°),
     8 directions at 45°, a warm key light from the upper left, and a
     transparent background with a separate soft shadow.
   - Render the idle, walk, gather (wood/gold/stone/food), carry and build
     animations at the pack fps.
4. **Pack:** trim, pack per-animation sheets, compute anchors, write
   `pack.json` and `pack.manifest.json` (source file → output, license,
   author "Wildfire Games").
5. **Terrain:** sample 0 A.D. terrain textures (`art/textures/terrain/`)
   into seamless isometric diamond tiles. **UI:** copy resource icons
   (`art/textures/ui/session/icons/resources/`) and portraits
   (`ui/session/portraits/`), converting DDS → PNG if needed.
6. **Credits:** `mods/empires/packs/zeroad/LICENSE` (CC BY-SA 3.0 text),
   `CREDITS.md` lines naming Wildfire Games, https://www.wildfiregames.com/
   and the CC link, and a note that the pack's derived images are CC BY-SA 3.0.

Budget: keep the shipped pack under ~25 MB. Use WebP if `image()` supports
it (verify), else optimized PNG.

### 18.6 The local pack: built from the user's own AoE2 DE
`tools/aoe2de-import/` is a converter, the approach openage takes. It
contains **no game data**, only code that reads an installation the user owns.
- **Find the install:** `--source DIR`, else Steam libraries
  (`steamapps/common/AoE2DE`, plus each path in
  `steamapps/libraryfolders.vdf`; Steam app id 813780), else common Windows
  paths. Refuse to run if nothing is found. Never download game files.
- **Read graphics** from `resources/_common/drs/graphics/` for a whitelist
  of sprites: villager idle/walk/gather/carry/build, monk, scout, knight,
  king, town center, house, mill, lumber camp, mining camp, university,
  monastery, trees, gold/stone mines, berry bush.
  - DE uses the **SMX** format and, after later patches, **SLD**. Implement
    decoders from openage's format docs, using openage's converter code as
    the reference. Detect the format per file.
  - Apply player colour through the format's player-colour mask for all 8
    colours.
- **Terrain:** DDS textures in `resources/_common/terrain/textures/` → diamond tiles.
- **Write** `empires-packs/aoe2de/` in the app home with the same `pack.json`
  schema. Print exactly which files were read and written.
- **Sounds** (Wwise banks) are out of scope for v1.
- **Run it:** `tools/install.sh import-aoe2de [--source DIR]`, plus an
  Options button that shows the command to run. The mod never runs the
  importer by itself.
- **Hygiene:** the converter's output is never committed, never used for
  `preview.png` or any published screenshot (those use the `zeroad` pack),
  and the hygiene check fails on `*.smx`, `*.sld`, `*.slp`, `*.drs`,
  `*.dds` and any `empires-packs/` path inside the repo.

### 18.7 Rendering and animation inside Herdr (spikes first)
Herdr mods have no canvas, rotation or sprite API. What is available:
absolute-positioned `image()` elements, `overflow_hidden` clipping, native
`.loop("left"|"top"|"opacity", {from, to, period, easing})` (there-and-back),
`.transition`, and `.frames(strings, ms)` (text only). A throwaway spike
in the real app confirmed that absolute sprites over a terrain image, walking
via paired `left`/`top` loops with `easing: "linear"`, a nested `top` loop
for a walking bob, and click → `agent.focus` all work.

| # | Question | Options, in preference order |
|---|---|---|
| R11 | **Sprite frame animation** without a per-frame script | (a) generate a **colour bitmap font** (CBDT/sbix/COLR) per pack whose private-use glyphs are the frames, then animate with `.frames(["","",…], ms)`, which is native with zero script cost; verify GPUI renders colour glyphs at the needed size. (b) a single strip image inside an `overflow_hidden` box, frame chosen by a timer at ≤ 8 fps, **only while the world is visible and the window is active**. (c) static pose + bob loop (the last-resort fallback). |
| R12 | Blender pipeline: 4.5 LTS COLLADA vs. assimp → glTF → Blender 5 | the one that keeps 0 A.D. animations intact |
| R13 | Walking direction: there-and-back loops can't flip a sprite | separate outbound and return sprites, with opacity loops at matching periods with `easing` tuned so the swap lands at the endpoints; else face the dominant direction |
| R14 | Detecting world visibility (stack child hidden, Terminals mode) to stop timers | `on_size_change` reporting 0, or the mod's own view-mode state |
| R15 | Cost: 60 units × 2–3 loops + 100 sprites | measure frame time with `herdr-app shot` timing and a CPU sample; reduce caps if needed |
| R16 | Does `image()` accept WebP? | WebP if yes, else PNG |

### 18.8 Milestones
- **W0, spikes:** R11–R16 answered in `SPIKES.md` with evidence from a real
  Herdr. Who runs these: the cloud container couldn't download Herdr, so
  either allow `herdr.dev` and GitHub releases in its network policy or have a
  human run `tools/demo/run-demo.sh` locally.
- **W1, world role on placeholder data:** view modes; town and building
  placement; units and status behaviours; selection; click / double-click /
  right-click; minimap viewport. All of it uses the pack schema and a tiny
  stub pack.
- **W2, the 0 A.D. pack:** pipeline, rendered sprites in 8 colours, terrain,
  UI icons, portraits, credits. The HUD's resource icons and portraits switch
  to the pack.
- **W3, the AoE2 DE importer:** SMX + SLD decoders with unit tests on small
  synthetic files (never real game files in the repo), the Options pack
  picker, and `install.sh import-aoe2de`.
- **W4, polish:** depth sorting, overflow banners, calm mode (world static),
  performance caps, a portrait-monitor layout.

**Done when:** in a real Herdr with the `zeroad` pack, a stranger glancing at
the window says "that's an RTS". With three fake agents (working / blocked /
cycle) the units visibly gather, alarm and return within one status change.
Clicking a unit opens its terminal. `herdr-app check`, `bun test` and every
§11 gate pass. With the `aoe2de` pack imported locally, the same scene uses
the original sprites, and `git status` shows nothing new.

---

## 19. Live-test results and fixes (real herdr-app 0.1.10, Linux)

What passed in the real app: `herdr-app check` (throwaway home and real
home), `bun run verify`, `tools/install-test.sh`, install → switch with no
errors in `herdr-app status`, and the HUD, banners, menus, tech tree,
options, herald, status colours and minimap rendering. **Fix these before
W1:**

1. `roles/banner.js`, `roles/selection.js`: `this.now` is set once in
   `init()`, so "gathering Ns" never advances. Read `Date.now()` in `render()`
   and run a ≥ 5 s timer only while some shown unit is working.
2. The banner re-renders late. A branch change showed in the selection panel
   well before the pane banner. Make sure the banner derives everything from
   `panes()` in `render()` and nothing is cached in `init()`.
3. The wood resource icon is invisible: `img/wood.svg` is the plank
   **texture** and shares its name with the resource icon. Give resource icons
   their own names (`img/res-*.svg`, or the pack's `ui.*`).
4. Gold never counts tasks that finish via blocked → done or idle → done.
   `completions()` must count any transition into `done` (from anything other
   than `done`), plus working → idle. Add tests.
5. The Stone counter and minimap alarm number are unreadable (red on red/brown,
   plus a pulse). Use a light number on a red pill; pulse the pill, not the text.
6. Tech tree dialog: the 4th column is clipped at the right with no scroll.
   Wrap columns or add horizontal scroll, and size the dialog to the window.
7. Herdr's own toasts are nearly unreadable on the `empires` palette (light
   text on parchment `popover`). Fix the theme's foreground/popover pairing
   for toasts, and keep toasts clear of the minimap if possible.
8. Selection panel: an unnamed tab shows as `"1"`. Hide the tab name when
   `named` is false.
9. Selection location line repeats a name ("x · x · main") when the space name
   equals the folder name. Dedupe.
10. The herald float covers the terminal's bottom-left, including the agent's
    prompt line. Make it a `peek` drawer, or dock it into the HUD.
