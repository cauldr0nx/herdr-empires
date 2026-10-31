#!/usr/bin/env bun
// tools/aoe2de-import: build a local art pack from the user's own copy of the
// DE edition of the game (Steam app 813780). Contains no game data; it only
// reads an install the user owns and writes PNGs + pack.json into the Herdr
// app home (SPEC §18.6). Never run automatically; never modifies the install.
//
//   bun tools/aoe2de-import/main.ts [--source DIR] [--home DIR] [--list] [--dry-run]
//
// Format reference: openage (https://github.com/SFTtech/openage), doc/media.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { decodeDDS, decodeWithMagick, type Image } from "./dds.ts";
import { decodeSprite, detectFormat } from "./detect.ts";
import { planDirections, type DirPlan } from "./directions.ts";
import { hexToRgb, type Frame } from "./frame.ts";
import { findInstall, GRAPHICS_SUBDIR, realFs, resolveAppHome, tildify, type FsLike } from "./locate.ts";
import { buildPackJson, PACK_NAME, paths, PLAYER_COLORS, type PackParts } from "./pack.ts";
import { parseJascPal, parsePaletteConf, type Palette } from "./palette.ts";
import { encodePNG } from "./png.ts";
import { buildImage, buildSheet, emptyBounds, growBounds, type Bounds } from "./sheet.ts";
import type { SmxPalettes } from "./smx.ts";
import { terrainVariants } from "./terrain.ts";
import { pickFile, SPRITE_EXTS, SPRITES, TERRAIN, TERRAIN_EXCLUDE, UI, type SpriteRule } from "./whitelist.ts";

export interface Options {
  source?: string;
  home?: string;
  list: boolean;
  dryRun: boolean;
  shadow: boolean;
  dirOffset?: number;
  dirCcw: boolean;
  help: boolean;
}

export const USAGE = `usage: bun tools/aoe2de-import/main.ts [--source DIR] [--home DIR] [--list] [--dry-run]
                                       [--no-shadow] [--dir-offset N] [--dir-ccw]
  --source DIR    the game folder (the one containing resources/_common); default: search Steam
  --home DIR      Herdr app home; default $HERDR_APP_HOME, $XDG_CONFIG_HOME/herdr-app, ~/.config/herdr-app
  --list          show which whitelist entries exist in the install, then exit
  --dry-run       decode everything but write nothing
  --no-shadow     leave unit/building shadows out of the sheets
  --dir-offset N  source direction that faces south (default 0; see directions.ts)
  --dir-ccw       source directions run counter-clockwise`;

export function parseArgs(argv: string[]): Options {
  const o: Options = { list: false, dryRun: false, shadow: true, dirCcw: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--source") o.source = val();
    else if (a === "--home") o.home = val();
    else if (a === "--list") o.list = true;
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--no-shadow") o.shadow = false;
    else if (a === "--dir-offset") o.dirOffset = parseInt(val(), 10);
    else if (a === "--dir-ccw") o.dirCcw = true;
    else if (a === "-h" || a === "--help") o.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return o;
}

export interface Env {
  log: (s: string) => void;
  err: (s: string) => void;
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  userHome: string;
  fs: FsLike;
  /** Repository root: the importer refuses to write inside it. */
  repoRoot: string;
}

const defaultEnv = (): Env => ({
  log: (s) => console.log(s),
  err: (s) => console.error(s),
  env: process.env,
  platform: process.platform,
  userHome: homedir(),
  fs: realFs,
  repoRoot: resolve(dirname(new URL(import.meta.url).pathname), "..", ".."),
});

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const inside = (child: string, parent: string) => {
  const r = relative(resolve(parent), resolve(child));
  return r === "" || (!r.startsWith("..") && !r.startsWith(sep) && !/^[A-Za-z]:/.test(r));
};

export async function run(opts: Options, E: Env = defaultEnv()): Promise<number> {
  if (opts.help) {
    E.log(USAGE);
    return 0;
  }
  const t = (p: string) => tildify(p, E.userHome);
  const loggingFs: FsLike = {
    exists: E.fs.exists,
    read: (p) => {
      E.log(`read   ${t(p)}`);
      return E.fs.read(p);
    },
  };

  // 1. Find the install, or refuse.
  const found = findInstall({ source: opts.source, home: E.userHome, platform: E.platform, env: E.env, fs: loggingFs });
  if (!found.dir) {
    E.err("aoe2de-import: no game install found, so nothing was done.");
    E.err(`Looked for ${GRAPHICS_SUBDIR} under:`);
    for (const d of found.tried) E.err(`  ${t(d)}`);
    if (found.tried.length === 0) E.err("  (no Steam library found)");
    E.err("Pass the game folder with --source DIR. This tool never downloads game files.");
    return 2;
  }
  const install = found.dir;
  E.log(`install ${t(install)}`);
  const gfxDir = join(install, GRAPHICS_SUBDIR);
  const spriteNames = readdirSync(gfxDir).filter((f) => SPRITE_EXTS.test(f));
  const terrainFiles = walk(join(install, "resources", "_common", "terrain", "textures")).filter(
    (p) => /\.dds$/i.test(p) && !TERRAIN_EXCLUDE.test(p.split(/[\\/]/).pop()!),
  );
  const uiFiles = walk(join(install, "resources", "_common", "wpfg")).filter((p) => /\.png$/i.test(p));

  const picks = SPRITES.map((r) => ({ rule: r, file: pickFile(spriteNames, r.patterns) }));
  const terrainPicks = TERRAIN.map((r) => {
    const names = terrainFiles.map((p) => p.split(/[\\/]/).pop()!);
    const hit = pickFile(names, r.patterns);
    return { rule: r, file: hit ? terrainFiles[names.indexOf(hit)] : null };
  });
  const uiPicks = UI.map((r) => {
    const names = uiFiles.map((p) => p.split(/[\\/]/).pop()!);
    const hit = pickFile(names, r.patterns);
    return { key: r.key, file: hit ? uiFiles[names.indexOf(hit)] : null };
  });

  // 2. --list: report the whitelist against this install.
  if (opts.list) {
    E.log(`${spriteNames.length} sprite files in ${t(gfxDir)}`);
    let ok = 0;
    for (const { rule, file } of picks) {
      const label = rule.anim ? `${rule.entity}.${rule.anim}` : rule.entity;
      if (file) {
        ok++;
        E.log(`  found    ${label.padEnd(24)} ${file}`);
      } else {
        // Suggest near misses: files sharing the first two name parts of the first pattern.
        const stem = /\^([a-z]+_[a-z]+)/i.exec(rule.patterns[0].source)?.[1] ?? "";
        const near = stem ? spriteNames.filter((f) => f.toLowerCase().startsWith(stem.toLowerCase())).slice(0, 4) : [];
        E.log(`  MISSING  ${label.padEnd(24)} ${near.length ? "near: " + near.join(", ") : ""}`);
      }
    }
    for (const { rule, file } of terrainPicks) E.log(`  ${file ? "found  " : "MISSING"}  terrain.${rule.name.padEnd(16)} ${file ? t(file) : ""}`);
    for (const { key, file } of uiPicks) E.log(`  ${file ? "found  " : "MISSING"}  ui.${key.padEnd(21)} ${file ? t(file) : ""}`);
    E.log(`${ok}/${picks.length} sprite entries found. Edit tools/aoe2de-import/whitelist.ts to fix misses.`);
    return 0;
  }

  // 3. Output location (outside the install and outside this repository).
  const appHome = resolveAppHome({ home: opts.home, env: E.env, userHome: E.userHome });
  const outDir = join(appHome, "empires-packs", PACK_NAME);
  if (inside(outDir, install)) {
    E.err("aoe2de-import: refusing to write inside the game install.");
    return 2;
  }
  if (inside(outDir, E.repoRoot)) {
    E.err("aoe2de-import: refusing to write inside the repository (imported art must never be committed). Use --home with a folder outside it.");
    return 2;
  }
  E.log(`output  ${t(outDir)}${opts.dryRun ? "  (dry run: nothing will be written)" : ""}`);

  const written: string[] = [];
  const manifest: { output: string; sources: string[] }[] = [];
  let cleared = false;
  const writeOut = (rel: string, data: Uint8Array | string, sources: string[]) => {
    const p = join(outDir, rel);
    if (opts.dryRun) {
      E.log(`would write ${t(p)}`);
    } else {
      if (!cleared) {
        // Replace a previous import of ours; never touch a folder we did not make.
        const pj = join(outDir, "pack.json");
        if (existsSync(pj)) {
          try {
            if (JSON.parse(readFileSync(pj, "utf8")).name === PACK_NAME) rmSync(outDir, { recursive: true, force: true });
          } catch {
            /* leave it */
          }
        }
        cleared = true;
      }
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, data);
      E.log(`wrote  ${t(p)}`);
    }
    written.push(rel);
    manifest.push({ output: rel, sources: sources.map((s) => relative(install, s).split(sep).join("/")) });
  };
  const readBin = (p: string): Uint8Array => {
    E.log(`read   ${t(p)}`);
    return new Uint8Array(readFileSync(p));
  };

  // 4. Palettes (only needed for SMX files; loaded lazily).
  let smxPals: SmxPalettes | null = null;
  const palettes = (): SmxPalettes => {
    if (smxPals) return smxPals;
    const palDir = join(install, "resources", "_common", "palettes");
    const conf = join(palDir, "palettes.conf");
    const table = existsSync(conf) ? parsePaletteConf(loggingFs.read(conf)) : new Map<number, string>();
    if (!existsSync(conf)) E.err(`warning: ${t(conf)} not found; SMX colours will be greyscale`);
    const cache = new Map<number, Palette | null>();
    const load = (file: string): Palette | null => {
      const p = join(palDir, file);
      if (!existsSync(p)) return null;
      try {
        return parseJascPal(loggingFs.read(p));
      } catch (e) {
        E.err(`warning: cannot parse ${t(p)}: ${(e as Error).message}`);
        return null;
      }
    };
    const playerFile = readdirSync(existsSync(palDir) ? palDir : install).find((f) => /^playercolor_blue\.pal$/i.test(f));
    smxPals = {
      byNumber: (n) => {
        if (!cache.has(n)) cache.set(n, table.has(n) ? load(table.get(n)!) : null);
        return cache.get(n)!;
      },
      player: playerFile ? load(playerFile) : null,
    };
    return smxPals;
  };

  const decodeFile = (name: string): (Frame | null)[] | null => {
    const p = join(gfxDir, name);
    const buf = readBin(p);
    const fmt = detectFormat(buf);
    if (fmt !== "smx" && fmt !== "sld") {
      E.err(`warning: ${name}: unsupported format "${fmt}", skipped`);
      return null;
    }
    try {
      return decodeSprite(buf, fmt === "smx" ? palettes() : { byNumber: () => null, player: null }).frames;
    } catch (e) {
      E.err(`warning: ${name}: decode failed (${(e as Error).message}), skipped`);
      return null;
    }
  };

  const colors = PLAYER_COLORS.map((c) => ({ name: c.name, rgb: hexToRgb(c.hex) }));
  const parts: PackParts = { terrain: {}, units: {}, buildings: {}, nature: {}, ui: {} };
  const dirOpts = { offset: opts.dirOffset, clockwise: !opts.dirCcw };

  // 5. Units: decode all anims of an entity first so every sheet shares one cell size.
  const byEntity = new Map<string, { rule: SpriteRule; file: string }[]>();
  for (const { rule, file } of picks) {
    if (!file) continue;
    if (!byEntity.has(rule.entity)) byEntity.set(rule.entity, []);
    byEntity.get(rule.entity)!.push({ rule, file });
  }
  for (const [entity, list] of byEntity) {
    const kind = list[0].rule.kind;
    if (kind === "unit") {
      const anims: { rule: SpriteRule; file: string; frames: (Frame | null)[]; plan: DirPlan }[] = [];
      const bd: Bounds = emptyBounds();
      for (const { rule, file } of list) {
        const frames = decodeFile(file);
        if (!frames || frames.every((f) => !f)) continue;
        const plan = planDirections(frames.length, dirOpts);
        const mirror = plan.rows.some((r) => r.flip);
        for (const f of frames) if (f) growBounds(bd, f, opts.shadow, mirror);
        anims.push({ rule, file, frames, plan });
        E.log(`  ${entity}.${rule.anim}: ${frames.length} frames, ${plan.sourceDirs} source dirs x ${plan.framesPerDir}`);
      }
      if (anims.length === 0) continue;
      const entry = { anchor: [bd.left, bd.top] as [number, number], frame: [bd.left + bd.right, bd.top + bd.bottom] as [number, number], anims: {} as Record<string, any> };
      for (const a of anims) {
        const sheet = paths.unitSheet(entity, a.rule.anim!);
        for (const c of colors) {
          const cv = buildSheet(a.frames, a.plan, bd, c.rgb, opts.shadow);
          writeOut(sheet.replace("{color}", c.name), encodePNG(cv.width, cv.height, cv.rgba), [join(gfxDir, a.file)]);
        }
        entry.anims[a.rule.anim!] = { fps: a.rule.fps ?? 10, dirs: a.plan.rows.length, frames: a.plan.framesPerDir, sheet };
      }
      parts.units[entity] = entry;
    } else {
      const { file } = list[0];
      const frames = decodeFile(file);
      const usable = (frames ?? []).filter((f): f is Frame => !!f);
      if (usable.length === 0) continue;
      const chosen = kind === "building" ? usable.slice(0, 1) : usable.slice(0, 4);
      const bd = emptyBounds();
      for (const f of chosen) growBounds(bd, f, opts.shadow, false);
      const anchor: [number, number] = [bd.left, bd.top];
      const frame: [number, number] = [bd.left + bd.right, bd.top + bd.bottom];
      E.log(`  ${entity}: ${usable.length} frames, using ${chosen.length}`);
      if (kind === "building") {
        const image = paths.building(entity);
        for (const c of colors) {
          const cv = buildImage(chosen[0], bd, c.rgb, opts.shadow);
          writeOut(image.replace("{color}", c.name), encodePNG(cv.width, cv.height, cv.rgba), [join(gfxDir, file)]);
        }
        parts.buildings[entity] = { anchor, frame, image };
      } else {
        const variants = chosen.map((f, i) => {
          const rel = paths.nature(entity, i);
          const cv = buildImage(f, bd, colors[6].rgb, opts.shadow); // nature has no owner; gray if any mask
          writeOut(rel, encodePNG(cv.width, cv.height, cv.rgba), [join(gfxDir, file)]);
          return rel;
        });
        parts.nature[entity] = { anchor, frame, image: variants[0], variants };
      }
    }
  }

  // 6. Terrain.
  for (const { rule, file } of terrainPicks) {
    if (!file) continue;
    const buf = readBin(file);
    let img: Image | null = null;
    try {
      img = decodeDDS(buf);
    } catch (e) {
      E.err(`warning: ${t(file)}: ${(e as Error).message}`);
    }
    if (!img) {
      img = decodeWithMagick(file);
      if (img) E.log(`  (decoded ${t(file)} with ImageMagick)`);
    }
    if (!img) {
      E.err(`warning: ${t(file)}: unsupported DDS pixel format and ImageMagick unavailable; terrain.${rule.name} skipped`);
      continue;
    }
    parts.terrain[rule.name] = terrainVariants(img).map((px, i) => {
      const rel = paths.terrain(rule.name, i);
      writeOut(rel, encodePNG(96, 48, px), [file]);
      return rel;
    });
  }

  // 7. UI icons (copied as-is).
  for (const { key, file } of uiPicks) {
    if (!file) continue;
    const rel = paths.ui(key);
    writeOut(rel, readBin(file), [file]);
    parts.ui[key] = rel;
  }

  // 8. pack.json + provenance manifest.
  const pack = buildPackJson(parts);
  writeOut("pack.json", JSON.stringify(pack, null, 2) + "\n", []);
  writeOut("pack.manifest.json", JSON.stringify({ generator: "tools/aoe2de-import", local: true, files: manifest }, null, 2) + "\n", []);

  const missing = picks.filter((p) => !p.file).map((p) => (p.rule.anim ? `${p.rule.entity}.${p.rule.anim}` : p.rule.entity));
  E.log(`${opts.dryRun ? "would write" : "wrote"} ${written.length} files; ${Object.keys(pack.entities).length} entities.`);
  if (missing.length) E.log(`not found (the mod falls back for these): ${missing.join(", ")}`);
  return 0;
}

if (import.meta.main) {
  let opts: Options;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`aoe2de-import: ${(e as Error).message}\n${USAGE}`);
    process.exit(64);
  }
  process.exit(await run(opts));
}
