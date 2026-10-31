// A parchment popup menu: props { items, parents, owner } (SPEC §6.7). Skeleton; built out in M2.
import { div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { props, closeOverlay } from "herdr";
import { C, unit, root, parchment, label, plain, perform } from "../kit.js";

export default class Menu {
  init(_p, cx) {
    this.focus = cx.focus_handle();
    this.focus.focus();
  }
  render(_cx) {
    const u = unit();
    const p = props() ?? {};
    const items = p.items ?? [];
    return root(u, v_flex().id("menu").track_focus(this.focus).size_full()).child(
      parchment(u, v_flex().children(items.filter((it) => !it.sep).map((it, i) => div().id(`mi-${i}`).text_color(C.ink).on_click(() => { closeOverlay(p.overlay); perform(it.act); }).child(plain(it.label))))),
    );
  }
}
