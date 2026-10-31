// tools/check.ts: a Bun stand-in for `herdr-app check mods/empires` (SPIKES.md R6).
//
// Loads the mod with stub `gpui-kit` / `gpui-base` / `herdr` modules, then for
// every role the layout and the overlays use: init + render with empty data
// (what the real check sees: props() = null, no spaces) and with a demo world
// (towns, buildings, units in every status), opens every overlay a role opens
// and renders it too, fires every click handler once, and validates element
// method names, children, ids, motion policies, colours and asset paths.
// Also lints the sources (no setTimeout/setInterval, no timers under 1 s,
// imports only of real herdr/gpui-kit exports) and the layout file.
//
// Usage: bun tools/check.ts <mod dir> [--home <app home>] [--verbose]
// Exit 1 on any error. Not a substitute for the real check where Herdr runs.

import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, cpSync, writeFileSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const modArg = args.find((a) => !a.startsWith("--")) ?? "mods/empires";
const homeIdx = args.indexOf("--home");
const modDir = resolve(modArg);
const modName = basename(modDir);
// The app home: the folder holding mods/<name>/ (so `mods/empires/img/x.svg` resolves), or --home.
const appHome = homeIdx >= 0 ? resolve(args[homeIdx + 1]) : resolve(modDir, "../..");
const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");
const hex = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const errors: string[] = [];
const warnings: string[] = [];
const fail = (m: string) => errors.push(m);
const warn = (m: string) => warnings.push(m);

if (!existsSync(join(modDir, "main.js"))) {
  console.error(`check: ${modDir}/main.js not found`);
  process.exit(2);
}

// ---- 1. Source lint
const HERDR_EXPORTS = new Set(["exec","hc","home","appHome","readTextFile","writeTextFile","knownAgents","pickFolder","playSound","run","machines","spaces","agents","panes","setAgentOrder","terminals","focused","layout","layouts","commands","window","placement","theme","themes","fonts","updates","presentUpdateNotes","telemetry","feedbackPreview","feedbackPasteImage","feedbackPickImages","feedbackAttachImages","feedbackClearImages","sendFeedback","settings","keys","openOverlay","closeOverlay","notify","props","shared","setShared","nextCommand","watchFolder"]);
const KIT_EXPORTS = new Set(["View","div","svg","image","list","uniform_list","PathBuilder","Background"]);
const BASE_EXPORTS = new Set(["h_flex","v_flex","Button","Link","Checkbox","Switch","TextView","Tabs","Tab","Progress","Avatar","Radio","Toggle","RadioGroup","ToggleGroup","Table","Collapsible","Popover","HoverCard","Popup","Select","Combobox","DatePicker","Scrollbar","v_virtual_list","h_virtual_list","InputState","Input","NumberInput","TextareaState","Textarea","EditorState","Editor","SliderState","Slider","OtpState","OtpInput","DockArea","dock_area","dock_content","set_theme","fps_monitor","h_resizable","v_resizable","resizable_panel","pagination_items","Pagination","Accordion","AccordionItem","AccordionHeader","AccordionPanel","AccordionTrigger","CalendarState"]);

function jsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (!["node_modules", "fonts", "img", "icons", "sounds"].includes(e)) out.push(...jsFiles(p)); }
    else if (e.endsWith(".js")) out.push(p);
  }
  return out;
}
const sources = jsFiles(modDir);
for (const f of sources) {
  const rel = f.slice(modDir.length + 1);
  const text = readFileSync(f, "utf8");
  if (/\bsetTimeout\s*\(|\bsetInterval\s*\(/.test(text)) fail(`${rel}: setTimeout/setInterval is not allowed (use cx.timer, native motion)`);
  for (const m of text.matchAll(/cx\.timer\.(every|after)\(\s*([0-9]+)/g)) {
    // The one exception (SPIKES R11): the world's sprite-frame tick, at most 8 fps, gated on visibility.
    if (Number(m[2]) < 1000) fail(`${rel}: cx.timer.${m[1]}(${m[2]}) is faster than 1 s`);
  }
  for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*"(herdr|gpui-kit|gpui-base)"/g)) {
    const names = m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
    const allow = m[2] === "herdr" ? HERDR_EXPORTS : m[2] === "gpui-kit" ? KIT_EXPORTS : BASE_EXPORTS;
    for (const n of names) if (!allow.has(n)) fail(`${rel}: "${m[2]}" has no export "${n}"`);
  }
  for (const m of text.matchAll(/from\s*"(\.\.?\/[^"]+)"/g)) {
    if (!existsSync(resolve(dirname(f), m[1]))) fail(`${rel}: import "${m[1]}" not found`);
  }
  // Product strings: SPEC §1 / §13 trademark posture.
  if (/Age of Empires|AoE|Ensemble Studios|Forgotten Empires|wololo/i.test(text)) fail(`${rel}: trademarked name in source`);
}

// ---- 2. Layout and theme files
const layoutPath = join(appHome, "layouts", `${modName}.json`);
let layoutJson: any = null;
const roles = new Map<string, any>(); // role -> props from layout
if (existsSync(layoutPath)) {
  try {
    layoutJson = JSON.parse(readFileSync(layoutPath, "utf8"));
    const ids = new Set<string>();
    const visit = (n: any, path: string) => {
      if (!n || typeof n !== "object") return fail(`layout ${path}: not an object`);
      if (n.id) { if (ids.has(n.id)) fail(`layout: duplicate id "${n.id}"`); ids.add(n.id); }
      if (!["block", "row", "column", "stack"].includes(n.type)) fail(`layout ${path}: bad type ${n.type}`);
      if (n.size && typeof n.size.px !== "number" && typeof n.size.weight !== "number") fail(`layout ${path}: size needs px or weight`);
      const c = n.content;
      if (n.type === "block") {
        if (!c) fail(`layout ${path}: block without content`);
        else if (c.mod) {
          if (!existsSync(join(appHome, "mods", c.mod, "main.js"))) fail(`layout ${path}: mod "${c.mod}" not found under ${appHome}/mods`);
          if (c.mod === modName) roles.set(c.props?.role ?? "", { ...(c.props ?? {}) });
        } else if (c.tab) {
          const h = c.pane?.header?.content;
          if (h?.mod === modName) roles.set(h.props?.role ?? "", { ...(h.props ?? {}), pane: "p1", terminal: "t1" });
          for (const k of ["border", "focus"]) if (c.pane?.[k] && !(typeof c.pane[k].width === "number" && typeof c.pane[k].color === "string")) fail(`layout ${path}: pane.${k} needs width and color`);
        }
      }
      for (const fl of n.floating ?? []) {
        if (!fl.id || !fl.content) fail(`layout ${path}: floating needs id and content`);
        if (!["top", "right", "bottom", "left"].includes(fl.edge)) fail(`layout ${path}: floating edge`);
        if (fl.content?.mod === modName) roles.set(fl.content.props?.role ?? "", { ...(fl.content.props ?? {}), float: fl.id });
      }
      (n.children ?? []).forEach((ch: any, i: number) => visit(ch, `${path}/${ch?.id ?? i}`));
    };
    visit(layoutJson, "root");
    if (layoutJson.preview && !existsSync(join(appHome, layoutJson.preview))) warn(`layout: preview ${layoutJson.preview} missing`);
    if (typeof layoutJson.theme === "string" && !["graphite", "ink", "moss", "paper"].includes(layoutJson.theme) && !existsSync(join(appHome, "themes", `${layoutJson.theme}.json`))) fail(`layout: theme "${layoutJson.theme}" has no file`);
    if (layoutJson.title !== "Herdr Empires") warn(`layout: root title "Herdr Empires" is the install marker (Herdr drops x_empires on layout.set)`);
  } catch (e) {
    fail(`layout: ${e}`);
  }
} else warn(`no layout at ${layoutPath}; rendering roles with guessed props`);

// Themes: 16 ansi colours, hex everywhere.
const themesDir = join(appHome, "themes");
let themeColors: Record<string, string> = {};
if (existsSync(themesDir)) {
  for (const f of readdirSync(themesDir).filter((x) => x.startsWith(modName) && x.endsWith(".json"))) {
    try {
      const t = JSON.parse(readFileSync(join(themesDir, f), "utf8"));
      for (const k of ["background", "foreground", "selection"]) if (!hex.test(t[k] ?? "")) fail(`themes/${f}: ${k} must be #rrggbb`);
      if (!Array.isArray(t.ansi) || t.ansi.length !== 16 || t.ansi.some((c: string) => !/^#[0-9a-fA-F]{6}$/.test(c))) fail(`themes/${f}: ansi needs 16 #rrggbb colours`);
      for (const [k, v] of Object.entries(t.colors ?? {})) if (!hex.test(String(v))) fail(`themes/${f}: colors.${k} must be hex`);
      if (f === `${modName}.json`) themeColors = resolveTheme(t);
    } catch (e) { fail(`themes/${f}: ${e}`); }
  }
}
function resolveTheme(t: any): Record<string, string> {
  // Mirrors settings.rs::resolve for a dark theme, then applies `colors`.
  const bg = t.background;
  const fg = "#eeeeef";
  const out: Record<string, string> = {
    background: bg, terminal_foreground: t.foreground, foreground: fg, surface: bg, canvas: bg, chrome: bg, popover: bg, raised: bg,
    hover: "#ffffff0e", selected: "#ffffff17", border: "#ffffff18", input: "#ffffff24", muted: fg, dim: fg, accent: t.ansi[4],
    accent_foreground: bg, solid: fg, solid_foreground: bg, ring: fg, selection: t.selection, cursor: t.cursor ?? t.foreground,
    working: t.ansi[3], blocked: t.ansi[1], done: t.ansi[4], idle: fg, unknown: fg,
  };
  t.ansi.forEach((c: string, i: number) => (out[`ansi${i}`] = c));
  return { ...out, ...(t.colors ?? {}) };
}

// ---- 3. Render every role in a sandbox with stub modules
const work = mkdtempSync(join(tmpdir(), "empires-check-"));
cpSync(modDir, join(work, "mod"), { recursive: true, filter: (src) => !/\/(fonts|img|sounds|icons|node_modules)(\/|$)/.test(src) });
cpSync(join(repoRoot, "tools", "stubs"), join(work, "stubs"), { recursive: true });
writeFileSync(join(work, "tsconfig.json"), JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "gpui-kit": ["./stubs/gpui-kit.js"], "gpui-base": ["./stubs/gpui-base.js"], herdr: ["./stubs/herdr.js"] } } }));

const kit = await import(join(work, "stubs", "gpui-kit.js"));
const herdr = await import(join(work, "stubs", "herdr.js"));
(globalThis as any).window = { paint_path: kit.paint_path, dispatch_action() {} };
(globalThis as any).localStorage = { _m: new Map<string, string>(), getItem(k: string) { return this._m.get(k) ?? null; }, setItem(k: string, v: string) { this._m.set(k, String(v)); }, removeItem(k: string) { this._m.delete(k); } };
herdr.__setTheme(themeColors);
herdr.__configure({ layout: layoutJson, appHome, keys: loadKeys() });

function loadKeys() {
  const out: any[] = [];
  for (const f of [join(appHome, "keys.json"), join(repoRoot, "keys.json")]) {
    if (!existsSync(f)) continue;
    try { for (const [section, map] of Object.entries(JSON.parse(readFileSync(f, "utf8")))) for (const [k, a] of Object.entries(map as any)) out.push({ section, keys: k, action: a }); } catch {}
    break;
  }
  return out;
}

const Mod = (await import(join(work, "mod", "main.js"))).default;
if (typeof Mod !== "function") fail("main.js must default-export a class extending View");

// Demo world: two towns, buildings, units in every status, a worker and a sub-agent.
const PROG = {
  claude: { key: "claude", name: "Claude Code", icon: "icons/claude.svg", tint: false, tile: "#1c1d21", color: "#ffffff", shell: false, agent: true },
  codex: { key: "codex", name: "Codex", icon: "icons/codex.svg", tint: false, tile: "#1c1d21", color: "#ffffff", shell: false, agent: true },
  shell: { key: "shell", name: "zsh", icon: "icons/shell.svg", tint: true, tile: "#16241a", color: "#4ec95f", shell: true, agent: false },
  files: { key: "program", name: "Files", icon: "icons/program.svg", tint: true, tile: null, color: null, shell: false, agent: false },
};
const H = "/home/<user>".replace("<user>", "demo");
const now = Date.now();
const demo = {
  spaces: [
    { id: "s1", index: 1, name: "demo-api", named: false, folder: `${H}/src/demo-api`, machine: null, branch: "main", active: true, status: "blocked", tabs: [
      { id: "t1", index: 1, name: "fix login", named: true, active: true, status: "working", panes: 2, zoomed: false, settled: false, settled_at: null, changed_at: now - 60000, working_since: now - 240000 },
      { id: "t2", index: 2, name: "2", named: false, active: false, status: "blocked", panes: 1, zoomed: false, settled: false, settled_at: null, changed_at: now - 5000, working_since: null },
      { id: "t3", index: 3, name: "docs", named: true, active: false, status: null, panes: 1, zoomed: false, settled: true, settled_at: now - 900000, changed_at: null, working_since: null } ] },
    { id: "s2", index: 2, name: "demo-web", named: true, folder: `${H}/src/demo-web`, machine: null, branch: "feat/hud", active: false, status: "done", tabs: [
      { id: "t4", index: 1, name: "1", named: false, active: true, status: "done", panes: 1, zoomed: false, settled: false, settled_at: null, changed_at: now - 30000, working_since: null } ] },
    { id: "vps/s3", index: 3, name: "demo-ops", named: true, folder: "/srv/ops", machine: "vps", branch: null, active: false, status: "idle", tabs: [
      { id: "vps/t5", index: 1, name: "1", named: false, active: true, status: "idle", panes: 1, zoomed: false, settled: false, settled_at: null, changed_at: null, working_since: null } ] },
  ],
  agents: [
    { address: "t1", pane: "p1", space: "s1", space_name: "demo-api", tab: "t1", tab_index: 1, tab_name: "fix login", status: "working", app: "claude-code", program: PROG.claude, title: "claude", seq: 3, focused: true },
    { address: "t3", pane: "p3", space: "s1", space_name: "demo-api", tab: "t2", tab_index: 2, tab_name: "2", status: "blocked", app: "codex", program: PROG.codex, title: "codex", seq: 9, focused: false },
    { address: "t4", pane: "p4", space: "s2", space_name: "demo-web", tab: "t4", tab_index: 1, tab_name: "1", status: "done", app: "claude-code", program: PROG.claude, title: "claude", seq: 7, focused: false },
    { address: "vps/t5", pane: "vps/p5", space: "vps/s3", space_name: "demo-ops", tab: "vps/t5", tab_index: 1, tab_name: "1", status: "idle", app: "codex", program: PROG.codex, title: "codex", seq: 1, focused: false },
  ],
  panes: [
    { pane: "p1", terminal: "t1", tab: "t1", title: "claude", cwd: `${H}/src/demo-api`, branch: "main", status: "working", app: "claude-code", program: PROG.claude, focused: true, zoomed: false, movable: true },
    { pane: "p2", terminal: "t2", tab: "t1", title: "zsh", cwd: `${H}/src/demo-api`, branch: "main", status: null, app: null, program: PROG.shell, focused: false, zoomed: false, movable: true },
    { pane: "p3", terminal: "t3", tab: "t2", title: "codex", cwd: `${H}/src/demo-api`, branch: "main", status: "blocked", app: "codex", program: PROG.codex, focused: false, zoomed: false, movable: false },
    { pane: "p4", terminal: "t4", tab: "t4", title: "claude", cwd: `${H}/src/demo-web`, branch: "feat/hud", status: "done", app: "claude-code", program: PROG.claude, focused: false, zoomed: false, movable: false },
    { pane: "p6", terminal: null, mod: "files", tab: "t3", title: "Files", cwd: null, branch: null, status: null, app: null, program: PROG.files, focused: false, zoomed: false, movable: false },
    { pane: "vps/p5", terminal: "vps/t5", tab: "vps/t5", title: "codex", cwd: "/srv/ops", branch: null, status: "idle", app: "codex", program: PROG.codex, focused: false, zoomed: false, movable: false },
  ],
  terminals: [
    { address: "t1", name: "claude", argv: ["claude"], parent: null, labels: { "herdr.space": "s1", "herdr.tab": "t1" }, state: "running", status: "working", program: PROG.claude },
    { address: "t2", name: "zsh", argv: ["zsh"], parent: null, labels: { "herdr.space": "s1", "herdr.tab": "t1" }, state: "running", status: null, program: PROG.shell },
    { address: "t3", name: "codex", argv: ["codex"], parent: null, labels: { "herdr.space": "s1", "herdr.tab": "t2" }, state: "running", status: "blocked", program: PROG.codex },
    { address: "t4", name: "claude", argv: ["claude"], parent: null, labels: { "herdr.space": "s2", "herdr.tab": "t4" }, state: "running", status: "done", program: PROG.claude },
    { address: "t7", name: "scout", argv: ["claude", "-p"], parent: "t1", labels: {}, state: "running", status: "working", program: PROG.claude },
    { address: "t8", name: "monk", argv: ["codex"], parent: "t1", labels: {}, state: "finished", status: "idle", program: PROG.codex },
    { address: "vps/t5", name: "codex", argv: ["codex"], parent: null, labels: {}, state: "running", status: "idle", program: PROG.codex },
  ],
  focused: { space: "s1", tab: "t1", pane: "p1", terminal: "t1", shown: null, agent: "t1", cwd: `${H}/src/demo-api` },
};
const empty = { spaces: [], agents: [], panes: [], terminals: [], focused: null };

const cxFor = (label: string) => {
  const cx: any = {
    notify() {},
    stop_propagation() {},
    propagate() {},
    focus_handle: () => ({ focus() {}, is_focused: () => false }),
    bind_keys: (b: any[]) => { if (!Array.isArray(b)) fail(`${label}: bind_keys needs an array`); return b.length; },
    spawn(fn: any) { if (typeof fn !== "function") return fail(`${label}: cx.spawn needs a function`); Promise.resolve().then(() => fn(cx)).catch((e) => fail(`${label}: spawn task threw: ${e?.stack ?? e}`)); return { cancel() {}, is_done: () => false }; },
    timer: {
      after(ms: number, fn: any) { if (typeof ms !== "number" || ms < 1000) fail(`${label}: cx.timer.after(${ms}) faster than 1 s`); if (typeof fn !== "function") fail(`${label}: timer handler`); return { cancel() {}, is_done: () => false }; },
      every(ms: number, fn: any) { if (typeof ms !== "number" || (ms < 1000 && !(label.startsWith("world") && ms >= 125))) fail(`${label}: cx.timer.every(${ms}) faster than 1 s`); if (typeof fn !== "function") fail(`${label}: timer handler`); return { cancel() {}, is_done: () => false }; },
    },
    new() { return { __entity: true, set_props() {}, release: () => true }; },
    sleep: async () => {},
  };
  return cx;
};

let rendered = 0;
let sizeOverride: { width: number; height: number } | null = null;
const overlayQueue: { props: any; label: string }[] = [];
const seenOverlay = new Set<string>();

async function renderRole(label: string, props: any, world: any, float: string | null) {
  herdr.__configure(world);
  herdr.__setInstance({ props, float });
  herdr.__reset();
  kit.resetReport();
  kit.setWhere(label);
  let view: any;
  try {
    view = new Mod(props);
    const cx = cxFor(label);
    view.init?.(props, cx);
    const out = view.render(cx);
    if (!(out instanceof kit.Element || out?.__element || typeof out === "string")) fail(`${label}: render() must return an element or string`);
    else if (typeof out !== "string") kit.finishElement(out);
    rendered++;
    // Fire every handler once with a plausible event; handlers must not throw.
    for (const h of [...kit.report.handlers]) {
      const ev: any = { click_count: 1, modifiers: { control: false, alt: false, shift: false, platform: false, function: false }, button: "left", position: { x: 10, y: 10 }, local_position: { x: 2, y: 2 }, bounds: { x: 0, y: 0, width: 40, height: 20 }, key: "escape", keystroke: "escape", key_char: undefined };
      try {
        if (h.name === "on_hover") h.fn(true, cxFor(label));
        else if (h.name === "on_size_change") h.fn(sizeOverride ?? { width: 1200, height: 800 }, cxFor(label));
        else h.fn(ev, cxFor(label));
      } catch (e: any) {
        fail(`${label}: ${h.name} handler threw: ${e?.stack?.split("\n").slice(0, 3).join(" | ") ?? e}`);
      }
    }
    // Let spawned tasks settle.
    await new Promise((r) => setTimeout(r, 5));
    // Re-render after handlers (state changed) to catch render-after-click errors.
    const again = view.render(cxFor(label));
    if (again && typeof again !== "string") kit.finishElement(again);
    for (const a of kit.report.assets) {
      const p = join(appHome, a);
      if (!existsSync(p)) {
        // Herdr's own icons (icons/*.svg) live in the real app home; only ours must exist here.
        if (a.startsWith(`mods/${modName}/`)) fail(`${label}: asset ${a} not found under ${appHome}`);
        else if (!a.startsWith("icons/")) warn(`${label}: asset ${a} not under our mod`);
      }
    }
    for (const o of herdr.log.overlays) {
      if (o.spec.mod !== modName) continue;
      const key = JSON.stringify([o.spec.props?.role, o.spec.props?.kind, o.spec.props?.mode]);
      if (seenOverlay.has(key)) continue;
      seenOverlay.add(key);
      overlayQueue.push({ props: { ...(o.spec.props ?? {}), overlay: o.id }, label: `${label} > overlay ${o.spec.props?.role ?? "?"}${o.spec.props?.kind ? ":" + o.spec.props.kind : ""}${o.spec.props?.mode ? ":" + o.spec.props.mode : ""}` });
    }
    for (const [name] of herdr.log.runs) if (!/^[a-z]+\.[a-z_]+$/.test(name)) fail(`${label}: run("${name}") is not a command name`);
  } catch (e: any) {
    fail(`${label}: ${e?.stack?.split("\n").slice(0, 4).join(" | ") ?? e}`);
  }
  errors.push(...kit.report.errors);
  warnings.push(...kit.report.warnings);
  if (verbose) console.log(`  ${label}: ${kit.report.elements} elements, ${kit.report.handlers.length} handlers, ${kit.report.motion} motions, ${herdr.log.overlays.length} overlays, ${herdr.log.runs.length} runs`);
}

// The real check: props() is null and the world is empty.
await renderRole("check-mode (props null)", null, empty, null);
if (!roles.size) for (const r of ["resources", "banner", "command", "selection", "minimap", "herald"]) roles.set(r, { role: r, ...(r === "banner" ? { pane: "p1", terminal: "t1" } : {}) });
for (const [role, props] of roles) {
  const float = props.float ?? null;
  const p = { ...props }; delete p.float;
  await renderRole(`${role} (empty)`, p, empty, float);
  await renderRole(`${role} (demo)`, p, demo, float);
  if (role === "banner") {
    for (const pane of demo.panes) await renderRole(`banner ${pane.pane} (${pane.status ?? pane.mod ?? "shell"})`, { ...p, pane: pane.pane, terminal: pane.terminal }, demo, null);
  }
}
// Overlays opened by the roles, transitively.
let guard = 0;
while (overlayQueue.length && guard++ < 200) {
  const o = overlayQueue.shift()!;
  await renderRole(o.label, o.props, demo, null);
}
// Extra states (SPEC M5): 2x scale with calm mode, a narrow window (two-row HUD), macOS and Windows chrome.
herdr.log.shared["empires.scale"] = 2;
herdr.log.shared["empires.calm"] = true;
for (const role of ["resources", "banner", "command", "selection", "minimap", "herald"]) {
  const p = { ...(roles.get(role) ?? { role }) }; const float = p.float ?? null; delete p.float;
  await renderRole(`${role} (demo, scale 2, calm)`, p, demo, float);
}
delete herdr.log.shared["empires.scale"];
delete herdr.log.shared["empires.calm"];
sizeOverride = { width: 700, height: 900 };
await renderRole("resources (demo, narrow 700 px, portrait)", roles.get("resources") ?? { role: "resources" }, demo, null);
sizeOverride = null;
for (const platform of ["macos", "windows"] as const) {
  const w = { ...demo, window: { platform, titlebar: "none", buttons: platform === "windows", maximized: platform === "windows", fullscreen: false, active: true } };
  await renderRole(`resources (demo, ${platform})`, roles.get("resources") ?? { role: "resources" }, w, null);
}
herdr.log.shared["empires.hud"] = "hidden";
await renderRole("resources (demo, HUD hidden)", roles.get("resources") ?? { role: "resources" }, demo, null);
delete herdr.log.shared["empires.hud"];
// Phase 2: the command layer on, two units selected, a queue with orders, a control group.
herdr.log.shared["empires.command"] = true;
herdr.log.shared["empires.selected"] = ["t1", "t3"];
herdr.log.shared["empires.queue.s1"] = [{ task: "run the tests", unit: null, addedAt: now }, { task: "review the diff", unit: "monk", addedAt: now }];
herdr.log.shared["empires.autodispatch.s1"] = true;
herdr.log.shared["empires.groups"] = { 1: ["t1", "t3"] };
seenOverlay.clear();
for (const role of ["resources", "command", "selection", "minimap", "banner"]) {
  const p = { ...(roles.get(role) ?? { role }) }; delete p.float;
  await renderRole(`${role} (demo, command layer, 2 selected)`, p, demo, null);
}
guard = 0;
while (overlayQueue.length && guard++ < 200) {
  const o = overlayQueue.shift()!;
  await renderRole(o.label, o.props, demo, null);
}
herdr.log.shared["empires.selected"] = [];
await renderRole("selection (demo, command layer, focused only)", roles.get("selection") ?? { role: "selection" }, demo, null);
delete herdr.log.shared["empires.command"];

rmSync(work, { recursive: true, force: true });

// ---- 4. Report
const uniq = (l: string[]) => [...new Set(l)];
for (const w of uniq(warnings)) console.log(`warning: ${w}`);
if (errors.length) {
  for (const e of uniq(errors)) console.error(`error: ${e}`);
  console.error(`\ncheck failed: ${modDir} (${uniq(errors).length} errors, ${rendered} renders)`);
  process.exit(1);
}
console.log(`check passed: ${modDir} (${rendered} renders, ${uniq(warnings).length} warnings)`);
