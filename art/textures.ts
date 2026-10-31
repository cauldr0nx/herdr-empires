// art/textures.ts: procedural material pictures (SPEC §13.2), code-drawn SVG,
// deterministic. Herdr's image() has no tiling (SPIKES R1), so each is drawn
// to be stretched over its box at low contrast: wood planks, parchment and
// stone, plus the herald portrait and the layout preview.
//   bun art/textures.ts [repo root]
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
mkdirSync(`${root}/mods/empires/img`, { recursive: true });
mkdirSync(`${root}/layouts`, { recursive: true });
const manifest: Record<string, string> = {};
const out = (rel: string, text: string) => {
  writeFileSync(`${root}/${rel}`, text);
  if (rel.startsWith("mods/empires/")) manifest[rel.slice("mods/empires/".length)] = "art/textures.ts";
};
const svgTag = (w: number, h: number, body: string, extra = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${extra}>${body}</svg>\n`;
// A tiny deterministic PRNG (mulberry32) so grain is stable across runs.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r2 = (n: number) => Math.round(n * 100) / 100;

// Wood plank 256×64: planks with grain lines and knots.
{
  const r = rng(7);
  let body = `<rect width="256" height="64" fill="#4f341c"/>`;
  for (let i = 0; i < 40; i++) {
    const y = r2(r() * 64);
    const x1 = r2(r() * 256), len = r2(40 + r() * 200);
    body += `<path d="M${x1} ${y}q${r2(len / 2)} ${r2((r() - 0.5) * 3)} ${len} 0" stroke="${r() > 0.5 ? "#3a2614" : "#6a4626"}" stroke-width="${r2(0.4 + r())}" fill="none" stroke-opacity="0.5"/>`;
  }
  for (let i = 0; i < 3; i++) {
    const cx = r2(40 + r() * 180), cy = r2(10 + r() * 44);
    body += `<ellipse cx="${cx}" cy="${cy}" rx="${r2(3 + r() * 3)}" ry="${r2(2 + r() * 2)}" fill="#2e1f12" fill-opacity="0.6"/>`;
  }
  body += `<rect width="256" height="1" fill="#9a6a3c" fill-opacity="0.7"/><rect y="63" width="256" height="1" fill="#1a1109"/>`;
  out("mods/empires/img/wood.svg", svgTag(256, 64, body, ' preserveAspectRatio="none"'));
}
// Parchment 256×256: warm paper with faint blotches and fibres.
{
  const r = rng(11);
  let body = `<defs><radialGradient id="p" cx="0.5" cy="0.5" r="0.7"><stop offset="0" stop-color="#f0e2bd"/><stop offset="1" stop-color="#dcc693"/></radialGradient></defs><rect width="256" height="256" fill="url(#p)"/>`;
  for (let i = 0; i < 60; i++) body += `<circle cx="${r2(r() * 256)}" cy="${r2(r() * 256)}" r="${r2(4 + r() * 20)}" fill="#c9b07a" fill-opacity="${r2(0.04 + r() * 0.06)}"/>`;
  for (let i = 0; i < 120; i++) body += `<path d="M${r2(r() * 256)} ${r2(r() * 256)}l${r2((r() - 0.5) * 12)} ${r2((r() - 0.5) * 12)}" stroke="#a88a52" stroke-width="0.5" stroke-opacity="0.25"/>`;
  out("mods/empires/img/parchment.svg", svgTag(256, 256, body, ' preserveAspectRatio="none"'));
}
// Stone 256×128: blocks with mortar and chips.
{
  const r = rng(23);
  let body = `<rect width="256" height="128" fill="#6e665a"/>`;
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 32 : 0;
    for (let col = -1; col < 5; col++) {
      const x = col * 64 + off, y = row * 32;
      body += `<rect x="${x + 1}" y="${y + 1}" width="62" height="30" fill="${["#746c5f", "#6a6256", "#7a7265"][(row + col + 7) % 3]}"/>`;
      body += `<rect x="${x + 1}" y="${y + 1}" width="62" height="1" fill="#8c8375" fill-opacity="0.6"/><rect x="${x + 1}" y="${y + 30}" width="62" height="1" fill="#3d382f" fill-opacity="0.7"/>`;
      for (let k = 0; k < 3; k++) body += `<circle cx="${r2(x + 4 + r() * 56)}" cy="${r2(y + 4 + r() * 24)}" r="${r2(0.5 + r() * 1.5)}" fill="#3d382f" fill-opacity="0.35"/>`;
    }
  }
  out("mods/empires/img/stone-wall.svg", svgTag(256, 128, body, ' preserveAspectRatio="none"'));
}
// The herald: an original character, scroll in one hand, trumpet in the other. 56×72.
{
  const body = [
    `<ellipse cx="28" cy="69" rx="18" ry="3" fill="#000000" fill-opacity="0.3"/>`,
    `<path d="M14 68V40c0-8 6-14 14-14s14 6 14 14v28z" fill="#3561d9"/>`,
    `<path d="M14 68V40c0-8 6-14 14-14v42z" fill="#2a4db0"/>`,
    `<path d="M22 44l6 24 6-24" fill="#e2c13a"/>`,
    `<rect x="20" y="30" width="16" height="4" fill="#b8922a"/>`,
    `<circle cx="28" cy="18" r="9" fill="#d8a77a"/>`,
    `<path d="M19 16c0-7 18-7 18 0v3c-3-4-15-4-18 0z" fill="#5a3a1c"/>`,
    `<path d="M18 9h20l-3 7H21z" fill="#d23a2f"/><path d="M28 2l6 7H22z" fill="#d23a2f"/><circle cx="28" cy="2" r="1.6" fill="#ecc95a"/>`,
    `<circle cx="25" cy="18" r="1.1" fill="#2a1c0d"/><circle cx="31" cy="18" r="1.1" fill="#2a1c0d"/><path d="M25 22q3 2 6 0" stroke="#8a4a2a" stroke-width="1" fill="none"/>`,
    `<path d="M10 40l8-6" stroke="#d8a77a" stroke-width="4" stroke-linecap="round"/>`,
    `<rect x="4" y="28" width="9" height="16" rx="1" fill="#e9d8ae" stroke="#c9b07a"/><path d="M6 32h5M6 35h5M6 38h4" stroke="#8a6a3a" stroke-width="0.8"/><path d="M4 28a2 2 0 0 0 0 4M13 40a2 2 0 0 1 0 4" fill="#c9b07a"/>`,
    `<path d="M46 40l-8-6" stroke="#d8a77a" stroke-width="4" stroke-linecap="round"/>`,
    `<path d="M40 28l10-8" stroke="#b8922a" stroke-width="3" stroke-linecap="round"/><path d="M48 14l6 6-4 2-4-4z" fill="#ecc95a"/><path d="M50 10l6 6" stroke="#ecc95a" stroke-width="2"/>`,
    `<path d="M50 10c3 0 5-2 5-4" stroke="#d23a2f" stroke-width="1.5" fill="none"/><rect x="54" y="4" width="4" height="5" fill="#d23a2f"/>`,
    `<rect x="18" y="66" width="8" height="4" fill="#5a3a1c"/><rect x="30" y="66" width="8" height="4" fill="#5a3a1c"/>`,
  ].join("");
  out("mods/empires/img/herald.svg", svgTag(56, 72, body));
}
// Victory and resign screens: full-window, code-drawn, text-light.
for (const [name, bg, accent] of [["victory", "#2a2219", "#ecc95a"], ["resign", "#1a1510", "#8f8678"]] as const) {
  const body = `<defs><radialGradient id="g" cx="0.5" cy="0.45" r="0.7"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#0f0c08"/></radialGradient></defs><rect width="1600" height="900" fill="url(#g)"/>` +
    `<path d="M560 540l40-180 90 90 110-160 110 160 90-90 40 180z" fill="${accent}" fill-opacity="0.9"/><rect x="560" y="540" width="480" height="40" fill="${accent}"/>` +
    `<rect x="620" y="620" width="360" height="3" fill="${accent}"/><rect x="700" y="640" width="200" height="2" fill="${accent}" fill-opacity="0.6"/>`; // the word is drawn by the dialog role (resvg has no fonts)
  out(`mods/empires/img/${name}.svg`, svgTag(1600, 900, body, ' preserveAspectRatio="xMidYMid slice"'));
}
// Settings preview, 320×200 (SPEC §2): a schematic of the layout.
{
  const body = [
    `<rect width="320" height="200" fill="#1f1c17"/>`,
    `<rect width="320" height="14" fill="#4f341c"/><rect width="320" height="1" fill="#9a6a3c"/><rect y="13" width="320" height="1" fill="#1a1109"/>`,
    `<rect x="4" y="3" width="22" height="8" fill="#6e665a"/>`,
    ...[0, 1, 2, 3, 4].map((i) => `<circle cx="${40 + i * 18}" cy="7" r="3" fill="${["#d9a441", "#7a5230", "#e2c13a", "#8c8375", "#3561d9"][i]}"/><rect x="${45 + i * 18}" y="5" width="6" height="4" fill="#f1e6c8"/>`),
    `<rect x="130" y="4" width="60" height="6" fill="#b8922a"/>`,
    `<rect x="286" y="4" width="28" height="6" fill="#f1e6c8" fill-opacity="0.5"/>`,
    // field with two panes
    `<rect x="6" y="20" width="308" height="70" fill="#16110b" stroke="#b8922a" stroke-width="2"/><rect x="6" y="20" width="308" height="9" fill="#4f341c"/><rect x="9" y="22" width="3" height="5" fill="#3561d9"/><rect x="16" y="22" width="60" height="4" fill="#f1e6c8"/><rect x="200" y="22" width="30" height="4" fill="#e0a63a"/>`,
    `<rect x="6" y="94" width="150" height="46" fill="#16110b" stroke="#4f341c" stroke-width="2"/><rect x="6" y="94" width="150" height="8" fill="#4f341c"/><rect x="9" y="96" width="3" height="4" fill="#d23a2f"/><rect x="16" y="96" width="50" height="3" fill="#f1e6c8"/>`,
    `<rect x="164" y="94" width="150" height="46" fill="#16110b" stroke="#4f341c" stroke-width="2"/><rect x="164" y="94" width="150" height="8" fill="#4f341c"/><rect x="167" y="96" width="3" height="4" fill="#3e9e48"/><rect x="174" y="96" width="50" height="3" fill="#f1e6c8"/><rect x="280" y="96" width="24" height="3" fill="#d63c2e"/>`,
    ...[0, 1, 2, 3].map((i) => `<rect x="${20 + i * 10}" y="${36 + i * 9}" width="3" height="4" fill="#ecc95a"/><rect x="${25 + i * 10}" y="${36 + i * 9}" width="${30 - i * 4}" height="4" fill="#e7d9b6" fill-opacity="0.7"/>`),
    // HUD
    `<rect y="146" width="320" height="54" fill="#6e665a"/><rect y="146" width="320" height="1" fill="#b0a693"/>`,
    ...Array.from({ length: 15 }, (_, i) => `<rect x="${8 + (i % 5) * 16}" y="${152 + Math.floor(i / 5) * 15}" width="13" height="12" fill="#8c8375" stroke="#3d382f"/>`),
    `<rect x="98" y="152" width="20" height="20" fill="#1f1c17" stroke="#b8922a"/><rect x="124" y="154" width="60" height="4" fill="#f1e6c8"/><rect x="124" y="162" width="40" height="3" fill="#cdbf9c"/><rect x="124" y="170" width="50" height="4" fill="#e0a63a"/>`,
    `<polygon points="268,150 312,172 268,194 224,172" fill="#3561d9"/><polygon points="268,150 312,172 268,172 246,161" fill="#d23a2f"/><polygon points="268,172 312,172 268,194 246,183" fill="#3e9e48"/><polygon points="268,150 312,172 268,194 224,172" fill="none" stroke="#b8922a"/>`,
    `<circle cx="262" cy="166" r="2" fill="#e0a63a"/><circle cx="286" cy="180" r="2" fill="#d63c2e"/><circle cx="250" cy="176" r="2" fill="#79bd4a"/>`,
  ].join("");
  out("layouts/empires.svg", svgTag(320, 200, `<!-- herdr-empires: the settings preview, generated by art/textures.ts -->` + body));
}
writeFileSync(`${root}/art/manifest-textures.json`, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Generated ${Object.keys(manifest).length} pictures + layouts/empires.svg.`);
