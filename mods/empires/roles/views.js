// The world's view modes (SPEC §18.2): map (the default: the world fills the field; units'
// chats open as popups), split (the world as a band over the terminals) and terminals. The mod rewrites its own
// layout's `field` column through layout.set, the way fitLayout keeps sizes whole; the
// mode is kept in shared("empires.view") so every copy agrees.

import { layout, shared, setShared, run } from "herdr";
import { nextView, VIEWS } from "../data.js";

export function viewMode() {
  const v = shared("empires.view");
  return VIEWS.includes(v) ? v : "map";
}

function find(n, id) {
  if (!n || typeof n !== "object") return null;
  if (n.id === id) return n;
  for (const c of n.children ?? []) {
    const f = find(c, id);
    if (f) return f;
  }
  return null;
}

/** The field column's children for a mode, reusing the existing world and main nodes. */
export function fieldFor(mode, world, main) {
  const w = { ...world, hidden: mode === "terminals", size: mode === "split" ? { weight: 35 } : { weight: 1 } };
  const m = { ...main, hidden: mode === "map", size: { weight: mode === "split" ? 65 : 1 } };
  return [w, m];
}

/** Applies a view mode to the shown layout (only when it is ours). */
export function setView(mode) {
  if (!VIEWS.includes(mode)) mode = nextView(viewMode());
  setShared("empires.view", mode);
  if (shared("layout") !== "empires") return;
  const l = layout();
  const field = find(l, "field");
  if (!field) return;
  const world = find(field, "world") ?? { id: "world", type: "block", content: { mod: "empires", props: { role: "world" } } };
  const main = find(field, "main");
  if (!main) return;
  field.type = "column";
  field.children = fieldFor(mode, world, main);
  run("layout.set", { layout: l });
}

export function cycleView() {
  setView(nextView(viewMode()));
}
