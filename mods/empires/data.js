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

/** What each level adds around the town center, cumulatively (a base that grows like a classic RTS town). */
export const LEVEL_GROWTH = [
  ["house"],
  ["field", "house"],
  ["mill", "field"],
  ["lumber_camp", "house", "palisade"],
  ["market", "house"],
  ["blacksmith", "defense_tower", "field"],
  ["sentry_tower", "corral", "house"],
  ["university", "monastery", "palisade"],
  ["fortress", "defense_tower"],
  ["wonder"],
];

/**
 * The town's grown buildings (decor, not tabs) for a level: kinds from LEVEL_GROWTH, placed
 * on outer rings seeded by the space, so no two towns look alike. Positions are relative to
 * the town center, world px; `taken` are the tab buildings' spots to keep clear of.
 */
export function townExtras(seed, level, taken = []) {
  const r = seeded(seed ^ 0x9e3779b9);
  const kinds = LEVEL_GROWTH.slice(0, Math.max(0, level) + 1).flat();
  const out = [];
  const spots = [...taken];
  kinds.forEach((kind, i) => {
    let best = null;
    for (let tries = 0; tries < 24; tries++) {
      const a = r() * Math.PI * 2;
      const rad = 300 + Math.floor(i / 6) * 110 + r() * 120 + tries * 12;
      const p = { x: Math.round(Math.cos(a) * rad), y: Math.round(Math.sin(a) * rad * 0.5) + 20 };
      const clear = spots.every((q) => Math.hypot(p.x - q.x, (p.y - q.y) * 2) > 160);
      if (clear) {
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
export function townOrigin(k, spacing = 1400) {
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
export function worldModel({ spaces = [], agents = [], terminals = [], colors = null, maxUnits = 60, maxBuildings = 40, slots = null, townPos = {}, buildingPos = {}, kinds = {}, stats = {}, looks = ["villager"] } = {}) {
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
    const level = townLevel(stats[s.id]);
    const tabs = (s.tabs ?? []).slice(0, Math.max(0, maxBuildings - buildingCount));
    buildingCount += tabs.length;
    const sites = townSites(hashStr(s.id), tabs.length);
    const mine = agents.filter((a) => a.space === s.id);
    const buildings = tabs.map((t, i) => {
      const inTab = mine.filter((a) => a.tab === t.id);
      const at = buildingPos[t.id] ?? sites.buildings[i];
      return { tab: t.id, name: t.name, kind: kinds[t.id] ?? buildingKind(t, inTab, level), custom: Boolean(kinds[t.id]), settled: Boolean(t.settled), status: t.status ?? null, x: origin.x + at.x, y: origin.y + at.y };
    });
    const color = playerColor(s.id, index, colors);
    const town = { space: s.id, name: s.name, active: Boolean(s.active), remote: Boolean(s.machine), color, slot: colorSlot(s.id, index, colors), level, stats: stats[s.id] ?? null, x: origin.x, y: origin.y, buildings, extras: townExtras(hashStr(s.id), level, [...buildings.map((b) => ({ x: b.x - origin.x, y: b.y - origin.y })), ...sites.forest, ...Object.values(sites.nodes)]).map((e) => ({ ...e, x: origin.x + e.x, y: origin.y + e.y })), forest: sites.forest.map((f) => ({ ...f, x: origin.x + f.x, y: origin.y + f.y })), nodes: Object.fromEntries(Object.entries(sites.nodes).map(([k2, p]) => [k2, { x: origin.x + p.x, y: origin.y + p.y }])), hidden: 0 };
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
