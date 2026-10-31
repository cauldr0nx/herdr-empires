// Stand-in for `gpui-base` (see gpui-kit.js).
import { Element } from "./gpui-kit.js";
export function h_flex() { return new Element("h_flex"); }
export function v_flex() { return new Element("v_flex"); }
const component = (name) => ({ new: (...a) => new Element(name) });
export const Button = component("Button");
export const Checkbox = component("Checkbox");
export const Switch = component("Switch");
export const Input = { new: (_state) => new Element("Input") };
export const InputState = { new: (o) => ({ __entity: true, _v: String(o?.value ?? ""), value() { return this._v; }, set_value(v) { this._v = String(v); }, focus() {}, on() {} }) };
export const TextView = { markdown: (_id, _text) => new Element("TextView") };
