// art/sheet.ts: a contact sheet of every generated icon/picture for review
// (output under art/out/, gitignored). Renders with the pre-installed Chromium
// via Playwright, so SVGs look as a browser (and GPUI's resvg) draws them.
//   bun art/sheet.ts [repo root]
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
const root = resolve(process.argv[2] ?? ".");
const out = `${root}/art/out`;
mkdirSync(out, { recursive: true });
import { readFileSync } from "node:fs";
// Glyphs are inlined so `currentColor` takes the cell's colour, as svg() tints them in Herdr.
const cell = (dir: string, f: string, bg: string, color: string, size: number) => {
  const inner = dir === "icons"
    ? readFileSync(`${root}/mods/empires/${dir}/${f}`, "utf8").replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)
    : `<img src="file://${root}/mods/empires/${dir}/${f}" width="${size}" height="${size}">`;
  return `<div class="c" style="background:${bg};color:${color}">${inner}<span>${f.replace(".svg", "")}</span></div>`;
};
let html = `<html><body style="margin:0;background:#3d382f;font:11px sans-serif;color:#f1e6c8"><div style="display:flex;flex-wrap:wrap;width:900px">`;
for (const f of readdirSync(`${root}/mods/empires/icons`).filter((x) => x.endsWith(".svg")).sort()) html += cell("icons", f, "#6e665a", "#f1e6c8", 48);
for (const f of readdirSync(`${root}/mods/empires/img`).filter((x) => x.endsWith(".svg")).sort()) html += cell("img", f, "#2e1f12", "#f1e6c8", 64);
html += `</div><style>.c{width:100px;height:100px;margin:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px}.c img{display:block}</style></body></html>`;
writeFileSync(`${out}/sheet.html`, html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 920, height: 1200 } });
await page.goto(`file://${out}/sheet.html`);
await page.screenshot({ path: `${out}/sheet.png`, fullPage: true });
await browser.close();
console.log(`Contact sheet: ${out}/sheet.png`);
