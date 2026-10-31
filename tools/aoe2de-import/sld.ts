// SLD sprite decoder (the DE edition's current sprite format, "SLDX").
// Written from openage's format documentation
// (https://github.com/SFTtech/openage/blob/master/doc/media/sld-files.md),
// with openage's converter used to settle bit orders. Independent
// implementation, not a port.
//
// Layout (little endian):
//   header  "SLDX" u16 version, u16 frames, u16 ?, u16 0x10, u32 ?         (16 bytes)
//   frame   u16 canvasW, u16 canvasH, i16 hotspotX, i16 hotspotY,
//           u8 frameType, u8 ?, u16 frameIndex                            (12 bytes)
//     frameType bits (LSB first): 0x01 main, 0x02 shadow, 0x04 unknown
//     ("outline"; skipped), 0x08 damage mask, 0x10 player-colour mask.
//   layer   u32 contentLength (includes itself), then
//           main/shadow: u16 x1, u16 y1, u16 x2, u16 y2, u8 flags, u8 ?
//           masks:       u8 flags, u8 ?   (same rectangle as the main layer)
//           u16 commandCount, commandCount * (u8 skipBlocks, u8 drawBlocks),
//           then the compressed 4x4 blocks: BC1 for main/damage, BC4 for
//           shadow/player-colour. flags & 0x80: "skipped" blocks copy the
//           same canvas position from the previous frame's layer.
//           Each layer is padded to a multiple of 4 bytes.

import { decodeBC1Block, decodeBC4Block } from "./bc.ts";
import type { Frame } from "./frame.ts";

export const SLD_MAGIC = "SLDX";

/** A decoded layer placed on the frame canvas. */
interface Placed {
  x1: number;
  y1: number;
  width: number;
  height: number;
  /** RGBA (channels=4) or single channel (channels=1). */
  px: Uint8Array;
}

export interface SldRawFrame {
  canvasWidth: number;
  canvasHeight: number;
  hotspotX: number;
  hotspotY: number;
  frameType: number;
  main: Placed | null;
  shadow: Placed | null;
  playerMask: Placed | null;
}

export interface SldFile {
  version: number;
  frames: SldRawFrame[];
}

function decodeLayer(
  buf: Uint8Array,
  dv: DataView,
  at: number,
  rect: { x1: number; y1: number; width: number; height: number },
  bc: 1 | 4,
  prev: Placed | null,
): Placed {
  const { width, height } = rect;
  const ch = bc === 1 ? 4 : 1;
  const px = new Uint8Array(width * height * ch);
  const cmdCount = dv.getUint16(at, true);
  const cmdAt = at + 2;
  let data = cmdAt + 2 * cmdCount;
  const bw = Math.ceil(width / 4);
  const total = bw * Math.ceil(height / 4);
  const block = new Uint8Array(64);
  let b = 0;
  const put = (bi: number, src: (x: number, y: number, c: number) => number) => {
    const bx = (bi % bw) * 4;
    const by = Math.floor(bi / bw) * 4;
    for (let y = 0; y < 4; y++) {
      const yy = by + y;
      if (yy >= height) break;
      for (let x = 0; x < 4; x++) {
        const xx = bx + x;
        if (xx >= width) break;
        for (let c = 0; c < ch; c++) px[(yy * width + xx) * ch + c] = src(x, y, c);
      }
    }
  };
  for (let i = 0; i < cmdCount && b < total; i++) {
    const skip = buf[cmdAt + i * 2];
    const draw = buf[cmdAt + i * 2 + 1];
    for (let s = 0; s < skip && b < total; s++, b++) {
      if (!prev) continue;
      // Copy this block's canvas area from the previous frame's layer.
      const bx = (b % bw) * 4 + rect.x1;
      const by = Math.floor(b / bw) * 4 + rect.y1;
      put(b, (x, y, c) => {
        const px2 = bx + x - prev.x1;
        const py2 = by + y - prev.y1;
        if (px2 < 0 || py2 < 0 || px2 >= prev.width || py2 >= prev.height) return 0;
        return prev.px[(py2 * prev.width + px2) * ch + c];
      });
    }
    for (let d = 0; d < draw && b < total; d++, b++) {
      if (bc === 1) decodeBC1Block(buf, data, block);
      else decodeBC4Block(buf, data, block);
      data += 8;
      put(b, (x, y, c) => block[(y * 4 + x) * ch + c]);
    }
  }
  return { x1: rect.x1, y1: rect.y1, width, height, px };
}

/** Parse an SLD file into canvas-placed layers. */
export function parseSLD(buf: Uint8Array): SldFile {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  if (magic !== SLD_MAGIC) throw new Error(`not an SLD file (magic ${JSON.stringify(magic)})`);
  const version = dv.getUint16(4, true);
  const count = dv.getUint16(6, true);
  let off = 16;
  const frames: SldRawFrame[] = [];
  let prevMain: Placed | null = null;
  let prevShadow: Placed | null = null;
  let prevPlayer: Placed | null = null;
  for (let f = 0; f < count; f++) {
    const frame: SldRawFrame = {
      canvasWidth: dv.getUint16(off, true),
      canvasHeight: dv.getUint16(off + 2, true),
      hotspotX: dv.getInt16(off + 4, true),
      hotspotY: dv.getInt16(off + 6, true),
      frameType: buf[off + 8],
      main: null,
      shadow: null,
      playerMask: null,
    };
    off += 12;
    let mainRect = { x1: 0, y1: 0, width: 0, height: 0 };
    for (const bit of [0x01, 0x02, 0x04, 0x08, 0x10]) {
      if (!(frame.frameType & bit)) continue;
      const start = off;
      const len = dv.getUint32(off, true);
      let p = off + 4;
      if (bit === 0x01 || bit === 0x02) {
        const x1 = dv.getUint16(p, true);
        const y1 = dv.getUint16(p + 2, true);
        const x2 = dv.getUint16(p + 4, true);
        const y2 = dv.getUint16(p + 6, true);
        const flags = buf[p + 8];
        p += 10;
        const rect = { x1, y1, width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) };
        if (bit === 0x01) {
          mainRect = rect;
          frame.main = decodeLayer(buf, dv, p, rect, 1, flags & 0x80 ? prevMain : null);
          prevMain = frame.main;
        } else {
          frame.shadow = decodeLayer(buf, dv, p, rect, 4, flags & 0x80 ? prevShadow : null);
          prevShadow = frame.shadow;
        }
      } else if (bit === 0x10) {
        const flags = buf[p];
        p += 2;
        frame.playerMask = decodeLayer(buf, dv, p, mainRect, 4, flags & 0x80 ? prevPlayer : null);
        prevPlayer = frame.playerMask;
      }
      // 0x04 (unknown) and 0x08 (damage mask) are not needed: skipped.
      off = start + len;
      off += (4 - (off % 4)) % 4;
    }
    frames.push(frame);
  }
  return { version, frames };
}

/** Convert a parsed SLD frame into a neutral Frame (main layer coordinates). */
export function sldToFrame(raw: SldRawFrame): Frame | null {
  const m = raw.main;
  if (!m || m.width === 0 || m.height === 0) return null;
  return {
    width: m.width,
    height: m.height,
    hotspotX: raw.hotspotX - m.x1,
    hotspotY: raw.hotspotY - m.y1,
    rgba: m.px,
    playerMask: raw.playerMask ? raw.playerMask.px : null,
    playerShade: null, // SLD: shade comes from the base pixel's luminance
    shadow: raw.shadow
      ? {
          width: raw.shadow.width,
          height: raw.shadow.height,
          hotspotX: raw.hotspotX - raw.shadow.x1,
          hotspotY: raw.hotspotY - raw.shadow.y1,
          alpha: raw.shadow.px,
        }
      : null,
  };
}
