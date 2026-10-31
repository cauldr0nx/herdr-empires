// SMX sprite decoder (the "SMPX" container used by the DE edition before the
// SLD format). Written from openage's format documentation
// (https://github.com/SFTtech/openage/blob/master/doc/media/smx-files.md and
// smp-files.md), with openage's converter used to settle bit orders. This is
// an independent implementation, not a port.
//
// Layout (little endian):
//   header   "SMPX" u16 version, u16 frames, u32 size, u32 srcSize, 16 bytes comment  (32 bytes)
//   frame    u8 frameType, u8 paletteNumber, u32 uncompressedSize                   (6 bytes)
//     frameType bits (LSB first): 0x01 main, 0x02 shadow, 0x04 outline,
//     0x08 main layer uses "8to5" packing (else "4plus1").
//   layer    u16 w, u16 h, i16 hotspotX, i16 hotspotY, u32 len, u32 unknown        (16 bytes)
//            row edges: h * (u16 left, u16 right); 0xFFFF = empty row, no commands
//            main:   u32 cmdLen, u32 pixLen, commands, packed pixels
//            other:  u32 len, unified commands (+ inline alpha bytes for shadows)
//   commands (low 2 bits): 0 skip, 1 draw, 2 player-colour draw, 3 end of row;
//            count = (cmd >> 2) + 1.

import type { Frame } from "./frame.ts";
import type { Palette } from "./palette.ts";
import { luminance } from "./frame.ts";

export const SMX_MAGIC = "SMPX";

export const PX_TRANSPARENT = 0;
export const PX_NORMAL = 1;
export const PX_PLAYER = 2;

/** A decoded main layer before any palette is applied. */
export interface SmxIndexedLayer {
  width: number;
  height: number;
  hotspotX: number;
  hotspotY: number;
  /** PX_TRANSPARENT / PX_NORMAL / PX_PLAYER per pixel. */
  kind: Uint8Array;
  /** Palette entry per pixel: index + 256 * section (0..1023). */
  index: Uint16Array;
}

export interface SmxRawFrame {
  frameType: number;
  paletteNumber: number;
  main: SmxIndexedLayer | null;
  shadow: { width: number; height: number; hotspotX: number; hotspotY: number; alpha: Uint8Array } | null;
}

export interface SmxFile {
  version: number;
  frames: SmxRawFrame[];
}

interface LayerHead {
  width: number;
  height: number;
  hotspotX: number;
  hotspotY: number;
  edgesAt: number;
}

function readLayerHead(dv: DataView, off: number): LayerHead {
  return {
    width: dv.getUint16(off, true),
    height: dv.getUint16(off + 2, true),
    hotspotX: dv.getInt16(off + 4, true),
    hotspotY: dv.getInt16(off + 6, true),
    edgesAt: off + 16,
  };
}

/** Parse an SMX file into palette-indexed frames. */
export function parseSMX(buf: Uint8Array): SmxFile {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  if (magic !== SMX_MAGIC) throw new Error(`not an SMX file (magic ${JSON.stringify(magic)})`);
  const version = dv.getUint16(4, true);
  const count = dv.getUint16(6, true);
  let off = 32;
  const frames: SmxRawFrame[] = [];
  for (let f = 0; f < count; f++) {
    const frameType = buf[off];
    const paletteNumber = buf[off + 1];
    off += 6;
    const frame: SmxRawFrame = { frameType, paletteNumber, main: null, shadow: null };
    const layers: ("main" | "shadow" | "outline")[] = [];
    if (frameType & 0x01) layers.push("main");
    if (frameType & 0x02) layers.push("shadow");
    if (frameType & 0x04) layers.push("outline");
    for (const kind of layers) {
      const head = readLayerHead(dv, off);
      off = head.edgesAt + 4 * head.height;
      if (kind === "main") {
        const cmdLen = dv.getUint32(off, true);
        const pixLen = dv.getUint32(off + 4, true);
        const cmdAt = off + 8;
        const pixAt = cmdAt + cmdLen;
        frame.main = decodeMain(buf, dv, head, cmdAt, pixAt, (frameType & 0x08) !== 0);
        off = pixAt + pixLen;
      } else {
        const len = dv.getUint32(off, true);
        const at = off + 4;
        if (kind === "shadow") frame.shadow = decodeShadow(buf, dv, head, at);
        off = at + len; // outlines are not needed and skipped
      }
    }
    frames.push(frame);
  }
  return { version, frames };
}

function decodeMain(buf: Uint8Array, dv: DataView, h: LayerHead, cmdAt: number, pixAt: number, eightToFive: boolean): SmxIndexedLayer {
  const { width, height } = h;
  const kind = new Uint8Array(width * height);
  const index = new Uint16Array(width * height);
  let cmd = cmdAt;
  // Pixel stream state: it runs across rows and commands for the whole layer.
  let chunk = pixAt; // start of the current 5-byte chunk
  let slot = 0; // pixel slot within the chunk (0..3 for 4plus1, 0..1 for 8to5)
  const nextPixel = (): number => {
    let idx: number;
    let sec: number;
    if (eightToFive) {
      if (slot === 0) {
        idx = buf[chunk];
        sec = buf[chunk + 1] & 0x03;
        slot = 1;
      } else {
        idx = ((buf[chunk + 1] >> 2) | (buf[chunk + 2] << 6)) & 0xff;
        sec = (buf[chunk + 2] >> 2) & 0x03;
        slot = 0;
        chunk += 5;
      }
    } else {
      idx = buf[chunk + slot];
      sec = (buf[chunk + 4] >> (2 * slot)) & 0x03;
      slot++;
      if (slot === 4) {
        slot = 0;
        chunk += 5;
      }
    }
    return idx + 256 * sec;
  };
  for (let y = 0; y < height; y++) {
    const left = dv.getUint16(h.edgesAt + y * 4, true);
    const right = dv.getUint16(h.edgesAt + y * 4 + 2, true);
    if (left === 0xffff || right === 0xffff) continue;
    let x = left;
    for (;;) {
      const c = buf[cmd++];
      const op = c & 3;
      if (op === 3) break;
      const n = (c >> 2) + 1;
      for (let i = 0; i < n; i++, x++) {
        if (op === 0) continue;
        const v = nextPixel();
        if (x >= width) continue;
        kind[y * width + x] = op === 1 ? PX_NORMAL : PX_PLAYER;
        index[y * width + x] = v;
      }
    }
  }
  return { width, height, hotspotX: h.hotspotX, hotspotY: h.hotspotY, kind, index };
}

function decodeShadow(buf: Uint8Array, dv: DataView, h: LayerHead, at: number) {
  const { width, height } = h;
  const alpha = new Uint8Array(width * height);
  let p = at;
  for (let y = 0; y < height; y++) {
    const left = dv.getUint16(h.edgesAt + y * 4, true);
    const right = dv.getUint16(h.edgesAt + y * 4 + 2, true);
    if (left === 0xffff || right === 0xffff) continue;
    let x = left;
    let last = 0;
    const end = width - right;
    for (;;) {
      const c = buf[p++];
      const op = c & 3;
      if (op === 3) {
        // Shadows sometimes omit the final pixel of a row: repeat the last one.
        if (x < end && x < width && last) alpha[y * width + x] = last;
        break;
      }
      const n = (c >> 2) + 1;
      for (let i = 0; i < n; i++, x++) {
        if (op === 1) {
          last = buf[p++];
          if (x < width) alpha[y * width + x] = last;
        }
      }
    }
  }
  return { width, height, hotspotX: h.hotspotX, hotspotY: h.hotspotY, alpha };
}

export interface SmxPalettes {
  /** Main palette by number (from palettes.conf); null when unknown. */
  byNumber(n: number): Palette | null;
  /** Player-colour reference palette (any one player colour), or null. */
  player: Palette | null;
}

/** Resolve an indexed SMX frame against palettes into a neutral Frame. */
export function smxToFrame(raw: SmxRawFrame, pals: SmxPalettes): Frame | null {
  const m = raw.main;
  if (!m) return null;
  const n = m.width * m.height;
  const rgba = new Uint8Array(n * 4);
  const pal = pals.byNumber(raw.paletteNumber);
  let playerMask: Uint8Array | null = null;
  let playerShade: Float32Array | null = null;
  // Reference brightness of the player palette, so its "middle" maps to 0.5.
  let ref = 0;
  if (pals.player) {
    let sum = 0;
    let cnt = 0;
    for (let i = 0; i < pals.player.length; i += 4) {
      const l = luminance(pals.player[i], pals.player[i + 1], pals.player[i + 2]);
      if (l > 0) { sum += l; cnt++; }
    }
    ref = cnt ? sum / cnt : 0;
  }
  for (let i = 0; i < n; i++) {
    const k = m.kind[i];
    if (k === PX_TRANSPARENT) continue;
    const idx = m.index[i];
    const o = i * 4;
    if (k === PX_NORMAL) {
      if (pal && idx * 4 + 2 < pal.length) {
        rgba[o] = pal[idx * 4];
        rgba[o + 1] = pal[idx * 4 + 1];
        rgba[o + 2] = pal[idx * 4 + 2];
      } else {
        // No palette: keep the shape visible as greyscale of the index.
        rgba[o] = rgba[o + 1] = rgba[o + 2] = idx & 0xff;
      }
      rgba[o + 3] = 255; // palette alpha is ignored for main graphics
    } else {
      if (!playerMask) {
        playerMask = new Uint8Array(n);
        playerShade = new Float32Array(n);
      }
      playerMask[i] = 255;
      let s = 0.5;
      const pp = pals.player;
      if (pp && ref > 0 && idx * 4 + 2 < pp.length) {
        s = 0.5 * (luminance(pp[idx * 4], pp[idx * 4 + 1], pp[idx * 4 + 2]) / ref);
      }
      playerShade![i] = s;
      const g = Math.round(Math.min(1, s) * 255);
      rgba[o] = rgba[o + 1] = rgba[o + 2] = g;
      rgba[o + 3] = 255;
    }
  }
  return {
    width: m.width,
    height: m.height,
    hotspotX: m.hotspotX,
    hotspotY: m.hotspotY,
    rgba,
    playerMask,
    playerShade,
    shadow: raw.shadow,
  };
}
