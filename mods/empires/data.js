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

/** A task counts as completed when an agent goes working -> done (or working -> idle after a long run). */
export function completions(changes) {
  return changes.filter((c) => c.from === "working" && (c.to === "done" || c.to === "idle")).length;
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
