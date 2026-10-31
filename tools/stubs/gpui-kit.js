// A stand-in for Herdr's `gpui-kit` module, for `tools/check.ts` (SPIKES.md R6).
// Builds a description tree the checker can validate: method names against the
// real gpui-shell surface, children consumed once, handlers with ids, motion
// policies, asset paths. It draws nothing.

export const KNOWN = new Set([
  // Parameterised styles (gpui-shell style.rs PARAM_STYLES).
  "w","h","size","min_w","min_h","min_size","max_w","max_h","max_size","p","px","py","pt","pb","pl","pr","m","mx","my","mt","mb","ml","mr",
  "inset","top","bottom","left","right","gap","gap_x","gap_y","flex_grow","flex_shrink","flex_basis","bg","text_color","text_bg","text_size",
  "font_family","font_weight","line_height","opacity","border","border_t","border_b","border_l","border_r","border_x","border_y","border_color",
  "rounded","rounded_t","rounded_b","rounded_l","rounded_r","rounded_tl","rounded_tr","rounded_bl","rounded_br",
  // Nullary styles (GPUI Styled + gpui-base + style_helpers macros).
  "flex","flex_1","flex_auto","flex_col","flex_col_reverse","flex_grow_0","flex_grow_1","flex_initial","flex_none","flex_nowrap","flex_row",
  "flex_row_reverse","flex_shrink_0","flex_shrink_1","flex_wrap","flex_wrap_reverse","grid","block","hidden","visible","invisible",
  "items_baseline","items_center","items_end","items_start","items_stretch","justify_around","justify_between","justify_center","justify_end",
  "justify_evenly","justify_start","self_baseline","self_center","self_end","self_start","self_stretch","content_center","content_start","content_end",
  "content_between","content_around","content_evenly","content_stretch","content_normal",
  "italic","not_italic","line_through","underline","truncate","text_ellipsis","text_ellipsis_middle","text_ellipsis_start","text_left","text_center",
  "text_right","text_justify","text_xs","text_sm","text_base","text_lg","text_xl","text_2xl","text_3xl","whitespace_normal","whitespace_nowrap",
  "text_decoration_0","text_decoration_1","text_decoration_2","text_decoration_4","text_decoration_8","text_decoration_none","text_decoration_solid","text_decoration_wavy",
  "font_thin","font_extralight","font_light","font_normal","font_medium","font_semibold","font_bold","font_extrabold","font_black",
  "overflow_hidden","overflow_x_hidden","overflow_y_hidden","overflow_scroll","overflow_x_scroll","overflow_y_scroll","overflow_scrollbar","overflow_x_scrollbar","overflow_y_scrollbar",
  "cursor_default","cursor_pointer","cursor_text","cursor_move","cursor_not_allowed","cursor_context_menu","cursor_crosshair","cursor_vertical_text","cursor_alias",
  "cursor_copy","cursor_no_drop","cursor_grab","cursor_grabbing","cursor_ew_resize","cursor_ns_resize","cursor_nesw_resize","cursor_nwse_resize","cursor_col_resize","cursor_row_resize","cursor_n_resize","cursor_e_resize","cursor_s_resize","cursor_w_resize",
  "absolute","relative","inset_0","top_0","bottom_0","left_0","right_0","size_full","w_full","h_full","w_auto","h_auto","w_0","h_0","min_w_0","min_h_0","max_w_full","max_h_full",
  "rounded_none","rounded_sm","rounded_md","rounded_lg","rounded_xl","rounded_2xl","rounded_3xl","rounded_full",
  "border_0","border_1","border_2","border_4","border_8","border_t_0","border_t_1","border_t_2","border_b_0","border_b_1","border_b_2","border_l_0","border_l_1","border_l_2","border_r_0","border_r_1","border_r_2","border_dashed",
  "shadow_none","shadow_2xs","shadow_xs","shadow_sm","shadow_md","shadow_lg","shadow_xl","shadow_2xl",
  "gap_0","gap_1","gap_2","gap_3","gap_4","p_0","p_1","p_2","p_3","p_4","px_0","px_1","px_2","px_3","px_4","py_0","py_1","py_2","py_3","py_4","m_0","m_1","m_2","m_3","m_4",
  "occlude","aspect_square","debug","debug_below","block_mouse_except_scroll","focusable","tab_group",
  // Behaviours (gpui-shell NON_STYLE_METHODS + motion).
  "map","child","children","content","trigger","input","when","on_click","on_mouse_move","on_hover","on_key_down","on_key_up","on_modifiers_changed",
  "on_mouse_down","on_mouse_up","on_mouse_down_out","on_drop","on_scroll_wheel","on_action","key_context","image","fallback","header","footer","panel",
  "keep_mounted","on_change","on_confirm","on_dismiss","disabled","selected","checked","accessibility_label","tooltip","role","track_focus","track_scroll",
  "tab_index","tab_stop","href","id","overflow_scroll","mode","scroll_size","viewport_from_layout","size_range","on_resize","set_position","pressed","start",
  "transition","spring","frames","loop","spin","hover","active","focus","on_size_change",
]);

export const MOTION = new Set(["opacity", "width", "height", "left", "top"]);
const NEEDS_ID = new Set(["on_click", "active", "tooltip", "on_hover", "hover", "on_scroll_wheel", "on_mouse_down_out", "track_scroll"]);
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const COLOR_ARGS = new Set(["bg", "text_color", "text_bg", "border_color"]);

export const report = { errors: [], warnings: [], assets: new Set(), handlers: [], motion: 0, elements: 0 };
export function resetReport() {
  report.errors.length = 0;
  report.warnings.length = 0;
  report.assets.clear();
  report.handlers.length = 0;
  report.motion = 0;
  report.elements = 0;
}
let where = "";
export function setWhere(w) { where = w; }
const err = (m) => report.errors.push(`${where}: ${m}`);
const warn = (m) => report.warnings.push(`${where}: ${m}`);

export class Element {
  constructor(kind, src) {
    this.kind = kind;
    this.src = src ?? null;
    this.calls = [];
    this.kids = [];
    this.consumed = false;
    this.hasId = false;
    this.needsId = null;
    report.elements++;
    return new Proxy(this, HANDLER);
  }
}

function checkChild(el, c) {
  if (c === null || c === undefined) return err(`${el.kind}.child(): null/undefined child`);
  if (typeof c === "string" || typeof c === "number" || typeof c === "boolean") return;
  if (c instanceof Element || c?.__element) {
    if (c.consumed) err(`${el.kind}.child(): a child was used twice (${c.kind})`);
    c.consumed = true;
    el.kids.push(c);
    return;
  }
  if (c?.__entity) return;
  err(`${el.kind}.child(): not an element (${typeof c}${c?.constructor ? " " + c.constructor.name : ""})`);
}

const HANDLER = {
  get(target, name, receiver) {
    if (name in target || typeof name === "symbol") return Reflect.get(target, name, receiver);
    if (name === "__element") return true;
    if (name === "then") return undefined;
    return (...args) => {
      if (!KNOWN.has(name)) err(`unknown element method .${name}() on ${target.kind}`);
      target.calls.push([name, args]);
      switch (name) {
        case "id": target.hasId = true; if (typeof args[0] !== "string" && typeof args[0] !== "number") err(`.id() needs a string or number`); break;
        case "child": checkChild(target, args[0]); break;
        case "children": {
          const list = args[0];
          if (!list || typeof list[Symbol.iterator] !== "function") { err(`.children() needs an iterable`); break; }
          for (const c of list) checkChild(target, c);
          break;
        }
        case "when": {
          if (typeof args[1] !== "function") { err(`.when() needs a function`); break; }
          if (args[0]) {
            const r = args[1](receiver);
            if (!(r instanceof Element || r?.__element)) err(`.when() callback must return the element`);
          }
          break;
        }
        case "map": {
          if (typeof args[0] !== "function") { err(`.map() needs a function`); break; }
          return args[0](receiver);
        }
        case "hover":
        case "active":
        case "focus": {
          if (typeof args[0] !== "function") { err(`.${name}() needs a style function`); break; }
          const r = args[0](new Element(`${target.kind}:${name}-style`));
          if (!(r instanceof Element || r?.__element)) err(`.${name}() style function must return the style`);
          break;
        }
        case "loop": {
          report.motion++;
          if (!MOTION.has(args[0])) err(`.loop(): property must be one of opacity|width|height|left|top, got ${JSON.stringify(args[0])}`);
          const p = args[1] ?? {};
          if (typeof p.from !== "number" || typeof p.to !== "number") err(`.loop(): policy needs numeric from/to`);
          if (p.period !== undefined && (typeof p.period !== "number" || p.period < 100)) err(`.loop(): period must be >= 100 ms`);
          break;
        }
        case "transition": { report.motion++; if (!MOTION.has(args[0])) err(`.transition(): bad property ${JSON.stringify(args[0])}`); break; }
        case "frames": { report.motion++; if (!Array.isArray(args[0]) || args[0].some((s) => typeof s !== "string")) err(`.frames(): needs string[]`); if (typeof args[1] !== "number" || args[1] < 16) err(`.frames(): ms must be >= 16`); break; }
        case "spin": { report.motion++; if (target.kind !== "svg") warn(`.spin() is for svg()`); if (typeof args[0] !== "number" || args[0] < 100) err(`.spin(): ms must be >= 100`); break; }
        case "tooltip": if (typeof args[0] !== "string") err(`.tooltip() needs a string`); break;
        case "on_mouse_down":
        case "on_mouse_up":
          if (!["left", "right", "middle"].includes(args[0])) err(`.${name}() needs a button ("left"|"right"|"middle")`);
          if (typeof args[1] !== "function") err(`.${name}() needs a handler`);
          else report.handlers.push({ name, fn: args[1], el: target });
          break;
        case "on_action": if (typeof args[1] !== "function") err(`.on_action() needs a handler`); else report.handlers.push({ name, fn: args[1], el: target }); break;
        default:
          if (name.startsWith("on_")) {
            if (typeof args[0] !== "function") err(`.${name}() needs a handler`);
            else report.handlers.push({ name, fn: args[0], el: target });
          }
      }
      if (COLOR_ARGS.has(name)) {
        const c = args[0];
        if (typeof c !== "string" || !HEX.test(c)) err(`.${name}(${JSON.stringify(c)}): expected a #rrggbb[aa] colour`);
      } else if (["w","h","size","min_w","min_h","max_w","max_h","p","px","py","pt","pb","pl","pr","gap","gap_x","gap_y","top","left","right","bottom","inset","m","mx","my","mt","mb","ml","mr","border","border_t","border_b","border_l","border_r","border_x","border_y","rounded","rounded_t","rounded_b","rounded_l","rounded_r","rounded_tl","rounded_tr","rounded_bl","rounded_br","text_size","opacity","font_weight","flex_grow","flex_shrink","flex_basis"].includes(name)) {
        const v = args[0];
        if (!(typeof v === "number" && Number.isFinite(v)) && !(typeof v === "string" && /^(auto|[0-9.]+%)$/.test(v))) err(`.${name}(${JSON.stringify(v)}): expected a finite number`);
        if (typeof v === "number" && v < 0 && !["top","left","right","bottom","inset","m","mx","my","mt","mb","ml","mr"].includes(name)) warn(`.${name}(${v}): negative`);
      } else if (name === "line_height") {
        const v = args[0];
        if (!(typeof v === "number" || (typeof v === "string" && /^[0-9.]+(px|rem|%)$/.test(v)))) err(`.line_height(${JSON.stringify(v)}): number or "<n>px"`);
      }
      if (NEEDS_ID.has(name) && !target.hasId) {
        // GPUI needs a stateful (id) element for these; .id() may come later in the chain.
        target.needsId = name;
      }
      return receiver;
    };
  },
};

export function finishElement(el, path = "root") {
  if (el.needsId && !el.hasId) err(`${path} <${el.kind}>: .${el.needsId}() needs .id()`);
  el.kids.forEach((k, i) => finishElement(k, `${path}/${el.kind}[${i}]`));
}

export class View {
  constructor(props) { this.__props = props; }
}

export function div() { return new Element("div"); }
export function svg(path) {
  if (typeof path !== "string") err(`svg(): path must be a string`);
  else report.assets.add(path);
  return new Element("svg", path);
}
export function image(path) {
  if (typeof path !== "string") err(`image(): path must be a string`);
  else report.assets.add(path);
  return new Element("image", path);
}
export function list(_count, _key, _render) { return new Element("list"); }
export function uniform_list(_id, _count, _render) { return new Element("uniform_list"); }

const COORD = (v, m) => { if (!(typeof v === "number" && Number.isFinite(v)) && !(typeof v === "string" && /^-?[0-9.]+%$/.test(v))) err(`PathBuilder.${m}(): coordinate ${JSON.stringify(v)}`); };
class PB {
  constructor(kind, width) { this.kind = kind; this.width = width; this.ops = []; this.closed = false; }
  move_to(x, y) { COORD(x, "move_to"); COORD(y, "move_to"); this.ops.push(["M", x, y]); return this; }
  line_to(x, y) { COORD(x, "line_to"); COORD(y, "line_to"); this.ops.push(["L", x, y]); return this; }
  curve_to(x, y, cx, cy) { [x, y, cx, cy].forEach((v) => COORD(v, "curve_to")); this.ops.push(["Q"]); return this; }
  cubic_bezier_to(...a) { a.forEach((v) => COORD(v, "cubic_bezier_to")); this.ops.push(["C"]); return this; }
  arc_to(rx, ry, rot, large, sweep, x, y) { [rx, ry, x, y].forEach((v) => COORD(v, "arc_to")); if (typeof rot !== "number" || typeof large !== "boolean" || typeof sweep !== "boolean") err("PathBuilder.arc_to(): rotation number, flags boolean"); this.ops.push(["A"]); return this; }
  add_polygon(points, closed) { if (!Array.isArray(points) || points.some((p) => !Array.isArray(p) || p.length !== 2)) err("PathBuilder.add_polygon(): [[x,y],...]"); else points.forEach(([x, y]) => { COORD(x, "add_polygon"); COORD(y, "add_polygon"); }); this.ops.push(["P", points?.length, closed]); return this; }
  close() { this.closed = true; return this; }
  dash_array(v) { if (!Array.isArray(v)) err("PathBuilder.dash_array(): number[]"); return this; }
  build() { if (!this.ops.length) err("PathBuilder.build(): empty path"); return { __path: true, kind: this.kind, ops: this.ops }; }
}
export const PathBuilder = { fill: () => new PB("fill"), stroke: (w) => { if (typeof w !== "number") err("PathBuilder.stroke(): width"); return new PB("stroke", w); } };
const bgArg = (c, m) => { if (c && c.__background) return; if (typeof c !== "string" || !HEX.test(c)) err(`Background.${m}(): colour ${JSON.stringify(c)}`); };
export const Background = {
  solid: (c) => { bgArg(c, "solid"); return { __background: true }; },
  stop: (c, p) => { bgArg(c, "stop"); if (typeof p !== "number") err("Background.stop(): percentage"); return { __stop: true, c, p }; },
  linear_gradient: (angle, from, to) => { if (typeof angle !== "number") err("Background.linear_gradient(): angle"); for (const s of [from, to]) if (!s?.__stop) bgArg(s, "linear_gradient"); return { __background: true }; },
  pattern_slash: (c) => { bgArg(c, "pattern_slash"); return { __background: true }; },
  checkerboard: (c, s) => { bgArg(c, "checkerboard"); if (typeof s !== "number") err("Background.checkerboard(): size"); return { __background: true }; },
};
export function paint_path(path, background) {
  if (!path?.__path) err("window.paint_path(): first argument must be PathBuilder.build()");
  if (!(background?.__background) && (typeof background !== "string" || !HEX.test(background))) err("window.paint_path(): background must be a Background or #hex");
  return new Element("path");
}
