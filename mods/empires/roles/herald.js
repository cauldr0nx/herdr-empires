// The herald (SPEC §6.6): a floating advisor with a scroll and a trumpet.
// Shows the most urgent agent event as a one-line parchment speech bubble
// ("A scholar in api awaits your orders."), click = focus that agent;
// Dismiss; Silence the herald (shared "empires.herald" = "off"). Lines come
// from an original bank in data.js. Calm mode hides the herald entirely.

import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, run, shared, setShared, placement } from "herdr";
import { C, ASSETS, unit, root, own, label, glyph, sfx, calm } from "../kit.js";
import { heraldNews, heraldLine } from "../data.js";

export default class Herald {
  init() {
    this.dismissed = new Set();
    this.tip = null;
  }

  render(_cx) {
    if (shared("empires.herald") === "off" || calm()) return div();
    const u = unit();
    const a = heraldNews(agents(), [...this.dismissed]);
    const right = placement()?.edge === "right";
    // Clean the dismissed list once their agents moved on.
    for (const k of [...this.dismissed]) {
      const [addr, st] = k.split(":");
      if (!agents().some((x) => x.address === addr && x.status === st)) this.dismissed.delete(k);
    }
    let bubble = null;
    if (a) {
      const text = heraldLine(a, a.seq ?? 0);
      bubble = this.bubble(u, text, [
        ["Take me there", () => {
          run("agent.focus", { terminal: a.address });
          this.dismissed.add(`${a.address}:${a.status}`);
        }],
        ["Dismiss", () => this.dismissed.add(`${a.address}:${a.status}`)],
        ["Silence the herald", () => setShared("empires.herald", "off")],
      ], a.status === "blocked" ? C.blocked : C.done);
    } else if (this.tip !== null) {
      bubble = this.bubble(u, "All quiet in the realm, my liege.", [
        ["Thank you", () => (this.tip = null)],
        ["Silence the herald", () => setShared("empires.herald", "off")],
      ], C.gold);
    }
    let portrait = own(
      div()
        .id("herald")
        .relative()
        .flex_none()
        .cursor_pointer()
        .tooltip(a ? "The herald has news: click the bubble" : "The herald. Click for a word")
        .on_click((_e, cx) => {
          this.tip = this.tip === null ? 0 : null;
          sfx("knock");
          cx.notify();
        })
        .child(image(`${ASSETS}/img/herald.svg`).w(u(56)).h(u(72))),
    );
    if (a && !calm()) portrait = portrait.loop("top", { from: 0, to: u(-4), period: 900 });
    // A dot on the portrait says "news" while the drawer is closed (only the portrait peeks).
    if (a) portrait = portrait.child(div().absolute().top(u(2)).left(u(2)).w(u(12)).h(u(12)).rounded_full().bg(a.status === "blocked" ? C.blocked : C.done).border(u(1)).border_color("#fff6e8"));
    // On a side edge the herald is a peek drawer (SPEC §19.10): the portrait sits on the edge
    // side and the bubble beside it, so a closed drawer shows only the portrait. One layout,
    // never changed on hover (AGENTS.md: that keeps the drawer smooth).
    const side = Boolean(placement()?.vertical);
    const box = side ? h_flex().p(u(4)).gap(u(4)).items_end() : v_flex().p(u(4)).gap(u(3)).map((el) => (right ? el.items_end() : el.items_start()));
    const parts = bubble ? (side && right ? [bubble, portrait] : side ? [portrait, bubble] : [bubble, portrait]) : [portrait];
    return root(u, box).children(parts);
  }

  bubble(u, text, actions, accent) {
    return v_flex()
      .w(u(210))
      .p(u(8))
      .gap(u(6))
      .bg(C.parchment)
      .border(u(1))
      .border_l(u(3))
      .border_color(accent)
      .rounded(u(3))
      .text_color(C.ink)
      .child(div().child(text))
      .child(
        v_flex()
          .gap(u(2))
          .children(
            actions.map(([t, fn], i) =>
              own(
                h_flex()
                  .id(`herald-${i}`)
                  .gap(u(5))
                  .items_center()
                  .cursor_pointer()
                  .hover((s) => s.text_color(C.gold))
                  .on_click((_e, cx) => {
                    fn();
                    cx.notify();
                  })
                  .child(glyph(u, "arrow-right", 7, C.inkMuted))
                  .child(div().underline().child(t)),
              ),
            ),
          ),
      );
  }
}
