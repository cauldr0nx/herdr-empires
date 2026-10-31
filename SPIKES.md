# Spikes: what the Herdr API really does (SPEC §8)

Evidence comes from the Herdr source at `github.com/herdrdev/herdr-app`
(herdr-app 0.1.10: `defaults/AGENTS.md`, `defaults/herdr.d.ts`, the generated
`gpui-kit.d.ts` from `vendor/gpui-kit/crates/shell/src/typings.rs` and
`style.rs`, `src/mods.rs`, `src/settings.rs`, and the shipped `win98` mod). No
Herdr binary could run in the build container (see R6), so every answer is
read from code, not observed on screen; re-verify in the app before release.

| # | Question | Answer | Consequence |
|---|---|---|---|
| R1 | `image()` scaling, tiling | `image(path)` is a full-colour GPUI `img`; the shell exposes no `object_fit`, tiling or 9-slice. `.w()/.h()` set the box; SVG rasterises to it, so an SVG with `preserveAspectRatio="none"` stretches, a tile does not repeat. | Frames are code-drawn (stacked 1 px borders, `Background.linear_gradient`); textures are SVG with their own gradients/noise sized to the box, never tiled. |
| R2 | Arbitrary polygons + hit-testing | `PathBuilder.fill()/stroke(w)` with `move_to/line_to/curve_to/arc_to/add_polygon` in px or `"n%"`, painted by `window.paint_path(path, Background\|#hex)` as an element. A path element takes no `.id()`/`on_click`; hit-testing is the element box. | The minimap diamond is one `paint_path` layer per territory; clicks come from invisible absolutely positioned divs over each territory (the fallback in SPEC §8 R2). |
| R3 | Rotation / transform | None in gpui-shell (no `rotate`, no transform). Only `.spin(ms)` rotates an `svg` continuously. | The isometric look is drawn with paths and per-territory rhombi, not rotated squares. |
| R4 | Performance, ~20 panes | Every `cx.notify()` redraws the whole window; renders run on live-data changes only (no polling needed). `check` renders once; there is no profiler for mods. | `data.js` is pure and cheap; no timers faster than 1 s (`tools/check.ts` enforces); banners memoise nothing but build < 40 elements each. |
| R5 | Sound doubling | Herdr plays `done`/`blocked` itself (`src/window.rs`, `sound.rs`), and `playSound("done"\|"blocked")` plays those same attention sounds. | Alert sounds default **off**; the Options switch writes `settings.json` `sounds.done/blocked` to our files (on click only) and stores the previous values in `shared("empires.prevSounds")`. Our own `sfx()` never plays on status changes unless that switch is on. |
| R6 | Headless `herdr-app check` / `shot` in a cloud container | `check` is gpui-shell's host checker: it opens a real GPUI window (`host.rs`: "check did not run: the window never opened"), so it needs a display (Xvfb works) **and** the `herdr-app` binary. The binary cannot be built here: `ghostty-sys` needs the `vendor/ghostty` submodule plus Zig, and herdr.dev (the release download) is blocked by the container's network policy. | `tools/check.ts` is a Bun stand-in: it loads the mod with stub `gpui-kit`/`gpui-base`/`herdr` modules whose element methods are the exact surface of `style.rs` + the shell's behaviour list, renders every role (empty and demo data), opens every overlay the roles open, fires every click handler, and verifies asset paths and motion policies. `bun test` covers `data.js`. The real `herdr-app check` and `shot` must run on a machine with Herdr before a release; `preview.png` here is a rendered mock, not a screenshot. |
| R7 | Floating-block frame | Herdr draws a themed frame (background, border, rounded corners, shadow; accent border while dragged) around floating mods; the mod draws only the content (`AGENTS.md` "Floating blocks"). | The herald renders its portrait + parchment bubble inside that frame; the frame's colours come from `themes/empires.json` (`popover`, `border`), so it reads as parchment with a wood edge. |
| R8 | Fonts with spaces in family names | `settings::load_home_fonts` loads every `.ttf/.otf` under `mods/*/fonts/` at start and on the next look change; Herdr 98 uses "Pixelated MS Sans Serif" and "PxPlus IBM VGA 8x16", so spaces are fine. Family = the font's internal name. | Ship `Cinzel[wght].ttf` (family "Cinzel", variable weight), `AlegreyaSans-*.ttf` ("Alegreya Sans") and `AlegreyaSansSC-*.ttf` ("Alegreya Sans SC"); the layout's `ui_font` is "Alegreya Sans". |
| R9 | `fitLayout()` on a third-party layout | `layout.set {layout}` edits personal (non-shipped) layouts' trees; shipped ones accept only click/look fields. `layouts/empires.json` is third-party, so the full tree can be rewritten; Herdr 98 does the same from its taskbar role with `layout.resize` for sizes. | `kit.fitLayout()` keeps `resources` 34, `hud` 150, `command` 260, `minimap` 220, header 26 and borders 3 in design px × scale ÷ zoom, and swaps the HUD to the two-row narrow tree. Per-field clicks in `layouts/.state/` win over a file edit, so sizes go through `layout.resize` too. **`Node` has no catch-all field**, so `x_empires` is dropped from `layout()` and from the file after the first `layout.set`; the install marker is the root `title: "Herdr Empires"` (a real `Node` field), and `fitLayout` guards on `shared("layout") === "empires"`. |
| R10 | macOS / Windows | `mods::app_dir()`: `$HERDR_APP_HOME`, else `$XDG_CONFIG_HOME/herdr-app`, else `~/.config/herdr-app`, on every platform. `window().platform` is `linux`/`macos`/`windows`; `window().buttons` says the bar must draw minimize/maximize/close (Linux, Windows); macOS keeps its traffic lights at the layout root's `traffic_lights: [x, y]`. Herdr 98 opens URLs with `open` on macOS, `xdg-open` elsewhere. | `install.sh` resolves the home the same way; the resources bar draws window buttons only when `window().buttons` and leaves room at the left on macOS. A PowerShell installer is Phase 3. |

## Other facts worth knowing

- `herdr-app check` loads the mod with `props()` = **null** and empty live
  data (`mods::install_policy` installs the module with `props: Value::Null`).
  The role router must render something for a null role, and every role must
  survive empty `spaces()`/`agents()`/`panes()` and a null `focused()`.
- `theme()` is the resolved map from `settings.rs::resolve` (background,
  foreground, surface, canvas, chrome, popover, raised, hover, selected, border,
  input, muted, dim, accent, accent_foreground, solid, solid_foreground, ring,
  selection, cursor, working, blocked, done, idle, unknown, ansi0..15); a theme
  file's `colors` block overrides any of them. `settings()` has `zoom`,
  `font_family`, `font_size`, `ui_font_family`, `ui_font_size`, `dark`, `sounds`.
- `playSound(path)` resolves a relative path against the app home and plays it
  with `paplay`/`pw-play`/`ffplay`/`mpg123`/`mpv` (macOS `afplay`, Windows MCI):
  MP3 only, mono 96 kbps is plenty.
- Menu popups: `openOverlay({kind: "popup", frame: "none", width, height, at})`
  sizes are in layout px at zoom 1 (Herdr 98 divides by zoom); `at` is window
  px. Submenus pass `parents` so Escape/close can unwind the chain.
- `ClickEvent` has `click_count` and `modifiers`; `MouseButtonEvent` adds
  `bounds` (for anchoring a menu under a button).
- `.loop(prop, {from, to, period >= 100})`, `.frames(list, ms >= 16)`,
  `.spin(ms >= 100)` are the only native motion; `.transition` for changes.
- Key actions `empires.<command>` reach shown copies' `nextCommand()`; the
  `resources` role is always shown, so it dispatches them (Herdr 98 pattern).

## Decisions deferred to M2/M5 in the spec

- **§6.9 terminal right-click menu:** kept Herdr's shipped `menu` mod. Its
  pane menu carries items a replacement would have to reproduce exactly
  (split, zoom, send right-clicks to the program, send a kept sub-agent back,
  close) and its `target` semantics; the parchment look is not worth the
  drift risk. The layout therefore sets no `terminal_menu`.
- **§6.10 toasts:** Herdr's `toast` mod stays; it reads `theme()` colours, so
  on the empires palette it is parchment-on-wood already. There is no
  layout-scoped toast mod in the API (toasts are opened by the app with
  `kind: "toast"`).
- **§6.5 minimap above 12 towns:** a wrapping row of 12×16 px banners in
  player colours (`minimapMode()` in `data.js`), with the same clicks.
- **§5.1 narrow (< 900 px):** `fitLayout(narrow)` turns `hud` into a column
  (selection 78 px over a row of command card + minimap; 232 px total) and
  the resource bar drops its labels and shortens the age banner; the width
  comes from the resource bar's `on_size_change` (the window's full width).
