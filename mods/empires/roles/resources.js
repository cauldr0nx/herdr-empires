// The resource bar (SPEC §6.1). Skeleton: menu, title, clock, window buttons;
// it already owns the layout's key commands and fitLayout(). Built out in M1.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { run, shared, setShared, nextCommand, settings, window as appWindow } from "herdr";
import { C, unit, root, plank, heading, button, own, fitLayout, openMenu, openDialog, sfx } from "../kit.js";
import { clock } from "../data.js";

export default class Resources {
  init(_p, cx) {
    this.zoom = null;
    this.scale = null;
    if (!shared("empires.session")) setShared("empires.session", { startedAt: Date.now(), completed: 0, age: 0 });
    this.now = Date.now();
    cx.timer.every(1000, (cx) => {
      this.now = Date.now();
      cx.notify();
    });
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        try {
          this.command(c);
        } catch (e) {
          console.log(`empires resources: ${c} failed: ${e}`);
        }
        cx.notify();
      }
    });
  }

  command(c) {
    switch (c) {
      case "menu":
        return this.menu();
      case "toggle_hud":
        setShared("empires.hud", shared("empires.hud") === "hidden" ? "shown" : "hidden");
        return run("layout.toggle", { id: "hud" });
      case "techtree":
        return openDialog("techtree", { title: "Tech tree" });
      case "idle":
      case "alarm":
      case "train":
      case "garrison":
        return;
    }
  }

  menuItems() {
    return [
      { label: "&Options...", act: { dialog: { kind: "options", title: "Options" } } },
      { label: "&Tech tree (keys)", shortcut: "F1", act: { dialog: { kind: "techtree", title: "Tech tree" } } },
      { label: "&Chronicle", act: { dialog: { kind: "chronicle", title: "Chronicle" } } },
      { sep: true },
      { label: "&Resign (leave the theme)", act: { run: ["layout.switch", { name: "main" }] } },
      { label: "&About Herdr Empires", act: { dialog: { kind: "about", title: "About" } } },
    ];
  }

  menu(bounds) {
    sfx("knock");
    openMenu(this.menuItems(), bounds ? { below: bounds } : undefined);
  }

  render(cx) {
    const u = unit();
    const z = settings()?.zoom;
    const sc = shared("empires.scale");
    if (z !== this.zoom || sc !== this.scale) {
      this.zoom = z;
      this.scale = sc;
      cx.spawn(async () => fitLayout());
    }
    const w = appWindow();
    const session = shared("empires.session") ?? {};
    const since = this.now - (Number(session.startedAt) || this.now);
    const winButtons = w?.buttons
      ? h_flex().flex_none().gap(u(2)).children([
          button(u, "win-min", "–", () => run("window.minimize", {}), { w: 22, h: 18, pad: [0, 0], tooltip: "Minimize" }),
          button(u, "win-max", w.maximized ? "❐" : "□", () => run("window.maximize", {}), { w: 22, h: 18, pad: [0, 0], tooltip: w.maximized ? "Restore" : "Maximize" }),
          button(u, "win-close", "✕", () => run("window.close", {}), { w: 22, h: 18, pad: [0, 0], tooltip: "Close" }),
        ])
      : null;
    const bar = h_flex()
      .size_full()
      .items_center()
      .px(u(w?.platform === "macos" && !w?.buttons ? 78 : 6))
      .gap(u(8))
      .child(button(u, "menu", "⚑ Menu", null, { h: 24, bold: true, onDown: (e) => this.menu(e.bounds) }).flex_none())
      .child(heading(u, "Herdr Empires", { size: 13 }))
      .child(div().flex_1())
      .child(own(div().id("clock").flex_none().font_family("Alegreya Sans SC").text_color(C.text).tooltip("Time in the theme this session").child(clock(since))))
      .when(Boolean(winButtons), (el) => el.child(winButtons));
    return root(u, div().id("resources").size_full().flex().flex_col()).child(plank(u, bar, { full: true }));
  }
}
