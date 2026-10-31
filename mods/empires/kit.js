// Herdr Empires drawing kit: the palette, stone bevels, wood planks, parchment,
// gold trim, buttons, icons, status bars, menus, dialogs and sounds shared by
// every role of the empires mod. Modelled on Herdr 98's kit.js (Apache-2.0).
//
// Pixels: `unit()` gives u(n): n design px in layout px, so a 1 px bevel stays
// crisp at any zoom (scale 2 doubles every pixel for high-DPI "large HUD").

import { div, svg, image, PathBuilder, Background } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { settings, shared, setShared, playSound, run, layout, openOverlay, closeOverlay, exec, hc, window as appWindow } from "herdr";

// ---- palette (SPEC §4.1)

export const C = {
  stone: { face: "#6e665a", light: "#8c8375", hi: "#b0a693", shadow: "#3d382f", dark: "#1f1c17" },
  wood: { dark: "#2e1f12", mid: "#4f341c", light: "#7a5230" },
  parchment: "#e9d8ae",
  parchmentEdge: "#c9b07a",
  parchmentDark: "#d9c48e",
  ink: "#2a1c0d",
  inkMuted: "#6b5536",
  gold: "#b8922a",
  goldBright: "#ecc95a",
  text: "#f1e6c8",
  textDim: "#cdbf9c",
  terminal: "#16110b",
  selection: "#5a4320",
  working: "#e0a63a",
  blocked: "#d63c2e",
  done: "#79bd4a",
  idle: "#8f8678",
  unknown: "#6f685d",
  none: "#00000000",
  shade: "#00000066",
};

export const STATUS_COLOR = { working: C.working, blocked: C.blocked, done: C.done, idle: C.idle };

export const FONT = "Alegreya Sans";
export const FONT_SC = "Alegreya Sans SC";
export const DISPLAY = "Cinzel";
export const ASSETS = "mods/empires";
export const VERSION = "0.1.0";

// ---- pixels

export function zoom() {
  return Number(settings()?.zoom) || 1;
}

export function scale() {
  return shared("empires.scale") === 2 ? 2 : 1;
}

export function unit() {
  const k = scale() / zoom();
  const u = (n) => n * k;
  u.k = k;
  return u;
}

export function calm() {
  return shared("empires.calm") === true;
}

// ---- text

/** A label in the UI font. `&Train` underlines the T (its access key). */
export function label(text, o = {}) {
  const s = String(text ?? "");
  const amp = o.noAccess ? -1 : s.indexOf("&");
  let el;
  if (amp >= 0 && amp < s.length - 1) {
    el = h_flex().flex_none();
    if (amp > 0) el = el.child(div().child(s.slice(0, amp)));
    el = el.child(div().underline().child(s[amp + 1]));
    if (amp + 2 < s.length) el = el.child(div().child(s.slice(amp + 2)));
  } else {
    el = div().child(s);
  }
  if (o.bold) el = el.font_weight(700);
  if (o.color) el = el.text_color(o.color);
  if (o.size) el = el.text_size(o.size);
  if (o.display) el = el.font_family(DISPLAY);
  if (o.sc) el = el.font_family(FONT_SC);
  if (o.truncate) el = el.truncate();
  return el;
}

export function plain(text) {
  return String(text ?? "").replace(/&(.)/, "$1");
}

/** A Cinzel heading, small-caps feel (uppercase + tracking by spacing). */
export function heading(u, text, o = {}) {
  return div()
    .font_family(DISPLAY)
    .font_weight(700)
    .text_size(u(o.size ?? 13))
    .text_color(o.color ?? C.goldBright)
    .whitespace_nowrap()
    .child(String(text ?? "").toUpperCase());
}

/** The root of every role: UI font, size and colour. */
export function root(u, el) {
  return el.font_family(FONT).text_size(u(12.5)).line_height(`${u(15)}px`).text_color(C.text);
}

// ---- bevels: stacked 1 px borders, like Herdr 98

// Layers from outside in: [right+bottom colour, top+left colour].
const BEVEL = {
  raised: [[C.stone.dark, C.stone.hi], [C.stone.shadow, C.stone.light]],
  pressed: [[C.stone.hi, C.stone.dark], [C.stone.light, C.stone.shadow]],
  inset: [[C.stone.hi, C.stone.dark], [C.stone.light, C.stone.shadow]],
  panel: [[C.stone.dark, C.stone.light], [C.stone.shadow, C.stone.hi]],
  well: [[C.stone.hi, C.stone.shadow]],
  thin: [[C.stone.shadow, C.stone.hi]],
  gold: [[C.gold, C.goldBright], [C.wood.dark, C.gold]],
  goldThin: [[C.gold, C.goldBright]],
  wood: [[C.wood.dark, C.wood.light], [C.wood.mid, C.wood.light]],
  parchment: [[C.ink, C.parchmentEdge], [C.parchmentEdge, "#f6ecc9"]],
  flat: [],
};

/**
 * Wraps `content` in a bevel. o: { id, press: kind shown while held (needs id),
 * bg, pad: n | [y, x], center }. Chain size and flex on the result.
 */
export function bevel(u, kind, content, o = {}) {
  const layers = BEVEL[kind] ?? [];
  const held = o.press ? BEVEL[o.press] : null;
  const pad = Array.isArray(o.pad) ? o.pad : [o.pad ?? 0, o.pad ?? 0];
  let inner = div().flex().flex_col().flex_1().min_w(0).min_h(0).pt(u(pad[0])).pb(u(pad[0])).pl(u(pad[1])).pr(u(pad[1]));
  if (o.bg) inner = inner.bg(o.bg);
  if (o.center) inner = inner.items_center().justify_center();
  if (o.id && held && o.shift !== false)
    inner = inner.id(`${o.id}~c`).active((s) => s.pt(u(pad[0] + 1)).pb(u(Math.max(0, pad[0] - 1))).pl(u(pad[1] + 1)).pr(u(Math.max(0, pad[1] - 1))));
  inner = inner.child(content);
  let el = inner;
  const press = Boolean(o.id && held);
  for (let i = layers.length - 1; i >= 0; i--) {
    const [rb, tl] = layers[i];
    const [hrb, htl] = press ? (held[i] ?? held[held.length - 1]) : [rb, tl];
    let a = (press ? div().id(`${o.id}~t${i}`) : div()).flex().flex_col().flex_1().min_w(0).min_h(0).border_t(u(1)).border_l(u(1)).border_color(tl);
    let b = (press ? div().id(`${o.id}~b${i}`) : div()).flex().flex_col().min_w(0).min_h(0).border_r(u(1)).border_b(u(1)).border_color(rb);
    if (press) {
      a = a.active((s) => s.border_color(htl));
      b = b.active((s) => s.border_color(hrb));
    }
    b = b.child(a.child(el));
    if (i > 0) b = b.flex_1();
    el = b;
  }
  if (!layers.length) el = div().flex().flex_col().child(inner);
  return el;
}

/** A press of a control in a window_drag bar, or a float, is the control's. */
export function own(el) {
  return el.on_mouse_down("left", (_e, cx) => cx.stop_propagation());
}

// ---- gradients and materials

const RECT = () => PathBuilder.fill().move_to("0%", "0%").line_to("100%", "0%").line_to("100%", "100%").line_to("0%", "100%").close().build();

/** A layer that fills its parent (relative) with a gradient. */
export function gradient(from, to, angle = 90) {
  return window.paint_path(RECT(), Background.linear_gradient(angle, from, to)).absolute().top(0).left(0).size_full();
}

/** A wood plank: dark-to-mid gradient, a light grain line at the top, a dark one at the bottom. */
export function plank(u, content, o = {}) {
  const h = o.h ? u(o.h) : null;
  let el = div()
    .relative()
    .flex()
    .flex_col()
    .min_w(0)
    .min_h(0)
    .bg(C.wood.mid)
    .child(gradient(C.wood.light, C.wood.dark, o.angle ?? 180))
    .child(div().absolute().top(0).left(0).w_full().h(u(1)).bg("#9a6a3c"))
    .child(div().absolute().bottom(0).left(0).w_full().h(u(1)).bg("#1a1109"))
    .child(div().relative().flex().flex_col().flex_1().min_w(0).min_h(0).child(content));
  if (h !== null) el = el.h(h);
  if (o.full) el = el.size_full();
  return el;
}

/** A stone panel (HUD background) with a raised edge. */
export function stone(u, content, o = {}) {
  return bevel(u, o.kind ?? "panel", div().relative().size_full().flex().flex_col().min_w(0).min_h(0).child(gradient("#776f62", "#5e574c", 180)).child(div().relative().flex().flex_col().flex_1().min_w(0).min_h(0).child(content)), { pad: o.pad ?? 0, bg: C.stone.face });
}

/** A parchment sheet (dialogs, tooltips, menus): edge-coloured border, warm paper. */
export function parchment(u, content, o = {}) {
  return bevel(u, "parchment", div().relative().flex().flex_col().flex_1().min_w(0).min_h(0).child(gradient("#f0e2bd", C.parchment, 160)).child(div().relative().flex().flex_col().flex_1().min_w(0).min_h(0).text_color(C.ink).child(content)), { pad: o.pad ?? [6, 8], bg: C.parchment });
}

/** Gold trim: the focused / selected state everywhere. */
export function goldFrame(u, content, o = {}) {
  return bevel(u, o.thin ? "goldThin" : "gold", content, { pad: o.pad ?? 0, bg: o.bg });
}

/** An etched line: vertical (in bars) or horizontal (menus, dialogs). */
export function etch(u, vertical = false) {
  return vertical
    ? h_flex().flex_none().h_full().child(div().w(u(1)).h_full().bg(C.stone.shadow)).child(div().w(u(1)).h_full().bg(C.stone.hi))
    : v_flex().flex_none().w_full().child(div().h(u(1)).w_full().bg(C.stone.shadow)).child(div().h(u(1)).w_full().bg(C.stone.hi));
}

// ---- icons

/** One of our generated icons: 32 px art, drawn at `size` (16 px variants as name-sm.svg). */
export function icon(u, name, size = 16) {
  const file = size <= 16 ? `${name}-sm` : name;
  return image(`${ASSETS}/icons/${file}.svg`).flex_none().w(u(size)).h(u(size));
}

/** A one-colour glyph (tinted): command-card and status glyphs. */
export function glyph(u, name, size = 16, color = C.text) {
  return svg(`${ASSETS}/icons/${name}.svg`).flex_none().w(u(size)).h(u(size)).text_color(color);
}

/** A program's icon from the app's table, in a small stone frame: the unit portrait. */
export function programIcon(u, program, size = 16, o = {}) {
  const inner = size - 4;
  let pic;
  if (!program || !program.icon) pic = glyph(u, program?.shell || !program ? "worker" : "unit", inner, C.text);
  else if (program.tint) pic = svg(program.icon).flex_none().w(u(inner)).h(u(inner)).text_color(program.color ?? C.text);
  else pic = image(program.icon).flex_none().w(u(inner)).h(u(inner));
  if (o.bare) return pic;
  return bevel(u, o.gold ? "goldThin" : "well", div().flex().items_center().justify_center().size_full().bg(program?.tile ?? C.stone.dark).child(pic), { pad: 0 })
    .flex_none()
    .w(u(size))
    .h(u(size));
}

// ---- buttons

/**
 * A stone push button, gold on hover. o: { w, h, minW, default (gold outline),
 * toggled (stays pressed), disabled, bold, pad: [y, x], tooltip, hotkey (corner letter), onDown, onRight }.
 */
export function button(u, id, content, onClick, o = {}) {
  const kind = o.toggled ? "pressed" : "raised";
  const text = typeof content === "string" ? label(content, { bold: o.bold, color: o.disabled ? C.stone.hi : undefined }) : content;
  let face = h_flex().relative().flex_1().min_w(0).min_h(0).items_center().justify_center().gap(u(4)).child(text);
  if (o.hotkey) face = face.child(div().absolute().right(u(1)).bottom(u(-1)).text_size(u(9)).font_family(FONT_SC).text_color(C.goldBright).child(String(o.hotkey)));
  let b = bevel(u, kind, face, {
    id: o.disabled ? undefined : id,
    press: o.disabled || o.toggled ? undefined : "pressed",
    pad: o.pad ?? [0, 4],
    bg: o.disabled ? C.stone.shadow : o.toggled ? C.stone.shadow : o.bg ?? C.stone.face,
  });
  if (o.default) b = div().flex().flex_col().border(u(1)).border_color(C.gold).child(b.flex_1());
  b = b.id(`${id}~btn`);
  if (!o.disabled) b = b.hover((s) => s.border_color(C.goldBright));
  if (o.w) b = b.w(u(o.w));
  if (o.minW) b = b.min_w(u(o.minW));
  if (o.h) b = b.h(u(o.h));
  if (o.tooltip) b = b.tooltip(o.tooltip);
  b = b.on_mouse_down("left", (e, cx) => {
    cx.stop_propagation();
    o.onDown?.(e, cx);
  });
  if (o.onRight)
    b = b.on_mouse_down("right", (e, cx) => {
      cx.stop_propagation();
      o.onRight(e, cx);
    });
  if (!o.disabled && onClick)
    b = b.on_click((e, cx) => {
      if (o.sound !== false) sfx("click");
      onClick(e, cx);
    });
  return b;
}

/** A small stone control with a glyph (pane header buttons). */
export function control(u, id, glyphName, onClick, tooltip, o = {}) {
  return button(u, id, glyph(u, glyphName, 10, C.text), onClick, { w: o.w ?? 18, h: o.h ?? 16, pad: [0, 0], tooltip, sound: false }).flex_none();
}

// ---- status (SPEC §7.2)

/** An HP-style status bar: amber shimmer while working, red pulse when blocked, green when done, gray when idle. */
export function statusBar(u, status, o = {}) {
  const color = STATUS_COLOR[status] ?? C.unknown;
  const w = o.w ?? 56;
  const fill = status === "working" ? 0.7 : status === "blocked" ? 0.35 : status === "done" ? 1 : status === "idle" ? 0.5 : 0;
  let bar = div().relative().flex_none().w(u(w)).h(u(o.h ?? 7)).bg(C.stone.dark).border(u(1)).border_color(C.stone.shadow);
  let inner = div().absolute().top(0).left(0).h_full().w(`${Math.round(fill * 100)}%`).bg(color);
  if (!calm()) {
    if (status === "working") inner = inner.loop("opacity", { from: 0.55, to: 1, period: 1600 });
    if (status === "blocked") inner = inner.loop("opacity", { from: 0.3, to: 1, period: 700 });
  }
  bar = bar.child(inner);
  // Segments like an HP bar.
  for (let i = 1; i < 4; i++) bar = bar.child(div().absolute().top(0).left(`${i * 25}%`).w(u(1)).h_full().bg(C.stone.dark));
  return bar;
}

/** The badge for a status: hourglass, crossed swords, laurel; null when idle. */
export function statusBadge(u, status, size = 12) {
  const name = status === "working" ? "hourglass" : status === "blocked" ? "swords" : status === "done" ? "laurel" : null;
  if (!name) return null;
  let b = glyph(u, name, size, STATUS_COLOR[status]);
  if (status === "blocked" && !calm()) b = b.loop("opacity", { from: 0.25, to: 1, period: 700 });
  return b;
}

/** A pennant in a player colour: a small triangle flag on a pole. */
export function pennant(u, color, size = 14) {
  const flag = PathBuilder.fill().move_to(`${20}%`, "0%").line_to("100%", "35%").line_to("20%", "70%").close().build();
  return div()
    .relative()
    .flex_none()
    .w(u(size))
    .h(u(size))
    .child(div().absolute().left(u(2)).top(0).w(u(1.5)).h_full().bg(C.wood.light))
    .child(window.paint_path(flag, color).absolute().top(0).left(0).size_full());
}

// ---- menus (SPEC §6.7)

export const MENU = { row: 22, sep: 9, frame: 6 };

/** A menu's size in design px. */
export function menuSize(items) {
  let rows = 0;
  let seps = 0;
  let longest = 0;
  let keys = 0;
  for (const it of items) {
    if (it.sep) {
      seps++;
      continue;
    }
    rows++;
    longest = Math.max(longest, plain(it.label).length);
    keys = Math.max(keys, (it.shortcut ?? "").length);
  }
  const w = Math.max(150, 34 + longest * 6.5 + (keys ? keys * 6 + 24 : 0) + 24);
  const h = rows * MENU.row + seps * MENU.sep + MENU.frame * 2;
  return { w, h };
}

/**
 * Opens a parchment popup menu (the menu role). items: [{ label: "&Train",
 * icon, shortcut, act: { run: [command, args], dialog, shared, sound, url },
 * sub: [items], disabled, checked, radio, bold, sep: true }]. at: window px, or
 * { below: bounds }. Returns its overlay id.
 */
export function openMenu(items, at, o = {}) {
  const k = scale();
  const { w, h } = menuSize(items);
  const width = o.width ?? w;
  let where = at;
  if (at?.below) where = { x: at.below.x, y: at.below.y + at.below.height + 2 };
  if (at?.above) where = { x: at.above.x, y: Math.max(0, at.above.y - h * k) };
  return openOverlay({
    mod: "empires",
    kind: "popup",
    frame: "none",
    width: (width * k) / zoom(),
    height: (h * k) / zoom(),
    ...(where ? { at: where } : {}),
    props: { role: "menu", items, parents: o.parents ?? [], owner: o.owner ?? null },
  });
}

const DIALOG_W = { prompt: 360, confirm: 360, about: 420, options: 500, techtree: 520, chronicle: 520, train: 460, message: 360, send: 420, queue: 460 };

/** Opens a parchment dialog (the dialog role): kind and its props. Full-window screens use `screen`. */
export function openDialog(kind, p = {}) {
  const k = scale();
  if (kind === "screen") {
    // Age-up: a full-width banner over the resource bar, not modal (SPEC §7.3).
    if (p.mode === "ageup") return openOverlay({ mod: "empires", kind: "window", frame: "none", at: { x: 0, y: 0 }, width: 1, height: (52 * k) / zoom(), props: { role: "dialog", kind, ...p } });
    return openOverlay({ mod: "empires", kind: "dialog", frame: "none", modal: true, width: 1, height: 1, props: { role: "dialog", kind, ...p } });
  }
  const w = p.width ?? DIALOG_W[kind] ?? 380;
  return openOverlay({
    mod: "empires",
    kind: p.window ? "window" : "dialog",
    frame: "none",
    modal: p.modal ?? false,
    width: (w * k) / zoom(),
    ...(p.height ? { height: (p.height * k) / zoom() } : {}),
    props: { role: "dialog", kind, ...p },
  });
}

/**
 * Does what a menu item or button says: { run: [cmd, args], runEach: [cmd, [args...]],
 * hcEach: [subcommand, [address...]] (one `hc <subcommand> <address>` per unit),
 * dialog, shared, sound, url }.
 */
export function perform(act) {
  if (!act) return;
  if (act.sound) sfx(act.sound);
  if (act.run) run(act.run[0], act.run[1] ?? {});
  if (act.runEach) for (const args of act.runEach[1] ?? []) run(act.runEach[0], args ?? {});
  if (act.hcEach) for (const address of act.hcEach[1] ?? []) hc([act.hcEach[0], address]).catch((e) => console.log(`empires: hc ${act.hcEach[0]} ${address}: ${e}`));
  if (act.dialog) openDialog(act.dialog.kind, act.dialog);
  if (act.shared) setShared(act.shared[0], act.shared[1]);
  if (act.url) {
    const mac = appWindow()?.platform === "macos";
    exec(mac ? "open" : "xdg-open", [act.url]).catch(() => {});
  }
}

export { closeOverlay };

// ---- sounds (SPEC §4.4)

/** Plays an Empires UI sound unless sounds are off (settings, or the in-theme mute). */
export function sfx(name) {
  if (settings()?.sounds?.enabled === false) return;
  if (shared("empires.mute") === true) return;
  try {
    playSound(`${ASSETS}/sounds/${name}.mp3`);
  } catch {}
}

// ---- the layout's pixel sizes, kept whole at any zoom (SPEC §5.2, R9), and
// the narrow (< 900 px) two-row HUD (SPEC §5.1).

export const FIT = { resources: 34, hud: 150, hudNarrow: 232, command: 260, minimap: 220, header: 26, border: 3, selectionNarrow: 78 };

function findNode(n, id) {
  if (!n || typeof n !== "object") return null;
  if (n.id === id) return n;
  for (const c of n.children ?? []) {
    const f = findNode(c, id);
    if (f) return f;
  }
  return null;
}

/**
 * Sizes the layout's bars in design px for this zoom and scale, and swaps the
 * HUD between its wide row and the narrow two-row tree; true if it changed.
 * Only on our own layout (shared("layout") === "empires"); Herdr drops unknown
 * fields such as x_empires from layout(), so the guard is the layout's name.
 */
export function fitLayout(narrow = false) {
  if (shared("layout") !== "empires") return false;
  const l = layout();
  if (!l || typeof l !== "object" || !findNode(l, "hud")) return false;
  const k = scale() / zoom();
  const want = (n) => Math.round(n * k * 1000) / 1000;
  let changed = false;
  const hud = findNode(l, "hud");
  const isNarrowTree = hud.type === "column";
  if (narrow !== isNarrowTree) {
    const command = findNode(hud, "command") ?? { id: "command", type: "block", content: { mod: "empires", props: { role: "command" } } };
    const selection = findNode(hud, "selection") ?? { id: "selection", type: "block", content: { mod: "empires", props: { role: "selection" } } };
    const minimap = findNode(hud, "minimap") ?? { id: "minimap", type: "block", content: { mod: "empires", props: { role: "minimap" } } };
    delete selection.size;
    if (narrow) {
      selection.size = { px: want(FIT.selectionNarrow) };
      hud.type = "column";
      hud.children = [selection, { id: "hudrow", type: "row", resizable: false, children: [command, minimap] }];
      hud.size = { px: want(FIT.hudNarrow) };
    } else {
      hud.type = "row";
      hud.children = [command, selection, minimap];
      hud.size = { px: want(FIT.hud) };
    }
    changed = true;
  }
  const visit = (n) => {
    if (!n || typeof n !== "object") return;
    let target = FIT[n.id];
    if (n.id === "hud") target = narrow ? FIT.hudNarrow : FIT.hud;
    if (n.id === "selection") target = narrow ? FIT.selectionNarrow : null;
    if (target && Math.abs((n.size?.px ?? 0) - want(target)) > 0.01) {
      n.size = { px: want(target) };
      run("layout.resize", { id: n.id, px: n.size.px });
      changed = true;
    }
    const pane = n.content?.pane;
    if (pane?.header && Math.abs((pane.header.height ?? 0) - want(FIT.header)) > 0.01) {
      pane.header.height = want(FIT.header);
      changed = true;
    }
    if (pane && Math.abs((pane.border?.width ?? 0) - want(FIT.border)) > 0.01) {
      pane.border = { width: want(FIT.border), color: C.wood.mid };
      pane.focus = { width: want(FIT.border), color: C.gold };
      changed = true;
    }
    for (const c of n.children ?? []) visit(c);
  };
  visit(l);
  if (changed) run("layout.set", { layout: l });
  return changed;
}
