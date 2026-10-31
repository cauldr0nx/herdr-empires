// Composing decoded frames into pack sprite sheets: one row per pack
// direction, frames left to right, every cell the same size with the anchor
// (hotspot) at the same spot.

import { colorize, type Frame, type RGB } from "./frame.ts";
import type { DirPlan } from "./directions.ts";

export interface Bounds {
  left: number; // pixels left of the anchor
  top: number; // pixels above the anchor
  right: number;
  bottom: number;
}

export const emptyBounds = (): Bounds => ({ left: 0, top: 0, right: 0, bottom: 0 });

/** Grow bounds to fit a frame (and its shadow); `mirror` also fits its mirror image. */
export function growBounds(bd: Bounds, f: Frame, withShadow: boolean, mirror: boolean): void {
  const fit = (w: number, h: number, hx: number, hy: number) => {
    bd.left = Math.max(bd.left, hx);
    bd.right = Math.max(bd.right, w - hx);
    bd.top = Math.max(bd.top, hy);
    bd.bottom = Math.max(bd.bottom, h - hy);
    if (mirror) {
      bd.left = Math.max(bd.left, w - hx);
      bd.right = Math.max(bd.right, hx);
    }
  };
  fit(f.width, f.height, f.hotspotX, f.hotspotY);
  if (withShadow && f.shadow) fit(f.shadow.width, f.shadow.height, f.shadow.hotspotX, f.shadow.hotspotY);
}

export interface Canvas {
  width: number;
  height: number;
  rgba: Uint8Array;
}

export function newCanvas(width: number, height: number): Canvas {
  return { width, height, rgba: new Uint8Array(width * height * 4) };
}

/** Alpha-blend `src` (RGBA, sw x sh) onto the canvas at (dx, dy). */
export function blit(dst: Canvas, src: Uint8Array, sw: number, sh: number, dx: number, dy: number, flip = false): void {
  for (let y = 0; y < sh; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < sw; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.width) continue;
      const sx = flip ? sw - 1 - x : x;
      const so = (y * sw + sx) * 4;
      const a = src[so + 3];
      if (a === 0) continue;
      const o = (ty * dst.width + tx) * 4;
      if (a === 255 || dst.rgba[o + 3] === 0) {
        dst.rgba[o] = src[so];
        dst.rgba[o + 1] = src[so + 1];
        dst.rgba[o + 2] = src[so + 2];
        dst.rgba[o + 3] = a;
        continue;
      }
      const da = dst.rgba[o + 3] / 255;
      const sa = a / 255;
      const oa = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) dst.rgba[o + c] = Math.round((src[so + c] * sa + dst.rgba[o + c] * da * (1 - sa)) / oa);
      dst.rgba[o + 3] = Math.round(oa * 255);
    }
  }
}

/** Draw one frame (shadow under main) with its anchor at (ax, ay). */
export function drawFrame(dst: Canvas, f: Frame, color: RGB, ax: number, ay: number, withShadow: boolean, flip = false): void {
  if (withShadow && f.shadow) {
    const s = f.shadow;
    const px = new Uint8Array(s.width * s.height * 4);
    for (let i = 0; i < s.width * s.height; i++) px[i * 4 + 3] = s.alpha[i];
    const sx = flip ? ax - (s.width - s.hotspotX) : ax - s.hotspotX;
    blit(dst, px, s.width, s.height, sx, ay - s.hotspotY, flip);
  }
  const fx = flip ? ax - (f.width - f.hotspotX) : ax - f.hotspotX;
  blit(dst, colorize(f, color), f.width, f.height, fx, ay - f.hotspotY, flip);
}

/** Build an animation sheet for one player colour. */
export function buildSheet(frames: (Frame | null)[], plan: DirPlan, bd: Bounds, color: RGB, withShadow: boolean): Canvas {
  const cw = bd.left + bd.right;
  const ch = bd.top + bd.bottom;
  const cv = newCanvas(cw * plan.framesPerDir, ch * plan.rows.length);
  plan.rows.forEach((row, r) => {
    for (let i = 0; i < plan.framesPerDir; i++) {
      const f = frames[row.source * plan.framesPerDir + i];
      if (!f) continue;
      drawFrame(cv, f, color, i * cw + bd.left, r * ch + bd.top, withShadow, row.flip);
    }
  });
  return cv;
}

/** Render a single frame into a tight image whose anchor is (bd.left, bd.top). */
export function buildImage(f: Frame, bd: Bounds, color: RGB, withShadow: boolean): Canvas {
  const cv = newCanvas(bd.left + bd.right, bd.top + bd.bottom);
  drawFrame(cv, f, color, bd.left, bd.top, withShadow);
  return cv;
}
