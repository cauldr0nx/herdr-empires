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
import { props, closeOverlay, run, shared, setShared, keys, spaces, agents, knownAgents, appHome, home, readTextFile, writeTextFile, hc, notify } from "herdr";
import { C, ASSETS, DISPLAY, FONT_SC, VERSION, unit, root, parchment, plank, heading, button, label, glyph, own, perform, sfx, statusBadge, calm, programIcon, etch } from "../kit.js";
import { techTree, scoreboard, ageFor, AGES, DEFAULT_AGE_THRESHOLDS, RESOURCE_SOURCES, DEFAULT_RESOURCES, DEFAULT_POPCAP, elapsed, UNIT_TYPES, autoKey } from "../data.js";
import { queueOf, addToQueue, removeFromQueue, sendTo, commandMode } from "./queue.js";

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
    this.unitAt = 0;
    this.deploy = "visible";
    this.template = null; // the installed template's standing orders, read when the unit type changes
    if (this.kind === "train") {
      const all = spaces();
      this.spaceAt = Math.max(0, all.findIndex((s) => s.id === this.p.space));
      if (this.p.command) this.loadTemplate(cx);
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

  /** Reads the chosen unit's installed hc template (its standing orders), shown in full before training. */
  loadTemplate(cx) {
    const unit = UNIT_TYPES[this.unitAt];
    this.template = null;
    cx.spawn(async (cx) => {
      const dir = `${home()}/.config/herdr-core/templates`;
      const text = await readTextFile(`${dir}/empires-${unit.key}.md`).catch(() => null);
      if (text) {
        const body = text.replace(/^---[\s\S]*?---\s*/, "").replace(/<!--[\s\S]*?-->\s*/, "").trim();
        this.template = { name: `empires-${unit.key}`, body };
      }
      cx.notify();
    });
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
    const age = AGES[Math.min(AGES.length - 1, Number(this.p.age) || 0)];
    if (mode === "ageup") {
      return own(
        div()
          .id("ageup")
          .size_full()
          .flex()
          .flex_col()
          .on_click(() => this.close())
          .child(
            plank(u, h_flex().size_full().items_center().justify_center().gap(u(14)).child(image(`${ASSETS}/img/ornament.svg`).w(u(22)).h(u(22))).child(heading(u, `You have advanced to the ${age}`, { size: 18 })).child(image(`${ASSETS}/img/ornament.svg`).w(u(22)).h(u(22))), { full: true }),
          )
          .border_b(u(2))
          .border_color(C.gold),
      );
    }
    const picture = mode === "victory" ? "victory" : mode === "resign" ? "resign" : "loading";
    const title = mode === "victory" ? `Victory: the ${age}` : mode === "resign" ? "The realm rests. Returning to Herdr…" : "Herdr Empires";
    const tip = TIPS[(Number(shared("empires.bootAt")) || 0) % TIPS.length];
    return div()
      .id("screen")
      .size_full()
      .relative()
      .bg(C.stone.dark)
      .on_click(() => this.close())
      .child(image(`${ASSETS}/img/${picture}.svg`).absolute().top(0).left(0).size_full())
      .child(
        v_flex()
          .absolute()
          .bottom(u(40))
          .left(0)
          .w_full()
          .items_center()
          .gap(u(10))
          .child(heading(u, title, { size: 22 }))
          .when(mode === "victory", (el) => el.child(div().text_size(u(13)).text_color(C.text).child(`${Number(this.p.completed) || 0} tasks completed this session. The chronicle remembers.`)))
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
    if (this.kind === "prompt" || this.kind === "train" || this.kind === "send" || this.kind === "queue") {
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
      case "send":
        return this.sendMessage();
      case "queue":
        return this.queueAdd();
      default:
        this.close();
    }
  }

  train() {
    const agent = this.agents[this.agentAt];
    if (!agent) return;
    const space = spaces()[this.spaceAt];
    const task = this.text.trim();
    const unit = this.p.command ? UNIT_TYPES[this.unitAt] : null;
    this.close();
    sfx("train");
    if (!this.p.command) {
      run("tab.new", { ...(space ? { space: space.id } : {}), argv: agent.run, ...(task ? { task, name: task.slice(0, 24) } : {}) });
      return;
    }
    // The command layer (SPEC §14.4): the first message is the installed template's standing
    // orders (shown in full in this dialog) followed by what the person typed; nothing hidden.
    const orders = [this.template?.body, task].filter(Boolean).join("\n\n");
    const name = `${unit.name}${task ? ": " + task.slice(0, 20) : ""}`;
    if (this.deploy === "visible" || !space) {
      run("tab.new", { ...(space ? { space: space.id } : {}), argv: agent.run, name, ...(orders ? { task: orders } : {}) });
      return;
    }
    // A worker in the current building: a core terminal with Herdr's labels (it appears in that tab)
    // and our unit label, through herdr-core (verify the flags with `hc run --help`).
    const tab = space.tabs.find((t) => t.active) ?? space.tabs[0];
    const strip = (id) => (space.machine ? id.replace(new RegExp(`^${space.machine}/`), "") : id);
    const args = ["run", "--bg", "--keep", "--json", "--name", name, "--cwd", space.folder || ".", "--label", `herdr.space=${strip(space.id)}`, ...(tab ? ["--label", `herdr.tab=${strip(tab.id)}`] : []), "--label", `empires.unit=${unit.key}`, ...(space.machine ? ["--on", space.machine] : []), "--", ...agent.run];
    hc(args)
      .then(async (r) => {
        if (r.code !== 0) return notify({ title: "Training failed", body: r.stderr || r.stdout || "hc run failed", level: "error" });
        let address = null;
        try { address = JSON.parse(r.stdout).address ?? null; } catch {}
        if (address && orders) await sendTo(address, orders);
        notify({ title: `${unit.name} trained`, body: `${agent.name} in ${space.name}${address ? ` (${address})` : ""}`, level: "success", ...(address ? { action: { name: "agent.focus", args: { terminal: address } } } : {}) });
      })
      .catch((e) => notify({ title: "Training failed", body: String(e), level: "error" }));
  }

  sendMessage() {
    const text = this.text.trim();
    const targets = this.p.targets ?? [];
    if (!text || !targets.length) return;
    this.close();
    sfx("select");
    for (const t of targets) sendTo(t, text).then((r) => { if (r.code !== 0) notify({ title: "Message not delivered", body: `${t}: ${r.stderr || r.stdout || "hc send failed"}`, level: "error" }); }).catch((e) => notify({ title: "Message not delivered", body: `${t}: ${e}`, level: "error" }));
  }

  queueAdd() {
    const text = this.text.trim();
    if (!text || !this.p.space) return;
    addToQueue(this.p.space, text, this.queueUnit ?? null);
    this.text = "";
    this.fresh = false;
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
    const unitRows = this.p.command
      ? h_flex().flex_wrap().gap(u(4)).children(
          UNIT_TYPES.map((t, i) =>
            own(
              h_flex()
                .id(`tr-unit-${t.key}`)
                .items_center()
                .gap(u(5))
                .px(u(6))
                .h(u(24))
                .bg(i === this.unitAt ? C.goldBright : "#f6ecc9")
                .border(u(1))
                .border_color(i === this.unitAt ? C.gold : C.parchmentEdge)
                .tooltip(`${t.name}: ${t.role}`)
                .on_click((_e, cx) => {
                  this.unitAt = i;
                  this.loadTemplate(cx);
                  cx.notify();
                })
                .child(glyph(u, t.glyph, 13, C.ink))
                .child(div().text_color(C.ink).child(t.name)),
            ),
          ),
        )
      : null;
    const deployRows = this.p.command
      ? h_flex().gap(u(4)).children(
          [["visible", "A new building (tab) in the town"], ["worker", "A worker in the current building (hc run, labelled)"]].map(([k, tip]) =>
            own(
              div()
                .id(`tr-deploy-${k}`)
                .px(u(6))
                .h(u(22))
                .flex()
                .items_center()
                .bg(this.deploy === k ? C.goldBright : "#f6ecc9")
                .border(u(1))
                .border_color(this.deploy === k ? C.gold : C.parchmentEdge)
                .text_color(C.ink)
                .tooltip(tip)
                .on_click((_e, cx) => {
                  this.deploy = k;
                  cx.notify();
                })
                .child(k === "visible" ? "new building" : "worker here"),
            ),
          ),
        )
      : null;
    const templateBox = this.p.command
      ? v_flex()
          .gap(u(2))
          .child(div().text_size(u(11)).text_color(C.inkMuted).child(this.template ? `Standing orders from ${this.template.name} (sent first, in full):` : `No installed template for this unit (tools/install.sh --templates); only your orders are sent.`))
          .when(Boolean(this.template), (el) => el.child(div().max_h(u(90)).overflow_y_scroll().p(u(4)).bg("#f6ecc9").border(u(1)).border_color(C.parchmentEdge).text_size(u(11)).text_color(C.ink).children(lines(this.template.body))))
      : null;
    const body = v_flex()
      .gap(u(8))
      .when(Boolean(unitRows), (el) => el.child(div().child("Unit type")).child(unitRows).child(templateBox))
      .child(div().child(this.p.command ? "Agent program" : "Unit"))
      .child(agentRows)
      .when(Boolean(deployRows), (el) => el.child(div().child("Deploy as")).child(deployRows))
      .child(div().child("Town"))
      .child(all.length ? towns : div().text_color(C.inkMuted).child("No town yet: the unit founds one where Herdr's default folder is."))
      .child(div().child("Orders (the agent's first message; optional)"))
      .child(this.input(u, this.text, { placeholder: "fix the login bug" }))
      .child(this.buttons(u, [this.btn(u, "ok", "Train", () => this.train(), { default: true, disabled: !list.length }), this.btn(u, "cancel", "Cancel", () => this.close())]));
    return this.frame(u, "Train a unit", body);
  }

  renderSend(u) {
    const names = String(this.p.names ?? "").split("\n").filter(Boolean);
    const body = v_flex()
      .gap(u(8))
      .child(div().child(`To ${names.length} unit${names.length === 1 ? "" : "s"} (exactly this text, through hc send):`))
      .child(v_flex().gap(u(1)).children(names.map((n) => div().text_size(u(11.5)).text_color(C.inkMuted).child(`• ${n}`))))
      .child(this.input(u, this.text, { placeholder: "continue; run the tests when done" }))
      .child(this.buttons(u, [this.btn(u, "ok", "Send", () => this.sendMessage(), { default: true, disabled: !this.text.trim() }), this.btn(u, "cancel", "Cancel", () => this.close())]));
    return this.frame(u, this.p.title ?? "Send a message", body);
  }

  renderQueue(u) {
    const spaceId = this.p.space;
    const space = spaces().find((s) => s.id === spaceId);
    const q = queueOf(spaceId);
    const auto = shared(autoKey(spaceId)) === true;
    const idle = agents().filter((a) => a.space === spaceId && a.status === "idle");
    const rows = q.map((item, i) =>
      h_flex()
        .gap(u(6))
        .items_center()
        .child(div().flex_none().w(u(18)).text_color(C.inkMuted).child(`${i + 1}.`))
        .child(div().flex_1().truncate().text_color(C.ink).child(item.task))
        .child(div().flex_none().text_size(u(10.5)).text_color(C.inkMuted).child(item.unit ? `for ${item.unit}` : "any unit"))
        .child(own(div().id(`q-send-${i}`).flex_none().px(u(4)).text_size(u(11)).text_color(idle.length ? C.gold : C.inkMuted).hover((s) => s.underline()).tooltip(idle.length ? `Send now to ${idle[0].program?.name ?? "the idle unit"} in ${space?.name}` : "No idle unit in this town").on_click((_e, cx) => {
          if (!idle.length) return;
          sendTo(idle[0].address, item.task).then((r) => { if (r.code === 0) removeFromQueue(spaceId, i); else notify({ title: "Dispatch failed", body: r.stderr || r.stdout || "hc send failed", level: "error" }); }).catch((e) => notify({ title: "Dispatch failed", body: String(e), level: "error" }));
          cx.notify();
        }).child("dispatch")))
        .child(own(div().id(`q-del-${i}`).flex_none().p(u(2)).hover((s) => s.bg(C.parchmentDark)).tooltip("Remove this order").on_click((_e, cx) => {
          removeFromQueue(spaceId, i);
          cx.notify();
        }).child(glyph(u, "close", 8, C.inkMuted)))),
    );
    const unitPick = h_flex().flex_wrap().gap(u(3)).children(
      [{ key: null, name: "any unit" }, ...UNIT_TYPES].map((t) =>
        own(
          div()
            .id(`q-unit-${t.key ?? "any"}`)
            .px(u(5))
            .h(u(20))
            .flex()
            .items_center()
            .text_size(u(11))
            .bg((this.queueUnit ?? null) === t.key ? C.goldBright : "#f6ecc9")
            .border(u(1))
            .border_color((this.queueUnit ?? null) === t.key ? C.gold : C.parchmentEdge)
            .text_color(C.ink)
            .on_click((_e, cx) => {
              this.queueUnit = t.key;
              cx.notify();
            })
            .child(t.name),
        ),
      ),
    );
    const body = v_flex()
      .gap(u(8))
      .child(div().text_color(C.inkMuted).child(`Orders wait here until a unit of ${space?.name ?? "the town"} goes idle. Nothing is ever sent to a unit under attack (blocked).`))
      .child(q.length ? v_flex().gap(u(3)).children(rows) : div().text_color(C.inkMuted).child("The queue is empty."))
      .child(div().h(u(1)).w_full().bg(C.parchmentEdge))
      .child(div().child("New order (sent as typed)"))
      .child(this.input(u, this.text, { placeholder: "run the test suite and report failures" }))
      .child(unitPick)
      .child(this.check(u, "auto", `Auto-dispatch in ${space?.name ?? "this town"}: send the next order when a unit goes idle (else the herald asks)`, auto, () => setShared(autoKey(spaceId), !auto)))
      .child(this.buttons(u, [this.btn(u, "add", "Queue it", (_e, cx) => { this.queueAdd(); cx.notify(); }, { default: true, disabled: !this.text.trim() }), this.btn(u, "ok", "Close", () => this.close())]));
    return this.frame(u, this.p.title ?? "Production queue", body);
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
      case "send":
        body = this.renderSend(u);
        break;
      case "queue":
        body = this.renderQueue(u);
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
