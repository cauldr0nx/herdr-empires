// The selected-unit panel (SPEC §6.4): the focused pane as a unit card
// (portrait, name, location, status bar, tab position, workers), a mod pane's
// title, or, nothing focused, the town overview of the active space (tabs as
// buildings with status badges; click = tab.select).

import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, panes, terminals, focused, run, home, shared, setShared, agents } from "herdr";
import { C, ASSETS, FONT_SC, unit, root, stone, heading, programIcon, statusBar, statusBadge, label, own, glyph } from "../kit.js";
import { unitName, placeName, tabLabel, locationLine, townAlias, tabPosition, subAgents, isAgentPane, elapsed, playerColor, selectedUnits, nameTargets, toggleSelected } from "../data.js";
import { queueLine, commandMode } from "./queue.js";

const BUILDING = (t) => (t.status === "blocked" ? "tower" : t.settled ? "garrison" : "house");

export default class Selection {
  init(_p, cx) {
    this.now = Date.now();
    // The elapsed time on a working unit's card: a gentle data tick, only while one is working.
    cx?.timer?.every(5000, (cx) => {
      if (agents().some((a) => a.status === "working")) cx.notify();
    });
  }

  worker(u, t) {
    return own(
      div()
        .id(`worker-${t.address}`)
        .flex_none()
        .tooltip(`Worker ${t.name || t.address}${t.status ? ` (${t.status})` : ""}: click to peek`)
        .on_click(() => run("terminal.peek", { terminal: t.address }))
        .child(programIcon(u, t.program, 18)),
    );
  }

  unitCard(u, p, town) {
    const agent = isAgentPane(p);
    const status = agent ? p.status : null;
    const workers = p.terminal ? subAgents(terminals(), p.terminal) : [];
    const tab = town?.tab;
    const since = tab?.working_since;
    // Hide names: only a made-up town name, no folder or branch.
    const where = shared("empires.hideNames") === true ? (town?.space ? townAlias(town.space.id, shared("empires.townSlots")) : "") : locationLine(town?.space?.name, placeName(p.cwd, home()), p.branch);
    const color = town ? playerColor(town.space.id, town.index, shared("space.colors")) : C.idle;
    return h_flex()
      .size_full()
      .items_center()
      .gap(u(10))
      .px(u(10))
      .child(
        div()
          .relative()
          .flex_none()
          .child(programIcon(u, p.program, 56, { gold: true }))
          .child(div().absolute().left(u(-3)).top(u(-3)).w(u(10)).h(u(10)).bg(color).border(u(1)).border_color(C.stone.dark)),
      )
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .gap(u(2))
          .child(h_flex().items_center().gap(u(6)).child(heading(u, unitName(p), { size: 13 })).child(div().truncate().text_color(C.textDim).child(tabLabel(tab) && shared("empires.hideNames") !== true ? `“${tabLabel(tab)}”` : "")))
          .child(div().truncate().text_size(u(12)).text_color(C.text).child(where || "—"))
          .when(Boolean(status), (el) =>
            el.child(
              h_flex()
                .items_center()
                .gap(u(6))
                .child(statusBar(u, status, { w: 90, h: 8 }))
                .when(Boolean(statusBadge(u, status, 12)), (e2) => e2.child(statusBadge(u, status, 12)))
                .child(div().text_size(u(11.5)).text_color(status === "blocked" ? C.blocked : status === "done" ? C.done : C.textDim).child(status === "working" && since ? `gathering ${elapsed(this.now - since)}` : status === "blocked" ? "under attack: needs you" : status === "done" ? "task complete" : "idle")),
            ),
          )
          .when(!status, (el) => el.child(div().text_size(u(11.5)).text_color(C.textDim).child(p.program?.shell ? "worker (shell)" : "program")))
          .child(
            h_flex()
              .items_center()
              .gap(u(8))
              .child(div().text_size(u(11)).font_family(FONT_SC).text_color(C.textDim).child(town ? tabPosition(town.space, p.tab) : ""))
              .when(workers.length > 0, (el) => el.child(div().text_size(u(11)).text_color(C.textDim).child(`${workers.length} worker${workers.length === 1 ? "" : "s"}:`)).child(h_flex().gap(u(3)).children(workers.slice(0, 8).map((t) => this.worker(u, t)))))
              .child(queueLine(u, town?.space)),
          ),
      );
  }

  town(u, space, index) {
    if (!space) return v_flex().size_full().items_center().justify_center().child(div().text_color(C.textDim).child("No town. Found one with the command card."));
    const color = playerColor(space.id, index, shared("space.colors"));
    const buildings = space.tabs.map((t) => {
      const badge = statusBadge(u, t.status, 10);
      return own(
        v_flex()
          .id(`bld-${t.id}`)
          .flex_none()
          .w(u(54))
          .items_center()
          .gap(u(2))
          .rounded(u(2))
          .hover((s) => s.bg("#ffffff14"))
          .tooltip(`${t.name}${t.status ? ` (${t.status})` : ""}${t.settled ? ", garrisoned" : ""}: click to select${commandMode() ? "; shift-click to add its units to the selection" : ""}`)
          .on_click((e) => {
            if (e.modifiers?.shift && commandMode()) {
              let sel = shared("empires.selected");
              for (const a of agents().filter((a) => a.tab === t.id)) sel = toggleSelected(sel, a.address);
              return setShared("empires.selected", sel);
            }
            run("tab.select", { id: t.id });
          })
          .child(div().relative().child(image(`${ASSETS}/img/${BUILDING(t)}.svg`).flex_none().w(u(32)).h(u(32))).when(Boolean(badge), (el) => el.child(div().absolute().right(u(-4)).top(u(-4)).child(badge))))
          .child(div().max_w(u(52)).truncate().text_size(u(11)).text_color(t.active ? C.goldBright : C.text).child(t.name)),
      );
    });
    return v_flex()
      .size_full()
      .px(u(10))
      .py(u(6))
      .gap(u(4))
      .child(
        h_flex()
          .items_center()
          .gap(u(6))
          .child(div().w(u(10)).h(u(10)).bg(color).border(u(1)).border_color(C.stone.dark))
          .child(heading(u, shared("empires.hideNames") === true ? townAlias(space.id, shared("empires.townSlots")) : space.name, { size: 13 }))
          .child(div().text_color(C.textDim).text_size(u(11.5)).child([space.machine ? `realm ${space.machine}` : null, space.branch].filter(Boolean).join(" · ")))
          .child(div().flex_1())
          .child(div().text_size(u(11)).font_family(FONT_SC).text_color(C.textDim).child(`${space.tabs.length} building${space.tabs.length === 1 ? "" : "s"}`)),
      )
      .child(h_flex().flex_1().min_h(0).items_start().gap(u(4)).overflow_x_scroll().children(buildings))
      .child(queueLine(u, space));
  }

  /** Several units selected (Phase 2): the army card. */
  armyCard(u, sel) {
    const list = agents().filter((a) => sel.includes(a.address));
    return v_flex()
      .size_full()
      .px(u(10))
      .py(u(6))
      .gap(u(4))
      .child(h_flex().items_center().gap(u(6)).child(heading(u, `${list.length} units selected`, { size: 13 })).child(div().flex_1()).child(own(div().id("sel-clear").text_size(u(11)).text_color(C.textDim).hover((s) => s.text_color(C.goldBright)).on_click(() => setShared("empires.selected", [])).child("clear (click a unit)"))))
      .child(
        h_flex()
          .flex_wrap()
          .gap(u(4))
          .children(
            list.map((a) =>
              own(
                h_flex()
                  .id(`sel-${a.address}`)
                  .items_center()
                  .gap(u(4))
                  .px(u(4))
                  .h(u(22))
                  .rounded(u(2))
                  .border(u(1))
                  .border_color(C.gold)
                  .tooltip(`${a.program?.name ?? "Unit"} in ${a.space_name} / ${a.tab_name}: ${a.status}. Click to go there`)
                  .on_click(() => run("agent.focus", { terminal: a.address }))
                  .child(programIcon(u, a.program, 16))
                  .child(div().text_size(u(11)).text_color(C.text).child(shared("empires.hideNames") === true ? townAlias(a.space, shared("empires.townSlots")) : `${a.space_name}/${a.tab_name}`))
                  .when(Boolean(statusBadge(u, a.status, 10)), (el) => el.child(statusBadge(u, a.status, 10))),
              ),
            ),
          ),
      )
      .child(div().text_size(u(11)).text_color(C.textDim).child("Orders on the command card apply to all of them: Send, Stop, Disband (each confirms and names them)."));
  }

  render(_cx) {
    this.now = Date.now();
    const u = unit();
    const f = focused();
    const p = f?.pane ? panes().find((x) => x.pane === f.pane) : null;
    const all = spaces();
    let body;
    const sel = commandMode() ? selectedUnits(agents(), shared("empires.selected"), null) : [];
    if (sel.length > 1) body = this.armyCard(u, sel);
    else if (p && !p.mod) {
      const i = all.findIndex((s) => s.tabs.some((t) => t.id === p.tab));
      const town = i < 0 ? null : { space: all[i], index: i, tab: all[i].tabs.find((t) => t.id === p.tab) };
      body = this.unitCard(u, p, town);
    } else if (p?.mod) {
      body = h_flex().size_full().items_center().gap(u(10)).px(u(10)).child(glyph(u, "chronicle", 32, C.textDim)).child(v_flex().child(heading(u, p.title || p.mod)).child(div().text_color(C.textDim).child("a scroll (mod pane)")));
    } else {
      const i = all.findIndex((s) => s.active);
      body = this.town(u, i < 0 ? null : all[i], i);
    }
    return root(u, div().id("selection").size_full().flex().flex_col()).child(stone(u, body));
  }
}
