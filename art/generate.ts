// art/generate.ts: every icon and glyph of Herdr Empires, drawn in code as
// crisp SVG (SPEC §13 tier A, Apache-2.0). Deterministic: no randomness, so
// re-running yields byte-identical files and diffs stay reviewable.
//
//   bun art/generate.ts [repo root]
//
// Writes mods/empires/icons/*.svg (one-colour glyphs, `currentColor`, drawn
// with svg() and tinted) and mods/empires/img/*.svg (full-colour pictures,
// drawn with image()). Also updates art/manifest-generated.json, which
// tools/asset-check.ts merges into the provenance manifest.

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const ICONS = `${root}/mods/empires/icons`;
const IMG = `${root}/mods/empires/img`;
mkdirSync(ICONS, { recursive: true });
mkdirSync(IMG, { recursive: true });

const generated: Record<string, string> = {};
function out(path: string, text: string) {
  writeFileSync(`${root}/mods/empires/${path}`, text);
  generated[path] = "art/generate.ts";
}

// ---- tiny SVG helpers

const P = {
  stoneFace: "#6e665a", stoneHi: "#b0a693", stoneDark: "#1f1c17", stoneShadow: "#3d382f",
  woodDark: "#2e1f12", woodMid: "#4f341c", woodLight: "#7a5230",
  parchment: "#e9d8ae", parchmentEdge: "#c9b07a", ink: "#2a1c0d",
  gold: "#b8922a", goldBright: "#ecc95a", text: "#f1e6c8",
  working: "#e0a63a", blocked: "#d63c2e", done: "#79bd4a", idle: "#8f8678",
  wheat: "#d9a441", wheatDark: "#9c6e14", leaf: "#5f8f2f", leafDark: "#3f6a1f", bark: "#6b4423", barkDark: "#3f2612",
  coin: "#e2c13a", coinDark: "#9c7a12", rock: "#8c8375", rockDark: "#4f4a40", skin: "#d8a77a", steel: "#b7bcc4", steelDark: "#5d636b",
  sky: "#1b2838", skyLow: "#4a3a2a", sun: "#f3c15c", red: "#d23a2f", blue: "#3561d9",
};

const svgTag = (w: number, h: number, body: string, extra = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${extra}>${body}</svg>\n`;

/** A tinted glyph: currentColor only, 16×16. */
function glyph(name: string, body: string, size = 16) {
  out(`icons/${name}.svg`, svgTag(size, size, `<g fill="currentColor">${body}</g>`));
}
const path = (d: string, attrs = "") => `<path d="${d}"${attrs}/>`;
const rect = (x: number, y: number, w: number, h: number, attrs = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}"${attrs}/>`;
const circle = (cx: number, cy: number, r: number, attrs = "") => `<circle cx="${cx}" cy="${cy}" r="${r}"${attrs}/>`;
const poly = (pts: number[][], attrs = "") => `<polygon points="${pts.map((p) => p.join(",")).join(" ")}"${attrs}/>`;
const f = (c: string) => ` fill="${c}"`;
const stroke = (c: string, w = 1) => ` fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

// ---- glyphs (16 px, one colour): pane controls, command card, badges

glyph("close", path("M3 3L13 13M13 3L3 13", stroke("currentColor", 2.2)));
glyph("zoom", path("M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4", stroke("currentColor", 2)));
glyph("unzoom", path("M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4", stroke("currentColor", 2)));
glyph("garrison", rect(3, 8, 10, 6) + poly([[8, 2], [1, 8], [15, 8]]) + rect(7, 10, 2, 4, f("#00000000")) + path("M6 10h4v4", stroke("currentColor", 0)) );
glyph("split-right", rect(1, 2, 6, 12) + rect(9, 2, 6, 12, ' fill-opacity="0.45"'));
glyph("split-down", rect(2, 1, 12, 6) + rect(2, 9, 12, 6, ' fill-opacity="0.45"'));
glyph("menu", rect(3, 1, 2, 14) + poly([[5, 1], [14, 4], [5, 7]]));
glyph("gear", path("M8 1l1.4 2.2 2.5-.6.6 2.5L14.7 6.6 13.5 9l1.2 2.4-2.2 1.5-.6 2.5-2.5-.6L8 15l-1.4-2.2-2.5.6-.6-2.5L1.3 9.4 2.5 7 1.3 4.6l2.2-1.5.6-2.5 2.5.6z") + circle(8, 8, 2.6, f("#00000000")) + circle(8, 8, 2.4, ' fill="currentColor" fill-opacity="0"'));
glyph("hourglass", path("M3 1h10v3L9.5 8 13 12v3H3v-3L6.5 8 3 4z") + path("M5 2.5h6v1.2L8 7 5 3.7z", f("#00000000")));
glyph("swords", path("M2 2l8 8M14 2L6 10M2 14l3-3M14 14l-3-3", stroke("currentColor", 2)) + path("M1 11l2-2 4 4-2 2zM15 11l-2-2-4 4 2 2z"));
glyph("laurel", path("M8 2c-3 1-5 4-5 7 0 2 1 4 2 5 0-2 0-4 1-6-1 0-2-1-2-3 1 1 2 1 3 1 0-2 1-3 1-4z") + path("M8 2c3 1 5 4 5 7 0 2-1 4-2 5 0-2 0-4-1-6 1 0 2-1 2-3-1 1-2 1-3 1 0-2-1-3-1-4z") + circle(8, 12, 1.6));
glyph("idle", circle(8, 4, 2.4) + path("M5 15v-4c0-2 1-3 3-3s3 1 3 3v4h-2v-3h-2v3z"));
glyph("worker", path("M3 13L13 3", stroke("currentColor", 2)) + path("M9 2h5v5l-1.5-1.5L10.5 7 9 5.5 11 3.5z") + circle(4, 12, 2));
glyph("unit", path("M8 1C4 1 2 4 2 8v3h12V8c0-4-2-7-6-7z") + rect(7, 6, 2, 6, f("#00000000")) + rect(2, 12, 12, 3) + rect(7, 2, 2, 9, ' fill="currentColor" fill-opacity="0"'));
glyph("train", path("M8 1C4 1 2 4 2 8v3h12V8c0-4-2-7-6-7z") + rect(2, 12, 12, 3) + path("M6 7h4v4H6z", ' fill="#000000" fill-opacity="0.35"'));
glyph("build", path("M9 3l4 4-2 2-4-4zM2 14l6-6 2 2-6 6z") + path("M12 1l3 3-1.5 1.5-3-3z"));
glyph("rename", path("M13 1l2 2-9 9-3 1 1-3zM2 14h12v1H2z"));
glyph("found", rect(7, 1, 1.5, 14) + poly([[8.5, 1], [15, 3.5], [8.5, 6]]) + rect(2, 10, 12, 5) + poly([[8, 6.5], [2, 10], [14, 10]]));
glyph("worktree", circle(4, 3, 2.2) + circle(4, 13, 2.2) + circle(12, 6, 2.2) + path("M4 5v6M12 8c0 3-4 3-8 3", stroke("currentColor", 1.6)));
glyph("bell", path("M8 1c-3 0-5 2-5 6v3l-2 2v1h14v-1l-2-2V7c0-4-2-6-5-6z") + path("M6 14a2 2 0 0 0 4 0z"));
glyph("techtree", rect(7, 11, 2, 5) + path("M8 1C4 1 2 4 2 7c0 2 2 4 6 4s6-2 6-4c0-3-2-6-6-6z") + path("M8 3v8M5 6l3 2 3-2", stroke("#000000", 1) + ' stroke-opacity="0.35"'));
glyph("options", path("M2 4h12v2H2zM2 10h12v2H2z") + circle(5, 5, 2) + circle(11, 11, 2));
glyph("about", circle(8, 8, 7, stroke("currentColor", 1.6)) + rect(7, 7, 2, 5) + circle(8, 4.6, 1.2));
glyph("resign", path("M3 1h2v14H3z") + poly([[5, 2], [14, 5], [5, 8]]) + path("M9 10l4 4M13 10l-4 4", stroke("currentColor", 1.6)));
glyph("chronicle", path("M3 1h9l2 2v12H3z") + path("M5 5h6M5 8h6M5 11h4", stroke("#000000", 1.2) + ' stroke-opacity="0.4"'));
glyph("peek", path("M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z") + circle(8, 8, 2.4, f("#000000") + ' fill-opacity="0.5"'));
glyph("send", path("M1 3h14v10H1z") + path("M1 3l7 6 7-6", stroke("#000000", 1.2) + ' stroke-opacity="0.45"'));
glyph("stop", path("M5 1h6l4 4v6l-4 4H5l-4-4V5z") + rect(5, 7, 6, 2, f("#000000") + ' fill-opacity="0.45"'));
glyph("disband", circle(8, 8, 7) + path("M5 5l6 6M11 5l-6 6", stroke("#000000", 2) + ' stroke-opacity="0.5"'));
glyph("rally", rect(3, 1, 2, 14) + poly([[5, 1], [14, 3.5], [5, 6]]) + circle(4, 15, 1));
glyph("group", rect(1, 5, 5, 5) + rect(10, 5, 5, 5) + rect(5.5, 1, 5, 5) + rect(5.5, 10, 5, 5));
glyph("speaker", path("M1 6h3l4-4v12l-4-4H1z") + path("M10 5c2 1.5 2 4.5 0 6M12 3c3 2.5 3 7.5 0 10", stroke("currentColor", 1.4)));
glyph("mute", path("M1 6h3l4-4v12l-4-4H1z") + path("M10 6l5 4M15 6l-5 4", stroke("currentColor", 1.6)));
glyph("check", path("M2 8l4 4 8-8", stroke("currentColor", 2.4)));
glyph("radio", circle(8, 8, 4));
glyph("arrow-right", poly([[5, 2], [12, 8], [5, 14]]));
glyph("arrow-down", poly([[2, 5], [8, 12], [14, 5]]));
glyph("win-min", rect(3, 11, 10, 2));
glyph("win-max", rect(3, 3, 10, 10, stroke("currentColor", 2)));
glyph("win-restore", rect(2, 6, 8, 8, stroke("currentColor", 2)) + path("M6 6V2h8v8h-4", stroke("currentColor", 2)));
glyph("win-close", path("M3 3L13 13M13 3L3 13", stroke("currentColor", 2.2)));
glyph("herald", path("M4 2h8v12H4z") + path("M4 2a2 2 0 0 0-2 2 2 2 0 0 0 2 2M12 10a2 2 0 0 1 2 2 2 2 0 0 1-2 2") + path("M6 5h4M6 8h4M6 11h3", stroke("#000000", 1) + ' stroke-opacity="0.4"'));
glyph("help", circle(8, 8, 7, stroke("currentColor", 1.6)) + path("M5.5 6a2.5 2.5 0 1 1 3.5 2.3V10", stroke("currentColor", 1.8)) + circle(8, 12.5, 1.1));
glyph("expand", path("M2 2h5M2 2v5M14 14h-5M14 14V9", stroke("currentColor", 2)));
glyph("wait", circle(8, 8, 6.5, stroke("currentColor", 1.6)) + path("M8 4v4l3 2", stroke("currentColor", 1.8)));
glyph("queue", rect(2, 2, 12, 3) + rect(2, 6.5, 12, 3) + rect(2, 11, 8, 3));
glyph("house", poly([[8, 1], [1, 8], [3, 8], [3, 15], [13, 15], [13, 8], [15, 8]]) + rect(7, 10, 2, 5, f("#000000") + ' fill-opacity="0.45"'));
glyph("town", rect(7, 0, 1.2, 5) + poly([[8, 0], [12, 1.5], [8, 3]]) + poly([[8, 4], [1, 9], [15, 9]]) + rect(2, 9, 12, 6) + rect(6.5, 11, 3, 4, f("#000000") + ' fill-opacity="0.45"'));
glyph("tower", rect(5, 5, 6, 11) + rect(4, 3, 2, 2) + rect(7, 3, 2, 2) + rect(10, 3, 2, 2) + rect(7, 10, 2, 6, f("#000000") + ' fill-opacity="0.45"'));

// ---- full-colour pictures (32 px): resources, buildings, badges, misc

function picture(name: string, body: string, size = 32, extra = "") {
  out(`img/${name}.svg`, svgTag(size, size, body, extra));
}
const shade = (d: string, c: string, o = 0.35) => path(d, ` fill="${c}" fill-opacity="${o}"`);

// Resources (SPEC §6.1)
picture("food", [
  path("M16 30V8", stroke(P.wheatDark, 2)),
  ...[0, 1, 2, 3].flatMap((i) => [
    path(`M16 ${9 + i * 5}c-5-1-7 2-8 5 4 1 7-1 8-5z`, f(P.wheat)),
    path(`M16 ${9 + i * 5}c5-1 7 2 8 5-4 1-7-1-8-5z`, f(P.wheat)),
    path(`M16 ${9 + i * 5}c-5-1-7 2-8 5`, stroke(P.wheatDark, 0.8)),
    path(`M16 ${9 + i * 5}c5-1 7 2 8 5`, stroke(P.wheatDark, 0.8)),
  ]),
  path("M16 4c-3 0-4 3-4 6 2 0 4-2 4-6zM16 4c3 0 4 3 4 6-2 0-4-2-4-6z", f(P.wheat)),
].join(""));
picture("res-wood", [
  path("M4 10h20a4 4 0 0 1 0 8H4z", f("#b8804a")),
  path("M4 10h20a4 4 0 0 1 0 8", stroke("#f0d7a4", 1.2)),
  `<ellipse cx="4" cy="14" rx="3" ry="4"${f("#f3dcab")}/>`,
  `<ellipse cx="4" cy="14" rx="1.6" ry="2.2"${f("#c08a52")}/>`,
  path("M6 20h20a4 4 0 0 1 0 8H6z", f("#b8804a")),
  path("M6 20h20a4 4 0 0 1 0 8", stroke("#f0d7a4", 1.2)),
  `<ellipse cx="6" cy="24" rx="3" ry="4"${f("#f3dcab")}/>`,
  `<ellipse cx="6" cy="24" rx="1.6" ry="2.2"${f("#c08a52")}/>`,
  path("M9 12h12M11 15h10M11 22h12M13 25h10", stroke(P.barkDark, 0.8) + ' stroke-opacity="0.6"'),
].join(""));
picture("gold", [
  ...[[10, 22], [20, 24], [15, 15]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="8" ry="4"${f(P.coinDark)}/><ellipse cx="${x}" cy="${y - 2}" rx="8" ry="4"${f(P.coin)}/><ellipse cx="${x}" cy="${y - 2}" rx="5" ry="2.2"${stroke(P.coinDark, 0.8)}/>`),
  circle(13, 11, 1.2, f("#fff3b0")),
].join(""));
picture("stone", [
  poly([[4, 24], [8, 12], [16, 8], [26, 12], [29, 22], [24, 28], [8, 28]], f(P.rock)),
  poly([[8, 12], [16, 8], [20, 16], [10, 20]], f("#a39a8a")),
  poly([[20, 16], [26, 12], [29, 22], [22, 24]], f("#5f584c")),
  poly([[4, 24], [10, 20], [22, 24], [24, 28], [8, 28]], f(P.rockDark)),
  path("M12 14l4 2M18 20l3 3", stroke("#4f4a40", 0.8)),
].join(""));
picture("population", [
  circle(16, 8, 5, f(P.skin)),
  path("M11 6c0-4 10-4 10 0z", f(P.red)),
  path("M8 30v-9c0-5 3-8 8-8s8 3 8 8v9z", f(P.blue)),
  path("M13 18v12M19 18v12", stroke("#24449c", 1)),
  path("M6 22l4-6M26 22l-4-6", stroke(P.skin, 2.4)),
].join(""));

// Buildings (SPEC §7.1): town centre = space, house = tab, watchtower = alert, garrison = settled tab
picture("town", [
  poly([[2, 30], [2, 14], [16, 4], [30, 14], [30, 30]], f(P.stoneFace)),
  poly([[2, 14], [16, 4], [30, 14], [27, 15], [16, 7], [5, 15]], f("#a8321f")),
  rect(13, 20, 6, 10, f(P.woodDark)),
  rect(5, 18, 4, 4, f(P.sky)), rect(23, 18, 4, 4, f(P.sky)),
  rect(15, 0, 1.2, 6, f(P.woodLight)), poly([[16, 0], [22, 2], [16, 4]], f(P.blue)),
  rect(2, 28, 28, 2, f(P.stoneShadow)),
].join(""));
picture("house", [
  poly([[4, 30], [4, 16], [16, 6], [28, 16], [28, 30]], f("#c2a37a")),
  poly([[2, 17], [16, 5], [30, 17], [27, 18], [16, 9], [5, 18]], f("#8c5a2b")),
  rect(13, 22, 6, 8, f(P.woodDark)),
  rect(7, 19, 4, 4, f(P.sky)), rect(21, 19, 4, 4, f(P.sky)),
  rect(4, 28, 24, 2, f("#8a7352")),
].join(""));
picture("tower", [
  rect(9, 10, 14, 20, f(P.stoneFace)),
  path("M9 10h14M9 15h14M9 20h14M9 25h14", stroke(P.stoneShadow, 0.8) + ' stroke-opacity="0.6"'),
  rect(8, 6, 16, 4, f(P.stoneHi)),
  rect(8, 4, 3, 3, f(P.stoneHi)), rect(14.5, 4, 3, 3, f(P.stoneHi)), rect(21, 4, 3, 3, f(P.stoneHi)),
  rect(14, 22, 4, 8, f(P.woodDark)), rect(14, 13, 4, 5, f(P.sky)),
  circle(16, 2, 2, f(P.blocked)),
].join(""));
picture("garrison", [
  poly([[2, 30], [2, 14], [16, 4], [30, 14], [30, 30]], f(P.stoneFace)),
  rect(2, 14, 28, 2, f(P.stoneShadow)),
  path("M10 20h12v8H10z", f(P.woodDark)),
  path("M12 20a4 4 0 0 1 8 0", f(P.woodDark)),
  rect(15, 0, 1.2, 6, f(P.woodLight)), poly([[16, 0], [22, 2], [16, 4]], f(P.gold)),
].join(""));

// Portrait frame (stone, gold when focused) and a pennant picture for menus
picture("frame", rect(0.5, 0.5, 31, 31, stroke(P.stoneDark, 1)) + rect(2, 2, 28, 28, stroke(P.stoneHi, 1.5)) + rect(4, 4, 24, 24, stroke(P.stoneShadow, 1)));
picture("frame-gold", rect(0.5, 0.5, 31, 31, stroke(P.woodDark, 1)) + rect(2, 2, 28, 28, stroke(P.goldBright, 1.5)) + rect(4, 4, 24, 24, stroke(P.gold, 1)));
picture("ornament", path("M1 15c4-6 8-8 14-14 6 6 10 8 14 14-4 6-8 8-14 14C9 23 5 21 1 15z", f(P.gold)) + path("M5 15c3-4 6-6 10-10 4 4 7 6 10 10-3 4-6 6-10 10-4-4-7-6-10-10z", f(P.woodDark)) + circle(15, 15, 2.5, f(P.goldBright)), 30);
picture("seal", circle(16, 16, 14, f("#a8321f")) + circle(16, 16, 11, stroke("#7a1f12", 1.5)) + path("M16 8l2.4 5 5.5.6-4 3.8 1 5.5L16 20.3 11.1 23l1-5.5-4-3.8 5.5-.6z", f("#c9402c")) + circle(10, 10, 3, f("#ffffff") + ' fill-opacity="0.25"'));

// Status badges as pictures (for places that don't tint)
picture("badge-working", circle(16, 16, 15, f(P.working)) + path("M10 6h12v5l-4 5 4 5v5H10v-5l4-5-4-5z", f(P.stoneDark)) + path("M12 8h8v2l-4 4-4-4z", f(P.text)));
picture("badge-blocked", circle(16, 16, 15, f(P.blocked)) + path("M7 7l12 12M25 7L13 19M7 25l4-4M25 25l-4-4", stroke(P.text, 3)));
picture("badge-done", circle(16, 16, 15, f(P.done)) + path("M9 17l5 5 9-11", stroke(P.text, 3.5)));
picture("badge-idle", circle(16, 16, 15, f(P.idle)) + circle(16, 11, 4, f(P.text)) + path("M9 27v-6c0-4 3-6 7-6s7 2 7 6v6z", f(P.text)));

// Logo: a crown over crossed terminal prompts
picture("logo", [
  path("M4 40l4-20 10 10 14-18 14 18 10-10 4 20z", f(P.gold)),
  path("M4 40h56v8H4z", f(P.goldBright)),
  path("M8 44h48", stroke(P.woodDark, 1) + ' stroke-opacity="0.4"'),
  circle(18, 30, 3, f(P.red)), circle(32, 24, 3, f(P.blue)), circle(46, 30, 3, f("#3e9e48")),
  path("M20 54l6 4-6 4M30 62h12", stroke(P.text, 3)),
].join(""), 64);

// ---- screens (SPEC §13.2): loading screen, drawn in code, safe for 16:9 and 9:16.
function loadingScreen() {
  const W = 1600, H = 900;
  const hills = [
    path("M0 640C200 600 420 620 640 580S1100 560 1600 600V900H0z", f("#2a2219")),
    path("M0 700C300 660 600 690 900 650S1300 640 1600 680V900H0z", f("#1f1a12")),
  ];
  const castle = (x: number, y: number, s: number, c: string) => [
    rect(x - 120 * s, y - 90 * s, 240 * s, 90 * s, f(c)),
    rect(x - 150 * s, y - 150 * s, 50 * s, 150 * s, f(c)), rect(x + 100 * s, y - 150 * s, 50 * s, 150 * s, f(c)),
    rect(x - 30 * s, y - 210 * s, 60 * s, 210 * s, f(c)),
    ...[-150, -130, -110, 100, 120, 140].map((dx) => rect(x + dx * s, y - 162 * s, 12 * s, 12 * s, f(c))),
    ...[-30, -10, 10].map((dx) => rect(x + dx * s, y - 222 * s, 12 * s, 12 * s, f(c))),
    rect(x - 3 * s, y - 260 * s, 3 * s, 50 * s, f("#7a5230")), poly([[x, y - 260 * s], [x + 40 * s, y - 250 * s], [x, y - 240 * s]], f("#b8922a")),
    ...[-100, -60, 60, 100].map((dx) => rect(x + dx * s, y - 60 * s, 10 * s, 20 * s, f("#f3c15c") + ' fill-opacity="0.85"')),
  ].join("");
  const stars = Array.from({ length: 60 }, (_, i) => circle((i * 263) % W, (i * 149) % 360, 1 + (i % 3) * 0.5, f("#f1e6c8") + ` fill-opacity="${0.3 + (i % 5) * 0.12}"`)).join("");
  const body = [
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f1626"/><stop offset="0.55" stop-color="#3a2a2a"/><stop offset="1" stop-color="#8a5a2a"/></linearGradient></defs>`,
    rect(0, 0, W, H, ' fill="url(#sky)"'),
    stars,
    circle(1180, 300, 70, f("#f3c15c") + ' fill-opacity="0.9"'),
    ...hills,
    castle(800, 640, 1.1, "#15110c"),
    castle(380, 660, 0.5, "#1a1510"), castle(1250, 650, 0.6, "#1a1510"),
    path("M0 760C400 740 800 770 1600 740V900H0z", f("#120e09")),
    rect(0, 0, W, 80, f("#1f1c17")), rect(0, 80, W, 4, f("#b8922a")),
    rect(0, H - 80, W, 80, f("#1f1c17")), rect(0, H - 84, W, 4, f("#b8922a")),
  ].join("");
  out("img/loading.svg", svgTag(W, H, body, ' preserveAspectRatio="xMidYMid slice"'));
}
loadingScreen();

writeFileSync(`${root}/art/manifest-generated.json`, JSON.stringify(generated, null, 2) + "\n");
console.log(`Generated ${Object.keys(generated).length} files under mods/empires/{icons,img}.`);
