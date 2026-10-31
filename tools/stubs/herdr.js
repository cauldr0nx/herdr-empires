// Stand-in for Herdr's `herdr` module (see gpui-kit.js): live data from a
// scenario the checker picks, shared state in memory, commands recorded.
export const log = { runs: [], overlays: [], sounds: [], notes: [], shared: {} };
let instance = { props: null, float: null };
let scenario = { spaces: [], agents: [], panes: [], terminals: [], focused: null, machines: [{ name: null, layout: "ready" }], placement: null, window: { platform: "linux", titlebar: "none", buttons: true, maximized: false, fullscreen: false, active: true }, layout: null, keys: [], settingsOverride: {}, home: "/home/<user>".replace("<user>", "demo"), appHome: "" };
let themeMap = {};
export function __configure(o) { Object.assign(scenario, o); }
export function __setInstance(i) { instance = i; }
export function __setTheme(t) { themeMap = t; }
export function __reset() { log.runs.length = 0; log.overlays.length = 0; log.sounds.length = 0; log.notes.length = 0; }

const ok = { code: 0, stdout: "", stderr: "" };
export const exec = async (cmd, args) => { if (typeof cmd !== "string") throw new Error("exec: command must be a string"); if (args !== undefined && !Array.isArray(args)) throw new Error("exec: args must be an array"); return ok; };
export const hc = async (args) => { if (!Array.isArray(args)) throw new Error("hc: args must be an array"); return { ...ok, stdout: '{"terminals":[],"machines":[]}' }; };
export const home = () => scenario.home;
export const appHome = () => scenario.appHome;
export const readTextFile = async () => null;
export const writeTextFile = async () => null;
export const knownAgents = async () => [{ key: "claude", name: "Claude Code", icon: "icons/claude.svg", tint: false, tile: "#1c1d21", color: "#ffffff", shell: false, agent: true, run: ["claude"], installed: true }, { key: "codex", name: "Codex", icon: "icons/codex.svg", tint: false, tile: "#1c1d21", color: "#ffffff", shell: false, agent: true, run: ["codex"], installed: false }];
export const pickFolder = async () => null;
export const playSound = (s) => { if (typeof s !== "string") throw new Error("playSound: string"); log.sounds.push(s); return null; };
export const run = (name, args) => {
  if (typeof name !== "string" || !/^[a-z_]+\.[a-z_]+(:[^ ]+)?$/.test(name)) throw new Error(`run: bad command name ${JSON.stringify(name)}`);
  if (args !== undefined && (typeof args !== "object" || args === null || Array.isArray(args))) throw new Error(`run(${name}): args must be an object`);
  log.runs.push([name, args ?? {}]);
  return null;
};
export const machines = () => scenario.machines;
export const spaces = () => scenario.spaces;
export const agents = () => scenario.agents;
export const panes = () => scenario.panes;
export const setAgentOrder = (list) => { if (!Array.isArray(list) || list.some((x) => typeof x !== "string")) throw new Error("setAgentOrder: string[]"); return null; };
export const terminals = () => scenario.terminals;
export const focused = () => scenario.focused;
export const layout = () => scenario.layout;
export const layouts = () => ["main", "terminals", "win98", "empires"];
export const commands = () => [];
const win = () => scenario.window;
export { win as window };
export const placement = () => (instance.float ? scenario.placement ?? { edge: "left", align: "end", vertical: true, hovered: false, dragging: false } : null);
export const theme = () => themeMap;
export const themes = () => [{ name: "empires", light: false, colors: themeMap }];
export const fonts = () => ["JetBrains Mono", "Geist", "Alegreya Sans", "Cinzel"];
export const updates = () => ({ app: { version: "0.1.10", ready: null, updates: false }, notes: [], core: { version: null, managed: null, ready: null, updating: false, error: null }, checked: null, checks: false, checking: false });
export const presentUpdateNotes = () => null;
export const telemetry = () => null;
export const settings = () => ({ font_family: "JetBrains Mono", font_size: 14, ui_font_family: "Alegreya Sans", ui_font_size: 13, zoom: 1, theme: "empires", theme_light: "empires", theme_dark: "empires", dark: true, colors: {}, terminal_padding: [6, 4], terminal_opacity: 1, clipboard_write: true, minimum_contrast: 1, option_as_alt: "auto", sounds: { enabled: true }, ...scenario.settingsOverride });
export const keys = () => scenario.keys;
export const openOverlay = (spec) => {
  if (!spec || typeof spec !== "object") throw new Error("openOverlay: spec");
  if (typeof spec.mod !== "string" && !(spec.layout && typeof spec.layout === "object")) throw new Error('openOverlay needs { mod: "<folder>" } or { layout: {...} }');
  if (spec.kind && !["dialog", "popup", "window"].includes(spec.kind)) throw new Error(`openOverlay: kind ${spec.kind}`);
  if (spec.frame !== undefined && spec.frame !== "none") throw new Error("openOverlay: frame must be \"none\"");
  const id = `ov${log.overlays.length + 1}`;
  log.overlays.push({ id, spec });
  return id;
};
export const closeOverlay = (id) => { if (typeof id !== "string") throw new Error("closeOverlay: id must be a string"); return null; };
export const notify = (n) => { if (!n || typeof n.title !== "string") throw new Error("notify: title"); log.notes.push(n); return "n1"; };
export const props = () => instance.props;
export const shared = (k) => (k in log.shared ? log.shared[k] : null);
export const setShared = (k, v) => { if (typeof k !== "string") throw new Error("setShared: key"); JSON.stringify(v); log.shared[k] = v; return null; };
export const nextCommand = () => new Promise(() => {});
export const watchFolder = () => new Promise(() => {});
