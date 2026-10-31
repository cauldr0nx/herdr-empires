import { describe, expect, test } from "bun:test";
import * as D from "../mods/empires/data.js";

const HOME = "/home/<user>".replace("<user>", "someone");

describe("paths never leak a home directory", () => {
  test("home becomes ~", () => {
    expect(D.shortenPath(HOME, HOME)).toBe("~");
    expect(D.shortenPath(`${HOME}/src/api`, HOME)).toBe("~/src/api");
    expect(D.shortenPath(`${HOME}/`, HOME)).toBe("~");
  });
  test("another person's home is shortened too", () => {
    expect(D.shortenPath("/Users/<user>/work/x".replace("<user>", "alice"), HOME)).toBe("~/work/x");
    expect(D.shortenPath("C:\\Users\\<user>\\proj".replace("<user>", "bob"), HOME)).toBe("~/proj");
    expect(D.shortenPath("/home/<user>".replace("<user>", "carol"), HOME)).toBe("~");
  });
  test("deep paths outside home keep only two segments", () => {
    expect(D.shortenPath("/srv/apps/api/current", HOME)).toBe("…/api/current");
    expect(D.shortenPath("/srv/api", HOME)).toBe("/srv/api");
    expect(D.shortenPath("", HOME)).toBe("");
  });
  test("titles never contain an absolute home path", () => {
    const pane = { program: { name: "Claude Code", agent: true }, cwd: `${HOME}/src/herdr-empires`, branch: "main" };
    const t = D.paneTitle(pane, HOME);
    expect(t).toBe("Claude Code · herdr-empires (main)");
    expect(t.includes(HOME)).toBe(false);
    expect(D.placeName(HOME, HOME)).toBe("~");
  });
  test("shells are workers; mod panes show their title", () => {
    expect(D.unitName({ program: { shell: true, name: "zsh" } })).toBe("Worker");
    expect(D.paneTitle({ mod: "files", title: "Files" }, HOME)).toBe("Files");
  });
});

describe("status aggregation", () => {
  test("urgency order", () => {
    expect(D.mostUrgent(["idle", "working"])).toBe("working");
    expect(D.mostUrgent(["done", "blocked", "working"])).toBe("blocked");
    expect(D.mostUrgent([null, undefined])).toBe(null);
  });
  test("counts", () => {
    const agents = [{ status: "working" }, { status: "working" }, { status: "blocked" }, { status: "idle" }, { status: "done" }];
    expect(D.countStatuses(agents)).toEqual({ working: 2, blocked: 1, done: 1, idle: 1 });
  });
  test("status look is consistent", () => {
    expect(D.statusLook("blocked").badge).toBe("swords");
    expect(D.statusLook("nope").color).toBe("unknown");
  });
});

describe("resource counts are honest", () => {
  const agents = [{ status: "working" }, { status: "working" }, { status: "blocked" }, { status: "idle" }];
  test("defaults: food=working wood=idle gold=completed stone=blocked", () => {
    const r = D.resourceCounts(agents, [], { completed: 7 }, null, null);
    expect(r.food.value).toBe(2);
    expect(r.wood.value).toBe(1);
    expect(r.gold.value).toBe(7);
    expect(r.stone.value).toBe(1);
    expect(r.population.value).toBe(4);
    expect(r.population.cap).toBe(16);
    expect(r.food.meaning).toBe("agents working now");
  });
  test("mapping and pop cap are configurable; unknown sources fall back", () => {
    const r = D.resourceCounts(agents, [], { completed: 1 }, { food: "idle", gold: "bogus" }, 8);
    expect(r.food.value).toBe(1);
    expect(r.gold.source).toBe("completed");
    expect(r.population.cap).toBe(8);
  });
  test("population counts live agent terminals", () => {
    const terminals = [{ state: "running", program: { agent: true } }, { state: "finished", program: { agent: true } }, { state: "running", program: { agent: false } }];
    const r = D.resourceCounts([], terminals, null, null, null);
    expect(r.population.value).toBe(1);
  });
});

describe("ages", () => {
  test("thresholds", () => {
    expect(D.ageFor(0).name).toBe("Camp Age");
    expect(D.ageFor(3).name).toBe("Village Age");
    expect(D.ageFor(9).index).toBe(1);
    expect(D.ageFor(10).name).toBe("Keep Age");
    expect(D.ageFor(25).name).toBe("Crown Age");
    expect(D.ageFor(100).next).toBe(null);
    expect(D.ageFor(100).progress).toBe(1);
  });
  test("progress toward the next age", () => {
    const a = D.ageFor(5);
    expect(a.next).toBe(10);
    expect(a.progress).toBeCloseTo(2 / 7);
  });
  test("custom thresholds and bad input", () => {
    expect(D.ageFor(2, [0, 2, 4, 6]).name).toBe("Village Age");
    expect(D.ageFor(-5).index).toBe(0);
    expect(D.ageFor("x").index).toBe(0);
  });
});

describe("transitions and chronicle", () => {
  test("detects changes and completions", () => {
    const a1 = [{ address: "t1", status: "working", space_name: "demo-api", tab_name: "1", program: { name: "Claude Code" } }];
    const s1 = D.transitions({}, a1, 1000);
    expect(s1.changes).toHaveLength(1);
    expect(s1.changes[0].from).toBe(null);
    const a2 = [{ ...a1[0], status: "done" }];
    const s2 = D.transitions(s1.statuses, a2, 5000);
    expect(s2.changes[0]).toMatchObject({ from: "working", to: "done", space: "demo-api" });
    expect(D.completions(s2.changes)).toBe(1);
    expect(D.completions(s1.changes)).toBe(0);
  });
  test("scoreboard per town", () => {
    const log = [
      { address: "t1", from: null, to: "working", space: "demo-api", at: 0 },
      { address: "t1", from: "working", to: "blocked", space: "demo-api", at: 4000 },
      { address: "t1", from: "blocked", to: "working", space: "demo-api", at: 6000 },
      { address: "t1", from: "working", to: "done", space: "demo-api", at: 9000 },
      { address: "t2", from: null, to: "idle", space: "demo-web", at: 0 },
    ];
    const rows = D.scoreboard(log);
    expect(rows[0]).toMatchObject({ town: "demo-api", completed: 1, blocked: 1, working_ms: 7000, blocked_ms: 2000 });
    expect(rows[1].town).toBe("demo-web");
  });
});

describe("navigation", () => {
  const spaces = [{ id: "s1" }, { id: "s2" }];
  const agents = [
    { address: "b", space: "s2", tab_index: 1, pane: "p3", status: "idle" },
    { address: "a", space: "s1", tab_index: 2, pane: "p2", status: "blocked" },
    { address: "c", space: "s1", tab_index: 1, pane: "p1", status: "done" },
  ];
  test("minimap order: space, then tab", () => {
    expect(D.orderAgents(spaces, agents)).toEqual(["c", "a", "b"]);
  });
  test("idle cycling wraps and skips working/blocked", () => {
    const order = D.orderAgents(spaces, agents);
    expect(D.nextIdle(agents, order, null).address).toBe("c");
    expect(D.nextIdle(agents, order, "c").address).toBe("b");
    expect(D.nextIdle(agents, order, "b").address).toBe("c");
    expect(D.nextBlocked(agents, order, null).address).toBe("a");
    expect(D.nextBlocked([], order, null)).toBe(null);
  });
});

describe("time and positions", () => {
  test("elapsed", () => {
    expect(D.elapsed(5000)).toBe("5s");
    expect(D.elapsed(4 * 60000)).toBe("4m");
    expect(D.elapsed(62 * 60000)).toBe("1h 02m");
  });
  test("clock", () => {
    expect(D.clock(6130000)).toBe("01:42:10");
    expect(D.clock(-5)).toBe("00:00:00");
  });
  test("tab position", () => {
    expect(D.tabPosition({ tabs: [{ id: "t1" }, { id: "t2" }, { id: "t3" }] }, "t2")).toBe("tab 2 of 3");
    expect(D.tabPosition({ tabs: [] }, "x")).toBe("");
  });
});

describe("player colours", () => {
  test("follow Herdr's space colour slots", () => {
    expect(D.playerColor("s", 0, { s: "ansi2" })).toBe("#d23a2f");
    expect(D.playerColor("s", 3, {})).toBe("#e2c13a");
    expect(D.playerColor("s", 9, { s: "ansi99" })).toBe("#d23a2f");
  });
});

describe("minimap", () => {
  test("territories fill a diamond grid and mark remote realms", () => {
    const t = D.territories([{ id: "a" }, { id: "b", machine: "vps" }, { id: "c" }]);
    expect(t).toHaveLength(3);
    expect(t[1].remote).toBe(true);
    for (const x of t) {
      expect(x.cx).toBeGreaterThan(0);
      expect(x.cx).toBeLessThan(1);
      expect(x.cy).toBeGreaterThan(0);
      expect(x.cy).toBeLessThan(1);
    }
    expect(D.territories([])).toEqual([]);
  });
  test("ring mode above 12 spaces; narrow under 900 px", () => {
    expect(D.minimapMode(12)).toBe("territories");
    expect(D.minimapMode(13)).toBe("ring");
    expect(D.isNarrow(899)).toBe(true);
    expect(D.isNarrow(900)).toBe(false);
    expect(D.isNarrow(0)).toBe(false);
  });
});

describe("herald", () => {
  test("lines name the unit and the town, never a path", () => {
    const a = { status: "blocked", program: { name: "Claude Code" }, space_name: "api" };
    const line = D.heraldLine(a, 0);
    expect(line).toBe("A claude scholar in api awaits your orders.");
    expect(D.heraldLine(null)).toBe("");
  });
  test("news picks blocked over done, latest first, skipping dismissed and focused", () => {
    const agents = [
      { address: "1", status: "done", seq: 5 },
      { address: "2", status: "blocked", seq: 1 },
      { address: "3", status: "blocked", seq: 9, focused: true },
      { address: "4", status: "blocked", seq: 7 },
    ];
    expect(D.heraldNews(agents, []).address).toBe("4");
    expect(D.heraldNews(agents, ["4:blocked"]).address).toBe("2");
    expect(D.heraldNews([{ address: "1", status: "working" }], [])).toBe(null);
  });
});

describe("tech tree", () => {
  test("groups keys by category", () => {
    const keys = [
      { section: "global", keys: "ctrl-shift-t", action: "tab.new" },
      { section: "layout:empires", keys: "alt-.", action: "empires.idle" },
      { section: "global", keys: "ctrl-shift-o", action: "pane.split:right" },
      { section: "terminal", keys: "ctrl-shift-c", action: "terminal.copy" },
    ];
    const tree = D.techTree(keys, "layout:empires");
    expect(tree.map((g) => g.name)).toEqual(["Architecture", "Military", "Empires"]);
  });
});

describe("phase 2: command layer", () => {
  const agents = [
    { address: "a", status: "idle", program: { name: "Claude Code" }, space_name: "demo-api", tab_name: "1" },
    { address: "b", status: "blocked", program: { name: "Codex" }, space_name: "demo-api", tab_name: "2" },
  ];
  test("selection falls back to the focused agent and drops dead addresses", () => {
    expect(D.selectedUnits(agents, [], "a")).toEqual(["a"]);
    expect(D.selectedUnits(agents, ["b", "zz"], "a")).toEqual(["b"]);
    expect(D.selectedUnits(agents, null, "nope")).toEqual([]);
    expect(D.toggleSelected(["a"], "b")).toEqual(["a", "b"]);
    expect(D.toggleSelected(["a", "b"], "a")).toEqual(["b"]);
  });
  test("control groups are pruned when units end", () => {
    const terminals = [{ address: "a", state: "running" }, { address: "b", state: "finished" }];
    expect(D.pruneGroups({ 1: ["a", "b"], 2: ["b"], 3: "junk" }, terminals)).toEqual({ 1: ["a"] });
  });
  test("auto-dispatch never targets a blocked unit and respects unit types", () => {
    const queue = [{ task: "review the diff", unit: "monk" }, { task: "run the tests" }];
    expect(D.nextDispatch(queue, agents[1], true, null)).toBe(null);
    expect(D.nextDispatch(queue, agents[0], false, null)).toBe(null);
    expect(D.nextDispatch(queue, agents[0], true, "villager")).toMatchObject({ index: 1 });
    expect(D.nextDispatch(queue, agents[0], true, "monk")).toMatchObject({ index: 0 });
    expect(D.nextDispatch(queue, agents[0], true, null)).toMatchObject({ index: 0 });
  });
  test("confirmations name their targets", () => {
    expect(D.nameTargets(agents, ["a", "b"])).toBe("Claude Code in demo-api / 1\nCodex in demo-api / 2");
    expect(D.nameTargets(agents, ["x"])).toBe("x");
  });
});

describe("live-test fixes (SPEC §19)", () => {
  test("completions count any arrival at done, and working -> idle", () => {
    const c = (from, to) => ({ from, to });
    expect(D.completions([c("blocked", "done")])).toBe(1);
    expect(D.completions([c("idle", "done")])).toBe(1);
    expect(D.completions([c("working", "done")])).toBe(1);
    expect(D.completions([c("working", "idle")])).toBe(1);
    expect(D.completions([c("done", "done"), c("done", "idle"), c("blocked", "idle"), c(null, "done")])).toBe(0);
  });

  test("an unnamed tab has no label on the unit card", () => {
    expect(D.tabLabel({ name: "1", named: false })).toBe("");
    expect(D.tabLabel({ name: "fix login", named: true })).toBe("fix login");
    expect(D.tabLabel(null)).toBe("");
  });

  test("the location line drops repeats", () => {
    expect(D.locationLine("api", "api", "main")).toBe("api · main");
    expect(D.locationLine("town", "api", "main")).toBe("town · api · main");
    expect(D.locationLine("api", "", null)).toBe("api");
  });
});

describe("world model (SPEC §18.3)", () => {
  const spaces = [
    { id: "s1", name: "api", active: false, machine: null, tabs: [{ id: "t1", name: "1", status: "working" }, { id: "t2", name: "2", status: null }] },
    { id: "s2", name: "web", active: true, machine: null, tabs: [{ id: "t3", name: "1", status: "blocked", settled: false }, { id: "t4", name: "2", settled: true }] },
  ];
  const agents = [
    { address: "a1", space: "s1", tab: "t1", status: "working", program: { name: "Claude Code" } },
    { address: "a2", space: "s2", tab: "t3", status: "blocked", program: { name: "Codex" } },
    { address: "a3", space: "s2", tab: "t4", status: "idle", program: { name: "Pi" } },
  ];

  test("the active town sits at the origin; one building per tab; garrisoned units hidden", () => {
    const w = D.worldModel({ spaces, agents, terminals: [] });
    expect(w.towns[0].space).toBe("s2");
    expect([w.towns[0].x, w.towns[0].y]).toEqual([0, 0]);
    expect(w.towns.map((t) => t.buildings.length)).toEqual([2, 2]);
    expect(w.units.map((u) => u.address).sort()).toEqual(["a1", "a2"]); // a3's tab is settled
  });

  test("layouts are stable across calls (seeded by ids)", () => {
    const a = D.worldModel({ spaces, agents });
    const b = D.worldModel({ spaces, agents });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("unit caps overflow into a count", () => {
    const many = Array.from({ length: 70 }, (_, i) => ({ address: `x${i}`, space: "s2", tab: "t3", status: "working" }));
    const w = D.worldModel({ spaces, agents: many, maxUnits: 60 });
    expect(w.units.length).toBe(60);
    expect(w.towns[0].hidden).toBe(10);
  });

  test("directions follow the screen", () => {
    expect(D.dirFor(0, 10)).toBe("S");
    expect(D.dirFor(10, 0)).toBe("E");
    expect(D.dirFor(-10, 0)).toBe("W");
    expect(D.dirFor(0, -10)).toBe("N");
    expect(D.dirFor(-10, 10)).toBe("SW");
    expect(D.dirRow("N", 8)).toBe(4);
    expect(D.dirRow("N", 2)).toBe(1);
    expect(D.dirRow("SE", 2)).toBe(0);
  });

  test("a trip walks out, gathers at the far end, carries back", () => {
    const from = { x: 0, y: 0 }, to = { x: 100, y: 0 };
    expect(D.tripState(1000, 10000, from, to).anim).toBe("walk");
    expect(D.tripState(1000, 10000, from, to).dir).toBe("E");
    expect(D.tripState(5000, 10000, from, to, "gold").anim).toBe("gather_gold");
    expect(D.tripState(7500, 10000, from, to).anim).toBe("carry");
    expect(D.tripState(7500, 10000, from, to).dir).toBe("W");
  });

  test("fallback chains resolve against a partial pack", () => {
    expect(D.entityFallback({ house: {} }, "university")).toBe("house");
    expect(D.entityFallback({}, "tree")).toBe(null);
    expect(D.animFallback({ walk: {}, idle: {} }, "gather_stone")).toBe("walk");
    expect(D.animFallback({ idle: {} }, "carry")).toBe(null);
  });

  test("views cycle", () => {
    expect(D.nextView("map")).toBe("split");
    expect(D.nextView("split")).toBe("terminals");
    expect(D.nextView("terminals")).toBe("map");
    expect(D.nextView(undefined)).toBe("split"); // unknown counts as map, the default
  });
});

describe("growing towns on a static map", () => {
  test("levels grow with commits, age and work, and stay in range", () => {
    expect(D.townLevel({})).toBe(0);
    expect(D.townLevel({ commits: 50 })).toBeGreaterThan(D.townLevel({ commits: 2 }));
    expect(D.townLevel({ commits: 5000, ageDays: 900, completed: 500 })).toBe(9);
    expect(D.townLevel({ commits: 200, ageDays: 60 })).toBeGreaterThanOrEqual(D.townLevel({ commits: 200 }));
  });

  test("extras accumulate by level and differ per town", () => {
    expect(D.townExtras(1, 0).length).toBe(1);
    expect(D.townExtras(1, 3).length).toBeGreaterThan(D.townExtras(1, 1).length);
    expect(JSON.stringify(D.townExtras(1, 4))).not.toBe(JSON.stringify(D.townExtras(2, 4)));
    expect(D.townExtras(7, 9).some((e) => e.kind === "wonder")).toBe(true);
    expect(D.townExtras(7, 6).some((e) => e.kind === "wonder" || e.kind === "fortress")).toBe(false);
    // Towns of the same level but different styles build differently.
    const mix = (seed) => D.townExtras(seed, 6).map((e) => e.kind).sort().join(",");
    const seeds = [0, 1, 2, 3].map((k) => [...Array(40).keys()].find((n) => D.townStyle(n) === Object.keys(D.TOWN_STYLES)[k]));
    expect(new Set(seeds.map(mix)).size).toBe(4);
  });

  test("slots are stable: new spaces take the smallest free slot", () => {
    const a = D.assignSlots(["x", "y"]);
    expect(a).toEqual({ x: 0, y: 1 });
    const b = D.assignSlots(["y", "z"], { y: 1 });
    expect(b).toEqual({ y: 1, z: 0 });
  });

  test("the shown space doesn't move towns; overrides do", () => {
    const sp = (active) => [
      { id: "a", name: "a", active: active === "a", tabs: [{ id: "t1" }] },
      { id: "b", name: "b", active: active === "b", tabs: [{ id: "t2" }] },
    ];
    const slots = { a: 0, b: 1 };
    const w1 = D.worldModel({ spaces: sp("a"), slots });
    const w2 = D.worldModel({ spaces: sp("b"), slots });
    const pos = (w, id) => w.towns.find((t) => t.space === id);
    expect([pos(w1, "b").x, pos(w1, "b").y]).toEqual([pos(w2, "b").x, pos(w2, "b").y]);
    const w3 = D.worldModel({ spaces: sp("a"), slots, buildingPos: { t1: { x: 10, y: 20 } }, kinds: { t1: "fortress" }, townPos: { b: { x: 5000, y: 0 } } });
    expect(pos(w3, "a").buildings[0]).toMatchObject({ x: 10, y: 20, kind: "fortress", custom: true });
    expect(pos(w3, "b").x).toBe(5000);
  });

  test("units get a stable look from the pack's looks", () => {
    const sp = [{ id: "a", name: "a", active: true, tabs: [{ id: "t1" }] }];
    const ag = [{ address: "t9", space: "a", tab: "t1", status: "idle" }];
    const w = D.worldModel({ spaces: sp, agents: ag, looks: ["villager", "villager_b", "villager_c"] });
    expect(["villager", "villager_b", "villager_c"]).toContain(w.units[0].look);
    expect(D.worldModel({ spaces: sp, agents: ag, looks: ["villager", "villager_b", "villager_c"] }).units[0].look).toBe(w.units[0].look);
  });
});

describe("growth persists (SPEC §18.3)", () => {
  test("a town never drops below the level it reached", () => {
    const sp = [{ id: "a", name: "a", active: true, tabs: [] }];
    expect(D.worldModel({ spaces: sp, stats: {} }).towns[0].level).toBe(0);
    expect(D.worldModel({ spaces: sp, stats: {}, minLevels: { a: 7 } }).towns[0].level).toBe(7);
    expect(D.worldModel({ spaces: sp, stats: { a: { commits: 5000, ageDays: 900 } }, minLevels: { a: 2 } }).towns[0].level).toBe(9);
  });
});
