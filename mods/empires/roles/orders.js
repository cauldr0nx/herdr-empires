// Phase 2 orders for the command card (SPEC §14.4), shown when the command
// layer is on (shared "empires.command", Options). Every destructive or
// multi-unit order confirms and names its targets (§14.5).

import { spaces, agents, terminals, focused, run, shared, setShared, keys, openOverlay } from "herdr";
import { openDialog, perform } from "../kit.js";
import { selectedUnits, nameTargets, orderAgents, nextIdle, nextBlocked, subAgents } from "../data.js";
import { queueOf } from "./queue.js";

function keyFor(action) {
  const k = keys().find((b) => (b.section === "layout:empires" || b.section === "global") && b.action === action);
  return k ? k.keys : "";
}

/** The selected units' addresses: the multi-selection, else the focused agent. */
export function selection() {
  const f = focused();
  return selectedUnits(agents(), shared("empires.selected"), f?.agent ?? f?.terminal ?? null);
}

export function orders(card) {
  const f = focused();
  const space = spaces().find((s) => s.active) ?? null;
  const tab = space?.tabs.find((t) => t.active) ?? null;
  const sel = selection();
  const list = agents();
  const targets = nameTargets(list, sel);
  const working = list.filter((a) => a.space === space?.id && a.status === "working");
  const order = () => orderAgents(spaces(), list);
  const blocked = list.filter((a) => a.status === "blocked").length;
  const idle = list.filter((a) => a.status === "idle" || a.status === "done").length;
  const one = sel.length === 1 ? list.find((a) => a.address === sel[0]) : null;
  const workers = one ? subAgents(terminals(), one.address) : [];
  const rally = space ? shared(`empires.rally.${space.id}`) : null;
  const K = keyFor;
  return [
    { id: "train", glyph: "train", name: "Train a unit (template + orders + town)", key: K("empires.train") || "Alt+T", hot: "T", act: () => openDialog("train", { title: "Train a unit", space: space?.id ?? null, command: true }) },
    { id: "rally", glyph: "rally", name: `Rally point: ${rally === "worktree" ? "a new worktree per unit" : "the town's folder"} (click to change)`, hot: "R", disabled: !space, act: () => setShared(`empires.rally.${space.id}`, rally === "worktree" ? "folder" : "worktree") },
    { id: "send", glyph: "send", name: sel.length ? `Send a message to ${sel.length} unit${sel.length === 1 ? "" : "s"}` : "Send a message (select a unit first)", hot: "S", disabled: !sel.length, act: () => openDialog("send", { title: `Send to ${sel.length} unit${sel.length === 1 ? "" : "s"}`, targets: sel, names: targets }) },
    { id: "stop", glyph: "stop", name: sel.length ? `Stop (interrupt the turn of) ${sel.length} unit${sel.length === 1 ? "" : "s"}` : "Stop (select a unit first)", hot: "H", disabled: !sel.length, act: () => {
        const go = { hcEach: ["interrupt", sel] };
        if (sel.length > 1) openDialog("confirm", { title: `Stop ${sel.length} units?`, text: `Interrupt the current turn of:\n${targets}\nThey keep running and wait for new orders.`, buttons: [{ label: "&Stop them", default: true, act: go }, { label: "&Cancel" }] });
        else perform(go);
      } },
    { id: "bell", glyph: "bell", name: `Town bell: interrupt every working unit in ${space?.name ?? "the town"} (${working.length})`, hot: "B", disabled: !working.length, alert: blocked > 0, act: () =>
        openDialog("confirm", { title: "Ring the town bell?", text: `Interrupt the current turn of every working unit in ${space?.name}:\n${nameTargets(list, working.map((a) => a.address))}\nThey keep running and wait for new orders.`, buttons: [{ label: "&Ring it", default: true, act: { hcEach: ["interrupt", working.map((a) => a.address)], sound: "bell" } }, { label: "&Cancel" }] }) },
    { id: "garrison", glyph: "garrison", name: "Garrison (settle tab)", key: K("empires.garrison") || "Alt+G", hot: "G", disabled: !tab || tab.settled, act: () => run("tab.settle", { id: tab.id }) },
    { id: "ungarrison", glyph: "house", name: "Ungarrison (unsettle tab)", hot: "U", disabled: !tab || !tab.settled, act: () => run("tab.unsettle", { id: tab.id }) },
    { id: "peek", glyph: "peek", name: workers.length ? `Peek at ${workers[0].name || workers[0].address} (worker of the selected unit)` : "Peek (the selected unit has no workers)", hot: "K", disabled: !workers.length, act: () => run("terminal.peek", { terminal: workers[0].address }) },
    { id: "disband", glyph: "disband", name: sel.length ? `Disband (kill) ${sel.length} unit${sel.length === 1 ? "" : "s"}` : "Disband (select a unit first)", hot: "D", disabled: !sel.length, act: () =>
        openDialog("confirm", { title: `Disband ${sel.length} unit${sel.length === 1 ? "" : "s"}?`, text: `This ends the terminal${sel.length === 1 ? "" : "s"} of:\n${targets}\nUnsaved work in them is lost.`, buttons: [{ label: "&Disband", default: true, act: { runEach: ["terminal.kill", sel.map((a) => ({ terminal: a }))], sound: "error" } }, { label: "&Cancel" }] }) },
    { id: "queue", glyph: "queue", name: space ? `Production queue of ${space.name} (${queueOf(space.id).length} pending)` : "Production queue", hot: "Q", disabled: !space, act: () => openDialog("queue", { title: `Queue: ${space.name}`, space: space.id }) },
    { id: "idle", glyph: "idle", name: `Idle unit (${idle})`, key: K("empires.idle") || "Alt+.", hot: ".", disabled: !idle, act: () => {
        const a = nextIdle(list, order(), f?.agent ?? f?.terminal ?? null);
        if (a) run("agent.focus", { terminal: a.address });
      } },
    { id: "alarm", glyph: "swords", name: `Next unit under attack (${blocked})`, key: K("empires.alarm") || "Alt+,", hot: ",", disabled: !blocked, act: () => {
        const a = nextBlocked(list, order(), f?.agent ?? f?.terminal ?? null);
        if (a) run("agent.focus", { terminal: a.address });
      } },
    { id: "worktree", glyph: "worktree", name: "Worktree (new worktree town)", hot: "W", disabled: !space, act: () => openOverlay({ mod: "worktree", kind: "dialog", width: 440, height: 260, props: { space: space.id, action: "new" } }) },
    { id: "build", glyph: "build", name: "Build (new shell tab)", key: K("tab.new") || "Ctrl+Shift+T", hot: "N", act: () => run("tab.new", space ? { space: space.id } : {}) },
    { id: "options", glyph: "options", name: "Options (the command layer is on)", hot: "P", act: () => openDialog("options", { title: "Options" }) },
  ];
}
