// The diamond minimap (SPEC §6.5): territories, one per space in its player
// colour (the active one outlined in gold, remote realms behind a dashed
// river), buildings for tabs, dots for agents coloured by status, a pulsing
// ping ring on blocked ones. Click a territory = space.select, a dot =
// agent.focus. Below: the idle-units button and the alarm counter. Above 12
// spaces the map becomes a ring of banners. Calls setAgentOrder() so
// agent.next/prev follow the map's order.

import { div, PathBuilder } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, agents, terminals, focused, run, shared, setShared, setAgentOrder } from "herdr";
import { C, STATUS_COLOR, unit, root, stone, button, glyph, own, calm, label } from "../kit.js";
import { territories, minimapMode, orderAgents, nextIdle, nextBlocked, playerColor, toggleSelected, subAgents } from "../data.js";
import { commandMode } from "./queue.js";

const MAP_W = 196;
const MAP_H = 98;

export default class Minimap {
  init() {}

  rhombus(t, W, H, inset = 0) {
    const cx = t.cx * W;
    const cy = t.cy * H;
    const w = t.w * W - inset;
    const h = t.h * H - inset;
    return [[cx, cy - h], [cx + w, cy], [cx, cy + h], [cx - w, cy]];
  }

  territory(u, t, s, i, order) {
    const selected = Array.isArray(shared("empires.selected")) ? shared("empires.selected") : [];
    const W = u(MAP_W);
    const H = u(MAP_H);
    const color = playerColor(s.id, i, shared("space.colors"));
    const pts = this.rhombus(t, W, H, u(1));
    const fill = PathBuilder.fill().add_polygon(pts, true).build();
    let edgeBuilder = PathBuilder.stroke(u(s.active ? 2 : 1)).add_polygon(pts, true);
    if (t.remote) edgeBuilder = edgeBuilder.dash_array([u(3), u(2)]);
    const edge = edgeBuilder.build();
    const list = agents().filter((a) => a.space === s.id);
    const cx = t.cx * W;
    const cy = t.cy * H;
    const w = t.w * W;
    const h = t.h * H;
    // Buildings and units sit on a small grid inside the rhombus.
    const n = Math.max(1, s.tabs.length);
    const spots = s.tabs.map((tab, k) => {
      const f = n === 1 ? 0 : (k / (n - 1)) * 2 - 1; // -1..1 across the cell
      return { tab, x: cx + f * w * 0.45, y: cy + f * 0 };
    });
    const layer = div().absolute().top(0).left(0).w(W).h(H);
    let el = layer
      .child(window.paint_path(fill, color).absolute().top(0).left(0).size_full().opacity(t.remote ? 0.55 : s.active ? 0.95 : 0.75))
      .child(window.paint_path(edge, t.remote ? "#3cb3bf" : s.active ? C.goldBright : C.stone.dark).absolute().top(0).left(0).size_full());
    for (const { tab, x, y } of spots) {
      const dotSize = 5;
      const bld = div().absolute().left(x - u(4)).top(y - u(4)).child(glyph(u, tab.settled ? "garrison" : "house", 8, tab.active && s.active ? C.goldBright : C.text));
      el = el.child(bld);
      const here = list.filter((a) => a.tab === tab.id);
      here.forEach((a, j) => {
        const ax = x + u(-6 + j * 7);
        const ay = y + u(5);
        const picked = selected.includes(a.address);
        // A Captain's army: its workers in a small formation beneath it.
        subAgents(terminals(), a.address).slice(0, 4).forEach((w, k) => {
          el = el.child(div().absolute().left(ax + u(-3 + k * 3)).top(ay + u(dotSize + 2)).w(u(2.5)).h(u(2.5)).rounded(u(1.25)).bg(STATUS_COLOR[w.status] ?? C.unknown));
        });
        let dot = own(
          div()
            .id(`mm-${a.address}`)
            .absolute()
            .left(ax)
            .top(ay)
            .w(u(dotSize))
            .h(u(dotSize))
            .rounded(u(dotSize / 2))
            .bg(STATUS_COLOR[a.status] ?? C.unknown)
            .border(u(1))
            .border_color(picked ? C.goldBright : a.focused ? C.goldBright : C.stone.dark)
            .when(picked, (d) => d.border(u(1.5)))
            .tooltip(`${a.program?.name ?? "Unit"} in ${a.space_name} / ${a.tab_name}: ${a.status}. Click to go there${commandMode() ? "; shift-click to add to the selection" : ""}`)
            .on_click((e, cx) => {
              cx.stop_propagation();
              if (e.modifiers?.shift && commandMode()) return setShared("empires.selected", toggleSelected(shared("empires.selected"), a.address));
              setShared("empires.selected", []);
              run("agent.focus", { terminal: a.address });
            }),
        );
        el = el.child(dot);
        if (a.status === "blocked" && !calm()) {
          el = el.child(div().absolute().left(ax - u(4)).top(ay - u(4)).w(u(dotSize + 8)).h(u(dotSize + 8)).rounded(u((dotSize + 8) / 2)).border(u(1.5)).border_color(C.blocked).loop("opacity", { from: 0, to: 1, period: 900 }));
        }
      });
    }
    // The click region: the cell's bounding box (R2 fallback; the rhombus itself takes no id).
    el = el.child(
      own(
        div()
          .id(`mm-town-${s.id}`)
          .absolute()
          .left(cx - w * 0.7)
          .top(cy - h * 0.7)
          .w(w * 1.4)
          .h(h * 1.4)
          .tooltip(`${s.name}${s.machine ? ` (realm ${s.machine})` : ""}: ${s.tabs.length} building${s.tabs.length === 1 ? "" : "s"}, ${list.length} unit${list.length === 1 ? "" : "s"}. Click to select`)
          .on_click((e) => {
            if (e.modifiers?.shift && commandMode()) return setShared("empires.selected", list.map((a) => a.address));
            run("space.select", { id: s.id });
          }),
      ),
    );
    return el;
  }

  ring(u, all) {
    // Above RING_THRESHOLD spaces: a wrapping row of banners, one per town.
    return h_flex()
      .flex_wrap()
      .gap(u(3))
      .p(u(4))
      .children(
        all.map((s, i) =>
          own(
            div()
              .id(`mm-banner-${s.id}`)
              .flex_none()
              .w(u(12))
              .h(u(16))
              .bg(playerColor(s.id, i, shared("space.colors")))
              .border(u(1))
              .border_color(s.active ? C.goldBright : s.status === "blocked" ? C.blocked : C.stone.dark)
              .tooltip(`${s.name}: ${s.status ?? "quiet"}`)
              .on_click(() => run("space.select", { id: s.id })),
          ),
        ),
      );
  }

  render(_cx) {
    const u = unit();
    const all = spaces();
    const list = agents();
    const order = orderAgents(all, list);
    setAgentOrder(order);
    const f = focused();
    const idle = list.filter((a) => a.status === "idle" || a.status === "done").length;
    const blocked = list.filter((a) => a.status === "blocked").length;
    const mode = minimapMode(all.length);
    const W = u(MAP_W);
    const H = u(MAP_H);
    let map;
    if (mode === "ring") map = this.ring(u, all);
    else if (!all.length) map = div().w(W).h(H).flex().items_center().justify_center().text_color(C.textDim).child("uncharted lands");
    else {
      const ts = territories(all);
      map = div().relative().flex_none().w(W).h(H).children(ts.map((t, i) => this.territory(u, t, all[i], i, order)));
    }
    const bar = h_flex()
      .flex_none()
      .items_center()
      .gap(u(4))
      .child(
        button(u, "mm-idle", h_flex().items_center().gap(u(3)).child(glyph(u, "idle", 12, C.text)).child(div().child(`idle ${idle}`)), () => {
          const a = nextIdle(list, order, f?.agent ?? f?.terminal ?? null);
          if (a) run("agent.focus", { terminal: a.address });
        }, { h: 20, pad: [0, 5], disabled: !idle, tooltip: `${idle} idle or finished unit${idle === 1 ? "" : "s"}: click to cycle (Alt+.)` }),
      )
      .child(
        button(u, "mm-alarm", h_flex().items_center().gap(u(3)).child(glyph(u, "swords", 12, blocked ? C.blocked : C.text)).child(div().text_color(blocked ? C.blocked : C.text).child(`${blocked}`)), () => {
          const a = nextBlocked(list, order, f?.agent ?? f?.terminal ?? null);
          if (a) run("agent.focus", { terminal: a.address });
        }, { h: 20, pad: [0, 5], disabled: !blocked, tooltip: `${blocked} unit${blocked === 1 ? "" : "s"} under attack (waiting for you): click to go to the next (Alt+,)` }),
      );
    return root(u, div().id("minimap").size_full().flex().flex_col()).child(
      stone(u, v_flex().size_full().items_center().justify_between().py(u(4)).child(map).child(bar), { kind: "panel" }),
    );
  }
}
