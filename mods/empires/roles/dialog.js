// Dialogs: props { kind, ... } (SPEC §6.8). Skeleton; built out in M2/M3.
import { div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { props, closeOverlay } from "herdr";
import { C, unit, root, parchment, heading, button } from "../kit.js";

export default class Dialog {
  init(p, cx) {
    this.p = p ?? {};
    this.focus = cx.focus_handle();
    this.focus.focus();
  }
  close() {
    closeOverlay(props()?.overlay ?? "");
  }
  render(_cx) {
    const u = unit();
    return root(u, v_flex().id("dialog").track_focus(this.focus).size_full()).child(
      parchment(u, v_flex().gap(u(8)).child(heading(u, this.p.title ?? this.p.kind ?? "dialog", { color: C.ink })).child(div().text_color(C.ink).child(this.p.text ?? "")).child(button(u, "dlg-ok", "OK", () => this.close(), { w: 80, h: 24 }))),
    );
  }
}
