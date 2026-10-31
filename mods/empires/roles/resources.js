// The resource bar (SPEC §6.1): the game menu, honest resource counters, the
// age banner, the session clock, settings and window buttons. It is always
// shown, so it also owns the layout's key commands ("empires.<command>" in
// keys.json), fitLayout(), the chronicle (status transitions), the ages and
// the boot screen (Herdr 98's taskbar pattern).

import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, agents, terminals, focused, run, shared, setShared, nextCommand, settings, window as appWindow, exec, readTextFile, appHome } from "herdr";
import { C, ASSETS, FONT_SC, unit, root, plank, heading, button, own, fitLayout, openMenu, openDialog, sfx, glyph, calm, label } from "../kit.js";
import { clock, resourceCounts, ageFor, transitions, completions, orderAgents, nextIdle, nextBlocked, isNarrow, pruneGroups, selectedUnits } from "../data.js";
import { onIdle, commandMode } from "./queue.js";
import { cycleView, setView, viewMode } from "./views.js";
import { openUnitChat } from "./chat.js";

const RESOURCE_ICON = { food: "food", wood: "res-wood", gold: "gold", stone: "stone", population: "population" };
const CHRONICLE_MAX = 500;

/** Seconds since the Herdr app started (exec's parent), or null where ps can't say. */
async function appAge() {
  try {
    const r = await exec("sh", ["-c", 'ps -o etime= -p "$PPID"']);
    const m = r.stdout.trim().match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/);
    if (!m) return null;
    const [, d, h, mi, s] = m.map((x) => Number(x) || 0);
    return ((d * 24 + h) * 60 + mi) * 60 + s;
  } catch {
    return null;
  }
}

export default class Resources {
  init(_p, cx) {
    this.packUi = null; // resource icons from the art pack (SPEC §18.4 ui), when it has them
    this.loadPackUi(cx);
    this.zoom = null;
    this.scale = null;
    this.width = 0;
    this.narrow = false;
    this.prev = null; // address -> status, for transitions
    this.now = Date.now();
    if (!shared("empires.session")) setShared("empires.session", { startedAt: Date.now(), completed: 0, age: 0 });
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
    // Herdr just started with this layout on: always boot. Else (a switch to it,
    // a reload of the mod) the half-hour rule.
    cx.spawn(async () => {
      const age = await appAge();
      this.boot(age !== null && age < 45);
    });
  }

  // ---- entering the layout (SPEC §7.5)

  boot(force = false) {
    if (shared("empires.boot") === "off" || calm()) return;
    const now = Date.now();
    const last = force ? 0 : Number(shared("empires.bootAt")) || 0;
    if (now - last > 30 * 60 * 1000) {
      setShared("empires.bootAt", now);
      openDialog("screen", { mode: "loading" });
    }
  }

  // ---- keys (SPEC §7.6)

  space() {
    return spaces().find((s) => s.active);
  }

  order() {
    return orderAgents(spaces(), agents());
  }

  command(c) {
    const f = focused();
    switch (c) {
      case "menu":
        return this.menu();
      case "idle": {
        const a = nextIdle(agents(), this.order(), f?.agent ?? f?.terminal ?? null);
        if (a) run("agent.focus", { terminal: a.address });
        return;
      }
      case "alarm": {
        const a = nextBlocked(agents(), this.order(), f?.agent ?? f?.terminal ?? null);
        if (a) run("agent.focus", { terminal: a.address });
        return;
      }
      case "train":
        return openDialog("train", { title: "Train a unit", space: this.space()?.id ?? null });
      case "garrison": {
        const tab = this.space()?.tabs.find((t) => t.active);
        if (tab) run("tab.settle", { id: tab.id });
        return;
      }
      case "toggle_hud":
        setShared("empires.hud", shared("empires.hud") === "hidden" ? "shown" : "hidden");
        return run("layout.toggle", { id: "hud" });
      case "techtree":
        return openDialog("techtree", { title: "Tech tree" });
      case "chronicle":
        return openDialog("chronicle", { title: "Chronicle" });
      case "boot":
        return this.boot(true);
      case "options":
        return openDialog("options", { title: "Options" });
      case "view":
        return cycleView();
      case "chat": {
        // Talk to the focused unit, else the first one that needs you, else the first unit.
        const list = agents();
        const a = list.find((x) => x.address === (f?.agent ?? f?.terminal)) ?? list.find((x) => x.status === "blocked") ?? list[0];
        if (a) openUnitChat(a.address, a.program?.name ?? "Unit");
        return;
      }
      case "view_split":
      case "view_map":
      case "view_terminals":
        return setView(c.slice(5));
    }
    // Control groups (SPEC §14.4): ctrl-shift-<digit> assigns the selection, alt-shift-<digit> selects it.
    const set = /^group_set_(\d)$/.exec(c);
    const get = /^group_(\d)$/.exec(c);
    if ((set || get) && commandMode()) {
      const groups = pruneGroups(shared("empires.groups"), terminals());
      if (set) {
        const sel = selectedUnits(agents(), shared("empires.selected"), f?.agent ?? f?.terminal ?? null);
        if (!sel.length) return;
        groups[set[1]] = sel;
        setShared("empires.groups", groups);
        sfx("select");
      } else {
        const g = groups[get[1]];
        setShared("empires.groups", groups);
        if (!g?.length) return;
        setShared("empires.selected", g);
        run("agent.focus", { terminal: g[0] });
      }
    }
  }

  // ---- the game menu (SPEC §6.1)

  menuItems() {
    const hudHidden = shared("empires.hud") === "hidden";
    return [
      { label: "&Options...", icon: "options", act: { dialog: { kind: "options", title: "Options" } } },
      { label: "&Tech tree (keys)", icon: "techtree", shortcut: "F1", act: { dialog: { kind: "techtree", title: "Tech tree" } } },
      { label: "&Chronicle", icon: "chronicle", act: { dialog: { kind: "chronicle", title: "Chronicle" } } },
      { sep: true },
      { label: "&View", icon: "expand", sub: [["split", "&Split: world over terminals"], ["map", "&Map: the world only"], ["terminals", "&Terminals: no world"]].map(([m, l]) => ({ label: l, radio: true, checked: viewMode() === m, shortcut: m === "split" ? "Alt+W" : undefined, act: { run: [`empires.view_${m}`, {}] } })) },
      { label: hudHidden ? "Show &HUD" : "Hide &HUD", icon: "expand", shortcut: "Ctrl+Shift+H", act: { shared: ["empires.hud", hudHidden ? "shown" : "hidden"], run: ["layout.toggle", { id: "hud" }] } },
      { label: "&Mute sounds", icon: "mute", checked: shared("empires.mute") === true, act: { shared: ["empires.mute", shared("empires.mute") !== true] } },
      { label: "Summon the &herald", icon: "herald", checked: shared("empires.herald") !== "off", act: { shared: ["empires.herald", shared("empires.herald") === "off" ? "on" : "off"] } },
      { sep: true },
      { label: "Herdr &settings", icon: "gear", act: { run: ["app.settings", {}] } },
      { label: "Command &palette", act: { run: ["app.palette", {}] } },
      { sep: true },
      { label: "&Resign (leave the theme)", icon: "resign", act: { dialog: { kind: "confirm", title: "Resign?", text: "Leave Herdr Empires and return to the Herdr layout?\nYour towns and units keep running.", buttons: [{ label: "&Resign", default: true, act: { run: ["layout.switch", { name: "main" }], sound: "resign" } }, { label: "&Stay" }] } } },
      { label: "&About Herdr Empires", icon: "about", act: { dialog: { kind: "about", title: "About Herdr Empires" } } },
    ];
  }

  menu(bounds) {
    sfx("knock");
    openMenu(this.menuItems(), bounds ? { below: bounds } : undefined);
  }

  // ---- the chronicle and the ages (SPEC §7.3, §7.4), applied outside render

  track(cx) {
    const list = agents();
    const { changes, statuses } = transitions(this.prev, list, this.now);
    const first = this.prev === null;
    this.prev = statuses;
    if (first || !changes.length) return;
    cx.spawn(async () => {
      const log = Array.isArray(shared("empires.chronicle")) ? shared("empires.chronicle") : [];
      const next = [...log, ...changes].slice(-CHRONICLE_MAX);
      setShared("empires.chronicle", next);
      const done = completions(changes);
      const session = shared("empires.session") ?? { startedAt: this.now, completed: 0, age: 0 };
      if (done) {
        const completed = (Number(session.completed) || 0) + done;
        const age = ageFor(completed, shared("empires.ages")).index;
        setShared("empires.session", { ...session, completed, age });
        if (age > (Number(session.age) || 0) && !calm()) {
          if (age >= 3) openDialog("screen", { mode: "victory", age, completed });
          else {
            sfx("ageup");
            openDialog("screen", { mode: "ageup", age });
          }
        }
      }
      if (shared("empires.alerts") === true) {
        if (changes.some((c) => c.to === "blocked")) sfx("bell");
        else if (changes.some((c) => c.to === "done")) sfx("done");
      }
      // Phase 2: a unit that went idle may take the next queued order of its town.
      if (commandMode()) {
        for (const c of changes.filter((x) => x.to === "idle")) {
          const agent = list.find((a) => a.address === c.address);
          if (agent) await onIdle(agent).catch((e) => console.log(`empires: dispatch: ${e}`));
        }
      }
    });
  }

  // ---- the art pack's painted resource icons

  loadPackUi(cx) {
    const choice = shared("empires.pack") ?? "auto";
    const bases = choice === "zeroad" ? [`${ASSETS}/packs/zeroad`] : ["empires-packs/local", `${ASSETS}/packs/zeroad`];
    cx.spawn(async (cx) => {
      for (const base of bases) {
        try {
          const text = await readTextFile(`${appHome()}/${base}/pack.json`);
          if (!text) continue;
          const pack = JSON.parse(text);
          const ui = pack.ui ?? {};
          const icons = {};
          for (const [key, name] of [["food", "food"], ["wood", "wood"], ["stone", "stone"], ["population", "population"], ["gold", "gold"]]) {
            // 0 A.D.'s fourth resource is metal (an anvil), which doesn't read as gold: keep the coin.
            if (key === "gold" && pack.name === "zeroad") continue;
            if (ui[name]) icons[key] = `${base}/${ui[name]}`;
          }
          this.packUi = { choice, icons };
          cx.notify();
          return;
        } catch {}
      }
      this.packUi = { choice, icons: {} };
    });
  }

  // ---- pieces

  /** Map / Split / Terminals, always on screen (the world's own corner buttons vanish with it). */
  viewSwitch(u, narrow) {
    const now = viewMode();
    const go = (m) => {
      // Leaving a zoomed (full-size) pane for the map: unzoom it so Split shows every pane again.
      const f = focused();
      const zoomed = f?.pane ? spaces().some((sp) => sp.tabs.some((t) => t.active && t.zoomed && sp.active)) : false;
      if (m !== "terminals" && zoomed) run("pane.zoom", { pane: f.pane });
      setView(m);
    };
    return h_flex()
      .flex_none()
      .gap(u(2))
      .children(
        [["map", narrow ? "Map" : "Map"], ["split", narrow ? "Split" : "Split"], ["terminals", narrow ? "Term" : "Terminals"]].map(([m, text]) =>
          button(u, `view-${m}`, label(text, { bold: m === "map" }), () => go(m), { h: 24, pad: [0, 6], toggled: now === m, tooltip: m === "map" ? "The map: towns and units (Alt+W cycles views)" : m === "split" ? "The map over the terminals" : "Terminals only, no map" }).flex_none(),
        ),
      );
  }

  counter(u, key, r, o = {}) {
    const narrow = o.narrow;
    const pulse = key === "stone" && r.value > 0 && !calm();
    let num = div().font_family(FONT_SC).text_size(u(14)).text_color(C.text).child(key === "population" ? `${r.value}/${r.cap}` : String(r.value));
    // Under attack: a light number on a red pill; the pill pulses, the number stays readable.
    if (pulse) num = div().relative().px(u(5)).rounded(u(7)).child(div().absolute().top(0).left(0).size_full().rounded(u(7)).bg(C.blocked).loop("opacity", { from: 0.55, to: 1, period: 900 })).child(num.relative().text_color("#fff6e8").font_weight(700));
    const act = () => {
      if (key === "stone") {
        const a = nextBlocked(agents(), this.order(), null);
        if (a) run("agent.focus", { terminal: a.address });
      } else if (key === "wood") {
        const f = focused();
        const a = nextIdle(agents(), this.order(), f?.agent ?? f?.terminal ?? null);
        if (a) run("agent.focus", { terminal: a.address });
      } else if (key === "gold") openDialog("chronicle", { title: "Chronicle" });
      else if (key === "population" || key === "food") openDialog("options", { title: "Options" });
    };
    const tip = key === "population" ? `Population: ${r.meaning} (${r.value} of ${r.cap})` : `${key[0].toUpperCase()}${key.slice(1)}: ${r.meaning}` + (key === "stone" ? ". Click: go to the next unit under attack" : key === "wood" ? ". Click: go to the next idle unit" : "");
    return own(
      h_flex()
        .id(`res-${key}`)
        .flex_none()
        .items_center()
        .gap(u(4))
        .px(u(4))
        .h(u(24))
        .rounded(u(2))
        .hover((s) => s.bg("#ffffff14"))
        .tooltip(tip)
        .on_click(() => act())
        .child(image(this.packUi?.icons?.[key] ?? `${ASSETS}/img/${RESOURCE_ICON[key]}.svg`).flex_none().w(u(20)).h(u(20)))
        .child(num)
        .when(!narrow, (el) => el.child(div().text_size(u(10.5)).text_color(C.textDim).child(key))),
    );
  }

  ageBanner(u, session, narrow) {
    const a = ageFor(session.completed, shared("empires.ages"));
    const w = narrow ? 120 : 190;
    const text = narrow ? a.name.replace(" Age", "") : `— ${a.name} —`;
    return own(
      v_flex()
        .id("age")
        .flex_none()
        .w(u(w))
        .items_center()
        .gap(u(1))
        .tooltip(a.next === null ? `${a.name}: ${a.completed} tasks completed this session` : `${a.name}: ${a.completed} of ${a.next} tasks toward the next age`)
        .on_click(() => openDialog("chronicle", { title: "Chronicle" }))
        .child(heading(u, text, { size: 12 }))
        .child(
          div()
            .relative()
            .w(u(w - 40))
            .h(u(3))
            .bg(C.stone.dark)
            .border(u(1))
            .border_color(C.wood.dark)
            .child(div().absolute().top(0).left(0).h_full().w(`${Math.round(a.progress * 100)}%`).bg(C.gold)),
        ),
    );
  }

  windowButtons(u, w) {
    const b = (id, g, tip, cmd) =>
      own(
        div()
          .id(`win-${id}`)
          .flex_none()
          .w(u(26))
          .h(u(20))
          .flex()
          .items_center()
          .justify_center()
          .rounded(u(2))
          .text_color(C.textDim)
          .hover((s) => s.bg(id === "close" ? C.blocked : "#ffffff22").text_color(C.text))
          .tooltip(tip)
          .on_click(() => run(cmd, {}))
          .child(glyph(u, g, 10, C.text)),
      );
    return h_flex()
      .flex_none()
      .gap(u(1))
      .child(b("min", "win-min", "Minimize", "window.minimize"))
      .child(b("max", w.maximized ? "win-restore" : "win-max", w.maximized ? "Restore" : "Maximize", "window.maximize"))
      .child(b("close", "win-close", "Close", "window.close"));
  }

  render(cx) {
    if (this.packUi && this.packUi.choice !== (shared("empires.pack") ?? "auto")) this.loadPackUi(cx);
    const u = unit();
    const z = settings()?.zoom;
    const sc = shared("empires.scale");
    const narrow = isNarrow(this.width / (u.k || 1));
    if (z !== this.zoom || sc !== this.scale || (this.width > 0 && narrow !== this.narrow)) {
      this.zoom = z;
      this.scale = sc;
      this.narrow = narrow;
      cx.spawn(async () => fitLayout(narrow));
    }
    this.track(cx);
    const w = appWindow();
    const mac = w?.platform === "macos";
    const session = shared("empires.session") ?? { startedAt: this.now, completed: 0 };
    const since = this.now - (Number(session.startedAt) || this.now);
    const res = resourceCounts(agents(), terminals(), session, shared("empires.resources"), shared("empires.popcap"));
    const mute = shared("empires.mute") === true;

    const bar = h_flex()
      .size_full()
      .items_center()
      .pl(u(mac && !w?.buttons ? 78 : 6))
      .pr(u(6))
      .gap(u(narrow ? 4 : 8))
      .child(button(u, "menu", h_flex().items_center().gap(u(4)).child(glyph(u, "menu", 12, C.goldBright)).child(label(narrow ? "" : "Menu", { bold: true })), null, { h: 24, pad: [0, 6], tooltip: "Game menu (Alt+M)", onDown: (e) => this.menu(e.bounds) }).flex_none())
      .child(this.viewSwitch(u, narrow))
      .child(div().flex_none().w(u(1)).h(u(20)).bg(C.wood.dark))
      .child(h_flex().flex_none().items_center().gap(u(narrow ? 2 : 6)).children(["food", "wood", "gold", "stone", "population"].map((k) => this.counter(u, k, res[k], { narrow }))))
      .child(div().flex_1())
      .when(!calm(), (el) => el.child(this.ageBanner(u, session, narrow)))
      .child(div().flex_1())
      .child(own(div().id("clock").flex_none().font_family(FONT_SC).text_size(u(13)).text_color(C.text).tooltip("Time in Herdr Empires this session. Click: the chronicle").on_click(() => openDialog("chronicle", { title: "Chronicle" })).child(clock(since))))
      .child(
        own(
          div()
            .id("mute")
            .flex_none()
            .p(u(3))
            .rounded(u(2))
            .hover((s) => s.bg("#ffffff14"))
            .tooltip(mute ? "Sounds: muted. Click to unmute" : "Sounds: on. Click to mute")
            .on_click((_e, cx) => {
              setShared("empires.mute", !mute);
              cx.notify();
            })
            .child(glyph(u, mute ? "mute" : "speaker", 14, mute ? C.textDim : C.text)),
        ),
      )
      .child(own(div().id("settings").flex_none().p(u(3)).rounded(u(2)).hover((s) => s.bg("#ffffff14")).tooltip("Settings").on_click(() => run("app.settings", {})).child(glyph(u, "gear", 14, C.text))))
      .when(Boolean(w?.buttons), (el) => el.child(div().flex_none().w(u(1)).h(u(20)).bg(C.wood.dark)).child(this.windowButtons(u, w)));

    return root(
      u,
      div()
        .id("resources")
        .size_full()
        .flex()
        .flex_col()
        .on_size_change((size, cx) => {
          if (size.width !== this.width) {
            this.width = size.width;
            cx.notify();
          }
        }),
    ).child(plank(u, bar, { full: true }));
  }
}
