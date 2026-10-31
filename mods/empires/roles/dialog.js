// Dialogs (SPEC §6.8), one overlay each: props { kind, ... }. A parchment
// scroll body under a wood header with a Cinzel caption; the default button
// carries a wax seal. Kinds:
//   prompt     { title, text, value, command: { name, args } }: Enter runs the command with { name }
//   confirm    { title, text, buttons: [{ label, default, act }] }: Herdr's confirmation semantics
//   message    { title, text }
//   about      About Herdr Empires
//   options    resource mapping, pop cap, mute, alert sounds, herald, scale, HUD, calm mode, loading screen
//   techtree   keybindings from keys() as technologies by category
//   chronicle  the session log as a score screen (SPEC §7.4)
//   train      agent picker + task + town → tab.new { argv, task, space }
//   screen     full-window: loading | ageup | victory | resign (SPEC §7.3, §7.5)

import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, closeOverlay, run, shared, setShared, keys, spaces, knownAgents, settings, appHome, readTextFile, writeTextFile, window as appWindow, exec } from "herdr";
import { C, ASSETS, DISPLAY, FONT_SC, VERSION, unit, root, parchment, plank, heading, button, label, glyph, own, perform, sfx, statusBadge, calm, programIcon, etch } from "../kit.js";
import { techTree, scoreboard, ageFor, AGES, DEFAULT_AGE_THRESHOLDS, RESOURCE_SOURCES, DEFAULT_RESOURCES, DEFAULT_POPCAP, elapsed } from "../data.js";

const TIPS = [
  "Alt+. jumps to the next idle unit; Alt+, to the next one under attack.",
  "Garrison a building (Alt+G) to settle its tab: it keeps running, out of sight.",
  "Double-click a banner to zoom its unit; right-click it for orders.",
  "Ctrl+Shift+L cycles layouts; Resign in the game menu returns to Herdr.",
  "Click Stone in the resource bar to go to the first unit under attack.",
  "Ctrl+Shift+H hides the HUD for a full-height field.",
  "Every counter says what it counts: hover it. Nothing is estimated.",
  "Ctrl+Alt+Shift+Escape always returns to Herdr's default layout.",
  "The chronicle keeps this session's score per town; see Gold.",
  "Found a town with the command card: a new space from a folder.",
];

const SOURCES = ["working", "idle", "blocked", "done", "completed"];

function lines(text) {
  return String(text ?? "")
    .split("\n")
    .map((l) => div().child(l || " "));
}

export default class Dialog {
  init(p, cx) {
    this.p = p ?? {};
    this.kind = this.p.kind;
    this.focus = cx.focus_handle();
    this.focus.focus();
    this.text = this.p.value ?? "";
    this.fresh = Boolean(this.text);
    this.stage = 0;
    this.agents = [];
    this.agentAt = 0;
    this.spaceAt = 0;
    this.now = Date.now();
    if (this.kind === "train") {
      const all = spaces();
      this.spaceAt = Math.max(0, all.findIndex((s) => s.id === this.p.space));
      cx.spawn(async (cx) => {
        try {
          this.agents = await knownAgents();
        } catch {
          this.agents = [];
        }
        cx.notify();
      });
    }
    if (this.kind === "confirm") sfx("knock");
    if (this.kind === "screen") this.screen(cx);
  }

  close() {
    closeOverlay(props()?.overlay ?? "");
  }

  // ---- full-window screens

  screen(cx) {
    const mode = this.p.mode;
    if (mode === "loading") {
      sfx("horn");
      cx.timer.after(1000, (cx) => {
        this.stage = 1;
        cx.notify();
        cx.timer.after(1000, () => this.close());
      });
    } else if (mode === "ageup") {
      cx.timer.after(3000, () => this.close());
    } else if (mode === "victory") {
      sfx("victory");
      cx.timer.after(4000, () => this.close());
    } else if (mode === "resign") {
      sfx("resign");
      cx.timer.after(1000, () => {
        this.close();
        run("layout.switch", { name: "main" });
      });
    }
  }

  renderScreen(u) {
    const mode = this.p.mode;
    const w = appWindow();
    if (mode === "ageup" || mode === "victory") {
      const age = AGES[Math.min(AGES.length - 1, Number(this.p.age) || 0)];
      return div()
        .size_full()
        .flex()
        .flex_col()
        .items_center()
        .justify_start()
        .child(
          plank(u, h_flex().w_full().h(u(48)).items_center().justify_center().gap(u(14)).child(image(`${ASSETS}/img/ornament.svg`).w(u(22)).h(u(22))).child(heading(u, mode === "victory" ? `Victory: the ${age}` : `You have advanced to the ${age}`, { size: 18 })).child(image(`${ASSETS}/img/ornament.svg`).w(u(22)).h(u(22))), { full: false })
            .w_full()
            .border_b(u(2))
            .border_color(C.gold),
        );
    }
    const title = mode === "resign" ? "The realm rests. Returning to Herdr…" : "Herdr Empires";
    const tip = TIPS[(Number(shared("empires.bootAt")) || 0) % TIPS.length];
    return div()
      .id("screen")
      .size_full()
      .relative()
      .bg(C.stone.dark)
      .on_click(() => this.close())
      .child(image(`${ASSETS}/img/loading.svg`).absolute().top(0).left(0).size_full())
      .child(
        v_flex()
          .absolute()
          .bottom(u(40))
          .left(0)
          .w_full()
          .items_center()
          .gap(u(10))
          .child(heading(u, title, { size: 22 }))
          .when(mode === "loading", (el) =>
            el
              .child(div().text_size(u(13)).text_color(C.text).child(`Tip: ${tip}`))
              .child(
                div()
                  .w(u(320))
                  .h(u(8))
                  .bg(C.stone.dark)
                  .border(u(1))
                  .border_color(C.gold)
                  .child(div().h_full().w(this.stage ? "100%" : "15%").bg(C.gold).transition("width", { duration: 900, easing: "ease-out" })),
              )
              .child(div().text_size(u(11)).text_color(C.textDim).child("click or press any key to skip")),
          ),
      );
  }

  // ---- keys

  key(e, cx) {
    const m = e.modifiers ?? {};
    if (this.kind === "screen") {
      this.close();
      return cx.stop_propagation();
    }
    if (e.key === "escape") {
      this.close();
      return cx.stop_propagation();
    }
    if (e.key === "enter") {
      this.ok();
      return cx.stop_propagation();
    }
    if (this.kind === "prompt" || this.kind === "train") {
      if (e.key === "backspace") this.text = this.fresh ? "" : this.text.slice(0, -1);
      else if (m.control && e.key === "u") this.text = "";
      else if (m.control && e.key === "w") this.text = this.text.replace(/\S+\s*$/, "");
      else if (m.control && e.key === "a") this.fresh = true;
      else if (this.kind === "train" && e.key === "tab") this.agentAt = (this.agentAt + 1) % Math.max(1, this.agents.length);
      else if (e.key_char && !m.control && !m.platform) this.text = (this.fresh ? "" : this.text) + e.key_char;
      else return;
      if (!(m.control && e.key === "a")) this.fresh = false;
    } else return;
    cx.stop_propagation();
    cx.notify();
  }

  ok() {
    const p = this.p;
    switch (this.kind) {
      case "prompt": {
        const name = this.text.trim();
        if (!name) return;
        this.close();
        run(p.command.name, { ...(p.command.args ?? {}), name });
        return;
      }
      case "confirm": {
        const b = (p.buttons ?? []).find((x) => x.default) ?? p.buttons?.[0];
        this.close();
        perform(b?.act);
        return;
      }
      case "train":
        return this.train();
      default:
        this.close();
    }
  }

  train() {
    const agent = this.agents[this.agentAt];
    if (!agent) return;
    const space = spaces()[this.spaceAt];
    const task = this.text.trim();
    this.close();
    sfx("train");
    run("tab.new", { ...(space ? { space: space.id } : {}), argv: agent.run, ...(task ? { task, name: task.slice(0, 24) } : {}) });
  }

  // ---- pieces

  btn(u, id, text, fn, o = {}) {
    const content = o.default ? h_flex().items_center().gap(u(5)).child(image(`${ASSETS}/img/seal.svg`).w(u(14)).h(u(14))).child(label(text, { bold: true })) : text;
    return button(u, `dlg-${id}`, content, fn, { minW: 84, h: 26, ...o });
  }

  buttons(u, list, align = "end") {
    return h_flex()
      .w_full()
      .gap(u(6))
      .map((el) => (align === "end" ? el.justify_end() : el.justify_center()))
      .children(list);
  }

  input(u, value, o = {}) {
    return div()
      .w_full()
      .h(u(o.h ?? 24))
      .px(u(5))
      .flex()
      .items_center()
      .overflow_hidden()
      .bg("#f6ecc9")
      .border(u(1))
      .border_color(C.parchmentEdge)
      .text_color(C.ink)
      .child(div().when(this.fresh && Boolean(value), (el) => el.bg(C.gold).text_color(C.parchment)).child(value || (o.placeholder ?? "")))
      .child(div().w(u(1)).h(u(14)).bg(C.ink).loop("opacity", { from: 0, to: 1, period: 1060 }));
  }

  check(u, id, text, on, fn, tip) {
    return own(
      h_flex()
        .id(`chk-${id}`)
        .gap(u(6))
        .items_center()
        .when(Boolean(tip), (el) => el.tooltip(tip))
        .on_click((_e, cx) => {
          fn();
          cx.notify();
        })
        .child(div().w(u(13)).h(u(13)).bg("#f6ecc9").border(u(1)).border_color(C.ink).flex().items_center().justify_center().when(on, (el) => el.child(glyph(u, "check", 9, C.ink))))
        .child(label(text, { color: C.ink })),
    );
  }

  /** A row with a label and a value that cycles through `options` on click. */
  cycle(u, id, text, value, options, fn, tip) {
    return h_flex()
      .items_center()
      .gap(u(8))
      .child(div().w(u(130)).text_color(C.ink).child(text))
      .child(
        own(
          h_flex()
            .id(`cyc-${id}`)
            .items_center()
            .gap(u(4))
            .px(u(6))
            .h(u(20))
            .bg("#f6ecc9")
            .border(u(1))
            .border_color(C.parchmentEdge)
            .hover((s) => s.border_color(C.gold))
            .when(Boolean(tip), (el) => el.tooltip(tip))
            .on_click((_e, cx) => {
              fn(options[(options.indexOf(value) + 1) % options.length]);
              cx.notify();
            })
            .child(div().text_color(C.ink).child(String(value)))
            .child(glyph(u, "arrow-down", 7, C.inkMuted)),
        ),
      );
  }

  frame(u, title, body, o = {}) {
    const header = plank(
      u,
      h_flex()
        .h(u(28))
        .items_center()
        .px(u(10))
        .gap(u(8))
        .child(image(`${ASSETS}/img/ornament.svg`).w(u(14)).h(u(14)))
        .child(heading(u, title, { size: 14 }).flex_1())
        .child(own(div().id("dlg-x").flex_none().p(u(2)).rounded(u(2)).hover((s) => s.bg("#ffffff22")).tooltip("Close (Esc)").on_click(() => this.close()).child(glyph(u, "close", 10, C.text)))),
      { h: 28 },
    );
    return v_flex()
      .size_full()
      .border(u(2))
      .border_color(C.wood.mid)
      .child(header)
      .child(div().flex().flex_col().flex_1().min_h(0).child(parchment(u, v_flex().gap(u(10)).p(u(6)).child(body), { pad: [6, 8] }).size_full()));
  }

  // ---- kinds

  renderPrompt(u) {
    return this.frame(u, this.p.title ?? "Name", v_flex().gap(u(8)).children(lines(this.p.text)).child(this.input(u, this.text)).child(this.buttons(u, [this.btn(u, "ok", "OK", () => this.ok(), { default: true }), this.btn(u, "cancel", "Cancel", () => this.close())])));
  }

  renderConfirm(u) {
    const list = (this.p.buttons ?? [{ label: "OK", default: true }]).map((b, i) =>
      this.btn(u, `b${i}`, b.label, () => {
        this.close();
        perform(b.act);
      }, { default: Boolean(b.default) }),
    );
    return this.frame(u, this.p.title ?? "Are you sure?", v_flex().gap(u(10)).child(h_flex().gap(u(10)).items_start().child(glyph(u, "swords", 28, C.blocked).flex_none()).child(v_flex().flex_1().children(lines(this.p.text)))).child(this.buttons(u, list)));
  }

  renderMessage(u) {
    return this.frame(u, this.p.title ?? "Herald", v_flex().gap(u(10)).children(lines(this.p.text)).child(this.buttons(u, [this.btn(u, "ok", "OK", () => this.close(), { default: true })])));
  }

  renderAbout(u) {
    const body = v_flex()
      .gap(u(8))
      .child(h_flex().gap(u(12)).items_center().child(image(`${ASSETS}/img/logo.svg`).w(u(64)).h(u(64))).child(v_flex().child(heading(u, "Herdr Empires", { size: 16, color: C.ink })).child(div().child(`version ${VERSION} · a medieval RTS theme for Herdr`)).child(div().text_color(C.inkMuted).child("Apache-2.0. Original art and sounds; fonts under the SIL OFL."))))
      .child(div().child("Agents become units, spaces become towns, tabs become buildings. Every counter counts something real, and every button runs a Herdr command."))
      .child(div().text_color(C.inkMuted).child("No art, audio, names or marks of any commercial game are included."))
      .child(this.buttons(u, [this.btn(u, "repo", "Source", () => perform({ url: "https://github.com/cauldr0nx/herdr-empires" })), this.btn(u, "ok", "OK", () => this.close(), { default: true })]));
    return this.frame(u, "About Herdr Empires", body);
  }

  renderTechtree(u) {
    const tree = techTree(keys(), "layout:empires");
    const cols = tree.map((g) =>
      v_flex()
        .flex_none()
        .w(u(150))
        .gap(u(2))
        .child(heading(u, g.name, { size: 11, color: C.ink }))
        .children(
          g.items.slice(0, 14).map((it) =>
            h_flex()
              .gap(u(6))
              .items_center()
              .child(div().flex_none().min_w(u(62)).px(u(3)).text_size(u(10.5)).font_family(FONT_SC).bg("#f6ecc9").border(u(1)).border_color(C.parchmentEdge).text_color(C.ink).child(it.keys))
              .child(div().truncate().text_size(u(11)).text_color(C.inkMuted).child(it.action)),
          ),
        ),
    );
    return this.frame(u, "Tech tree: the keys of the realm", v_flex().gap(u(8)).child(div().text_color(C.inkMuted).child("Every technology is a key binding from keys.json (global and layout:empires). Research them in Herdr's keys.json.")).child(h_flex().gap(u(10)).items_start().overflow_x_scroll().children(cols)).child(this.buttons(u, [this.btn(u, "ok", "Close", () => this.close(), { default: true })])));
  }

  renderChronicle(u) {
    const log = Array.isArray(shared("empires.chronicle")) ? shared("empires.chronicle") : [];
    const session = shared("empires.session") ?? {};
    const age = ageFor(session.completed, shared("empires.ages"));
    const rows = scoreboard(log);
    const recent = [...log].slice(-8).reverse();
    const cell = (t, w, o = {}) => div().flex_none().w(u(w)).truncate().text_color(o.color ?? C.ink).when(Boolean(o.bold), (el) => el.font_weight(700)).child(String(t));
    const table = v_flex()
      .gap(u(2))
      .child(h_flex().gap(u(6)).child(cell("Town", 140, { bold: true })).child(cell("Completed", 70, { bold: true })).child(cell("Attacks", 60, { bold: true })).child(cell("Working", 70, { bold: true })).child(cell("Blocked", 70, { bold: true })))
      .children(rows.map((r) => h_flex().gap(u(6)).child(cell(r.town, 140)).child(cell(r.completed, 70)).child(cell(r.blocked, 60)).child(cell(elapsed(r.working_ms), 70)).child(cell(elapsed(r.blocked_ms), 70))))
      .when(!rows.length, (el) => el.child(div().text_color(C.inkMuted).child("Nothing yet: the chronicle fills as units change state.")));
    const events = v_flex()
      .gap(u(1))
      .children(recent.map((c) => h_flex().gap(u(6)).text_size(u(11)).child(div().flex_none().w(u(50)).text_color(C.inkMuted).child(elapsed(this.now - c.at) + " ago")).child(div().truncate().text_color(C.ink).child(`${c.unit ?? "unit"} in ${c.space}: ${c.from ?? "—"} → ${c.to}`))));
    const body = v_flex()
      .gap(u(8))
      .child(div().child(`${age.name} · ${age.completed} task${age.completed === 1 ? "" : "s"} completed this session${age.next === null ? "" : ` · ${age.next - age.completed} to the next age`}`))
      .child(table)
      .child(div().h(u(1)).w_full().bg(C.parchmentEdge))
      .child(events)
      .child(this.buttons(u, [this.btn(u, "clear", "Clear", () => {
        setShared("empires.chronicle", []);
        setShared("empires.session", { startedAt: Date.now(), completed: 0, age: 0 });
        this.close();
      }), this.btn(u, "ok", "Close", () => this.close(), { default: true })]));
    return this.frame(u, "Chronicle", body);
  }

  renderTrain(u) {
    const all = spaces();
    const town = all[this.spaceAt];
    const list = this.agents;
    const agentRows = list.length
      ? h_flex().flex_wrap().gap(u(4)).children(
          list.map((a, i) =>
            own(
              h_flex()
                .id(`tr-agent-${a.key}`)
                .items_center()
                .gap(u(5))
                .px(u(6))
                .h(u(26))
                .bg(i === this.agentAt ? C.goldBright : "#f6ecc9")
                .border(u(1))
                .border_color(i === this.agentAt ? C.gold : C.parchmentEdge)
                .tooltip(a.installed ? `${a.name}: ${a.run.join(" ")}` : `${a.name} is not installed here`)
                .on_click((_e, cx) => {
                  this.agentAt = i;
                  cx.notify();
                })
                .child(programIcon(u, a, 18, { bare: true }))
                .child(div().text_color(a.installed ? C.ink : C.inkMuted).child(a.name)),
            ),
          ),
        )
      : div().text_color(C.inkMuted).child("Looking for agents (programs.json `run` entries)…");
    const towns = h_flex().flex_wrap().gap(u(4)).children(
      all.map((s, i) =>
        own(
          div()
            .id(`tr-town-${s.id}`)
            .px(u(6))
            .h(u(22))
            .flex()
            .items_center()
            .bg(i === this.spaceAt ? C.goldBright : "#f6ecc9")
            .border(u(1))
            .border_color(i === this.spaceAt ? C.gold : C.parchmentEdge)
            .text_color(C.ink)
            .on_click((_e, cx) => {
              this.spaceAt = i;
              cx.notify();
            })
            .child(s.name),
        ),
      ),
    );
    const body = v_flex()
      .gap(u(8))
      .child(div().child("Unit"))
      .child(agentRows)
      .child(div().child("Town"))
      .child(all.length ? towns : div().text_color(C.inkMuted).child("No town yet: the unit founds one where Herdr's default folder is."))
      .child(div().child("Orders (the agent's first message; optional)"))
      .child(this.input(u, this.text, { placeholder: "fix the login bug" }))
      .child(this.buttons(u, [this.btn(u, "ok", "Train", () => this.train(), { default: true, disabled: !list.length }), this.btn(u, "cancel", "Cancel", () => this.close())]));
    return this.frame(u, "Train a unit", body);
  }

  async setAlertSounds(on) {
    // Writes settings.json sounds.done/blocked to our files (only on explicit click),
    // keeping the previous values in shared("empires.prevSounds") to restore on un-check.
    const path = `${appHome()}/settings.json`;
    const text = await readTextFile(path);
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    const sounds = { ...(json.sounds ?? {}) };
    if (on) {
      setShared("empires.prevSounds", { done: sounds.done ?? null, blocked: sounds.blocked ?? null });
      sounds.done = `${ASSETS}/sounds/done.mp3`;
      sounds.blocked = `${ASSETS}/sounds/bell.mp3`;
    } else {
      const prev = shared("empires.prevSounds") ?? {};
      if (prev.done) sounds.done = prev.done;
      else delete sounds.done;
      if (prev.blocked) sounds.blocked = prev.blocked;
      else delete sounds.blocked;
    }
    json.sounds = sounds;
    await writeTextFile(path, JSON.stringify(json, null, 2) + "\n", text);
    setShared("empires.alerts", on);
  }

  renderOptions(u) {
    const map = { ...DEFAULT_RESOURCES, ...(shared("empires.resources") ?? {}) };
    const setMap = (k, v) => setShared("empires.resources", { ...map, [k]: v });
    const popcap = Number(shared("empires.popcap")) || DEFAULT_POPCAP;
    const thresholds = Array.isArray(shared("empires.ages")) ? shared("empires.ages") : DEFAULT_AGE_THRESHOLDS;
    const alerts = shared("empires.alerts") === true;
    const scale = shared("empires.scale") === 2 ? "2×" : "1×";
    const hudHidden = shared("empires.hud") === "hidden";
    const body = v_flex()
      .gap(u(6))
      .child(heading(u, "Resources", { size: 11, color: C.ink }))
      .children(["food", "wood", "gold", "stone"].map((k) => this.cycle(u, k, `${k[0].toUpperCase()}${k.slice(1)} counts`, map[k], SOURCES, (v) => setMap(k, v), RESOURCE_SOURCES[map[k]])))
      .child(this.cycle(u, "popcap", "Population cap", popcap, [8, 12, 16, 24, 32, 48, 64], (v) => setShared("empires.popcap", v), "Shown as live agents / cap. Cosmetic: Herdr never refuses a unit."))
      .child(this.cycle(u, "ages", "Age thresholds", thresholds.join("/"), ["0/3/10/25", "0/2/5/10", "0/5/15/40", "0/10/30/80"], (v) => setShared("empires.ages", v.split("/").map(Number)), "Completed tasks needed for Camp / Village / Keep / Crown"))
      .child(div().h(u(1)).w_full().bg(C.parchmentEdge))
      .child(heading(u, "Sound", { size: 11, color: C.ink }))
      .child(this.check(u, "mute", "Mute Empires sounds", shared("empires.mute") === true, () => setShared("empires.mute", shared("empires.mute") !== true), "UI clicks, horns and bells from this theme. Herdr's own alert sounds are separate."))
      .child(this.check(u, "alerts", "Use Empires alert sounds (writes settings.json sounds.done/blocked)", alerts, () => this.setAlertSounds(!alerts).catch((e) => console.log(`empires: alert sounds: ${e}`)), "Replaces Herdr's attention sounds with the town bell and the brass two-note; un-check restores the previous ones."))
      .child(div().h(u(1)).w_full().bg(C.parchmentEdge))
      .child(heading(u, "Look", { size: 11, color: C.ink }))
      .child(this.cycle(u, "scale", "HUD scale", scale, ["1×", "2×"], (v) => setShared("empires.scale", v === "2×" ? 2 : 1), "2× doubles every HUD pixel (high-DPI or large screens)"))
      .child(this.check(u, "hud", "Show the HUD (command card, selection, minimap)", !hudHidden, () => {
        setShared("empires.hud", hudHidden ? "shown" : "hidden");
        run("layout.toggle", { id: "hud" });
      }))
      .child(this.check(u, "herald", "Summon the herald (the advisor)", shared("empires.herald") !== "off", () => setShared("empires.herald", shared("empires.herald") === "off" ? "on" : "off")))
      .child(this.check(u, "boot", "Loading screen when entering the layout", shared("empires.boot") !== "off", () => setShared("empires.boot", shared("empires.boot") === "off" ? "on" : "off")))
      .child(this.check(u, "calm", "Calm mode: no ages, no pulses, no herald, no screens", calm(), () => setShared("empires.calm", !calm()), "For long days: the layout becomes a quiet HUD."))
      .child(this.check(u, "command", "Command layer (Phase 2): unit orders, queues, control groups", shared("empires.command") === true, () => setShared("empires.command", shared("empires.command") !== true), "Off by default. Orders send what you typed to agents through herdr-core; every destructive order confirms."))
      .child(this.buttons(u, [this.btn(u, "ok", "Close", () => this.close(), { default: true })]));
    return this.frame(u, "Options", body);
  }

  render(_cx) {
    const u = unit();
    let body;
    switch (this.kind) {
      case "screen":
        body = this.renderScreen(u);
        break;
      case "prompt":
        body = this.renderPrompt(u);
        break;
      case "confirm":
        body = this.renderConfirm(u);
        break;
      case "about":
        body = this.renderAbout(u);
        break;
      case "options":
        body = this.renderOptions(u);
        break;
      case "techtree":
        body = this.renderTechtree(u);
        break;
      case "chronicle":
        body = this.renderChronicle(u);
        break;
      case "train":
        body = this.renderTrain(u);
        break;
      default:
        body = this.renderMessage(u);
    }
    return root(
      u,
      v_flex()
        .id("dialog")
        .track_focus(this.focus)
        .on_key_down((e, cx) => this.key(e, cx))
        .size_full(),
    ).child(body);
  }
}
