// A pane's header, the banner (SPEC §6.2): a wooden plank with a pennant in the
// space's player colour, the unit portrait, `Program · place (branch)`, an
// HP-style status bar with the elapsed time, and stone buttons: garrison
// (settle), split right/down, zoom, close. Double-click zooms; right-click opens
// a parchment context menu. The layout draws gold trim around the focused pane.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, spaces, terminals, props, run, home, shared } from "herdr";
import { C, unit, root, plank, control, label, programIcon, pennant, statusBar, statusBadge, openMenu, sfx } from "../kit.js";
import { paneTitle, playerColor, elapsed, subAgents, isAgentPane } from "../data.js";

export default class Banner {
  init(_p, cx) {
    this.now = Date.now();
    this.last = "";
    // Data, not animation (SPEC §8 R4): every 5 s, redraw only when the elapsed time is
    // showing (a working agent) or the title moved on (a new branch or folder).
    cx?.timer?.every(5000, (cx) => {
      const p = this.me();
      if ((isAgentPane(p) && p.status === "working") || paneTitle(p, home()) !== this.last) cx.notify();
    });
  }

  me() {
    const id = props()?.pane;
    return panes().find((x) => x.pane === id) ?? null;
  }

  townOf(p) {
    if (!p) return null;
    const all = spaces();
    const i = all.findIndex((s) => s.tabs.some((t) => t.id === p.tab));
    return i < 0 ? null : { space: all[i], index: i, tab: all[i].tabs.find((t) => t.id === p.tab) };
  }

  contextMenu(p, id, town) {
    const subs = p?.terminal ? subAgents(terminals(), p.terminal) : [];
    return [
      { label: "&Garrison (settle tab)", icon: "garrison", act: { run: ["tab.settle", { id: p?.tab }] } },
      { label: "Split &right", icon: "split-right", shortcut: "Ctrl+Shift+O", act: { run: ["pane.split", { direction: "right", pane: id }] } },
      { label: "Split &down", icon: "split-down", shortcut: "Ctrl+Shift+E", act: { run: ["pane.split", { direction: "down", pane: id }] } },
      { label: p?.zoomed ? "&Unzoom" : "&Zoom", icon: p?.zoomed ? "unzoom" : "zoom", shortcut: "Ctrl+Shift+Z", act: { run: ["pane.zoom", { pane: id }] } },
      { sep: true },
      { label: "Re&name building (tab)...", icon: "rename", act: { dialog: { kind: "prompt", title: "Rename building", text: "A new name for this tab:", value: town?.tab?.name ?? "", command: { name: "tab.rename", args: { id: p?.tab } } } } },
      ...(subs.length ? [{ label: "&Workers", icon: "worker", sub: subs.map((t) => ({ label: `${t.name || t.address}${t.status ? ` (${t.status})` : ""}`, act: { run: ["terminal.peek", { terminal: t.address }] } })) }] : []),
      { sep: true },
      { label: "&Close unit", icon: "close", bold: true, shortcut: "Ctrl+Shift+X", act: { run: ["pane.close", { pane: id }] } },
    ];
  }

  render(_cx) {
    this.now = Date.now();
    const u = unit();
    const id = props()?.pane ?? null;
    const p = this.me();
    const town = this.townOf(p);
    const colors = shared("space.colors");
    const color = town ? playerColor(town.space.id, town.index, colors) : C.idle;
    const agent = isAgentPane(p);
    const status = agent ? p.status : null;
    const since = town?.tab?.working_since;
    const workers = p?.terminal ? subAgents(terminals(), p.terminal).length : 0;
    const focusedPane = Boolean(p?.focused);
    const title = paneTitle(p, home());
    this.last = title;

    const bar = h_flex()
      .id(`banner-${id ?? "none"}`)
      .size_full()
      .items_center()
      .pl(u(4))
      .pr(u(3))
      .gap(u(5))
      .on_click((e) => {
        if (e.click_count >= 2) run("pane.zoom", { pane: id });
        else run("pane.focus", { pane: id });
      })
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        sfx("knock");
        openMenu(this.contextMenu(p, id, town));
      })
      .child(pennant(u, color, 16))
      .child(programIcon(u, p?.program, 20, { gold: focusedPane }))
      .child(label(title, { bold: true, truncate: true, color: focusedPane ? C.goldBright : C.text }).flex_1().min_w(0).min_h(0))
      .when(Boolean(status), (el) =>
        el
          .child(statusBar(u, status, { w: 54, h: 7 }))
          .when(Boolean(statusBadge(u, status, 12)), (e2) => e2.child(statusBadge(u, status, 12)))
          .child(div().flex_none().text_size(u(11)).font_weight(600).text_color(status === "blocked" ? C.blocked : status === "done" ? C.done : C.textDim).child(status === "working" && since ? `gathering ${elapsed(this.now - since)}` : status === "blocked" ? "UNDER ATTACK" : status === "done" ? "task complete" : "idle")),
      )
      .when(workers > 0, (el) => el.child(div().id(`pb-workers-${id}`).flex_none().text_size(u(10.5)).text_color(C.textDim).tooltip(`${workers} worker${workers === 1 ? "" : "s"} (sub-agents) attached`).child(`⚒${workers}`)))
      .child(div().flex_none().w(u(1)).h(u(16)).bg(C.wood.dark))
      .child(control(u, `pb-settle-${id}`, "garrison", () => run("tab.settle", { id: p?.tab }), "Garrison: settle this tab (Alt+G)"))
      .child(control(u, `pb-right-${id}`, "split-right", () => run("pane.split", { direction: "right", pane: id }), "Split right"))
      .child(control(u, `pb-down-${id}`, "split-down", () => run("pane.split", { direction: "down", pane: id }), "Split down"))
      .child(control(u, `pb-zoom-${id}`, p?.zoomed ? "unzoom" : "zoom", () => run("pane.zoom", { pane: id }), p?.zoomed ? "Restore" : "Zoom"))
      .child(control(u, `pb-close-${id}`, "close", () => run("pane.close", { pane: id }), "Close unit"));

    let el = root(u, div().size_full().flex().flex_col()).child(plank(u, bar, { full: true }));
    if (focusedPane) el = el.border_b(u(1)).border_color(C.gold);
    return el;
  }
}
