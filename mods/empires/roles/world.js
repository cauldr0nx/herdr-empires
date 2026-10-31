// The world (SPEC §18): an isometric RTS map of Herdr's live state, drawn from an art pack.
// Each space is a town with a fixed place on the map (its own slot, or wherever it was moved):
// a town center in its player colour, one building per tab, and grown buildings that come
// with the town's level (repo commits, repo age, tasks done). Each agent is a unit with its
// own look: working units walk between their building and a resource and gather there;
// blocked ones wait at the town center with a "?" bubble; finished ones show a "✓" bubble
// until seen; idle ones stand about. Click a unit to talk to it (a chat window); right-click
// a town center or building to train units, move it, or change what it is.
//
// Motion is native: a working unit's position runs on paired left/top loops (there and back,
// ease-in-out, so it lingers at both ends). Sprite frames are the one thing gpui-shell can't
// animate natively for images (SPIKES R11), so a frame tick redraws this copy at most 6 times
// a second, and only while the world is shown, the window is active and something moves.

import { div, image, PathBuilder } from "gpui-kit";
import { spaces, agents, terminals, panes, shared, setShared, run, readTextFile, appHome, knownAgents, exec, window as appWindow } from "herdr";
import { C, FONT_SC, DISPLAY, ASSETS, unit, root, calm, openMenu } from "../kit.js";
import { worldModel, tripState, dirRow, animFallback, entityFallback, hashStr, assignSlots, BUILDING_KINDS, chunksIn, wildernessChunk, planKey, planTown, cachedPlan, rememberPlan } from "../data.js";
import { setView, viewMode } from "./views.js";
import { openUnitChat } from "./chat.js";

const SHIPPED = `${ASSETS}/packs/zeroad`;
const LOCAL = "empires-packs/local";
const FPS_CAP = 4;
const SPEED = 55; // world px per second, walking
const FLAT = new Set(["field"]);
const STATS_EVERY = 10 * 60 * 1000; // repo stats (commits, age): gently
const WILD_MAX = 90; // countryside pieces considered per render (nearest the centre of the view)
const SPRITE_CAP = 170; // sprites built per render (scenery trimmed to fit): a render has 50 ms
const KIND_LABEL = { house: "House", lumber_camp: "Lumber camp", mining_camp: "Mining camp", mill: "Mill", market: "Market", blacksmith: "Blacksmith", university: "University", monastery: "Monastery", defense_tower: "Defense tower", sentry_tower: "Sentry tower", corral: "Corral", fortress: "Fortress", wonder: "Wonder", field: "Farm field", palisade: "Palisade", palisade_corner: "Palisade corner", gate: "Gate" };

/** Loads the chosen art pack: { base, data } or null. Auto prefers a local import. */
async function loadPack(choice) {
  const tryOne = async (base) => {
    try {
      const text = await readTextFile(`${appHome()}/${base}/pack.json`);
      return text ? { base, data: JSON.parse(text) } : null;
    } catch {
      return null;
    }
  };
  if (choice === "local") return (await tryOne(LOCAL)) ?? (await tryOne(SHIPPED));
  if (choice === "zeroad") return tryOne(SHIPPED);
  return (await tryOne(LOCAL)) ?? (await tryOne(SHIPPED));
}

const obj = (k) => {
  const v = shared(k);
  return v && typeof v === "object" ? v : {};
};

export default class World {
  init(_p, cx) {
    this.pack = null;
    this.packChoice = null;
    this.size = null;
    this.t0 = {};
    // Camera: `base` is the world point drawn at the view's centre, `pan` a screen offset on
    // top (dragging only changes pan, so units' native loops never restart mid-drag).
    // Restored from the last session (shared state is saved by Herdr across restarts).
    const cam = shared("empires.camera");
    this.base = cam?.base && Number.isFinite(cam.base.x) ? { x: cam.base.x, y: cam.base.y } : null;
    this.pan = cam?.pan && Number.isFinite(cam.pan.x) ? { x: cam.pan.x, y: cam.pan.y } : { x: 0, y: 0 };
    this.drag = null;
    this.dragEnd = 0;
    this.wheel = Number(cam?.wheel) > 0 ? Number(cam.wheel) : 1; // scroll-wheel zoom, on top of Options → World zoom
    this.hover = null; // pointer, element px (for placing a building being moved)
    // Repo stats per space, cached across restarts so towns open at their real size at once:
    // { commits, rootTs (first commit, ms), at (when read) }. A failed read keeps the cache.
    this.stats = { ...obj("empires.townStats") };
    this.lastStatus = {};
    this.changedAt = {};
    this.reload(cx);
    this.refreshStats(cx);
    cx.timer.every(STATS_EVERY, (cx) => this.refreshStats(cx));
    cx.timer.every(1000 / FPS_CAP, (cx) => {
      if (shared("empires.pack") !== this.packChoice) this.reload(cx);
      this.backgroundWork(cx);
      if (this.animating() || shared("empires.moving")) cx.notify();
    });
  }

  reload(cx) {
    this.packChoice = shared("empires.pack") ?? "auto";
    cx.spawn(async (cx) => {
      this.pack = await loadPack(this.packChoice);
      cx.notify();
    });
  }

  /** Commits and repo age per space (git, on the space's machine), for town levels. The
   *  result is cached in shared state; a read that fails (a machine not connected yet, no
   *  repo) keeps the cached numbers and retries soon, so a restart never shrinks a town. */
  refreshStats(cx) {
    cx.spawn(async (cx) => {
      const seen = obj("empires.townSeen");
      let changed = false;
      let failed = false;
      for (const s of spaces()) {
        if (!seen[s.id]) {
          seen[s.id] = Date.now();
          changed = true;
        }
        const tabIds = new Set(s.tabs.map((t) => t.id));
        const cwd = s.folder || panes().find((p) => tabIds.has(p.tab) && p.cwd)?.cwd || null;
        if (!cwd) continue;
        try {
          const r = await exec("sh", ["-c", "git rev-list --count HEAD 2>/dev/null; git log --max-parents=0 --format=%ct HEAD 2>/dev/null | tail -1"], { cwd, on: s.machine ?? null });
          const [c, t] = r.stdout.trim().split("\n");
          const commits = Number(c) || 0;
          const rootTs = (Number(t) || 0) * 1000;
          const old = this.stats[s.id] ?? {};
          if (commits === 0 && (old.commits ?? 0) > 0) continue; // a hiccup, not a smaller repo
          if (commits !== old.commits || rootTs !== (old.rootTs ?? 0)) {
            this.stats[s.id] = { commits, rootTs, at: Date.now() };
            changed = true;
          }
        } catch {
          failed = true;
        }
      }
      if (changed) {
        setShared("empires.townSeen", seen);
        setShared("empires.townStats", { ...this.stats });
      }
      if (failed) cx.timer.after(45000, (cx) => this.refreshStats(cx));
      cx.notify();
    });
  }

  /** Stats as the world model wants them: commits and age in days (from the first commit, or
   *  from when the town was first seen). */
  townStats() {
    const seen = obj("empires.townSeen");
    const now = Date.now();
    const out = {};
    for (const s of spaces()) {
      const st = this.stats[s.id] ?? {};
      const since = st.rootTs || seen[s.id] || now;
      out[s.id] = { commits: st.commits ?? 0, ageDays: Math.max(0, (now - since) / 86400000) };
    }
    return out;
  }

  /** Saves the camera (where you dragged and zoomed to) for the next session. */
  saveCamera() {
    if (!this.base) return;
    setShared("empires.camera", { base: { x: Math.round(this.base.x), y: Math.round(this.base.y) }, pan: { x: Math.round(this.pan.x), y: Math.round(this.pan.y) }, wheel: Math.round(this.wheel * 1000) / 1000 });
  }

  /**
   * Town plans, kept off the render path: planning a big town is real work, and a render
   * that runs long is cut off by Herdr ("could not be re-rendered"). A plan is answered from
   * memory or this copy's storage (so a restart draws at once); a missing one is computed in
   * a task, one town at a time, and the world redraws when it lands.
   */
  planFor(seed, level, style, tabs, cx) {
    const key = planKey(seed, level, style, tabs);
    const hit = cachedPlan(key);
    if (hit) return hit;
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const plan = JSON.parse(stored);
        rememberPlan(key, plan);
        return plan;
      }
    } catch {}
    // Queue it; the frame timer (outside render) does the work: nothing here may notify.
    this.planQueue ??= new Map();
    if (!this.planQueue.has(key)) this.planQueue.set(key, { seed, level, style, tabs });
    // Meanwhile: the last plan this town had, if any, so it doesn't blink empty.
    return this.lastPlan?.[seed] ?? null;
  }

  /** From the timer: plan one queued town per tick, and save what render noticed. */
  backgroundWork(cx) {
    let changed = false;
    if (this.planQueue?.size) {
      const [key, job] = this.planQueue.entries().next().value;
      this.planQueue.delete(key);
      const plan = planTown(job.seed, job.level, job.style, job.tabs);
      (this.lastPlan ??= {})[job.seed] = plan;
      try {
        localStorage.setItem(key, JSON.stringify(plan));
      } catch {}
      this.planGen = (this.planGen ?? 0) + 1;
      changed = true;
    }
    if (this.pendingShared) {
      for (const [k, v] of Object.entries(this.pendingShared)) setShared(k, v);
      this.pendingShared = null;
    }
    if (changed) cx.notify();
  }

  /** Units walk and play their frames unless calm mode or Options → Animate units is off. */
  moving() {
    return !calm() && shared("empires.animate") !== false;
  }

  animating() {
    if (!this.pack || !this.moving() || viewMode() === "terminals") return false;
    if (!this.size || this.size.width < 40 || this.size.height < 40) return false;
    if (appWindow()?.active === false && shared("empires.animateInactive") !== true) return false;
    // Frames only step for units actually on screen (set by the last render).
    return agents().length > 0 && this.unitsInView !== false;
  }

  /** A press that ended a drag a moment ago is not a click. */
  wasDrag() {
    return Date.now() - this.dragEnd < 250;
  }

  // ---- drawing helpers

  path(rel, slot) {
    return `${this.pack.base}/${String(rel).replace("{color}", slot ?? "blue")}`;
  }

  /** A static sprite (building, tree, mine) with its foot at world (x, y). */
  sprite(ent, rel, slot, x, y, S, view, o = {}) {
    const [w, h] = ent.size ?? [96, 96];
    const [ax, ay] = ent.anchor ?? [w / 2, h];
    let el = image(this.path(rel, slot))
      .absolute()
      .left(view.x(x) - ax * S)
      .top(view.y(y) - ay * S)
      .w(w * S)
      .h(h * S);
    if (o.opacity) el = el.opacity(o.opacity);
    return el;
  }

  /**
   * An interactive sprite: a box exactly the size of the picture, at its place, with the
   * picture filling it. Mouse events (hover, click, right-click) only reach an element's own
   * box, so a wrapper around an absolutely placed image would have no area and hear nothing.
   */
  spriteBox(id, ent, rel, slot, x, y, S, view, o = {}) {
    const [w, h] = ent.size ?? [96, 96];
    const [ax, ay] = ent.anchor ?? [w / 2, h];
    let img = image(this.path(rel, slot)).size_full();
    if (o.opacity) img = img.opacity(o.opacity);
    return div().id(id).absolute().left(view.x(x) - ax * S).top(view.y(y) - ay * S).w(w * S).h(h * S).child(img);
  }

  /** The pack's sprite for a wall piece (SPEC §18.4 "walls"), or null when the pack has none.
   *  Towers come from the building set; a pack without both wall axes draws no walls. */
  wallPiece(ents, type, part) {
    const set = this.pack.data.walls?.[type] ?? this.pack.data.walls?.palisade;
    if (!set || !set.a || !set.b) return null; // no full wall set: no walls, and no lone towers
    if (part === "tower" && type === "stone" && set.corner && ents[set.corner]) return { ent: ents[set.corner], rel: ents[set.corner].image ?? ents[set.corner].variants?.[0] };
    if (part === "tower" || part === "gate_tower") {
      const name = entityFallback(ents, part === "tower" ? "defense_tower" : "sentry_tower");
      return name ? { ent: ents[name], rel: ents[name].image ?? ents[name].variants?.[0] } : null;
    }
    const name = set[part] ?? (part === "gateA" ? set.a : part === "gateB" ? set.b : set.corner);
    const ent = name && ents[name];
    return ent ? { ent, rel: ent.image ?? ent.variants?.[0] } : null;
  }

  /** The countryside in view: groves, trees, rocks, bushes, berries, tufts and herds. */
  wilderness(ents, S, view, w, h, pan, towns, now, flat, items) {
    const toWorld = (sx, sy) => ({ x: this.base.x + (sx - w / 2 - pan.x) / S, y: this.base.y + (sy - h * 0.5 - pan.y) / S });
    const a = toWorld(-200, -200), b = toWorld(w + 200, h + 300);
    const fauna = Array.isArray(this.pack.data.fauna) ? this.pack.data.fauna.filter((f) => ents[f]) : [];
    const tree = ents[entityFallback(ents, "tree")];
    const cxw = (a.x + b.x) / 2, cyw = (a.y + b.y) / 2;
    let all = [];
    for (const [cx, cy] of chunksIn(a.x, a.y, b.x, b.y)) for (const it of wildernessChunk(cx, cy, towns, fauna)) if (it.x > a.x && it.x < b.x && it.y > a.y && it.y < b.y) all.push(it);
    if (all.length > WILD_MAX) all = all.sort((p, q) => Math.hypot(p.x - cxw, p.y - cyw) - Math.hypot(q.x - cxw, q.y - cyw)).slice(0, WILD_MAX);
    {
      for (const it of all) {
        if (it.kind === "animal") {
          const ent = ents[it.animal];
          if (!ent) continue;
          const dirs = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"];
          const moving = it.wander && this.moving();
          const f = this.frame(ent, moving ? "walk" : "idle", null, dirs[it.dir % 8], now + it.v * 37, S);
          let el = div().absolute().left(view.x(it.x) - f.ax).top(view.y(it.y) - f.ay).child(f.el);
          if (moving) el = el.loop("left", { from: view.x(it.x) - f.ax, to: view.x(it.x) - f.ax + (it.dir < 4 ? -40 : 40) * S, period: 9000 + (it.v % 5) * 1000 });
          items.push({ y: it.y, x: it.x, pri: 5, el });
          continue;
        }
        const ent = it.kind === "tree" ? tree : ents[entityFallback(ents, it.kind)];
        if (!ent) continue;
        const vs = ent.variants ?? [ent.image];
        const rel = vs[it.v % vs.length];
        if (it.kind === "tuft") {
          if (S > 0.5) flat.push(this.sprite(ent, rel, "gray", it.x, it.y, S, view)); // grass only up close
        } else items.push({ y: it.y, x: it.x, pri: 5, make: () => this.sprite(ent, rel, "gray", it.x, it.y, S, view) });
      }
    }
  }

  /** One frame of a unit sheet, clipped: { el, w, h, ax, ay }. */
  frame(ent, animName, slot, dir, t, S) {
    const name = animFallback(ent.anims, animName);
    const a = name ? ent.anims[name] : null;
    const [fw, fh] = ent.frame ?? [48, 52];
    const [ax, ay] = ent.anchor ?? [fw / 2, fh];
    if (!a) return { el: div().w(fw * S).h(fh * S), w: fw * S, h: fh * S, ax: ax * S, ay: ay * S };
    const frames = a.frames ?? 1;
    const dirs = a.dirs ?? 1;
    const col = Math.floor((t / 1000) * (a.fps ?? 8)) % frames;
    const row = dirRow(dir, dirs, this.pack.data.sheetLayout?.dirOrder?.map((d) => d.toUpperCase()));
    const el = div()
      .relative()
      .w(fw * S)
      .h(fh * S)
      .overflow_hidden()
      .child(image(this.path(a.sheet, slot)).absolute().left(-col * fw * S).top(-row * fh * S).w(frames * fw * S).h(dirs * fh * S));
    return { el, w: fw * S, h: fh * S, ax: ax * S, ay: ay * S };
  }

  /** A Sims-style speech bubble over a unit's head: "?" needs you, "✓" done, "⚒" just started. */
  bubble(kind, cxPx, now, since, headY = 0) {
    const look = {
      ask: { text: "?", fg: "#ffffff", bg: C.blocked, edge: "#fff6e8" },
      done: { text: "✓", fg: "#ffffff", bg: "#3e9e48", edge: "#fff6e8" },
      work: { text: "⚒", fg: "#2a1c0d", bg: "#f6ecc9", edge: C.gold },
    }[kind];
    const W = 22, H = 20;
    let b = div()
      .absolute()
      .left(cxPx - W / 2)
      .top(headY - H - 10)
      .w(W)
      .h(H + 7)
      .child(div().absolute().left(0).top(0).w(W).h(H).rounded(7).bg(look.bg).border(1.5).border_color(look.edge).flex().items_center().justify_center().text_color(look.fg).font_weight(800).text_size(13).child(look.text))
      // The tail: a small triangle pointing at the head.
      .child(window.paint_path(PathBuilder.fill().move_to(W / 2 - 4, H - 1).line_to(W / 2 + 4, H - 1).line_to(W / 2, H + 6).close().build(), look.bg).absolute().top(0).left(0).w(W).h(H + 7));
    if (!calm()) b = b.loop("top", { from: headY - H - 10, to: headY - H - 14, period: kind === "ask" ? 700 : 1400 });
    // A "started work" pop fades out over its few seconds.
    if (kind === "work") b = b.opacity(Math.max(0, 1 - (now - since) / 3500));
    return b;
  }

  /** A green plumb-bob over the selected (focused) unit. */
  plumbob(cxPx, headY = 0) {
    const W = 10, H = 16;
    let p = window
      .paint_path(PathBuilder.fill().move_to(W / 2, 0).line_to(W, H / 2).line_to(W / 2, H).line_to(0, H / 2).close().build(), "#5fd35a")
      .absolute()
      .left(cxPx - W / 2)
      .top(headY - H - 4)
      .w(W)
      .h(H);
    if (!calm()) p = p.loop("top", { from: headY - H - 4, to: headY - H - 8, period: 1200 });
    return p;
  }

  unitEl(un, S0, view, now) {
    const ents = this.pack.data.entities ?? {};
    const ent = ents[un.look] ?? ents.villager;
    if (!ent) return null;
    const S = S0 * (un.scale ?? 1);
    const working = un.status === "working" && this.moving();
    const key = `${un.address}:${un.status}`;
    const t0 = (this.t0[key] ??= now);
    // Status changes drive the bubbles: remember when each unit last changed.
    if (this.lastStatus[un.address] !== un.status) {
      if (this.lastStatus[un.address] !== undefined) this.changedAt[un.address] = now;
      this.lastStatus[un.address] = un.status;
    }
    let anim = "idle";
    let dir = "S";
    let at = un.status === "blocked" ? un.door : un.idle;
    let period = 0;
    if (un.status === "working" && !working) {
      // Animation off: a still unit at its resource, in its gather pose.
      at = un.node;
      anim = `gather_${un.resource}`;
    }
    if (working) {
      const dist = Math.hypot(un.node.x - un.home.x, un.node.y - un.home.y);
      period = Math.max(6000, Math.round(((dist * 2) / SPEED) * 1000) + 2400);
      const st = tripState(now - t0, period, un.home, un.node, un.resource);
      anim = st.anim;
      dir = st.dir;
      at = un.home;
    }
    const f = this.frame(ent, anim, un.slot, dir, now - t0, S);
    let body = div().relative().w(f.w).h(f.h);
    if (un.focused) body = body.child(div().absolute().left(f.ax - 14 * S * 2).top(f.ay - 6 * S * 2).w(28 * S * 2).h(12 * S * 2).rounded_full().border(2).border_color(C.goldBright));
    body = body.child(f.el);
    const since = this.changedAt[un.address] ?? 0;
    // The head sits about 46 source px above the feet; the frame has empty space above it.
    const head = Math.max(0, f.ay - (ent.headHeight ?? 46) * S);
    if (un.status === "blocked") body = body.child(this.bubble("ask", f.ax, now, since, head));
    else if (un.status === "done") body = body.child(this.bubble("done", f.ax, now, since, head));
    else if (un.status === "working" && since && now - since < 3500) body = body.child(this.bubble("work", f.ax, now, since, head));
    else if (un.focused) body = body.child(this.plumbob(f.ax, head));
    let el = div()
      .id(`unit-${key}`)
      .absolute()
      .cursor_pointer()
      .tooltip(`${un.name}: ${un.status === "working" ? `gathering ${un.resource}` : un.status === "blocked" ? "has a question for you" : un.status === "done" ? "task complete" : "idle"}${un.workers ? ` · ${un.workers} worker${un.workers === 1 ? "" : "s"}` : ""}. Click to talk to it`)
      .on_click((_e, cx) => {
        if (this.wasDrag() || shared("empires.moving")) return;
        openUnitChat(un.address, un.name, { at: this.lastPress ? { x: this.lastPress.x + 14, y: Math.max(0, this.lastPress.y - 60) } : null });
        cx.notify();
      })
      .child(body);
    if (working) {
      el = el
        .left(view.x(un.home.x) - f.ax)
        .top(view.y(un.home.y) - f.ay)
        .loop("left", { from: view.x(un.home.x) - f.ax, to: view.x(un.node.x) - f.ax, period, easing: "ease-in-out" })
        .loop("top", { from: view.y(un.home.y) - f.ay, to: view.y(un.node.y) - f.ay, period, easing: "ease-in-out" });
    } else {
      el = el.left(view.x(at.x) - f.ax).top(view.y(at.y) - f.ay);
    }
    return { el, y: working ? un.home.y : at.y };
  }

  /** Ground covering the visible part of the world container (shifted by the pan). */
  terrain(S, view, w, h, towns, pan) {
    const t = this.pack.data.terrain ?? {};
    const out = [];
    if (t.ground) {
      // A pre-baked ground (SPEC §18.5): a few copies cover the view.
      const [gw, gh] = t.groundSize ?? [1536, 768];
      // Whole pixels, and each copy 1 px larger than its step: fractional edges are where the GPU
      // blends a copy's border, which shows as seams between otherwise seamless copies.
      const W = Math.max(8, Math.round(gw * S)), H = Math.max(4, Math.round(gh * S));
      const x0 = Math.round((((view.x(0) + pan.x) % W) + W) % W) - W - pan.x, y0 = Math.round((((view.y(0) + pan.y) % H) + H) % H) - H - pan.y;
      for (let y = y0; y < h - pan.y; y += H) for (let x = x0; x < w - pan.x; x += W) out.push(image(this.path(t.ground)).absolute().left(x).top(y).w(W + 1).h(H + 1));
      return out;
    }
    const grass = t.grass ?? [];
    if (!grass.length) return out;
    const dirt = t.dirt ?? grass;
    const [tw, th] = this.pack.data.tile ?? [96, 48];
    const TW = tw * S, TH = th * S;
    // Staggered diamond rows covering the view, tile variant seeded by its grid cell.
    const c0 = Math.floor((-view.x(0) - pan.x) / TW) - 1, r0 = Math.floor((-view.y(0) - pan.y) / (TH / 2)) - 1;
    const cols = Math.ceil(w / TW) + 3, rows = Math.ceil(h / (TH / 2)) + 3;
    for (let r = r0; r < r0 + rows; r++) {
      for (let c = c0; c < c0 + cols; c++) {
        const wx = c * tw + (r & 1 ? tw / 2 : 0), wy = r * (th / 2);
        const near = towns.some((tn) => Math.hypot(wx - tn.x, (wy - tn.y) * 2) < 150);
        const set = near ? dirt : grass;
        const v = set[hashStr(`${c},${r}`) % set.length];
        out.push(image(this.path(v)).absolute().left(view.x(wx) - TW / 2).top(view.y(wy) - TH / 2).w(TW).h(TH));
      }
    }
    return out;
  }

  // ---- right-click menus

  /** Train units here, and (for a building) move it or change what it is; (town) move the town. */
  contextMenu(town, building, at, cx) {
    const space = spaces().find((s) => s.id === town.space);
    const ents = this.pack?.data?.entities ?? {};
    cx.spawn(async () => {
      let known = [];
      try {
        known = (await knownAgents({ on: space?.machine ?? null })).filter((a) => a.installed && Array.isArray(a.run) && a.run.length);
      } catch {}
      const items = [
        ...known.slice(0, 10).map((a) => ({ label: `Train ${a.name}`, icon: "train", act: { run: ["tab.new", { space: town.space, argv: a.run }] } })),
        ...(known.length ? [] : [{ label: "No agents found on this machine", disabled: true }]),
        { label: "Train with &orders...", icon: "train", act: { dialog: { kind: "train", title: "Train a unit", space: town.space } } },
        { label: "New &worker (shell tab)", icon: "build", act: { run: ["tab.new", { space: town.space }] } },
        { sep: true },
      ];
      if (building) {
        const kinds = obj("empires.buildingKinds");
        const pos = obj("empires.buildingPos");
        const available = [...BUILDING_KINDS, "field", "palisade", "gate"].filter((k) => entityFallback(ents, k) === k);
        items.push(
          { label: "&Move building", icon: "rally", act: { shared: ["empires.moving", { type: "building", tab: building.tab, kind: building.kind, town: town.space, slot: town.slot }] } },
          { label: "Change &type", icon: "build", sub: available.map((k) => ({ label: KIND_LABEL[k] ?? k, radio: true, checked: building.kind === k, act: { shared: ["empires.buildingKinds", { ...kinds, [building.tab]: k }] } })) },
        );
        if (kinds[building.tab]) {
          const { [building.tab]: _gone, ...rest } = kinds;
          items.push({ label: "Reset type", act: { shared: ["empires.buildingKinds", rest] } });
        }
        if (pos[building.tab]) {
          const { [building.tab]: _gone, ...rest } = pos;
          items.push({ label: "Reset position", act: { shared: ["empires.buildingPos", rest] } });
        }
        if (!building.extra) items.push({ sep: true }, { label: `Show this tab`, icon: "house", act: { run: ["tab.select", { id: building.tab }] } });
      } else {
        const townPos = obj("empires.townPos");
        items.push({ label: "&Move town", icon: "rally", act: { shared: ["empires.moving", { type: "town", town: town.space, slot: town.slot }] } });
        if (townPos[town.space]) {
          const { [town.space]: _gone, ...rest } = townPos;
          items.push({ label: "Reset town position", act: { shared: ["empires.townPos", rest] } });
        }
        items.push({ sep: true }, { label: `Show ${town.name}`, icon: "town", act: { run: ["space.select", { id: town.space }] } });
      }
      openMenu(items, at);
    });
  }

  /** Places what is being moved at the pointer (element px), in world coordinates. */
  place(moving, lx, ly, model) {
    const S = this.lastS ?? 1;
    const w = this.size?.width ?? 0, h = this.size?.height ?? 0;
    const wx = Math.round(this.base.x + (lx - w / 2 - this.pan.x) / S);
    const wy = Math.round(this.base.y + (ly - h * 0.5 - this.pan.y) / S);
    if (moving.type === "town") {
      setShared("empires.townPos", { ...obj("empires.townPos"), [moving.town]: { x: wx, y: wy } });
    } else {
      const town = model.towns.find((t) => t.space === moving.town);
      if (town) setShared("empires.buildingPos", { ...obj("empires.buildingPos"), [moving.tab]: { x: wx - town.x, y: wy - town.y } });
    }
    setShared("empires.moving", null);
  }

  render(cx) {
    const u = unit();
    const now = Date.now();
    const w = this.size?.width ?? 0, h = this.size?.height ?? 0;
    const moving = shared("empires.moving");
    let rootEl = div()
      .id("world")
      .size_full()
      .relative()
      .overflow_hidden()
      .bg("#3b5a22")
      .on_size_change((size, cx) => {
        this.size = size;
        cx.notify();
      });
    if (!this.pack) return root(u, rootEl.child(div().absolute().top(8).left(10).text_color(C.text).child("Loading the art pack…")));
    const ents = this.pack.data.entities ?? {};
    // Stable town slots: a new space takes the smallest free one; nothing moves when you switch.
    const all = spaces();
    const slots = assignSlots(all.map((s) => s.id), obj("empires.townSlots"));
    if (Object.keys(slots).length !== Object.keys(obj("empires.townSlots")).length) (this.pendingShared ??= {})["empires.townSlots"] = slots;
    // The model only changes when Herdr's data or the town state does: cache it on a cheap key.
    const ag = agents();
    const modelKey = [
      all.map((s) => `${s.id}:${s.active ? 1 : 0}:${s.name}:${s.tabs.map((t) => `${t.id}.${t.settled ? 1 : 0}.${t.status ?? ""}.${t.name}`).join("/")}`).join("|"),
      ag.map((a) => `${a.address}:${a.status}:${a.focused ? 1 : 0}:${a.tab}`).join("|"),
      JSON.stringify([slots, shared("empires.townPos"), shared("empires.buildingPos"), shared("empires.buildingKinds"), shared("empires.townLevels"), shared("empires.hideNames"), shared("space.colors")]),
      JSON.stringify(this.townStats()).replace(/\.\d+/g, ""),
      this.planGen ?? 0,
    ].join("#");
    const model = this.modelKey === modelKey && this.model ? this.model : worldModel({
      spaces: all,
      agents: ag,
      terminals: terminals(),
      colors: shared("space.colors"),
      slots,
      townPos: obj("empires.townPos"),
      buildingPos: obj("empires.buildingPos"),
      kinds: obj("empires.buildingKinds"),
      stats: this.townStats(),
      minLevels: obj("empires.townLevels"),
      hideNames: shared("empires.hideNames") === true,
      plan: (seed, level, style, tabs) => {
        const p = this.planFor(seed, level, style, tabs, cx);
        if (p) (this.lastPlan ??= {})[seed] = p;
        return p;
      },
      looks: Array.isArray(this.pack.data.unitLooks) && this.pack.data.unitLooks.length ? this.pack.data.unitLooks : ["villager"],
    });
    this.model = model;
    this.modelKey = modelKey;
    const active = model.towns.find((t) => t.active) ?? model.towns[0];
    // Remember each town's highest level, so growth survives restarts and slow repo reads.
    const levels = obj("empires.townLevels");
    if (model.towns.some((t) => t.level > (Number(levels[t.space]) || 0)))
      (this.pendingShared ??= {})["empires.townLevels"] = { ...levels, ...Object.fromEntries(model.towns.filter((t) => t.level > (Number(levels[t.space]) || 0)).map((t) => [t.space, t.level])) };
    // The camera starts on the shown space's town, then stays where you leave it.
    this.base ??= active ? { x: active.x, y: active.y } : { x: 0, y: 0 };
    const S = Math.max(0.45, Math.min(0.8, h / 440)) * (Number(shared("empires.worldZoom")) || 1) * this.wheel;
    this.lastS = S;
    const pan = this.pan;
    const cx0 = w / 2, cy0 = h * 0.5;
    const view = { x: (x) => cx0 + (x - this.base.x) * S, y: (y) => cy0 + (y - this.base.y) * S };
    rootEl = rootEl
      // Drag anywhere on the map to move around; the wheel zooms; while moving a building,
      // a click places it and a right-click cancels.
      .on_mouse_down("left", (e, cx) => {
        this.lastPress = { x: Math.round(e.position.x), y: Math.round(e.position.y) };
        const mv = shared("empires.moving");
        if (mv && e.local_position) {
          cx.stop_propagation();
          this.place(mv, e.local_position.x, e.local_position.y, model);
          return;
        }
        this.drag = { sx: e.position.x, sy: e.position.y, px: this.pan.x, py: this.pan.y, moved: false };
      })
      .on_mouse_down("right", (_e, cx) => {
        if (shared("empires.moving")) {
          cx.stop_propagation();
          setShared("empires.moving", null);
        }
      })
      .on_mouse_move((e, cx) => {
        if (shared("empires.moving")) {
          this.hover = e.local_position;
          cx.notify();
          return;
        }
        if (!this.drag) return;
        const dx = e.position.x - this.drag.sx, dy = e.position.y - this.drag.sy;
        if (!this.drag.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
        this.drag.moved = true;
        this.pan = { x: this.drag.px + dx, y: this.drag.py + dy };
        // A redraw per pointer event is far more than the eye needs: ~30 a second.
        const t = Date.now();
        if (t - (this.lastDragDraw ?? 0) >= 33) {
          this.lastDragDraw = t;
          cx.notify();
        }
      })
      .on_mouse_up("left", (_e, cx) => {
        if (this.drag?.moved) {
          this.dragEnd = Date.now();
          this.saveCamera();
          cx.notify(); // the final position, even if the last move was throttled
        }
        this.drag = null;
      })
      .on_hover((hovered) => {
        if (!hovered) this.drag = null;
      })
      .on_scroll_wheel((e, cx) => {
        const d = e.delta?.y ?? 0;
        if (!d) return;
        // Keep the world point at the view's centre where it is, then zoom around it.
        this.base = { x: this.base.x - this.pan.x / S, y: this.base.y - this.pan.y / S };
        this.pan = { x: 0, y: 0 };
        this.wheel = Math.max(0.5, Math.min(2.2, this.wheel * (d > 0 ? 1.08 : 1 / 1.08)));
        this.saveCamera();
        cx.notify();
      });
    const tiles = this.terrain(S, view, w, h, model.towns, pan);
    // Trodden ground under each town center, between the ground and the sprites.
    const patch = ents.dirt_patch;
    if (patch) for (const town of model.towns) tiles.push(this.sprite(patch, patch.image ?? patch.variants?.[0], town.slot, town.x, town.y + 40, S, view));
    const items = [];
    this.wilderness(ents, S, view, w, h, pan, model.towns, now, tiles, items);
    const visible = (x, y, pad = 400) => view.x(x) + pan.x > -pad * S && view.x(x) + pan.x < w + pad * S && view.y(y) + pan.y > -pad * S && view.y(y) + pan.y < h + pad * S;
    const isMoving = (t, b) => moving && ((moving.type === "town" && moving.town === t.space) || (moving.type === "building" && b && moving.tab === b.tab));
    for (const town of model.towns) {
      if (!visible(town.x, town.y, 1100)) continue;
      const tree = ents[entityFallback(ents, "tree")];
      if (tree) for (const f of town.forest) if (visible(f.x, f.y)) items.push({ y: f.y, x: f.x, pri: 4, make: () => this.sprite(tree, tree.variants?.[f.v % tree.variants.length] ?? tree.image, town.slot, f.x, f.y, S, view) });
      // Mines and berries where the planner put them (drop sites stand beside them).
      for (const m of town.mines) {
        const name = entityFallback(ents, m.kind);
        if (name && visible(m.x, m.y)) items.push({ y: m.y, x: m.x, pri: 3, make: () => this.sprite(ents[name], ents[name].image ?? ents[name].variants?.[0], town.slot, m.x, m.y, S, view) });
      }
      // Walls: closed on the grid, gates mid-side, posts or towers on the corners.
      if (town.walls) for (const w of town.walls.pieces) {
        const ent = this.wallPiece(ents, town.walls.type, w.part);
        if (!ent || !visible(w.x, w.y, 120)) continue;
        items.push({ y: w.y + (w.order ?? 0), x: w.x, pri: 2, make: () => this.sprite(ent.ent, ent.rel, town.slot, w.x, w.y, S, view) });
      }
      // Grown buildings: what the town's level has unlocked (decor; hover says why).
      for (const ex of town.extras) {
        const name = entityFallback(ents, ex.kind);
        if (!name || !visible(ex.x, ex.y)) continue;
        const ent = ents[name];
        const rel = ent.variants ? ent.variants[hashStr(ex.id) % ent.variants.length] : ent.image;
        // Flat things (a farm plot) lie on the ground, under every sprite.
        if (FLAT.has(name)) {
          tiles.push(this.sprite(ent, rel, town.slot, ex.x, ex.y, S, view));
          continue;
        }
        const asB = { tab: ex.id, kind: ex.kind, extra: true };
        items.push({
          y: ex.y,
          x: ex.x,
          pri: 2,
          make: () => this.spriteBox(`ex-${ex.id}`, ent, rel, town.slot, ex.x, ex.y, S, view, { opacity: isMoving(town, asB) ? 0.35 : null })
            .tooltip(`${KIND_LABEL[ex.kind] ?? ex.kind}: part of ${town.name}, a level ${town.level} ${town.style} town${town.stats?.commits ? ` (${town.stats.commits} commits)` : ""}. Right-click to train units, move or change it`)
            .on_mouse_down("right", (e, cx) => {
              cx.stop_propagation();
              if (!shared("empires.moving")) this.contextMenu(town, asB, e.position, cx);
            }),
        });
      }
      const tcName = entityFallback(ents, "town_center");
      if (tcName) {
        const tc = ents[tcName];
        items.push({
          y: town.y,
          x: town.x,
          pri: 1,
          make: () => this.spriteBox(`tc-${town.space}`, tc, tc.image, town.slot, town.x, town.y, S, view, { opacity: isMoving(town) ? 0.35 : null })
            .cursor_pointer()
            .tooltip(`${town.name}: town center · level ${town.level} ${town.style} town${town.stats?.commits ? ` · ${town.stats.commits} commits` : ""}. Click to show this space; right-click to train units or move the town`)
            .on_click(() => {
              if (!this.wasDrag() && !shared("empires.moving")) run("space.select", { id: town.space });
            })
            .on_mouse_down("right", (e, cx) => {
              cx.stop_propagation();
              if (!shared("empires.moving")) this.contextMenu(town, null, e.position, cx);
            })

        });
      }
      town.buildings.forEach((b) => {
        const name = entityFallback(ents, b.kind);
        if (!name) return;
        const ent = ents[name];
        const rel = ent.variants ? ent.variants[hashStr(b.tab) % ent.variants.length] : ent.image;
        items.push({
          y: b.y,
          x: b.x,
          pri: 1,
          make: () => this.spriteBox(`bld-${b.tab}`, ent, rel, town.slot, b.x, b.y, S, view, { opacity: isMoving(town, b) ? 0.35 : b.settled ? 0.8 : null })
            .cursor_pointer()
            .tooltip(`${KIND_LABEL[b.kind] ?? "Building"}: ${b.name ? `tab ${b.name}` : "a tab"}${b.settled ? " (garrisoned)" : ""}. Click to show it; right-click to train, move or change it`)
            .on_click(() => {
              if (!this.wasDrag() && !shared("empires.moving")) run("tab.select", { id: b.tab });
            })
            .on_mouse_down("right", (e, cx) => {
              cx.stop_propagation();
              if (!shared("empires.moving")) this.contextMenu(town, b, e.position, cx);
            })

        });
      });
      // Town banner under the town center: name, level, and "+N" when units overflow the cap.
      items.push({
        y: town.y + 1e6, // always on top
        x: town.x,
        pri: 0,
        el: div()
          .absolute()
          .left(view.x(town.x) - 80)
          .top(view.y(town.y) + 150 * S)
          .w(160)
          .flex()
          .justify_center()
          .child(
            div()
              .px(u(6))
              .py(u(1))
              .rounded(u(3))
              .bg("#2b2016d0")
              .border(1)
              .border_color(town.active ? C.goldBright : town.color)
              .font_family(DISPLAY)
              .text_size(u(11))
              .text_color(C.text)
              .child(`${town.name} · ${town.level}${town.hidden ? `  +${town.hidden}` : ""}`),
          ),
      });
    }
    let drawnUnits = 0;
    for (const un of model.units) {
      if (!visible(un.home.x, un.home.y, 900)) continue;
      const r = this.unitEl(un, S, view, now);
      if (r) {
        items.push({ ...r, x: un.home.x, pri: 0 });
        drawnUnits++;
      }
    }
    this.unitsInView = drawnUnits > 0;
    // Forget trip clocks of units that are gone or changed status.
    const live = new Set(model.units.map((un) => `${un.address}:${un.status}`));
    for (const k of Object.keys(this.t0)) if (!live.has(k)) delete this.t0[k];
    // A render has 50 ms in Herdr's script engine (a longer one is cut off: "could not be
    // re-rendered"). Elements are what cost, so only the most important ones nearest the view's
    // centre are built: units and town centers first, scenery last.
    const ctr = { x: this.base.x - pan.x / S, y: this.base.y - pan.y / S };
    // Units, buildings and walls in view are always drawn (a wall with holes looks broken);
    // only scenery (mines, trees, countryside) is trimmed to fit, nearest the centre first.
    const essential = items.filter((it) => (it.pri ?? 3) <= 2);
    let scenery = items.filter((it) => (it.pri ?? 3) > 2);
    const room = Math.max(40, SPRITE_CAP - essential.length);
    if (scenery.length > room)
      scenery = scenery
        .map((it) => ({ it, k: (it.pri ?? 3) * 1e7 + Math.hypot((it.x ?? ctr.x) - ctr.x, (it.y - ctr.y) * 2) }))
        .sort((a, b) => a.k - b.k)
        .slice(0, room)
        .map((o) => o.it);
    const kept = [...essential, ...scenery];
    kept.sort((a, b) => a.y - b.y);
    const built = kept.map((it) => it.el ?? it.make());
    // The building (or town center) being moved follows the pointer as a ghost.
    let ghost = null;
    if (moving && this.hover) {
      const ent = moving.type === "town" ? ents[entityFallback(ents, "town_center")] : ents[entityFallback(ents, moving.kind)];
      if (ent) {
        const [gw, gh] = ent.size ?? [96, 96];
        const [ax, ay] = ent.anchor ?? [gw / 2, gh];
        const rel = ent.variants ? ent.variants[0] : ent.image;
        ghost = image(this.path(rel, moving.slot)).absolute().left(this.hover.x - ax * S).top(this.hover.y - ay * S).w(gw * S).h(gh * S).opacity(0.7);
      }
    }
    // Everything on the map sits in one container moved by the pan, so dragging never
    // restarts the units' native walking loops (their coordinates don't change).
    rootEl = rootEl.child(div().absolute().left(pan.x).top(pan.y).w(w).h(h).children(tiles).children(built));
    if (ghost) rootEl = rootEl.child(ghost);
    if (moving)
      rootEl = rootEl.child(
        div().absolute().top(u(8)).left(0).w_full().flex().justify_center().child(div().px(u(10)).py(u(3)).rounded(u(3)).bg("#2b2016e0").border(1).border_color(C.goldBright).text_color(C.text).font_family(FONT_SC).text_size(u(12)).child(`Click to place the ${moving.type === "town" ? "town" : "building"} · right-click to cancel`)),
      );
    // Corner: Centre once the camera has moved (the view buttons live in the top bar).
    const off = pan.x || pan.y || this.wheel !== 1 || (active && (this.base.x !== active.x || this.base.y !== active.y));
    if (off)
      rootEl = rootEl.child(
        div()
          .absolute()
          .top(u(6))
          .right(u(8))
          .child(
            div()
              .id("view-center")
              .px(u(6))
              .py(u(1))
              .rounded(u(3))
              .cursor_pointer()
              .font_family(FONT_SC)
              .text_size(u(11))
              .bg("#2b2016c0")
              .text_color(C.text)
              .tooltip("Back to the shown space's town, at the normal zoom")
              .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
              .on_click((_e, cx) => {
                this.base = active ? { x: active.x, y: active.y } : { x: 0, y: 0 };
                this.pan = { x: 0, y: 0 };
                this.wheel = 1;
                this.saveCamera();
                cx.notify();
              })
              .child("Centre"),
          ),
      );
    if (this.pack.data.attribution)
      rootEl = rootEl.child(div().absolute().bottom(u(2)).left(u(6)).text_size(u(9)).text_color("#f1e6c8a0").child(this.pack.data.local ? "Local art pack (your own install; never shared)" : "Art: 0 A.D. © Wildfire Games, CC BY-SA 3.0"));
    return root(u, rootEl);
  }
}
