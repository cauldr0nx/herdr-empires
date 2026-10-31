// Install discovery, app home, refusal, and an end-to-end import over a
// SYNTHETIC fake install in a temp folder (never a real game, never the repo).
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { findInstall, GRAPHICS_SUBDIR, libraryPathsFromVdf, parseVdf, resolveAppHome, tildify, type FsLike } from "../../tools/aoe2de-import/locate.ts";
import { parseArgs, run, type Env } from "../../tools/aoe2de-import/main.ts";
import { buildPackJson, PLAYER_COLORS } from "../../tools/aoe2de-import/pack.ts";
import { decodeSimplePNG } from "../../tools/aoe2de-import/png.ts";
import { pickFile, SPRITES } from "../../tools/aoe2de-import/whitelist.ts";
import { bc1Block, bc4Block, ddsDXT1, rgb565, sldFile, type SldFrameSpec } from "./synth.ts";

const UHOME = "/u/demo"; // fake user home for pure tests
const repoRoot = resolve(import.meta.dir, "..", "..");
const temps: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "aoe2de-test-"));
  temps.push(d);
  return d;
};
afterAll(() => { for (const d of temps) rmSync(d, { recursive: true, force: true }); });

const fakeFs = (files: Record<string, string>, dirs: string[] = []): FsLike => {
  const all = new Set([...Object.keys(files), ...dirs]);
  return {
    exists: (p) => all.has(p) || [...all].some((f) => f.startsWith(p + "/")),
    read: (p) => {
      if (!(p in files)) throw new Error("ENOENT " + p);
      return files[p];
    },
  };
};

describe("libraryfolders.vdf", () => {
  const modern = `"libraryfolders"
{
\t"0"
\t{
\t\t"path"\t\t"${UHOME}/.local/share/Steam"
\t\t"label"\t\t""
\t\t"apps"
\t\t{
\t\t\t"228980"\t\t"123"
\t\t}
\t}
\t"1"
\t{
\t\t"path"\t\t"/mnt/games/SteamLibrary"
\t\t"apps" { "813780" "456" }
\t}
\t"2"
\t{
\t\t"path"\t\t"D:\\\\Games\\\\Steam"
\t}
}`;
  test("modern format: every library path, backslashes unescaped", () => {
    expect(libraryPathsFromVdf(modern)).toEqual([`${UHOME}/.local/share/Steam`, "/mnt/games/SteamLibrary", "D:\\Games\\Steam"]);
  });
  test("old format: numeric keys with string values", () => {
    const old = `"LibraryFolders"\n{\n\t"TimeNextStatsReport"\t"1"\n\t"ContentStatsID"\t"-1"\n\t"1"\t"/srv/steam2"\n}`;
    expect(libraryPathsFromVdf(old)).toEqual(["/srv/steam2"]);
  });
  test("nested objects parse, comments ignored", () => {
    expect(parseVdf(`// hi\n"a" { "b" "c" "d" { "e" "f" } }`)).toEqual({ a: { b: "c", d: { e: "f" } } });
  });
});

describe("finding the install", () => {
  const steam = `${UHOME}/.local/share/Steam`;
  const vdf = `"libraryfolders" { "0" { "path" "${steam}" } "1" { "path" "/mnt/games/SteamLibrary" } }`;
  test("follows libraryfolders.vdf to a second library", () => {
    const install = "/mnt/games/SteamLibrary/steamapps/common/AoE2DE";
    const fs = fakeFs({ [`${steam}/steamapps/libraryfolders.vdf`]: vdf }, [`${install}/${GRAPHICS_SUBDIR}`]);
    const r = findInstall({ home: UHOME, platform: "linux", env: {}, fs });
    expect(r.dir).toBe(install);
    expect(r.tried).toContain(`${steam}/steamapps/common/AoE2DE`);
  });
  test("flatpak Steam root is probed", () => {
    const root = `${UHOME}/.var/app/com.valvesoftware.Steam/.local/share/Steam`;
    const install = `${root}/steamapps/common/AoE2DE`;
    const r = findInstall({ home: UHOME, platform: "linux", env: {}, fs: fakeFs({}, [`${install}/${GRAPHICS_SUBDIR}`]) });
    expect(r.dir).toBe(install);
  });
  test("--source is used as given and never replaced by a Steam hit", () => {
    const other = `${steam}/steamapps/common/AoE2DE`;
    const fs = fakeFs({}, [`${other}/${GRAPHICS_SUBDIR}`, "/games/de"]);
    expect(findInstall({ source: "/games/de", home: UHOME, platform: "linux", env: {}, fs }).dir).toBeNull();
    expect(findInstall({ source: other, home: UHOME, platform: "linux", env: {}, fs }).dir).toBe(other);
  });
  test("nothing found -> null with the list of folders tried", () => {
    const fs = fakeFs({}, [steam]);
    const r = findInstall({ home: UHOME, platform: "linux", env: {}, fs });
    expect(r.dir).toBeNull();
    expect(r.tried).toEqual([`${steam}/steamapps/common/AoE2DE`]);
  });
});

describe("app home", () => {
  test("--home beats env; HERDR_APP_HOME beats XDG; default ~/.config/herdr-app", () => {
    expect(resolveAppHome({ home: "/x", env: { HERDR_APP_HOME: "/y" }, userHome: UHOME })).toBe("/x");
    expect(resolveAppHome({ env: { HERDR_APP_HOME: "/y", XDG_CONFIG_HOME: "/z" }, userHome: UHOME })).toBe("/y");
    expect(resolveAppHome({ env: { XDG_CONFIG_HOME: "/z" }, userHome: UHOME })).toBe("/z/herdr-app");
    expect(resolveAppHome({ env: {}, userHome: UHOME })).toBe(`${UHOME}/.config/herdr-app`);
  });
  test("printed paths are shortened to ~", () => {
    expect(tildify(`${UHOME}/.config/herdr-app`, UHOME)).toBe("~/.config/herdr-app");
    expect(tildify("/srv/x", UHOME)).toBe("/srv/x");
  });
});

describe("whitelist", () => {
  test("prefers _x1 over _x2, then the shortest name", () => {
    const rule = SPRITES.find((r) => r.entity === "villager" && r.anim === "idle")!;
    expect(pickFile(["u_vil_male_villager_idleA_x2.sld", "u_vil_male_villager_idleA_x1.sld"], rule.patterns)).toBe("u_vil_male_villager_idleA_x1.sld");
    expect(pickFile(["something_else.sld"], rule.patterns)).toBeNull();
  });
  test("covers every entity the pack needs", () => {
    const names = new Set(SPRITES.map((r) => r.entity));
    for (const e of ["villager", "town_center", "house", "mill", "lumber_camp", "mining_camp", "monastery", "university", "tree", "gold_mine", "stone_mine", "berry_bush", "monk", "scout", "knight", "king"]) {
      expect(names.has(e)).toBe(true);
    }
  });
});

describe("pack.json schema shape", () => {
  test("buildPackJson matches SPEC §18.4", () => {
    const pack = buildPackJson({
      terrain: { grass: ["terrain/grass-0.png"] },
      units: { villager: { anchor: [24, 44], frame: [48, 52], anims: { idle: { fps: 6, dirs: 8, frames: 8, sheet: "units/villager-idle-{color}.png" } } } },
      buildings: { house: { anchor: [40, 50], frame: [80, 70], image: "buildings/house-{color}.png" } },
      nature: { tree: { anchor: [10, 30], frame: [20, 40], image: "nature/tree-0.png", variants: ["nature/tree-0.png"] } },
      ui: { food: "ui/food.png" },
    });
    expect(pack.name).toBe("local");
    expect(pack.tile).toEqual([96, 48]);
    expect(pack.playerColors).toEqual(["blue", "red", "green", "yellow", "cyan", "purple", "gray", "orange"]);
    expect(pack.playerColorHex.orange).toBe("#e3802c");
    expect(pack.dirOrder.length).toBe(8);
    expect(pack.entities.villager.anims.idle.sheet).toContain("{color}");
    expect((pack.entities as any).house.image).toContain("{color}");
    expect((pack.entities as any).tree.variants.length).toBe(1);
    expect(pack.ui.food).toBe("ui/food.png");
  });
});

describe("CLI", () => {
  test("argument parsing", () => {
    expect(parseArgs(["--source", "/g", "--home", "/h", "--list", "--dry-run"])).toMatchObject({ source: "/g", home: "/h", list: true, dryRun: true });
    expect(() => parseArgs(["--bogus"])).toThrow(/unknown/);
    expect(() => parseArgs(["--source"])).toThrow(/needs a value/);
  });
});

function harness(over: Partial<Env> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const E: Env = {
    log: (s) => out.push(s),
    err: (s) => err.push(s),
    env: {},
    platform: "linux",
    userHome: tmp(), // empty home: no Steam anywhere
    fs: { exists: existsSync, read: (p) => readFileSync(p, "utf8") },
    repoRoot,
    ...over,
  };
  return { E, out, err };
}

describe("refusal", () => {
  test("no install anywhere -> exit 2, clear message, nothing written", async () => {
    const home = tmp();
    const { E, err } = harness();
    const code = await run(parseArgs(["--home", home]), E);
    expect(code).toBe(2);
    expect(err.join("\n")).toMatch(/no game install found/);
    expect(err.join("\n")).toMatch(/never downloads/);
    expect(existsSync(join(home, "empires-packs"))).toBe(false);
  });
  test("--source that is not an install -> exit 2", async () => {
    const { E, err } = harness();
    expect(await run(parseArgs(["--source", tmp(), "--home", tmp()]), E)).toBe(2);
    expect(err.join("\n")).toMatch(/no game install found/);
  });
});

// ---- end to end over a synthetic install ----

function unitSld(frames: number): Uint8Array {
  const spec: SldFrameSpec[] = [];
  for (let i = 0; i < frames; i++) {
    spec.push({
      canvas: [16, 16], hotspot: [6, 7],
      main: { rect: [4, 4, 8, 8], cmds: [[0, 1]], blocks: [bc1Block(rgb565(128, 128, 128), 0, new Array(16).fill(0))] },
      player: { cmds: [[0, 1]], blocks: [bc4Block(255, 255, new Array(16).fill(0))] },
    });
  }
  return sldFile(spec);
}

function fakeInstall(): string {
  const root = join(tmp(), "steamapps", "common", "AoE2DE");
  const gfx = join(root, GRAPHICS_SUBDIR);
  mkdirSync(gfx, { recursive: true });
  writeFileSync(join(gfx, "u_vil_male_villager_idleA_x1.sld"), unitSld(16));
  writeFileSync(join(gfx, "u_vil_male_villager_walkA_x1.sld"), unitSld(32));
  writeFileSync(join(gfx, "b_west_house_age3_x1.sld"), unitSld(1));
  writeFileSync(join(gfx, "n_tree_oak_x1.sld"), unitSld(3));
  writeFileSync(join(gfx, "unrelated_x1.sld"), unitSld(1));
  const terr = join(root, "resources", "_common", "terrain", "textures");
  mkdirSync(terr, { recursive: true });
  writeFileSync(join(terr, "g_gr2_00_color.dds"), ddsDXT1(16, 16, rgb565(40, 160, 40)));
  writeFileSync(join(terr, "g_gr2_00_normal.dds"), ddsDXT1(16, 16, rgb565(128, 128, 255)));
  return root;
}

describe("end-to-end import (synthetic install, temp app home)", () => {
  test("--list reports found and missing entries without writing", async () => {
    const install = fakeInstall();
    const home = tmp();
    const { E, out } = harness();
    expect(await run(parseArgs(["--source", install, "--home", home, "--list"]), E)).toBe(0);
    const text = out.join("\n");
    expect(text).toMatch(/found\s+villager\.idle\s+u_vil_male_villager_idleA_x1\.sld/);
    expect(text).toMatch(/MISSING\s+monk\.idle/);
    expect(text).toMatch(/found\s+terrain\.grass/);
    expect(existsSync(join(home, "empires-packs"))).toBe(false);
  });

  test("--dry-run writes nothing", async () => {
    const install = fakeInstall();
    const home = tmp();
    const { E, out } = harness();
    expect(await run(parseArgs(["--source", install, "--home", home, "--dry-run"]), E)).toBe(0);
    expect(out.some((l) => l.startsWith("would write"))).toBe(true);
    expect(existsSync(join(home, "empires-packs"))).toBe(false);
  });

  test("writes pack.json + colour sheets, prints reads and writes, leaves the install alone", async () => {
    const install = fakeInstall();
    const home = tmp();
    const { E, out } = harness();
    expect(await run(parseArgs(["--source", install, "--home", home]), E)).toBe(0);
    const dir = join(home, "empires-packs", "local");
    const pack = JSON.parse(readFileSync(join(dir, "pack.json"), "utf8"));
    expect(pack.name).toBe("local");
    expect(pack.playerColors.length).toBe(8);
    const v = pack.entities.villager;
    expect(v.anims.idle).toMatchObject({ dirs: 8, frames: 1 });
    expect(v.anims.walk).toMatchObject({ dirs: 8, frames: 2 });
    expect(v.anchor).toEqual([2, 3]);
    expect(v.frame).toEqual([4, 4]);
    expect(pack.entities.house.image).toBe("buildings/house-{color}.png");
    expect(pack.entities.tree.variants.length).toBe(3);
    expect(pack.terrain.grass.length).toBe(4);
    for (const c of PLAYER_COLORS) {
      const sheet = decodeSimplePNG(new Uint8Array(readFileSync(join(dir, v.anims.walk.sheet.replace("{color}", c.name)))));
      expect([sheet.width, sheet.height]).toEqual([8, 32]); // 2 frames x 8 rows of 4x4 cells
      // Player mask is full, base grey 128 -> shade ~0.5 -> close to the player colour.
      const [r, g, b] = sheet.rgba;
      const want = [1, 3, 5].map((k) => parseInt(c.hex.slice(k, k + 2), 16));
      expect(Math.abs(r - want[0]) + Math.abs(g - want[1]) + Math.abs(b - want[2])).toBeLessThan(12);
    }
    const tile = decodeSimplePNG(new Uint8Array(readFileSync(join(dir, pack.terrain.grass[0]))));
    expect([tile.width, tile.height]).toEqual([96, 48]);
    const text = out.join("\n");
    expect(text).toMatch(/read\s+.*u_vil_male_villager_idleA_x1\.sld/);
    expect(text).toMatch(/wrote\s+.*pack\.json/);
    expect(text).not.toMatch(/g_gr2_00_normal/); // normal maps are not terrain colour
    expect(existsSync(join(dir, "pack.manifest.json"))).toBe(true);
  });

  test("refuses to write into the repository", async () => {
    const install = fakeInstall();
    const { E, err } = harness();
    expect(await run(parseArgs(["--source", install, "--home", join(repoRoot, ".never")]), E)).toBe(2);
    expect(err.join("\n")).toMatch(/inside the repository/);
    expect(existsSync(join(repoRoot, ".never"))).toBe(false);
  });
});
