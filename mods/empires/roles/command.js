// The command card (SPEC §6.3): a 3×5 grid of stone buttons with glyphs, the
// hotkey letter in the corner and a tooltip. Context-sensitive on the focused
// pane. Phase 2 (shared "empires.command") swaps in unit orders (§14.4).

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, agents, panes, focused, run, keys, shared, openOverlay, pickFolder } from "herdr";
import { C, unit, root, stone, button, glyph, openDialog, sfx, calm } from "../kit.js";
import { orderAgents, nextIdle, nextBlocked } from "../data.js";
import { orders } from "./orders.js";

/** The key bound to an action, for the corner letter and the tooltip. */
function keyFor(action, section) {
  const k = keys().find((b) => (b.section === section || b.section === "global") && b.action === action);
  return k ? k.keys : "";
}

export default class Command {
  init() {}

  slots() {
    const f = focused();
    const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
    const space = spaces().find((s) => s.active) ?? null;
    const tab = space?.tabs.find((t) => t.active) ?? null;
    const order = () => orderAgents(spaces(), agents());
    const K = (a) => keyFor(a, "layout:empires");
    const goIdle = () => {
      const a = nextIdle(agents(), order(), f?.agent ?? f?.terminal ?? null);
      if (a) run("agent.focus", { terminal: a.address });
    };
    const goAlarm = () => {
      const a = nextBlocked(agents(), order(), f?.agent ?? f?.terminal ?? null);
      if (a) run("agent.focus", { terminal: a.address });
    };
    const blocked = agents().filter((a) => a.status === "blocked").length;
    const idle = agents().filter((a) => a.status === "idle" || a.status === "done").length;
    return [
      { id: "train", glyph: "train", name: "Train", key: K("empires.train") || "Alt+T", hot: "T", act: () => openDialog("train", { title: "Train a unit", space: space?.id ?? null }) },
      { id: "build", glyph: "build", name: "Build (new shell tab)", key: K("tab.new") || "Ctrl+Shift+T", hot: "B", act: () => run("tab.new", space ? { space: space.id } : {}) },
      { id: "split-right", glyph: "split-right", name: "Split right", key: K("pane.split:right"), hot: "O", disabled: !pane, act: () => run("pane.split", { direction: "right", pane: pane.pane }) },
      { id: "split-down", glyph: "split-down", name: "Split down", key: K("pane.split:down"), hot: "E", disabled: !pane, act: () => run("pane.split", { direction: "down", pane: pane.pane }) },
      { id: "zoom", glyph: pane?.zoomed ? "unzoom" : "zoom", name: pane?.zoomed ? "Restore" : "Zoom", key: K("pane.zoom"), hot: "Z", disabled: !pane, act: () => run("pane.zoom", { pane: pane.pane }) },
      { id: "garrison", glyph: "garrison", name: "Garrison (settle tab)", key: K("empires.garrison") || "Alt+G", hot: "G", disabled: !tab, act: () => run("tab.settle", { id: tab.id }) },
      { id: "rename", glyph: "rename", name: pane ? "Rename building (tab)" : "Rename town (space)", key: K(pane ? "tab.rename" : "space.rename"), hot: "N", disabled: !tab && !space, act: () =>
          pane && tab
            ? openDialog("prompt", { title: "Rename building", text: "A new name for this tab:", value: tab.named ? tab.name : "", command: { name: "tab.rename", args: { id: tab.id } } })
            : openDialog("prompt", { title: "Rename town", text: "A new name for this space:", value: space?.named ? space.name : "", command: { name: "space.rename", args: { id: space?.id } } }) },
      { id: "found", glyph: "found", name: "Found a town (new space)", key: K("space.new"), hot: "F", act: (_e, cx) => cx.spawn(async () => {
          const folder = await pickFolder({ prompt: "Found here" });
          if (folder) run("space.new", { folder });
        }) },
      { id: "worktree", glyph: "worktree", name: "Worktree (new/open worktree town)", key: "", hot: "W", disabled: !space, act: () => openOverlay({ mod: "worktree", kind: "dialog", width: 440, height: 260, props: { space: space.id, action: "new" } }) },
      { id: "idle", glyph: "idle", name: `Idle unit (${idle})`, key: K("empires.idle") || "Alt+.", hot: ".", disabled: !idle, act: goIdle },
      { id: "bell", glyph: "bell", name: `Town bell: next unit under attack (${blocked})`, key: K("empires.alarm") || "Alt+,", hot: ",", disabled: !blocked, alert: blocked > 0, act: goAlarm },
      { id: "techtree", glyph: "techtree", name: "Tech tree (keys)", key: K("empires.techtree") || "F1", hot: "?", act: () => openDialog("techtree", { title: "Tech tree" }) },
      { id: "close", glyph: "close", name: "Close unit (pane)", key: K("pane.close"), hot: "X", disabled: !pane, act: () => run("pane.close", { pane: pane.pane }) },
      { id: "chronicle", glyph: "chronicle", name: "Chronicle", key: "", hot: "C", act: () => openDialog("chronicle", { title: "Chronicle" }) },
      { id: "options", glyph: "options", name: "Options", key: "", hot: "P", act: () => openDialog("options", { title: "Options" }) },
    ];
  }

  slot(u, s, w, h) {
    if (!s) return div().w(u(w)).h(u(h));
    const face = v_flex().items_center().justify_center().gap(u(1)).child(glyph(u, s.glyph, 18, s.disabled ? C.stone.hi : s.alert ? C.blocked : C.text));
    let b = button(u, `cmd-${s.id}`, face, (e, cx) => s.act(e, cx), {
      w,
      h,
      pad: [0, 0],
      disabled: Boolean(s.disabled),
      hotkey: s.hot,
      tooltip: `${s.name}${s.key ? ` (${s.key})` : ""}`,
    }).flex_none();
    if (s.alert && !calm()) b = b.loop("opacity", { from: 0.6, to: 1, period: 900 });
    return b;
  }

  render(_cx) {
    const u = unit();
    const list = shared("empires.command") === true && !calm() ? orders(this) : this.slots();
    const cols = 5;
    const w = 46;
    const h = 40;
    const rows = [];
    for (let r = 0; r < 3; r++) rows.push(h_flex().gap(u(3)).children(Array.from({ length: cols }, (_, c) => this.slot(u, list[r * cols + c], w, h))));
    return root(u, div().id("command").size_full().flex().flex_col()).child(
      stone(u, v_flex().size_full().items_center().justify_center().gap(u(3)).p(u(4)).children(rows)),
    );
  }
}
