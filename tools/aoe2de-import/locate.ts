// Finding the game install (Steam libraries) and the Herdr app home.
// Everything here takes an injectable filesystem so it can be unit-tested
// without touching the real machine.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const STEAM_APP_ID = "813780";
export const INSTALL_DIR_NAME = "AoE2DE";
/** A file that must exist for a folder to count as the game install. */
export const GRAPHICS_SUBDIR = join("resources", "_common", "drs", "graphics");

export interface FsLike {
  exists(p: string): boolean;
  read(p: string): string;
}

export const realFs: FsLike = {
  exists: (p) => existsSync(p),
  read: (p) => readFileSync(p, "utf8"),
};

// ---------------------------------------------------------------- VDF ----

export type Vdf = { [k: string]: string | Vdf };

/** Parse Valve KeyValues text (the format of libraryfolders.vdf). */
export function parseVdf(text: string): Vdf {
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c === "{" || c === "}") {
      tokens.push(c);
      i++;
    } else if (c === '"') {
      let s = "";
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === "\\" && i + 1 < text.length) {
          const n = text[i + 1];
          s += n === "n" ? "\n" : n === "t" ? "\t" : n;
          i += 2;
        } else s += text[i++];
      }
      i++;
      tokens.push(`"${s}`); // leading quote marks a string token
    } else if (/\s/.test(c)) {
      i++;
    } else {
      let s = "";
      while (i < text.length && !/[\s{}"]/.test(text[i])) s += text[i++];
      tokens.push(`"${s}`);
    }
  }
  let p = 0;
  const obj = (): Vdf => {
    const o: Vdf = {};
    while (p < tokens.length && tokens[p] !== "}") {
      const key = tokens[p++].slice(1);
      const v = tokens[p++];
      if (v === "{") {
        o[key] = obj();
        p++; // closing brace
      } else if (v !== undefined) {
        o[key] = v.slice(1);
      }
    }
    return o;
  };
  return obj();
}

/**
 * Library paths listed in a libraryfolders.vdf. Handles the current format
 * ("0" { "path" "..." }) and the old one ("1" "D:\\Games\\Steam").
 */
export function libraryPathsFromVdf(text: string): string[] {
  const root = parseVdf(text);
  const top = (root.libraryfolders ?? root.LibraryFolders ?? root) as Vdf;
  const out: string[] = [];
  if (typeof top !== "object") return out;
  for (const [k, v] of Object.entries(top)) {
    if (!/^\d+$/.test(k)) continue;
    if (typeof v === "string") out.push(v);
    else if (typeof v.path === "string") out.push(v.path);
  }
  return out;
}

// ----------------------------------------------------------- install ----

export interface LocateOptions {
  source?: string;
  home?: string;
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  fs?: FsLike;
}

/** Steam root folders to probe, in order. */
export function steamRoots(o: { home: string; platform: NodeJS.Platform; env: Record<string, string | undefined> }): string[] {
  const h = o.home;
  if (o.platform === "win32") {
    const pf86 = o.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
    const pf = o.env.ProgramFiles ?? "C:\\Program Files";
    return [join(pf86, "Steam"), join(pf, "Steam")];
  }
  if (o.platform === "darwin") return [join(h, "Library", "Application Support", "Steam")];
  return [
    join(h, ".steam", "steam"),
    join(h, ".steam", "root"),
    join(h, ".local", "share", "Steam"),
    join(h, ".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam"), // flatpak
    join(h, "snap", "steam", "common", ".local", "share", "Steam"), // snap
  ];
}

export function isInstall(dir: string, fs: FsLike): boolean {
  return fs.exists(join(dir, GRAPHICS_SUBDIR));
}

export interface LocateResult {
  dir: string | null;
  /** Every folder that was checked, in order (for the refusal message). */
  tried: string[];
}

/** Find the game install: --source, then Steam libraries, then common Windows paths. */
export function findInstall(opts: LocateOptions = {}): LocateResult {
  const fs = opts.fs ?? realFs;
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  const home = opts.home ?? homedir();
  const tried: string[] = [];
  if (opts.source) {
    // An explicit --source is never second-guessed by a Steam lookup.
    tried.push(opts.source);
    return { dir: isInstall(opts.source, fs) ? opts.source : null, tried };
  }
  const libs: string[] = [];
  for (const root of steamRoots({ home, platform, env })) {
    if (!fs.exists(root)) continue;
    libs.push(root);
    const vdf = join(root, "steamapps", "libraryfolders.vdf");
    if (fs.exists(vdf)) {
      try {
        libs.push(...libraryPathsFromVdf(fs.read(vdf)));
      } catch {
        // a malformed vdf just means no extra libraries
      }
    }
  }
  const seen = new Set<string>();
  for (const lib of libs) {
    const dir = join(lib, "steamapps", "common", INSTALL_DIR_NAME);
    if (seen.has(dir)) continue;
    seen.add(dir);
    tried.push(dir);
    if (isInstall(dir, fs)) return { dir, tried };
  }
  if (platform === "win32") {
    for (const dir of [
      "C:\\Program Files (x86)\\Steam\\steamapps\\common\\AoE2DE",
      "D:\\SteamLibrary\\steamapps\\common\\AoE2DE",
      "C:\\XboxGames\\Age of Empires II- Definitive Edition\\Content", // Microsoft Store / Game Pass layout (unverified)
    ]) {
      if (seen.has(dir)) continue;
      tried.push(dir);
      if (isInstall(dir, fs)) return { dir, tried };
    }
  }
  return { dir: null, tried };
}

// ---------------------------------------------------------- app home ----

/** App home: --home, else $HERDR_APP_HOME, else $XDG_CONFIG_HOME/herdr-app, else ~/.config/herdr-app. */
export function resolveAppHome(o: { home?: string; env?: Record<string, string | undefined>; userHome?: string } = {}): string {
  const env = o.env ?? process.env;
  if (o.home) return o.home;
  if (env.HERDR_APP_HOME) return env.HERDR_APP_HOME;
  if (env.XDG_CONFIG_HOME) return join(env.XDG_CONFIG_HOME, "herdr-app");
  return join(o.userHome ?? homedir(), ".config", "herdr-app");
}

/** Shorten the user's home directory to "~" for printing. */
export function tildify(p: string, userHome = homedir()): string {
  if (!userHome) return p;
  if (p === userHome) return "~";
  if (p.startsWith(userHome + "/") || p.startsWith(userHome + "\\")) return "~" + p.slice(userHome.length);
  return p;
}
