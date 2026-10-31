// tools/contrast.ts: every ANSI colour of each empires theme must reach
// >= 4.5:1 contrast against that theme's terminal background, except ansi0
// and ansi8 (SPEC §4.1). Also checks HUD text on stone/wood and ink on parchment.
//   bun tools/contrast.ts
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const lum = (hex: string) => {
  const c = hex.replace("#", "");
  const ch = (i: number) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
};
export const ratio = (a: string, b: string) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
let bad = 0;
const need = (label: string, fg: string, bg: string, min: number) => {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label.padEnd(44)} ${fg} on ${bg}  ${r.toFixed(2)}:1 (min ${min})`);
};
for (const f of readdirSync(join(root, "themes")).filter((x) => x.startsWith("empires") && x.endsWith(".json")).sort()) {
  const t = JSON.parse(readFileSync(join(root, "themes", f), "utf8"));
  need(`${f} foreground`, t.foreground, t.background, 7);
  t.ansi.forEach((c: string, i: number) => {
    if (i === 0 || i === 8) return;
    need(`${f} ansi${i}`, c, t.background, 4.5);
  });
}
// HUD text (SPEC §4.1): hud.text on stone and wood, ink on parchment, gold on wood.
need("hud.text on stone.face", "#f1e6c8", "#6e665a", 4.5);
need("hud.text on wood.mid", "#f1e6c8", "#4f341c", 7);
need("ink on parchment", "#2a1c0d", "#e9d8ae", 7);
need("gold.bright on wood.dark", "#ecc95a", "#2e1f12", 7);
need("gold.bright on stone.face", "#ecc95a", "#6e665a", 3);
need("textDim on stone.face", "#cdbf9c", "#6e665a", 3);
if (bad) {
  console.error(`contrast: ${bad} failures`);
  process.exit(1);
}
console.log("contrast: ok");
