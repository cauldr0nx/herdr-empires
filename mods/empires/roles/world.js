// The world (SPEC §18): an isometric RTS map of Herdr's live state, drawn from an art pack.
// Each space is a town (a town center in its player colour, one building per tab), each
// agent a unit: working units walk between their building and a resource node, gather there
// and carry the load back; blocked units wait at the town center under a red alert; finished
// units wear a laurel until seen; idle ones stand about. Click a unit to focus its terminal,
// double-click to open it full size; click a town center to show that space, a building to
// show its tab.
//
// Motion is native: a working unit's position runs on paired left/top loops (there and back,
// ease-in-out, so it lingers at both ends). Sprite frames are the one thing gpui-shell can't
// animate natively for images (SPIKES R11), so a frame tick redraws this copy at most 8 times
// a second, and only while the world is shown, the window is active and something moves.

import { div, image } from "gpui-kit";
import { spaces, agents, terminals, shared, setShared, run, readTextFile, appHome, window as appWindow } from "herdr";
import { C, FONT_SC, DISPLAY, ASSETS, unit, root, own, calm, glyph } from "../kit.js";
import { worldModel, tripState, dirRow, animFallback, entityFallback, hashStr, seeded } from "../data.js";
import { setView, viewMode } from "./views.js";
import { openUnitChat } from "./chat.js";

const SHIPPED = `${ASSETS}/packs/zeroad`;
const LOCAL = "empires-packs/local";
const FPS_CAP = 6;
const SPEED = 55; // world px per second, walking

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

export default class World {
  init(_p, cx) {
    this.pack = null;
    this.packChoice = null;
    this.size = null;
    this.t0 = {};
    this.pan = { x: 0, y: 0 }; // camera offset from the active town, screen px (drag to move)
    this.drag = null;
    this.dragEnd = 0;
    this.wheel = 1; // scroll-wheel zoom, on top of Options → World zoom
    this.activeSpace = null;
    this.reload(cx);
    cx.timer.every(1000 / FPS_CAP, (cx) => {
      if (shared("empires.pack") !== this.packChoice) this.reload(cx);
      if (this.animating()) cx.notify();
    });
  }

  reload(cx) {
    this.packChoice = shared("empires.pack") ?? "auto";
    cx.spawn(async (cx) => {
      this.pack = await loadPack(this.packChoice);
      cx.notify();
    });
  }

  /** Units walk and play their frames unless calm mode or Options → Animate units is off. */
  moving() {
    return !calm() && shared("empires.animate") !== false;
  }

  animating() {
    if (!this.pack || !this.moving() || viewMode() === "terminals") return false;
    if (!this.size || this.size.width < 40 || this.size.height < 40) return false;
    if (appWindow()?.active === false && shared("empires.animateInactive") !== true) return false;
    return agents().length > 0;
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

  unitEl(un, S, view, now) {
    const ent = this.pack.data.entities?.villager;
    if (!ent) return null;
    const working = un.status === "working" && this.moving();
    const key = `${un.address}:${un.status}`;
    const t0 = (this.t0[key] ??= now);
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
    if (un.status === "blocked")
      body = body.child(
        div().absolute().left(f.ax - 8).top(-20).w(16).h(18).rounded(3).bg(C.blocked).border(1).border_color("#fff6e8").flex().items_center().justify_center().text_color("#fff6e8").font_weight(800).text_size(12).child("!").when(!calm(), (el) => el.loop("opacity", { from: 0.45, to: 1, period: 700 })),
      );
    if (un.status === "done") body = body.child(image(`${ASSETS}/img/badge-done.svg`).absolute().left(f.ax - 8).top(-18).w(16).h(16));
    let el = div()
      .id(`unit-${key}`)
      .absolute()
      .cursor_pointer()
      .tooltip(`${un.name}: ${un.status === "working" ? `gathering ${un.resource}` : un.status === "blocked" ? "under attack: needs you" : un.status === "done" ? "task complete" : "idle"}${un.workers ? ` · ${un.workers} worker${un.workers === 1 ? "" : "s"}` : ""}. Click to talk to it`)
      .on_click((_e, cx) => {
        if (this.wasDrag()) return;
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

  /** A press that ended a drag a moment ago is not a click. */
  wasDrag() {
    return Date.now() - this.dragEnd < 250;
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
        const near = towns.some((tn) => Math.hypot((wx - tn.x) / 1, (wy - tn.y) * 2) < 150);
        const set = near ? dirt : grass;
        const v = set[hashStr(`${c},${r}`) % set.length];
        out.push(image(this.path(v)).absolute().left(view.x(wx) - TW / 2).top(view.y(wy) - TH / 2).w(TW).h(TH));
      }
    }
    return out;
  }

  render(_cx) {
    const u = unit();
    const now = Date.now();
    const w = this.size?.width ?? 0, h = this.size?.height ?? 0;
    let rootEl = div()
      .id("world")
      .size_full()
      .relative()
      .overflow_hidden()
      .bg("#3b5a22")
      .on_size_change((size, cx) => {
        this.size = size;
        cx.notify();
      })
      // Drag anywhere on the map to move around; the wheel zooms.
      .on_mouse_down("left", (e) => {
        this.lastPress = { x: Math.round(e.position.x), y: Math.round(e.position.y) };
        this.drag = { sx: e.position.x, sy: e.position.y, px: this.pan.x, py: this.pan.y, moved: false };
      })
      .on_mouse_move((e, cx) => {
        if (!this.drag) return;
        const dx = e.position.x - this.drag.sx, dy = e.position.y - this.drag.sy;
        if (!this.drag.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
        this.drag.moved = true;
        this.pan = { x: this.drag.px + dx, y: this.drag.py + dy };
        cx.notify();
      })
      .on_mouse_up("left", () => {
        if (this.drag?.moved) this.dragEnd = Date.now();
        this.drag = null;
      })
      .on_hover((hovered) => {
        if (!hovered) this.drag = null;
      })
      .on_scroll_wheel((e, cx) => {
        const d = e.delta?.y ?? 0;
        if (!d) return;
        this.wheel = Math.max(0.5, Math.min(2.2, this.wheel * (d > 0 ? 1.08 : 1 / 1.08)));
        cx.notify();
      });
    if (!this.pack) return root(u, rootEl.child(div().absolute().top(8).left(10).text_color(C.text).child("Loading the art pack…")));
    const ents = this.pack.data.entities ?? {};
    // A different space shown: centre on its town again.
    const act = spaces().find((x) => x.active)?.id ?? null;
    if (act !== this.activeSpace) {
      this.activeSpace = act;
      this.pan = { x: 0, y: 0 };
    }
    const pan = this.pan;
    const model = worldModel({ spaces: spaces(), agents: agents(), terminals: terminals(), colors: shared("space.colors") });
    // Camera: the active town a little above centre; the world scale fits the view's height.
    // Scale: fit the view's height, but never so small that units stop reading (a split band is short).
    const S = Math.max(0.45, Math.min(0.8, h / 440)) * (Number(shared("empires.worldZoom")) || 1) * this.wheel;
    const cx0 = w / 2, cy0 = h * 0.5;
    const view = { x: (x) => cx0 + x * S, y: (y) => cy0 + y * S };
    const tiles = this.terrain(S, view, w, h, model.towns, pan);
    // Trodden ground under each town center, between the ground and the sprites.
    const patch = ents.dirt_patch;
    if (patch) for (const town of model.towns) tiles.push(this.sprite(patch, patch.image ?? patch.variants?.[0], town.slot, town.x, town.y + 40, S, view));
    const items = [];
    const visible = (x, y, pad = 400) => view.x(x) + pan.x > -pad * S && view.x(x) + pan.x < w + pad * S && view.y(y) + pan.y > -pad * S && view.y(y) + pan.y < h + pad * S;
    for (const town of model.towns) {
      if (!visible(town.x, town.y, 900)) continue;
      const tree = ents[entityFallback(ents, "tree")];
      if (tree) for (const f of town.forest) if (visible(f.x, f.y)) items.push({ y: f.y, el: this.sprite(tree, tree.variants?.[f.v % tree.variants.length] ?? tree.image, town.slot, f.x, f.y, S, view) });
      for (const [kind, ent] of [["gold", "gold_mine"], ["stone", "stone_mine"], ["food", "berry_bush"]]) {
        const name = entityFallback(ents, ent);
        const p = town.nodes[kind];
        if (name && p) items.push({ y: p.y, el: this.sprite(ents[name], ents[name].image ?? ents[name].variants?.[0], town.slot, p.x, p.y, S, view) });
      }
      const tcName = entityFallback(ents, "town_center");
      if (tcName) {
        const tc = ents[tcName];
        items.push({
          y: town.y,
          el: div().id(`tc-${town.space}`).cursor_pointer().tooltip(`${town.name}: town center. Click to show this space`).on_click(() => { if (!this.wasDrag()) run("space.select", { id: town.space }); }).child(this.sprite(tc, tc.image, town.slot, town.x, town.y, S, view)),
        });
      }
      town.buildings.forEach((b) => {
        const name = entityFallback(ents, b.kind);
        if (!name) return;
        const ent = ents[name];
        const rel = ent.variants ? ent.variants[hashStr(b.tab) % ent.variants.length] : ent.image;
        items.push({
          y: b.y,
          el: div().id(`bld-${b.tab}`).cursor_pointer().tooltip(`${b.name ? `Tab ${b.name}` : "Tab"}${b.settled ? " (garrisoned)" : ""}: click to show it`).on_click(() => { if (!this.wasDrag()) run("tab.select", { id: b.tab }); }).child(this.sprite(ent, rel, town.slot, b.x, b.y, S, view, { opacity: b.settled ? 0.8 : null })),
        });
      });
      // Town banner under the town center: name, and "+N" when units overflow the cap.
      items.push({
        y: town.y + 1e6, // always on top
        el: div()
          .absolute()
          .left(view.x(town.x) - 70)
          .top(view.y(town.y) + 150 * S)
          .w(140)
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
              .child(`${town.name}${town.hidden ? `  +${town.hidden}` : ""}`),
          ),
      });
    }
    for (const un of model.units) {
      if (!visible(un.home.x, un.home.y, 900)) continue;
      const r = this.unitEl(un, S, view, now);
      if (r) items.push(r);
    }
    // Forget trip clocks of units that are gone or changed status.
    const live = new Set(model.units.map((un) => `${un.address}:${un.status}`));
    for (const k of Object.keys(this.t0)) if (!live.has(k)) delete this.t0[k];
    items.sort((a, b) => a.y - b.y);
    // Everything on the map sits in one container moved by the pan, so dragging never
    // restarts the units' native walking loops (their coordinates don't change).
    rootEl = rootEl.child(div().absolute().left(pan.x).top(pan.y).w(w).h(h).children(tiles).children(items.map((i) => i.el)));
    // Corner controls: the view mode and the pack's credit line.
    rootEl = rootEl.child(
      own(
        div()
          .absolute()
          .top(u(6))
          .right(u(8))
          .flex()
          .gap(u(4))
          .children(
            // The view buttons live in the top bar (always on screen); here only Centre, once moved.
            (pan.x || pan.y || this.wheel !== 1 ? [["center", "Centre"]] : []).map(([m, label]) =>
              div()
                .id(`view-${m}`)
                .px(u(6))
                .py(u(1))
                .rounded(u(3))
                .cursor_pointer()
                .font_family(FONT_SC)
                .text_size(u(11))
                .bg(viewMode() === m ? C.gold : "#2b2016c0")
                .text_color(viewMode() === m ? "#1f1c17" : C.text)
                .tooltip(m === "center" ? "Back to this space's town, at the normal zoom" : `${label} view (Alt+W cycles)`)
                .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
                .on_click((_e, cx) => {
                  if (m === "center") {
                    this.pan = { x: 0, y: 0 };
                    this.wheel = 1;
                    cx.notify();
                  } else setView(m);
                })
                .child(label),
            ),
          ),
      ),
    );
    if (this.pack.data.attribution)
      rootEl = rootEl.child(div().absolute().bottom(u(2)).left(u(6)).text_size(u(9)).text_color("#f1e6c8a0").child(this.pack.data.local ? "Local art pack (your own install; never shared)" : "Art: 0 A.D. © Wildfire Games, CC BY-SA 3.0"));
    return root(u, rootEl);
  }
}
