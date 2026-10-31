// pack.json assembly (schema: SPEC §18.4).

import { PACK_DIRS } from "./directions.ts";
import { TILE } from "./terrain.ts";

export const PACK_NAME = "local";

/** The 8 pack player colours, in pack order. */
export const PLAYER_COLORS: { name: string; hex: string }[] = [
  { name: "blue", hex: "#3561d9" },
  { name: "red", hex: "#d23a2f" },
  { name: "green", hex: "#3e9e48" },
  { name: "yellow", hex: "#e2c13a" },
  { name: "cyan", hex: "#3cb3bf" },
  { name: "purple", hex: "#8a4fc2" },
  { name: "gray", hex: "#9b9b9b" },
  { name: "orange", hex: "#e3802c" },
];

export interface AnimEntry {
  fps: number;
  dirs: number;
  frames: number;
  sheet: string; // contains "{color}"
}

export interface UnitEntry {
  anchor: [number, number];
  frame: [number, number];
  anims: Record<string, AnimEntry>;
}

export interface BuildingEntry {
  anchor: [number, number];
  frame: [number, number];
  image: string; // contains "{color}"
}

export interface NatureEntry {
  anchor: [number, number];
  frame: [number, number];
  image: string;
  variants: string[];
}

export interface PackParts {
  terrain: Record<string, string[]>;
  units: Record<string, UnitEntry>;
  buildings: Record<string, BuildingEntry>;
  nature: Record<string, NatureEntry>;
  ui: Record<string, string>;
}

export function buildPackJson(parts: PackParts) {
  return {
    name: PACK_NAME,
    title: "Local pack (imported from your own install)", // neutral: product strings never name the game (CLAUDE.md)
    license: "LicenseRef-local-only",
    local: true,
    note: "Generated on this machine from the user's own game install by tools/aoe2de-import. Never commit or redistribute.",
    tile: [TILE[0], TILE[1]],
    terrain: parts.terrain,
    playerColors: PLAYER_COLORS.map((c) => c.name),
    playerColorHex: Object.fromEntries(PLAYER_COLORS.map((c) => [c.name, c.hex])),
    dirOrder: [...PACK_DIRS],
    entities: { ...parts.units, ...parts.buildings, ...parts.nature },
    ui: parts.ui,
  };
}

/** Pack-relative output paths. */
export const paths = {
  unitSheet: (entity: string, anim: string) => `units/${entity.replace(/_/g, "-")}-${anim.replace(/_/g, "-")}-{color}.png`,
  building: (entity: string) => `buildings/${entity.replace(/_/g, "-")}-{color}.png`,
  nature: (entity: string, i: number) => `nature/${entity.replace(/_/g, "-")}-${i}.png`,
  terrain: (name: string, i: number) => `terrain/${name.replace(/_/g, "-")}-${i}.png`,
  ui: (key: string) => `ui/${key}.png`,
};
