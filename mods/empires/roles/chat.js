// The unit chat (SPEC §18.1): clicking a unit on the world opens a small window with that
// agent's live terminal under a title bar, so you can read and answer it in place.
//
//   every chat       a window: drag it by its title bar; Herdr remembers where it was left
//   unpinned         a press anywhere outside it closes it (like a popup)
//   pinned           stays open until ×
//   full             fills the Herdr window; Restore goes back
//   corner grip      drag to resize (the `chatgrip` and `resizer` roles below)
//
// Resizing: Herdr overlays have a fixed size once open, and an element only hears pointer
// moves while the pointer is over it, so a drag that leaves the chat would go deaf. A press
// on the grip therefore opens a transparent window over the whole app (`resizer`) that hears
// every move, draws the new outline, and on release reopens the chat at that size in place
// (same window key). Esc goes to the terminal, so the bar has its own ×.

import { div, PathBuilder } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, props, run, openOverlay, closeOverlay } from "herdr";
import { C, FONT_SC, DISPLAY, unit, root, statusBadge, zoom } from "../kit.js";
import { setView } from "./views.js";

export const CHAT_DEFAULT = { w: 620, h: 400 };
export const CHAT_MIN = { w: 320, h: 180 };
const BAR = 28;
const GRIP = 16;

/** Clamps a chat size (logical px) to the minimum. */
export function chatSize(w, h) {
  return { w: Math.max(CHAT_MIN.w, Math.round(Number(w) || CHAT_DEFAULT.w)), h: Math.max(CHAT_MIN.h, Math.round(Number(h) || CHAT_DEFAULT.h)) };
}

/** Is a window-px point inside a chat whose title bar has `bounds` and whose height is `h`? */
export function insideChat(pos, bounds, h) {
  if (!pos || !bounds) return true; // unknown: never close by mistake
  return pos.x >= bounds.x && pos.x <= bounds.x + bounds.width && pos.y >= bounds.y && pos.y <= bounds.y + h;
}

/** The overlay spec for a chat, exported for tests and reuse. o: { w, h, pinned, full, at }. */
export function chatSpec(address, name, o = {}) {
  const { w, h } = chatSize(o.w, o.h);
  const full = Boolean(o.full);
  const state = { w, h, pinned: Boolean(o.pinned), full, at: o.at ?? null };
  const children = [
    { type: "block", size: { px: BAR }, content: { mod: "empires", props: { role: "chatbar", terminal: address, name, ...state } } },
    { type: "block", content: { terminal: address } },
  ];
  if (!full) children.push({ type: "block", size: { px: GRIP }, content: { mod: "empires", props: { role: "chatgrip", terminal: address, name, ...state } } });
  const spec = {
    kind: "window",
    // One key per unit: reopening (pin, full, resize) replaces the chat in its place.
    key: `chat-${address}`,
    frame: "none",
    width: full ? 1 : w / zoom(),
    height: full ? 1 : h / zoom(),
    layout: { type: "column", border: { width: 2, color: C.gold }, background: C.wood.dark, children },
  };
  if (full) spec.at = { x: 0, y: 0 };
  else if (o.at) spec.at = o.at;
  return spec;
}

/** Opens (or replaces) a unit's chat; returns the overlay id. */
export function openUnitChat(address, name, o = {}) {
  const id = openOverlay(chatSpec(address, name, o));
  // Give the chat's terminal the keyboard: pane.focus {terminal} prefers a visible layout
  // terminal block showing that address, which is the chat's.
  run("pane.focus", { terminal: address });
  return id;
}

function stateOf(p) {
  return { ...chatSize(p.w, p.h), pinned: Boolean(p.pinned), full: Boolean(p.full), at: p.at ?? null };
}

/** The chat's title bar: title, Pin, Full, Pane, ×. Presses on it drag the window. */
export default class ChatBar {
  init() {
    this.bounds = null;
  }

  render(_cx) {
    const u = unit();
    const p = props() ?? {};
    const a = agents().find((x) => x.address === p.terminal);
    const status = a?.status ?? null;
    const state = stateOf(p);
    const reopen = (change) => openUnitChat(p.terminal, p.name, { ...state, ...change });
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
        .when(!state.full, (el) => el.cursor_grab())
        .on_mouse_down("left", (e) => {
          if (e.bounds) this.bounds = e.bounds;
        })
        // Unpinned: a press anywhere outside the whole chat closes it, like a popup. The
        // bar's own bounds plus the chat's height give the chat's rectangle.
        .on_mouse_down_out((e) => {
          if (e.bounds) this.bounds = e.bounds;
          if (state.pinned || state.full) return;
          if (!insideChat(e.position, e.bounds ?? this.bounds, state.h)) closeOverlay(p.overlay);
        }),
    )
      // statusBadge has nothing for idle: only add it when there is one (child(null) throws).
      .when(Boolean(statusBadge(u, status, 12)), (el) => el.child(statusBadge(u, status, 12)))
      .child(div().id("chat-title").flex_1().min_w(0).truncate().font_family(DISPLAY).text_size(u(12)).text_color(C.text).tooltip(state.pinned ? "Drag to move. Pinned: stays open" : "Drag to move. A click outside closes it; Pin to keep it").child(title))
      .child(btn("pin", state.pinned ? "Pinned" : "Pin", state.pinned ? "Unpin: close again on a click outside" : "Pin: keep it open", () => reopen({ pinned: !state.pinned }), { on: state.pinned }))
      .child(btn("full", state.full ? "Restore" : "Full", state.full ? "Back to the window" : "Fill the Herdr window", () => reopen({ full: !state.full })))
      .child(btn("pane", "Pane", "Go to this unit's own pane (Terminals view)", () => {
        closeOverlay(p.overlay);
        setView("terminals");
        run("agent.focus", { terminal: p.terminal });
      }))
      .child(btn("close", "×", "Close", () => closeOverlay(p.overlay)));
  }
}

/** The strip along the chat's bottom edge, with the resize mark in its right corner. */
export class ChatGrip {
  init() {}

  render(_cx) {
    const u = unit();
    const p = props() ?? {};
    const state = stateOf(p);
    // A gold corner triangle with ridges: the resize mark, readable at a glance.
    const ticks = div()
      .relative()
      .w(u(GRIP))
      .h(u(GRIP))
      .child(window.paint_path(PathBuilder.fill().move_to("100%", "0%").line_to("100%", "100%").line_to("0%", "100%").close().build(), C.goldBright).absolute().top(0).left(0).size_full())
      .children([4, 8, 12].map((d) => window.paint_path(PathBuilder.stroke(1.2).move_to(`${100 - d * 6}%`, "100%").line_to("100%", `${100 - d * 6}%`).build(), C.wood.dark).absolute().top(0).left(0).size_full()));
    const grip = div()
      .id("chat-grip")
      .flex_none()
      .w(u(GRIP + 6))
      .h_full()
      .flex()
      .items_end()
      .justify_end()
      .cursor_nwse_resize()
      .tooltip("Drag to resize")
      .on_mouse_down("left", (e, cx) => {
        cx.stop_propagation(); // not a window drag
        const b = e.bounds;
        if (!b) return;
        // The chat's top-left corner, from the grip's bottom-right and the chat's size.
        const origin = { x: Math.round(b.x + b.width - state.w), y: Math.round(b.y + b.height - state.h) };
        openOverlay({
          mod: "empires",
          kind: "window",
          frame: "none",
          width: 1,
          height: 1,
          at: { x: 0, y: 0 },
          props: { role: "resizer", terminal: p.terminal, name: p.name, state, origin, grab: { x: b.x + b.width - e.position.x, y: b.y + b.height - e.position.y }, start: e.position },
        });
      })
      .child(ticks);
    return root(u, h_flex().id("chatgrip").size_full().bg(C.wood.mid).border_t(u(1)).border_color("#00000060")).child(div().flex_1()).child(grip);
  }
}

/** A transparent full-window layer during a resize drag: hears every move, draws the outline,
 *  and on release reopens the chat at the new size in place. */
export class Resizer {
  init() {
    const p = props() ?? {};
    this.cur = p.start ?? null;
    this.done = false;
  }

  size() {
    const p = props() ?? {};
    const g = p.grab ?? { x: 0, y: 0 };
    if (!this.cur || !p.origin) return chatSize(p.state?.w, p.state?.h);
    return chatSize(this.cur.x + g.x - p.origin.x, this.cur.y + g.y - p.origin.y);
  }

  finish() {
    if (this.done) return;
    this.done = true;
    const p = props() ?? {};
    const { w, h } = this.size();
    closeOverlay(p.overlay);
    openUnitChat(p.terminal, p.name, { ...(p.state ?? {}), w, h, full: false, at: p.origin });
  }

  render(_cx) {
    const u = unit();
    const p = props() ?? {};
    const { w, h } = this.size();
    const o = p.origin ?? { x: 0, y: 0 };
    return root(
      u,
      div()
        .id("resizer")
        .size_full()
        .relative()
        .cursor_nwse_resize()
        .on_mouse_move((e, cx) => {
          this.cur = e.position;
          cx.notify();
        })
        .on_mouse_up("left", (_e) => this.finish())
        // A release that went elsewhere: the next press ends the resize too.
        .on_mouse_down("left", (e, cx) => {
          cx.stop_propagation();
          this.cur = e.position;
          this.finish();
        }),
    ).child(
      div()
        .absolute()
        .left(o.x)
        .top(o.y)
        .w(w)
        .h(h)
        .border(2)
        .border_color(C.goldBright)
        .bg("#ecc95a18")
        .flex()
        .items_end()
        .justify_end()
        .child(div().m(u(6)).px(u(5)).rounded(u(3)).bg("#1f1c17d0").text_color(C.text).font_family(FONT_SC).text_size(u(11)).child(`${w} × ${h}`)),
    );
  }
}
