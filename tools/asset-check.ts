// tools/asset-check.ts: the provenance guard (SPEC §11.3, §13.3).
// Every non-JS file under mods/empires/ needs an entry in
// mods/empires/assets.manifest.json with an allow-listed license; CC-BY-SA-3.0
// is allowed only under mods/empires/assets-cc-by-sa/. Entries for files that
// no longer exist fail too (stale provenance is wrong provenance).
//
//   bun tools/asset-check.ts [--write]   (--write: add generated files from art/manifest-generated.json)

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const modDir = join(root, "mods", "empires");
const manifestPath = join(modDir, "assets.manifest.json");
const ALLOW = new Set(["Apache-2.0", "CC0-1.0", "OFL-1.1", "CC-BY-3.0", "CC-BY-4.0"]);
const SA = "CC-BY-SA-3.0";
// Not assets: the mod's own metadata and docs.
const EXEMPT = new Set(["mod.json", "README.md", "assets.manifest.json", ".empires-version"]);
const write = process.argv.includes("--write");

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (e !== "node_modules") out.push(...files(p)); }
    else out.push(relative(modDir, p));
  }
  return out.sort();
}

let manifest: Record<string, any> = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
if (write) {
  for (const name of ["manifest-generated.json", "manifest-textures.json", "manifest-sounds.json"]) {
    const gen = join(root, "art", name);
    if (!existsSync(gen)) continue;
    for (const [file, generator] of Object.entries(JSON.parse(readFileSync(gen, "utf8")))) {
      manifest[file] = { source: "generated", generator, url: null, author: null, license: "Apache-2.0", modified: false, notes: manifest[file]?.notes ?? "" };
    }
  }
  // Generated files that went away leave the manifest too.
  for (const f of Object.keys(manifest)) if (manifest[f].source === "generated" && !existsSync(join(modDir, f))) delete manifest[f];
  manifest = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

const errors: string[] = [];
const all = files(modDir).filter((f) => !f.endsWith(".js") && !EXEMPT.has(f.split("/").pop()!));
for (const f of all) {
  const e = manifest[f];
  if (!e) { errors.push(`${f}: no manifest entry`); continue; }
  for (const k of ["source", "license"]) if (typeof e[k] !== "string" || !e[k]) errors.push(`${f}: manifest entry needs "${k}"`);
  if (e.license === SA) { if (!f.startsWith("assets-cc-by-sa/")) errors.push(`${f}: ${SA} only under assets-cc-by-sa/`); }
  else if (!ALLOW.has(e.license)) errors.push(`${f}: license "${e.license}" not allowed (${[...ALLOW].join(", ")})`);
  if (e.source === "generated" && !e.generator) errors.push(`${f}: generated files name their generator`);
  if (e.source !== "generated" && e.source !== "original" && !e.url) errors.push(`${f}: third-party files need a url`);
  if ((e.license === "CC-BY-3.0" || e.license === "CC-BY-4.0") && !e.author) errors.push(`${f}: CC-BY files need an author (and a CREDITS.md line)`);
  if (f.startsWith("assets-cc-by-sa/") && !existsSync(join(modDir, "assets-cc-by-sa", "LICENSE"))) errors.push(`${f}: assets-cc-by-sa/ needs its own LICENSE`);
}
for (const f of Object.keys(manifest)) if (!existsSync(join(modDir, f))) errors.push(`${f}: manifest entry for a file that does not exist`);

if (errors.length) {
  for (const e of errors) console.error(`asset-check: ${e}`);
  console.error(`asset-check: FAILED (${errors.length})`);
  process.exit(1);
}
console.log(`asset-check: ok (${all.length} assets, ${Object.keys(manifest).length} entries)`);
