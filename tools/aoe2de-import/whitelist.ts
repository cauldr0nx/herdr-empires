// The sprite whitelist: which game files feed which pack entity/animation.
//
// HONEST NOTE: these file-name patterns were written from community naming
// conventions (e.g. "u_vil_male_villager_idleA_x1.sld"), NOT checked against
// a real install. Run `bun tools/aoe2de-import/main.ts --list` to see which
// entries match on your machine, and adjust the patterns here when they miss.
// Patterns match the file's base name, case-insensitively, with any of the
// sprite extensions (.sld, .smx). When several files match, "_x1" (standard
// resolution) beats "_x2" (UHD), then the shortest name wins.

export type EntityKind = "unit" | "building" | "nature";

export interface SpriteRule {
  entity: string;
  /** Animation name for units; omitted for buildings and nature. */
  anim?: string;
  kind: EntityKind;
  fps?: number;
  /** Regexes tried in order; the first one with a match wins. */
  patterns: RegExp[];
}

const u = (entity: string, anim: string, fps: number, ...patterns: RegExp[]): SpriteRule => ({ entity, anim, kind: "unit", fps, patterns });
const b = (entity: string, ...patterns: RegExp[]): SpriteRule => ({ entity, kind: "building", patterns });
const n = (entity: string, ...patterns: RegExp[]): SpriteRule => ({ entity, kind: "nature", patterns });

export const SPRITES: SpriteRule[] = [
  // Villager
  u("villager", "idle", 6, /^u_vil_male_villager_idle[a-z]?_x[12]\./i),
  u("villager", "walk", 10, /^u_vil_male_villager_walk[a-z]?_x[12]\./i),
  u("villager", "gather_wood", 10, /^u_vil_male_lumberjack_work[a-z]?_x[12]\./i),
  u("villager", "gather_gold", 10, /^u_vil_male_(gold_?miner|miner_gold|miner)_work[a-z]?_x[12]\./i),
  u("villager", "gather_stone", 10, /^u_vil_male_(stone_?miner|miner_stone|miner)_work[a-z]?_x[12]\./i),
  u("villager", "gather_food", 10, /^u_vil_male_forager_work[a-z]?_x[12]\./i, /^u_vil_male_farmer_work[a-z]?_x[12]\./i),
  u("villager", "carry", 10, /^u_vil_male_lumberjack_walk[a-z]?_x[12]\./i),
  u("villager", "build", 10, /^u_vil_male_builder_(task|work)[a-z]?_x[12]\./i),
  // Other units
  u("monk", "idle", 6, /^u_(rel_)?monk_idle[a-z]?_x[12]\./i),
  u("monk", "walk", 10, /^u_(rel_)?monk_walk[a-z]?_x[12]\./i),
  u("scout", "idle", 6, /^u_cav_scout_idle[a-z]?_x[12]\./i),
  u("scout", "walk", 10, /^u_cav_scout_walk[a-z]?_x[12]\./i, /^u_cav_scout_run[a-z]?_x[12]\./i),
  u("knight", "idle", 6, /^u_cav_knight_idle[a-z]?_x[12]\./i),
  u("knight", "walk", 10, /^u_cav_knight_walk[a-z]?_x[12]\./i, /^u_cav_knight_run[a-z]?_x[12]\./i),
  u("king", "idle", 6, /^u_(inf_)?king_idle[a-z]?_x[12]\./i),
  u("king", "walk", 10, /^u_(inf_)?king_walk[a-z]?_x[12]\./i),
  // Buildings (western European set, Castle Age look)
  b("town_center", /^b_west_town_center_age3_x[12]\./i, /^b_west_town_center.*_x[12]\./i),
  b("house", /^b_west_house_age3_x[12]\./i, /^b_west_house.*_x[12]\./i),
  b("mill", /^b_west_mill_age3_x[12]\./i, /^b_west_mill.*_x[12]\./i),
  b("lumber_camp", /^b_west_lumber_camp_age3_x[12]\./i, /^b_west_lumber_camp.*_x[12]\./i),
  b("mining_camp", /^b_west_mining_camp_age3_x[12]\./i, /^b_west_mining_camp.*_x[12]\./i),
  b("monastery", /^b_west_monastery_age3_x[12]\./i, /^b_west_monastery.*_x[12]\./i),
  b("university", /^b_west_university_age3_x[12]\./i, /^b_west_university.*_x[12]\./i),
  // Nature: every frame becomes a variant
  n("tree", /^n_tree_oak_x[12]\./i, /^n_tree_forest_x[12]\./i, /^n_tree_.*_x[12]\./i),
  n("gold_mine", /^n_mine_gold_x[12]\./i, /^n_.*gold.*_x[12]\./i),
  n("stone_mine", /^n_mine_stone_x[12]\./i, /^n_.*stone.*_x[12]\./i),
  n("berry_bush", /^n_forage_bush_x[12]\./i, /^n_.*(berry|forage).*_x[12]\./i),
];

export const SPRITE_EXTS = /\.(sld|smx)$/i;

/** Terrain: DDS textures under resources/_common/terrain/textures/ (searched recursively). */
export interface TerrainRule {
  name: string;
  patterns: RegExp[];
}

export const TERRAIN: TerrainRule[] = [
  { name: "grass", patterns: [/^g_gr[a-z]*[0-9]?.*\.dds$/i, /grass.*\.dds$/i] },
  { name: "dirt", patterns: [/^g_d(i)?rt.*\.dds$/i, /^g_dt.*\.dds$/i, /dirt.*\.dds$/i] },
  { name: "forest_floor", patterns: [/^g_f(o)?r(e)?st.*\.dds$/i, /^g_for.*\.dds$/i, /forest.*\.dds$/i] },
];

/** Maps that are not colour textures (normals, specular, height...). */
export const TERRAIN_EXCLUDE = /(normal|_n\.|_nrm|spec|height|_h\.|mask|blend|rough|metal|_ao\.)/i;

/**
 * UI icons: already PNG in the install, copied as-is when found under
 * resources/_common/wpfg/ (searched recursively). Unverified, optional.
 */
export const UI: { key: string; patterns: RegExp[] }[] = [
  { key: "food", patterns: [/^(resource_)?food(_icon)?\.png$/i] },
  { key: "wood", patterns: [/^(resource_)?wood(_icon)?\.png$/i] },
  { key: "gold", patterns: [/^(resource_)?gold(_icon)?\.png$/i] },
  { key: "stone", patterns: [/^(resource_)?stone(_icon)?\.png$/i] },
  { key: "population", patterns: [/^(resource_)?pop(ulation)?(_icon)?\.png$/i] },
];

/** Pick the best file for a list of patterns from a list of base names. */
export function pickFile(names: string[], patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const hits = names.filter((f) => re.test(f));
    if (hits.length === 0) continue;
    hits.sort((a, b) => {
      const ra = /_x1\./i.test(a) ? 0 : 1;
      const rb = /_x1\./i.test(b) ? 0 : 1;
      return ra - rb || a.length - b.length || a.localeCompare(b);
    });
    return hits[0];
  }
  return null;
}

/** Every entity name the pack schema knows (SPEC §18.4). */
export const ALL_ENTITIES = [
  "villager", "town_center", "house", "mill", "lumber_camp", "mining_camp", "monastery", "university",
  "tree", "gold_mine", "stone_mine", "berry_bush", "monk", "scout", "knight", "king",
] as const;
