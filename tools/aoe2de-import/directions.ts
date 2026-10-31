// How a sprite file's frames map onto the pack's 8 directions.
//
// Pack convention (written into pack.json as "dirOrder"): one sheet row per
// direction, in this order, clockwise on screen starting from "facing the
// viewer" (south):
export const PACK_DIRS = ["s", "sw", "w", "nw", "n", "ne", "e", "se"] as const;
//
// Source assumption: DE unit files store frames direction-major
// (all frames of direction 0, then direction 1, ...), with 16 directions
// (some files 8) starting at south and going clockwise. We take every second
// direction of a 16-direction file. Files whose frame count is divisible by 5
// but not by 8 are treated as the classic 5-direction layout (S, SW, W, NW, N)
// with the eastern directions mirrored. Anything else is treated as a single
// direction repeated on all 8 rows.
//
// UNVERIFIED: the start direction and rotation sense have not been checked
// against a real install. If sprites face the wrong way, change these two
// constants (or pass --dir-offset / --dir-ccw on the command line).
export const SOURCE_START_OFFSET = 0;
export const SOURCE_CLOCKWISE = true;

export interface DirPick {
  /** Source direction index, or -1 when the file has no directions. */
  source: number;
  /** Mirror horizontally (5-direction files). */
  flip: boolean;
}

export interface DirPlan {
  sourceDirs: number;
  framesPerDir: number;
  /** One entry per pack direction, in PACK_DIRS order. */
  rows: DirPick[];
}

export function planDirections(
  frameCount: number,
  opts: { offset?: number; clockwise?: boolean; forceDirs?: number } = {},
): DirPlan {
  const offset = opts.offset ?? SOURCE_START_OFFSET;
  const cw = opts.clockwise ?? SOURCE_CLOCKWISE;
  let dirs = opts.forceDirs ?? 0;
  if (!dirs) {
    if (frameCount >= 16 && frameCount % 16 === 0) dirs = 16;
    else if (frameCount >= 8 && frameCount % 8 === 0) dirs = 8;
    else if (frameCount >= 5 && frameCount % 5 === 0) dirs = 5;
    else dirs = 1;
  }
  const framesPerDir = Math.max(1, Math.floor(frameCount / dirs));
  const rows: DirPick[] = [];
  for (let k = 0; k < PACK_DIRS.length; k++) {
    if (dirs === 1) rows.push({ source: 0, flip: false });
    else if (dirs === 5) {
      // S, SW, W, NW, N stored; NE, E, SE mirror NW, W, SW.
      const map: DirPick[] = [
        { source: 0, flip: false }, { source: 1, flip: false }, { source: 2, flip: false }, { source: 3, flip: false },
        { source: 4, flip: false }, { source: 3, flip: true }, { source: 2, flip: true }, { source: 1, flip: true },
      ];
      rows.push(map[k]);
    } else {
      const step = dirs / PACK_DIRS.length;
      const s = offset + (cw ? 1 : -1) * k * step;
      rows.push({ source: ((Math.round(s) % dirs) + dirs) % dirs, flip: false });
    }
  }
  return { sourceDirs: dirs, framesPerDir, rows };
}
