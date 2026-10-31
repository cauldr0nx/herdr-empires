// Herdr Empires view-model: pure functions from Herdr's live data (spaces(),
// agents(), panes(), terminals(), focused()) to what the HUD draws. No imports
// from "herdr" or "gpui-kit", so `bun test` runs it without the app.
//
// Vocabulary (SPEC §7.1): machine = realm, space = town, tab = building,
// terminal pane = unit (shells = workers), sub-agent = worker attached to its
// unit; status working / blocked / done / idle = gathering / under attack /
// task complete / idle.

export const STATUSES = ["blocked", "done", "working", "idle"];

/** Herdr's urgency order: blocked > done > working > idle. */
export function mostUrgent(statuses) {
  let best = null;
  for (const s of statuses) {
    if (!s) continue;
    const i = STATUSES.indexOf(s);
    if (i >= 0 && (best === null || i < STATUSES.indexOf(best))) best = s;
  }
  return best;
}

// ---- player colours (SPEC §4.1): 8 slots, mapped from Herdr's ansi1..ansi8 space colours.

export const PLAYER_COLORS = ["#3561d9", "#d23a2f", "#3e9e48", "#e2c13a", "#3cb3bf", "#8a4fc2", "#9b9b9b", "#e3802c"];
export const PLAYER_NAMES = ["blue", "red", "green", "yellow", "cyan", "purple", "gray", "orange"];

/**
 * A space's player colour. `slots` is shared("space.colors"): space id -> "ansiN"
 * (N 1..8) as Herdr assigns; a space without a slot gets one by its position.
 */
export function playerColor(spaceId, index, slots) {
  const slot = slots && typeof slots === "object" ? slots[spaceId] : undefined;
  const m = typeof slot === "string" ? /^ansi(\d+)$/.exec(slot) : null;
  let n = m ? Number(m[1]) : NaN;
  if (!(n >= 1 && n <= 8)) n = ((Number(index) || 0) % 8) + 1;
  return PLAYER_COLORS[n - 1];
}

// ---- paths: never a full home path (SPEC §15, unit-tested)

/** `~` for home, `~/x` under it; elsewhere only the last two segments (`…/a/b`). */
export function shortenPath(path, home) {
  if (!path || typeof path !== "string") return "";
  let p = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const h = (home || "").replace(/\\/g, "/").replace(/\/+$/, "");
  if (h && (p === h || p.startsWith(h + "/"))) return "~" + p.slice(h.length);
  // Someone else's home, or a Windows profile: still a person's name.
  const other = /^(\/home\/[^/]+|\/Users\/[^/]+|[A-Za-z]:\/Users\/[^/]+)(\/|$)/.exec(p);
  if (other) {
    const rest = p.slice(other[1].length);
    return "~" + rest;
  }
  const parts = p.split("/").filter(Boolean);
  if (parts.length <= 2) return p || "/";
  return "…/" + parts.slice(-2).join("/");
}

/** The repo or folder name for a title: the last segment, `~` at home. */
export function placeName(path, home) {
  const s = shortenPath(path, home);
  if (!s) return "";
  if (s === "~") return "~";
  const parts = s.split("/").filter((x) => x && x !== "…");
  return parts[parts.length - 1] ?? s;
}

// ---- units (panes)

/** A pane's program name for people: shells are workers. */
export function unitName(pane) {
  const prog = pane?.program;
  if (!prog) return pane?.title || "Unit";
  if (prog.shell || prog.key === "shell") return "Worker";
  return prog.name || pane?.title || "Unit";
}

/** `Program · repo-or-folder (branch)`, never an absolute path. */
export function paneTitle(pane, home) {
  if (!pane) return "";
  if (pane.mod) return pane.title || pane.mod;
  const name = unitName(pane);
  const place = placeName(pane.cwd, home);
  const branch = pane.branch ? ` (${pane.branch})` : "";
  return place ? `${name} · ${place}${branch}` : name;
}

/** Is this pane an agent (a unit) rather than a worker/shell or a mod pane? */
export function isAgentPane(pane) {
  return Boolean(pane && !pane.mod && pane.program && pane.program.agent);
}

/** Sub-agents of a terminal: core terminals whose `parent` is that address. */
export function subAgents(terminals, address) {
  if (!address || !Array.isArray(terminals)) return [];
  return terminals.filter((t) => t && t.parent === address && t.state !== "finished");
}

// ---- status presentation (SPEC §7.2), consistent everywhere

export const STATUS_LOOK = {
  working: { color: "working", badge: "hourglass", label: "gathering", motion: "shimmer" },
  blocked: { color: "blocked", badge: "swords", label: "under attack", motion: "pulse" },
  done: { color: "done", badge: "laurel", label: "task complete", motion: null },
  idle: { color: "idle", badge: null, label: "idle", motion: null },
};

export function statusLook(status) {
  return STATUS_LOOK[status] ?? { color: "unknown", badge: null, label: "", motion: null };
}

// ---- resources (SPEC §6.1): honest counts only

export const RESOURCE_SOURCES = {
  working: "agents working now",
  idle: "agents idle now",
  blocked: "agents waiting for you",
  done: "agents finished while you looked away",
  completed: "tasks completed this session",
  population: "live agents / population cap",
};

export const DEFAULT_RESOURCES = { food: "working", wood: "idle", gold: "completed", stone: "blocked" };
export const DEFAULT_POPCAP = 16;

export function countStatuses(agents) {
  const c = { working: 0, blocked: 0, done: 0, idle: 0 };
  for (const a of agents ?? []) if (a && c[a.status] !== undefined) c[a.status]++;
  return c;
}

/**
 * The resource bar's numbers. `session` is shared("empires.session")
 * ({ startedAt, completed, age }); `mapping` is shared("empires.resources").
 * Each counter says exactly what it counts (tooltip); nothing is estimated.
 */
export function resourceCounts(agents, terminals, session, mapping, popcap) {
  const counts = countStatuses(agents);
  const map = { ...DEFAULT_RESOURCES, ...(mapping && typeof mapping === "object" ? mapping : {}) };
  const value = (source) => (source === "completed" ? Number(session?.completed) || 0 : counts[source] ?? 0);
  const live = Array.isArray(terminals) ? terminals.filter((t) => t && t.state !== "finished" && t.program?.agent).length : (agents ?? []).length;
  const cap = Number(popcap) > 0 ? Number(popcap) : DEFAULT_POPCAP;
  const out = {};
  for (const k of ["food", "wood", "gold", "stone"]) {
    const src = RESOURCE_SOURCES[map[k]] ? map[k] : DEFAULT_RESOURCES[k];
    out[k] = { value: value(src), source: src, meaning: RESOURCE_SOURCES[src] };
  }
  out.population = { value: Math.max(live, (agents ?? []).length), cap, source: "population", meaning: RESOURCE_SOURCES.population };
  return out;
}

// ---- ages (SPEC §7.3): cosmetic progression, resets per session

export const AGES = ["Camp Age", "Village Age", "Keep Age", "Crown Age"];
export const DEFAULT_AGE_THRESHOLDS = [0, 3, 10, 25];

/** Which age `completed` tasks reach, and progress (0..1) toward the next. */
export function ageFor(completed, thresholds) {
  const th = Array.isArray(thresholds) && thresholds.length === AGES.length ? thresholds.map(Number) : DEFAULT_AGE_THRESHOLDS;
  const n = Math.max(0, Number(completed) || 0);
  let index = 0;
  for (let i = 0; i < th.length; i++) if (n >= th[i]) index = i;
  const next = index + 1 < th.length ? th[index + 1] : null;
  const from = th[index];
  const progress = next === null ? 1 : Math.min(1, Math.max(0, (n - from) / Math.max(1, next - from)));
  return { index, name: AGES[index], next, progress, completed: n };
}

// ---- transitions and the chronicle (SPEC §7.4)

/**
 * Status changes between two snapshots of agents(): [{ address, from, to, space, tab, at }].
 * `prev` is a map address -> status. New agents transition from null.
 */
export function transitions(prev, agents, now) {
  const out = [];
  const seen = {};
  for (const a of agents ?? []) {
    if (!a?.address) continue;
    seen[a.address] = a.status;
    const was = prev ? prev[a.address] : undefined;
    if (was !== a.status) out.push({ address: a.address, from: was ?? null, to: a.status, space: a.space_name ?? a.space, tab: a.tab_name ?? a.tab, unit: a.program?.name ?? a.app ?? "Unit", at: now });
  }
  return { changes: out, statuses: seen };
}

/** A task counts as completed when an agent reaches done (from any other status, e.g.
 *  blocked -> done after the person answered), or goes working -> idle. */
export function completions(changes) {
  return changes.filter((c) => (c.to === "done" && c.from !== "done" && c.from !== null) || (c.from === "working" && c.to === "idle")).length;
}

/** A tab's name for the unit card: only one someone named (an unnamed tab is just its number). */
export function tabLabel(tab) {
  return tab && tab.named && tab.name ? tab.name : "";
}

/** `town · place · branch` with repeats dropped (a space named after its folder). */
export function locationLine(town, place, branch) {
  const out = [];
  for (const x of [town, place, branch]) if (x && !out.includes(x)) out.push(x);
  return out.join(" · ");
}

/** Per-town score-screen rows from a chronicle log: { town, completed, blocked, working_ms, blocked_ms }. */
export function scoreboard(log) {
  const towns = {};
  const open = {}; // address -> { status, at }
  const rows = Array.isArray(log) ? [...log].sort((a, b) => a.at - b.at) : [];
  for (const c of rows) {
    const t = (towns[c.space] ??= { town: c.space, completed: 0, blocked: 0, working_ms: 0, blocked_ms: 0 });
    const o = open[c.address];
    if (o) {
      const dt = Math.max(0, c.at - o.at);
      if (o.status === "working") t.working_ms += dt;
      if (o.status === "blocked") t.blocked_ms += dt;
    }
    if (c.from === "working" && (c.to === "done" || c.to === "idle")) t.completed++;
    if (c.to === "blocked") t.blocked++;
    open[c.address] = { status: c.to, at: c.at };
  }
  return Object.values(towns).sort((a, b) => b.completed - a.completed || a.town.localeCompare(b.town));
}

// ---- navigation: idle-unit and alarm cycling (SPEC §6.5, §7.1)

/** Minimap order: spaces in Herdr order, then tab index, then pane order. */
export function orderAgents(spaces, agents) {
  const spaceIndex = {};
  (spaces ?? []).forEach((s, i) => (spaceIndex[s.id] = i));
  return [...(agents ?? [])]
    .sort((a, b) => (spaceIndex[a.space] ?? 999) - (spaceIndex[b.space] ?? 999) || (a.tab_index ?? 0) - (b.tab_index ?? 0) || String(a.pane).localeCompare(String(b.pane)))
    .map((a) => a.address);
}

/** The next agent in `order` after `current` whose status is in `want`, wrapping. */
export function nextWith(agents, order, current, want) {
  const list = (order ?? []).map((addr) => (agents ?? []).find((a) => a.address === addr)).filter((a) => a && want.includes(a.status));
  if (!list.length) return null;
  const i = list.findIndex((a) => a.address === current);
  return list[(i + 1) % list.length];
}

export const nextIdle = (agents, order, current) => nextWith(agents, order, current, ["idle", "done"]);
export const nextBlocked = (agents, order, current) => nextWith(agents, order, current, ["blocked"]);

// ---- time

export function elapsed(ms) {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

export function clock(ms) {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** "tab 2 of 3" for a tab in its space. */
export function tabPosition(space, tabId) {
  const tabs = space?.tabs ?? [];
  const i = tabs.findIndex((t) => t.id === tabId);
  return i < 0 ? "" : `tab ${i + 1} of ${tabs.length}`;
}

// ---- the minimap (SPEC §6.5)

export const RING_THRESHOLD = 12;

/** Territories (0..1 coordinates inside a unit diamond) for n spaces, as a grid of rhombi. */
export function territories(spaces) {
  const list = spaces ?? [];
  const n = list.length;
  if (!n) return [];
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return list.map((s, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    // Isometric grid: cell (c, r) -> diamond center.
    const x = 0.5 + ((c - r) / (cols + rows)) * 1;
    const y = 0.5 + ((c + r + 1 - (cols + rows) / 2) / (cols + rows)) * 1;
    return { id: s.id, index: i, col: c, row: r, cx: x, cy: y, w: 1 / (cols + rows), h: 1 / (cols + rows), remote: Boolean(s.machine) };
  });
}

/** Above RING_THRESHOLD spaces, the minimap draws a ring of banners instead of territories. */
export function minimapMode(count) {
  return count > RING_THRESHOLD ? "ring" : "territories";
}

/** Narrow window: the HUD collapses to two rows and the resource bar drops labels. */
export function isNarrow(width) {
  return Number(width) > 0 && Number(width) < 900;
}

// ---- the herald (SPEC §6.6): an original line bank per status

export const HERALD_LINES = {
  blocked: ["A {unit} in {town} awaits your orders.", "Word from {town}: the {unit} is under attack.", "The {unit} in {town} calls for the crown's judgement."],
  done: ["The {unit} in {town} has finished its task.", "Good news from {town}: the {unit} reports success.", "A task is complete in {town}, my liege."],
  idle: ["A {unit} stands idle in {town}.", "The {unit} in {town} has nothing to do."],
  working: ["The {unit} in {town} is gathering."],
};

export function heraldLine(agent, seed) {
  if (!agent) return "";
  const bank = HERALD_LINES[agent.status] ?? HERALD_LINES.idle;
  const line = bank[Math.abs(Number(seed) || 0) % bank.length];
  const unit = (agent.program?.name ?? agent.app ?? "unit").toLowerCase().replace(/ code$/, " scholar");
  return line.replace("{unit}", unit).replace("{town}", agent.space_name ?? "the town");
}

/** The most urgent, most recently changed agent that needs a person (not the focused one). */
export function heraldNews(agents, dismissed) {
  const list = (agents ?? [])
    .filter((a) => (a.status === "blocked" || a.status === "done") && !a.focused)
    .filter((a) => !(dismissed ?? []).includes(`${a.address}:${a.status}`))
    .sort((a, b) => (a.status === "blocked") - (b.status === "blocked") || (a.seq ?? 0) - (b.seq ?? 0));
  return list.pop() ?? null;
}

// ---- the tech tree (SPEC §6.8): keybindings grouped as technologies

export const TECH_CATEGORIES = [
  ["Town planning", /^(space|layout)\./],
  ["Architecture", /^(tab)\./],
  ["Military", /^(pane)\./],
  ["Scouting", /^(agent|terminal)\./],
  ["Empires", /^empires\./],
  ["The Crown", /^(app|window|mod)\./],
];

export function techTree(keys, section) {
  const rows = (keys ?? []).filter((k) => !section || k.section === section || k.section === "global");
  const groups = TECH_CATEGORIES.map(([name]) => ({ name, items: [] }));
  const other = { name: "Lore", items: [] };
  for (const k of rows) {
    const g = TECH_CATEGORIES.findIndex(([, re]) => re.test(k.action));
    (g >= 0 ? groups[g] : other).items.push({ keys: k.keys, action: k.action, section: k.section });
  }
  return [...groups, other].filter((g) => g.items.length);
}

// ---- Phase 2: the command layer (SPEC §14)

export const UNIT_TYPES = [
  { key: "villager", name: "Villager", role: "general implementer", glyph: "worker" },
  { key: "scout", name: "Scout", role: "read-only explorer", glyph: "peek" },
  { key: "monk", name: "Monk", role: "reviewer", glyph: "chronicle" },
  { key: "mason", name: "Mason", role: "test / build runner", glyph: "build" },
  { key: "captain", name: "Captain", role: "lead / orchestrator", glyph: "unit" },
];

/** The selected units: the explicit multi-selection (addresses still alive), else the focused agent. */
export function selectedUnits(agents, selection, focusedAddress) {
  const alive = new Set((agents ?? []).map((a) => a.address));
  const picked = (Array.isArray(selection) ? selection : []).filter((addr) => alive.has(addr));
  if (picked.length) return picked;
  return focusedAddress && alive.has(focusedAddress) ? [focusedAddress] : [];
}

/** Toggles an address in a multi-selection (shift-click). */
export function toggleSelected(selection, address) {
  const list = Array.isArray(selection) ? [...selection] : [];
  const i = list.indexOf(address);
  if (i >= 0) list.splice(i, 1);
  else list.push(address);
  return list;
}

/** Control groups by terminal address, pruned to the terminals still alive. */
export function pruneGroups(groups, terminals) {
  const alive = new Set((terminals ?? []).filter((t) => t && t.state !== "finished").map((t) => t.address));
  const out = {};
  for (const [k, list] of Object.entries(groups && typeof groups === "object" ? groups : {})) {
    const kept = (Array.isArray(list) ? list : []).filter((a) => alive.has(a));
    if (kept.length) out[k] = kept;
  }
  return out;
}

export const queueKey = (spaceId) => `empires.queue.${spaceId}`;
export const rallyKey = (spaceId) => `empires.rally.${spaceId}`;
export const autoKey = (spaceId) => `empires.autodispatch.${spaceId}`;

/**
 * Which queued task goes to a unit that just went idle in its town. Never a
 * blocked unit; only when the town auto-dispatches; a task may name a unit
 * type (`unit`) and then only matches that type (`agentUnit`, from its label).
 */
export function nextDispatch(queue, agent, auto, agentUnit) {
  if (!auto || !agent || agent.status !== "idle") return null;
  const list = Array.isArray(queue) ? queue : [];
  const i = list.findIndex((q) => q && q.task && (!q.unit || !agentUnit || q.unit === agentUnit));
  return i < 0 ? null : { index: i, task: list[i] };
}

/** Names the targets of a destructive order, for its confirmation text. */
export function nameTargets(agents, addresses) {
  return (addresses ?? [])
    .map((addr) => {
      const a = (agents ?? []).find((x) => x.address === addr);
      return a ? `${a.program?.name ?? "unit"} in ${a.space_name} / ${a.tab_name}` : addr;
    })
    .join("\n");
}

/** A Captain's army: its direct children among the terminals, alive first. */
export function army(terminals, captainAddress) {
  return subAgents(terminals, captainAddress);
}

// ---- the world layer (SPEC §18): towns, buildings, units, as pure functions

/** A stable 32-bit hash of a string (FNV-1a), for seeded layouts that survive restarts. */
export function hashStr(s) {
  let h = 0x811c9dc5;
  const str = String(s ?? "");
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A small seeded PRNG (mulberry32): returns a function giving floats in [0, 1). */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The eight sheet directions, clockwise on screen from facing the viewer. */
export const DIRS = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"];

/** The sheet direction for a screen-space movement (dx right, dy down). */
export function dirFor(dx, dy) {
  if (!dx && !dy) return "S";
  // atan2 with screen y down: 0 = east. Map to S=0, SW=1, ... clockwise on screen.
  const a = Math.atan2(dy, dx); // east 0, south +pi/2
  const deg = ((a * 180) / Math.PI + 360) % 360; // 0 E, 90 S, 180 W, 270 N
  const idx = Math.round(((deg - 90 + 360) % 360) / 45) % 8; // 0 S, 1 SW, 2 W, ...
  return DIRS[idx];
}

/** The row of a direction in a sheet with `dirs` rows (8: all; 2: S and N; 1: S only). */
export function dirRow(dir, dirs, order = DIRS) {
  const i = Math.max(0, order.indexOf(dir));
  if (dirs >= 8) return i;
  if (dirs === 2) return i === 3 || i === 4 || i === 5 ? 1 : 0; // rows S, N: NW/N/NE face away
  return 0;
}

/** Building kind for a tab: settled tabs are houses, shell-only tabs houses, agent tabs a workshop. */
export function buildingKind(tab, agentsInTab, level = 3) {
  if (!tab) return "house";
  if (tab.settled || !agentsInTab.length) return "house";
  // Workshops unlock with the town's level, so a young town's tabs are humble buildings.
  const kinds = ["lumber_camp", "mining_camp", "mill", ...(level >= 4 ? ["market", "blacksmith"] : []), ...(level >= 6 ? ["university", "monastery"] : [])];
  return kinds[hashStr(tab.id) % kinds.length];
}

/** Every building type the pack can draw, for the right-click "Change type" menu. */
export const BUILDING_KINDS = ["house", "lumber_camp", "mining_camp", "mill", "market", "blacksmith", "university", "monastery", "defense_tower", "sentry_tower", "corral", "fortress", "wonder"];

/**
 * A town's level, 0..9, from what its repo and its history say: commits (log-scaled, so a
 * big repo is a big town without a 10k-commit repo being absurd), the repo's (or the town's)
 * age in days, and tasks completed there. Cosmetic, deterministic, and only ever grows with
 * real work.
 */
export function townLevel(stats = {}) {
  const commits = Math.max(0, Number(stats.commits) || 0);
  const days = Math.max(0, Number(stats.ageDays) || 0);
  const done = Math.max(0, Number(stats.completed) || 0);
  const score = Math.log2(commits + 1) * 0.9 + Math.sqrt(days) * 0.6 + Math.sqrt(done) * 0.8;
  return Math.max(0, Math.min(9, Math.floor(score / 1.6)));
}

/** A town's personality, from its id: what it builds most as it grows. */
export const TOWN_STYLES = {
  farm: { name: "farming", pool: ["field", "field", "mill", "corral", "field", "house", "market"] },
  war: { name: "military", pool: ["defense_tower", "palisade", "sentry_tower", "blacksmith", "corral", "palisade_corner", "gate", "fortress"] },
  trade: { name: "trade", pool: ["market", "house", "blacksmith", "lumber_camp", "market", "mill", "house"] },
  faith: { name: "faith", pool: ["monastery", "house", "field", "university", "sentry_tower", "house"] },
};
export function townStyle(seed) {
  const keys = Object.keys(TOWN_STYLES);
  return keys[(seed >>> 0) % keys.length];
}

/** The level a building kind needs before a town may build it (grander things come later). */
export const UNLOCK = { house: 0, field: 0, mill: 1, lumber_camp: 1, corral: 2, palisade: 2, palisade_corner: 3, gate: 3, market: 3, blacksmith: 3, defense_tower: 4, sentry_tower: 4, monastery: 5, university: 5, fortress: 7, wonder: 9 };

/**
 * The town's grown buildings (decor, not tabs) for a level, shaped by the town's style: about
 * 2-3 per level, roughly half from the style's pool, a third houses, the rest anything the
 * level has unlocked; a fortress near the centre from level 7 and a wonder at 9. Placed on
 * rings seeded by the space, clear of `taken` (tab buildings, forest, resources), so no two
 * towns look alike. Positions are relative to the town center, world px.
 */
export function townExtras(seed, level, taken = []) {
  const r = seeded(seed ^ 0x9e3779b9);
  const style = TOWN_STYLES[townStyle(seed)];
  const unlocked = (k) => (UNLOCK[k] ?? 0) <= level;
  const general = Object.keys(UNLOCK).filter((k) => unlocked(k) && k !== "wonder" && k !== "fortress");
  const count = 1 + Math.round(Math.max(0, level) * 2.6);
  const kinds = [];
  if (level >= 7) kinds.push("fortress");
  if (level >= 9) kinds.push("wonder");
  let pi = Math.floor(r() * style.pool.length);
  while (kinds.length < count) {
    const roll = r();
    let k = roll < 0.5 ? style.pool[pi++ % style.pool.length] : roll < 0.82 ? "house" : general[Math.floor(r() * general.length)];
    if (!unlocked(k)) k = r() < 0.5 ? "house" : "field";
    kinds.push(k);
  }
  const out = [];
  const spots = [...taken];
  kinds.forEach((kind, i) => {
    // Great buildings stand near the centre; the rest spread over growing rings.
    const near = kind === "fortress" || kind === "wonder";
    let best = null;
    for (let tries = 0; tries < 28; tries++) {
      const a = r() * Math.PI * 2;
      const rad = near ? 330 + tries * 14 : 300 + Math.floor(i / 7) * 115 + r() * 130 + tries * 12;
      const p = { x: Math.round(Math.cos(a) * rad), y: Math.round(Math.sin(a) * rad * 0.5) + 20 };
      const room = near ? 230 : 160;
      if (spots.every((q) => Math.hypot(p.x - q.x, (p.y - q.y) * 2) > room)) {
        best = p;
        break;
      }
      best ??= p;
    }
    spots.push(best);
    out.push({ kind, x: best.x, y: best.y, id: `${seed}:${i}` });
  });
  return out;
}

/** The smallest free town slot for each space (stable map positions); returns the new map. */
export function assignSlots(spaceIds, slots = {}) {
  const out = { ...slots };
  const used = new Set(Object.values(out));
  for (const id of spaceIds) {
    if (out[id] !== undefined) continue;
    let k = 0;
    while (used.has(k)) k++;
    out[id] = k;
    used.add(k);
  }
  return out;
}

/** The resource a tab's units gather: stable per tab. */
export function resourceKind(tabId) {
  return ["wood", "gold", "stone", "food"][hashStr(`res:${tabId}`) % 4];
}

/** Where town `k` (0 = the active one) sits, in world px: a spiral, so neighbours ring the active town. */
export function townOrigin(k, spacing = 2600) {
  if (k === 0) return { x: 0, y: 0 };
  const ring = Math.ceil((Math.sqrt(k + 1) - 1) / 2) || 1;
  const a = k * 2.399963; // golden angle: evenly spread
  return { x: Math.round(Math.cos(a) * spacing * ring), y: Math.round(Math.sin(a) * spacing * 0.5 * ring) };
}

/** Building and resource spots around a town center (world px, relative to the town origin). */
export function townSites(seed, buildings) {
  const r = seeded(seed);
  const spots = [];
  const n = Math.max(buildings, 1);
  const start = r() * Math.PI * 2;
  for (let i = 0; i < buildings; i++) {
    const a = start + (i / n) * Math.PI * 2;
    const rad = 230 + (i % 2) * 70;
    spots.push({ x: Math.round(Math.cos(a) * rad), y: Math.round(Math.sin(a) * rad * 0.5) + 30 });
  }
  const forestA = start + Math.PI + (r() - 0.5);
  const forest = [];
  for (let i = 0; i < 14; i++) {
    const a = forestA + (i - 7) * 0.13 + (r() - 0.5) * 0.08;
    const rad = 520 + r() * 110;
    forest.push({ x: Math.round(Math.cos(a) * rad), y: Math.round(Math.sin(a) * rad * 0.5), v: Math.floor(r() * 3) });
  }
  const at = (a, rad) => ({ x: Math.round(Math.cos(a) * rad), y: Math.round(Math.sin(a) * rad * 0.5) });
  return {
    buildings: spots,
    forest,
    nodes: {
      wood: at(forestA, 470),
      gold: at(forestA + 1.9, 470),
      stone: at(forestA - 1.9, 480),
      food: at(forestA + Math.PI, 330),
    },
  };
}

/**
 * The whole world: towns (one per space) with buildings (one per tab) and units (one per
 * agent), in world px. `activeSpace` goes to the origin. Units carry what the renderer needs:
 * where they live, where they go, their status and colour slot. Caps per SPEC §18.3.
 */
export function worldModel({ spaces = [], agents = [], terminals = [], colors = null, maxUnits = 60, maxBuildings = 40, slots = null, townPos = {}, buildingPos = {}, kinds = {}, stats = {}, looks = ["villager"], minLevels = {}, hideNames = false, plan: planOf = null } = {}) {
  const active = spaces.findIndex((s) => s.active);
  const order = active > 0 ? [spaces[active], ...spaces.filter((_, i) => i !== active)] : spaces.slice();
  const towns = [];
  const units = [];
  let buildingCount = 0;
  order.forEach((s, k) => {
    const index = spaces.indexOf(s);
    // Static map: a town keeps its slot (and any spot it was moved to) whatever is shown.
    const slot = slots && slots[s.id] !== undefined ? slots[s.id] : k;
    const origin = townPos[s.id] ? { x: townPos[s.id].x, y: townPos[s.id].y } : townOrigin(slot);
    // Growth never goes backwards: a town keeps the highest level it has reached.
    const level = Math.max(townLevel(stats[s.id]), Math.min(9, Number(minLevels[s.id]) || 0));
    const tabs = (s.tabs ?? []).slice(0, Math.max(0, maxBuildings - buildingCount));
    buildingCount += tabs.length;
    const mine = agents.filter((a) => a.space === s.id);
    const seed = hashStr(s.id);
    const style = townStyle(seed);
    // The planner places everything on the tile grid (SPEC §18.3); overrides win after it.
    const planTabs = tabs.map((t) => ({ id: t.id, resource: resourceKind(t.id), kind: kinds[t.id] ?? null, house: Boolean(t.settled) || !mine.some((a) => a.tab === t.id) }));
    // `planOf` (the world role) may answer from a cache and plan in the background; tests and
    // tools plan right here.
    const plan = (planOf ? planOf(seed, level, style, planTabs) : planTown(seed, level, style, planTabs)) ?? EMPTY_PLAN;
    const buildings = tabs.map((t) => {
      const pb = plan.tabBuildings.find((b) => b.tab === t.id) ?? { kind: "house", x: 0, y: 160 };
      const at = buildingPos[t.id] ?? pb;
      return { tab: t.id, name: t.name, kind: kinds[t.id] ?? pb.kind, custom: Boolean(kinds[t.id]), settled: Boolean(t.settled), status: t.status ?? null, x: origin.x + at.x, y: origin.y + at.y };
    });
    const color = playerColor(s.id, index, colors);
    const off = (p) => ({ x: origin.x + p.x, y: origin.y + p.y });
    const town = {
      space: s.id,
      name: hideNames ? townAlias(s.id, slots) : s.name,
      active: Boolean(s.active),
      remote: Boolean(s.machine),
      color,
      slot: colorSlot(s.id, index, colors),
      level,
      style: TOWN_STYLES[style].name,
      stats: stats[s.id] ?? null,
      x: origin.x,
      y: origin.y,
      buildings,
      // Grown buildings take the same overrides as tab buildings, keyed by their id.
      extras: plan.extras.map((e) => ({ ...e, kind: kinds[e.id] ?? e.kind, custom: Boolean(kinds[e.id]), ...off(buildingPos[e.id] ?? e) })),
      forest: plan.forest.map((f) => ({ ...f, ...off(f) })),
      mines: plan.mines.map((m) => ({ ...m, ...off(m) })),
      walls: plan.walls ? { type: plan.walls.type, pieces: plan.walls.pieces.map((w) => ({ ...w, ...off(w) })) } : null,
      nodes: Object.fromEntries(Object.entries(plan.nodes).map(([k2, p]) => [k2, off(p)])),
      hidden: 0,
    };
    towns.push(town);
    mine.forEach((a, i) => {
      const b = buildings.find((x) => x.tab === a.tab);
      if (b?.settled) return; // garrisoned: inside, not drawn
      if (units.length >= maxUnits) {
        town.hidden++;
        return;
      }
      const res = resourceKind(a.tab);
      const ring = (i * 2.4) % (Math.PI * 2);
      const idle = { x: origin.x + Math.round(Math.cos(ring) * (120 + (i % 3) * 26)), y: origin.y + 70 + Math.round(Math.sin(ring) * (40 + (i % 3) * 12)) };
      // Waiting spots in front of the town center: a row of five, then a second row, so alerts never stack.
      const door = { x: origin.x - 70 + (i % 5) * 36, y: origin.y + 92 + Math.floor((i % 10) / 5) * 30 };
      const subs = terminals.filter((t) => t.parent === a.address).length;
      const look = looks.length ? looks[hashStr(`look:${a.address}`) % looks.length] : "villager";
      units.push({ address: a.address, look, scale: 0.92 + (hashStr(`size:${a.address}`) % 15) / 100, status: a.status, town: s.id, slot: town.slot, color, focused: Boolean(a.focused), name: a.program?.name ?? a.app ?? "Unit", tab: a.tab, home: b ? { x: b.x, y: b.y + 40 } : door, node: town.nodes[res], resource: res, idle, door, workers: subs });
    });
  });
  return { towns, units };
}

/** Which colour slot name a space uses, matching playerColor(). */
export function colorSlot(spaceId, index, colors) {
  const names = ["blue", "red", "green", "yellow", "cyan", "purple", "gray", "orange"];
  const slot = colors && typeof colors === "object" ? colors[spaceId] : null;
  const m = typeof slot === "string" ? /^ansi(\d+)$/.exec(slot) : null;
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 8) return names[n - 1];
  }
  return names[Math.max(0, index) % names.length];
}

/**
 * Where a working unit is and what it does at time `t` (ms since its trip began), for a
 * there-and-back trip of `period` ms with ease-in-out (the native loop's default): out with
 * empty hands, gathering around the far end, back carrying. Returns { phase, leg, anim, dir }.
 */
export function tripState(t, period, from, to, resource = "wood") {
  const p = (((t % period) + period) % period) / period; // 0 at home, 0.5 at the node
  const outbound = p < 0.5;
  const nearNode = Math.abs(p - 0.5) < 0.09;
  const nearHome = p < 0.04 || p > 0.96;
  const dir = outbound ? dirFor(to.x - from.x, to.y - from.y) : dirFor(from.x - to.x, from.y - to.y);
  const anim = nearNode ? `gather_${resource}` : nearHome ? "idle" : outbound ? "walk" : "carry";
  return { phase: p, leg: outbound ? "out" : "back", anim, dir };
}

/** Resolves an anim name through fallbacks a partial pack can satisfy. */
export function animFallback(anims, name) {
  const chain = { gather_stone: ["gather_stone", "gather_gold", "gather_wood", "walk"], gather_food: ["gather_food", "gather_wood", "walk"], gather_gold: ["gather_gold", "gather_wood", "walk"], gather_wood: ["gather_wood", "walk"], carry: ["carry", "walk"], walk: ["walk", "idle"], idle: ["idle", "walk"] }[name] ?? [name, "idle"];
  for (const n of chain) if (anims?.[n]) return n;
  return null;
}

/** Resolves an entity through fallbacks (SPEC §18.4). */
export function entityFallback(entities, name) {
  const chain = {
    university: ["university", "monastery", "house"],
    monastery: ["monastery", "university", "house"],
    mill: ["mill", "house"],
    lumber_camp: ["lumber_camp", "mining_camp", "house"],
    mining_camp: ["mining_camp", "lumber_camp", "house"],
    market: ["market", "mill", "house"],
    blacksmith: ["blacksmith", "lumber_camp", "house"],
    defense_tower: ["defense_tower", "sentry_tower"],
    sentry_tower: ["sentry_tower", "defense_tower"],
    corral: ["corral", "mill"],
    fortress: ["fortress", "university", "monastery"],
    wonder: ["wonder", "fortress", "monastery"],
    stone_mine: ["stone_mine", "gold_mine"],
    berry_bush: ["berry_bush", "tree"],
  }[name] ?? [name];
  for (const n of chain) if (entities?.[n]) return n;
  return null;
}

/** The view modes (SPEC §18.2), cycled by empires.view. */
export const VIEWS = ["map", "split", "terminals"];
export function nextView(v) {
  const i = VIEWS.indexOf(v);
  return VIEWS[((i < 0 ? 0 : i) + 1) % VIEWS.length]; // unknown counts as the default, map
}

// ---- hide names (Options → Hide names): for screenshots and screen sharing

export const TOWN_ALIASES = ["Ashford", "Briarwood", "Coldwater", "Dunmore", "Eastholm", "Fairhaven", "Greystone", "Hollowmere", "Ironbridge", "Kingsreach", "Larkfield", "Millbrook", "Northwatch", "Oakridge", "Ravensworth", "Stonehaven", "Thornbury", "Westmarch"];

/** A stable made-up town name for a space, so screenshots show no real workspace names. With
 *  the town slots (unique per space), names never repeat until the list runs out. */
export function townAlias(id, slots = null) {
  const k = slots && slots[id] !== undefined ? Number(slots[id]) : hashStr(`alias:${id}`);
  return TOWN_ALIASES[k % TOWN_ALIASES.length] + (slots && k >= TOWN_ALIASES.length ? ` ${Math.floor(k / TOWN_ALIASES.length) + 1}` : "");
}

// ---- the town planner (SPEC §18.3): an RTS-AI-style build order on the iso tile grid
//
// Every building has a square footprint on the 2:1 tile grid and never overlaps another.
// Resources come first (a forest blob, gold and stone mines, berries), seeded per town. Then
// the town grows the way RTS AIs build: houses in a housing district by the town center;
// drop sites next to their resource (lumber camp at the forest edge, mining camp at the mine,
// mill by the berries with fields packed around it); market, smithy, temple and university on
// the inner ring; a palisade, then stone walls, closed around the core along the grid with a
// gate on each side and towers on the corners; a fortress, and a wonder for the biggest
// towns. A tab's building is the drop site for what its agent gathers, so trips are short.
// Ids are `<seed>:<kind>:<n>`: stable as a town grows, so moves and type changes stick.

export const TILE = { w: 96, h: 48 };
export const FOOT = { town_center: 4, house: 2, mill: 2, lumber_camp: 3, mining_camp: 3, market: 3, blacksmith: 3, monastery: 4, university: 4, defense_tower: 2, sentry_tower: 2, corral: 3, fortress: 4, wonder: 5, field: 4, gold_mine: 2, stone_mine: 2, berry_bush: 2 };

/** World px (relative to the town center) of a tile's centre; fractional tiles allowed. */
export function tileToWorld(i, j, tile = TILE) {
  return { x: Math.round(((i - j) * tile.w) / 2), y: Math.round(((i + j) * tile.h) / 2) };
}

/** The drop site a resource needs. */
export const DROPSITE = { wood: "lumber_camp", gold: "mining_camp", stone: "mining_camp", food: "mill" };

/** The build order, by level: what a town adds (cumulative). WALLS/TOWERS are wall steps. */
export function buildOrder(level, style) {
  const L = [
    ["house", "house"],
    ["mill", "lumber_camp", "house"],
    ["mining_camp:gold", "field", "field", "house"],
    ["blacksmith", "market", "field", "house", "WALLS:palisade"],
    ["house", "house", "field", "TOWERS"],
    ["monastery", "university", "mining_camp:stone", "house"],
    ["corral", "house", "house", "field", "GATE_TOWERS"],
    ["fortress", "house", "field"],
    ["house", "house", "market", "field", "WALLS:stone"],
    ["wonder", "house"],
  ];
  const extra = {
    farm: { 2: ["field"], 3: ["field"], 4: ["field", "field"], 6: ["mill", "field"], 8: ["field", "field"] },
    war: { 3: ["TOWERS", "defense_tower"], 5: ["GATE_TOWERS", "WALLS:stone"], 6: ["defense_tower"], 7: ["defense_tower"] },
    trade: { 3: ["house"], 4: ["market"], 5: ["house", "house"], 7: ["market", "house"] },
    faith: { 3: ["monastery"], 4: ["university"], 6: ["monastery"] },
  }[style] ?? {};
  const out = [];
  for (let l = 0; l <= Math.min(9, Math.max(0, level)); l++) out.push(...L[l], ...(extra[l] ?? []));
  // A style that brings a building forward doesn't build it twice later.
  const seen = {};
  return out.filter((k) => {
    if (k === "monastery" || k === "university" || k === "TOWERS" || k === "GATE_TOWERS" || k === "WALLS:stone") {
      seen[k] = (seen[k] ?? 0) + 1;
      if (k !== "monastery" && seen[k] > 1) return false;
      if (k === "monastery" && seen[k] > (style === "faith" ? 2 : 1)) return false;
    }
    return true;
  });
}

const planCache = new Map();

/**
 * Plans one town. tabs: [{ id, resource: wood|gold|stone|food, kind (override or null),
 * house (true: a plain tab, settled or without agents) }]. Returns, in world px relative to
 * the town center: { tabBuildings: [{ tab, kind, x, y }], extras: [{ id, kind, x, y }],
 * forest: [{ x, y, v }], mines: [{ kind, x, y }], nodes: { wood, gold, stone, food },
 * walls: null | { type, pieces: [{ part, x, y }] } }. Cached: the same inputs give the same plan.
 */
/** The cache key of a plan: everything planTown depends on. */
export function planKey(seed, level, style, tabs = [], tile = TILE) {
  return `p2|${seed}|${level}|${style}|${tabs.map((t) => `${t.id}:${t.resource}:${t.kind ?? ""}:${t.house ? 1 : 0}`).join(",")}|${tile.w}x${tile.h}`;
}

/** A finished plan from the in-memory cache, or null (callers may compute it elsewhere). */
export function cachedPlan(key) {
  return planCache.get(key) ?? null;
}

/** Puts a plan (e.g. restored from storage) into the in-memory cache. */
export function rememberPlan(key, plan) {
  if (planCache.size > 64) planCache.clear();
  planCache.set(key, plan);
}

/** A town with no plan yet: just its town center and its resources' rough spots. */
export const EMPTY_PLAN = { tabBuildings: [], extras: [], forest: [], mines: [], nodes: { wood: { x: -300, y: 0 }, gold: { x: 300, y: 0 }, stone: { x: 0, y: 200 }, food: { x: 0, y: -160 } }, walls: null, pending: true };

export function planTown(seed, level, style, tabs = [], tile = TILE) {
  const key = planKey(seed, level, style, tabs, tile);
  if (planCache.has(key)) return planCache.get(key);
  const r = seeded(seed ^ 0x51ed270b);
  // Occupancy as a flat byte grid (tiles -G..G): mods run in an interpreter, where string-keyed
  // sets cost far more than array reads.
  const G = 48, SIDE = 2 * G + 1;
  const grid = new Uint8Array(SIDE * SIDE);
  const idx = (i, j) => (i < -G || i > G || j < -G || j > G ? -1 : (i + G) * SIDE + (j + G));
  const free = (i, j) => {
    const k = idx(i, j);
    return k >= 0 && grid[k] === 0;
  };
  const mark = (i, j) => {
    const k = idx(i, j);
    if (k >= 0) grid[k] = 1;
  };
  const take = (i, j, n) => {
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) mark(i + a, j + b);
  };
  const fits = (i, j, n, m) => {
    for (let a = -m; a < n + m; a++) for (let b = -m; b < n + m; b++) if (!free(i + a, j + b)) return false;
    return true;
  };
  const occ = { add: (key) => { const [i, j] = key.split(",").map(Number); mark(i, j); } };
  const centre = (i, j, n) => ({ ci: i + (n - 1) / 2, cj: j + (n - 1) / 2 });
  // Spiral search for the free spot whose centre is nearest the anchor.
  const place = (n, near, m = 1, maxR = 30) => {
    const ai = Math.round(near.ci - (n - 1) / 2), aj = Math.round(near.cj - (n - 1) / 2);
    for (let rad = 0; rad <= maxR; rad++) {
      let best = null;
      // Walk only the ring's perimeter (8·rad cells), keeping the nearest fit on it.
      const ring = rad === 0 ? [[0, 0]] : [];
      for (let t = -rad; t <= rad; t++) ring.push([t, -rad], [t, rad]);
      for (let t = -rad + 1; t < rad; t++) ring.push([-rad, t], [rad, t]);
      for (const [di, dj] of ring) {
          const i = ai + di, j = aj + dj;
          if (!fits(i, j, n, m)) continue;
          const c = centre(i, j, n);
          const d = Math.hypot(c.ci - near.ci, c.cj - near.cj);
          if (!best || d < best.d) best = { i, j, d };
        }
      if (best) {
        take(best.i, best.j, n);
        return centre(best.i, best.j, n);
      }
    }
    return null;
  };
  const at = (ang, dist) => ({ ci: Math.round(Math.cos(ang) * dist), cj: Math.round(Math.sin(ang) * dist) });
  const world = (c) => tileToWorld(c.ci, c.cj, tile);

  // The town center, and a clear ring round it (the square in front of it stays open).
  take(-2, -2, FOOT.town_center);
  const a0 = r() * Math.PI * 2; // where the forest lies
  // Resources: a forest blob, then mines and berries around the town.
  const forestC = at(a0, 12);
  const trees = [];
  for (let di = -4; di <= 4; di++)
    for (let dj = -4; dj <= 4; dj++) {
      const d = Math.hypot(di, dj);
      if (d > 3.6 + r() * 0.9) continue;
      const i = forestC.ci + di, j = forestC.cj + dj;
      occ.add(`${i},${j}`);
      if (r() < 0.8) trees.push({ ci: i + (r() - 0.5) * 0.5, cj: j + (r() - 0.5) * 0.5, v: Math.floor(r() * 3) });
    }
  const edge = (c, toward = { ci: 0, cj: 0 }) => {
    // The free tile next to a resource, on its town side.
    const len = Math.hypot(toward.ci - c.ci, toward.cj - c.cj) || 1;
    for (let s = 1; s < 12; s++) {
      const p = { ci: Math.round(c.ci + ((toward.ci - c.ci) / len) * s), cj: Math.round(c.cj + ((toward.cj - c.cj) / len) * s) };
      if (free(p.ci, p.cj)) return p;
    }
    return c;
  };
  const mineAt = (kind, ang, dist) => {
    const c = place(FOOT[kind], at(ang, dist), 1);
    return { kind, ...c };
  };
  const gold = mineAt("gold_mine", a0 + 2.1 + (r() - 0.5) * 0.4, 9);
  const stone = mineAt("stone_mine", a0 - 2.1 + (r() - 0.5) * 0.4, 9.5);
  const berries = mineAt("berry_bush", a0 + Math.PI + (r() - 0.5) * 0.6, 6.5);
  const nodes = { wood: edge(forestC), gold: edge(gold), stone: edge(stone), food: edge(berries) };
  // Districts.
  const housing = at(a0 + Math.PI + 0.9, 5);
  const inner = at(a0 + Math.PI - 1.0, 5.5);
  const millSpot = { ...nodes.food };
  const tabBuildings = [];
  const extras = [];
  const count = {};
  const dropsites = {};
  let millC = null;
  const anchorFor = (kind, sub) => {
    if (kind === "house") return housing;
    if (kind === "mill") return millSpot;
    if (kind === "field") return millC ?? millSpot;
    if (kind === "corral") return millC ?? millSpot;
    if (kind === "lumber_camp") return nodes.wood;
    if (kind === "mining_camp") return sub === "stone" ? nodes.stone : nodes.gold;
    if (kind === "fortress") return at(a0 + Math.PI, 7);
    if (kind === "wonder") return at(a0 + Math.PI - 0.4, 6.5);
    if (kind === "defense_tower" || kind === "sentry_tower") return at(r() * Math.PI * 2, 5);
    return inner;
  };
  const margin = (kind) => (kind === "house" || kind === "field" ? 0 : 1);
  const add = (kind, sub, tab) => {
    const n = FOOT[kind] ?? 3;
    const c = place(n, anchorFor(kind, sub), margin(kind));
    if (!c) return null;
    if (kind === "mill" && !millC) millC = c;
    const p = world(c);
    if (tab) tabBuildings.push({ tab: tab.id, kind, x: p.x, y: p.y, ci: c.ci, cj: c.cj });
    else {
      count[kind] = (count[kind] ?? 0) + 1;
      extras.push({ id: `${seed}:${kind}:${count[kind]}`, kind, x: p.x, y: p.y, ci: c.ci, cj: c.cj });
    }
    if (kind === "mill" || kind === "lumber_camp" || kind === "mining_camp") dropsites[`${kind}:${sub ?? ""}`] = true;
    return c;
  };
  // Tabs first: each tab's building is its agent's drop site (or a house for a plain tab).
  for (const t of tabs) {
    const kind = t.kind ?? (t.house ? "house" : DROPSITE[t.resource] ?? "house");
    add(kind, t.resource, t);
  }
  // Then the build order; walls and towers once the core stands.
  const steps = buildOrder(level, style);
  let wallType = null;
  let towers = false;
  let gateTowers = false;
  for (const step of steps) {
    if (step.startsWith("WALLS:")) {
      wallType = step.slice(6);
      continue;
    }
    if (step === "TOWERS") {
      towers = true;
      continue;
    }
    if (step === "GATE_TOWERS") {
      gateTowers = true;
      continue;
    }
    const [kind, sub] = step.split(":");
    // A drop site the tabs already provide isn't built twice.
    if ((kind === "mill" || kind === "lumber_camp" || kind === "mining_camp") && dropsites[`${kind}:${sub ?? (kind === "mill" ? "food" : kind === "lumber_camp" ? "wood" : "gold")}`]) continue;
    add(kind, sub);
  }
  // Walls: a closed rectangle on the grid around the core (not the outlying drop sites),
  // two tiles out; gates mid-side; corners get posts, or towers from TOWERS on.
  let walls = null;
  if (wallType) {
    const core = [{ ci: 0, cj: 0, n: FOOT.town_center }, ...[...tabBuildings, ...extras].filter((b) => b.kind !== "lumber_camp" && b.kind !== "mining_camp" && !/tower/.test(b.kind)).map((b) => ({ ci: b.ci, cj: b.cj, n: FOOT[b.kind] ?? 3 }))];
    let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
    for (const b of core) {
      i0 = Math.min(i0, Math.floor(b.ci - (b.n - 1) / 2));
      i1 = Math.max(i1, Math.ceil(b.ci + (b.n - 1) / 2));
      j0 = Math.min(j0, Math.floor(b.cj - (b.n - 1) / 2));
      j1 = Math.max(j1, Math.ceil(b.cj + (b.n - 1) / 2));
    }
    i0 -= 2; i1 += 2; j0 -= 2; j1 += 2;
    const pieces = [];
    const piece = (part, i, j) => {
      if (!free(i, j)) return; // a forest or a mine: the wall stops there
      const p = tileToWorld(i, j, tile);
      pieces.push({ part, x: p.x, y: p.y, ci: i, cj: j });
    };
    const mi = Math.round((i0 + i1) / 2), mj = Math.round((j0 + j1) / 2);
    for (let i = i0 + 1; i < i1; i++) {
      piece(i === mi ? "gateA" : "a", i, j0);
      piece(i === mi ? "gateA" : "a", i, j1);
    }
    for (let j = j0 + 1; j < j1; j++) {
      piece(j === mj ? "gateB" : "b", i0, j);
      piece(j === mj ? "gateB" : "b", i1, j);
    }
    for (const [i, j] of [[i0, j0], [i1, j0], [i0, j1], [i1, j1]]) piece(towers ? "tower" : "corner", i, j);
    if (gateTowers)
      for (const [i, j] of [[mi - 1, j0 - 1], [mi + 1, j1 + 1], [i0 - 1, mj + 1], [i1 + 1, mj - 1]]) piece("gate_tower", i, j);
    walls = { type: wallType, pieces, rect: { i0, i1, j0, j1 } };
  }
  const plan = {
    tabBuildings,
    extras,
    forest: trees.map((t) => ({ ...tileToWorld(t.ci, t.cj, tile), v: t.v })),
    mines: [gold, stone, berries].filter((m) => m.ci !== undefined).map((m) => ({ kind: m.kind, ...tileToWorld(m.ci, m.cj, tile) })),
    nodes: Object.fromEntries(Object.entries(nodes).map(([k, c]) => [k, tileToWorld(c.ci, c.cj, tile)])),
    walls,
  };
  if (planCache.size > 64) planCache.clear();
  planCache.set(key, plan);
  return plan;
}

// ---- the wilderness (SPEC §18.1): groves, lone trees, rocks, berries, herds, tufts, so the
// map between towns is countryside, not an empty plane. Generated per map chunk, seeded by
// the chunk's coordinates (the same every time), clear of towns, only for chunks in view.

export const CHUNK = { w: 1152, h: 576 };

/** Which chunks a world rectangle touches. */
export function chunksIn(x0, y0, x1, y1) {
  const out = [];
  for (let cy = Math.floor(y0 / CHUNK.h); cy <= Math.floor(y1 / CHUNK.h); cy++)
    for (let cx = Math.floor(x0 / CHUNK.w); cx <= Math.floor(x1 / CHUNK.w); cx++) out.push([cx, cy]);
  return out;
}

/** Is a world point inside a town's grounds (kept clear of wilderness)? */
export function inTown(x, y, towns, pad = 1050) {
  return towns.some((t) => Math.hypot(x - t.x, (y - t.y) * 2) < pad);
}

/**
 * One chunk's wilderness: [{ kind: tree|rocks|bush|tuft|berry_bush|gold_mine|stone_mine|animal,
 * x, y, v, animal? }]. `fauna` names the pack's animals (empty: no herds).
 */
const wildCache = new Map();
export function wildernessChunk(cx, cy, towns = [], fauna = []) {
  const key = `${cx},${cy}|${fauna.join(",")}|${towns.map((t) => `${Math.round(t.x)},${Math.round(t.y)}`).join(";")}`;
  const hit = wildCache.get(key);
  if (hit) return hit;
  const items = wildernessChunkFresh(cx, cy, towns, fauna);
  if (wildCache.size > 400) wildCache.clear();
  wildCache.set(key, items);
  return items;
}

function wildernessChunkFresh(cx, cy, towns, fauna) {
  const r = seeded(hashStr(`wild:${cx},${cy}`));
  const ox = cx * CHUNK.w, oy = cy * CHUNK.h;
  const out = [];
  const put = (kind, x, y, extra = {}) => {
    if (inTown(x, y, towns)) return;
    out.push({ kind, x: Math.round(x), y: Math.round(y), v: Math.floor(r() * 1000), ...extra });
  };
  const spot = () => ({ x: ox + r() * CHUNK.w, y: oy + r() * CHUNK.h });
  // Groves: blobs of trees.
  const groves = Math.floor(r() * 2.4);
  for (let g = 0; g < groves; g++) {
    const c = spot();
    const n = 6 + Math.floor(r() * 12);
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (90 + n * 6);
      put("tree", c.x + Math.cos(a) * d, c.y + Math.sin(a) * d * 0.5);
    }
  }
  // Lone trees, rocks, bushes, berries, the odd mine, and grass.
  for (let k = 0, n = 3 + Math.floor(r() * 5); k < n; k++) { const p = spot(); put("tree", p.x, p.y); }
  for (let k = 0, n = Math.floor(r() * 3); k < n; k++) { const p = spot(); put("rocks", p.x, p.y); }
  for (let k = 0, n = 1 + Math.floor(r() * 3); k < n; k++) { const p = spot(); put("bush", p.x, p.y); }
  if (r() < 0.45) { const p = spot(); put("berry_bush", p.x, p.y); if (r() < 0.6) put("berry_bush", p.x + 50, p.y + 18); }
  if (r() < 0.12) { const p = spot(); put(r() < 0.5 ? "gold_mine" : "stone_mine", p.x, p.y); }
  for (let k = 0, n = 4 + Math.floor(r() * 6); k < n; k++) { const p = spot(); put("tuft", p.x, p.y); }
  // A herd now and then.
  if (fauna.length && r() < 0.4) {
    const animal = fauna[Math.floor(r() * fauna.length)];
    const c = spot();
    for (let k = 0, n = 2 + Math.floor(r() * 4); k < n; k++) put("animal", c.x + (r() - 0.5) * 160, c.y + (r() - 0.5) * 70, { animal, dir: Math.floor(r() * 8), wander: r() < 0.5 });
  }
  return out;
}
