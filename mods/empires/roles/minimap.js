// The minimap role (SPEC §6): skeleton; built out in M2/M3.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { C, unit, root, stone, heading } from "../kit.js";

export default class Role {
  init() {}
  render(_cx) {
    const u = unit();
    return root(u, div().id("minimap").size_full().flex().flex_col()).child(stone(u, h_flex().size_full().items_center().justify_center().child(heading(u, "minimap"))));
  }
}
