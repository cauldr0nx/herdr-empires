// Square ground textures -> 2:1 isometric diamond tiles.

import type { Image } from "./dds.ts";

export const TILE: [number, number] = [96, 48];

/**
 * Sample a square patch of `tex` (side `patch` texels, top-left at ox, oy,
 * wrapping) onto a diamond of tw x th pixels. Diamond corners: top = patch
 * (0,0), right = (1,0), bottom = (1,1), left = (0,1). Bilinear sampling;
 * pixels outside the diamond are transparent.
 */
export function diamondTile(tex: Image, patch: number, ox: number, oy: number, tw = TILE[0], th = TILE[1]): Uint8Array {
  const out = new Uint8Array(tw * th * 4);
  const W = tex.width;
  const H = tex.height;
  const at = (x: number, y: number, c: number) => {
    const xx = ((x % W) + W) % W;
    const yy = ((y % H) + H) % H;
    return tex.rgba[(yy * W + xx) * 4 + c];
  };
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      const u = (cx - tw / 2) / tw + cy / th;
      const v = cy / th - (cx - tw / 2) / tw;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
      const fx = ox + u * patch - 0.5;
      const fy = oy + v * patch - 0.5;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const ax = fx - x0;
      const ay = fy - y0;
      const o = (y * tw + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = at(x0, y0, c) * (1 - ax) + at(x0 + 1, y0, c) * ax;
        const bot = at(x0, y0 + 1, c) * (1 - ax) + at(x0 + 1, y0 + 1, c) * ax;
        out[o + c] = Math.round(top * (1 - ay) + bot * ay);
      }
      out[o + 3] = 255;
    }
  }
  return out;
}

/** Up to `count` tile variants from different quadrants of the texture. */
export function terrainVariants(tex: Image, count = 4, tw = TILE[0], th = TILE[1]): Uint8Array[] {
  const side = Math.min(tex.width, tex.height);
  // Assume a ground texture spans about 4x4 tiles (unverified for DE).
  const patch = Math.max(8, Math.floor(side / 4));
  const spots: [number, number][] = [[0, 0], [side / 2, 0], [0, side / 2], [side / 2, side / 2]];
  return spots.slice(0, count).map(([x, y]) => diamondTile(tex, patch, Math.floor(x), Math.floor(y), tw, th));
}
