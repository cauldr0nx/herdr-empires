// The production queue (SPEC §14.4): per town, a list of pending orders in
// shared state (`empires.queue.<space>`). Shown in the selection panel with
// progress; when a unit of the right type goes idle, the next order is sent
// (`hc send`) only if the town auto-dispatches; otherwise the herald asks.
// Safety (§14.5): never dispatched to a blocked unit; what is sent is exactly
// the queued text the person typed.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { hc, shared, setShared, agents, terminals, notify } from "herdr";
import { C, glyph, own, openDialog, calm } from "../kit.js";
import { queueKey, autoKey, nextDispatch } from "../data.js";

export function commandMode() {
  return shared("empires.command") === true && !calm();
}

export function queueOf(spaceId) {
  const q = shared(queueKey(spaceId));
  return Array.isArray(q) ? q : [];
}

export function addToQueue(spaceId, task, unit) {
  const q = [...queueOf(spaceId), { task: String(task), unit: unit ?? null, addedAt: Date.now() }];
  setShared(queueKey(spaceId), q);
}

export function removeFromQueue(spaceId, index) {
  const q = queueOf(spaceId).filter((_, i) => i !== index);
  setShared(queueKey(spaceId), q);
}

/** The unit type a terminal was trained as (label herdr-empires.unit), or null. */
export function unitTypeOf(address) {
  const t = terminals().find((x) => x.address === address);
  return t?.labels?.["empires.unit"] ?? null;
}

/** Sends exactly `text` to a unit through herdr-core. Resolves with the exec result. */
export async function sendTo(address, text) {
  return hc(["send", address, String(text)]);
}

/**
 * An agent just went idle: dispatch the town's next order to it if the town
 * auto-dispatches, else let the herald ask. Called from the resources role's
 * transition tracking, outside render.
 */
export async function onIdle(agent) {
  if (!commandMode() || !agent) return;
  const queue = queueOf(agent.space);
  if (!queue.length) return;
  const auto = shared(autoKey(agent.space)) === true;
  const pick = nextDispatch(queue, agent, auto, unitTypeOf(agent.address));
  if (!pick) {
    if (!auto) notify({ title: "The herald asks", body: `${agent.program?.name ?? "A unit"} in ${agent.space_name} stands idle; ${queue.length} order${queue.length === 1 ? "" : "s"} wait in the queue.`, level: "info", action: { name: "agent.focus", args: { terminal: agent.address } } });
    return;
  }
  const r = await sendTo(agent.address, pick.task.task);
  if (r.code === 0) {
    removeFromQueue(agent.space, pick.index);
    notify({ title: "Order dispatched", body: `${agent.program?.name ?? "Unit"} in ${agent.space_name}: ${pick.task.task.slice(0, 80)}`, level: "success", action: { name: "agent.focus", args: { terminal: agent.address } } });
  } else notify({ title: "Dispatch failed", body: r.stderr || r.stdout || "hc send failed", level: "error" });
}

/** The queue line of the selection panel: pending orders with progress, click to open the queue dialog. */
export function queueLine(u, space) {
  if (!commandMode() || !space) return div();
  const q = queueOf(space.id);
  const auto = shared(autoKey(space.id)) === true;
  const idle = agents().filter((a) => a.space === space.id && a.status === "idle").length;
  return own(
    h_flex()
      .id(`queue-${space.id}`)
      .items_center()
      .gap(u(5))
      .px(u(4))
      .h(u(18))
      .rounded(u(2))
      .hover((s) => s.bg("#ffffff14"))
      .tooltip(`Production queue for ${space.name}: ${q.length} order${q.length === 1 ? "" : "s"}, auto-dispatch ${auto ? "on" : "off"} (${idle} idle unit${idle === 1 ? "" : "s"}). Click to edit`)
      .on_click(() => openDialog("queue", { title: `Queue: ${space.name}`, space: space.id }))
      .child(glyph(u, "queue", 11, q.length ? C.goldBright : C.textDim))
      .child(div().text_size(u(11)).text_color(q.length ? C.text : C.textDim).child(q.length ? `queue: ${q.length} · next: ${q[0].task.slice(0, 32)}${q[0].task.length > 32 ? "…" : ""}` : "queue: empty"))
      .child(div().text_size(u(10.5)).text_color(auto ? C.done : C.textDim).child(auto ? "auto" : "ask")),
  );
}
