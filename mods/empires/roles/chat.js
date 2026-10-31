// The unit chat (SPEC §18.1): clicking a unit on the world opens a small popup with that
// agent's live terminal under a title bar, so you can read and answer it in place. A click
// anywhere beside the popup closes it (Herdr's popup behaviour); Esc goes to the terminal,
// so the bar has its own close button. "Open" shows the agent's own pane instead.
//
// openUnitChat() builds the overlay; the `chatbar` role draws its title bar.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, props, run, openOverlay, closeOverlay, shared } from "herdr";
import { C, FONT_SC, DISPLAY, unit, root, own, statusBadge, zoom } from "../kit.js";

const W = 600;
const H = 380;
const BAR = 28;

/** Opens the chat popup for one agent (terminal address) near the pointer; returns its id. */
export function openUnitChat(address, name) {
  const id = openOverlay({
    kind: "popup",
    width: W / zoom(),
    height: H / zoom(),
    layout: {
      type: "column",
      children: [
        { type: "block", size: { px: BAR }, content: { mod: "empires", props: { role: "chatbar", terminal: address, name } } },
        { type: "block", content: { terminal: address } },
      ],
    },
  });
  // Give the popup's terminal the keyboard: pane.focus {terminal} prefers a visible layout
  // terminal block showing that address, which is the popup's.
  run("pane.focus", { terminal: address });
  return id;
}

export default class ChatBar {
  init() {}

  render(_cx) {
    const u = unit();
    const p = props() ?? {};
    const a = agents().find((x) => x.address === p.terminal);
    const status = a?.status ?? null;
    const close = () => closeOverlay(p.overlay);
    const btn = (id, text, tip, fn) =>
      own(
        div()
          .id(`chat-${id}`)
          .px(u(7))
          .py(u(1))
          .rounded(u(3))
          .cursor_pointer()
          .bg("#00000040")
          .hover((s) => s.bg(C.gold).text_color("#1f1c17"))
          .font_family(FONT_SC)
          .text_size(u(11))
          .tooltip(tip)
          .on_click(() => fn())
          .child(text),
      );
    return root(
      u,
      h_flex()
        .id("chatbar")
        .size_full()
        .px(u(8))
        .gap(u(6))
        .items_center()
        .bg(C.wood.mid)
        .border_b(u(2))
        .border_color(C.gold),
    )
      .when(Boolean(status), (el) => el.child(statusBadge(u, status, 12)))
      .child(div().flex_1().min_w(0).truncate().font_family(DISPLAY).text_size(u(12)).text_color(C.text).child(`${p.name ?? a?.program?.name ?? "Unit"}${a ? ` · ${a.space_name}` : ""}${status === "blocked" ? " · needs you" : ""}`))
      .child(btn("open", "Open", "Show this unit's own pane", () => {
        close();
        run("agent.focus", { terminal: p.terminal });
      }))
      .child(btn("close", "×", "Close (or click anywhere outside)", close));
  }
}
