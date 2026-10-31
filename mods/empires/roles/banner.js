// A pane's header (SPEC §6.2). Skeleton: title + buttons; built out in M1.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, home } from "herdr";
import { C, unit, root, plank, control, label } from "../kit.js";
import { paneTitle } from "../data.js";

export default class Banner {
  init() {}
  render(_cx) {
    const u = unit();
    const id = props()?.pane;
    const p = panes().find((x) => x.pane === id);
    const bar = h_flex()
      .id(`banner-${id ?? "none"}`)
      .size_full()
      .items_center()
      .px(u(6))
      .gap(u(6))
      .on_click((e) => {
        if (e.click_count >= 2) run("pane.zoom", { pane: id });
        else run("pane.focus", { pane: id });
      })
      .child(label(paneTitle(p, home()), { bold: true, truncate: true }).flex_1().min_w(0))
      .child(control(u, `pb-settle-${id}`, "garrison", () => run("tab.settle", { id: p?.tab }), "Garrison (settle tab)"))
      .child(control(u, `pb-zoom-${id}`, "zoom", () => run("pane.zoom", { pane: id }), p?.zoomed ? "Restore" : "Zoom"))
      .child(control(u, `pb-close-${id}`, "close", () => run("pane.close", { pane: id }), "Close"));
    return root(u, div().size_full().flex().flex_col()).child(plank(u, bar, { full: true }));
  }
}
