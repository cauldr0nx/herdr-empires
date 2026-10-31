// A parchment popup menu (SPEC §6.7): props { items, parents, owner }. Hover
// opens submenus to the right; a choice closes the whole chain and acts.
// Item schema as Herdr 98: { label "&Train", icon, shortcut, act, sub,
// disabled, checked, radio, bold, sep }.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, closeOverlay, setShared, shared } from "herdr";
import { C, MENU, unit, root, label, glyph, perform, openMenu, scale, parchment, sfx } from "../kit.js";

function openMenus() {
  return Array.isArray(shared("empires.menus")) ? shared("empires.menus") : [];
}

/** Closes a submenu and every submenu opened from it. */
function closeTree(id) {
  const all = openMenus();
  const doomed = all.filter((m) => m.id === id || (m.parents ?? []).includes(id)).map((m) => m.id);
  if (!doomed.includes(id)) doomed.push(id);
  for (const d of doomed.reverse()) closeOverlay(d);
  setShared("empires.menus", all.filter((m) => !doomed.includes(m.id)));
}

export default class Menu {
  init(_p, cx) {
    this.at = -1;
    this.sub = null; // { id, index }
    this.focus = cx.focus_handle();
    this.focus.focus();
    const p = props() ?? {};
    this.owner = p.owner ?? null;
    if (this.owner) setShared("empires.menu.owner", this.owner);
    // A top menu starts the list over (menus closed by a click outside leave stale ids).
    setShared("empires.menus", (p.parents ?? []).length ? [...openMenus(), { id: p.overlay, parents: p.parents }] : []);
    // Escape is the app's (it closes the overlay before our key handler sees it): a binding of our own comes first.
    try {
      cx.bind_keys([{ keystroke: "escape", action: "empires_menu_escape", context: "EmpiresMenu" }]);
    } catch {}
  }

  escape() {
    if (this.sub) closeTree(this.sub.id);
    this.sub = null;
    closeOverlay(props()?.overlay ?? "");
    this.release();
  }

  release() {
    if (this.owner && shared("empires.menu.owner") === this.owner) setShared("empires.menu.owner", null);
  }

  items() {
    return props()?.items ?? [];
  }

  closeAll() {
    const p = props() ?? {};
    if (this.sub) closeTree(this.sub.id);
    closeOverlay(p.overlay ?? "");
    for (const id of [...(p.parents ?? [])].reverse()) closeOverlay(id);
    this.release();
  }

  choose(it) {
    if (!it || it.disabled || it.sep || it.sub) return;
    this.closeAll();
    sfx("click");
    perform(it.act);
  }

  openSub(i, bounds) {
    const it = this.items()[i];
    if (this.sub && this.sub.index === i) return;
    if (this.sub) {
      closeTree(this.sub.id);
      this.sub = null;
    }
    if (!it?.sub || it.disabled) return;
    const k = scale();
    const p = props() ?? {};
    const at = bounds ? { x: bounds.x + bounds.width + 2 * k, y: bounds.y - MENU.frame * k } : undefined;
    const id = openMenu(it.sub, at, { parents: [...(p.parents ?? []), p.overlay] });
    this.sub = { id, index: i };
  }

  move(d) {
    const items = this.items();
    if (!items.length) return;
    let i = this.at;
    for (let n = 0; n < items.length; n++) {
      i = (i + d + items.length) % items.length;
      if (!items[i].sep) break;
    }
    this.at = i;
  }

  key(e, cx) {
    const items = this.items();
    switch (e.key) {
      case "down":
        this.move(1);
        break;
      case "up":
        this.move(-1);
        break;
      case "right":
        if (items[this.at]?.sub) this.openSub(this.at, null);
        break;
      case "left":
      case "escape":
        this.escape();
        break;
      case "enter":
      case "space":
        if (items[this.at]?.sub) this.openSub(this.at, null);
        else this.choose(items[this.at]);
        break;
      default: {
        const ch = (e.key_char ?? e.key ?? "").toLowerCase();
        if (!ch || ch.length !== 1) return;
        const i = items.findIndex((it) => !it.sep && (it.label ?? "").toLowerCase().includes("&" + ch));
        if (i < 0) return;
        this.at = i;
        if (items[i].sub) this.openSub(i, null);
        else this.choose(items[i]);
      }
    }
    cx.stop_propagation();
    cx.notify();
  }

  row(u, it, i) {
    if (it.sep) return div().h(u(MENU.sep)).w_full().flex().items_center().px(u(6)).child(div().w_full().h(u(1)).bg(C.parchmentEdge));
    const on = i === this.at && !it.disabled;
    const fg = it.disabled ? "#9c8a60" : on ? C.ink : C.ink;
    const lead = div()
      .w(u(22))
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .when(Boolean(it.checked), (el) => el.child(glyph(u, "check", 10, fg)))
      .when(Boolean(it.radio), (el) => el.child(glyph(u, "radio", 10, fg)))
      .when(Boolean(it.icon) && !it.checked && !it.radio, (el) => el.child(glyph(u, it.icon, 13, it.disabled ? fg : C.inkMuted)));
    return h_flex()
      .id(`mi-${i}`)
      .h(u(MENU.row))
      .w_full()
      .items_center()
      .rounded(u(2))
      .text_color(fg)
      .when(on, (el) => el.bg(C.goldBright))
      .on_mouse_move((e, cx) => {
        if (this.at === i && (this.sub?.index === i || !it.sub)) return;
        this.at = i;
        this.openSub(i, e.bounds);
        cx.notify();
      })
      .on_click((_e, cx) => {
        if (it.sub) {
          this.openSub(i, null);
          cx.notify();
        } else this.choose(it);
      })
      .child(lead)
      .child(div().flex_1().min_w(0).child(label(it.label, { bold: it.bold, color: fg })))
      .when(Boolean(it.shortcut), (el) => el.child(div().flex_none().pl(u(16)).text_size(u(11)).text_color(it.disabled ? fg : C.inkMuted).child(it.shortcut)))
      .child(
        div()
          .w(u(18))
          .flex_none()
          .flex()
          .items_center()
          .justify_center()
          .when(Boolean(it.sub), (el) => el.child(glyph(u, "arrow-right", 8, fg))),
      );
  }

  render(_cx) {
    const u = unit();
    const items = this.items();
    const list = v_flex().flex_1().min_w(0).children(items.map((it, i) => this.row(u, it, i)));
    return root(
      u,
      v_flex()
        .id("menu")
        .key_context("EmpiresMenu")
        .on_action("empires_menu_escape", () => this.escape())
        .track_focus(this.focus)
        .on_key_down((e, cx) => this.key(e, cx))
        .on_mouse_down_out(() => this.release())
        .size_full(),
    ).child(div().size_full().flex().flex_col().border(u(2)).border_color(C.wood.mid).child(parchment(u, list, { pad: [3, 3] }).size_full()));
  }
}
