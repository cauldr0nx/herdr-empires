// Herdr Empires: the whole medieval RTS layout is this one mod, in roles.
// The layout and overlays give each copy props { role }:
//   resources  the top bar: game menu, resource counters, age, clock, window buttons
//   banner     a pane's header: pennant, unit portrait, title, HP-style status bar
//   command    the command card (3×5 stone buttons)
//   selection  the selected-unit panel
//   minimap    the diamond minimap
//   herald     the floating advisor
//   menu       a parchment popup menu
//   dialog     every dialog (prompt, confirm, options, techtree, chronicle, about, screens)
//   world      the isometric map: spaces as towns, agents as units (SPEC §18)
//   chatbar    the title bar of a unit's chat window (its live terminal)
//   chatgrip   the chat's bottom strip with the resize mark
//   resizer    a transparent full-window layer while a chat is being resized
// `herdr-app check` loads the mod with props() = null: render a placeholder then.

import { View, div } from "gpui-kit";
import { props } from "herdr";
import Resources from "./roles/resources.js";
import Banner from "./roles/banner.js";
import Command from "./roles/command.js";
import Selection from "./roles/selection.js";
import Minimap from "./roles/minimap.js";
import Herald from "./roles/herald.js";
import Menu from "./roles/menu.js";
import Dialog from "./roles/dialog.js";
import World from "./roles/world.js";
import ChatBar, { ChatGrip, Resizer } from "./roles/chat.js";

const ROLES = { resources: Resources, banner: Banner, command: Command, selection: Selection, minimap: Minimap, herald: Herald, menu: Menu, dialog: Dialog, world: World, chatbar: ChatBar, chatgrip: ChatGrip, resizer: Resizer };

export default class Empires extends View {
  init(p, cx) {
    const pr = props() ?? p ?? {};
    const R = ROLES[pr.role];
    this.role = R ? new R() : null;
    this.role?.init?.(pr, cx);
  }

  render(cx) {
    if (!this.role) return div().text_color("#f1e6c8").child(`empires: no role "${props()?.role ?? ""}"`);
    return this.role.render(cx);
  }
}
