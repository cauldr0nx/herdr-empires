// The unit chat (SPEC §18.1): clicking a unit on the world opens a small popup with that
// agent's live terminal under a title bar, so you can read and answer it in place.
//
//   popup (default)  a click anywhere beside it closes it (Herdr's popup behaviour)
//   pinned           a window: stays open, dragged by its title bar, remembers its spot
//   full             fills the Herdr window; again to go back
//   − / +            three sizes; the overlay is reopened in place at the new size
//
// Herdr overlays have a fixed size once open, and a press on a drag corner stops reporting
// moves once the pointer leaves the overlay, so sizes are steps (reopen in place with the
// same window key) rather than a free drag. Esc goes to the terminal, so the bar has ×.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, props, run, openOverlay, closeOverlay } from "herdr";
import { C, FONT_SC, DISPLAY, unit, root, statusBadge, zoom } from "../kit.js";
import { setView } from "./views.js";

export const CHAT_SIZES = { s: [460, 300], m: [620, 400], l: [920, 580] };
const BAR = 28;

/** The overlay spec for a chat (pure apart from zoom), exported for tests and reuse. */
export function chatSpec(address, name, o = {}) {
  const size = CHAT_SIZES[o.size] ? o.size : "m";
  const pinned = Boolean(o.pinned);
  const full = Boolean(o.full);
  const [w, h] = CHAT_SIZES[size];
  const spec = {
    kind: pinned ? "window" : "popup",
    frame: "none",
    width: full ? 1 : w / zoom(),
    height: full ? 1 : h / zoom(),
    layout: {
      type: "column",
      border: { width: 2, color: C.gold },
      background: C.wood.dark,
      children: [
        { type: "block", size: { px: BAR }, content: { mod: "empires", props: { role: "chatbar", terminal: address, name, size, pinned, full, at: o.at ?? null } } },
        { type: "block", content: { terminal: address } },
      ],
    },
  };
  // A pinned chat is a window with a key: reopening it (resize, full) replaces it in place,
  // and Herdr remembers where it was dropped.
  if (pinned) spec.key = `chat-${address}`;
  if (full) spec.at = { x: 0, y: 0 };
  else if (o.at) spec.at = o.at;
  return spec;
}

/** Opens a unit's chat; returns the overlay id. o: { size, pinned, full, at }. */
export function openUnitChat(address, name, o = {}) {
  const id = openOverlay(chatSpec(address, name, o));
  // Give the chat's terminal the keyboard: pane.focus {terminal} prefers a visible layout
  // terminal block showing that address, which is the chat's.
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
    const state = { size: p.size ?? "m", pinned: Boolean(p.pinned), full: Boolean(p.full), at: p.at ?? null };
    const reopen = (change) => {
      const next = { ...state, ...change };
      // A popup has no key to replace in place: close it first. A window with the same key is
      // replaced by Herdr itself, in its place.
      if (!state.pinned || !next.pinned) closeOverlay(p.overlay);
      openUnitChat(p.terminal, p.name, next);
    };
    const sizes = ["s", "m", "l"];
    const step = (d) => sizes[Math.max(0, Math.min(2, sizes.indexOf(state.size) + d))];
    const btn = (id, text, tip, fn, o = {}) =>
      div()
        .id(`chat-${id}`)
        .flex_none()
        .px(u(6))
        .py(u(1))
        .rounded(u(3))
        .cursor_pointer()
        .bg(o.on ? C.gold : "#00000040")
        .text_color(o.on ? "#1f1c17" : C.text)
        .when(Boolean(o.dim), (el) => el.opacity(0.4))
        .hover((s) => s.bg(C.goldBright).text_color("#1f1c17"))
        .font_family(FONT_SC)
        .text_size(u(11))
        .tooltip(tip)
        // A press on a button is the button's, not a window drag.
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => fn())
        .child(text);
    const title = `${p.name ?? a?.program?.name ?? "Unit"}${a ? ` · ${a.space_name}` : ""}${status === "blocked" ? " · needs you" : ""}`;
    return root(
      u,
      h_flex()
        .id("chatbar")
        .size_full()
        .px(u(8))
        .gap(u(4))
        .items_center()
        .bg(C.wood.mid)
        .border_b(u(2))
        .border_color(C.gold)
        .when(state.pinned && !state.full, (el) => el.cursor_grab()),
    )
      .when(Boolean(status), (el) => el.child(statusBadge(u, status, 12)))
      .child(div().id("chat-title").flex_1().min_w(0).truncate().font_family(DISPLAY).text_size(u(12)).text_color(C.text).tooltip(state.pinned ? "Drag here to move" : "Click outside to close; Pin to keep it").child(title))
      .when(!state.full, (el) =>
        el
          .child(btn("smaller", "−", "Smaller", () => reopen({ size: step(-1) }), { dim: state.size === "s" }))
          .child(btn("bigger", "+", "Bigger", () => reopen({ size: step(1) }), { dim: state.size === "l" })),
      )
      .child(btn("pin", state.pinned ? "Pinned" : "Pin", state.pinned ? "Unpin: close again on a click outside" : "Pin: keep it open, drag it by this bar", () => reopen({ pinned: !state.pinned, full: false }), { on: state.pinned }))
      .child(btn("full", state.full ? "Restore" : "Full", state.full ? "Back to the small window" : "Fill the Herdr window", () => reopen({ full: !state.full })))
      .child(btn("pane", "Pane", "Go to this unit's own pane (Terminals view)", () => {
        closeOverlay(p.overlay);
        setView("terminals");
        run("agent.focus", { terminal: p.terminal });
      }))
      .child(btn("close", "×", "Close", () => closeOverlay(p.overlay)));
  }
}
